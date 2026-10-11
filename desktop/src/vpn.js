'use strict';
// Подключение: запуск Xray, системный прокси, статистика трафика.
const { buildConfig } = require('./xrayconfig');
const xray = require('./xray');
const sysproxy = require('./sysproxy');
const log = require('./log');

class Vpn {
  constructor(store) {
    this.store = store;
    this.listeners = new Set();
    this.reset();
    this.timer = null;
  }
  reset() {
    this.state = 'DISCONNECTED';
    this.serverId = null;
    this.inst = null;
    this.startedAt = 0;
    this.up = 0; this.down = 0; this.upSpeed = 0; this.downSpeed = 0;
    this.histDown = []; this.histUp = [];
    this.apiPort = 0;
    this.proxyOn = false;
  }

  status() {
    return {
      state: this.state, serverId: this.serverId,
      uptime: this.state === 'CONNECTED' ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
      up: this.up, down: this.down, upSpeed: this.upSpeed, downSpeed: this.downSpeed,
      histDown: this.histDown, histUp: this.histUp,
      proxy: { http: this.store.settings.httpPort, socks: this.store.settings.socksPort, system: this.proxyOn },
    };
  }

  emit() {
    const msg = 'data: ' + JSON.stringify(this.status()) + '\n\n';
    for (const res of this.listeners) { try { res.write(msg); } catch (e) { this.listeners.delete(res); } }
  }

  async connect(node) {
    if (this.state === 'CONNECTING') throw new Error('Подключение уже выполняется');
    if (this.inst) await this.disconnect();
    const bin = xray.findBinary();
    if (!bin) throw new Error('Не найден xray.exe рядом с программой. Распакуйте архив Nex-Windows.zip целиком.');

    const s = this.store.settings;
    this.state = 'CONNECTING';
    this.serverId = node.id;
    this.emit();

    try {
      this.apiPort = await xray.freePort();
      const cfg = buildConfig(node, { socksPort: s.socksPort, httpPort: s.httpPort, apiPort: this.apiPort, bypassLan: s.bypassLan, fragment: s.fragment });
      log.add(`Подключение: ${node.name} (${node.protocol} ${node.address}:${node.port}), источник=${node.config ? 'готовый JSON' : 'ссылка'}`);
      this.inst = new xray.Instance(bin, cfg, this.store.dir);
      await this.inst.waitReady(s.httpPort, 8000);
      if (s.sysProxy) {
        this.proxyOn = await sysproxy.setProxy(true, '127.0.0.1', s.httpPort);
        log.add(this.proxyOn ? `Системный прокси включён: 127.0.0.1:${s.httpPort}` : `Системный прокси не поддерживается на этой ОС. Укажите прокси вручную: 127.0.0.1:${s.httpPort} (HTTP) или :${s.socksPort} (SOCKS5)`);
      }
    } catch (e) {
      log.add('Ошибка подключения: ' + e.message);
      if (this.inst) this.inst.stop();
      const msg = e.message;
      this.reset();
      this.emit();
      throw new Error(msg);
    }

    this.state = 'CONNECTED';
    this.startedAt = Date.now();
    this.lastStats = null;
    this.timer = setInterval(() => this.tick(bin), 1000);
    this.emit();
  }

  async tick(bin) {
    if (this.state !== 'CONNECTED') return;
    if (this.inst && this.inst.exited) {
      log.add('Xray неожиданно завершился: ' + this.inst.stderr.trim().split('\n').slice(-2).join(' | '));
      await this.disconnect();
      return;
    }
    const st = await xray.queryStats(bin, this.apiPort);
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

  async disconnect() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.proxyOn) await sysproxy.setProxy(false);
    if (this.inst) this.inst.stop();
    log.add('Отключено');
    this.reset();
    this.emit();
  }

  /** Синхронная очистка при выходе из программы. */
  shutdownSync() {
    try { if (this.inst) this.inst.proc.kill(); } catch (e) {}
    if (this.proxyOn) sysproxy.disableSync();
  }
}

module.exports = { Vpn };
