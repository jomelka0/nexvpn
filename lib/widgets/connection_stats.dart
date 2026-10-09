import 'dart:ui' show FontFeature;
import 'package:flutter/material.dart';
import 'package:flutter_v2ray/flutter_v2ray.dart';
import '../utils/format.dart';

/// Число-размер, которое плавно «перетекает» к новому значению.
class AnimatedBytes extends StatelessWidget {
  final int value;
  final String suffix;
  final TextStyle? style;

  const AnimatedBytes({super.key, required this.value, this.suffix = '', this.style});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(end: value.toDouble()),
      duration: const Duration(milliseconds: 600),
      curve: Curves.easeOut,
      builder: (context, v, _) => Text(
        '${formatBytes(v.round())}$suffix',
        style: style,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}

/// Панель активного подключения: время, скорость, трафик и график скорости.
class ConnectionStats extends StatelessWidget {
  final V2RayStatus status;
  final List<int> down;
  final List<int> up;

  const ConnectionStats({super.key, required this.status, required this.down, required this.up});

  static const _green = Color(0xFF3FB950);
  static const _purple = Color(0xFFA371F7);
  static const _blue = Color(0xFF58A6FF);
  static const _muted = Color(0xFF8B949E);

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0, end: 1),
      duration: const Duration(milliseconds: 450),
      curve: Curves.easeOutCubic,
      builder: (context, v, child) => Opacity(
        opacity: v,
        child: Transform.translate(offset: Offset(0, 14 * (1 - v)), child: child),
      ),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF1B2230), Color(0xFF161B22)],
          ),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0xFF30363D)),
        ),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.timer_outlined, size: 20, color: _blue),
                const SizedBox(width: 8),
                Text(
                  status.duration.isEmpty ? '00:00:00' : status.duration,
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                _tile(Icons.arrow_downward_rounded, _green, 'Загрузка',
                    AnimatedBytes(value: status.downloadSpeed, suffix: '/s', style: _valueStyle)),
                _tile(Icons.arrow_upward_rounded, _purple, 'Отдача',
                    AnimatedBytes(value: status.uploadSpeed, suffix: '/s', style: _valueStyle)),
                _tile(Icons.swap_vert_rounded, _blue, 'Всего',
                    AnimatedBytes(value: status.download + status.upload, style: _valueStyle)),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 44,
              width: double.infinity,
              child: CustomPaint(painter: SpeedChartPainter(down, up)),
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Получено: ${formatBytes(status.download)}',
                    style: const TextStyle(fontSize: 11, color: _muted)),
                Text('Отправлено: ${formatBytes(status.upload)}',
                    style: const TextStyle(fontSize: 11, color: _muted)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static const _valueStyle = TextStyle(fontSize: 14, fontWeight: FontWeight.w700);

  Widget _tile(IconData icon, Color color, String label, Widget value) {
    return Expanded(
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 14, color: color),
              const SizedBox(width: 3),
              Text(label, style: const TextStyle(fontSize: 11, color: _muted)),
            ],
          ),
          const SizedBox(height: 3),
          value,
        ],
      ),
    );
  }
}

class SpeedChartPainter extends CustomPainter {
  final List<int> down;
  final List<int> up;

  SpeedChartPainter(this.down, this.up);

  @override
  void paint(Canvas canvas, Size size) {
    var maxV = 1;
    for (final v in down) {
      if (v > maxV) maxV = v;
    }
    for (final v in up) {
      if (v > maxV) maxV = v;
    }

    canvas.drawLine(
      Offset(0, size.height - 1),
      Offset(size.width, size.height - 1),
      Paint()
        ..color = const Color(0xFF30363D)
        ..strokeWidth = 1,
    );

    void draw(List<int> data, Color color, bool fill) {
      if (data.length < 2) return;
      final path = Path();
      for (var i = 0; i < data.length; i++) {
        final x = i / (data.length - 1) * size.width;
        final y = size.height - 3 - (data[i] / maxV) * (size.height - 8);
        if (i == 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }
      if (fill) {
        final area = Path.from(path)
          ..lineTo(size.width, size.height)
          ..lineTo(0, size.height)
          ..close();
        canvas.drawPath(
          area,
          Paint()
            ..shader = LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [color.withOpacity(0.35), color.withOpacity(0.0)],
            ).createShader(Rect.fromLTWH(0, 0, size.width, size.height)),
        );
      }
      canvas.drawPath(
        path,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..strokeJoin = StrokeJoin.round,
      );
    }

    draw(down, const Color(0xFF3FB950), true);
    draw(up, const Color(0xFFA371F7), false);
  }

  @override
  bool shouldRepaint(covariant SpeedChartPainter oldDelegate) => true;
}
