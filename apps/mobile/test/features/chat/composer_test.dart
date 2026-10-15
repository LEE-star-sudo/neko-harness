import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/chat_harness.dart';
import '../../helpers/fake_api.dart';

void main() {
  late ChatHarness h;

  setUp(() => h = ChatHarness());
  tearDown(() => h.dispose());

  testWidgets('引导开关并入输入区；软键盘弹出时输入、停止、发送仍可见且热区 >=44dp', (tester) async {
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

    final input = find.byKey(const Key('composer-input'));
    final steer = find.byKey(const Key('composer-steer'));
    final stop = find.byKey(const Key('composer-stop'));
    final send = find.byKey(const Key('composer-send'));
    // 开关位于输入框内部，不再单独占一行。
    expect(tester.getRect(input).contains(tester.getCenter(steer)), isTrue);
    for (final f in <Finder>[steer, stop, send]) {
      final rect = tester.getRect(f);
      expect(rect.bottom, lessThanOrEqualTo(640 - 300), reason: '$f 不被键盘遮挡');
      expect(rect.top, greaterThanOrEqualTo(0));
      expect(rect.width, greaterThanOrEqualTo(44));
      expect(rect.height, greaterThanOrEqualTo(44));
    }

    expect(tester.widget<IconButton>(steer).isSelected, isFalse);
    await tester.tap(steer);
    await tester.pump();
    expect(tester.widget<IconButton>(steer).isSelected, isTrue);
  });

  testWidgets('空闲时没有引导开关', (tester) async {
    await h.bind();
    await tester.pumpWidget(h.build());
    await settle(tester);
    expect(find.byKey(const Key('composer-steer')), findsNothing);
    expect(find.byKey(const Key('composer-stop')), findsNothing);
  });
}
