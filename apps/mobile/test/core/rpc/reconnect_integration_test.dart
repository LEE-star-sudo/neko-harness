import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/pairing/pairing_models.dart';
import 'package:neko_mobile/core/pairing/pairing_service.dart';
import 'package:neko_mobile/core/rpc/connection_manager.dart';
import 'package:neko_mobile/core/rpc/rpc_client.dart';
import 'package:neko_mobile/core/storage/key_value_store.dart';

import '../../helpers/tls_server.dart';

Map<String, Object?> _helloResult() => <String, Object?>{
  'apiVersion': 1,
  'serverId': 'srv-1',
  'serverName': '工作机',
  'gatewayVersion': '0.3.1',
  'capabilities': <String>['sessions', 'chat'],
  'limits': <String, int>{'maxFrameBytes': 262144},
};

/// 回归：WSS 关闭事件在同步广播派发中时释放 client，不得抛
/// Bad state 也不得让重连调度丢失（真机上表现为断线后永久卡死）。
void main() {
  test('服务端关闭 socket：进入退避并可恢复，无未处理异常', () async {
    final server = await startTlsServer();

    WebSocket? liveSocket;
    server.handler = (request) async {
      final ws = await WebSocketTransformer.upgrade(request);
      liveSocket = ws;
      ws.listen((message) {
        final decoded = jsonDecode(message as String) as Map<String, dynamic>;
        ws.add(
          jsonEncode(<String, Object?>{
            'jsonrpc': '2.0',
            'id': decoded['id'],
            'result': _helloResult(),
          }),
        );
      });
    };

    final computer = PairedComputer(
      serverId: 'srv-1',
      serverName: '工作机',
      endpoint: 'https://localhost:${server.port}',
      fingerprint: fixtureFingerprint('server.crt'),
      deviceId: 'dev-1',
      credential: 'cred-1',
      grantRevision: 1,
      pairedAt: 0,
    );

    final sleeps = <Completer<void>>[];
    final manager = ConnectionManager(
      store: InMemoryKeyValueStore(),
      random: () => 0,
      sleep: (delay) {
        final gate = Completer<void>();
        sleeps.add(gate);
        return gate.future;
      },
      rpcFactory: (_) => NekoRpcClient(
        computer: computer,
        clientFactory: defaultPinnedClientFactory,
      ),
    );
    addTearDown(manager.dispose);

    await manager.connectPaired(computer);
    await _until(() => manager.state is NekoConnReady);
    expect(sleeps, isEmpty);

    // 服务端主动关闭 → socket.done → 同步派发 RpcClosed → 管理器释放 client。
    liveSocket!.close();
    await _until(() => manager.state is NekoConnOffline);

    expect(sleeps, hasLength(1), reason: '退避应被调度（修复前会因 Bad state 丢失）');

    sleeps.removeAt(0).complete();
    await _until(() => manager.state is NekoConnReady);
  });
}

Future<void> _until(bool Function() condition) async {
  final deadline = DateTime.now().add(const Duration(seconds: 10));
  while (!condition()) {
    if (DateTime.now().isAfter(deadline)) {
      fail('等待超时');
    }
    await Future<void>.delayed(const Duration(milliseconds: 10));
  }
}
