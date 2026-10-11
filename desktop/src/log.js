'use strict';
// Журнал диагностики (в памяти). Секреты сюда не пишем: ссылки маскируются в parser.redact.
const lines = [];
function add(msg) {
  const t = new Date();
  const two = n => String(n).padStart(2, '0');
  lines.push(`[${two(t.getHours())}:${two(t.getMinutes())}:${two(t.getSeconds())}] ${msg}`);
  if (lines.length > 500) lines.shift();
}
const text = () => lines.join('\n');
const clear = () => { lines.length = 0; };
const redactUrl = url => { try { const u = new URL(url); return `${u.protocol}//${u.host}/…`; } catch (e) { return '***'; } };
module.exports = { add, text, clear, redactUrl };
