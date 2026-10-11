'use strict';
// Записывает примеры конфигов Nex в папку; в CI каждый проверяется настоящим Xray: `xray run -test -c файл`.
const fs = require('fs'), path = require('path');
const X = require('../src/xrayconfig');
const M = require('../../tools/ref/mock_server');
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const out = process.argv[2] || '/tmp/nex-configs';
fs.mkdirSync(out, { recursive: true });

const links = {
  vless_reality: 'vless://11111111-2222-3333-4444-555555555555@de1.example.com:443?type=tcp&security=reality&pbk=Xk2n8mAhWqZJm5G6xQe3q8t6vYQ0yH3m0bP2oJ5k9Wc&sni=www.microsoft.com&sid=01ab&fp=chrome&flow=xtls-rprx-vision#a',
  vless_ws_tls: 'vless://11111111-2222-3333-4444-555555555555@cdn.example.com:443?type=ws&security=tls&path=%2Fws&host=cdn.example.com&sni=cdn.example.com&alpn=h2,http/1.1&fp=firefox#b',
  vless_grpc_tls: 'vless://11111111-2222-3333-4444-555555555555@g.example.com:443?type=grpc&serviceName=svc&mode=multi&security=tls&sni=g.example.com#c',
  vless_tcp_none: 'vless://11111111-2222-3333-4444-555555555555@plain.example.com:8080?type=tcp&security=none#d',
  trojan_tls: 'trojan://passw0rd@nl2.example.com:8443?security=tls&sni=nl2.example.com#e',
  vmess_ws_tls: 'vmess://' + b64(JSON.stringify({ v: '2', ps: 'x', add: 'us3.example.com', port: '443', id: '22222222-2222-2222-2222-222222222222', aid: '0', scy: 'auto', net: 'ws', type: 'none', host: 'cdn.example.com', path: '/p', tls: 'tls', sni: 'cdn.example.com' })),
  ss_sip002: 'ss://' + b64('aes-256-gcm:secret') + '@ss1.example.com:8388#f',
  ss_legacy: 'ss://' + b64('chacha20-ietf-poly1305:pw@legacy.example.com:9999') + '#g',
};
for (const [name, link] of Object.entries(links)) {
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(X.buildConfig({ link }, { apiPort: 10085 }), null, 1));
}
fs.writeFileSync(path.join(out, 'vless_reality_fragment.json'), JSON.stringify(X.buildConfig({ link: links.vless_reality }, { fragment: true }), null, 1));
M.JSON_CONFIGS.forEach((cfg, i) => fs.writeFileSync(path.join(out, `raw_json_${i + 1}.json`), JSON.stringify(X.buildConfig({ config: JSON.stringify(cfg) }, {}), null, 1)));
console.log('configs:', fs.readdirSync(out).length, '->', out);
