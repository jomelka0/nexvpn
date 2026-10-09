import 'package:flutter/material.dart';
import 'tap_scale.dart';

class SettingTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  final VoidCallback onLongPress;

  const SettingTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
    required this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFF58A6FF);
    return TapScale(
      onTap: () => onChanged(!value),
      onLongPress: onLongPress, // Зажатие открывает окно с описанием
      scaleDown: 0.97,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: value ? primary.withOpacity(0.08) : const Color(0xFF161B22),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: value ? primary.withOpacity(0.7) : const Color(0xFF30363D)),
        ),
        child: Row(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 280),
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                color: value ? primary : const Color(0xFF21262D),
              ),
              child: Icon(icon, size: 22, color: value ? Colors.black : const Color(0xFF8B949E)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 3),
                  Text(subtitle, style: const TextStyle(fontSize: 12, color: Color(0xFF8B949E))),
                  const SizedBox(height: 4),
                  const Text('💡 Зажмите для справки',
                      style: TextStyle(fontSize: 10, color: primary)),
                ],
              ),
            ),
            Switch(value: value, onChanged: onChanged),
          ],
        ),
      ),
    );
  }
}
