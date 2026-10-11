const {app, BrowserWindow, dialog, ipcMain, session} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {Bridge, validateRequest} = require('./bridge.cjs');
const config = require('./runtime-config.json');

app.setName('Nano Monitor');
app.setPath('userData', config.userData);
app.setPath('sessionData', path.join(config.userData, 'session'));
const bridge = new Bridge(config);
const rendererFile = path.join(__dirname, 'renderer', 'index.html');
const rendererURL = pathToFileURL(rendererFile).href;
let window, mayQuit = false, closing = false;
const smoke = process.argv.includes('--smoke-test');

if (!smoke && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {if (window) {if (window.isMinimized()) window.restore(); window.focus();}});

async function closeSafely() {
  if (closing) return;
  closing = true;
  try {
    let reply = await bridge.request('state');
    if (reply.data.recording) {
      const choice = await dialog.showMessageBox(window, {type: 'question', title: 'Recording on Nano',
        message: 'Stop this recording, save the original, then close?',
        buttons: ['Stop, save & close', 'Keep recording'], defaultId: 1, cancelId: 1});
      if (choice.response !== 0) return;
    }
    const deadline = Date.now() + 5 * 60 * 1000;
    let closeRequested = false;
    while (Date.now() < deadline) {
      reply = await bridge.request('state');
      const phase = reply.data.phase;
      if (['disconnected', 'error'].includes(phase)) {
        if (closeRequested && phase === 'error') {
          const result = await dialog.showMessageBox(window, {type: 'warning', title: 'Camera action did not finish',
            message: reply.data.error || 'Check the original on the Nano before retrying the transfer.',
            detail: 'Recordings remain on the camera. You can keep the app open to review the error.',
            buttons: ['Close app', 'Keep open'], defaultId: 1, cancelId: 1});
          if (result.response !== 0) return;
        }
        mayQuit = true; bridge.stopOwned(); app.quit(); return;
      }
      if (!closeRequested && ['live', 'recording', 'preview_unavailable'].includes(phase)) {
        const accepted = await bridge.request('close', 'POST');
        if (!accepted.ok) throw new Error(accepted.data.error);
        closeRequested = true;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('The camera is still saving or connecting. Finish the camera action, then close again.');
  } catch (error) {
    const choice = await dialog.showMessageBox(window, {type: 'warning', title: 'Nano Monitor',
      message: error.message || 'Check the Nano and your Windows Wi-Fi before closing.',
      detail: 'The app could not confirm camera cleanup. Check the Nano recording state and your Windows Wi-Fi.',
      buttons: ['Keep open', 'Close app'], defaultId: 0, cancelId: 0});
    if (choice.response === 1) {mayQuit = true; bridge.stopOwned(); app.quit();}
  } finally {closing = false;}
}

app.on('before-quit', event => {if (!mayQuit && window) {event.preventDefault(); void closeSafely();}});

app.whenReady().then(async () => {
  fs.mkdirSync(config.userData, {recursive: true});
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  await bridge.ensureReady();
  const smokeWidth = Number(process.argv.find(arg => arg.startsWith('--smoke-width='))?.split('=')[1]) || 1360;
  window = new BrowserWindow({width: smoke ? Math.max(350, smokeWidth) : 1360, height: 900, minWidth: 350, minHeight: 600,
    title: 'Nano Monitor', backgroundColor: '#101312', show: false,
    webPreferences: {preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: false,
      backgroundThrottling: false, additionalArguments: smoke ? ['--nano-smoke'] : []}});
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  window.webContents.on('will-navigate', (event, url) => {if (url !== rendererURL) event.preventDefault();});
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  const rendered = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The desktop interface did not finish loading.')), 15000);
    ipcMain.once('nano:render-ready', (event, details) => {
      clearTimeout(timeout);
      if (event.sender !== window.webContents || details.heading !== 'Nano Monitor') return reject(new Error('The desktop interface could not be verified.'));
      resolve(details);
    });
  });
  let latestRender;
  ipcMain.on('nano:render-update', (event, details) => {if (event.sender === window.webContents) latestRender = details;});
  session.defaultSession.webRequest.onBeforeSendHeaders({urls: ['http://127.0.0.1:8765/preview*']}, (details, callback) => {
    if (details.webContentsId !== window.webContents.id || new URL(details.url).pathname !== '/preview') return callback({cancel: true});
    callback({requestHeaders: {...details.requestHeaders, 'X-Nano-Token': bridge.session.token}});
  });
  ipcMain.handle('nano:request', async (event, action, method, body) => {
    try {
      if (event.sender !== window.webContents || event.senderFrame?.url !== rendererURL) throw new Error('Untrusted desktop request.');
      validateRequest(action, method, body);
      const reply = await bridge.request(action, method, body);
      if (!reply.ok && reply.data.error?.includes('Unauthorized')) {await bridge.ensureReady(); return bridge.request(action, method, body);}
      return reply;
    } catch (error) {return {ok: false, data: {error: error.message || 'The local camera service is unavailable. Reopen Nano Monitor.'}};}
  });
  window.on('close', event => {if (!mayQuit) {event.preventDefault(); void closeSafely();}});
  await window.loadFile(rendererFile);
  const renderDetails = await rendered;
  if (smoke) {
    let cameraCheck;
    if (process.argv.includes('--smoke-camera')) {
      const initial = (await bridge.request('state')).data;
      if (initial.phase !== 'disconnected' || initial.recording) throw new Error('Leave the existing camera session alone; skip camera smoke test.');
      const connected = await bridge.request('connect', 'POST');
      if (!connected.ok) throw new Error(connected.data.error);
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        const live = (await bridge.request('state')).data;
        if (live.phase === 'error') throw new Error(live.error);
        if (live.recording) {window.show(); return;} // Never stop a recording that this check did not start.
        if (live.phase === 'live' && live.frames >= 10 && latestRender?.recordEnabled && latestRender.imageWidth && !latestRender.waitingPicture) {
          const picture = await window.webContents.capturePage();
          fs.writeFileSync(path.join(config.logDirectory, 'desktop-camera-live.png'), picture.toPNG());
          cameraCheck = {phase: live.phase, frames: live.frames, previewAge: live.previewAge, battery: live.battery, renderer: latestRender};
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      await bridge.request('disconnect', 'POST');
      while (!['disconnected','error'].includes((await bridge.request('state')).data.phase)) await new Promise(resolve => setTimeout(resolve, 500));
      cameraCheck = {...cameraCheck, restored: (await bridge.request('state')).data.phase === 'disconnected'};
      if (!cameraCheck.frames) throw new Error('The camera did not provide a live picture within the check window.');
    }
    const state = (await bridge.request('state')).data;
    fs.writeFileSync(path.join(config.logDirectory, 'desktop-smoke.json'), JSON.stringify({
      electron: process.versions.electron, loaded: window.webContents.getURL() === rendererURL,
      phase: state.phase, destination: state.destination, preference: state.storage.selectedId,
      contextIsolation: window.webContents.getLastWebPreferences().contextIsolation,
      nodeIntegration: window.webContents.getLastWebPreferences().nodeIntegration,
      sandbox: window.webContents.getLastWebPreferences().sandbox,
      renderer: renderDetails,
      cameraCheck,
    }, null, 2));
    // Export our own renderer as a regression artifact; no OS screen/input automation.
    const image = await window.webContents.capturePage();
    fs.writeFileSync(path.join(config.logDirectory, `desktop-render-${renderDetails.width}.png`), image.toPNG());
    mayQuit = true; bridge.stopOwned(); app.quit();
  } else {window.show();}
}).catch(error => {
  if (smoke) {
    fs.mkdirSync(config.logDirectory, {recursive: true});
    fs.writeFileSync(path.join(config.logDirectory, 'desktop-smoke.json'), JSON.stringify({loaded: false, error: error.message}, null, 2));
  } else {dialog.showErrorBox('Nano Monitor could not start', `${error.message}\n\nLogs: ${config.logDirectory}`);}
  mayQuit = true; bridge.stopOwned(); app.quit();
});
