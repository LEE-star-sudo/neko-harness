import 'package:flutter/material.dart';
import 'package:neko_mobile/ui/neko_icons.dart';

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
    required this.codeInline,
    required this.userBubble,
    required this.onUserBubble,
  });

  static const double radiusControl = 8;
  static const double radiusCard = 12;
  static const double radiusBubble = 14;
  static const String monoFamily = 'monospace';

  /// 代码/工具参数的等宽样式；字号集中在主题里，页面不直接写数字。
  static const TextStyle code = TextStyle(
    fontFamily: monoFamily,
    fontSize: 12,
    height: 1.4,
  );

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
    codeInline: Color(0xFFF6F2F7),
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
    codeInline: Color(0xFF322B34),
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

  /// 行内代码底色：比代码块更浅，避免在浅色主题里显得发暗。
  final Color codeInline;
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
    codeInline: codeInline,
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
      codeInline: c(codeInline, other.codeInline),
      userBubble: c(userBubble, other.userBubble),
      onUserBubble: c(onUserBubble, other.onUserBubble),
    );
  }
}

extension NekoTextStyles on BuildContext {
  TextTheme get text => Theme.of(this).textTheme;

  /// 次要信息（12.5sp）。
  TextStyle small([Color? color]) =>
      Theme.of(this).textTheme.bodySmall!.copyWith(color: color);

  /// 元信息（11sp）：时间、用量等。
  TextStyle meta([Color? color]) =>
      Theme.of(this).textTheme.labelSmall!.copyWith(color: color);
}

/// 双行标题的顶栏高度：默认 48dp，字体放大时随文字增高，避免溢出。
double nekoToolbarHeight(BuildContext context) {
  final scaler = MediaQuery.textScalerOf(context);
  return (scaler.scale(16 * 1.3 + 11 * 1.3) + NekoSpace.md).clamp(48, 96);
}

/// 间距阶梯：页面只用这些值，避免各处硬编码。
class NekoSpace {
  const NekoSpace._();

  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;

  /// 满足触屏热区的最小边长。
  static const double touch = 44;
}

const List<String> _fontFallback = <String>[
  'PingFang SC',
  'Noto Sans CJK SC',
  'Microsoft YaHei',
  'sans-serif',
];

/// 字阶：正文 14、次要 12.5、元信息 11；标题只用 15/16 两档，行高 1.35–1.45。
TextTheme _nekoTextTheme(TextTheme base, NekoTokens t) {
  TextStyle style(
    TextStyle? from,
    double size,
    double height, {
    FontWeight weight = FontWeight.w400,
    Color? color,
  }) => (from ?? const TextStyle()).copyWith(
    fontSize: size,
    height: height,
    fontWeight: weight,
    color: color ?? t.text,
    fontFamilyFallback: _fontFallback,
    letterSpacing: 0,
  );
  return base.copyWith(
    headlineSmall: style(base.headlineSmall, 18, 1.3, weight: FontWeight.w600),
    titleLarge: style(base.titleLarge, 16, 1.3, weight: FontWeight.w600),
    titleMedium: style(base.titleMedium, 15, 1.35, weight: FontWeight.w600),
    titleSmall: style(base.titleSmall, 14, 1.35, weight: FontWeight.w600),
    bodyLarge: style(base.bodyLarge, 14, 1.45),
    bodyMedium: style(base.bodyMedium, 14, 1.45),
    bodySmall: style(base.bodySmall, 12.5, 1.4, color: t.textMuted),
    labelLarge: style(base.labelLarge, 13, 1.3, weight: FontWeight.w500),
    labelMedium: style(base.labelMedium, 12, 1.3, weight: FontWeight.w500),
    labelSmall: style(base.labelSmall, 11, 1.3, color: t.textFaint),
  );
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
  final base = ThemeData(brightness: brightness, useMaterial3: true);
  final text = _nekoTextTheme(base.textTheme, tokens);
  final controlShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(NekoTokens.radiusControl),
  );
  OutlineInputBorder border(Color color, [double width = 1]) =>
      OutlineInputBorder(
        borderRadius: BorderRadius.circular(NekoTokens.radiusControl),
        borderSide: BorderSide(color: color, width: width),
      );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: tokens.base,
    extensions: <ThemeExtension<dynamic>>[tokens],
    textTheme: text,
    visualDensity: VisualDensity.compact,
    iconTheme: IconThemeData(color: tokens.text, size: 18),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(iconSize: 20),
    ),
    dividerTheme: DividerThemeData(
      color: tokens.border,
      thickness: 0.5,
      space: 1,
    ),
    actionIconTheme: ActionIconThemeData(
      backButtonIconBuilder: (_) => const NekoIcon(NekoIcons.arrowLeft),
      closeButtonIconBuilder: (_) => const NekoIcon(NekoIcons.close),
      drawerButtonIconBuilder: (_) => const NekoIcon(NekoIcons.menu),
      endDrawerButtonIconBuilder: (_) => const NekoIcon(NekoIcons.menu),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: tokens.base,
      foregroundColor: tokens.text,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      toolbarHeight: 48,
      centerTitle: false,
      titleSpacing: NekoSpace.xs,
      titleTextStyle: text.titleLarge,
      iconTheme: IconThemeData(color: tokens.text, size: 20),
      actionsIconTheme: IconThemeData(color: tokens.text, size: 20),
      shape: Border(bottom: BorderSide(color: tokens.border, width: 0.5)),
    ),
    cardTheme: CardThemeData(
      color: tokens.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(NekoTokens.radiusCard),
        side: BorderSide(color: tokens.border, width: 0.5),
      ),
    ),
    listTileTheme: ListTileThemeData(
      dense: true,
      visualDensity: VisualDensity.compact,
      contentPadding: const EdgeInsets.symmetric(horizontal: NekoSpace.md),
      minVerticalPadding: NekoSpace.xs + 2,
      minLeadingWidth: 24,
      horizontalTitleGap: NekoSpace.md,
      iconColor: tokens.textMuted,
      titleTextStyle: text.bodyLarge?.copyWith(fontWeight: FontWeight.w500),
      subtitleTextStyle: text.bodySmall,
    ),
    expansionTileTheme: ExpansionTileThemeData(
      tilePadding: const EdgeInsets.symmetric(horizontal: NekoSpace.md),
      childrenPadding: const EdgeInsets.fromLTRB(
        NekoSpace.md,
        0,
        NekoSpace.md,
        NekoSpace.md,
      ),
      iconColor: tokens.textMuted,
      collapsedIconColor: tokens.textMuted,
      shape: const Border(),
      collapsedShape: const Border(),
    ),
    chipTheme: ChipThemeData(
      labelStyle: text.labelMedium,
      padding: const EdgeInsets.symmetric(horizontal: NekoSpace.xs),
      side: BorderSide(color: tokens.border, width: 0.5),
      shape: controlShape,
      backgroundColor: tokens.surface,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: tokens.surface,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: NekoSpace.md,
        vertical: NekoSpace.sm + 2,
      ),
      hintStyle: text.bodyMedium?.copyWith(color: tokens.textFaint),
      border: border(tokens.border),
      enabledBorder: border(tokens.border),
      focusedBorder: border(tokens.primary, 1.2),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 36),
        // 视觉 36dp，点击热区经 padded 扩到 48dp；全局 compact 会把热区缩到 40，按钮需还原。
        visualDensity: VisualDensity.standard,
        tapTargetSize: MaterialTapTargetSize.padded,
        padding: const EdgeInsets.symmetric(horizontal: NekoSpace.lg),
        textStyle: text.labelLarge,
        shape: controlShape,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 36),
        // 视觉 36dp，点击热区经 padded 扩到 48dp；全局 compact 会把热区缩到 40，按钮需还原。
        visualDensity: VisualDensity.standard,
        tapTargetSize: MaterialTapTargetSize.padded,
        padding: const EdgeInsets.symmetric(horizontal: NekoSpace.lg),
        textStyle: text.labelLarge,
        shape: controlShape,
        side: BorderSide(color: tokens.border),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(0, 36),
        // 视觉 36dp，点击热区经 padded 扩到 48dp；全局 compact 会把热区缩到 40，按钮需还原。
        visualDensity: VisualDensity.standard,
        tapTargetSize: MaterialTapTargetSize.padded,
        padding: const EdgeInsets.symmetric(horizontal: NekoSpace.md),
        textStyle: text.labelLarge,
        shape: controlShape,
      ),
    ),
    drawerTheme: DrawerThemeData(
      backgroundColor: tokens.base,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: tokens.surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: tokens.surface,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: text.titleLarge,
      contentTextStyle: text.bodyMedium,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(NekoTokens.radiusCard),
      ),
    ),
    // 视觉紧凑，但保留 48dp 点击热区（满足 >=44dp）。
    materialTapTargetSize: MaterialTapTargetSize.padded,
  );
}
