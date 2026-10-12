#!/usr/bin/env node
'use strict';
// Подставной tun2proxy-bin: проверяет аргументы, пишет их в файл и живёт, пока не убьют.
const fs = require('fs'), os = require('os'), path = require('path');
const a = process.argv.slice(2);
const proxy = a[a.indexOf('--proxy') + 1];
if (!a.includes('--setup') || !/^socks5:\/\/127\.0\.0\.1:\d+$/.test(proxy || '')) { process.stderr.write('bad args: ' + a.join(' ') + '\n'); process.exit(2); }
fs.writeFileSync(path.join(os.tmpdir(), 'fake_tun2proxy_args.json'), JSON.stringify(a));
setInterval(() => {}, 1e6);
process.on('SIGTERM', () => process.exit(0));
