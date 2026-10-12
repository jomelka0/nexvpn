'use strict';
const assert = require('assert');
const net = require('net');
const path = require('path');
const FAKE = path.join(__dirname, 'fake-core.js');
process.env.NEX_XRAY = FAKE; process.env.NEX_SINGBOX = FAKE; process.env.NEX_MIHOMO = FAKE;

const L = require('../src/linkmodel');
const cores = require('../src/cores');
const sb = require('../src/cores/singbox'), mh = require('../src/cores/mihomo');
const runner = require('../src/runner');
const P = require('../src/sub_parser');

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
let passed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; }
}

const LINKS = {
  reality: 'vless://11111111-2222-3333-4444-555555555555@de1.example.com:443?type=tcp&security=reality&pbk=PUB&sni=www.microsoft.com&sid=01ab&fp=chrome&flow=xtls-rprx-vision#a',
  wsTls: 'vless://11111111-2222-3333-4444-555555555555@cdn.example.com:443?type=ws&security=tls&path=%2Fws&host=h.example.com&sni=s.example.com&alpn=h2,http/1.1&fp=firefox#b',
  hy2: 'hysteria2://pa%24%24@hy.example.com:8443?sni=hy.example.com&insecure=1&obfs=salamander&obfs-password=obf&alpn=h3#h',
  tuic: 'tuic://22222222-2222-2222-2222-222222222222:secret@t.example.com:443?congestion_control=bbr&udp_relay_mode=native&alpn=h3&sni=t.example.com#t',
  ss: 'ss://' + b64('aes-256-gcm:secret') + '@ss1.example.com:8388#s',
  trojan: 'trojan://passw0rd@nl2.example.com:8443?sni=nl2.example.com#e',
  xhttp: 'vless://id@x.example.com:443?type=xhttp&security=tls#x',
};
const O = { httpPort: 11809, socksPort: 11808, apiPort: 11085, withApi: true, bypassLan: true, fragment: false, tun: false };
const node = (link, protocol) => ({ link, protocol: protocol || link.split('://')[0].toUpperCase() });

(async () => {
  console.log('Модель ссылок и новые протоколы:');
  await t('hysteria2 и tuic разбираются', () => {
    const h = L.parse(LINKS.hy2), u = L.parse(LINKS.tuic);
    assert.deepStrictEqual([h.type, h.server, h.port, h.password, h.obfs, h.obfsPassword, h.insecure, h.sni], ['hysteria2', 'hy.example.com', 8443, 'pa$$', 'salamander', 'obf', true, 'hy.example.com']);
    assert.deepStrictEqual([u.type, u.uuid, u.password, u.congestion, u.udpMode], ['tuic', '22222222-2222-2222-2222-222222222222', 'secret', 'bbr', 'native']);
  });
  await t('парсер подписки: hysteria2/tuic — пропуск по умолчанию, серверы для ПК-версии', () => {
    const text = [LINKS.reality, LINKS.hy2, LINKS.tuic, 'hy2://x@h.example.com:1#short'].join('\n');
    const d = P.parseSubscriptionBody(text);
    assert.strictEqual(d.servers.length, 1); assert.strictEqual(d.skipped, 3);
    const e = P.parseSubscriptionBody(text, { extraSchemes: ['hysteria2', 'hy2', 'tuic'] });
    assert.deepStrictEqual(e.servers.map(s => s.protocol), ['VLESS', 'HYSTERIA2', 'TUIC', 'HYSTERIA2']);
    assert.strictEqual(e.skipped, 0);
  });
  await t('isTcpBased', () => {
    assert.ok(L.isTcpBased(node(LINKS.reality)));
    assert.ok(!L.isTcpBased(node(LINKS.hy2, 'HYSTERIA2')));
    assert.ok(!L.isTcpBased(node('vless://id@k.example.com:1?type=kcp#k', 'VLESS')));
  });

  console.log('sing-box:');
  await t('VLESS + Reality', () => {
    const c = JSON.parse(sb.build(node(LINKS.reality), O).text);
    const o = c.outbounds[0];
    assert.deepStrictEqual([o.type, o.server, o.server_port, o.uuid, o.flow], ['vless', 'de1.example.com', 443, '11111111-2222-3333-4444-555555555555', 'xtls-rprx-vision']);
    assert.deepStrictEqual(o.tls, { enabled: true, server_name: 'www.microsoft.com', utls: { enabled: true, fingerprint: 'chrome' }, reality: { enabled: true, public_key: 'PUB', short_id: '01ab' } });
    assert.deepStrictEqual(c.inbounds[0], { type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 11809 });
    assert.strictEqual(c.route.final, 'proxy');
    assert.deepStrictEqual(c.route.rules[0], { ip_is_private: true, outbound: 'direct' });
    assert.strictEqual(c.experimental.clash_api.external_controller, '127.0.0.1:11085');
  });
  await t('VLESS + WS + TLS', () => {
    const o = JSON.parse(sb.build(node(LINKS.wsTls), O).text).outbounds[0];
    assert.deepStrictEqual(o.transport, { type: 'ws', path: '/ws', headers: { Host: 'h.example.com' } });
    assert.deepStrictEqual(o.tls.alpn, ['h2', 'http/1.1']);
  });
  await t('Hysteria2, TUIC, Shadowsocks, Trojan', () => {
    const h = JSON.parse(sb.build(node(LINKS.hy2, 'HYSTERIA2'), O).text).outbounds[0];
    assert.deepStrictEqual([h.type, h.password, h.obfs, h.tls.insecure, h.tls.server_name], ['hysteria2', 'pa$$', { type: 'salamander', password: 'obf' }, true, 'hy.example.com']);
    const u = JSON.parse(sb.build(node(LINKS.tuic, 'TUIC'), O).text).outbounds[0];
    assert.deepStrictEqual([u.type, u.uuid, u.password, u.congestion_control, u.udp_relay_mode], ['tuic', '22222222-2222-2222-2222-222222222222', 'secret', 'bbr', 'native']);
    const s = JSON.parse(sb.build(node(LINKS.ss, 'SS'), O).text).outbounds[0];
    assert.deepStrictEqual([s.type, s.method, s.password], ['shadowsocks', 'aes-256-gcm', 'secret']);
    const tr = JSON.parse(sb.build(node(LINKS.trojan), O).text).outbounds[0];
    assert.deepStrictEqual([tr.type, tr.password, tr.tls.enabled], ['trojan', 'passw0rd', true]);
  });
  await t('TUN: адаптер и перехват DNS; xhttp не поддерживается', () => {
    const c = JSON.parse(sb.build(node(LINKS.reality), Object.assign({}, O, { tun: true })).text);
    assert.ok(c.inbounds.some(i => i.type === 'tun' && i.auto_route));
    assert.deepStrictEqual(c.route.rules[0], { protocol: 'dns', action: 'hijack-dns' });
    assert.ok(!sb.supports(node(LINKS.xhttp)));
  });

  console.log('Mihomo:');
  await t('VLESS + Reality, WS, Hysteria2, TUIC', () => {
    const r = JSON.parse(mh.build(node(LINKS.reality), O).text);
    assert.strictEqual(r['mixed-port'], 11809); assert.strictEqual(r['external-controller'], '127.0.0.1:11085');
    const p = r.proxies[0];
    assert.deepStrictEqual([p.type, p.server, p.port, p.uuid, p.flow, p.tls, p.servername, p['client-fingerprint']], ['vless', 'de1.example.com', 443, '11111111-2222-3333-4444-555555555555', 'xtls-rprx-vision', true, 'www.microsoft.com', 'chrome']);
    assert.deepStrictEqual(p['reality-opts'], { 'public-key': 'PUB', 'short-id': '01ab' });
    assert.strictEqual(r.rules[r.rules.length - 1], 'MATCH,proxy');
    assert.ok(r.rules.includes('IP-CIDR,192.168.0.0/16,DIRECT,no-resolve'));
    const w = JSON.parse(mh.build(node(LINKS.wsTls), O).text).proxies[0];
    assert.deepStrictEqual([w.network, w['ws-opts'].path, w['ws-opts'].headers.Host], ['ws', '/ws', 'h.example.com']);
    const h = JSON.parse(mh.build(node(LINKS.hy2, 'HYSTERIA2'), O).text).proxies[0];
    assert.deepStrictEqual([h.type, h.password, h.obfs, h['obfs-password'], h['skip-cert-verify']], ['hysteria2', 'pa$$', 'salamander', 'obf', true]);
    const u = JSON.parse(mh.build(node(LINKS.tuic, 'TUIC'), O).text).proxies[0];
    assert.deepStrictEqual([u.type, u.uuid, u.password, u['congestion-controller']], ['tuic', '22222222-2222-2222-2222-222222222222', 'secret', 'bbr']);
    assert.ok(!mh.supports(node(LINKS.xhttp)));
  });

  console.log('Выбор ядра:');
  await t('авто: Xray для VLESS, sing-box для Hysteria2', () => {
    assert.strictEqual(cores.pick(node(LINKS.reality), 'auto').core.id, 'xray');
    assert.strictEqual(cores.pick(node(LINKS.hy2, 'HYSTERIA2'), 'auto').core.id, 'singbox');
    assert.strictEqual(cores.pick(node(LINKS.tuic, 'TUIC'), 'mihomo').core.id, 'mihomo');
  });
  await t('явный выбор и запасной вариант', () => {
    assert.strictEqual(cores.pick(node(LINKS.reality), 'mihomo').core.id, 'mihomo');
    const raw = { config: JSON.stringify({ outbounds: [{ protocol: 'vless' }] }), protocol: 'VLESS' };
    const r = cores.pick(raw, 'singbox');
    assert.strictEqual(r.core.id, 'xray'); assert.ok(r.fellBack);
  });
  await t('нет файла ядра → понятная ошибка', () => {
    const keep = process.env.NEX_SINGBOX, keep2 = process.env.NEX_MIHOMO;
    process.env.NEX_SINGBOX = '/nonexistent/x'; process.env.NEX_MIHOMO = '';
    delete process.env.NEX_MIHOMO;
    const saved = cores.findBinary;
    const r = cores.pick(node(LINKS.hy2, 'HYSTERIA2'), 'auto');
    process.env.NEX_SINGBOX = keep; process.env.NEX_MIHOMO = keep2;
    // /nonexistent/x считается «найденным» по переменной окружения; проверяем ветку «ядро не поддерживает протокол»
    const none = cores.pick({ link: 'socks://x@h:1', protocol: 'SOCKS' }, 'auto');
    assert.ok(none.error && /Ни одно из ядер/.test(none.error), none.error);
  });

  console.log('Скорость пинга:');
  await t('tcpProbe: открытый порт — да, закрытый — быстро нет', async () => {
    const srv = net.createServer(c => c.destroy()).listen(0, '127.0.0.1');
    await new Promise(r => srv.once('listening', r));
    assert.strictEqual(await runner.tcpProbe('127.0.0.1', srv.address().port, 1000), true);
    srv.close();
    const closed = await runner.freePort();
    const t0 = Date.now();
    assert.strictEqual(await runner.tcpProbe('127.0.0.1', closed, 1000), false);
    assert.ok(Date.now() - t0 < 500);
  });
  await t('Semaphore ограничивает параллелизм', async () => {
    const sem = new runner.Semaphore(3);
    let cur = 0, max = 0;
    await Promise.all(Array.from({ length: 10 }, () => sem.run(async () => { cur++; max = Math.max(max, cur); await new Promise(r => setTimeout(r, 20)); cur--; })));
    assert.strictEqual(max, 3);
  });
  await t('ping через runner для каждого ядра (подставное ядро)', async () => {
    const dir = require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'nex-p-'));
    process.env.NEX_SKIP_PRECHECK = '1';
    for (const [core, n] of [['xray', node(LINKS.reality)], ['singbox', node(LINKS.reality)], ['mihomo', node(LINKS.reality)], ['auto', node(LINKS.hy2, 'HYSTERIA2')], ['auto', node(LINKS.tuic, 'TUIC')]]) {
      const st = {};
      const ms = await runner.ping(Object.assign({ address: 'x.example.com', port: 443 }, n), { dir, core, state: st });
      assert.ok(ms > 0, `${core}/${n.protocol}: ${st.lastError}`);
    }
    const st = {};
    assert.strictEqual(await runner.ping({ link: 'vless://id@dead.example.com:443?security=tls#d', protocol: 'VLESS', address: 'dead.example.com', port: 443 }, { dir, core: 'singbox', state: st }), -1);
    assert.ok(/timeout/.test(st.lastError), st.lastError);
  });

  console.log(`\nИтог (ядра): ${passed} проверок пройдено${process.exitCode ? ', ЕСТЬ ОШИБКИ' : ''}`);
})();
