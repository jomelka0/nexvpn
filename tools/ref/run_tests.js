'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const P = require('./sub_parser');
const M = require('./mock_server');

const USER_AGENTS = ['v2rayNG/1.9.19', 'Happ/2.5.1', 'v2rayN/7.0', 'Streisand/1.0', 'Nex/1.1'];
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const enc = encodeURIComponent;

let passed = 0;
function t(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log('  ok  ' + name); },
    e => { console.log('  FAIL ' + name + '\n       ' + (e && e.message)); process.exitCode = 1; });
}

function get(url, headers) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, res => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

// Зеркало SubscriptionService._importUrl из Dart
async function importUrl(url, deviceHeaders) {
  const log = [];
  let bestDecoy = null, firstOutcome = null, firstFetched = null, firstError = null;
  for (const ua of USER_AGENTS) {
    let f;
    try {
      f = await get(url, Object.assign({ 'user-agent': ua }, deviceHeaders));
      if (f.status !== 200) throw new Error('HTTP ' + f.status);
    } catch (e) { log.push(`[${ua}] error ${e.message}`); if (!firstError) firstError = e.message; continue; }
    const o = P.parseSubscriptionBody(f.body);
    const decoy = P.looksLikeDecoys(o.servers);
    log.push(`[${ua}] format=${o.format} servers=${o.servers.length} decoy=${decoy} notices=${o.notices.length}`);
    if (!firstOutcome) { firstOutcome = o; firstFetched = f; }
    if (o.servers.length && !decoy) return { ok: true, ua, outcome: o, fetched: f, suspicious: false, log };
    if (o.servers.length && !bestDecoy) bestDecoy = { ua, outcome: o, fetched: f };
  }
  if (bestDecoy) return { ok: true, ua: bestDecoy.ua, outcome: bestDecoy.outcome, fetched: bestDecoy.fetched, suspicious: true, log };
  const reason = firstOutcome && firstOutcome.notices.length ? 'Сервер подписки ответил: ' + firstOutcome.notices.join(' ')
    : firstError ? 'Не удалось загрузить подписку: ' + firstError : 'Не найдено поддерживаемых серверов';
  return { ok: false, error: reason, hwidLimit: firstFetched && firstFetched.headers['x-hwid-limit'] === 'true', log };
}

(async () => {
  console.log('Парсер:');
  const plain = M.REAL_LINES.concat([
    'ss://' + b64('aes-256-gcm:secret') + '@ss1.example.com:8388#' + enc('SS Tokyo'),
    'ss://' + b64('chacha20-ietf-poly1305:pw@legacy.example.com:9999') + '#' + enc('Legacy SS'),
    'vless://uuid@[2001:db8::1]:443?security=none#' + enc('IPv6 Node'),
    'hysteria2://pw@hy.example.com:443#Hy2',
    'tuic://a:b@t.example.com:443#Tuic',
    M.REAL_LINES[1], // дубль
  ]).join('\n');

  await t('links: 6 серверов, 2 пропущено, дубль убран', () => {
    const o = P.parseSubscriptionBody(plain);
    assert.strictEqual(o.format, 'links');
    assert.strictEqual(o.servers.length, 6);
    assert.strictEqual(o.skipped, 2);
    const by = n => o.servers.find(s => s.name === n);
    assert.strictEqual(by('🇩🇪 Germany 1').address, 'de1.example.com');
    assert.strictEqual(by('🇩🇪 Germany 1').port, 443);
    assert.strictEqual(by('Netherlands').protocol, 'TROJAN');
    assert.strictEqual(by('US East').address, 'us3.example.com');
    assert.strictEqual(by('SS Tokyo').port, 8388);
    assert.strictEqual(by('Legacy SS').address, 'legacy.example.com');
    assert.strictEqual(by('Legacy SS').port, 9999);
    assert.strictEqual(by('IPv6 Node').address, '2001:db8::1');
  });
  await t('base64-подписка даёт тот же результат', () => {
    const a = P.parseSubscriptionBody(plain), b = P.parseSubscriptionBody(b64(plain));
    assert.strictEqual(b.format, 'base64-links');
    assert.deepStrictEqual(b.servers, a.servers);
  });
  await t('url-safe base64 без паддинга', () => {
    const s = b64(plain).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    assert.strictEqual(P.parseSubscriptionBody(s).servers.length, 6);
  });
  await t('заглушки HWID → 0 серверов, 4 сообщения', () => {
    const o = P.parseSubscriptionBody(M.STUB_LINES.join('\n'));
    assert.strictEqual(o.servers.length, 0);
    assert.deepStrictEqual(o.notices, ['Включите передачу HWID', 'в настройках приложения', 'Либо смените приложение', 'На указанное на сайте']);
  });
  await t('одинаковый host:port у всех → заглушки', () => {
    const o = P.parseSubscriptionBody(M.DECOY_LINES.join('\n'));
    assert.strictEqual(o.servers.length, 3);
    assert.ok(P.looksLikeDecoys(o.servers));
    assert.ok(!P.looksLikeDecoys(P.parseSubscriptionBody(plain).servers));
    assert.ok(!P.looksLikeDecoys(o.servers.slice(0, 1)));
  });
  const jsonText = JSON.stringify(M.JSON_CONFIGS.concat([{ outbounds: [{ type: 'vless', server: 'x' }] }]));
  await t('Xray JSON: 2 конфигурации, sing-box-запись пропущена', () => {
    const o = P.parseSubscriptionBody(jsonText);
    assert.strictEqual(o.format, 'xray-json');
    assert.strictEqual(o.servers.length, 2);
    assert.strictEqual(o.skipped, 1);
    assert.strictEqual(o.servers[0].name, '🌎 Универсальный №1');
    assert.strictEqual(o.servers[0].address, 'real1.example.com');
    assert.strictEqual(o.servers[1].protocol, 'TROJAN');
    assert.strictEqual(JSON.parse(o.servers[0].config).outbounds[0].tag, 'proxy');
  });
  await t('base64(JSON) распознаётся', () => {
    assert.strictEqual(P.parseSubscriptionBody(b64(jsonText)).format, 'base64-xray-json');
  });
  await t('HTML-страница → unknown, пустая строка → empty', () => {
    assert.strictEqual(P.parseSubscriptionBody('<html><body>Please use the official app</body></html>').format, 'unknown');
    assert.strictEqual(P.parseSubscriptionBody('').format, 'empty');
  });
  await t('redact прячет uuid/пароли', () => {
    const r = P.redact('vless://11111111-2222@host:443?x=1#n ss://' + b64('aes:pw') + '@h:1 vmess://' + b64('{"a":1,"b":2}'));
    assert.ok(!r.includes('11111111') && !r.includes(b64('aes:pw')) && r.includes('vless://***@host'));
    assert.ok(!/vmess:\/\/ey/.test(r));
  });
  await t('заголовки: userinfo и profile-title', () => {
    assert.deepStrictEqual(P.parseUserInfo('upload=1; download=2; total=100; expire=0'), { upload: 1, download: 2, total: 100, expire: 0 });
    assert.deepStrictEqual(P.parseUserInfo(null), {});
    assert.strictEqual(P.decodeProfileTitle('base64:' + b64('Добрый VPN 😺')), 'Добрый VPN 😺');
    assert.strictEqual(P.decodeProfileTitle('My%20Sub'), 'My Sub');
    assert.strictEqual(P.decodeProfileTitle('  '), null);
  });

  console.log('Импорт с тестового сервера (как Remnawave):');
  const server = await M.start(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const dev = { 'x-hwid': 'abcdef0123456789', 'x-device-os': 'Android', 'x-device-model': 'Test Phone' };

  await t('без HWID → ошибка с текстом панели', async () => {
    const r = await importUrl(base + '/sub/good', {});
    assert.ok(!r.ok);
    assert.ok(r.error.startsWith('Сервер подписки ответил: Включите передачу HWID'), r.error);
  });
  await t('лимит устройств определяется по заголовку', async () => {
    const r = await importUrl(base + '/sub/limit', dev);
    assert.ok(!r.ok && r.hwidLimit);
  });
  await t('404 → понятная ошибка', async () => {
    const r = await importUrl(base + '/sub/404', dev);
    assert.ok(!r.ok && /HTTP 404/.test(r.error));
  });
  await t('с HWID: заглушки v2rayNG пропускаются, берётся Xray JSON (Happ)', async () => {
    const r = await importUrl(base + '/sub/good', dev);
    assert.ok(r.ok && !r.suspicious);
    assert.strictEqual(r.ua, 'Happ/2.5.1');
    assert.strictEqual(r.outcome.servers.length, 2);
    assert.strictEqual(r.fetched.headers['subscription-userinfo'].includes('total=107374182400'), true);
  });
  await t('если JSON недоступен → берётся base64-список (v2rayN)', async () => {
    const r = await importUrl(base + '/sub/good?mode=nojson', dev);
    assert.ok(r.ok && !r.suspicious);
    assert.strictEqual(r.ua, 'v2rayN/7.0');
    assert.strictEqual(r.outcome.servers.length, 3);
  });
  await t('если везде заглушки → результат с пометкой suspicious', async () => {
    const r = await importUrl(base + '/sub/good?mode=alldecoy', dev);
    assert.ok(r.ok && r.suspicious);
    assert.strictEqual(r.outcome.servers.length, 3);
  });
  server.close();

  // ---- фикстуры для Dart-тестов ----
  const fx = path.join(__dirname, '..', '..', 'test', 'fixtures');
  fs.mkdirSync(fx, { recursive: true });
  const cases = {
    'links.txt': plain,
    'links_base64.txt': b64(plain),
    'stub_hwid.txt': M.STUB_LINES.join('\n'),
    'decoy_ss.txt': M.DECOY_LINES.join('\n'),
    'xray_json.json': jsonText,
    'xray_json_base64.txt': b64(jsonText),
    'unknown.html': '<html><body>Please use the official app</body></html>',
    'empty.txt': '',
  };
  const expected = {};
  for (const [file, body] of Object.entries(cases)) {
    fs.writeFileSync(path.join(fx, file), body, 'utf8');
    const o = P.parseSubscriptionBody(body);
    expected[file] = {
      format: o.format, skipped: o.skipped, notices: o.notices, decoy: P.looksLikeDecoys(o.servers),
      servers: o.servers.map(s => ({ name: s.name, address: s.address, port: s.port, protocol: s.protocol, hasConfig: s.config !== '' })),
    };
  }
  fs.writeFileSync(path.join(fx, 'expected.json'), JSON.stringify(expected, null, 1), 'utf8');
  console.log(`\nИтог: ${passed} проверок пройдено${process.exitCode ? ', ЕСТЬ ОШИБКИ' : ''}. Фикстур: ${Object.keys(cases).length}`);
})();
