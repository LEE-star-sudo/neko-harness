import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/rpc/rpc_client.dart';
import 'package:neko_mobile/ui/neko_icons.dart';

import '../../helpers/chat_harness.dart';
import '../../helpers/interaction_data.dart';
import '../../helpers/interaction_ui.dart';

void main() {
  late ChatHarness h;

  setUp(() => h = ChatHarness());
  tearDown(() => h.dispose());

  Future<void> pump(WidgetTester tester, {double textScale = 1}) async {
    await h.bind(capabilities: kInteractionCaps);
    await tester.pumpWidget(h.build(textScale: textScale));
    await settle(tester);
  }

  NekoIconData iconOf(WidgetTester tester, String id) => tester
      .widget<NekoIcon>(
        find.descendant(
          of: find.byKey(Key('todo-item-$id')),
          matching: find.byType(NekoIcon),
        ),
      )
      .icon;

  testWidgets('进度入口：非空时显示 已完成/总数，点击打开只读列表', (tester) async {
    h.todoList = fixtureTodos();
    await pump(tester);
    expect(find.byKey(const Key('todo-entry')), findsOneWidget);
    expect(find.text('1/3'), findsOneWidget);
    expect(h.api.callsOf('todos.get'), hasLength(1));

    await tester.tap(find.byKey(const Key('todo-entry')));
    await transition(tester);
    expect(find.byKey(const Key('todo-sheet')), findsOneWidget);
    expect(find.text('待办 · 已完成 1/3'), findsOneWidget);
    // 有序，且不是可编辑控件。
    final order = <String>['inspect', 'design', 'verify'];
    final tops = <double>[
      for (final id in order)
        tester.getTopLeft(find.byKey(Key('todo-item-$id'))).dy,
    ];
    expect(tops, <double>[...tops]..sort());
    expect(find.byType(Checkbox), findsNothing);
    expect(find.byType(TextField), findsOneWidget, reason: '只有聊天输入框');
  });

  testWidgets('三态可区分：图标形状、状态文字与删除线', (tester) async {
    h.todoList = fixtureTodos();
    await pump(tester);
    await tester.tap(find.byKey(const Key('todo-entry')));
    await transition(tester);
    expect(iconOf(tester, 'inspect'), NekoIcons.checkCircle);
    expect(iconOf(tester, 'design'), NekoIcons.radioOn);
    expect(iconOf(tester, 'verify'), NekoIcons.radioOff);
    expect(find.text('已完成'), findsOneWidget);
    expect(find.text('进行中'), findsOneWidget);
    expect(find.text('待办'), findsOneWidget);
    final done = tester.widget<Text>(find.text('阅读现有会话存储'));
    expect(done.style?.decoration, TextDecoration.lineThrough);
    final running = tester.widget<Text>(find.text('设计迁移步骤'));
    expect(running.style?.fontWeight, FontWeight.w600);
    final handle = tester.ensureSemantics();
    expect(find.bySemanticsLabel('进行中：设计迁移步骤'), findsOneWidget);
    handle.dispose();
  });

  testWidgets('空列表：不占用入口；清空后入口消失', (tester) async {
    await pump(tester);
    expect(find.byKey(const Key('todo-entry')), findsNothing);
    h.todoList = fixtureTodos();
    h.api.notify('todos.changed', <String, dynamic>{
      'subscriptionId': 'chat-1',
      'revision': 5,
    });
    await settle(tester);
    expect(find.byKey(const Key('todo-entry')), findsOneWidget);
    h.todoList = todoListJson(6, <Map<String, dynamic>>[]);
    h.api.notify('todos.changed', <String, dynamic>{
      'subscriptionId': 'chat-1',
      'revision': 6,
    });
    await settle(tester);
    expect(find.byKey(const Key('todo-entry')), findsNothing);
  });

  testWidgets('旧电脑：隐藏入口，不请求 todos.get', (tester) async {
    h.todoList = fixtureTodos();
    await h.bind();
    await tester.pumpWidget(h.build());
    await settle(tester);
    expect(find.byKey(const Key('todo-entry')), findsNothing);
    expect(h.api.callsOf('todos.get'), isEmpty);
  });

  testWidgets('跟随已提交状态实时更新（sheet 打开时也更新）', (tester) async {
    h.todoList = fixtureTodos();
    await pump(tester);
    await tester.tap(find.byKey(const Key('todo-entry')));
    await transition(tester);
    h.todoList = todoListJson(5, <Map<String, dynamic>>[
      todoItem('inspect', '阅读现有会话存储', 'completed'),
      todoItem('design', '设计迁移步骤', 'completed'),
      todoItem('verify', '运行回归测试', 'in_progress'),
    ]);
    h.api.notify('todos.changed', <String, dynamic>{
      'subscriptionId': 'chat-1',
      'revision': 5,
    });
    await settle(tester);
    expect(find.text('待办 · 已完成 2/3'), findsOneWidget);
    expect(iconOf(tester, 'verify'), NekoIcons.radioOn);
    expect(iconOf(tester, 'design'), NekoIcons.checkCircle);
  });

  testWidgets('长文本完整可见，长列表可滚动到最后一项', (tester) async {
    tester.view
      ..physicalSize = const Size(360, 640)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final long = '很长的待办内容' * 36; // 252 个码元，需换行显示
    h.todoList = todoListJson(
      2,
      <Map<String, dynamic>>[
        todoItem('long', long, 'in_progress'),
        for (var i = 0; i < 100; i++) todoItem('t$i', '第 $i 项', 'pending'),
      ].sublist(0, 100),
    );
    await pump(tester, textScale: 1.5);
    await tester.tap(find.byKey(const Key('todo-entry')));
    await transition(tester);
    expect(tester.takeException(), isNull);
    // 全文都在（没有 ellipsis / maxLines 截断）。
    final text = tester.widget<Text>(find.text(long));
    expect(text.maxLines, isNull);
    expect(text.overflow, isNull);
    expect(tester.getSize(find.text(long)).height, greaterThan(100));
    await tester.dragUntilVisible(
      find.byKey(const Key('todo-item-t98')),
      find.byKey(const Key('todo-sheet')),
      const Offset(0, -300),
    );
    expect(find.byKey(const Key('todo-item-t98')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('离线：已加载内容仍可查看但明确标注离线、不当作最新', (tester) async {
    h.todoList = fixtureTodos();
    await pump(tester);
    h.chat.unbind();
    await settle(tester);
    // 入口仍在（已加载内容），语义标注“非最新”。
    final handle = tester.ensureSemantics();
    expect(find.bySemanticsLabel('待办进度 1/3（非最新）'), findsOneWidget);
    handle.dispose();
    await tester.tap(find.byKey(const Key('todo-entry')));
    await transition(tester);
    expect(find.byKey(const Key('todo-offline')), findsOneWidget);
    expect(find.textContaining('不一定是最新状态'), findsOneWidget);
    expect(find.byKey(const Key('todo-item-design')), findsOneWidget);

    // 重连后重新查询，离线标记消失。
    h.todoList = todoListJson(7, <Map<String, dynamic>>[
      todoItem('inspect', '阅读现有会话存储', 'completed'),
    ]);
    await h.chat.bind(h.api, 'srv', capabilities: kInteractionCaps);
    await settle(tester);
    expect(find.byKey(const Key('todo-offline')), findsNothing);
    expect(find.byKey(const Key('todo-item-design')), findsNothing);
    expect(find.text('待办 · 已完成 1/1'), findsOneWidget);
  });

  testWidgets('读取失败：不把未知内容显示成空列表（入口不出现），错误可查询', (tester) async {
    h.api.on('todos.get', (_) => throw const RpcNetworkException());
    await pump(tester);
    expect(find.byKey(const Key('todo-entry')), findsNothing);
    expect(h.chat.interactions.todosError, isNotNull);
  });
}
