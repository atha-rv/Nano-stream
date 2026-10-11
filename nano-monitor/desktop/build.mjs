import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const source = path.dirname(fileURLToPath(import.meta.url));
const project = path.dirname(source);
const workspace = path.dirname(project);
// Defaults keep large build downloads off C:. Setup-Desktop.ps1 installs the
// locked toolchain here; environment overrides support other non-system drives.
const buildRoot = path.resolve(process.env.NANO_BUILD_ROOT || 'D:/NanoMonitorBuild');
const toolchain = path.resolve(process.env.NANO_TOOLCHAIN || path.join(buildRoot, 'toolchain'));
const require = createRequire(`${toolchain}/package.json`);
const esbuild = require('esbuild');
const {packager} = await import(pathToFileURL(path.join(toolchain, 'node_modules/@electron/packager/dist/index.js')).href);
const stage = path.join(buildRoot, 'app');
const outputRoot = path.resolve(process.env.NANO_OUTPUT_ROOT || 'D:/Apps');
const dataRoot = path.resolve(process.env.NANO_DATA_ROOT || 'D:/NanoMonitor');
for (const directory of [buildRoot, outputRoot, dataRoot]) {
  if (!path.isAbsolute(directory) || /^c:[\\/]/i.test(directory)) {
    throw new Error('Use an absolute non-C: path for build, output and app data.');
  }
}
await fs.mkdir(`${stage}/renderer`, {recursive: true});
const bundle = await esbuild.build({entryPoints: [path.join(source, 'renderer.tsx')],
  bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
  outfile: `${stage}/renderer/app.js`, minify: true, legalComments: 'external', metafile: true,
  nodePaths: [path.join(project, 'apps/web/node_modules')],
  alias: {'@kit/ui/button': path.join(project, 'packages/ui/src/makerkit/button.tsx'),
    'react': path.join(project, 'apps/web/node_modules/react'),
    'react-dom': path.join(project, 'apps/web/node_modules/react-dom'),
    '@kit/ui/utils': path.join(project, 'packages/ui/src/lib/utils/cn.ts'),
    '#lib/utils': path.join(project, 'packages/ui/src/lib/utils/cn.ts')},
  define: {'process.env.NODE_ENV': '"production"'},
});
const packages = new Map();
for (const input of Object.keys(bundle.metafile.inputs)) {
  if (!input.includes('node_modules')) continue;
  let folder = path.dirname(path.resolve(input));
  while (folder !== path.dirname(folder)) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(folder, 'package.json'), 'utf8'));
      if (data.name) {packages.set(data.name, {folder, data}); break;}
    } catch {}
    folder = path.dirname(folder);
  }
}
let notices = 'Nano Monitor reuses MakerKit Lite (MIT); its license is included separately.\n\n';
const ledger = [];
for (const [name, {folder, data}] of packages) {
  const files = await fs.readdir(folder);
  const license = files.find(file => /^licen[cs]e(?:\.|$)/i.test(file));
  if (!license) throw new Error(`Missing license for bundled dependency ${name}`);
  const text = await fs.readFile(path.join(folder, license), 'utf8');
  notices += `\n${name} ${data.version} (${data.license})\n${text}\n`;
  ledger.push({name, version: data.version, license: data.license, repository: data.repository});
}
await fs.writeFile(`${stage}/THIRD-PARTY-NOTICES.txt`, notices);
await fs.writeFile(`${source}/renderer-dependencies.json`, JSON.stringify(ledger, null, 2));
for (const file of ['main.cjs', 'preload.cjs', 'bridge.cjs']) await fs.copyFile(path.join(source, file), `${stage}/${file}`);
await fs.copyFile(path.join(source, 'index.html'), `${stage}/renderer/index.html`);
await fs.copyFile(path.join(project, 'LICENSE'), `${stage}/LICENSE-MakerKit.txt`);
await fs.writeFile(`${stage}/package.json`, JSON.stringify({name: 'nano-monitor', productName: 'Nano Monitor',
  version: '1.0.0', main: 'main.cjs', author: 'Nano Monitor', license: 'MIT'}));
await fs.writeFile(`${stage}/runtime-config.json`, JSON.stringify({workspace,
  python: path.join(workspace, '.research/osmo-offload/.venv/Scripts/python.exe'),
  server: path.join(project, 'camera/server.py'),
  sessionFile: path.join(workspace, '.research/nano-bridge-session.json'),
  ffmpegDirectory: process.env.NANO_FFMPEG_DIRECTORY,
  logDirectory: path.join(dataRoot, 'logs'), userData: path.join(dataRoot, 'app-data')}, null, 2));
await fs.copyFile(`${toolchain}/package-lock.json`, `${source}/package-lock.json`);
if (process.argv.includes('--renderer-only')) {
  console.log(JSON.stringify({renderer: stage, dependencies: ledger.length}));
  process.exit(0);
}
const expectedOutput = path.join(outputRoot, 'Nano Monitor-win32-x64');
try {
  await fs.access(expectedOutput);
  await fs.access(path.join(expectedOutput, '.nano-owned-build'));
} catch (error) {
  try {await fs.access(expectedOutput);} catch {error = null;}
  if (error) throw new Error('Existing desktop output is not a Nano Monitor build; refusing to replace it.');
}
const output = await packager({dir: stage, out: outputRoot, name: 'Nano Monitor',
  platform: 'win32', arch: 'x64', electronVersion: '44.7.0', asar: true,
  prune: false, overwrite: true, tmpdir: path.join(buildRoot, 'tmp'),
  download: {cacheRoot: path.join(buildRoot, 'electron-cache')},
  appCopyright: 'Nano Monitor; upstream notices included',
  win32metadata: {CompanyName: 'Personal tools', FileDescription: 'Wireless Osmo Nano camera monitor', ProductName: 'Nano Monitor'},
});
for (const directory of output) {
  if (path.resolve(directory) !== expectedOutput) throw new Error('Unexpected desktop output path.');
  await fs.writeFile(path.join(directory, '.nano-owned-build'), 'Nano Monitor desktop build');
}
await fs.writeFile(path.join(project, 'desktop-install.json'), JSON.stringify({
  executable: path.join(expectedOutput, 'Nano Monitor.exe'),
}, null, 2));
console.log(JSON.stringify({output}));
