const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('nanoMonitor', {
  request: (action, method, body) => ipcRenderer.invoke('nano:request', action, method, body),
  previewUrl: 'http://127.0.0.1:8765/preview',
  thumbnailUrl: 'http://127.0.0.1:8765/thumbnail',
});

function rendererDetails() {
    const record = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Record on Nano'));
    return {
      heading: document.querySelector('h1')?.textContent,
      storagePreference: document.querySelector('#save-drive')?.value,
      instructions: document.querySelector('.nm-guide')?.textContent?.includes('Bluetooth finds and pairs'),
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      controls: [...document.querySelectorAll('button,select,summary')].map(element => ({
        label: element.textContent.trim(), height: element.getBoundingClientRect().height,
        disabled: !!element.disabled,
      })),
      recordEnabled: !!record && !record.disabled,
      imageWidth: document.querySelector('.nm-picture img')?.naturalWidth || 0,
      waitingPicture: !!document.querySelector('.nm-overlay'),
    };
}
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => ipcRenderer.send('nano:render-ready', rendererDetails()), 1000);
  if (process.argv.includes('--nano-smoke')) {
    setInterval(() => ipcRenderer.send('nano:render-update', rendererDetails()), 500);
  }
});
