'use strict';
// Преобразование ссылок vless:// vmess:// trojan:// ss:// в конфигурацию Xray.
const { splitUri, decodeB64 } = require('./sub_parser');

const truthy = v => v === '1' || v === 'true' || v === true;
const dec = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };

function parseQuery(link) {
  const noFrag = link.split('#')[0];
  const q = noFrag.indexOf('?');
  const out = {};
  if (q < 0) return out;
  for (const part of noFrag.slice(q + 1).split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    out[dec(i < 0 ? part : part.slice(0, i))] = i < 0 ? '' : dec(part.slice(i + 1));
  }
  return out;
}

function streamFrom(p, def) {
  let network = String(p.type || p.net || 'tcp').toLowerCase();
  if (network === 'h2') network = 'http';
  if (network === 'raw') network = 'tcp';
  if (network === 'splithttp') network = 'xhttp';
  let security = String(p.security || def.security || 'none').toLowerCase();
  if (security === 'xtls') security = 'tls';

  const s = { network, security };
  const host = p.host || '';
  const path = p.path || '/';

  if (network === 'ws') s.wsSettings = { path, headers: host ? { Host: host } : {} };
  else if (network === 'grpc') s.grpcSettings = { serviceName: p.serviceName || (p.path && p.path !== '/' ? p.path : ''), multiMode: p.mode === 'multi' };
  else if (network === 'http') s.httpSettings = { path, host: host ? host.split(',') : [] };
  else if (network === 'httpupgrade') s.httpupgradeSettings = { path, host };
  else if (network === 'xhttp') s.xhttpSettings = { path, host, mode: p.mode || 'auto' };
  else if (network === 'kcp') s.kcpSettings = { header: { type: p.headerType || 'none' }, seed: p.seed || undefined };
  else if (network === 'tcp' && (p.headerType || 'none') === 'http') {
    s.tcpSettings = { header: { type: 'http', request: { path: path.split(','), headers: host ? { Host: host.split(',') } : {} } } };
  }

  if (security === 'tls') {
    s.tlsSettings = {
      serverName: p.sni || p.peer || host || def.serverName,
      fingerprint: p.fp || undefined,
      alpn: p.alpn ? p.alpn.split(',') : undefined,
      allowInsecure: truthy(p.allowInsecure) || truthy(p.insecure) || undefined,
    };
  } else if (security === 'reality') {
    s.realitySettings = {
      serverName: p.sni || def.serverName,
      fingerprint: p.fp || 'chrome',
      publicKey: p.pbk,
      shortId: p.sid || '',
      spiderX: p.spx || '',
    };
  }
  return s;
}

function vless(link) {
  const u = splitUri(link), p = parseQuery(link);
  return {
    tag: 'proxy', protocol: 'vless',
    settings: { vnext: [{ address: u.host, port: u.port, users: [{ id: dec(u.userinfo), encryption: p.encryption || 'none', flow: p.flow || undefined }] }] },
    streamSettings: streamFrom(p, { serverName: u.host, security: 'none' }),
  };
}

function trojan(link) {
  const u = splitUri(link), p = parseQuery(link);
  return {
    tag: 'proxy', protocol: 'trojan',
    settings: { servers: [{ address: u.host, port: u.port, password: dec(u.userinfo) }] },
    streamSettings: streamFrom(p, { serverName: u.host, security: 'tls' }),
  };
}

function vmess(link) {
  const j = JSON.parse(decodeB64(link.slice(8).split('#')[0]));
  const p = {
    type: j.net, host: j.host, path: j.path, headerType: j.type,
    security: j.tls === 'tls' ? 'tls' : 'none', sni: j.sni || j.host, alpn: j.alpn, fp: j.fp,
    serviceName: j.path,
  };
  return {
    tag: 'proxy', protocol: 'vmess',
    settings: { vnext: [{ address: String(j.add), port: Number(j.port), users: [{ id: j.id, alterId: Number(j.aid || 0), security: j.scy || 'auto' }] }] },
    streamSettings: streamFrom(p, { serverName: String(j.add), security: 'none' }),
  };
}

function shadowsocks(link) {
  const u = splitUri(link);
  let method, password, address, port;
  if (u.userinfo) {
    let ui = u.userinfo, d = null;
    try { d = decodeB64(ui); } catch (e) { d = null; }
    ui = d && d.includes(':') ? d : dec(ui);
    const c = ui.indexOf(':');
    method = ui.slice(0, c); password = ui.slice(c + 1);
    address = u.host; port = u.port;
  } else {
    const d = decodeB64(link.slice(5).split('#')[0].split('?')[0]);
    const at = d.lastIndexOf('@');
    const cred = d.slice(0, at), hp = d.slice(at + 1);
    const c = cred.indexOf(':');
    method = cred.slice(0, c); password = cred.slice(c + 1);
    const hc = hp.lastIndexOf(':');
    address = hp.slice(0, hc); port = parseInt(hp.slice(hc + 1), 10);
  }
  return {
    tag: 'proxy', protocol: 'shadowsocks',
    settings: { servers: [{ address, port, method, password }] },
    streamSettings: { network: 'tcp' },
  };
}

function linkToOutbound(link) {
  const scheme = link.split('://')[0].toLowerCase();
  if (scheme === 'vless') return vless(link);
  if (scheme === 'trojan') return trojan(link);
  if (scheme === 'vmess') return vmess(link);
  if (scheme === 'ss') return shadowsocks(link);
  throw new Error('Протокол не поддерживается: ' + scheme);
}

const NON_PROXY = ['freedom', 'blackhole', 'dns', 'loopback'];

function applyFragment(cfg) {
  const outs = cfg.outbounds || [];
  let changed = false;
  for (const o of outs) {
    if (!o || !o.protocol || NON_PROXY.includes(o.protocol)) continue;
    o.streamSettings = o.streamSettings || {};
    o.streamSettings.sockopt = Object.assign({}, o.streamSettings.sockopt, { dialerProxy: 'fragment' });
    changed = true;
  }
  if (changed) outs.push({ tag: 'fragment', protocol: 'freedom', settings: { fragment: { packets: 'tlshello', length: '100-200', interval: '10-20' } } });
  cfg.outbounds = outs;
}

const DEFAULTS = { socksPort: 10808, httpPort: 10809, apiPort: 10085, bypassLan: true, fragment: false, withApi: true, logLevel: 'warning' };

function finish(cfg, o) {
  cfg.log = { loglevel: o.logLevel };
  cfg.inbounds = [
    { tag: 'socks', listen: '127.0.0.1', port: o.socksPort, protocol: 'socks', settings: { auth: 'noauth', udp: true }, sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] } },
    { tag: 'http', listen: '127.0.0.1', port: o.httpPort, protocol: 'http', settings: {} },
  ];
  delete cfg.stats; delete cfg.api;
  const rules = ((cfg.routing && cfg.routing.rules) || []).filter(r => !(r.inboundTag && r.inboundTag.includes('api')));
  if (o.withApi) {
    cfg.inbounds.push({ tag: 'api', listen: '127.0.0.1', port: o.apiPort, protocol: 'dokodemo-door', settings: { address: '127.0.0.1' } });
    cfg.stats = {};
    cfg.api = { tag: 'api', services: ['StatsService'] };
    cfg.policy = Object.assign({}, cfg.policy, { system: Object.assign({}, cfg.policy && cfg.policy.system, { statsOutboundUplink: true, statsOutboundDownlink: true }) });
    rules.unshift({ type: 'field', inboundTag: ['api'], outboundTag: 'api' });
  }
  if (!cfg.outbounds.some(x => x.tag === 'direct')) cfg.outbounds.push({ tag: 'direct', protocol: 'freedom' });
  if (!cfg.outbounds.some(x => x.tag === 'block')) cfg.outbounds.push({ tag: 'block', protocol: 'blackhole' });
  if (o.bypassLan) rules.splice(o.withApi ? 1 : 0, 0, { type: 'field', ip: ['geoip:private'], outboundTag: 'direct' });
  cfg.routing = Object.assign({ domainStrategy: 'IPIfNonMatch' }, cfg.routing, { rules });
  if (o.fragment) applyFragment(cfg);
  return cfg;
}

/** node = { link } или { config } (готовый Xray JSON из подписки). */
function buildConfig(node, opts) {
  const o = Object.assign({}, DEFAULTS, opts);
  let cfg;
  if (node.config) cfg = JSON.parse(node.config);
  else cfg = { outbounds: [linkToOutbound(node.link)] };
  return finish(cfg, o);
}

// Сумма трафика по исходящим, кроме служебных
const SERVICE_TAGS = ['direct', 'block', 'api', 'fragment', 'dns-out'];
function sumTraffic(statList) {
  let up = 0, down = 0;
  for (const s of statList || []) {
    const m = /^outbound>>>([^>]+)>>>traffic>>>(uplink|downlink)$/.exec(s.name || '');
    if (!m || SERVICE_TAGS.includes(m[1])) continue;
    const v = Number(s.value || 0);
    if (m[2] === 'uplink') up += v; else down += v;
  }
  return { up, down };
}

module.exports = { linkToOutbound, buildConfig, sumTraffic, parseQuery, DEFAULTS };
