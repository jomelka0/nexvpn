'use strict';
const { execFile } = require('child_process');
const X = require('../xrayconfig');

module.exports = {
  id: 'xray', title: 'Xray', envVar: 'NEX_XRAY', bins: ['xray'],
  supports(node) { return !!node.config || (!!node.link && ['VLESS', 'VMESS', 'TROJAN', 'SS'].includes(node.protocol)); },
  build(node, o) {
    const cfg = X.buildConfig(node, { socksPort: o.socksPort, httpPort: o.httpPort, apiPort: o.apiPort, bypassLan: o.bypassLan, fragment: o.fragment, withApi: o.withApi, logLevel: o.withApi ? 'warning' : 'error' });
    return { text: JSON.stringify(cfg), spec: { ext: '.json', args: f => ['run', '-c', f] }, http: o.httpPort, socks: o.socksPort };
  },
  stats(ctx) {
    return new Promise(resolve => {
      execFile(ctx.bin, ['api', 'statsquery', `--server=127.0.0.1:${ctx.apiPort}`], { timeout: 4000, windowsHide: true }, (err, out) => {
        if (err) return resolve(null);
        try { resolve(X.sumTraffic(JSON.parse(out).stat)); } catch (e) { resolve(null); }
      });
    });
  },
};
