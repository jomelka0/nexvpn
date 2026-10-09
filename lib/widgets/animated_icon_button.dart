import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

enum IconAnim { spin, bounce, turn }

/// Кнопка-иконка с маленькой анимацией при нажатии:
/// spin — полный оборот, turn — поворот на четверть, bounce — «подпрыгивание».
class AnimatedIconButton extends StatefulWidget {
  final IconData icon;
  final VoidCallback onPressed;
  final String? tooltip;
  final IconAnim anim;

  const AnimatedIconButton({
    super.key,
    required this.icon,
    required this.onPressed,
    this.tooltip,
    this.anim = IconAnim.bounce,
  });

  @override
  State<AnimatedIconButton> createState() => _AnimatedIconButtonState();
}

class _AnimatedIconButtonState extends State<AnimatedIconButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 550));

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _tap() {
    HapticFeedback.selectionClick();
    _c.forward(from: 0);
    widget.onPressed();
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: widget.tooltip,
      onPressed: _tap,
      icon: AnimatedBuilder(
        animation: _c,
        child: Icon(widget.icon),
        builder: (context, child) {
          final t = Curves.easeOutCubic.transform(_c.value);
          if (widget.anim == IconAnim.spin) {
            return Transform.rotate(angle: t * 2 * pi, child: child);
          }
          if (widget.anim == IconAnim.turn) {
            return Transform.rotate(angle: t * pi / 2, child: child);
          }
          return Transform.scale(scale: 1 + 0.35 * sin(t * pi), child: child);
        },
      ),
    );
  }
}
