'use strict';
// Эталонная реализация разбора подписок. Dart-версия (lib/core/sub_parser.dart) обязана вести себя так же:
// обе проверяются на одних и тех же фикстурах (test/fixtures).

const SUPPORTED = ['vless', 'vmess', 'trojan', 'ss', 'socks'];
const INFO_HOSTS = ['0.0.0.0', '127.0.0.1', 'localhost'];
const NON_PROXY = ['freedom', 'blackhole', 'dns', 'loopback'];

function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

function decodeB64(s) {
  let t = String(s).replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(t)) throw new Error('b64');
  if (t.length % 4 === 1) throw new Error('b64 len');
  return Buffer.from(t, 'base64').toString('utf8');
}

function redact(s) {
  return String(s)
    .replace(/([a-z0-9]+):\/\/[^@\s\/?#]*@/gi, '$1://***@')
    .replace(/(ss|vmess):\/\/[A-Za-z0-9+\/=_-]{12,}(?=[#\s]|$)/gi, '$1://***');
}

function flat(s, n = 200) { return redact(String(s).replace(/\s+/g, ' ')).slice(0, n); }

function splitUri(line) {
  const i = line.indexOf('://');
  if (i < 0) return null;
  const scheme = line.slice(0, i).toLowerCase();
  let rest = line.slice(i + 3);
  let fragment = '';
  const h = rest.indexOf('#');
  if (h >= 0) { fragment = rest.slice(h + 1); rest = rest.slice(0, h); }
  let end = rest.length;
  for (const ch of ['/', '?']) { const k = rest.indexOf(ch); if (k >= 0 && k < end) end = k; }
  const authority = rest.slice(0, end);
  const at = authority.lastIndexOf('@');
  const userinfo = at >= 0 ? authority.slice(0, at) : '';
  const hostport = at >= 0 ? authority.slice(at + 1) : authority;
  let host = hostport, port = 0;
  if (hostport.startsWith('[')) {
    const r = hostport.indexOf(']');
    if (r > 0) {
      host = hostport.slice(1, r);
      const m = /^:(\d+)$/.exec(hostport.slice(r + 1));
      if (m) port = parseInt(m[1], 10);
    }
  } else {
    const c = hostport.lastIndexOf(':');
    if (c >= 0 && /^\d+$/.test(hostport.slice(c + 1))) {
      host = hostport.slice(0, c);
      port = parseInt(hostport.slice(c + 1), 10);
    }
  }
  return { scheme, userinfo, host, port, fragment: safeDecode(fragment) };
}

function parseLine(line) {
  const scheme = line.split('://')[0].toLowerCase();
  if (!SUPPORTED.includes(scheme)) return { skip: true };
  let name = '', address = '', port = 0;

  if (scheme === 'vmess') {
    const payload = line.slice(8).split('#')[0];
    try {
      const j = JSON.parse(decodeB64(payload));
      address = String(j.add || '');
      port = parseInt(String(j.port), 10) || 0;
      name = String(j.ps || '');
    } catch (e) { return { skip: true }; }
  } else if (scheme === 'ss') {
    const u = splitUri(line);
    if (!u) return { skip: true };
    name = u.fragment;
    if (u.userinfo) { address = u.host; port = u.port; }
    else {
      const body = line.slice(5).split('#')[0].split('?')[0];
      try {
        const d = decodeB64(body);
        const at = d.lastIndexOf('@');
        if (at < 0) return { skip: true };
        const hp = d.slice(at + 1);
        const c = hp.lastIndexOf(':');
        if (c < 0) return { skip: true };
        address = hp.slice(0, c);
        port = parseInt(hp.slice(c + 1), 10) || 0;
      } catch (e) { return { skip: true }; }
    }
  } else {
    const u = splitUri(line);
    if (!u) return { skip: true };
    address = u.host; port = u.port; name = u.fragment;
  }

  if (!address) return { skip: true };
  name = name.trim();
  if (INFO_HOSTS.includes(address)) return { notice: name };
  const protocol = scheme.toUpperCase();
  return { server: { name: name || address, address, port, protocol, link: line, config: '' } };
}

function parseJson(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return null; }
  const list = Array.isArray(data) ? data : [data];
  const servers = [];
  let skipped = 0, singbox = false;
  list.forEach((cfg, i) => {
    if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.outbounds)) { skipped++; return; }
    const proxy = cfg.outbounds.find(o => o && o.protocol && !NON_PROXY.includes(o.protocol));
    if (!proxy) {
      if (cfg.outbounds.some(o => o && o.type)) singbox = true;
      skipped++; return;
    }
    let address = '', port = 0;
    const s = proxy.settings || {};
    if (Array.isArray(s.vnext) && s.vnext[0]) { address = s.vnext[0].address || ''; port = s.vnext[0].port || 0; }
    else if (Array.isArray(s.servers) && s.servers[0]) { address = s.servers[0].address || ''; port = s.servers[0].port || 0; }
    else if (s.address) { address = s.address; port = s.port || 0; }
    const name = String(cfg.remarks || cfg.remark || cfg.ps || proxy.tag || address || ('Config ' + (i + 1))).trim();
    servers.push({ name, address: String(address), port: Number(port) || 0, protocol: String(proxy.protocol).toUpperCase(), link: '', config: JSON.stringify(cfg) });
  });
  return { servers, skipped, singbox, count: list.length };
}

function fromJson(text, out, prefix) {
  const r = parseJson(text);
  if (!r) { out.format = 'unknown'; out.preview = flat(text); return out; }
  out.servers = r.servers;
  out.skipped = r.skipped;
  out.format = (prefix || '') + (r.servers.length === 0 && r.singbox ? 'singbox-json' : 'xray-json');
  out.preview = 'JSON, конфигураций: ' + r.count + (r.servers.length ? '; ' + r.servers.map(s => s.name).join(', ').slice(0, 150) : '');
  return out;
}

function parseSubscriptionBody(raw) {
  let text = String(raw || '').trim();
  const out = { format: 'empty', servers: [], skipped: 0, notices: [], preview: '' };
  if (!text) return out;

  if (text[0] === '[' || text[0] === '{') return fromJson(text, out, '');

  if (!text.includes('://')) {
    let decoded;
    try { decoded = decodeB64(text); } catch (e) { out.format = 'unknown'; out.preview = flat(text); return out; }
    const t = decoded.trim();
    if (t[0] === '[' || t[0] === '{') return fromJson(t, out, 'base64-');
    if (!t.includes('://')) { out.format = 'unknown'; out.preview = flat(text); return out; }
    out.format = 'base64-links';
    text = t;
  } else {
    out.format = 'links';
  }

  out.preview = flat(text);
  const seen = new Set();
  for (const rawLine of text.split(/[\r\n]+/)) {
    const line = rawLine.trim();
    if (!line || !line.includes('://') || seen.has(line)) continue;
    seen.add(line);
    const r = parseLine(line);
    if (r.skip) out.skipped++;
    else if (r.notice !== undefined) { if (r.notice && !out.notices.includes(r.notice)) out.notices.push(r.notice); }
    else out.servers.push(r.server);
  }
  return out;
}

function looksLikeDecoys(servers) {
  if (servers.length < 2) return false;
  return new Set(servers.map(s => s.address + ':' + s.port)).size === 1;
}

function parseUserInfo(raw) {
  const m = {};
  if (!raw) return m;
  for (const part of String(raw).split(';')) {
    const kv = part.split('=');
    if (kv.length !== 2) continue;
    const v = Number(kv[1].trim());
    if (kv[1].trim() !== '' && !Number.isNaN(v)) m[kv[0].trim().toLowerCase()] = Math.trunc(v);
  }
  return m;
}

function decodeProfileTitle(raw) {
  if (!raw || !String(raw).trim()) return null;
  let t = String(raw).trim();
  if (t.toLowerCase().startsWith('base64:')) {
    try { t = decodeB64(t.slice(7)); } catch (e) {}
  } else t = safeDecode(t);
  return t || null;
}

module.exports = { parseSubscriptionBody, looksLikeDecoys, parseUserInfo, decodeProfileTitle, redact, decodeB64 };
