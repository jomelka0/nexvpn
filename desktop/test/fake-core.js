#!/usr/bin/env node
'use strict';
// Подставное ядро для тестов (вместо xray / sing-box / mihomo): проверяет структуру конфига,
// слушает порты, отвечает как прокси (204; для серверов с «dead» — молчит), отдаёт растущую статистику.
const fs = require('fs'), os = require('os'), net = require('net'), http = require('http'), path = require('path');
const args = process.argv.slice(2);
const stateFile = port => path.join(os.tmpdir(), 'fakecore_' + port + '.json');
const fail = m => { process.stderr.write('FATAL: ' + m + '\n'); process.exit(23); };

if (args[0] === 'version' || args[0] === '-version') { console.log('fake core 1.0'); process.exit(0); }

if (args[0] === 'api' && args[1] === 'statsquery') { // как «xray api statsquery»
  const port = ((args.find(a => a.startsWith('--server=')) || '').split('=')[1] || '').split(':')[1];
  let t0 = Date.now(); try { t0 = JSON.parse(fs.readFileSync(stateFile(port), 'utf8')).t0; } catch (e) {}
  const sec = (Date.now() - t0) / 1000;
  console.log(JSON.stringify({ stat: [
    { name: 'outbound>>>proxy>>>traffic>>>downlink', value: String(Math.floor(sec * 120000)) },
    { name: 'outbound>>>proxy>>>traffic>>>uplink', value: String(Math.floor(sec * 30000)) },
    { name: 'outbound>>>direct>>>traffic>>>downlink', value: '999999' }] }));
  process.exit(0);
}

const cfgPath = args[Math.max(args.indexOf('-c'), args.indexOf('-f')) + 1];
if (!cfgPath) fail('no config argument');
let cfg; try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (e) { fail('bad json ' + e.message); }

const proxyPorts = [];   // порты, на которых отвечаем как HTTP-прокси
const dumbPorts = [];    // порты, которые просто слушаем
let apiHttp = null, statsPort = null, dead = false, kind;

if (Array.isArray(cfg.outbounds) && cfg.outbounds.some(o => o.protocol)) {            // ---- Xray
  kind = 'xray';
  if (!Array.isArray(cfg.inbounds) || !cfg.inbounds.length) fail('no inbounds');
  const p = cfg.outbounds.find(o => o.protocol && !['freedom', 'blackhole', 'dns'].includes(o.protocol));
  if (!p) fail('no proxy outbound');
  const st = p.streamSettings || {}, s = p.settings || {};
  if (st.security === 'tls' && !st.tlsSettings) fail('tls without tlsSettings');
  if (st.security === 'reality' && !(st.realitySettings && st.realitySettings.publicKey)) fail('reality without publicKey');
  if (['vless', 'vmess'].includes(p.protocol) && !(s.vnext && s.vnext[0] && s.vnext[0].address && s.vnext[0].port)) fail('vnext missing');
  if (['trojan', 'shadowsocks'].includes(p.protocol) && !(s.servers && s.servers[0] && s.servers[0].address)) fail('servers missing');
  if (cfg.api && !cfg.inbounds.some(i => i.tag === 'api')) fail('api without inbound');
  dead = JSON.stringify(s).includes('dead');
  for (const i of cfg.inbounds) { if (i.protocol === 'http') proxyPorts.push(i.port); else { dumbPorts.push(i.port); if (i.tag === 'api') statsPort = i.port; } }
} else if (Array.isArray(cfg.outbounds) && cfg.outbounds.some(o => o.type)) {          // ---- sing-box
  kind = 'sing-box';
  const p = cfg.outbounds.find(o => !['direct', 'block', 'dns'].includes(o.type));
  if (!p || !p.server || !p.server_port) fail('outbound without server');
  if (p.tls && p.tls.reality && !p.tls.reality.public_key) fail('reality without public_key');
  if (['vless', 'vmess', 'tuic'].includes(p.type) && !p.uuid) fail('uuid missing');
  if (['trojan', 'hysteria2', 'tuic'].includes(p.type) && p.password === undefined) fail('password missing');
  if (['hysteria2', 'tuic'].includes(p.type) && !p.tls) fail('tls missing');
  if (cfg.route && cfg.route.final && !cfg.outbounds.some(o => o.tag === cfg.route.final)) fail('route.final unknown');
  dead = JSON.stringify(p).includes('dead');
  for (const i of cfg.inbounds || []) { if (i.type === 'mixed') proxyPorts.push(i.listen_port); else if (i.type === 'tun') { /* виртуальный адаптер */ } }
  const ec = cfg.experimental && cfg.experimental.clash_api && cfg.experimental.clash_api.external_controller;
  if (ec) statsPort = Number(ec.split(':')[1]);
} else if (Array.isArray(cfg.proxies)) {                                                // ---- Mihomo
  kind = 'mihomo';
  const p = cfg.proxies[0];
  if (!p || !p.type || !p.server || !p.port) fail('proxy without server');
  if (p.type === 'vless' && !p.uuid) fail('uuid missing');
  if (p['reality-opts'] && !p['reality-opts']['public-key']) fail('reality without public-key');
  if (!cfg.rules || !cfg.rules.some(r => String(r).startsWith('MATCH,'))) fail('no MATCH rule');
  dead = JSON.stringify(p).includes('dead');
  if (cfg['mixed-port']) proxyPorts.push(cfg['mixed-port']);
  if (cfg['external-controller']) statsPort = Number(cfg['external-controller'].split(':')[1]);
} else fail('unknown config format');

for (const port of proxyPorts) {
  http.createServer((req, res) => { if (dead) return; setTimeout(() => { res.writeHead(204); res.end(); }, 30 + (JSON.stringify(cfg).length % 40)); }).listen(port, '127.0.0.1');
}
for (const port of dumbPorts) net.createServer(c => c.on('error', () => {})).listen(port, '127.0.0.1');

if (statsPort) {
  const t0 = Date.now();
  fs.writeFileSync(stateFile(statsPort), JSON.stringify({ t0 }));
  if (kind !== 'xray') { // Clash API: GET /connections
    apiHttp = http.createServer((req, res) => {
      const sec = (Date.now() - t0) / 1000;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ downloadTotal: Math.floor(sec * 120000), uploadTotal: Math.floor(sec * 30000), connections: [] }));
    }).listen(statsPort, '127.0.0.1');
  }
}
setInterval(() => {}, 1e6);
process.on('SIGTERM', () => process.exit(0));
