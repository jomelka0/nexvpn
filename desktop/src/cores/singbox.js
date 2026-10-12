'use strict';
const L = require('../linkmodel');

const TYPES = ['vless', 'vmess', 'trojan', 'ss', 'hysteria2', 'tuic'];
const NETS = ['tcp', 'ws', 'grpc', 'http', 'httpupgrade'];

function tls(m) {
  if (m.security === 'none') return undefined;
  const t = { enabled: true };
  if (m.sni) t.server_name = m.sni;
  if (m.insecure) t.insecure = true;
  if (m.alpn.length) t.alpn = m.alpn;
  if (m.fp) t.utls = { enabled: true, fingerprint: m.fp };
  if (m.security === 'reality') {
    t.reality = { enabled: true, public_key: m.pbk, short_id: m.sid };
    if (!t.utls) t.utls = { enabled: true, fingerprint: 'chrome' };
  }
  return t;
}

function transport(m) {
  if (m.network === 'ws') return { type: 'ws', path: m.path || '/', headers: m.host ? { Host: m.host } : undefined };
  if (m.network === 'grpc') return { type: 'grpc', service_name: m.serviceName };
  if (m.network === 'http') return { type: 'http', host: m.host ? m.host.split(',') : undefined, path: m.path || '/' };
  if (m.network === 'httpupgrade') return { type: 'httpupgrade', host: m.host || undefined, path: m.path || '/' };
  return undefined;
}

function outbound(m) {
  if (!NETS.includes(m.network)) throw new Error(`Транспорт «${m.network}» не поддерживается ядром sing-box`);
  const o = { type: m.type === 'ss' ? 'shadowsocks' : m.type, tag: 'proxy', server: m.server, server_port: m.port };
  if (m.type === 'vless') { o.uuid = m.uuid; if (m.flow) o.flow = m.flow; o.packet_encoding = 'xudp'; }
  else if (m.type === 'vmess') { o.uuid = m.uuid; o.security = m.cipher; o.alter_id = m.alterId; }
  else if (m.type === 'trojan') o.password = m.password;
  else if (m.type === 'ss') { o.method = m.method; o.password = m.password; }
  else if (m.type === 'hysteria2') { o.password = m.password; if (m.obfs) o.obfs = { type: m.obfs, password: m.obfsPassword }; }
  else if (m.type === 'tuic') { o.uuid = m.uuid; o.password = m.password; o.congestion_control = m.congestion; o.udp_relay_mode = m.udpMode; }
  if (['vless', 'vmess', 'trojan'].includes(m.type)) {
    const t = tls(m), tr = transport(m);
    if (t) o.tls = t;
    if (tr) o.transport = tr;
  } else if (['hysteria2', 'tuic'].includes(m.type)) o.tls = tls(Object.assign({}, m, { security: 'tls' }));
  return o;
}

module.exports = {
  id: 'singbox', title: 'sing-box', envVar: 'NEX_SINGBOX', bins: ['sing-box'], nativeTun: true,
  supports(node) {
    if (node.config || !node.link) return false;
    try { const m = L.parse(node.link); if (!TYPES.includes(m.type)) return false; outbound(m); return true; } catch (e) { return false; }
  },
  build(node, o) {
    const inbounds = [{ type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: o.httpPort }];
    const rules = [];
    if (o.tun) {
      inbounds.push({ type: 'tun', tag: 'tun-in', address: ['172.19.0.1/30'], auto_route: true, strict_route: true, stack: 'mixed' });
      rules.push({ protocol: 'dns', action: 'hijack-dns' });
    }
    if (o.bypassLan) rules.push({ ip_is_private: true, outbound: 'direct' });
    const cfg = {
      log: { level: o.withApi ? 'warn' : 'error' },
      inbounds,
      outbounds: [outbound(L.parse(node.link)), { type: 'direct', tag: 'direct' }],
      route: { rules, final: 'proxy', auto_detect_interface: true },
    };
    if (o.withApi) cfg.experimental = { clash_api: { external_controller: `127.0.0.1:${o.apiPort}` } };
    return { text: JSON.stringify(cfg), spec: { ext: '.json', args: f => ['run', '-c', f] }, http: o.httpPort, socks: o.httpPort };
  },
  stats: ctx => require('./clashapi').stats(ctx.apiPort),
};
