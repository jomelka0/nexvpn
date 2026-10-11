'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function dataDir() {
  if (process.env.NEX_DATA) return process.env.NEX_DATA;
  if (process.platform === 'win32') return path.join(process.env.APPDATA || os.homedir(), 'Nex');
  return path.join(os.homedir(), '.config', 'nex');
}

const DEFAULT_SETTINGS = { bypassLan: true, fragment: false, sysProxy: true, socksPort: 10808, httpPort: 10809 };

class Store {
  constructor(dir = dataDir()) {
    this.dir = dir;
    this.file = path.join(dir, 'state.json');
    fs.mkdirSync(dir, { recursive: true });
    this.data = { subs: [], servers: [], selectedId: null, settings: {}, hwid: null };
    try { Object.assign(this.data, JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch (e) {}
    this.data.settings = Object.assign({}, DEFAULT_SETTINGS, this.data.settings);
    if (!this.data.hwid) { this.data.hwid = crypto.randomBytes(16).toString('hex'); this.save(); }
  }
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data), 'utf8');
    fs.renameSync(tmp, this.file);
  }
  get servers() { return this.data.servers; }
  get subs() { return this.data.subs; }
  get settings() { return this.data.settings; }
}

module.exports = { Store, dataDir, DEFAULT_SETTINGS };
