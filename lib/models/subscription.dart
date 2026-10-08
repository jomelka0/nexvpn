class Subscription {
  final String url;
  String name;
  int upload;
  int download;
  int total;         // 0 = безлимит / неизвестно
  int expire;        // unix-время в секундах, 0 = бессрочно / неизвестно
  int updatedAt;     // миллисекунды
  int intervalHours; // как часто обновлять автоматически

  Subscription({
    required this.url,
    required this.name,
    this.upload = 0,
    this.download = 0,
    this.total = 0,
    this.expire = 0,
    this.updatedAt = 0,
    this.intervalHours = 12,
  });

  int get used => upload + download;

  bool get needsUpdate =>
      DateTime.now().millisecondsSinceEpoch - updatedAt > intervalHours * 3600 * 1000;

  Map<String, dynamic> toJson() => {
        'url': url,
        'name': name,
        'upload': upload,
        'download': download,
        'total': total,
        'expire': expire,
        'updatedAt': updatedAt,
        'intervalHours': intervalHours,
      };

  factory Subscription.fromJson(Map<String, dynamic> json) => Subscription(
        url: json['url'] ?? '',
        name: json['name'] ?? 'Подписка',
        upload: json['upload'] ?? 0,
        download: json['download'] ?? 0,
        total: json['total'] ?? 0,
        expire: json['expire'] ?? 0,
        updatedAt: json['updatedAt'] ?? 0,
        intervalHours: json['intervalHours'] ?? 12,
      );
}
