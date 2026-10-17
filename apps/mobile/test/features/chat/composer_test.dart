import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/chat_harness.dart';
import '../../helpers/fake_api.dart';

void main() {
  late ChatHarness h;

  setUp(() => h = ChatHarness());
  tearDown(() => h.dispose());

  testWidgets('忙碌时输入区没有引导开关；软键盘弹出时输入、停止、发送仍可见且热区 >=44dp', (tester) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(360, 640)
      ..viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(tester.view.reset);
    h.snapshot = snapshotOf(<Map<String, dynamic>>[
      userItem('u-1', 'x'),
    ], busy: true);
    await h.bind();
    await tester.pumpWidget(h.build());
    await settle(tester);

    expect(find.byKey(const Key('composer-steer')), findsNothing);
    final stop = find.byKey(const Key('composer-stop'));
    final send = find.byKey(const Key('composer-send'));
    for (final f in <Finder>[stop, send]) {
      final rect = tester.getRect(f);
      expect(rect.bottom, lessThanOrEqualTo(640 - 300), reason: '$f 不被键盘遮挡');
      expect(rect.top, greaterThanOrEqualTo(0));
      expect(rect.width, greaterThanOrEqualTo(44));
      expect(rect.height, greaterThanOrEqualTo(44));
    }
  });

  testWidgets('空闲时没有引导开关', (tester) async {
    await h.bind();
    await tester.pumpWidget(h.build());
    await settle(tester);
    expect(find.byKey(const Key('composer-steer')), findsNothing);
    expect(find.byKey(const Key('composer-stop')), findsNothing);
  });
}
