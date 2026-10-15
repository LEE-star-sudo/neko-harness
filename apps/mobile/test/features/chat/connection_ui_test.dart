import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:neko_mobile/core/rpc/connection_manager.dart';
import 'package:neko_mobile/core/rpc/rpc_client.dart';
import 'package:neko_mobile/core/storage/key_value_store.dart';
import 'package:neko_mobile/core/storage/prefs_store.dart';
import 'package:neko_mobile/features/app_controller.dart';
import 'package:neko_mobile/features/chat/chat_controller.dart';
import 'package:neko_mobile/features/connect/home_page.dart';
import 'package:neko_mobile/features/connect/scan_controller.dart';
import 'package:neko_mobile/features/connect/scan_page.dart';
import 'package:neko_mobile/features/sessions/sessions_controller.dart';
import 'package:neko_mobile/ui/theme.dart';

import '../../helpers/fake_api.dart';
import '../../helpers/fake_rpc_client.dart';
import '../../helpers/fakes.dart';

/// 经理驱动的整树夹具：HomePage 门控 + 路由 + FakeRpcClient 连接；
/// 业务控制器经 FakeMobileApi 绑定并附着会话（与真实 Ready 后的形态一致）。
class _ConnHarness {
  _ConnHarness() {
    manager = ConnectionManager(
      store: InMemoryKeyValueStore(),
      random: () => 0,
      sleep: (delay) {
        final gate = Completer<void>();
        sleepGates.add(gate);
        return gate.future;
      },
      rpcFactory: (_) {
        final client = FakeRpcClient(
          connectHandler: connectScripts.isEmpty
              ? null
              : connectScripts.removeAt(0),
        );
        clients.add(client);
        return client;
      },
    );
    app = AppController(
      manager: manager,
      sessions: SessionsController(prefs: prefs),
      chat: ChatController(prefs: prefs),
      prefs: prefs,
    );
    api
      ..on(
        'workspaces.list',
        (_) => <String, dynamic>{
          'workspaces': <Object>[
            <String, dynamic>{'root': '/a/neko', 'name': 'neko'},
          ],
        },
      )
      ..on(
        'sessions.list',
        (_) => <String, dynamic>{
          'sessions': <Object>[
            <String, dynamic>{
              'id': '7',
              'workspace': '/a/neko',
              'title': '修复登录页',
              'preview': '登录页按钮错位',
              'lastUsedAt': 0,
            },
          ],
        },
      )
      ..on('approvals.list', (_) => <String, dynamic>{'approvals': <Object>[]})
      ..on(
        'chat.attach',
        (params) => <String, dynamic>{
          'subscriptionId': 'chat-1',
          'sessionId': params!['sessionId'],
          'snapshot': snapshotOf(<Map<String, dynamic>>[userItem('u-1', '你好')]),
        },
      );
  }

  final InMemoryPrefsStore prefs = InMemoryPrefsStore();
  final FakeMobileApi api = FakeMobileApi();
  final List<FakeRpcClient> clients = <FakeRpcClient>[];
  final List<Completer<void>> sleepGates = <Completer<void>>[];

  /// 依次覆盖后续新建 client 的 connect 行为（为空则立即成功）。
  final List<Future<NekoRpcClient> Function(FakeRpcClient)> connectScripts =
      <Future<NekoRpcClient> Function(FakeRpcClient)>[];
  late final ConnectionManager manager;
  late final AppController app;

  Future<void> ready(WidgetTester tester) async {
    await manager.connectPaired(kDummyComputer);
    await settle(tester);
    // 与真实链路一致：就绪后绑定业务并恢复会话。
    await app.sessions.bind(api, 'srv-1');
    await app.chat.bind(api, 'srv-1');
    await app.chat.attach('7');
    await settle(tester);
  }

  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 1));
    }
  }

  Future<void> pump(WidgetTester tester) async {
    final router = GoRouter(
      initialLocation: '/',
      routes: <RouteBase>[
        GoRoute(path: '/', builder: (context, state) => const HomePage()),
        GoRoute(path: '/scan', builder: (context, state) => const ScanPage()),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          connectionManagerProvider.overrideWithValue(manager),
          scanControllerProvider.overrideWithValue(
            ScanController(
              pairingService: FakePairingService(),
              onPaired: (_) async {},
            ),
          ),
          scannerBuilderProvider.overrideWithValue(
            ({key, required onDetected, required onCameraError}) =>
                SizedBox(key: key),
          ),
          appControllerOrNullProvider.overrideWithValue(app),
        ],
        child: MaterialApp.router(
          theme: buildNekoTheme(Brightness.light),
          routerConfig: router,
        ),
      ),
    );
    await tester.pump();
  }

  void dispose() {
    app.dispose();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late _ConnHarness h;

  setUp(() => h = _ConnHarness());
  tearDown(() => h.dispose());

  testWidgets('在线：指示器显示在线，无状态条', (tester) async {
    await h.pump(tester);
    await h.ready(tester);
    expect(find.byTooltip('在线'), findsOneWidget);
    expect(find.byKey(const Key('connection-banner')), findsNothing);
    // 在线只显示小圆点，不占文字；点击热区仍 >=44dp。
    expect(find.byKey(const Key('connection-indicator-label')), findsNothing);
    final size = tester.getSize(find.byKey(const Key('connection-indicator')));
    expect(size.width, greaterThanOrEqualTo(44));
    expect(size.height, greaterThanOrEqualTo(44));
  });

  testWidgets('异常态显示文字并保留语义标签', (tester) async {
    final semantics = tester.ensureSemantics();
    await h.pump(tester);
    await h.ready(tester);
    expect(find.bySemanticsLabel('在线'), findsOneWidget);

    h.clients.single.simulateClose(null);
    await tester.pump();
    expect(find.byKey(const Key('connection-indicator-label')), findsOneWidget);
    expect(find.bySemanticsLabel('离线'), findsWidgets);
    semantics.dispose();
  });

  testWidgets('断线：指示器与状态条即时变离线，点指示器立即重连', (tester) async {
    await h.pump(tester);
    await h.ready(tester);
    expect(find.byTooltip('在线'), findsOneWidget);

    h.clients.single.simulateClose(null);
    await tester.pump();
    expect(find.text('离线'), findsOneWidget);
    expect(find.byKey(const Key('connection-banner')), findsOneWidget);
    expect(find.textContaining('秒后重试'), findsOneWidget);

    // 手动重连：立即发起新连接，不等待退避。
    await tester.tap(find.byKey(const Key('connection-indicator')));
    await tester.pump();
    expect(h.clients, hasLength(2));
    expect(find.byTooltip('在线'), findsOneWidget);
  });

  testWidgets('重连中：指示器显示重连中，状态条可立即重连', (tester) async {
    final reconnectGate = Completer<NekoRpcClient>();
    h.connectScripts
      ..add((self) async => self) // 初始连接立即成功
      ..add((_) => reconnectGate.future); // 重连挂起，便于观察重连中
    await h.pump(tester);
    await h.ready(tester);

    h.clients.single.simulateClose(null);
    await tester.pump();
    expect(find.text('离线'), findsOneWidget);

    // 模拟回到前台：立即重试，进入重连中。
    h.manager.onForeground();
    await tester.pump();
    expect(find.text('重连中'), findsOneWidget);
    expect(find.text('立即重连'), findsOneWidget);

    // 放行后恢复在线。
    reconnectGate.complete(h.clients[1]);
    await h.settle(tester);
    expect(find.byTooltip('在线'), findsOneWidget);
  });

  testWidgets('终态 revoked：显示引导页且不再重试', (tester) async {
    await h.pump(tester);
    await h.ready(tester);

    h.clients.single.simulateClose(4401);
    await tester.pump();
    await h.settle(tester);

    expect(find.text('设备授权已被电脑撤销'), findsOneWidget);
    expect(find.text('重新扫码配对'), findsOneWidget);
    expect(h.clients, hasLength(1), reason: '终态不得新建连接');
  });

  testWidgets('冷启动恢复：有已配对记录自动连接（restore 链路）', (tester) async {
    // 直接播种存储，模拟上次配对后的冷启动。
    final connectGate = Completer<NekoRpcClient>();
    h.connectScripts.add((_) => connectGate.future);
    await h.manager.store.write(
      StorageKeys.pairedComputer('srv-1'),
      jsonEncode(kDummyComputer.toJson()),
    );
    await h.manager.store.write(StorageKeys.lastComputer, 'srv-1');
    await h.pump(tester);
    await h.manager.restore();
    await tester.pump();
    expect(find.byKey(const Key('home-connecting-text')), findsOneWidget);

    connectGate.complete(h.clients.single);
    await h.settle(tester);
    expect(find.byTooltip('在线'), findsOneWidget);
  });
}
