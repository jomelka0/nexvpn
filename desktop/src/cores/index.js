'use strict';
const fs = require('fs');
const path = require('path');

const CORES = { xray: require('./xray'), singbox: require('./singbox'), mihomo: require('./mihomo') };
const TUN2PROXY = { id: 'tun2proxy', title: 'tun2proxy', envVar: 'NEX_TUN2PROXY', bins: ['tun2proxy-bin'] };

function baseDirs() {
  const base = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..', '..');
  return [base, path.join(base, 'cores'), process.cwd()];
}

function findBinary(core) {
  if (process.env[core.envVar]) return process.env[core.envVar];
  const suffix = process.platform === 'win32' ? '.exe' : '';
  for (const dir of baseDirs()) for (const b of core.bins) {
    const p = path.join(dir, b + suffix);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function available() {
  const r = {};
  for (const c of Object.values(CORES)) r[c.id] = !!findBinary(c);
  r.tun2proxy = !!findBinary(TUN2PROXY);
  return r;
}

const ORDER = ['xray', 'singbox', 'mihomo'];

/** Выбор ядра для сервера. pref — 'auto' или id ядра; если выбранное не подходит, берём подходящее другое. */
function pick(node, pref) {
  const order = pref && pref !== 'auto' && CORES[pref] ? [pref, ...ORDER.filter(x => x !== pref)] : ORDER;
  const missing = [];
  for (const id of order) {
    const c = CORES[id];
    if (!c.supports(node)) continue;
    const bin = findBinary(c);
    if (bin) return { core: c, bin, fellBack: pref && pref !== 'auto' && id !== pref };
    missing.push(c.title);
  }
  const need = missing.length ? missing.join(' или ') : 'sing-box или Mihomo';
  return { error: missing.length
    ? `Для этого сервера (${node.protocol}) нужно ядро ${need}, но файл не найден рядом с Nex.exe.`
    : `Ни одно из ядер не поддерживает этот сервер (${node.protocol}). Обычно нужен ${need}.` };
}

module.exports = { CORES, TUN2PROXY, findBinary, available, pick };
