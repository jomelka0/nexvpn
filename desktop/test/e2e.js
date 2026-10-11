'use strict';
// Сквозная проверка: тестовая панель подписок + подставной Xray + настоящий браузер (Chromium).
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
process.env.NEX_XRAY = path.join(__dirname, 'fake-xray.js');
process.env.NEX_PING_TIMEOUT = '1200';

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { try { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); } catch (e2) { console.log('Playwright не найден — e2e пропущен'); process.exit(0); } }

const { createApp } = require('../src/server');
const { Store } = require('../src/store');
const M = require('../../tools/ref/mock_server');
const shots = process.env.NEX_SHOTS || path.join(os.tmpdir(), 'nex_shots');
fs.mkdirSync(shots, { recursive: true });

let step = 0;
const ok = name => console.log('  ok  ' + name);

(async () => {
  const provider = await M.start(0);
  const base = 'http://127.0.0.1:' + provider.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nex-e2e-'));
  const app = createApp({ store: new Store(dir), onQuit: () => {} });
  const port = await app.listen(0);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 480, height: 900 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async n => page.screenshot({ path: path.join(shots, `${String(++step).padStart(2, '0')}_${n}.png`) });

  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector('#subbar');
    assert.ok((await page.textContent('#list')).includes('Подписок пока нет'));
    assert.ok((await page.textContent('#subtitle')).includes('0 серверов • не подключено'));
    await shot('empty'); ok('пустой экран');

    // импорт подписки через окно
    await page.click('#subbar');
    await page.waitForSelector('#sheet.show');
    await page.fill('#inp', base + '/sub/good');
    await shot('add_sheet');
    await page.click('#bImport');
    await page.waitForSelector('.card');
    assert.strictEqual(await page.locator('.card').count(), 2);
    assert.ok((await page.textContent('#subbar')).includes('Добрый VPN'));
    assert.ok((await page.textContent('#subbar')).includes('из 100.00 GB'));
    ok('импорт подписки: 2 сервера, название и трафик');

    // ещё один сервер вручную: «мёртвый»
    await page.click('#subbar');
    await page.waitForSelector('#sheet.show');
    await page.fill('#inp', 'vless://id@dead.example.com:443?security=tls&sni=dead.example.com#%F0%9F%92%80%20Dead%20node');
    await page.click('#bImport');
    await page.waitForFunction(() => document.querySelectorAll('.card').length === 3);
    await page.waitForTimeout(700);
    await shot('list');
    ok('добавлена ссылка вручную (3 сервера)');

    // пинг через (подставной) Xray
    await page.click('#bPing');
    await page.waitForFunction(() => document.querySelectorAll('.pill.ok').length === 2 && document.querySelectorAll('.pill.bad').length === 1, null, { timeout: 20000 });
    const pills = await page.locator('.pill').allTextContents();
    assert.ok(pills.filter(t => /^\d+ ms$/.test(t)).length === 2 && pills.includes('Timeout'), pills.join(','));
    await shot('ping'); ok('пинг: 2 ответа и один Timeout');

    // подключение
    await page.locator('.card').first().locator('.pw').click();
    await page.waitForSelector('#stats.show', { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('.card.con'));
    assert.ok((await page.textContent('#subtitle')).includes('подключено'));
    await page.waitForFunction(() => document.querySelector('#stTime') && document.querySelector('#stTime').textContent !== '00:00:00', null, { timeout: 10000 });
    await page.waitForFunction(() => /MB|KB/.test(document.querySelector('#stTotal').textContent) && !/^0 B/.test(document.querySelector('#stDown').textContent), null, { timeout: 10000 });
    await page.waitForTimeout(3000);
    await shot('connected');
    const t = await page.textContent('#stTime'), dn = await page.textContent('#stDown');
    ok(`подключено: время ${t}, скорость ${dn}`);

    // переключение на другой сервер (кнопка питания второй карточки)
    await page.locator('.card').nth(1).locator('.pw').click();
    await page.waitForFunction(() => { const c = document.querySelectorAll('.card'); return c[1].classList.contains('con') && !c[0].classList.contains('con'); }, null, { timeout: 15000 });
    ok('переключение между серверами');

    // отключение
    await page.click('#bDisc');
    await page.waitForFunction(() => !document.querySelector('.card.con') && !document.querySelector('#stats.show'), null, { timeout: 10000 });
    assert.ok((await page.textContent('#subtitle')).includes('не подключено'));
    ok('отключение');

    // настройки и диагностика
    await page.click('#bSettings');
    await page.waitForSelector('#settings.show');
    await page.click('.set[data-key="fragment"]');
    await page.waitForTimeout(400);
    assert.strictEqual((await (await ctx.request.get(`http://127.0.0.1:${port}/api/state?token=${app.token}`)).json()).settings.fragment, true);
    const logText = await page.textContent('#logBox');
    assert.ok(logText.includes('Загрузка подписки') && logText.includes('формат=xray-json'));
    await page.waitForTimeout(500);
    await shot('settings'); ok('настройки сохраняются; журнал содержит разбор подписки');
    await page.click('#bBack');

    // подключение с включённой фрагментацией: конфиг проходит проверку «Xray»
    await page.locator('.card').first().locator('.pw').click();
    await page.waitForSelector('#stats.show', { timeout: 15000 });
    await page.click('#bDisc');
    ok('подключение с TLS Fragmentation');

    // защита локального API
    const bad = await ctx.request.post(`http://127.0.0.1:${port}/api/disconnect`, { data: {} });
    assert.strictEqual(bad.status(), 403);
    const rebinding = await ctx.request.get(`http://127.0.0.1:${port}/`, { headers: { host: 'evil.example.com' } });
    assert.strictEqual(rebinding.status(), 403);
    ok('API закрыт без токена и при чужом Host');

    assert.deepStrictEqual(errors, [], 'ошибки в консоли браузера: ' + errors.join(' | '));
    ok('в консоли браузера нет ошибок');
    console.log(`\nE2E: все проверки пройдены. Скриншоты: ${shots}`);
  } catch (e) {
    await shot('FAIL').catch(() => {});
    console.log('  FAIL ' + (e && e.stack || e));
    process.exitCode = 1;
  } finally {
    await browser.close();
    app.close(); provider.close();
    setTimeout(() => process.exit(process.exitCode || 0), 200);
  }
})();
