import 'package:flutter/material.dart';

/// Появление элемента: плавно проявляется и поднимается снизу (с задержкой для каскада).
class FadeInUp extends StatelessWidget {
  final Widget child;
  final int delayMs;

  const FadeInUp({super.key, required this.child, this.delayMs = 0});

  @override
  Widget build(BuildContext context) {
    const base = 380;
    final total = base + delayMs;
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0.0, end: 1.0),
      duration: Duration(milliseconds: total),
      curve: Interval(delayMs / total, 1.0, curve: Curves.easeOutCubic),
      builder: (context, v, child) => Opacity(
        opacity: v,
        child: Transform.translate(offset: Offset(0, 18 * (1 - v)), child: child),
      ),
      child: child,
    );
  }
}
