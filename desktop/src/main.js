#!/usr/bin/env node
'use strict';
const { spawn } = require('child_process');
const { createApp } = require('./server');
const sysproxy = require('./sysproxy');

function openWindow(url) {
  if (process.env.NEX_NO_OPEN) return;
  const run = (cmd, args, opts, onFail) => {
    const p = spawn(cmd, args, Object.assign({ detached: true, stdio: 'ignore', windowsHide: true }, opts));
    p.on('error', () => onFail && onFail());
    p.on('close', code => { if (code && onFail) onFail(); });
    p.unref();
  };
  if (process.platform === 'win32') {
    // окно в стиле приложения (Edge есть в Windows 10/11); запасной вариант — браузер по умолчанию
    const verbatim = { windowsVerbatimArguments: true };
    run('cmd', ['/c', `start "" msedge --app=${url} --window-size=470,900`], verbatim,
      () => run('cmd', ['/c', `start "" ${url}`], verbatim));
  } else if (process.platform === 'darwin') run('open', [url], {});
  else run('xdg-open', [url], {});
}

async function main() {
  const preferred = Number(process.env.NEX_PORT) || 17890;
  const app = createApp();
  let port;
  try { port = await app.listen(preferred); }
  catch (e) { port = await app.listen(0); }
  const url = `http://127.0.0.1:${port}/`;
  console.log(`Nex запущен: ${url}`);
  console.log('Окно закроется само при выходе из программы (кнопка «Выход» в настройках). Не закрывайте это окно, пока VPN включён.');
  openWindow(url);

  const bye = () => { app.vpn.shutdownSync(); sysproxy.disableSync && app.vpn.proxyOn && sysproxy.disableSync(); process.exit(0); };
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);
  process.on('exit', () => app.vpn.shutdownSync());
}

main().catch(e => { console.error(e); process.exit(1); });
