'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Store } = require('./store');
const { Vpn } = require('./vpn');
const sub = require('./subscription');
const xray = require('./xray');
const log = require('./log');

const VERSION = '1.1.0';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

function publicServer(s) {
  return { id: s.id, name: s.name, address: s.address, port: s.port, protocol: s.protocol, source: s.source, ping: s.ping };
}

function createApp(opts = {}) {
  const store = opts.store || new Store();
  const vpn = new Vpn(store);
  const token = crypto.randomBytes(12).toString('hex');
  const uiDir = path.join(__dirname, '..', 'ui');
  let pingChain = Promise.resolve();
  let listenPort = 0;

  const state = () => ({
    version: VERSION,
    servers: store.servers.map(publicServer),
    subs: store.subs,
    selectedId: store.data.selectedId,
    settings: store.settings,
    status: vpn.status(),
    platform: process.platform,
    xrayFound: !!xray.findBinary(),
  });

  const json = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(b); };

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let b = '';
      req.on('data', d => { b += d; if (b.length > 2e6) { reject(new Error('too large')); req.destroy(); } });
      req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    });
  }

  const find = id => store.servers.find(s => s.id === id);

  async function handleApi(req, res, url) {
    const p = url.pathname;
    if (p === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('data: ' + JSON.stringify(vpn.status()) + '\n\n');
      vpn.listeners.add(res);
      req.on('close', () => vpn.listeners.delete(res));
      return;
    }
    if (req.method === 'GET' && p === '/api/state') return json(res, 200, state());
    if (req.method === 'GET' && p === '/api/log') return json(res, 200, { text: log.text(), hwid: store.data.hwid.slice(0, 6), version: VERSION });
    if (req.method !== 'POST') return json(res, 404, { error: 'not found' });
    const body = await readBody(req);

    if (p === '/api/import') {
      const r = await sub.importInput(body.input, store);
      if (!r.servers.length) return json(res, 200, { ok: false, error: r.error || 'Ничего не найдено' });
      return json(res, 200, { ok: true, message: sub.saveResult(r, store) });
    }
    if (p === '/api/refresh') {
      if (!store.subs.length) return json(res, 200, { ok: false, error: 'Нет подписок для обновления' });
      const n = await sub.refreshAll(store);
      return json(res, 200, { ok: n > 0, message: n > 0 ? `Обновлено серверов: ${n}` : null, error: n > 0 ? null : 'Не удалось обновить — см. Настройки → Диагностика' });
    }
    if (p === '/api/sub/delete') {
      store.data.subs = store.subs.filter(s => s.url !== body.url);
      store.data.servers = store.servers.filter(s => s.source !== body.url);
      if (!find(store.data.selectedId)) store.data.selectedId = store.servers.length ? store.servers[0].id : null;
      store.save();
      return json(res, 200, { ok: true });
    }
    if (p === '/api/server/delete') {
      store.data.servers = store.servers.filter(s => s.id !== body.id);
      if (!find(store.data.selectedId)) store.data.selectedId = store.servers.length ? store.servers[0].id : null;
      store.save();
      return json(res, 200, { ok: true });
    }
    if (p === '/api/select') { if (find(body.id)) { store.data.selectedId = body.id; store.save(); } return json(res, 200, { ok: true }); }
    if (p === '/api/ping') {
      const node = find(body.id);
      if (!node) return json(res, 404, { error: 'нет такого сервера' });
      const task = pingChain.then(async () => {
        const st = {};
        const ms = await xray.ping(node, store.dir, st);
        node.ping = ms;
        store.save();
        if (ms < 0) log.add(`Пинг ${node.name} (${node.address}:${node.port}): ${st.lastError || 'нет ответа'}`);
        return { ping: ms, error: ms < 0 ? st.lastError || 'нет ответа' : null };
      });
      pingChain = task.catch(() => {});
      return json(res, 200, await task);
    }
    if (p === '/api/connect') {
      const node = find(body.id);
      if (!node) return json(res, 404, { ok: false, error: 'нет такого сервера' });
      store.data.selectedId = node.id; store.save();
      try { await vpn.connect(node); return json(res, 200, { ok: true }); }
      catch (e) { return json(res, 200, { ok: false, error: e.message }); }
    }
    if (p === '/api/disconnect') { await vpn.disconnect(); return json(res, 200, { ok: true }); }
    if (p === '/api/settings') {
      const s = store.settings;
      for (const k of ['bypassLan', 'fragment', 'sysProxy']) if (typeof body[k] === 'boolean') s[k] = body[k];
      for (const k of ['socksPort', 'httpPort']) { const v = Number(body[k]); if (Number.isInteger(v) && v >= 1024 && v <= 65535) s[k] = v; }
      store.save();
      return json(res, 200, { ok: true, settings: s });
    }
    if (p === '/api/log/clear') { log.clear(); return json(res, 200, { ok: true }); }
    if (p === '/api/quit') {
      await vpn.disconnect();
      json(res, 200, { ok: true });
      setTimeout(() => (opts.onQuit ? opts.onQuit() : process.exit(0)), 200);
      return;
    }
    return json(res, 404, { error: 'not found' });
  }

  function serveStatic(res, p) {
    const name = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    if (name.includes('..')) { res.writeHead(400); return res.end(); }
    const file = path.join(uiDir, name);
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      let out = buf;
      if (name === 'index.html') out = Buffer.from(buf.toString('utf8').replace('__TOKEN__', token), 'utf8');
      res.writeHead(200, { 'content-type': MIME[path.extname(name)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(out);
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      // защита локального сервера: только свой хост и токен (против DNS-rebinding и чужих страниц)
      const host = String(req.headers.host || '');
      if (!(host === `127.0.0.1:${listenPort}` || host === `localhost:${listenPort}`)) { res.writeHead(403); return res.end('forbidden'); }
      if (url.pathname.startsWith('/api/')) {
        const t = req.headers['x-nex-token'] || url.searchParams.get('token');
        if (t !== token) return json(res, 403, { error: 'forbidden' });
        return await handleApi(req, res, url);
      }
      return serveStatic(res, url.pathname);
    } catch (e) {
      try { json(res, 500, { error: String(e && e.message || e) }); } catch (_) {}
    }
  });

  return {
    store, vpn, server, token,
    listen(port = 0) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => { listenPort = server.address().port; resolve(listenPort); });
      });
    },
    close() { vpn.shutdownSync(); server.close(); },
  };
}

module.exports = { createApp, VERSION };
