import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/chat_harness.dart';
import '../../helpers/fake_api.dart';

Map<String, dynamic> _queued(
  int id,
  String preview, {
  String mode = 'followUp',
  int images = 0,
}) => <String, dynamic>{
  'id': id,
  'mode': mode,
  'preview': preview,
  'images': images,
};

void main() {
  late ChatHarness h;

  setUp(() => h = ChatHarness());
  tearDown(() => h.dispose());

  testWidgets('排队条显示投递方式与预览，旧电脑端（无 queued）不显示', (tester) async {
    h.snapshot = snapshotOf(
      <Map<String, dynamic>>[userItem('u-1', 'x')],
      busy: true,
      queued: <Map<String, dynamic>>[
        _queued(4, '稍后跑测试'),
        _queued(5, '改用 pnpm', mode: 'steer'),
        _queued(6, '', images: 1),
      ],
    );
    await h.bind();
    await tester.pumpWidget(h.build());
    await settle(tester);
    expect(find.byKey(const Key('queue-tray')), findsOneWidget);
    expect(find.text('稍后跑测试'), findsOneWidget);
    expect(find.text('改用 pnpm'), findsOneWidget);
    expect(find.text('（仅图片）'), findsOneWidget);
    expect(find.text('排队'), findsNWidgets(2));
    // 一个引导标识 + 两个排队项各自的「引导」按钮。
    expect(find.text('引导'), findsNWidgets(3));
    expect(find.byKey(const Key('queued-steer-5')), findsNothing);
  });

  testWidgets('排队项可引导（已是引导的项没有引导按钮），结果以电脑返回为准', (tester) async {
    h.snapshot = snapshotOf(
      <Map<String, dynamic>>[userItem('u-1', 'x')],
      busy: true,
      queued: <Map<String, dynamic>>[
        _queued(4, '稍后跑测试'),
        _queued(5, '已引导', mode: 'steer'),
      ],
    );
    await h.bind();
    var result = <String, dynamic>{'result': 'steered', 'id': 9};
    h.api.on('chat.steer', (_) => result);
    await tester.pumpWidget(h.build());
    await settle(tester);
    expect(find.byKey(const Key('queued-steer-5')), findsNothing);
    h.chat.input.text = '我的草稿';
    await tester.tap(find.byKey(const Key('queued-steer-4')));
    await settle(tester);
    expect(h.api.callsOf('chat.steer').single, <String, dynamic>{
      'subscriptionId': 'chat-1',
      'id': 4,
    });
    expect(h.chat.input.text, '我的草稿');

    result = <String, dynamic>{'result': 'placed'};
    await tester.tap(find.byKey(const Key('queued-steer-4')));
    await settle(tester);
    expect(find.text('该消息已发送，无法引导'), findsOneWidget);

    result = <String, dynamic>{'result': 'withdrawn', 'text': '稍后跑测试'};
    await tester.tap(find.byKey(const Key('queued-steer-4')));
    await settle(tester);
    expect(h.chat.input.text, '我的草稿\n稍后跑测试');
    expect(find.text('无法改为引导，消息已撤回到输入框'), findsOneWidget);
  });

  testWidgets('没有排队项或电脑端不支持时不占位', (tester) async {
    h.snapshot = snapshotOf(<Map<String, dynamic>>[
      userItem('u-1', 'x'),
    ], busy: true);
    await h.bind();
    await tester.pumpWidget(h.build());
    await settle(tester);
    expect(h.chat.queued, isNull);
    expect(find.byKey(const Key('queue-tray')), findsNothing);
  });

  testWidgets('撤回取回完整原文：空草稿覆盖，非空草稿追加到新行', (tester) async {
    h.snapshot = snapshotOf(
      <Map<String, dynamic>>[userItem('u-1', 'x')],
      busy: true,
      queued: <Map<String, dynamic>>[_queued(4, '稍后跑…')],
    );
    await h.bind();
    h.api.on(
      'chat.withdraw',
      (_) => <String, dynamic>{
        'result': 'withdrawn',
        'text': '稍后跑测试的完整原文',
        'images': 0,
      },
    );
    await tester.pumpWidget(h.build());
    await settle(tester);
    await tester.tap(find.byKey(const Key('queued-withdraw-4')));
    await settle(tester);
    expect(h.api.callsOf('chat.withdraw').single, <String, dynamic>{
      'subscriptionId': 'chat-1',
      'id': 4,
    });
    expect(h.chat.input.text, '稍后跑测试的完整原文');

    h.chat.input.text = '刚写的新内容';
    await tester.tap(find.byKey(const Key('queued-withdraw-4')));
    await settle(tester);
    expect(h.chat.input.text, '刚写的新内容\n稍后跑测试的完整原文');
  });

  testWidgets('已放入时提示已发送且不改草稿；带图片时提示图片未恢复', (tester) async {
    h.snapshot = snapshotOf(
      <Map<String, dynamic>>[userItem('u-1', 'x')],
      busy: true,
      queued: <Map<String, dynamic>>[_queued(4, '图')],
    );
    await h.bind();
    var result = <String, dynamic>{'result': 'placed'};
    h.api.on('chat.withdraw', (_) => result);
    await tester.pumpWidget(h.build());
    await settle(tester);
    h.chat.input.text = '我的草稿';
    await tester.tap(find.byKey(const Key('queued-withdraw-4')));
    await settle(tester);
    expect(find.text('该消息已发送，无法撤回'), findsOneWidget);
    expect(h.chat.input.text, '我的草稿');

    result = <String, dynamic>{'result': 'withdrawn', 'text': '图', 'images': 1};
    await tester.tap(find.byKey(const Key('queued-withdraw-4')));
    await settle(tester);
    expect(find.text('图片未恢复，请重新添加'), findsOneWidget);
  });

  testWidgets('软键盘弹出时排队条限高，输入、发送、停止仍可见', (tester) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(360, 640)
      ..viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(tester.view.reset);
    h.snapshot = snapshotOf(
      <Map<String, dynamic>>[userItem('u-1', 'x')],
      busy: true,
      queued: <Map<String, dynamic>>[
        for (var i = 1; i <= 6; i++) _queued(i, '消息 $i'),
      ],
    );
    await h.bind();
    await tester.pumpWidget(h.build());
    await settle(tester);
    for (final key in <String>[
      'composer-input',
      'composer-send',
      'composer-stop',
    ]) {
      final rect = tester.getRect(find.byKey(Key(key)));
      expect(rect.bottom, lessThanOrEqualTo(640 - 300), reason: key);
      expect(rect.top, greaterThanOrEqualTo(0), reason: key);
    }
    expect(tester.getRect(find.byKey(const Key('queue-tray'))).height, 48);
  });
}
