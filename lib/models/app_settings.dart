class AppSettings {
  bool killSwitch;
  bool tlsFragmentation;
  bool perAppRouting;
  bool bypassLan;
  List<String> selectedApps; // пакеты, трафик которых идёт через VPN (при perAppRouting)

  AppSettings({
    this.killSwitch = true,
    this.tlsFragmentation = false,
    this.perAppRouting = false,
    this.bypassLan = true,
    List<String>? selectedApps,
  }) : selectedApps = selectedApps ?? [];

  Map<String, dynamic> toJson() => {
        'killSwitch': killSwitch,
        'tlsFragmentation': tlsFragmentation,
        'perAppRouting': perAppRouting,
        'bypassLan': bypassLan,
        'selectedApps': selectedApps,
      };

  factory AppSettings.fromJson(Map<String, dynamic> json) {
    return AppSettings(
      killSwitch: json['killSwitch'] ?? true,
      tlsFragmentation: json['tlsFragmentation'] ?? false,
      perAppRouting: json['perAppRouting'] ?? false,
      bypassLan: json['bypassLan'] ?? true,
      selectedApps: List<String>.from(json['selectedApps'] ?? const []),
    );
  }
}
