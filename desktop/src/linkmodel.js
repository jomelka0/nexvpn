'use strict';
// Единое описание ссылки vless:// vmess:// trojan:// ss:// hysteria2:// tuic:// — из него строятся конфиги sing-box и Mihomo.
const { splitUri, decodeB64 } = require('./sub_parser');
const { parseQuery } = require('./xrayconfig');

const dec = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
const truthy = v => v === '1' || v === 'true' || v === true;
const split = v => (v ? String(v).split(',').filter(Boolean) : []);
const normNet = n => { n = String(n || 'tcp').toLowerCase(); return n === 'h2' ? 'http' : n === 'raw' ? 'tcp' : n === 'splithttp' ? 'xhttp' : n; };

function parse(link) {
  const scheme = link.split('://')[0].toLowerCase();
  if (scheme === 'vmess') {
    const j = JSON.parse(decodeB64(link.slice(8).split('#')[0]));
    return {
      type: 'vmess', server: String(j.add), port: Number(j.port), uuid: j.id, alterId: Number(j.aid || 0), cipher: j.scy || 'auto',
      network: normNet(j.net), host: j.host || '', path: j.path || '/', serviceName: j.path || '', headerType: j.type || 'none', grpcMulti: false,
      security: j.tls === 'tls' ? 'tls' : 'none', sni: j.sni || j.host || '', alpn: split(j.alpn), fp: j.fp || '', insecure: false, pbk: '', sid: '', spx: '', flow: '',
    };
  }
  const u = splitUri(link), p = parseQuery(link);
  const base = {
    server: u.host, port: u.port, name: u.fragment,
    network: normNet(p.type || p.net), host: p.host || '', path: p.path || '/', serviceName: p.serviceName || '', grpcMulti: p.mode === 'multi', headerType: p.headerType || 'none',
    security: String(p.security || 'none').toLowerCase(), sni: p.sni || p.peer || '', alpn: split(p.alpn), fp: p.fp || '',
    insecure: truthy(p.allowInsecure) || truthy(p.insecure) || truthy(p.allow_insecure), pbk: p.pbk || '', sid: p.sid || '', spx: p.spx || '', flow: p.flow || '',
  };
  if (scheme === 'vless') return Object.assign(base, { type: 'vless', uuid: dec(u.userinfo) });
  if (scheme === 'trojan') return Object.assign(base, { type: 'trojan', password: dec(u.userinfo), security: p.security ? base.security : 'tls' });
  if (scheme === 'hysteria2' || scheme === 'hy2') {
    return Object.assign(base, { type: 'hysteria2', password: dec(u.userinfo), security: 'tls', network: 'tcp', obfs: p.obfs || '', obfsPassword: p['obfs-password'] || '' });
  }
  if (scheme === 'tuic') {
    const ui = dec(u.userinfo), c = ui.indexOf(':');
    return Object.assign(base, { type: 'tuic', uuid: c < 0 ? ui : ui.slice(0, c), password: c < 0 ? '' : ui.slice(c + 1), security: 'tls', network: 'tcp',
      congestion: p.congestion_control || 'bbr', udpMode: p.udp_relay_mode || 'native', alpn: split(p.alpn || 'h3') });
  }
  if (scheme === 'ss') {
    let method, password, server, port;
    if (u.userinfo) {
      let ui = u.userinfo, d = null;
      try { d = decodeB64(ui); } catch (e) { d = null; }
      ui = d && d.includes(':') ? d : dec(ui);
      const c = ui.indexOf(':'); method = ui.slice(0, c); password = ui.slice(c + 1); server = u.host; port = u.port;
    } else {
      const d = decodeB64(link.slice(5).split('#')[0].split('?')[0]);
      const at = d.lastIndexOf('@'), cred = d.slice(0, at), hp = d.slice(at + 1), c = cred.indexOf(':'), hc = hp.lastIndexOf(':');
      method = cred.slice(0, c); password = cred.slice(c + 1); server = hp.slice(0, hc); port = parseInt(hp.slice(hc + 1), 10);
    }
    return Object.assign(base, { type: 'ss', method, password, server, port, security: 'none', network: 'tcp' });
  }
  throw new Error('Протокол не поддерживается: ' + scheme);
}

/** Работает ли сервер по TCP (для быстрой проверки доступности). QUIC/UDP-протоколы пропускают её. */
function isTcpBased(node) {
  if (['HYSTERIA2', 'TUIC'].includes(node.protocol)) return false;
  try {
    if (node.config) {
      const o = JSON.parse(node.config).outbounds.find(x => x && x.protocol && !['freedom', 'blackhole', 'dns', 'loopback'].includes(x.protocol));
      const net = o && o.streamSettings && o.streamSettings.network;
      return !['kcp', 'quic'].includes(net);
    }
    return !['kcp', 'quic'].includes(parse(node.link).network);
  } catch (e) { return true; }
}

module.exports = { parse, isTcpBased };
