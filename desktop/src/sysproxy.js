'use strict';
// Системный прокси Windows (реестр + уведомление WinINET). На других ОС — только информация.
const { execFile, execFileSync } = require('child_process');
const KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
const OVERRIDE = 'localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.2*;172.30.*;172.31.*;192.168.*;<local>';

const NOTIFY = `$s='[DllImport("wininet.dll")] public static extern bool InternetSetOption(IntPtr h,int o,IntPtr b,int l);';` +
  `$t=Add-Type -MemberDefinition $s -Name W -Namespace N -PassThru;` +
  `$t::InternetSetOption([IntPtr]::Zero,39,[IntPtr]::Zero,0)|Out-Null;` +
  `$t::InternetSetOption([IntPtr]::Zero,37,[IntPtr]::Zero,0)|Out-Null`;

/** Команды для включения/выключения (вынесено для тестов). */
function commands(enable, host, port) {
  const reg = (name, type, value) => ['reg', ['add', KEY, '/v', name, '/t', type, '/d', String(value), '/f']];
  const list = enable
    ? [reg('ProxyServer', 'REG_SZ', `${host}:${port}`), reg('ProxyOverride', 'REG_SZ', OVERRIDE), reg('ProxyEnable', 'REG_DWORD', 1)]
    : [reg('ProxyEnable', 'REG_DWORD', 0)];
  list.push(['powershell', ['-NoProfile', '-NonInteractive', '-Command', NOTIFY]]);
  return list;
}

const supported = () => process.platform === 'win32';

async function setProxy(enable, host, port) {
  if (!supported()) return false;
  for (const [cmd, args] of commands(enable, host, port)) {
    await new Promise(resolve => execFile(cmd, args, { windowsHide: true, timeout: 15000 }, () => resolve()));
  }
  return true;
}

function disableSync() {
  if (!supported()) return;
  for (const [cmd, args] of commands(false)) {
    try { execFileSync(cmd, args, { windowsHide: true, timeout: 15000, stdio: 'ignore' }); } catch (e) {}
  }
}

module.exports = { setProxy, disableSync, commands, supported };
