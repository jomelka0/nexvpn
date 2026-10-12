'use strict';
// Подключение: выбор ядра, запуск, системный прокси или TUN, статистика трафика.
const dns = require('dns');
const net = require('net');
const cores = require('./cores');
const runner = require('./runner');
const sysproxy = require('./sysproxy');
const log = require('./log');

class Vpn {
  constructor(store) {
    this.store = store;
    this.listeners = new Set();
    this.timer = null;
    this.reset();
  }
  reset() {
    this.state = 'DISCONNECTED';
    this.serverId = null;
    this.inst = null;
    this.tun = null;
    this.coreTitle = '';
    this.startedAt = 0;
    this.up = 0; this.down = 0; this.upSpeed = 0; this.downSpeed = 0;
    this.histDown = []; this.histUp = [];
    this.apiPort = 0;
    this.proxyOn = false;
    this.tunOn = false;
    this.core = null;
    this.bin = null;
  }

  status() {
    const s = this.store.settings;
    return {
      state: this.state, serverId: this.serverId, core: this.coreTitle,
      uptime: this.state === 'CONNECTED' ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
      up: this.up, down: this.down, upSpeed: this.upSpeed, downSpeed: this.downSpeed,
      histDown: this.histDown, histUp: this.histUp,
      proxy: { http: s.httpPort, socks: s.socksPort, system: this.proxyOn, tun: this.tunOn },
    };
  }

  emit() {
    const msg = 'data: ' + JSON.stringify(this.status()) + '\n\n';
    for (const res of this.listeners) { try { res.write(msg); } catch (e) { this.listeners.delete(res); } }
  }

  async connect(node) {
    if (this.state === 'CONNECTING') throw new Error('Подключение уже выполняется');
    if (this.inst) await this.disconnect();

    const s = this.store.settings;
    const sel = cores.pick(node, s.core);
    if (sel.error) throw new Error(sel.error);
    if (sel.fellBack) log.add(`Выбранное ядро не подходит для ${node.protocol}, использую ${sel.core.title}`);

    const wantTun = !!s.tun;
    let tunBin = null;
    if (wantTun) {
      if (!runner.isAdmin()) throw new Error('Режим TUN требует прав администратора: закройте Nex и запустите Nex.exe правой кнопкой мыши → «Запуск от имени администратора».');
      if (!sel.core.nativeTun) {
        tunBin = cores.findBinary(cores.TUN2PROXY);
        if (!tunBin) throw new Error(`Для режима TUN с ядром ${sel.core.title} нужен tun2proxy-bin.exe (и wintun.dll) рядом с Nex.exe. Либо выберите ядро sing-box — в нём TUN встроен.`);
      }
    }

    this.state = 'CONNECTING';
    this.serverId = node.id;
    this.coreTitle = sel.core.title;
    this.emit();

    try {
      this.apiPort = await runner.freePort();
      const built = sel.core.build(node, { socksPort: s.socksPort, httpPort: s.httpPort, apiPort: this.apiPort, bypassLan: s.bypassLan, fragment: s.fragment, withApi: true, tun: wantTun && !!sel.core.nativeTun });
      log.add(`Подключение: ${node.name} (${node.protocol} ${node.address}:${node.port}), ядро ${sel.core.title}${wantTun ? ', режим TUN' : ''}`);
      this.inst = new runner.Instance(sel.bin, built.text, this.store.dir, built.spec);
      await this.inst.waitReady(built.http, 8000);
      this.core = sel.core; this.bin = sel.bin;

      if (wantTun) {
        if (tunBin) await this.startTun2proxy(tunBin, node, built.socks);
        this.tunOn = true;
        log.add(sel.core.nativeTun ? 'TUN-адаптер sing-box включён: весь трафик системы идёт через VPN' : 'tun2proxy включён: весь трафик системы идёт через VPN');
      } else if (s.sysProxy) {
        this.proxyOn = await sysproxy.setProxy(true, '127.0.0.1', built.http);
        log.add(this.proxyOn ? `Системный прокси включён: 127.0.0.1:${built.http}` : `Системный прокси не поддерживается на этой ОС. Укажите прокси вручную: 127.0.0.1:${built.http}`);
      }
    } catch (e) {
      log.add('Ошибка подключения: ' + e.message);
      const msg = e.message;
      this.teardownProcesses();
      this.reset();
      this.emit();
      throw new Error(msg);
    }

    this.state = 'CONNECTED';
    this.startedAt = Date.now();
    this.lastStats = null;
    this.timer = setInterval(() => this.tick(), 1000);
    this.emit();
  }

  async startTun2proxy(bin, node, socksPort) {
    let ip = node.address;
    if (!net.isIP(ip)) {
      try { ip = (await dns.promises.lookup(node.address, { family: 4 })).address; } catch (e) { ip = null; }
    }
    // без исключения для адреса самого сервера трафик VPN зациклился бы через TUN — в таком случае не подключаемся
    if (!ip) throw new Error(`Не удалось определить IP-адрес сервера ${node.address} для режима TUN. Проверьте интернет или отключите режим TUN.`);
    const args = ['--setup', '--proxy', `socks5://127.0.0.1:${socksPort}`, '--dns', 'virtual', '--bypass', ip, '--exit-on-fatal-error'];
    log.add('tun2proxy: ' + args.join(' '));
    this.tun = new runner.Instance(bin, '', this.store.dir, { ext: '.txt', args: () => args });
    await new Promise(r => setTimeout(r, 2500));
    if (this.tun.exited) throw new Error('tun2proxy завершился: ' + (this.tun.tail() || 'без сообщения') + ' (нужны права администратора и wintun.dll рядом с Nex.exe)');
  }

  async tick() {
    if (this.state !== 'CONNECTED') return;
    if (this.inst && this.inst.exited) {
      log.add('Ядро неожиданно завершилось: ' + this.inst.tail());
      await this.disconnect();
      return;
    }
    if (this.tun && this.tun.exited) {
      log.add('tun2proxy неожиданно завершился: ' + this.tun.tail());
      await this.disconnect();
      return;
    }
    const st = await this.core.stats({ bin: this.bin, apiPort: this.apiPort });
    if (st) {
      if (this.lastStats) {
        this.upSpeed = Math.max(0, st.up - this.lastStats.up);
        this.downSpeed = Math.max(0, st.down - this.lastStats.down);
      }
      this.lastStats = st;
      this.up = st.up; this.down = st.down;
    }
    this.histDown.push(this.downSpeed); this.histUp.push(this.upSpeed);
    if (this.histDown.length > 40) { this.histDown.shift(); this.histUp.shift(); }
    this.emit();
  }

  teardownProcesses() {
    if (this.tun) { this.tun.stop(); this.tun = null; }   // сначала TUN, чтобы вернуть маршруты
    if (this.inst) { this.inst.stop(); this.inst = null; }
  }

  async disconnect() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.proxyOn) await sysproxy.setProxy(false);
    this.teardownProcesses();
    log.add('Отключено');
    this.reset();
    this.emit();
  }

  /** Синхронная очистка при выходе из программы. */
  shutdownSync() {
    try { if (this.tun) this.tun.proc.kill(); } catch (e) {}
    try { if (this.inst) this.inst.proc.kill(); } catch (e) {}
    if (this.proxyOn) sysproxy.disableSync();
  }
}

module.exports = { Vpn };
