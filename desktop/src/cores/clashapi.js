'use strict';
// Статистика sing-box и Mihomo через Clash API: GET /connections → uploadTotal / downloadTotal
const http = require('http');
function stats(apiPort) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port: apiPort, path: '/connections', timeout: 2000 }, res => {
      let b = ''; res.setEncoding('utf8');
      res.on('data', d => { b += d; });
      res.on('end', () => { try { const j = JSON.parse(b); resolve({ up: Number(j.uploadTotal || 0), down: Number(j.downloadTotal || 0) }); } catch (e) { resolve(null); } });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}
module.exports = { stats };
