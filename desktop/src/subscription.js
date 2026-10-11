'use strict';
// Загрузка подписок: перебор User-Agent, заголовки устройства (HWID), защита от заглушек панели.
const os = require('os');
const P = require('./sub_parser');
const log = require('./log');

const USER_AGENTS = ['v2rayNG/1.9.19', 'Happ/2.5.1', 'v2rayN/7.0', 'Streisand/1.0', 'Nex/1.1'];

const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(16); };

function deviceHeaders(store) {
  return {
    'x-hwid': store.data.hwid,
    'x-device-os': process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
    'x-ver-os': os.release(),
    'x-device-model': 'PC',
  };
}

async function download(url, ua, headers) {
  const res = await fetch(url, { headers: Object.assign({ 'user-agent': ua }, headers), signal: AbortSignal.timeout(20000), redirect: 'follow' });
  if (res.status !== 200) throw new Error('HTTP ' + res.status);
  const body = await res.text();
  const h = n => res.headers.get(n);
  const interval = parseInt(h('profile-update-interval') || '', 10);
  return {
    body,
    info: P.parseUserInfo(h('subscription-userinfo')),
    title: P.decodeProfileTitle(h('profile-title')),
    intervalHours: Number.isFinite(interval) ? interval : null,
    hwidLimit: (h('x-hwid-limit') || '').toLowerCase() === 'true',
    hwidNotSupported: (h('x-hwid-not-supported') || '').toLowerCase() === 'true',
  };
}

function toNodes(list, source) {
  return list.map((s, i) => ({
    id: s.link ? `${hash(source)}_${hash(s.link)}` : `${hash(source)}_c${i}_${hash(s.name)}`,
    name: s.name, address: s.address, port: s.port, protocol: s.protocol,
    link: s.link, config: s.config, source, ping: null,
  }));
}

function explainEmpty(o) {
  if (o.notices.length) return 'Сервер подписки ответил: ' + o.notices.join(' ');
  if (o.format === 'singbox-json') return 'Подписка в формате sing-box — он не поддерживается.';
  if (o.format === 'unknown') return 'Не удалось распознать ответ сервера: «' + o.preview + '»';
  if (o.format === 'empty') return 'Сервер вернул пустой ответ.';
  return 'Не найдено поддерживаемых серверов (vless, vmess, trojan, ss).';
}

async function importInput(input, store) {
  const text = String(input || '').trim();
  if (/^https?:\/\//i.test(text)) return importUrl(text, store);
  const o = P.parseSubscriptionBody(text);
  log.add(`Импорт из текста: формат=${o.format}, серверов=${o.servers.length}, пропущено=${o.skipped}`);
  if (!o.servers.length) return { servers: [], skipped: o.skipped, error: explainEmpty(o), source: '' };
  return { servers: toNodes(o.servers, ''), skipped: o.skipped, error: null, source: '' };
}

async function importUrl(url, store) {
  const device = deviceHeaders(store);
  log.add('Загрузка подписки ' + log.redactUrl(url));
  let bestDecoy = null, first = null, firstError = null;

  for (const ua of USER_AGENTS) {
    let f;
    try { f = await download(url, ua, device); }
    catch (e) { log.add(`  [${ua}] ошибка: ${e.message}`); if (!firstError) firstError = e.message; continue; }
    const o = P.parseSubscriptionBody(f.body);
    const decoy = P.looksLikeDecoys(o.servers);
    log.add(`  [${ua}] ${f.body.length} байт, формат=${o.format}, серверов=${o.servers.length}, одинаковый адрес у всех=${decoy ? 'да' : 'нет'}, сообщений панели=${o.notices.length}, пропущено=${o.skipped}`);
    log.add('     ' + o.preview);
    if (f.hwidLimit) log.add('     панель: достигнут лимит устройств (x-hwid-limit)');
    if (f.hwidNotSupported) log.add('     панель: HWID не принят (x-hwid-not-supported)');
    const attempt = { f, o, ua };
    if (!first) first = attempt;
    if (o.servers.length && !decoy) return success(url, attempt, false);
    if (o.servers.length && !bestDecoy) bestDecoy = attempt;
  }

  if (bestDecoy) {
    log.add(`Настоящих серверов не найдено, использую ответ ${bestDecoy.ua} (похоже на заглушки)`);
    return success(url, bestDecoy, true);
  }
  if (first) {
    let msg = explainEmpty(first.o);
    if (first.f.hwidLimit) msg = 'Достигнут лимит устройств для этой подписки. Удалите старое устройство в личном кабинете сервиса и повторите.\n' + msg;
    else if (first.f.hwidNotSupported) msg = 'Сервис требует идентификатор устройства (HWID), но не принял его.\n' + msg;
    return { servers: [], skipped: first.o.skipped, error: msg, source: url };
  }
  let msg = 'Не удалось загрузить подписку: ' + (firstError || 'нет ответа');
  if ((firstError || '').includes('404')) msg += '\nСсылка неверна, либо сервис требует идентификатор устройства.';
  return { servers: [], skipped: 0, error: msg, source: url };
}

function success(url, a, suspicious) {
  let hours = a.f.intervalHours || 12;
  if (hours < 1) hours = 12;
  const sub = {
    url, name: a.f.title || safeHost(url),
    upload: a.f.info.upload || 0, download: a.f.info.download || 0, total: a.f.info.total || 0, expire: a.f.info.expire || 0,
    updatedAt: Date.now(), intervalHours: hours,
  };
  log.add(`Принят ответ ${a.ua}: серверов ${a.o.servers.length}${suspicious ? ' (подозрительный)' : ''}`);
  return { servers: toNodes(a.o.servers, url), skipped: a.o.skipped, error: null, source: url, subscription: sub, suspicious };
}

const safeHost = url => { try { return new URL(url).host; } catch (e) { return url; } };

/** Сохраняет результат в хранилище, возвращает сообщение для пользователя. */
function saveResult(res, store) {
  const d = store.data;
  if (res.source) {
    d.servers = d.servers.filter(s => s.source !== res.source);
    if (res.subscription) {
      const i = d.subs.findIndex(s => s.url === res.source);
      if (i >= 0) d.subs[i] = res.subscription; else d.subs.push(res.subscription);
    }
  }
  const known = new Set(d.servers.map(s => s.id));
  const fresh = res.servers.filter(s => !known.has(s.id));
  d.servers.push(...fresh);
  if (!d.selectedId || !d.servers.some(s => s.id === d.selectedId)) d.selectedId = d.servers.length ? d.servers[0].id : null;
  store.save();
  let msg = `Добавлено серверов: ${fresh.length}`;
  if (res.skipped > 0) msg += ` (пропущено, не поддерживается: ${res.skipped})`;
  if (res.suspicious) msg += '\nВсе серверы указывают на один адрес — похоже на заглушки провайдера. Подробности: Настройки → Диагностика.';
  return msg;
}

async function refreshAll(store) {
  let count = 0;
  for (const sub of [...store.data.subs]) {
    const res = await importUrl(sub.url, store);
    if (res.servers.length) { saveResult(res, store); count += res.servers.length; }
    else log.add('Итог: ' + res.error);
  }
  return count;
}

module.exports = { importInput, saveResult, refreshAll, USER_AGENTS };
