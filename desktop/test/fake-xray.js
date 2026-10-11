#!/usr/bin/env node
'use strict';
// Подставной Xray для тестов: проверяет структуру конфига, слушает порты, отвечает как прокси
// (204 через ~30 мс; для серверов с «dead» в адресе — молчит) и отдаёт растущую статистику.
const fs = require('fs'), os = require('os'), net = require('net'), http = require('http'), path = require('path');
const args = process.argv.slice(2);

if (args[0] === 'version' || args[0] === '-version') { console.log('Xray 25.0.0 (fake)'); process.exit(0); }

if (args[0] === 'api' && args[1] === 'statsquery') {
  const server = (args.find(a => a.startsWith('--server=')) || '').split('=')[1] || '';
  const port = server.split(':')[1];
  let t0 = Date.now();
  try { t0 = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'fakexray_' + port + '.json'), 'utf8')).t0; } catch (e) {}
  const sec = (Date.now() - t0) / 1000;
  console.log(JSON.stringify({ stat: [
    { name: 'outbound>>>proxy>>>traffic>>>downlink', value: String(Math.floor(sec * 120000)) },
    { name: 'outbound>>>proxy>>>traffic>>>uplink', value: String(Math.floor(sec * 30000)) },
    { name: 'outbound>>>direct>>>traffic>>>downlink', value: '999999' },
  ] }));
  process.exit(0);
}

function fail(msg) { process.stderr.write('Failed to start: ' + msg + '\n'); process.exit(23); }

if (args[0] === 'run') {
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(args[args.indexOf('-c') + 1], 'utf8')); } catch (e) { fail('bad json ' + e.message); }
  if (!Array.isArray(cfg.inbounds) || !cfg.inbounds.length) fail('no inbounds');
  const proxy = (cfg.outbounds || []).find(o => o.protocol && !['freedom', 'blackhole', 'dns'].includes(o.protocol));
  if (!proxy) fail('no proxy outbound');
  const st = proxy.streamSettings || {};
  if (st.security === 'tls' && !st.tlsSettings) fail('tls without tlsSettings');
  if (st.security === 'reality' && !(st.realitySettings && st.realitySettings.publicKey)) fail('reality without publicKey');
  const s = proxy.settings || {};
  if (['vless', 'vmess'].includes(proxy.protocol) && !(s.vnext && s.vnext[0] && s.vnext[0].address && s.vnext[0].port)) fail('vnext missing');
  if (['trojan', 'shadowsocks'].includes(proxy.protocol) && !(s.servers && s.servers[0] && s.servers[0].address)) fail('servers missing');
  if (cfg.api && !cfg.inbounds.some(i => i.tag === 'api')) fail('api without inbound');

  const dead = JSON.stringify(s).includes('dead');
  for (const inb of cfg.inbounds) {
    if (inb.protocol === 'http') {
      http.createServer((req, res) => {
        if (dead) return; // не отвечаем — имитация недоступного сервера
        setTimeout(() => { res.writeHead(204); res.end(); }, 30 + (JSON.stringify(s).length % 40));
      }).listen(inb.port, inb.listen || '127.0.0.1');
    } else {
      net.createServer(c => c.on('error', () => {})).listen(inb.port, inb.listen || '127.0.0.1');
      if (inb.tag === 'api') fs.writeFileSync(path.join(os.tmpdir(), 'fakexray_' + inb.port + '.json'), JSON.stringify({ t0: Date.now() }));
    }
  }
  setInterval(() => {}, 1e6);
  process.on('SIGTERM', () => process.exit(0));
} else {
  fail('unknown command');
}
