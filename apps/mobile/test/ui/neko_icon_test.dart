import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/ui/neko_icons.dart';

void main() {
  test('图标路径可解析且落在 24 栅格内、名称唯一', () {
    final names = <String>{};
    for (final icon in NekoIcons.all) {
      expect(names.add(icon.name), isTrue, reason: '重名 ${icon.name}');
      final bounds = nekoIconPath(icon).getBounds();
      expect(bounds.width + bounds.height, greaterThan(0), reason: icon.name);
      expect(bounds.left, greaterThanOrEqualTo(0), reason: icon.name);
      expect(bounds.top, greaterThanOrEqualTo(0), reason: icon.name);
      expect(
        bounds.right,
        lessThanOrEqualTo(NekoIconData.grid),
        reason: icon.name,
      );
      expect(
        bounds.bottom,
        lessThanOrEqualTo(NekoIconData.grid),
        reason: icon.name,
      );
    }
  });

  testWidgets('所有图标渲染不抛错，大小取自 IconTheme 与显式 size', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: IconTheme(
            data: const IconThemeData(size: 30, color: Colors.red),
            child: Wrap(
              children: <Widget>[
                for (final icon in NekoIcons.all) NekoIcon(icon),
                NekoIcon(NekoIcons.plus, size: 12),
              ],
            ),
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
    expect(tester.getSize(find.byType(NekoIcon).first), const Size(30, 30));
    expect(tester.getSize(find.byType(NekoIcon).last), const Size(12, 12));
  });

  testWidgets('颜色随主题变化，语义标签可选', (tester) async {
    Widget app(Color color) => MaterialApp(
      home: IconTheme(
        data: IconThemeData(color: color),
        child: const NekoIcon(NekoIcons.stop, semanticLabel: '停止'),
      ),
    );
    await tester.pumpWidget(app(Colors.blue));
    final handle = tester.ensureSemantics();
    expect(find.bySemanticsLabel('停止'), findsOneWidget);
    final painter = (tester
        .widget<CustomPaint>(
          find.descendant(
            of: find.byType(NekoIcon),
            matching: find.byType(CustomPaint),
          ),
        )
        .painter!);
    expect(painter.shouldRepaint(painter), isFalse);
    await tester.pumpWidget(app(Colors.green));
    expect(tester.takeException(), isNull);
    handle.dispose();
  });

  testWidgets('IconButton 内的图标跟随按钮颜色与禁用态', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: IconButton(
            onPressed: null,
            icon: const NekoIcon(NekoIcons.plus),
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
    expect(
      tester.getSize(find.byType(IconButton)).width,
      greaterThanOrEqualTo(40),
    );
  });

  testWidgets('父级强制更宽时图标仍按 size 画成正方形（如 InputDecoration 前缀）', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Row(
            children: <Widget>[
              ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 40),
                child: const NekoIcon(NekoIcons.search, size: 16),
              ),
            ],
          ),
        ),
      ),
    );
    final paint = find.descendant(
      of: find.byType(NekoIcon),
      matching: find.byType(CustomPaint),
    );
    expect(tester.getSize(paint.first), const Size(16, 16));
    expect(tester.getSize(find.byType(NekoIcon)).width, 40);
  });
}
