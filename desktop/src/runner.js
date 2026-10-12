'use strict';
// Запуск процессов ядер, быстрый параллельный пинг, проверка прав администратора.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const cores = require('./cores');
const L = require('./linkmodel');

const TEST_URLS = ['http://cp.cloudflare.com/generate_204', 'http://www.gstatic.com/generate_204'];
const pingTimeout = () => Number(process.env.NEX_PING_TIMEOUT) || 4000;
const precheckTimeout = () => Number(process.env.NEX_PRECHECK_TIMEOUT) || 2000;

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

/** Быстрая проверка: отвечает ли сервер по TCP. Отсекает мёртвые серверы за ~секунду, не запуская ядро. */
function tcpProbe(host, port, ms) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; clearTimeout(timer); try { sock.destroy(); } catch (e) {} resolve(v); } };
    const sock = net.connect({ host, port });
    const timer = setTimeout(() => finish(false), ms);
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
  });
}

class Instance {
  constructor(bin, text, dir, spec) {
    const id = `${process.pid}_${Math.random().toString(16).slice(2, 8)}`;
    this.file = path.join(dir, `core_${id}${spec.ext || '.json'}`);
    this.workdir = spec.workdir ? path.join(dir, `w_${id}`) : null;
    if (this.workdir) fs.mkdirSync(this.workdir, { recursive: true });
    fs.writeFileSync(this.file, text, 'utf8');
    this.stderr = '';
    this.exited = false;
    this.proc = spawn(bin, spec.args(this.file, this.workdir), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const keep = d => { this.stderr = (this.stderr + d).slice(-3000); };
    this.proc.stdout.on('data', keep);
    this.proc.stderr.on('data', keep);
    this.proc.on('exit', code => { this.exited = true; this.code = code; });
    this.proc.on('error', e => { this.exited = true; this.stderr += String(e.message); });
  }
  tail() { return this.stderr.trim().split('\n').slice(-3).join(' | '); }
  async waitReady(port, ms = 8000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this.exited) throw new Error('Ядро завершилось (код ' + this.code + '): ' + (this.tail() || 'без сообщения'));
      if (await canConnect(port)) return;
      await new Promise(r => setTimeout(r, 40));
    }
    throw new Error('Ядро не запустилось за ' + ms / 1000 + ' с: ' + this.tail());
  }
  stop() {
    try { this.proc.kill(); } catch (e) {}
    setTimeout(() => {
      try { fs.unlinkSync(this.file); } catch (e) {}
      if (this.workdir) try { fs.rmSync(this.workdir, { recursive: true, force: true }); } catch (e) {}
    }, 800);
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
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { timeout: true })));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Реальный пинг через ядро: поднимаем ядро с конфигом сервера и делаем запрос через него. -1 — не ответил.
 * ctx = { dir, core: 'auto'|id, state: {} } — state.lastError получает причину неудачи.
 */
async function ping(node, ctx) {
  const state = ctx.state;
  const sel = cores.pick(node, ctx.core);
  if (sel.error) { state.lastError = sel.error; return -1; }

  if (!process.env.NEX_SKIP_PRECHECK && node.address && node.port && L.isTcpBased(node)) {
    if (!(await tcpProbe(node.address, node.port, precheckTimeout()))) {
      state.lastError = `Сервер ${node.address}:${node.port} недоступен (нет TCP-соединения)`;
      return -1;
    }
  }

  let inst;
  try {
    const [httpPort, socksPort] = [await freePort(), await freePort()];
    const built = sel.core.build(node, { httpPort, socksPort, withApi: false, bypassLan: false, fragment: false, tun: false });
    inst = new Instance(sel.bin, built.text, ctx.dir, built.spec);
    await inst.waitReady(built.http, 6000);
    let lastErr = '';
    for (const url of TEST_URLS) {
      try {
        const r = await httpViaProxy(built.http, url, pingTimeout());
        if (r.status >= 200 && r.status < 400) return Math.max(1, Math.round(r.ms));
        lastErr = 'HTTP ' + r.status;
      } catch (e) {
        lastErr = e.message;
        if (e.timeout) break; // сервер молчит — второй адрес не поможет
      }
    }
    state.lastError = `Через сервер (${sel.core.title}) запрос не прошёл: ${lastErr}`;
    return -1;
  } catch (e) {
    state.lastError = e.message;
    return -1;
  } finally {
    if (inst) inst.stop();
  }
}

class Semaphore {
  constructor(n) { this.n = n; this.q = []; }
  async acquire() { if (this.n > 0) { this.n--; return; } await new Promise(r => this.q.push(r)); }
  release() { const next = this.q.shift(); if (next) next(); else this.n++; }
  async run(fn) { await this.acquire(); try { return await fn(); } finally { this.release(); } }
}

function isAdmin() {
  if (process.env.NEX_FAKE_ADMIN) return true;
  if (process.platform === 'win32') {
    try { execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true }); return true; } catch (e) { return false; }
  }
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

module.exports = { freePort, canConnect, tcpProbe, Instance, httpViaProxy, ping, Semaphore, isAdmin, TEST_URLS };
