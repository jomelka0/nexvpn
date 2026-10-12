'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = {
  power: '<svg viewBox="0 0 24 24"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  timer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
  split: '<svg viewBox="0 0 24 24"><path d="M6 3v6a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v4M6 21v-2M18 3v2"/></svg>',
  lan: '<svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M5 16v-4h14v4"/></svg>',
  bug: '<svg viewBox="0 0 24 24"><rect x="7" y="8" width="10" height="13" rx="5"/><path d="M9 8a3 3 0 0 1 6 0M3 13h4M17 13h4M4 6l3 2M20 6l-3 2M4 20l3-2M20 20l-3-2"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  exit: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
};
const MUTED = '#8b949e';

let S = { servers: [], subs: [], settings: {}, status: { state: 'DISCONNECTED' }, selectedId: null };
const ui = { filter: null, pinging: new Set(), busyId: null, animate: true };

async function api(path, body) {
  const opt = { headers: { 'x-nex-token': window.NEX_TOKEN } };
  if (body !== undefined) { opt.method = 'POST'; opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(path, opt);
  return r.json();
}

function toast(msg, ms = 3200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return b; return c; };
function fmtBytes(n) {
  n = Math.max(0, Math.round(n));
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}
const fmtTime = s => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':');
const fmtDate = ms => { const d = new Date(ms), t = n => String(n).padStart(2, '0'); return `${t(d.getDate())}.${t(d.getMonth() + 1)} ${t(d.getHours())}:${t(d.getMinutes())}`; };

const visible = () => ui.filter ? S.servers.filter(s => s.source === ui.filter) : S.servers;
const currentSub = () => ui.filter ? S.subs.find(s => s.url === ui.filter) : (S.subs.length === 1 ? S.subs[0] : null);
const connected = () => S.status.state === 'CONNECTED';
const protoColor = p => { p = p.toUpperCase(); return p.startsWith('VLESS') ? '#58a6ff' : p.startsWith('VMESS') ? '#a371f7' : p.startsWith('TROJAN') ? '#f0883e' : p.startsWith('SS') ? '#3fb950' : '#8b949e'; };

// ---------- отрисовка ----------
function renderHeader() {
  const n = visible().length, st = S.status.state;
  const word = st === 'CONNECTING' ? 'подключение…' : st === 'CONNECTED' ? 'подключено' : 'не подключено';
  const el = $('#subtitle');
  el.textContent = `${n} ${plural(n, 'сервер', 'сервера', 'серверов')} • ${word}`;
  el.classList.toggle('on', st === 'CONNECTED');
}

function renderSubbar() {
  const sub = currentSub(), parts = [];
  if (sub) {
    if (sub.total > 0) parts.push(`${fmtBytes(sub.upload + sub.download)} из ${fmtBytes(sub.total)}`);
    else if (sub.upload + sub.download > 0) parts.push('использовано ' + fmtBytes(sub.upload + sub.download));
    if (sub.expire > 0) { const left = Math.floor((sub.expire * 1000 - Date.now()) / 864e5); parts.push(left < 0 ? 'срок истёк' : 'осталось дней: ' + left); }
    if (sub.updatedAt) parts.push('обновлено ' + fmtDate(sub.updatedAt));
  }
  const title = sub ? sub.name : (S.subs.length ? `Все подписки (${S.subs.length})` : 'Добавьте подписку');
  $('#subbar').innerHTML = `${ICON.link}<div class="t"><div class="n">${esc(title)}</div>${parts.length ? `<div class="i">${esc(parts.join(' • '))}</div>` : ''}</div><button class="ib" id="bMenu" title="Меню">${ICON.edit}</button>`;
  $('#bMenu').onclick = e => { e.stopPropagation(); toggleMenu(sub); };
}

function toggleMenu(sub) {
  const old = $('.menu'); if (old) { old.remove(); return; }
  const m = document.createElement('div'); m.className = 'menu';
  m.innerHTML = '<button data-a="add">Добавить подписку</button>' + (sub ? '<button data-a="update">Обновить</button><button data-a="copy">Копировать ссылку</button><button data-a="del">Удалить подписку</button>' : '');
  m.onclick = async e => {
    const a = e.target.dataset.a; if (!a) return; m.remove();
    if (a === 'add') openSheet();
    else if (a === 'update') await refresh();
    else if (a === 'copy') { await copyText(sub.url); toast('Ссылка скопирована'); }
    else if (a === 'del' && confirm('Удалить подписку «' + sub.name + '» и все её серверы?')) { await api('/api/sub/delete', { url: sub.url }); ui.filter = null; await load(true); }
  };
  $('#subbar').appendChild(m);
}
document.addEventListener('click', () => { const m = $('.menu'); if (m) m.remove(); });

function renderChips() {
  const el = $('#chips');
  if (S.subs.length < 2) { el.innerHTML = ''; return; }
  el.innerHTML = `<button class="chip ${ui.filter ? '' : 'on'}" data-u="">Все</button>` + S.subs.map(s => `<button class="chip ${ui.filter === s.url ? 'on' : ''}" data-u="${esc(s.url)}">${esc(s.name)}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('.chip'); if (!b) return; ui.filter = b.dataset.u || null; ui.animate = true; render(); };
}

function pillHtml(s) {
  if (ui.pinging.has(s.id)) return '<span class="spin"></span>';
  return s.ping == null ? '--- ms' : s.ping < 0 ? 'Timeout' : s.ping + ' ms';
}
const pillClass = s => s.ping == null ? 'none' : s.ping < 0 ? 'bad' : s.ping < 300 ? 'ok' : 'mid';

function renderList() {
  const list = visible(), el = $('#list');
  if (!list.length) {
    el.innerHTML = `<div class="empty">${S.subs.length ? 'В этой подписке нет серверов.<br>Обновите её или откройте Настройки → Диагностика.' : 'Подписок пока нет.<br>Нажмите на строку выше и вставьте ссылку подписки — все серверы загрузятся сразу.'}</div>`;
    return;
  }
  const conId = connected() ? S.status.serverId : null;
  el.innerHTML = list.map((s, i) => {
    const c = protoColor(s.protocol), isCon = conId === s.id, isBusy = ui.busyId === s.id || (S.status.state === 'CONNECTING' && S.status.serverId === s.id);
    return `<div class="card ${s.id === S.selectedId ? 'sel' : ''} ${isCon ? 'con' : ''} ${ui.animate ? 'enter' : ''}" style="animation-delay:${Math.min(i, 8) * 50}ms" data-id="${esc(s.id)}">
      <div class="badge" style="color:${c};background:${c}24">${esc(s.protocol)}</div>
      <div class="info"><div class="n">${esc(s.name)}</div><div class="a">${esc(s.address)}:${s.port}</div></div>
      <button class="pill ${pillClass(s)}" data-act="ping">${pillHtml(s)}</button>
      <button class="pw ${isCon ? 'on' : ''}" data-act="power">${isBusy ? '<span class="spin"></span>' : ICON.power}</button></div>`;
  }).join('');
  ui.animate = false;
}

function render() { renderHeader(); renderSubbar(); renderChips(); renderList(); renderStats(); }

// ---------- панель подключения ----------
let statsBuilt = false;
function renderStats() {
  const box = $('#stats'), st = S.status;
  if (!connected()) { box.classList.remove('show'); statsBuilt = false; return; }
  const srv = S.servers.find(s => s.id === st.serverId);
  if (!statsBuilt) {
    box.innerHTML = `<div class="panel-in"><div class="sh"><span class="dot"></span><span class="nm" id="stName"></span><button id="bDisc">${ICON.power} Отключить</button></div>
      <div class="timer">${ICON.timer}<span id="stTime">00:00:00</span></div>
      <div class="tiles"><div class="tile"><div class="l">↓ Загрузка</div><div class="v" id="stDown">0 B/s</div></div><div class="tile"><div class="l">↑ Отдача</div><div class="v" id="stUp">0 B/s</div></div><div class="tile"><div class="l">Всего</div><div class="v" id="stTotal">0 B</div></div></div>
      <canvas id="stChart"></canvas>
      <div class="foot"><span id="stRx">Получено: 0 B</span><span id="stTx">Отправлено: 0 B</span></div></div>`;
    $('#bDisc').onclick = () => disconnect();
    statsBuilt = true;
    requestAnimationFrame(() => box.classList.add('show'));
  }
  $('#stName').textContent = (srv ? srv.name : '') + (st.core ? '  ·  ' + st.core + (st.proxy && st.proxy.tun ? ' · TUN' : '') : '');
  $('#stTime').textContent = fmtTime(st.uptime || 0);
  $('#stDown').textContent = fmtBytes(st.downSpeed) + '/s';
  $('#stUp').textContent = fmtBytes(st.upSpeed) + '/s';
  $('#stTotal').textContent = fmtBytes(st.down + st.up);
  $('#stRx').textContent = 'Получено: ' + fmtBytes(st.down);
  $('#stTx').textContent = 'Отправлено: ' + fmtBytes(st.up);
  drawChart(st.histDown || [], st.histUp || []);
}

function drawChart(down, up) {
  const cv = $('#stChart'); if (!cv) return;
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const max = Math.max(1, ...down, ...up);
  g.strokeStyle = '#30363d'; g.beginPath(); g.moveTo(0, h - 1); g.lineTo(w, h - 1); g.stroke();
  const line = (data, color, fill) => {
    if (data.length < 2) return;
    g.beginPath();
    data.forEach((v, i) => { const x = i / (data.length - 1) * w, y = h - 3 - v / max * (h - 8); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    if (fill) { const p = new Path2D(); g.save(); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, color + '59'); gr.addColorStop(1, color + '00'); g.fillStyle = gr; g.fill(); g.restore(); g.beginPath(); data.forEach((v, i) => { const x = i / (data.length - 1) * w, y = h - 3 - v / max * (h - 8); i ? g.lineTo(x, y) : g.moveTo(x, y); }); }
    g.strokeStyle = color; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
  };
  line(down, '#3fb950', true); line(up, '#a371f7', false);
}

// ---------- действия ----------
async function load(animate) {
  S = await api('/api/state');
  if (animate) ui.animate = true;
  render();
}

async function connectTo(id) {
  if (ui.busyId) return;
  ui.busyId = id; renderList();
  const r = await api('/api/connect', { id });
  ui.busyId = null;
  if (!r.ok) toast(r.error || 'Не удалось подключиться', 6000);
  await load(); 
}
async function disconnect() { await api('/api/disconnect', {}); await load(); }

function updatePill(id) {
  const s = S.servers.find(x => x.id === id), el = document.querySelector(`.card[data-id="${CSS.escape(id)}"] .pill`);
  if (!s || !el) return;
  el.className = 'pill ' + pillClass(s);
  el.innerHTML = pillHtml(s);
}
async function pingOne(id) {
  if (ui.pinging.has(id)) return;
  ui.pinging.add(id); updatePill(id);
  const r = await api('/api/ping', { id });
  ui.pinging.delete(id);
  const s = S.servers.find(x => x.id === id); if (s) s.ping = r.ping;
  updatePill(id);
  return r;
}
async function pingAll() {
  const ids = visible().map(s => s.id);
  let i = 0, firstErr = null, okCount = 0;
  const worker = async () => {
    while (i < ids.length) {
      const r = await pingOne(ids[i++]);
      if (r && r.ping >= 0) okCount++; else if (r && !firstErr) firstErr = r.error;
    }
  };
  await Promise.all(Array.from({ length: Math.min(10, ids.length) }, worker));
  if (ids.length && !okCount && firstErr) toast('Ни один сервер не ответил: ' + firstErr, 6000);
}

async function refresh() {
  toast('Обновляю подписки…');
  const r = await api('/api/refresh', {});
  toast(r.ok ? r.message : r.error, 4500);
  await load(true);
}

function copyText(t) {
  if (navigator.clipboard && window.isSecureContext !== false) return navigator.clipboard.writeText(t).catch(() => fallbackCopy(t));
  return Promise.resolve(fallbackCopy(t));
}
function fallbackCopy(t) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); }

// ---------- окно добавления ----------
function openSheet() { $('#err').classList.remove('show'); $('#overlay').classList.add('show'); $('#sheet').classList.add('show'); setTimeout(() => $('#inp').focus(), 200); }
function closeSheet() { $('#overlay').classList.remove('show'); $('#sheet').classList.remove('show'); }
async function doImport() {
  const text = $('#inp').value.trim(); if (!text) return;
  const b = $('#bImport'); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
  const r = await api('/api/import', { input: text });
  b.disabled = false; b.textContent = 'Импортировать';
  if (!r.ok) { const e = $('#err'); e.textContent = r.error; e.classList.add('show'); return; }
  closeSheet(); $('#inp').value = ''; toast(r.message, 6000); await load(true);
}

// ---------- настройки ----------
function setRow(key, icon, title, desc) {
  return `<div class="set ${S.settings[key] ? 'on' : ''}" data-key="${key}"><div class="ic">${icon}</div><div class="tx"><div class="tt">${title}</div><div class="ds">${desc}</div></div><div class="sw"></div></div>`;
}
async function openSettings() {
  const lg = await api('/api/log');
  const st = S.settings;
  const cs = S.cores || {};
  const seg = (id, label) => `<button class="seg ${st.core === id ? 'on' : ''}" data-core="${id}">${label}${id !== 'auto' && !cs[id] ? ' ⚠' : ''}</button>`;
  $('#setBody').innerHTML =
    `<div class="tt" style="margin:2px 2px 8px;font-weight:800;font-size:16px">Ядро</div>
     <div class="segs">${seg('auto', 'Авто')}${seg('xray', 'Xray')}${seg('singbox', 'sing-box')}${seg('mihomo', 'Mihomo')}</div>
     <div class="note">Авто: Xray, а для Hysteria2 и TUIC — sing-box или Mihomo. ⚠ — файл ядра не найден рядом с Nex.exe.</div>` +
    setRow('tun', ICON.shield, 'Режим TUN (весь трафик системы)', 'Экспериментально. Нужны права администратора' + (S.isAdmin ? ' (сейчас есть).' : ' — сейчас их нет, запустите Nex от имени администратора.') + ' Системный прокси при этом не используется.') +
    setRow('sysProxy', ICON.shield, 'Системный прокси', 'При подключении направлять трафик Windows через Nex.') +
    setRow('bypassLan', ICON.lan, 'Bypass LAN', 'Локальные адреса (принтеры, NAS) — напрямую, без VPN.') +
    setRow('fragment', ICON.split, 'TLS Fragmentation', 'Дробить ClientHello для обхода DPI.') +
    `<div class="row"><label>HTTP-порт<input id="pHttp" type="number" value="${st.httpPort}"></label><label>SOCKS-порт<input id="pSocks" type="number" value="${st.socksPort}"></label></div>
     <div class="note">Изменения применяются при следующем подключении. Прокси для ручной настройки: 127.0.0.1:${st.httpPort} (HTTP), 127.0.0.1:${st.socksPort} (SOCKS5).</div>
     <div class="tt" style="margin:6px 2px 8px;font-weight:800;font-size:16px">${ICON.bug.replace('<svg', '<svg style="vertical-align:-4px;margin-right:6px"')}Диагностика</div>
     <div class="note">Nex ${esc(lg.version)} • устройство ${esc(lg.hwid)}… • ссылки в журнале маскируются (пароли и UUID не показываются).</div>
     <button class="btn" id="bCheck">Проверить подписки и собрать отчёт</button>
     <pre class="log" id="logBox">${esc(lg.text || 'Журнал пуст.')}</pre>
     <button class="btn" id="bCopyLog">${ICON.copy.replace('<svg', '<svg style="width:18px;height:18px"')} Копировать отчёт</button>
     <button class="btn" id="bClearLog">Очистить журнал</button>
     <button class="btn danger" id="bQuit">${ICON.exit.replace('<svg', '<svg style="width:18px;height:18px"')} Выход (отключить VPN и закрыть Nex)</button>`;
  $('#settings').classList.add('show');
  $('#setBody').onclick = async e => {
    const sg = e.target.closest('.seg');
    if (sg) { S.settings.core = sg.dataset.core; document.querySelectorAll('.seg').forEach(x => x.classList.toggle('on', x === sg)); await api('/api/settings', { core: sg.dataset.core }); return; }
    const row = e.target.closest('.set');
    if (row) { const k = row.dataset.key; const v = !S.settings[k]; S.settings[k] = v; row.classList.toggle('on', v); await api('/api/settings', { [k]: v }); }
  };
  const ports = async () => { const r = await api('/api/settings', { httpPort: +$('#pHttp').value, socksPort: +$('#pSocks').value }); S.settings = r.settings; };
  $('#pHttp').onchange = ports; $('#pSocks').onchange = ports;
  $('#bCheck').onclick = async () => { $('#bCheck').disabled = true; await api('/api/refresh', {}); const l = await api('/api/log'); $('#logBox').textContent = l.text; $('#bCheck').disabled = false; await load(true); };
  $('#bCopyLog').onclick = async () => { const l = await api('/api/log'); await copyText(`Nex ${l.version} • устройство ${l.hwid}…\nПодписок: ${S.subs.length}, серверов: ${S.servers.length}\n\n${l.text}`); toast('Отчёт скопирован'); };
  $('#bClearLog').onclick = async () => { await api('/api/log/clear', {}); $('#logBox').textContent = 'Журнал пуст.'; };
  $('#bQuit').onclick = async () => { if (confirm('Отключить VPN и закрыть Nex?')) { await api('/api/quit', {}); document.body.innerHTML = '<div class="empty" style="padding-top:40vh">Nex закрыт. Окно можно закрыть.</div>'; } };
}

// ---------- события ----------
$('#list').addEventListener('click', e => {
  const card = e.target.closest('.card'); if (!card) return;
  const id = card.dataset.id, act = (e.target.closest('[data-act]') || {}).dataset;
  if (act && act.act === 'ping') return pingOne(id).then(r => { if (r && r.ping < 0 && r.error) toast('Пинг не прошёл: ' + r.error, 5000); });
  if (act && act.act === 'power') return (connected() && S.status.serverId === id) ? disconnect() : connectTo(id);
  S.selectedId = id; api('/api/select', { id }); renderList();
});
$('#list').addEventListener('contextmenu', async e => {
  const card = e.target.closest('.card'); if (!card) return; e.preventDefault();
  const s = S.servers.find(x => x.id === card.dataset.id);
  if (s && confirm('Удалить сервер «' + s.name + '»?')) { await api('/api/server/delete', { id: s.id }); await load(); }
});
$('#subbar').addEventListener('click', e => { if (!e.target.closest('#bMenu') && !e.target.closest('.menu')) openSheet(); });
$('#overlay').onclick = closeSheet;
$('#bImport').onclick = doImport;
$('#bPaste').onclick = async () => { try { $('#inp').value = (await navigator.clipboard.readText()).trim(); } catch (e) { toast('Вставьте вручную: Ctrl+V'); $('#inp').focus(); } };
$('#bRefresh').onclick = refresh;
$('#bPing').onclick = pingAll;
$('#bSettings').onclick = openSettings;
$('#bBack').onclick = () => { $('#settings').classList.remove('show'); load(); };
document.querySelectorAll('.ib[data-anim]').forEach(b => b.addEventListener('click', () => {
  const c = 'anim-' + b.dataset.anim; b.classList.remove(c); void b.offsetWidth; b.classList.add(c);
}));
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSheet(); $('#settings').classList.remove('show'); } });

(async () => {
  await load(true);
  const es = new EventSource('/api/events?token=' + window.NEX_TOKEN);
  es.onmessage = e => {
    const was = S.status.state, wasId = S.status.serverId;
    S.status = JSON.parse(e.data);
    if (was !== S.status.state || wasId !== S.status.serverId) { renderHeader(); renderList(); }
    renderStats();
  };
})();
