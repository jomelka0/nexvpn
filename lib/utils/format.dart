String formatBytes(int b) {
  if (b < 1024) return '$b B';
  if (b < 1024 * 1024) return '${(b / 1024).toStringAsFixed(1)} KB';
  if (b < 1024 * 1024 * 1024) return '${(b / (1024 * 1024)).toStringAsFixed(1)} MB';
  return '${(b / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
}

String formatDateTime(DateTime d) {
  String t(int n) => n.toString().padLeft(2, '0');
  return '${t(d.day)}.${t(d.month)} ${t(d.hour)}:${t(d.minute)}';
}
