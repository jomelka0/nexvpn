'use strict';
const L = require('../linkmodel');

const TYPES = ['vless', 'vmess', 'trojan', 'ss', 'hysteria2', 'tuic'];
const NETS = ['tcp', 'ws', 'grpc', 'http', 'httpupgrade'];
const LAN = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16'];

function proxy(m) {
  if (!NETS.includes(m.network)) throw new Error(`Транспорт «${m.network}» не поддерживается ядром Mihomo`);
  const p = { name: 'proxy', type: m.type, server: m.server, port: m.port, udp: true };
  if (m.type === 'vless') { p.uuid = m.uuid; if (m.flow) p.flow = m.flow; p['packet-encoding'] = 'xudp'; }
  else if (m.type === 'vmess') { p.uuid = m.uuid; p.alterId = m.alterId; p.cipher = m.cipher; }
  else if (m.type === 'trojan') p.password = m.password;
  else if (m.type === 'ss') { p.cipher = m.method; p.password = m.password; }
  else if (m.type === 'hysteria2') {
    p.password = m.password;
    if (m.obfs) { p.obfs = m.obfs; p['obfs-password'] = m.obfsPassword; }
    if (m.sni) p.sni = m.sni;
    if (m.insecure) p['skip-cert-verify'] = true;
    if (m.alpn.length) p.alpn = m.alpn;
    return p;
  } else if (m.type === 'tuic') {
    p.uuid = m.uuid; p.password = m.password; p['congestion-controller'] = m.congestion; p['udp-relay-mode'] = m.udpMode; p.alpn = m.alpn;
    if (m.sni) p.sni = m.sni;
    if (m.insecure) p['skip-cert-verify'] = true;
    return p;
  }
  if (m.type === 'ss') return p;
  if (m.security !== 'none') {
    p.tls = true;
    if (m.sni) p[m.type === 'trojan' ? 'sni' : 'servername'] = m.sni;
    if (m.fp) p['client-fingerprint'] = m.fp;
    if (m.alpn.length) p.alpn = m.alpn;
    if (m.insecure) p['skip-cert-verify'] = true;
    if (m.security === 'reality') {
      p['reality-opts'] = { 'public-key': m.pbk, 'short-id': m.sid };
      if (!p['client-fingerprint']) p['client-fingerprint'] = 'chrome';
    }
  }
  if (m.network === 'ws') { p.network = 'ws'; p['ws-opts'] = { path: m.path || '/', headers: m.host ? { Host: m.host } : undefined }; }
  else if (m.network === 'httpupgrade') { p.network = 'ws'; p['ws-opts'] = { path: m.path || '/', headers: m.host ? { Host: m.host } : undefined, 'v2ray-http-upgrade': true }; }
  else if (m.network === 'grpc') { p.network = 'grpc'; p['grpc-opts'] = { 'grpc-service-name': m.serviceName }; }
  else if (m.network === 'http') { p.network = 'h2'; p['h2-opts'] = { host: m.host ? m.host.split(',') : undefined, path: m.path || '/' }; }
  return p;
}

module.exports = {
  id: 'mihomo', title: 'Mihomo', envVar: 'NEX_MIHOMO', bins: ['mihomo'],
  supports(node) {
    if (node.config || !node.link) return false;
    try { const m = L.parse(node.link); if (!TYPES.includes(m.type)) return false; proxy(m); return true; } catch (e) { return false; }
  },
  build(node, o) {
    const rules = [];
    if (o.bypassLan) for (const c of LAN) rules.push(`IP-CIDR,${c},DIRECT,no-resolve`);
    rules.push('MATCH,proxy');
    const cfg = { 'mixed-port': o.httpPort, 'allow-lan': false, mode: 'rule', 'log-level': o.withApi ? 'warning' : 'error', ipv6: false, proxies: [proxy(L.parse(node.link))], rules };
    if (o.withApi) cfg['external-controller'] = `127.0.0.1:${o.apiPort}`;
    // JSON — корректный YAML, Mihomo читает такой файл без изменений
    return { text: JSON.stringify(cfg), spec: { ext: '.yaml', workdir: true, args: (f, wd) => ['-d', wd, '-f', f] }, http: o.httpPort, socks: o.httpPort };
  },
  stats: ctx => require('./clashapi').stats(ctx.apiPort),
};
