'use strict';
// Управление процессом Xray: запуск, реальный пинг через ядро, статистика трафика.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const { buildConfig, sumTraffic } = require('./xrayconfig');
const log = require('./log');

const PING_TIMEOUT = Number(process.env.NEX_PING_TIMEOUT) || 5000;
const TEST_URLS = ['http://cp.cloudflare.com/generate_204', 'http://www.gstatic.com/generate_204'];

function findBinary() {
  if (process.env.NEX_XRAY) return process.env.NEX_XRAY;
  const exe = process.platform === 'win32' ? 'xray.exe' : 'xray';
  const base = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
  for (const p of [path.join(base, exe), path.join(process.cwd(), exe)]) if (fs.existsSync(p)) return p;
  return null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

function canConnect(port) {
  return new Promise(resolve => {
    const c = net.connect(port, '127.0.0.1');
    c.once('connect', () => { c.destroy(); resolve(true); });
    c.once('error', () => resolve(false));
  });
}

class Instance {
  constructor(bin, cfg, dir) {
    this.file = path.join(dir, `xray_${process.pid}_${Math.random().toString(16).slice(2, 8)}.json`);
    fs.writeFileSync(this.file, JSON.stringify(cfg), 'utf8');
    this.stderr = '';
    this.exited = false;
    this.proc = spawn(bin, ['run', '-c', this.file], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const keep = d => { this.stderr = (this.stderr + d).slice(-3000); };
    this.proc.stdout.on('data', keep);
    this.proc.stderr.on('data', keep);
    this.proc.on('exit', code => { this.exited = true; this.code = code; });
    this.proc.on('error', e => { this.exited = true; this.stderr += String(e.message); });
  }
  async waitReady(port, ms = 8000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this.exited) throw new Error('Xray завершился (код ' + this.code + '): ' + (this.stderr.trim().split('\n').slice(-3).join(' | ') || 'без сообщения'));
      if (await canConnect(port)) return;
      await new Promise(r => setTimeout(r, 80));
    }
    throw new Error('Xray не запустился за ' + ms / 1000 + ' с: ' + this.stderr.trim().split('\n').slice(-3).join(' | '));
  }
  stop() {
    try { this.proc.kill(); } catch (e) {}
    setTimeout(() => { try { fs.unlinkSync(this.file); } catch (e) {} }, 500);
  }
}

function httpViaProxy(port, url, timeout) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const t0 = process.hrtime.bigint();
    const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: url, headers: { Host: u.host, 'User-Agent': 'Nex', Connection: 'close' }, timeout }, res => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, ms: Number(process.hrtime.bigint() - t0) / 1e6 }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

/** Реальный пинг: поднимаем Xray с конфигом сервера и делаем запрос через него. -1 — не ответил. */
async function ping(node, dir, state) {
  const bin = findBinary();
  if (!bin) { state.lastError = 'Xray не найден рядом с программой'; return -1; }
  let inst;
  try {
    const [socksPort, httpPort] = [await freePort(), await freePort()];
    const cfg = buildConfig(node, { socksPort, httpPort, withApi: false, bypassLan: false, logLevel: 'error' });
    inst = new Instance(bin, cfg, dir);
    await inst.waitReady(httpPort, 6000);
    let best = -1, lastErr = '';
    for (const url of TEST_URLS) {
      for (let i = 0; i < 2; i++) {
        try {
          const r = await httpViaProxy(httpPort, url, PING_TIMEOUT);
          if (r.status >= 200 && r.status < 400) { const ms = Math.round(r.ms); if (best < 0 || ms < best) best = ms; }
          else { lastErr = 'HTTP ' + r.status; break; }
        } catch (e) { lastErr = e.message; break; }
      }
      if (best >= 0) break;
    }
    if (best < 0) state.lastError = 'Через сервер запрос не прошёл: ' + lastErr;
    return best;
  } catch (e) {
    state.lastError = e.message;
    return -1;
  } finally {
    if (inst) inst.stop();
  }
}

function queryStats(bin, apiPort) {
  return new Promise(resolve => {
    execFile(bin, ['api', 'statsquery', `--server=127.0.0.1:${apiPort}`], { timeout: 4000, windowsHide: true }, (err, out) => {
      if (err) return resolve(null);
      try { resolve(sumTraffic(JSON.parse(out).stat)); } catch (e) { resolve(null); }
    });
  });
}

module.exports = { findBinary, freePort, Instance, ping, queryStats, TEST_URLS, os };
