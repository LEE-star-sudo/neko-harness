import 'package:flutter/material.dart';

/// 语义 tokens（取自 Web `styles.css` 的 sakura/tianyi/ink 调色板，design D10）。
@immutable
class NekoTokens extends ThemeExtension<NekoTokens> {
  const NekoTokens({
    required this.base,
    required this.surface,
    required this.surfaceMuted,
    required this.primary,
    required this.accent,
    required this.text,
    required this.textMuted,
    required this.textFaint,
    required this.border,
    required this.success,
    required this.warning,
    required this.danger,
    required this.codeBackground,
    required this.userBubble,
    required this.onUserBubble,
  });

  static const double radiusControl = 10;
  static const double radiusCard = 16;
  static const double radiusBubble = 20;
  static const String monoFamily = 'monospace';

  static const NekoTokens light = NekoTokens(
    base: Color(0xFFFEFCFE),
    surface: Color(0xFFFFFFFF),
    surfaceMuted: Color(0xFFF7F4F8),
    primary: Color(0xFF0086BF),
    accent: Color(0xFFC26279),
    text: Color(0xFF322B34),
    textMuted: Color(0xFF6A5F6C),
    textFaint: Color(0xFF9E95A0),
    border: Color(0xFFE2DBE4),
    success: Color(0xFF2E7D4F),
    warning: Color(0xFFB26A00),
    danger: Color(0xFFB3261E),
    codeBackground: Color(0xFFF0EBF1),
    userBubble: Color(0xFFFFE5EA),
    onUserBubble: Color(0xFF322B34),
  );

  static const NekoTokens dark = NekoTokens(
    base: Color(0xFF1A161B),
    surface: Color(0xFF241F26),
    surfaceMuted: Color(0xFF2C262E),
    primary: Color(0xFF66CCFF),
    accent: Color(0xFFED9BAC),
    text: Color(0xFFF0EBF1),
    textMuted: Color(0xFFC9BFCB),
    textFaint: Color(0xFF9E95A0),
    border: Color(0xFF443947),
    success: Color(0xFF7BD49A),
    warning: Color(0xFFF2B866),
    danger: Color(0xFFF2B8B5),
    codeBackground: Color(0xFF322B34),
    userBubble: Color(0xFF6E1D36),
    onUserBubble: Color(0xFFFFF1F3),
  );

  final Color base;
  final Color surface;
  final Color surfaceMuted;
  final Color primary;
  final Color accent;
  final Color text;
  final Color textMuted;
  final Color textFaint;
  final Color border;
  final Color success;
  final Color warning;
  final Color danger;
  final Color codeBackground;
  final Color userBubble;
  final Color onUserBubble;

  static NekoTokens of(BuildContext context) =>
      Theme.of(context).extension<NekoTokens>() ?? light;

  @override
  NekoTokens copyWith({Color? primary, Color? accent}) => NekoTokens(
    base: base,
    surface: surface,
    surfaceMuted: surfaceMuted,
    primary: primary ?? this.primary,
    accent: accent ?? this.accent,
    text: text,
    textMuted: textMuted,
    textFaint: textFaint,
    border: border,
    success: success,
    warning: warning,
    danger: danger,
    codeBackground: codeBackground,
    userBubble: userBubble,
    onUserBubble: onUserBubble,
  );

  @override
  NekoTokens lerp(covariant NekoTokens? other, double t) {
    if (other == null) return this;
    Color c(Color a, Color b) => Color.lerp(a, b, t)!;
    return NekoTokens(
      base: c(base, other.base),
      surface: c(surface, other.surface),
      surfaceMuted: c(surfaceMuted, other.surfaceMuted),
      primary: c(primary, other.primary),
      accent: c(accent, other.accent),
      text: c(text, other.text),
      textMuted: c(textMuted, other.textMuted),
      textFaint: c(textFaint, other.textFaint),
      border: c(border, other.border),
      success: c(success, other.success),
      warning: c(warning, other.warning),
      danger: c(danger, other.danger),
      codeBackground: c(codeBackground, other.codeBackground),
      userBubble: c(userBubble, other.userBubble),
      onUserBubble: c(onUserBubble, other.onUserBubble),
    );
  }
}

ThemeData buildNekoTheme(Brightness brightness) {
  final tokens = brightness == Brightness.dark
      ? NekoTokens.dark
      : NekoTokens.light;
  final scheme =
      ColorScheme.fromSeed(
        seedColor: tokens.primary,
        brightness: brightness,
      ).copyWith(
        primary: tokens.primary,
        secondary: tokens.accent,
        surface: tokens.surface,
        onSurface: tokens.text,
        error: tokens.danger,
        outline: tokens.border,
      );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: tokens.base,
    extensions: <ThemeExtension<dynamic>>[tokens],
    appBarTheme: AppBarTheme(
      backgroundColor: tokens.base,
      foregroundColor: tokens.text,
      elevation: 0,
      scrolledUnderElevation: 1,
    ),
    cardTheme: CardThemeData(
      color: tokens.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(NekoTokens.radiusCard),
        side: BorderSide(color: tokens.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: tokens.surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(NekoTokens.radiusControl),
        borderSide: BorderSide(color: tokens.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(NekoTokens.radiusControl),
        borderSide: BorderSide(color: tokens.border),
      ),
    ),
    materialTapTargetSize: MaterialTapTargetSize.padded,
  );
}
