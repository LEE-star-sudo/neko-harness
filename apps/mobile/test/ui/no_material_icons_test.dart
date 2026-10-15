import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/ui/neko_icons.dart';
import 'package:neko_mobile/ui/theme.dart';

void main() {
  test('lib 内不引用 Material 默认图标', () {
    final offenders = <String>[];
    for (final entity in Directory('lib').listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      final lines = entity.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        if (RegExp(r'\bIcons\.|CupertinoIcons\.|(?<![A-Za-z])Icon\(')
            .hasMatch(lines[i])) {
          offenders.add('${entity.path}:${i + 1}');
        }
      }
    }
    expect(offenders, isEmpty);
  });

  testWidgets('系统返回/抽屉/关闭按钮使用自有图标', (tester) async {
    final navigatorKey = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: navigatorKey,
        theme: buildNekoTheme(Brightness.light),
        home: Scaffold(appBar: AppBar(), drawer: const Drawer()),
      ),
    );
    expect(find.byType(DrawerButton), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(DrawerButton),
        matching: find.byType(NekoIcon),
      ),
      findsOneWidget,
    );
    navigatorKey.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(appBar: AppBar(), body: const CloseButton()),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.descendant(
        of: find.byType(BackButton),
        matching: find.byType(NekoIcon),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: find.byType(CloseButton),
        matching: find.byType(NekoIcon),
      ),
      findsOneWidget,
    );
    expect(find.byType(Icon), findsNothing);
  });
}
