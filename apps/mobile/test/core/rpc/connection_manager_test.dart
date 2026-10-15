import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/rpc/connection_manager.dart';
import 'package:neko_mobile/core/rpc/rpc_client.dart';
import 'package:neko_mobile/core/storage/key_value_store.dart';

import '../../helpers/fake_rpc_client.dart';

typedef ConnectScript = Future<NekoRpcClient> Function(FakeRpcClient self);

class _Harness {
  _Harness({this.connectScripts, double random = 0}) {
    manager = ConnectionManager(
      store: store,
      random: () => random,
      sleep: (delay) {
        sleeps.add(delay);
        final gate = Completer<void>();
        _sleepGates.add(gate);
        return gate.future;
      },
      rpcFactory: (computer) {
        final scripts = connectScripts;
        ConnectScript? script;
        if (scripts != null && _scriptIndex < scripts.length) {
          script = scripts[_scriptIndex];
        }
        _scriptIndex++;
        final client = FakeRpcClient(connectHandler: script);
        clients.add(client);
        return client;
      },
    );
  }

  final InMemoryKeyValueStore store = InMemoryKeyValueStore();
  final List<ConnectScript>? connectScripts;
  var _scriptIndex = 0;
  final List<FakeRpcClient> clients = <FakeRpcClient>[];
  final List<Duration> sleeps = <Duration>[];
  final List<Completer<void>> _sleepGates = <Completer<void>>[];
  late final ConnectionManager manager;

  Future<void> seedComputer() async {
    await store.write(
      StorageKeys.pairedComputer('srv-1'),
      jsonEncode(kDummyComputer.toJson()),
    );
    await store.write(StorageKeys.lastComputer, 'srv-1');
  }

  int get pendingSleeps => _sleepGates.length;

  /// 放行最早的一次退避等待。
  void releaseNextSleep() {
    _sleepGates.removeAt(0).complete();
  }

  /// 等待 manager 内部的 unawaited 尝试推进。
  Future<void> settle([int times = 6]) async {
    for (var i = 0; i < times; i++) {
      await Future<void>.delayed(Duration.zero);
    }
  }
}

Future<NekoRpcClient> _fail(RpcException e) async => throw e;

ConnectScript succeed() =>
    (self) async => self;

ConnectScript fail(RpcException e) =>
    (_) => _fail(e);

void main() {
  group('启动恢复', () {
    test('无已配对记录：保持 Idle，不创建连接', () async {
      final h = _Harness();
      addTearDown(h.manager.dispose);

      await h.manager.restore();
      await h.settle();

      expect(h.manager.state, isA<NekoConnIdle>());
      expect(h.clients, isEmpty);
    });

    test('有已配对记录：自动完成 server.hello 并进入 Ready', () async {
      final h = _Harness();
      addTearDown(h.manager.dispose);
      await h.seedComputer();

      await h.manager.restore();
      await h.settle();

      expect(h.clients, hasLength(1));
      expect(h.clients.single.connectCalls, 1);
      final state = h.manager.state;
      expect(state, isA<NekoConnReady>());
      final ready = state as NekoConnReady;
      expect(ready.computer.serverId, 'srv-1');
      expect(ready.hello.apiVersion, 1);
      expect(ready.hello.gatewayVersion, '0.3.1');
    });

    test('记录损坏：视为无记录进入 Idle', () async {
      final h = _Harness();
      addTearDown(h.manager.dispose);
      await h.store.write(StorageKeys.lastComputer, 'srv-1');
      await h.store.write(StorageKeys.pairedComputer('srv-1'), 'not-json');

      await h.manager.restore();
      await h.settle();

      expect(h.manager.state, isA<NekoConnIdle>());
      expect(h.clients, isEmpty);
    });
  });

  group('配对接入', () {
    test('connectPaired 持久化 lastComputer 并立即连接', () async {
      final h = _Harness();
      addTearDown(h.manager.dispose);

      await h.manager.connectPaired(kDummyComputer);
      await h.settle();

      expect(await h.store.read(StorageKeys.lastComputer), 'srv-1');
      expect(h.clients, hasLength(1));
      expect(h.manager.state, isA<NekoConnReady>());
    });
  });

  group('断线恢复与退避（D9）', () {
    test('可恢复关闭：退避等待后新建连接恢复 hello，旧 client dispose', () async {
      final h = _Harness(random: 0);
      addTearDown(h.manager.dispose);
      await h.seedComputer();
      await h.manager.restore();
      await h.settle();
      expect(h.manager.state, isA<NekoConnReady>());

      h.clients.single.simulateClose(null);
      expect(h.manager.state, isA<NekoConnOffline>());
      expect(h.sleeps, <Duration>[const Duration(milliseconds: 800)]);
      expect(h.pendingSleeps, 1);
      expect(h.clients, hasLength(1), reason: '退避期间不新建连接');

      h.releaseNextSleep();
      await h.settle();
      expect(h.clients, hasLength(2));
      expect(h.clients[0].disposedCount, 1, reason: '旧 client 已 dispose');
      expect(h.clients[1].connectCalls, 1);
      expect(h.manager.state, isA<NekoConnReady>());
    });

    test('连续失败按 0.8/1.6/3.2s 递增（jitter=0 固定因子 0.8）', () async {
      final h = _Harness(
        random: 0,
        connectScripts: <ConnectScript>[
          succeed(),
          fail(const RpcNetworkException()),
          fail(const RpcNetworkException()),
          succeed(),
        ],
      );
      addTearDown(h.manager.dispose);
      await h.seedComputer();
      await h.manager.restore();
      await h.settle();
      expect(h.manager.state, isA<NekoConnReady>());

      h.clients[0].simulateClose(null);
      expect(h.sleeps, <Duration>[const Duration(milliseconds: 800)]);

      h.releaseNextSleep();
      await h.settle();
      expect(h.manager.state, isA<NekoConnOffline>());
      expect(h.sleeps.length, 2);

      h.releaseNextSleep();
      await h.settle();
      expect(h.sleeps, <Duration>[
        const Duration(milliseconds: 800),
        const Duration(milliseconds: 1600),
        const Duration(milliseconds: 3200),
      ]);

      h.releaseNextSleep();
      await h.settle();
      expect(h.manager.state, isA<NekoConnReady>());
    });

    test('退避上限 30s（jitter=0 时 24000ms）', () async {
      final scripts = <ConnectScript>[succeed()];
      for (var i = 0; i < 7; i++) {
        scripts.add(fail(const RpcNetworkException()));
      }
      final h = _Harness(random: 0, connectScripts: scripts);
      addTearDown(h.manager.dispose);
      await h.seedComputer();
      await h.manager.restore();
      await h.settle();

      h.clients[0].simulateClose(null);
      while (h.pendingSleeps > 0) {
        h.releaseNextSleep();
        await h.settle();
      }

      expect(h.sleeps, hasLength(8));
      expect(h.sleeps.sublist(0, 5), <Duration>[
        const Duration(milliseconds: 800),
        const Duration(milliseconds: 1600),
        const Duration(milliseconds: 3200),
        const Duration(milliseconds: 6400),
        const Duration(milliseconds: 12800),
      ]);
      expect(h.sleeps.last, const Duration(milliseconds: 24000));
    });
  });

  group('generation 与并发', () {
    test('旧 generation 的连接结果不覆盖新状态', () async {
      final staleCompleter = Completer<NekoRpcClient>();
      final h = _Harness(
        connectScripts: <ConnectScript>[
          (_) => staleCompleter.future,
          succeed(),
        ],
      );
      addTearDown(h.manager.dispose);
      await h.seedComputer();

      await h.manager.restore();
      await h.settle();
      expect(h.clients, hasLength(1));
      expect(h.manager.state, isA<NekoConnConnecting>());

      // 前台恢复：放弃进行中的旧尝试，立即重试。
      h.manager.onForeground();
      await h.settle();
      expect(h.clients, hasLength(2));
      expect(h.manager.state, isA<NekoConnReady>());

      // 旧 client 迟到的 connect 结果到达：不得覆盖 Ready。
      staleCompleter.complete(h.clients[0]);
      await h.settle();
      expect(h.manager.state, isA<NekoConnReady>());
      expect(h.clients[0].disposedCount, 1);
    });

    test('重复 close 回调只保留一个活动连接', () async {
      final h = _Harness();
      addTearDown(h.manager.dispose);
      await h.seedComputer();
      await h.manager.restore();
      await h.settle();

      final first = h.clients[0];
      first.simulateClose(null);
      first.simulateClose(null);
      await h.settle();

      expect(h.sleeps, hasLength(1), reason: '第二次 close 不得重复调度');
      h.releaseNextSleep();
      await h.settle();
      expect(h.clients, hasLength(2));
      expect(h.manager.state, isA<NekoConnReady>());
    });
  });

  group('身份类终止（不重试）', () {
    for (final (label, closeCode, expected) in <(String, int, Type)>[
      ('4401', 4401, NekoConnRevoked),
      ('4402', 4402, NekoConnIncompatible),
    ]) {
      test('close $label → $expected，无退避重试', () async {
        final h = _Harness();
        addTearDown(h.manager.dispose);
        await h.seedComputer();
        await h.manager.restore();
        await h.settle();

        h.clients.single.simulateClose(closeCode);
        await h.settle();

        expect(h.manager.state.runtimeType, expected);
        expect(h.sleeps, isEmpty, reason: '身份类终止不得重试');
        expect(h.clients, hasLength(1));
      });
    }

    test('connect 收到 401 → Revoked，不重试', () async {
      final h = _Harness(
        connectScripts: <ConnectScript>[fail(const RpcUnauthorizedException())],
      );
      addTearDown(h.manager.dispose);
      await h.seedComputer();

      await h.manager.restore();
      await h.settle();

      expect(h.manager.state, isA<NekoConnRevoked>());
      expect(h.sleeps, isEmpty);
      expect(h.clients.single.disposedCount, 1);
    });

    test('connect 收到 incompatible → Incompatible，不重试', () async {
      final h = _Harness(
        connectScripts: <ConnectScript>[
          fail(const RpcIncompatibleException(needs: 'app')),
        ],
      );
      addTearDown(h.manager.dispose);
      await h.seedComputer();

      await h.manager.restore();
      await h.settle();

      expect(h.manager.state, isA<NekoConnIncompatible>());
      expect(h.sleeps, isEmpty);
    });

    test('connect 证书不符 → TrustChanged，不重试', () async {
      final h = _Harness(
        connectScripts: <ConnectScript>[fail(const RpcCertificateException())],
      );
      addTearDown(h.manager.dispose);
      await h.seedComputer();

      await h.manager.restore();
      await h.settle();

      expect(h.manager.state, isA<NekoConnTrustChanged>());
      expect(h.sleeps, isEmpty);
    });
  });

  group('前后台与停止', () {
    test('前台恢复：离线后立即重试（不等退避），旧退避失效', () async {
      final h = _Harness(random: 0);
      addTearDown(h.manager.dispose);
      await h.seedComputer();
      await h.manager.restore();
      await h.settle();
      h.clients.single.simulateClose(null);
      expect(h.manager.state, isA<NekoConnOffline>());

      h.manager.onForeground();
      await h.settle();

      expect(h.clients, hasLength(2), reason: '前台恢复立即新建连接');
      expect(h.sleeps, hasLength(1), reason: '前台恢复不新增 sleep');
      expect(h.manager.state, isA<NekoConnReady>());

      // 早先排队的退避到点后不得再发起连接（generation 已失效）。
      h.releaseNextSleep();
      await h.settle();
      expect(h.clients, hasLength(2));
    });

    test('Ready 时前台恢复为无操作', () async {
      final h = _Harness();
      addTearDown(h.manager.dispose);
      await h.seedComputer();
      await h.manager.restore();
      await h.settle();

      h.manager.onForeground();
      await h.settle();

      expect(h.clients, hasLength(1));
      expect(h.manager.state, isA<NekoConnReady>());
    });

    test('stopToScan：停止重试、释放连接、回到 Idle', () async {
      final h = _Harness(random: 0);
      addTearDown(h.manager.dispose);
      await h.seedComputer();
      await h.manager.restore();
      await h.settle();
      h.clients.single.simulateClose(null);
      expect(h.manager.state, isA<NekoConnOffline>());

      h.manager.stopToScan();
      expect(h.manager.state, isA<NekoConnIdle>());
      expect(h.clients.single.disposedCount, 1);

      // 已调度的退避到点后不得再发起连接。
      h.releaseNextSleep();
      await h.settle();
      expect(h.clients, hasLength(1));
    });
  });
}
