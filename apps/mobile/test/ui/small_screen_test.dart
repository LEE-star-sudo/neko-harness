import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/features/computers/computers_page.dart';

import '../helpers/chat_harness.dart';
import '../helpers/fake_api.dart';

Map<String, dynamic> _approval(int id) => <String, dynamic>{
  'id': id,
  'version': 'v1',
  'taskId': 9,
  'agentId': 'agent-4',
  'title': '看看测试',
  'command': 'bun test ${'--very-long-flag ' * 40}',
  'cwd': '/a/neko/${'deep-directory/' * 8}',
  'timeoutSeconds': 120,
  'requestedAt': 0,
};

Future<void> transition(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

/// 在 360x640 窄屏与 1.5 倍字体下检查会话页、切换器、审批 Sheet 与设置页：
/// 不溢出、关键按钮在屏内且热区 >=44dp。
void main() {
  late ChatHarness h;

  setUp(() => h = ChatHarness());
  tearDown(() => h.dispose());

  void narrow(WidgetTester tester) {
    tester.view
      ..physicalSize = const Size(360, 640)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }

  void expectOnScreen(WidgetTester tester, Finder finder) {
    final rect = tester.getRect(finder);
    expect(rect.left, greaterThanOrEqualTo(0), reason: '$finder');
    expect(rect.right, lessThanOrEqualTo(360), reason: '$finder');
    expect(rect.top, greaterThanOrEqualTo(0), reason: '$finder');
    expect(rect.bottom, lessThanOrEqualTo(640), reason: '$finder');
  }

  for (final mode in <ThemeMode>[ThemeMode.light, ThemeMode.dark]) {
    testWidgets('会话页与切换器：1.5 倍字体窄屏无溢出（$mode）', (tester) async {
      narrow(tester);
      h.approvals = <Object>[_approval(31)];
      h.snapshot = snapshotOf(<Map<String, dynamic>>[
        userItem(
          'u-1',
          '/Users/kirineko/${'very-long-directory-name/' * 8}f.ts',
        ),
        assistantItem(
          'a-2',
          '| a | b |\n|---|---|\n| ${'长' * 60} | 2 |\n\n```\n${'x' * 200}\n```',
        ),
        <String, dynamic>{
          'key': 't-1',
          'type': 'tool',
          'tool': <String, dynamic>{
            'callId': 'c1',
            'name': 'bash',
            'summary': 'cat ${'/deep/path' * 20}',
            'status': 'error',
          },
        },
      ], busy: true);
      await h.bind();
      await tester.pumpWidget(h.build(mode: mode, textScale: 1.5));
      await settle(tester);
      expect(tester.takeException(), isNull);

      for (final key in <String>[
        'composer-send',
        'composer-stop',
        'sessions-new',
        'open-switcher',
        'connection-indicator',
      ]) {
        final f = find.byKey(Key(key));
        expectOnScreen(tester, f);
        final size = tester.getSize(f);
        expect(size.height, greaterThanOrEqualTo(44), reason: key);
        if (key != 'open-switcher') {
          expect(size.width, greaterThanOrEqualTo(44), reason: key);
        }
      }

      await tester.tap(find.byKey(const Key('open-switcher')));
      await transition(tester);
      expect(tester.takeException(), isNull);
      expectOnScreen(tester, find.byKey(const Key('sessions-search')));
      expectOnScreen(tester, find.byKey(const Key('session-7')));
      expect(
        tester.getSize(find.byKey(const Key('session-7'))).height,
        greaterThanOrEqualTo(44),
      );
    });

    testWidgets('审批 Sheet：1.5 倍字体窄屏下按钮可达（$mode）', (tester) async {
      narrow(tester);
      h.approvals = <Object>[_approval(31)];
      await h.bind();
      await tester.pumpWidget(h.build(mode: mode, textScale: 1.5));
      await settle(tester);
      await tester.tap(find.byKey(const Key('approval-bar')));
      await transition(tester);
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.byKey(const Key('approval-allow-31')));
      await transition(tester);
      for (final key in <String>['approval-allow-31', 'approval-deny-31']) {
        final f = find.byKey(Key(key));
        expectOnScreen(tester, f);
        expect(tester.getSize(f).height, greaterThanOrEqualTo(44), reason: key);
      }
    });

    testWidgets('设置页：1.5 倍字体窄屏无溢出（$mode）', (tester) async {
      narrow(tester);
      await h.bind();
      await tester.pumpWidget(
        h.build(mode: mode, textScale: 1.5, home: const ComputersPage()),
      );
      await settle(tester);
      expect(tester.takeException(), isNull);
    });
  }
}
