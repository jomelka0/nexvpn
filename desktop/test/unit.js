'use strict';
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const X = require('../src/xrayconfig');
const sysproxy = require('../src/sysproxy');
const sub = require('../src/subscription');
const log = require('../src/log');
const { Store } = require('../src/store');
const M = require('../../tools/ref/mock_server');

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
let passed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; }
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nex-'));

(async () => {
  console.log('Конфигурация Xray из ссылок:');
  await t('vless + reality', () => {
    const o = X.linkToOutbound('vless://11111111-2222-3333-4444-555555555555@de1.example.com:443?type=tcp&security=reality&pbk=PUB&sni=www.microsoft.com&sid=01&fp=chrome&flow=xtls-rprx-vision&spx=%2F#n');
    assert.strictEqual(o.protocol, 'vless');
    const u = o.settings.vnext[0];
    assert.deepStrictEqual([u.address, u.port, u.users[0].id, u.users[0].flow, u.users[0].encryption], ['de1.example.com', 443, '11111111-2222-3333-4444-555555555555', 'xtls-rprx-vision', 'none']);
    assert.strictEqual(o.streamSettings.security, 'reality');
    assert.deepStrictEqual(o.streamSettings.realitySettings, { serverName: 'www.microsoft.com', fingerprint: 'chrome', publicKey: 'PUB', shortId: '01', spiderX: '/' });
  });
  await t('vless + ws + tls (host, path, alpn)', () => {
    const o = X.linkToOutbound('vless://id@cdn.example.com:443?type=ws&security=tls&path=%2Fws%3Fed%3D2048&host=h.example.com&sni=s.example.com&alpn=h2,http/1.1&fp=firefox#n');
    const s = o.streamSettings;
    assert.strictEqual(s.network, 'ws');
    assert.deepStrictEqual(s.wsSettings, { path: '/ws?ed=2048', headers: { Host: 'h.example.com' } });
    assert.strictEqual(s.tlsSettings.serverName, 's.example.com');
    assert.deepStrictEqual(s.tlsSettings.alpn, ['h2', 'http/1.1']);
    assert.strictEqual(s.tlsSettings.fingerprint, 'firefox');
  });
  await t('vless + grpc', () => {
    const s = X.linkToOutbound('vless://id@g.example.com:443?type=grpc&serviceName=svc&mode=multi&security=tls#n').streamSettings;
    assert.deepStrictEqual(s.grpcSettings, { serviceName: 'svc', multiMode: true });
  });
  await t('trojan: tls по умолчанию, пароль декодируется', () => {
    const o = X.linkToOutbound('trojan://p%40ss@nl2.example.com:8443?sni=nl2.example.com#n');
    assert.deepStrictEqual(o.settings.servers[0], { address: 'nl2.example.com', port: 8443, password: 'p@ss' });
    assert.strictEqual(o.streamSettings.security, 'tls');
    assert.strictEqual(o.streamSettings.tlsSettings.serverName, 'nl2.example.com');
  });
  await t('vmess (ws + tls)', () => {
    const j = { v: '2', ps: 'x', add: 'us3.example.com', port: '443', id: 'uuid-1', aid: '0', scy: 'auto', net: 'ws', type: 'none', host: 'cdn.example.com', path: '/p', tls: 'tls', sni: 'cdn.example.com' };
    const o = X.linkToOutbound('vmess://' + b64(JSON.stringify(j)));
    const u = o.settings.vnext[0];
    assert.deepStrictEqual([o.protocol, u.address, u.port, u.users[0].id, u.users[0].alterId, u.users[0].security], ['vmess', 'us3.example.com', 443, 'uuid-1', 0, 'auto']);
    assert.strictEqual(o.streamSettings.wsSettings.path, '/p');
    assert.strictEqual(o.streamSettings.security, 'tls');
  });
  await t('shadowsocks: SIP002 и старый формат', () => {
    const a = X.linkToOutbound('ss://' + b64('aes-256-gcm:secret') + '@ss1.example.com:8388#n').settings.servers[0];
    assert.deepStrictEqual(a, { address: 'ss1.example.com', port: 8388, method: 'aes-256-gcm', password: 'secret' });
    const b = X.linkToOutbound('ss://' + b64('chacha20-ietf-poly1305:pw@legacy.example.com:9999') + '#n').settings.servers[0];
    assert.deepStrictEqual(b, { address: 'legacy.example.com', port: 9999, method: 'chacha20-ietf-poly1305', password: 'pw' });
    const c = X.linkToOutbound('ss://aes-128-gcm:pw%3A1@plain.example.com:1234#n').settings.servers[0];
    assert.strictEqual(c.password, 'pw:1');
  });
  await t('неподдерживаемый протокол → ошибка', () => assert.throws(() => X.linkToOutbound('hysteria2://x@h:1#n'), /не поддерживается/));

  console.log('Сборка итогового конфига:');
  const link = 'vless://id@de1.example.com:443?security=tls#n';
  await t('inbounds, статистика, маршруты', () => {
    const c = X.buildConfig({ link }, { socksPort: 1081, httpPort: 1082, apiPort: 1083 });
    assert.deepStrictEqual(c.inbounds.map(i => [i.tag, i.port]), [['socks', 1081], ['http', 1082], ['api', 1083]]);
    assert.ok(c.stats && c.api && c.policy.system.statsOutboundDownlink);
    assert.deepStrictEqual(c.routing.rules[0], { type: 'field', inboundTag: ['api'], outboundTag: 'api' });
    assert.deepStrictEqual(c.routing.rules[1], { type: 'field', ip: ['geoip:private'], outboundTag: 'direct' });
    assert.deepStrictEqual(c.outbounds.map(o => o.tag), ['proxy', 'direct', 'block']);
  });
  await t('без API и без обхода LAN (для пинга)', () => {
    const c = X.buildConfig({ link }, { withApi: false, bypassLan: false });
    assert.strictEqual(c.inbounds.length, 2); assert.strictEqual(c.stats, undefined); assert.strictEqual(c.routing.rules.length, 0);
  });
  await t('TLS Fragmentation', () => {
    const c = X.buildConfig({ link }, { fragment: true });
    assert.strictEqual(c.outbounds[0].streamSettings.sockopt.dialerProxy, 'fragment');
    assert.ok(c.outbounds.some(o => o.tag === 'fragment' && o.settings.fragment.packets === 'tlshello'));
  });
  await t('готовый Xray JSON: свои inbounds заменяются, маршруты сохраняются', () => {
    const raw = JSON.stringify({ remarks: 'r', inbounds: [{ port: 1, protocol: 'socks' }], outbounds: [{ tag: 'proxy-1', protocol: 'vless', settings: { vnext: [{ address: 'a.example.com', port: 443, users: [] }] } }], routing: { rules: [{ type: 'field', domain: ['geosite:ads'], outboundTag: 'block' }] } });
    const c = X.buildConfig({ config: raw }, { apiPort: 1083 });
    assert.strictEqual(c.inbounds.length, 3);
    assert.ok(c.routing.rules.some(r => r.domain && r.domain[0] === 'geosite:ads'));
    assert.ok(c.outbounds.some(o => o.tag === 'direct') && c.outbounds.some(o => o.tag === 'block'));
  });
  await t('подсчёт трафика игнорирует служебные outbound', () => {
    const r = X.sumTraffic([{ name: 'outbound>>>proxy>>>traffic>>>uplink', value: '10' }, { name: 'outbound>>>proxy>>>traffic>>>downlink', value: '20' }, { name: 'outbound>>>direct>>>traffic>>>downlink', value: '999' }, { name: 'inbound>>>socks>>>traffic>>>downlink', value: '5' }, { name: 'outbound>>>proxy-2>>>traffic>>>downlink' }]);
    assert.deepStrictEqual(r, { up: 10, down: 20 });
  });
  await t('системный прокси Windows: команды', () => {
    const on = sysproxy.commands(true, '127.0.0.1', 10809).map(c => c[1].join(' ')).join('\n');
    assert.ok(on.includes('ProxyServer /t REG_SZ /d 127.0.0.1:10809') && on.includes('ProxyEnable /t REG_DWORD /d 1'));
    const off = sysproxy.commands(false).map(c => c[1].join(' ')).join('\n');
    assert.ok(off.includes('ProxyEnable /t REG_DWORD /d 0'));
  });

  console.log('Подписки (тестовая панель):');
  const srv = await M.start(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  await t('заглушки → Xray JSON; название, трафик и срок из заголовков', async () => {
    const store = new Store(tmp());
    const r = await sub.importInput(base + '/sub/good', store);
    assert.ok(!r.error, r.error);
    assert.strictEqual(r.servers.length, 2);
    assert.ok(r.servers.every(s => s.config && !s.link));
    assert.strictEqual(r.subscription.name, 'Добрый VPN 😺');
    assert.strictEqual(r.subscription.total, 107374182400);
    assert.strictEqual(r.suspicious, false);
    assert.ok(/формат=xray-json/.test(log.text()));
  });
  await t('если JSON недоступен → base64-список', async () => {
    const r = await sub.importInput(base + '/sub/good?mode=nojson', new Store(tmp()));
    assert.strictEqual(r.servers.length, 3); assert.ok(r.servers.every(s => s.link));
  });
  await t('везде заглушки → suspicious', async () => {
    const r = await sub.importInput(base + '/sub/good?mode=alldecoy', new Store(tmp()));
    assert.ok(r.suspicious && r.servers.length === 3);
  });
  await t('404 и лимит устройств', async () => {
    assert.ok(/HTTP 404/.test((await sub.importInput(base + '/sub/404', new Store(tmp()))).error));
    assert.ok(/лимит устройств/.test((await sub.importInput(base + '/sub/limit', new Store(tmp()))).error));
  });
  await t('сохранение: без дублей, выбранный сервер, перезагрузка из файла', async () => {
    const dir = tmp(); const store = new Store(dir);
    sub.saveResult(await sub.importInput(base + '/sub/good', store), store);
    sub.saveResult(await sub.importInput(base + '/sub/good', store), store);
    assert.strictEqual(store.servers.length, 2);
    assert.strictEqual(store.subs.length, 1);
    assert.ok(store.data.selectedId);
    const again = new Store(dir);
    assert.strictEqual(again.servers.length, 2); assert.strictEqual(again.data.hwid, store.data.hwid);
    assert.strictEqual(await sub.refreshAll(again), 2);
  });
  await t('ссылки вставкой: поддерживаемые и пропущенные', async () => {
    const r = await sub.importInput(M.REAL_LINES.join('\n') + '\nhysteria2://x@h:1#h', new Store(tmp()));
    assert.strictEqual(r.servers.length, 3); assert.strictEqual(r.skipped, 1);
  });
  srv.close();

  console.log(`\nИтог: ${passed} проверок пройдено${process.exitCode ? ', ЕСТЬ ОШИБКИ' : ''}`);
})();
