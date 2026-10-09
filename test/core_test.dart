// Эти тесты запускаются на GitHub перед сборкой APK (см. tools/patch_android.sh).
// Фикстуры и ожидаемые значения созданы эталонной реализацией tools/ref (Node.js),
// которая проверена на тестовом сервере, имитирующем панель подписок.
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexvpn_app/core/sub_parser.dart';

void main() {
  const dir = 'test/fixtures';
  final expected =
      jsonDecode(File('$dir/expected.json').readAsStringSync()) as Map<String, dynamic>;

  group('разбор подписок', () {
    expected.forEach((file, exp) {
      test(file, () {
        final o = parseSubscriptionBody(File('$dir/$file').readAsStringSync());
        expect(o.format, exp['format']);
        expect(o.skipped, exp['skipped']);
        expect(o.notices, List<String>.from(exp['notices'] as List));
        expect(looksLikeDecoys(o.servers), exp['decoy']);

        final es = exp['servers'] as List;
        expect(o.servers.length, es.length);
        for (var i = 0; i < es.length; i++) {
          expect(o.servers[i].name, es[i]['name']);
          expect(o.servers[i].address, es[i]['address']);
          expect(o.servers[i].port, es[i]['port']);
          expect(o.servers[i].protocol, es[i]['protocol']);
          expect(o.servers[i].config.isNotEmpty, es[i]['hasConfig']);
        }
      });
    });
  });

  group('вспомогательные функции', () {
    test('redact прячет uuid и пароли', () {
      final r = redact('vless://11111111-2222@host:443?x=1#n ss://YWVzLTI1Ni1nY206cHc@h:1');
      expect(r.contains('11111111'), isFalse);
      expect(r.contains('YWVzLTI1Ni1nY206cHc'), isFalse);
      expect(r.contains('vless://***@host'), isTrue);
    });

    test('subscription-userinfo', () {
      expect(parseUserInfo('upload=1; download=2; total=100; expire=0'),
          {'upload': 1, 'download': 2, 'total': 100, 'expire': 0});
      expect(parseUserInfo(null), isEmpty);
    });

    test('profile-title', () {
      expect(decodeProfileTitle('base64:${base64.encode(utf8.encode('Добрый VPN'))}'), 'Добрый VPN');
      expect(decodeProfileTitle('My%20Sub'), 'My Sub');
      expect(decodeProfileTitle('  '), isNull);
    });

    test('заглушки: одинаковый адрес у нескольких серверов', () {
      final same = [
        const ParsedServer(name: 'a', address: 'max.ru', port: 1234, protocol: 'SS'),
        const ParsedServer(name: 'b', address: 'max.ru', port: 1234, protocol: 'SS'),
      ];
      expect(looksLikeDecoys(same), isTrue);
      expect(looksLikeDecoys(same.take(1).toList()), isFalse);
    });
  });
}
