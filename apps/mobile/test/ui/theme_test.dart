import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/ui/theme.dart';

void main() {
  for (final brightness in Brightness.values) {
    test('紧凑字阶与密度（$brightness）', () {
      final theme = buildNekoTheme(brightness);
      final text = theme.textTheme;
      expect(text.bodyMedium?.fontSize, 14);
      expect(text.bodySmall?.fontSize, 12.5);
      expect(text.labelSmall?.fontSize, 11);
      expect(text.titleLarge?.fontSize, 16);
      expect(NekoTokens.code.fontSize, 12);
      expect(theme.visualDensity, VisualDensity.compact);
      expect(theme.appBarTheme.toolbarHeight, 48);
      expect(theme.materialTapTargetSize, MaterialTapTargetSize.padded);
      expect(NekoTokens.radiusControl, lessThan(10));
      expect(NekoTokens.radiusCard, lessThan(16));
      expect(NekoTokens.radiusBubble, lessThan(20));
      expect(theme.extension<NekoTokens>(), isNotNull);
    });
  }

  test('色板与主题语义不变', () {
    final light = buildNekoTheme(Brightness.light).extension<NekoTokens>()!;
    final dark = buildNekoTheme(Brightness.dark).extension<NekoTokens>()!;
    expect(light.primary, const Color(0xFF0086BF));
    expect(light.accent, const Color(0xFFC26279));
    expect(light.userBubble, const Color(0xFFFFE5EA));
    expect(light.base, const Color(0xFFFEFCFE));
    expect(dark.primary, const Color(0xFF66CCFF));
    expect(dark.userBubble, const Color(0xFF6E1D36));
    expect(dark.base, const Color(0xFF1A161B));
    expect(buildNekoTheme(Brightness.dark).scaffoldBackgroundColor, dark.base);
  });

  testWidgets('AppBar 实际高度 48dp，列表行比默认更紧凑', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildNekoTheme(Brightness.light),
        home: Scaffold(
          appBar: AppBar(title: const Text('标题')),
          body: const ListTile(title: Text('行')),
        ),
      ),
    );
    expect(tester.getSize(find.byType(AppBar)).height, 48);
    expect(tester.getSize(find.byType(ListTile)).height, lessThan(56));
  });

  testWidgets('间距阶梯与热区常量', (tester) async {
    expect(<double>[
      NekoSpace.xs,
      NekoSpace.sm,
      NekoSpace.md,
      NekoSpace.lg,
    ], orderedEquals(<double>[4, 8, 12, 16]));
    expect(NekoSpace.touch, greaterThanOrEqualTo(44));
  });
}
