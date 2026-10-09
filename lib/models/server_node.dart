class ServerNode {
  final String id;
  final String name;
  final String address;
  final int port;
  final String protocol;
  final String link;   // полная ссылка vless:// vmess:// trojan:// ss:// (пусто, если есть config)
  final String config; // готовый Xray JSON из подписки (пусто, если есть link)
  final String source; // URL подписки, из которой пришёл сервер ('' = добавлен вручную)
  int? ping;           // null = не проверялся, -1 = недоступен

  ServerNode({
    required this.id,
    required this.name,
    required this.address,
    required this.port,
    required this.protocol,
    this.link = '',
    this.config = '',
    this.source = '',
    this.ping,
  });

  factory ServerNode.fromJson(Map<String, dynamic> json) {
    return ServerNode(
      id: json['id'] ?? DateTime.now().microsecondsSinceEpoch.toString(),
      name: json['name'] ?? 'Unnamed Server',
      address: json['address'] ?? '',
      port: json['port'] ?? 443,
      protocol: json['protocol'] ?? 'VLESS',
      link: json['link'] ?? '',
      config: json['config'] ?? '',
      source: json['source'] ?? '',
      ping: json['ping'],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'address': address,
        'port': port,
        'protocol': protocol,
        'link': link,
        'config': config,
        'source': source,
        'ping': ping,
      };
}
