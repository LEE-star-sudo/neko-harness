import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/api/models.dart';
import 'package:neko_mobile/features/chat/transcript.dart';
import 'package:neko_mobile/ui/widgets/transcript_view.dart';

import '../helpers/fake_api.dart';

class _FakeActions implements TranscriptActions {
  _FakeActions(this.transcript);

  final List<List<ChatItem>> olderPages = <List<ChatItem>>[];
  var olderLoads = 0;
  Completer<void>? gate;

  @override
  final Transcript transcript;

  @override
  bool loadingOlder = false;

  @override
  Future<void> loadOlder() async {
    if (loadingOlder) return;
    loadingOlder = true;
    transcript.notifyLoadingForTest();
    final gate = this.gate;
    if (gate != null) await gate.future;
    olderLoads++;
    final page = olderPages.isEmpty ? <ChatItem>[] : olderPages.removeAt(0);
    transcript.prepend(
      page,
      olderPages.isEmpty ? null : 'page-${olderPages.length}',
    );
    loadingOlder = false;
    transcript.notifyLoadingForTest();
  }

  @override
  Future<void> expand(ChatItem item, ContentRef ref) async {}

  @override
  Future<Uint8List> image(ImageRef image) async => Uint8List(0);
}

extension on Transcript {
  void notifyLoadingForTest() {
    // ignore: invalid_use_of_protected_member, invalid_use_of_visible_for_testing_member
    notifyListeners();
  }
}

List<ChatItem> _items(int from, int to) => <ChatItem>[
  for (var i = from; i < to; i++)
    ChatItem(key: 'k$i', type: ChatItemType.user, text: '消息 $i ${'x' * 60}'),
];

void main() {
  testWidgets('上滑翻页后停止：不会自动继续上滑', (tester) async {
    final transcript = Transcript()
      ..applySnapshot(
        snapshotOf(
          _items(0, 40)
              .map(
                (e) => <String, dynamic>{
                  'key': e.key,
                  'type': 'user',
                  'text': e.text,
                },
              )
              .toList(),
          historyBefore: 'page-a',
        ),
      );
    final actions = _FakeActions(transcript);
    actions.olderPages.addAll(<List<ChatItem>>[
      _items(40, 80),
      _items(80, 120),
    ]);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: TranscriptView(actions: actions)),
      ),
    );
    await tester.pump();

    final view = tester.state<State<TranscriptView>>(
      find.byType(TranscriptView),
    );
    final scroll = tester.widget<CustomScrollView>(
      find.byType(CustomScrollView),
    );
    final controller = scroll.controller!;
    // Sliver 按需估算高度：贴底允许与 maxScrollExtent 有一个“在底部”阈值内的偏差。
    expect(
      controller.position.maxScrollExtent - controller.position.pixels,
      lessThan(49),
    );

    // 连续上滑直到触发翻页。
    for (var i = 0; i < 12; i++) {
      await tester.drag(find.byType(CustomScrollView), const Offset(0, 400));
      await tester.pump();
    }
    await tester.pump(const Duration(milliseconds: 300));
    final afterLoads = actions.olderLoads;
    expect(afterLoads, greaterThan(0));

    // 手指离开后再观察若干帧：位置必须静止。
    final stopped = controller.position.pixels;
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(controller.position.pixels, stopped, reason: '停手后不得自动滚动');

    // 模拟流式输出：用户不在底部时不应被拽动。
    transcript.applyPatch(<String, dynamic>{
      'seq': 1,
      'upserts': <Object>[],
      'streamingAppend': <String, dynamic>{'text': '流式输出' * 200},
    });
    await tester.pump();
    expect(controller.position.pixels, stopped);
    view.toString(); // 保持引用
  });

  testWidgets('在底部时流式输出保持跟随，上滑后停止跟随', (tester) async {
    final transcript = Transcript()
      ..applySnapshot(
        snapshotOf(
          _items(0, 30)
              .map(
                (e) => <String, dynamic>{
                  'key': e.key,
                  'type': 'user',
                  'text': e.text,
                },
              )
              .toList(),
          busy: true,
        ),
      );
    final actions = _FakeActions(transcript);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: TranscriptView(actions: actions)),
      ),
    );
    await tester.pump();

    final scroll = tester.widget<CustomScrollView>(
      find.byType(CustomScrollView),
    );
    final controller = scroll.controller!;
    expect(
      (controller.position.maxScrollExtent - controller.position.pixels).abs(),
      lessThan(49),
      reason: '初始贴底',
    );

    // 流式期间应跟随底部。
    for (var i = 0; i < 5; i++) {
      transcript.applyPatch(<String, dynamic>{
        'seq': i + 1,
        'upserts': <Object>[],
        'streamingAppend': <String, dynamic>{'text': '流式输出' * 300},
      });
      await tester.pump();
    }
    expect(
      controller.position.pixels,
      controller.position.maxScrollExtent,
      reason: '流式期间保持贴底',
    );

    // 用户上滑后不再跟随。
    await tester.drag(find.byType(CustomScrollView), const Offset(0, 500));
    await tester.pump();
    final up = controller.position.pixels;
    expect(up, lessThan(controller.position.maxScrollExtent - 48));
    for (var i = 0; i < 3; i++) {
      transcript.applyPatch(<String, dynamic>{
        'seq': 100 + i,
        'upserts': <Object>[],
        'streamingAppend': <String, dynamic>{'text': '更多输出' * 300},
      });
      await tester.pump();
    }
    expect(controller.position.pixels, up, reason: '离底后不得拽回');
  });

  testWidgets('新建会话：内容不足一屏时上滑不会滚出空白区域', (tester) async {
    final transcript = Transcript()
      ..applySnapshot(snapshotOf(<Map<String, dynamic>>[]));
    final actions = _FakeActions(transcript);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: TranscriptView(actions: actions)),
      ),
    );
    await tester.pump();
    expect(find.text('还没有消息'), findsOneWidget);

    var seq = 0;
    for (var i = 0; i < 3; i++) {
      transcript.applyPatch(<String, dynamic>{
        'seq': ++seq,
        'upserts': <Map<String, dynamic>>[
          userItem('u-$i', '问题 $i'),
          assistantItem('a-$i', '回答 $i'),
        ],
      });
      await tester.pump();
      await tester.pump();
    }
    final controller = tester
        .widget<CustomScrollView>(find.byType(CustomScrollView))
        .controller!;

    // 用力向上滑到顶：第一条消息必须在可视区内，而不是一整屏空白。
    for (var i = 0; i < 4; i++) {
      await tester.drag(find.byType(CustomScrollView), const Offset(0, 600));
      await tester.pump();
    }
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('问题 0'), findsOneWidget);
    expect(controller.position.pixels, controller.position.minScrollExtent);
    final top = tester.getTopLeft(find.text('问题 0')).dy;
    expect(top, lessThan(120), reason: '第一条消息应贴近顶部');
  });

  testWidgets('展开的卡片滚出视口再回来：无异常、内容仍在（Sliver 回收重建）', (tester) async {
    final transcript = Transcript()
      ..applySnapshot(
        snapshotOf(<Map<String, dynamic>>[
          userItem('u-0', '开头'),
          // 中间填充，让卡片可以滚出缓存区。
          for (var i = 0; i < 60; i++)
            <String, dynamic>{'key': 'f$i', 'type': 'user', 'text': '填充 $i'},
          <String, dynamic>{
            'key': 't-bash1',
            'type': 'tool',
            'tool': <String, dynamic>{
              'callId': 'call-1',
              'name': 'bash',
              'summary': 'ls -la',
              'status': 'done',
              'detail': 'cd /tmp && ls -la',
              'result': 'total 0\n${'drwxr-xr-x 1\n' * 10}',
            },
          },
          for (var i = 60; i < 120; i++)
            <String, dynamic>{'key': 'f$i', 'type': 'user', 'text': '填充 $i'},
          userItem('u-end', '结尾'),
        ]),
      );
    final actions = _FakeActions(transcript);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: TranscriptView(actions: actions)),
      ),
    );
    await tester.pump();

    // 展开卡片（显式拖拽主列表，避免命中横向滚动条）。
    final mainScroll = find.byType(CustomScrollView);
    for (var i = 0; i < 40 && find.text('bash').evaluate().isEmpty; i++) {
      await tester.drag(mainScroll, const Offset(0, 500));
      await tester.pump();
    }
    expect(find.text('bash'), findsWidgets);
    await tester.pump();
    await tester.tap(find.text('bash').first);
    await tester.pumpAndSettle();
    expect(find.textContaining('drwxr-xr-x 1'), findsWidgets);

    // 滚到底部使卡片离开视口与缓存区。
    await tester.drag(mainScroll, const Offset(0, -20000));
    await tester.pumpAndSettle();
    expect(find.text('bash'), findsNothing);

    // 滚回卡片：SliverList 重建后内容必须仍然可见且无构建异常。
    await tester.drag(mainScroll, const Offset(0, 20000));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    for (var i = 0; i < 40 && find.text('bash').evaluate().isEmpty; i++) {
      await tester.drag(mainScroll, const Offset(0, -500));
      await tester.pump();
    }
    expect(tester.takeException(), isNull);
    expect(find.text('bash'), findsWidgets);
    await tester.tap(find.text('bash').first);
    await tester.pumpAndSettle();
    expect(find.textContaining('cd /tmp && ls -la'), findsOneWidget);
  });
}
