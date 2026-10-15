import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:neko_mobile/core/rpc/connection_manager.dart';
import 'package:neko_mobile/core/rpc/rpc_client.dart';
import 'package:neko_mobile/core/storage/key_value_store.dart';
import 'package:neko_mobile/features/connect/home_page.dart';
import 'package:neko_mobile/features/connect/scan_controller.dart';
import 'package:neko_mobile/features/connect/scan_page.dart';

import '../../helpers/fake_rpc_client.dart';
import '../../helpers/fakes.dart';

class _HomeHarness {
  _HomeHarness({this.connectScript});

  final Future<NekoRpcClient> Function(FakeRpcClient self)? connectScript;

  final InMemoryKeyValueStore store = InMemoryKeyValueStore();
  final List<FakeRpcClient> clients = <FakeRpcClient>[];
  final List<Completer<void>> sleepGates = <Completer<void>>[];
  late final ConnectionManager manager = ConnectionManager(
    store: store,
    random: () => 0,
    sleep: (delay) {
      final gate = Completer<void>();
      sleepGates.add(gate);
      return gate.future;
    },
    rpcFactory: (computer) {
      final client = FakeRpcClient(connectHandler: connectScript);
      clients.add(client);
      return client;
    },
  );

  Future<void> seedComputer() async {
    await store.write(
      StorageKeys.pairedComputer('srv-1'),
      jsonEncode(kDummyComputer.toJson()),
    );
    await store.write(StorageKeys.lastComputer, 'srv-1');
  }

  void releaseSleeps() {
    for (final gate in List<Completer<void>>.of(sleepGates)) {
      gate.complete();
    }
    sleepGates.clear();
  }
}

Future<void> _pumpHome(WidgetTester tester, _HomeHarness h) async {
  final scanController = ScanController(
    pairingService: FakePairingService(),
    onPaired: h.manager.connectPaired,
  );
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
        connectionManagerProvider.overrideWithValue(h.manager),
        scanControllerProvider.overrideWithValue(scanController),
        scannerBuilderProvider.overrideWithValue(
          ({key, required onDetected, required onCameraError}) =>
              SizedBox(key: key),
        ),
      ],
      child: MaterialApp.router(
        theme: ThemeData(colorSchemeSeed: Colors.blue, useMaterial3: true),
        routerConfig: router,
      ),
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('无已配对记录：显示扫码引导，可进入扫码页', (tester) async {
    final h = _HomeHarness();
    addTearDown(h.manager.dispose);
    await _pumpHome(tester, h);
    await tester.pump();

    expect(find.byKey(const Key('home-idle-text')), findsOneWidget);
    await tester.tap(find.byKey(const Key('home-go-scan')));
    await tester.pumpAndSettle();
    expect(find.text('连接电脑'), findsOneWidget);
  });

  testWidgets('启动恢复：自动连接并显示电脑名与 hello', (tester) async {
    final connectGate = Completer<NekoRpcClient>();
    final h = _HomeHarness(connectScript: (_) => connectGate.future);
    addTearDown(h.manager.dispose);
    await h.seedComputer();
    await _pumpHome(tester, h);

    await h.manager.restore();
    await tester.pump();
    expect(find.byKey(const Key('home-connecting-text')), findsOneWidget);

    connectGate.complete(h.clients.single);
    await tester.pump();
    await tester.pumpAndSettle();

    expect(h.clients, hasLength(1));
    expect(find.byKey(const Key('home-ready-title')), findsOneWidget);
    expect(find.textContaining('已连接 工作机'), findsOneWidget);
    expect(find.byKey(const Key('home-ready-hello')), findsOneWidget);
    expect(find.byKey(const Key('home-ready-capabilities')), findsOneWidget);
  });

  testWidgets('断线后显示离线并自动恢复 hello', (tester) async {
    final h = _HomeHarness();
    addTearDown(h.manager.dispose);
    await h.seedComputer();
    await _pumpHome(tester, h);
    await h.manager.restore();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('home-ready-title')), findsOneWidget);

    h.clients.single.simulateClose(null);
    await tester.pump();
    expect(find.byKey(const Key('home-offline-text')), findsOneWidget);
    expect(find.textContaining('0.8 秒后自动重试'), findsOneWidget);

    h.releaseSleeps();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('home-ready-title')), findsOneWidget);
  });

  testWidgets('回前台触发恢复：不等待退避', (tester) async {
    final h = _HomeHarness();
    addTearDown(h.manager.dispose);
    await h.seedComputer();
    await _pumpHome(tester, h);
    await h.manager.restore();
    await tester.pumpAndSettle();

    h.clients.single.simulateClose(null);
    await tester.pump();
    expect(find.byKey(const Key('home-offline-text')), findsOneWidget);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('home-ready-title')), findsOneWidget);
  });

  testWidgets('4401 显示 revoked 指引且不再自动重试', (tester) async {
    final h = _HomeHarness();
    addTearDown(h.manager.dispose);
    await h.seedComputer();
    await _pumpHome(tester, h);
    await h.manager.restore();
    await tester.pumpAndSettle();

    h.clients.single.simulateClose(4401);
    await tester.pump();

    expect(find.byKey(const Key('home-revoked-title')), findsOneWidget);
    expect(find.byKey(const Key('home-revoked-guidance')), findsOneWidget);
    expect(find.byKey(const Key('home-revoked-scan')), findsOneWidget);

    // 回到前台也不重试。
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('home-revoked-title')), findsOneWidget);
    expect(h.clients, hasLength(1));
  });

  testWidgets('证书不符显示 trustChanged 指引，可返回扫码页', (tester) async {
    final h = _HomeHarness(
      connectScript: (_) async => throw const RpcCertificateException(),
    );
    addTearDown(h.manager.dispose);
    await h.seedComputer();
    await _pumpHome(tester, h);
    await h.manager.restore();
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('home-trust-changed-title')), findsOneWidget);
    expect(
      find.byKey(const Key('home-trust-changed-guidance')),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('home-trust-changed-scan')));
    await tester.pumpAndSettle();
    expect(find.text('连接电脑'), findsOneWidget);
  });
}
