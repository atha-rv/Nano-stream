const fs = require('node:fs/promises');
const {createWriteStream} = require('node:fs');
const {spawn} = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const reads = new Set(['state', 'storage', 'gallery']);
const writes = new Set(['connect', 'start', 'stop', 'disconnect', 'folder', 'storage', 'gallery_refresh', 'download', 'cancel']);

function validateRequest(action, method, body) {
  if (!(method === 'GET' ? reads : method === 'POST' ? writes : new Set()).has(action)) {
    throw new Error('Unsupported camera action.');
  }
  if (body !== undefined) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid action data.');
    if (action === 'download') {
      if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 10000 ||
          body.ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) ||
          Object.keys(body).some(key => !['ids','label'].includes(key)) ||
          (body.label !== undefined && (typeof body.label !== 'string' || body.label.length > 80))) {
        throw new Error('Choose videos from the camera library.');
      }
      return;
    }
    const key = action === 'storage' ? 'id' : action === 'folder' ? (body.batchPath ? 'batchPath' : 'savedPath') : null;
    if (!key || Object.keys(body).length !== 1 || typeof body[key] !== 'string' || body[key].length > 2048) {
      throw new Error('Invalid action data.');
    }
  }
  if (action === 'storage' && method === 'POST' && !body) throw new Error('Choose a storage preference.');
  if (action === 'download' && !body) throw new Error('Choose videos from the camera library.');
}

class Bridge {
  constructor(config) {this.config = config; this.child = null; this.session = null; this.starting = null;}
  async readSession() {
    const session = JSON.parse(await fs.readFile(this.config.sessionFile, 'utf8'));
    if (session.port !== 8765 || typeof session.token !== 'string') throw new Error('Invalid local camera session.');
    this.session = session;
  }
  async request(action, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:8765/${action}`, {
      method, headers: {'X-Nano-Token': this.session?.token || '', 'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(16000),
    });
    return {ok: response.ok, data: await response.json()};
  }
  async ensureReady() {
    if (this.starting) return this.starting;
    this.starting = this.start();
    try {await this.starting;} finally {this.starting = null;}
  }
  async start() {
    try {
      await this.readSession();
      if ((await this.request('state')).ok) return;
    } catch {}
    const occupied = await new Promise(resolve => {
      const socket = net.connect({host: '127.0.0.1', port: 8765});
      socket.once('connect', () => {socket.destroy(); resolve(true);});
      socket.once('error', () => resolve(false));
    });
    if (occupied) throw new Error('The camera port is occupied by another session. Close the old Nano Monitor and reopen this app.');
    await fs.mkdir(this.config.logDirectory, {recursive: true});
    const output = createWriteStream(path.join(this.config.logDirectory, 'camera.log'), {flags: 'a'});
    const errors = createWriteStream(path.join(this.config.logDirectory, 'camera-errors.log'), {flags: 'a'});
    this.child = spawn(this.config.python, [this.config.server], {
      cwd: this.config.workspace, windowsHide: true,
      env: {...process.env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1',
        PATH: `${this.config.ffmpegDirectory}${path.delimiter}${process.env.PATH || ''}`},
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let startupError;
    this.child.stdout.pipe(output); this.child.stderr.pipe(errors);
    this.child.once('error', error => {startupError = error;});
    this.child.once('exit', () => {output.end(); errors.end(); this.child = null;});
    for (let attempt = 0; attempt < 80; attempt++) {
      if (startupError) throw new Error('The local camera runtime could not start. See the desktop README.');
      try {await this.readSession(); if ((await this.request('state')).ok) return;} catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    this.stopOwned();
    throw new Error('The camera service did not start. Check the desktop camera log.');
  }
  stopOwned() {if (this.child) {this.child.kill(); this.child = null;}}
}

module.exports = {Bridge, validateRequest};
