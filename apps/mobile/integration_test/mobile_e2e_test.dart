// 真机端到端回归（需要 scripts/mobile-e2e-gateway.ts --serve-pairing 8325 正在运行）：
//   adb reverse tcp:8325 tcp:8325
//   flutter test integration_test/mobile_e2e_test.dart -d <设备>
// 测试经回环向电脑取新鲜配对文本（配对码 120 s 有效，不能在构建时注入），之后
// 走真实局域网 TLS 指纹绑定、配对、WSS 与 JSON-RPC；凭据与偏好使用内存存储。
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:neko_mobile/core/api/models.dart';
import 'package:neko_mobile/core/pairing/pairing_service.dart';
import 'package:neko_mobile/core/rpc/connection_manager.dart';
import 'package:neko_mobile/core/rpc/rpc_client.dart';
import 'package:neko_mobile/core/storage/key_value_store.dart';
import 'package:neko_mobile/core/storage/prefs_store.dart';
import 'package:neko_mobile/features/app_controller.dart';
import 'package:neko_mobile/features/chat/chat_controller.dart';
import 'package:neko_mobile/features/connect/scan_controller.dart';
import 'package:neko_mobile/features/connect/scan_page.dart';
import 'package:neko_mobile/features/sessions/sessions_controller.dart';
import 'package:neko_mobile/main.dart';
import 'package:neko_mobile/ui/neko_icons.dart';

/// 经 `adb reverse` 从电脑取一个新生成的配对文本。
Future<String> fetchPairingText() async {
  final client = HttpClient();
  try {
    final request = await client.getUrl(
      Uri.parse('http://127.0.0.1:8325/pairing'),
    );
    final response = await request.close();
    final text = await response.transform(utf8.decoder).join();
    if (!text.startsWith('nekopair:1:')) {
      throw TestFailure('配对文本无效：$text');
    }
    return text;
  } finally {
    client.close(force: true);
  }
}

Future<void> pumpUntil(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 100));
    if (finder.evaluate().isNotEmpty) return;
  }
  throw TestFailure('等待超时：$finder');
}

Future<void> send(WidgetTester tester, String text) async {
  await tester.enterText(find.byKey(const Key('composer-input')), text);
  await tester.pump(const Duration(milliseconds: 200));
  await tester.tap(find.byKey(const Key('composer-send')));
  await tester.pump(const Duration(milliseconds: 200));
}

class _Phone {
  _Phone({required this.manager, required this.app});

  final ConnectionManager manager;
  final AppController app;
}

/// 启动 App（内存存储）→ 粘贴配对文本 → 确认 → 连接就绪 → 新建会话。
// ignore: library_private_types_in_public_api
Future<_Phone> pairAndOpenSession(WidgetTester tester) async {
  final store = InMemoryKeyValueStore();
  final prefs = InMemoryPrefsStore();
  final manager = ConnectionManager(
    store: store,
    rpcFactory: (computer) => NekoRpcClient(
      computer: computer,
      clientFactory: defaultPinnedClientFactory,
    ),
  );
  final scan = ScanController(
    pairingService: LocalPairingService(
      store: store,
      clientFactory: defaultPinnedClientFactory,
    ),
    onPaired: manager.connectPaired,
  );
  final app = AppController(
    manager: manager,
    sessions: SessionsController(prefs: prefs),
    chat: ChatController(prefs: prefs),
    prefs: prefs,
  );
  await app.start();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        connectionManagerProvider.overrideWithValue(manager),
        scanControllerProvider.overrideWithValue(scan),
        appControllerOrNullProvider.overrideWithValue(app),
        scannerBuilderProvider.overrideWithValue(
          ({key, required onDetected, required onCameraError}) =>
              SizedBox(key: key),
        ),
      ],
      child: const NekoApp(),
    ),
  );
  await manager.restore();
  await tester.pump();

  // 粘贴配对文本 → 确认 → 连接就绪。
  await tester.tap(find.byKey(const Key('home-go-scan')));
  await pumpUntil(tester, find.byKey(const Key('paste-field')));
  final pairing = await tester.runAsync(fetchPairingText);
  await tester.enterText(find.byKey(const Key('paste-field')), pairing!);
  await tester.tap(find.byKey(const Key('paste-submit-button')));
  await pumpUntil(tester, find.byKey(const Key('confirm-pair-button')));
  expect(find.text('E2E-Mac'), findsWidgets);
  await tester.tap(find.byKey(const Key('confirm-pair-button')));
  await pumpUntil(tester, find.byKey(const Key('chat-title')));
  expect(manager.state, isA<NekoConnReady>());

  // 新建会话。
  await pumpUntil(tester, find.byKey(const Key('empty-new-session')));
  await tester.tap(find.byKey(const Key('empty-new-session')));
  await pumpUntil(tester, find.byKey(const Key('composer-input')));
  return _Phone(manager: manager, app: app);
}

/// 条件成立才返回（用于等待控制器状态而非控件）。
Future<void> pumpUntilTrue(
  WidgetTester tester,
  bool Function() condition, {
  String what = '条件',
  Duration timeout = const Duration(seconds: 30),
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 100));
    if (condition()) return;
  }
  throw TestFailure('等待超时：$what');
}

Future<void> pumpUntilGone(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 10),
}) => pumpUntilTrue(
  tester,
  () => finder.evaluate().isEmpty,
  what: '消失：$finder',
  timeout: timeout,
);

/// 问题 sheet：输入已清空且未聚焦时会自动展开，否则只有问题条——两种都要能进入。
Future<void> ensureQuestionSheet(WidgetTester tester) async {
  await pumpUntil(tester, find.byKey(const Key('question-bar')));
  await tester.pump(const Duration(milliseconds: 500));
  if (find.byKey(const Key('question-sheet')).evaluate().isEmpty) {
    await tester.tap(find.byKey(const Key('question-bar')));
  }
  await pumpUntil(tester, find.byKey(const Key('question-sheet')));
  await pumpUntil(tester, find.byKey(const Key('question-input')));
}

bool optionIsSelected(WidgetTester tester, String id) {
  final icon = tester.widget<NekoIcon>(
    find.descendant(
      of: find.byKey(Key('question-option-$id')),
      matching: find.byType(NekoIcon),
    ),
  );
  return icon.icon == NekoIcons.radioOn || icon.icon == NekoIcons.checkboxOn;
}

/// 转录里已结算的 ask_user 条目（以电脑返回的结构化状态为准）。
List<AskUserInteraction> askedQuestions(AppController app) =>
    <AskUserInteraction>[
      for (final item in app.chat.transcript.items)
        if (item.tool?.interaction case final AskUserInteraction ask) ask,
    ];

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('真机：配对、会话、流式、审批、子 agent、排队与停止、长内容', (tester) async {
    final phone = await pairAndOpenSession(tester);
    final manager = phone.manager;
    final app = phone.app;

    // 2. 收到流式回答。
    await send(tester, '你好，手机');
    await pumpUntil(
      tester,
      find.textContaining('pong: 你好，手机', findRichText: true),
    );

    // 3. 委派：子 agent 请求审批，手机批准后主会话总结。
    await send(tester, '请委派一个子 agent');
    await pumpUntil(tester, find.byKey(const Key('approval-bar')));
    await tester.tap(find.byKey(const Key('approval-bar')));
    await pumpUntil(tester, find.textContaining('echo neko-e2e-approved'));
    final allow = find.byWidgetPredicate(
      (w) =>
          w.key is ValueKey<String> &&
          (w.key! as ValueKey<String>).value.startsWith('approval-allow-'),
    );
    await tester.ensureVisible(allow.first);
    await tester.tap(allow.first);
    await pumpUntil(tester, find.text('已允许'));
    await tester.tapAt(const Offset(20, 40));
    await pumpUntil(tester, find.textContaining('主会话总结', findRichText: true));

    // 4. 打开子详情，看到 bash 结果后返回，主草稿保留。
    await tester.enterText(find.byKey(const Key('composer-input')), '主草稿');
    final openChild = find.byWidgetPredicate(
      (w) =>
          w.key is ValueKey<String> &&
          (w.key! as ValueKey<String>).value.startsWith('open-subagent-'),
    );
    await pumpUntil(tester, openChild);
    await tester.tap(openChild.first);
    await pumpUntil(
      tester,
      find.textContaining('子 agent 报告', findRichText: true),
    );
    await tester.pageBack();
    await pumpUntil(tester, find.byKey(const Key('composer-input')));
    expect(app.chat.input.text, '主草稿');

    // 5. 忙碌时排队，然后停止当前运行；排队输入随后被处理。
    await send(tester, '慢一点回答');
    await pumpUntil(tester, find.byKey(const Key('composer-stop')));
    await send(tester, '排队的消息');
    expect(app.chat.pending, isEmpty);
    await tester.tap(find.byKey(const Key('composer-stop')));
    await pumpUntil(
      tester,
      find.textContaining('pong: 排队的消息', findRichText: true),
    );

    // 6. 长回答经 contentRef 展开全文。
    await send(tester, '来个长回答');
    final expand = find.byWidgetPredicate(
      (w) =>
          w.key is ValueKey<String> &&
          (w.key! as ValueKey<String>).value.startsWith('expand-'),
    );
    await pumpUntil(tester, expand);
    await tester.ensureVisible(expand.last);
    await tester.tap(expand.last);
    await pumpUntil(tester, find.textContaining('长回答结束', findRichText: true));

    manager.dispose();
  });

  testWidgets('真机：待办进度、单选/多选提问与回答、关闭不结算、重连后重新同步', (tester) async {
    final phone = await pairAndOpenSession(tester);
    final manager = phone.manager;
    final app = phone.app;
    expect(
      manager.state is NekoConnReady &&
          (manager.state as NekoConnReady).hello.capabilities
              .toSet()
              .containsAll(<String>['todos', 'questions']),
      isTrue,
      reason: '电脑端 hello 声明 todos / questions 能力',
    );
    // 空列表不占用入口。
    expect(find.byKey(const Key('todo-entry')), findsNothing);

    // 1. 手机可见 Todo：进度 1/3，只读列表三态。
    await send(tester, '请更新待办');
    await pumpUntil(tester, find.byKey(const Key('todo-entry')));
    await pumpUntil(tester, find.textContaining('待办已更新', findRichText: true));
    expect(
      tester.widget<Text>(find.byKey(const Key('todo-progress'))).data,
      '1/3',
    );
    await tester.tap(find.byKey(const Key('todo-entry')));
    await pumpUntil(tester, find.byKey(const Key('todo-sheet')));
    expect(find.text('待办 · 已完成 1/3'), findsOneWidget);
    for (final (id, text, state) in <(String, String, String)>[
      ('read', '阅读现有实现', '已完成'),
      ('design', '设计迁移步骤', '进行中'),
      ('verify', '运行回归测试', '待办'),
    ]) {
      final row = find.byKey(Key('todo-item-$id'));
      expect(row, findsOneWidget, reason: id);
      expect(
        find.descendant(of: row, matching: find.text(text)),
        findsOneWidget,
      );
      expect(
        find.descendant(of: row, matching: find.text(state)),
        findsOneWidget,
      );
    }
    await tester.tapAt(const Offset(20, 40));
    await pumpUntilGone(tester, find.byKey(const Key('todo-sheet')));

    // 2. 单选提问：推荐只是标记、没有预选；点选与关闭都不结算。
    await send(tester, '请提问');
    await ensureQuestionSheet(tester);
    expect(find.text('助手提问'), findsWidgets);
    expect(
      tester.widget<Text>(find.byKey(const Key('question-text'))).data,
      '使用哪种数据库？',
    );
    expect(find.byKey(const Key('question-recommended-pg')), findsOneWidget);
    expect(find.text('嵌入式，无需服务'), findsOneWidget);
    for (final id in <String>['pg', 'my', 'lite']) {
      expect(optionIsSelected(tester, id), isFalse, reason: '$id 不应预选');
    }
    await tester.tap(find.byKey(const Key('question-option-lite')));
    await tester.pump(const Duration(milliseconds: 200));
    expect(optionIsSelected(tester, 'lite'), isTrue);
    expect(find.byKey(const Key('question-final')), findsNothing);
    await tester.tap(find.byKey(const Key('question-close')));
    await pumpUntilGone(tester, find.byKey(const Key('question-sheet')));
    expect(
      find.byKey(const Key('question-bar')),
      findsOneWidget,
      reason: '关闭只是关闭，问题仍在等待回答',
    );
    expect(app.chat.interactions.pendingCount, 1);
    expect(askedQuestions(app).last.status, QuestionStatus.pending);

    // 重新打开：选择保留；补充文字后显式提交（选项与文字是独立字段）。
    await tester.tap(find.byKey(const Key('question-bar')));
    await pumpUntil(tester, find.byKey(const Key('question-sheet')));
    await pumpUntil(tester, find.byKey(const Key('question-input')));
    expect(optionIsSelected(tester, 'lite'), isTrue);
    await tester.enterText(
      find.byKey(const Key('question-input')),
      '先用 SQLite',
    );
    await tester.pump(const Duration(milliseconds: 200));
    await tester.tap(find.byKey(const Key('question-submit')));
    await pumpUntil(tester, find.byKey(const Key('question-final')));
    expect(find.text('已回答'), findsOneWidget);
    expect(find.text('选择：SQLite'), findsOneWidget);
    expect(find.text('文字：先用 SQLite'), findsOneWidget);
    await tester.tap(find.byKey(const Key('question-done')));
    await pumpUntilGone(tester, find.byKey(const Key('question-sheet')));
    // 同一次工具调用继续：模型收到答案后回复（含工具结果文案）。
    await pumpUntil(tester, find.textContaining('提问结束', findRichText: true));
    expect(find.byKey(const Key('question-bar')), findsNothing);
    expect(app.chat.pending, isEmpty, reason: '回答不是聊天提交，没有待确认发送');
    final single = askedQuestions(app).last;
    expect(single.status, QuestionStatus.answered);
    expect(single.optionIds, <String>['lite']);
    expect(single.text, '先用 SQLite');

    // 3. 多选提问：选两项后关闭，经真实 WSS 重连并重新 attach/查询。
    await send(tester, '请多选');
    await ensureQuestionSheet(tester);
    expect(
      tester.widget<Text>(find.byKey(const Key('question-text'))).data,
      '需要哪些数据库？',
    );
    expect(find.text('可多选'), findsOneWidget);
    await tester.tap(find.byKey(const Key('question-option-pg')));
    await tester.tap(find.byKey(const Key('question-option-my')));
    await tester.pump(const Duration(milliseconds: 200));
    expect(optionIsSelected(tester, 'pg'), isTrue);
    expect(optionIsSelected(tester, 'my'), isTrue);
    await tester.tap(find.byKey(const Key('question-close')));
    await pumpUntilGone(tester, find.byKey(const Key('question-sheet')));

    final computer = manager.computer!;
    await manager.connectPaired(computer);
    await pumpUntilTrue(
      tester,
      () => manager.state is NekoConnReady && app.chat.canControl,
      what: '重连并重新 attach',
    );
    await pumpUntilTrue(
      tester,
      () =>
          app.chat.interactions.connected &&
          app.chat.interactions.pendingCount == 1 &&
          app.chat.interactions.todosCurrent,
      what: '重连后重新查询问题与待办',
    );
    expect(find.byKey(const Key('question-bar')), findsOneWidget);
    expect(
      tester.widget<Text>(find.byKey(const Key('todo-progress'))).data,
      '1/3',
      reason: '重连后待办重新读取，仍可见',
    );
    expect(askedQuestions(app).last.status, QuestionStatus.pending);

    // 重连后问题仍未决（没有被自动结算/重发），草稿还在，由用户显式提交。
    await tester.tap(find.byKey(const Key('question-bar')));
    await pumpUntil(tester, find.byKey(const Key('question-sheet')));
    await pumpUntil(tester, find.byKey(const Key('question-input')));
    expect(optionIsSelected(tester, 'pg'), isTrue);
    expect(optionIsSelected(tester, 'my'), isTrue);
    await tester.tap(find.byKey(const Key('question-submit')));
    await pumpUntil(tester, find.byKey(const Key('question-final')));
    expect(find.text('选择：PostgreSQL、MySQL'), findsOneWidget);
    await tester.tap(find.byKey(const Key('question-done')));
    await pumpUntilGone(tester, find.byKey(const Key('question-sheet')));
    await pumpUntilTrue(
      tester,
      () => app.chat.transcript.items.any(
        (item) =>
            item.type == ChatItemType.assistant &&
            item.text.startsWith('提问结束') &&
            item.text.contains('PostgreSQL') &&
            item.text.contains('MySQL'),
      ),
      what: '模型收到多选答案后继续',
    );

    // 4. 回答后再次重连：电脑上的最终状态（已回答、无未决问题）经重新 attach 同步到手机。
    await manager.connectPaired(computer);
    await pumpUntilTrue(
      tester,
      () =>
          manager.state is NekoConnReady &&
          app.chat.canControl &&
          app.chat.interactions.todosCurrent &&
          app.chat.interactions.questionsLoaded,
      what: '第二次重连并重新查询',
    );
    expect(app.chat.interactions.pendingCount, 0);
    expect(find.byKey(const Key('question-bar')), findsNothing);
    final answered = askedQuestions(app);
    expect(
      answered.map((q) => q.status),
      everyElement(QuestionStatus.answered),
    );
    expect(answered.last.optionIds, <String>['pg', 'my']);
    expect(app.chat.interactions.todos?.completed, 1);

    manager.dispose();
  });
}
