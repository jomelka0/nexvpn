'use strict';
// Имитация панели подписок (в духе Remnawave): ответ зависит от x-hwid и User-Agent.
const http = require('http');
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const enc = encodeURIComponent;

const REAL_LINES = [
  'vless://11111111-2222-3333-4444-555555555555@de1.example.com:443?type=tcp&security=reality&pbk=abc&sni=www.microsoft.com&sid=01&fp=chrome#' + enc('🇩🇪 Germany 1'),
  'trojan://passw0rd@nl2.example.com:8443?security=tls&sni=nl2.example.com#Netherlands',
  'vmess://' + b64(JSON.stringify({ v: '2', ps: 'US East', add: 'us3.example.com', port: '443', id: '22222222-2222-2222-2222-222222222222', aid: '0', net: 'ws', tls: 'tls' })),
];
const DECOY_LINES = [1, 2, 3].map(n => 'ss://' + b64('aes-128-gcm:pw') + '@max.ru:1234#' + enc('🌎 Универсальный №' + n));
const STUB_LINES = ['Включите передачу HWID', 'в настройках приложения', 'Либо смените приложение', 'На указанное на сайте']
  .map(t => 'vless://00000000-0000-0000-0000-000000000000@0.0.0.0:1?security=none#' + enc(t));
const JSON_CONFIGS = [
  { remarks: '🌎 Универсальный №1', inbounds: [{ tag: 'socks', port: 10808, protocol: 'socks' }],
    outbounds: [{ tag: 'proxy', protocol: 'vless', settings: { vnext: [{ address: 'real1.example.com', port: 443, users: [{ id: 'u1', encryption: 'none' }] }] }, streamSettings: { network: 'tcp', security: 'reality' } },
                { tag: 'direct', protocol: 'freedom' }, { tag: 'block', protocol: 'blackhole' }] },
  { remarks: 'Trojan', outbounds: [{ tag: 'proxy', protocol: 'trojan', settings: { servers: [{ address: 'real2.example.com', port: 8443, password: 'p' }] } }, { protocol: 'freedom' }] },
];

function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const ua = req.headers['user-agent'] || '';
  const hwid = req.headers['x-hwid'];
  const mode = url.searchParams.get('mode') || '';
  const send = (code, body, extra = {}) => { res.writeHead(code, Object.assign({ 'content-type': 'text/plain; charset=utf-8' }, extra)); res.end(body); };
  const info = {
    'subscription-userinfo': 'upload=1000; download=2000; total=107374182400; expire=1900000000',
    'profile-title': 'base64:' + b64('Добрый VPN 😺'),
    'profile-update-interval': '6',
  };

  if (url.pathname === '/sub/404') return send(404, 'not found');
  if (url.pathname === '/sub/limit') return send(200, STUB_LINES.join('\n'), { 'x-hwid-limit': 'true' });
  if (!hwid) return send(200, STUB_LINES.join('\n'), { 'x-hwid-not-supported': 'true' });

  if (mode === 'alldecoy') return send(200, DECOY_LINES.join('\n'), info);
  if (/v2rayNG/.test(ua)) return send(200, DECOY_LINES.join('\n'), info);
  if (/Happ/.test(ua)) return mode === 'nojson' ? send(200, '<html>use official app</html>', info) : send(200, JSON.stringify(JSON_CONFIGS), info);
  if (/v2rayN\//.test(ua)) return send(200, b64(REAL_LINES.join('\n')), info);
  return send(200, 'hello', info);
}

function start(port = 0) {
  return new Promise(resolve => {
    const s = http.createServer(handler).listen(port, '127.0.0.1', () => resolve(s));
  });
}
module.exports = { start, REAL_LINES, DECOY_LINES, STUB_LINES, JSON_CONFIGS };
if (require.main === module) start(8099).then(() => console.log('mock on :8099'));
