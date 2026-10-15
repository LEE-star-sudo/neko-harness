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

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('真机：配对、会话、流式、审批、子 agent、排队与停止、长内容', (tester) async {
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

    // 1. 粘贴配对文本 → 确认 → 连接就绪。
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

    // 2. 新建会话并收到流式回答。
    await pumpUntil(tester, find.byKey(const Key('empty-new-session')));
    await tester.tap(find.byKey(const Key('empty-new-session')));
    await pumpUntil(tester, find.byKey(const Key('composer-input')));
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
}
