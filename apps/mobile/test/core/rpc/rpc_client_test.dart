import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/pairing/pairing_models.dart';
import 'package:neko_mobile/core/pairing/pairing_service.dart';
import 'package:neko_mobile/core/rpc/rpc_client.dart';

import '../../helpers/tls_server.dart';
import '../../helpers/tracking_pinned_client.dart';

PairedComputer _computerFor(TlsTestServer server) {
  return PairedComputer(
    serverId: 'srv-1',
    serverName: '工作机',
    endpoint: 'https://localhost:${server.port}',
    fingerprint: fixtureFingerprint('server.crt'),
    deviceId: 'dev-1',
    credential: 'cred-1',
    grantRevision: 1,
    pairedAt: 0,
  );
}

Map<String, Object?> _helloResult() => <String, Object?>{
  'apiVersion': 1,
  'serverId': 'srv-1',
  'serverName': '工作机',
  'gatewayVersion': '0.3.1',
  'capabilities': <String>['sessions', 'chat'],
  'limits': <String, int>{'maxFrameBytes': 262144},
};

class _WsHarness {
  _WsHarness({
    this.authorized = true,
    this.respondHello = true,
    this.helloResult,
    this.helloError,
    this.closeAfterHello,
  });

  final bool authorized;
  final bool respondHello;
  final Map<String, Object?>? helloResult;
  final Map<String, Object?>? helloError;
  final int? closeAfterHello;

  final List<String> authHeaders = <String>[];
  final List<Object?> messages = <Object?>[];
  WebSocket? socket;

  _WsHarness attach(TlsTestServer server) {
    server.handler = (request) async {
      authHeaders.add(request.headers.value('authorization') ?? '');
      if (!authorized) {
        request.response.statusCode = HttpStatus.unauthorized;
        await request.response.close();
        return;
      }
      final ws = await WebSocketTransformer.upgrade(request);
      socket = ws;
      ws.listen((message) {
        messages.add(jsonDecode(message as String));
        final decoded = messages.last as Map<String, dynamic>;
        if (respondHello) {
          if (helloError != null) {
            ws.add(
              jsonEncode(<String, Object?>{
                'jsonrpc': '2.0',
                'id': decoded['id'],
                'error': helloError,
              }),
            );
          } else {
            ws.add(
              jsonEncode(<String, Object?>{
                'jsonrpc': '2.0',
                'id': decoded['id'],
                'result': helloResult ?? _helloResult(),
              }),
            );
          }
        }
        final close = closeAfterHello;
        if (close != null) {
          ws.close(close, 'test');
        }
      });
    };
    return this;
  }
}

void main() {
  group('NekoRpcClient', () {
    test('hello 成功：参数与 Authorization 精确，结果与状态序列正确', () async {
      final server = await startTlsServer();
      final harness = _WsHarness()..attach(server);
      final client = NekoRpcClient(
        computer: _computerFor(server),
        clientFactory: defaultPinnedClientFactory,
      );
      addTearDown(client.dispose);

      final states = <RpcState>[];
      final sub = client.states.listen(states.add);

      await client.connect();
      final result = client.hello;

      expect(harness.authHeaders.single, 'Neko-Device dev-1.cred-1');
      expect(harness.messages, hasLength(1), reason: 'hello 前不发其他业务请求');
      final hello = harness.messages.single as Map<String, dynamic>;
      expect(hello['jsonrpc'], '2.0');
      expect(hello['method'], 'server.hello');
      final params = hello['params'] as Map<String, dynamic>;
      expect(params['apiVersions'], <int>[1]);
      expect(params['app'], <String, Object?>{
        'version': kNekoAppVersion,
        'platform': kNekoAppPlatform,
        'build': kNekoAppBuild,
      });

      expect(result.apiVersion, 1);
      expect(result.serverId, 'srv-1');
      expect(result.gatewayVersion, '0.3.1');
      expect(result.capabilities, <String>['sessions', 'chat']);
      expect(client.hello, same(result));

      expect(states, hasLength(2));
      expect(states[0], isA<RpcConnecting>());
      expect(states[1], isA<RpcReady>());
      await sub.cancel();
    });

    test('平台可注入（如桌面测试用）', () async {
      final server = await startTlsServer();
      final harness = _WsHarness()..attach(server);
      final client = NekoRpcClient(
        computer: _computerFor(server),
        clientFactory: defaultPinnedClientFactory,
        platform: 'test-os',
      );
      addTearDown(client.dispose);
      await client.connect();
      final hello = harness.messages.single as Map<String, dynamic>;
      expect(
        (hello['params'] as Map<String, dynamic>)['app'],
        <String, Object?>{
          'version': kNekoAppVersion,
          'platform': 'test-os',
          'build': kNekoAppBuild,
        },
      );
    });

    test('JSON-RPC 错误 incompatible（带 needs）', () async {
      final server = await startTlsServer();
      _WsHarness(
        helloError: <String, Object?>{
          'code': -32001,
          'message': 'incompatible',
          'data': <String, Object?>{'code': 'incompatible', 'needs': 'app'},
        },
      ).attach(server);
      final client = NekoRpcClient(
        computer: _computerFor(server),
        clientFactory: defaultPinnedClientFactory,
      );
      addTearDown(client.dispose);

      expect(
        () => client.connect(),
        throwsA(
          isA<RpcIncompatibleException>().having(
            (e) => e.needs,
            'needs',
            'app',
          ),
        ),
      );
    });

    test('hello 期间收到 4402 关闭 → RpcIncompatibleException', () async {
      final server = await startTlsServer();
      _WsHarness(closeAfterHello: 4402, respondHello: false).attach(server);
      final client = NekoRpcClient(
        computer: _computerFor(server),
        clientFactory: defaultPinnedClientFactory,
      );
      addTearDown(client.dispose);

      expect(() => client.connect(), throwsA(isA<RpcIncompatibleException>()));
    });

    test('hello 成功后 4401 关闭 → 状态流报告 revoked code', () async {
      final server = await startTlsServer();
      _WsHarness(closeAfterHello: 4401).attach(server);
      final client = NekoRpcClient(
        computer: _computerFor(server),
        clientFactory: defaultPinnedClientFactory,
      );
      addTearDown(client.dispose);
      final states = <RpcState>[];
      final sub = client.states.listen(states.add);

      await client.connect();
      await _until(() => states.any((s) => s is RpcClosed));

      final closed = states.whereType<RpcClosed>().single;
      expect(closed.closeCode, 4401);
      await sub.cancel();
    });

    test('401 升级拒绝 → RpcUnauthorizedException', () async {
      final server = await startTlsServer();
      _WsHarness(authorized: false).attach(server);
      final client = NekoRpcClient(
        computer: _computerFor(server),
        clientFactory: defaultPinnedClientFactory,
      );
      addTearDown(client.dispose);

      expect(() => client.connect(), throwsA(isA<RpcUnauthorizedException>()));
    });

    test('证书不符 → RpcCertificateException', () async {
      final server = await startTlsServer(
        chainFile: 'selfsigned.crt',
        keyFile: 'selfsigned.key',
      );
      final client = NekoRpcClient(
        computer: _computerFor(server),
        clientFactory: defaultPinnedClientFactory,
      );
      addTearDown(client.dispose);

      expect(() => client.connect(), throwsA(isA<RpcCertificateException>()));
    });

    test('hello 结果 schema 错误 → RpcProtocolException', () async {
      final server = await startTlsServer();
      _WsHarness(helloResult: <String, Object?>{'apiVersion': 1})
          .attach(server);
      final client = NekoRpcClient(
        computer: _computerFor(server),
        clientFactory: defaultPinnedClientFactory,
      );
      addTearDown(client.dispose);

      expect(() => client.connect(), throwsA(isA<RpcProtocolException>()));
    });

    test('凭据只出现在 Authorization 头，不进 URL/异常', () async {
      final server = await startTlsServer();
      _WsHarness().attach(server);
      final client = NekoRpcClient(
        computer: _computerFor(server),
        clientFactory: defaultPinnedClientFactory,
      );
      addTearDown(client.dispose);
      await client.connect();
      expect(server.requests.single.uri.path, '/mobile/v1/ws');
      expect(server.requests.single.uri.hasQuery, isFalse);
      expect(server.requests.single.uri.userInfo, isEmpty);
    });

    group('资源生命周期', () {
      test('连接失败 teardown 后关闭 pinned client', () async {
        final server = await startTlsServer();
        _WsHarness(authorized: false).attach(server);
        late TrackingPinnedClient tracked;
        final client = NekoRpcClient(
          computer: _computerFor(server),
          clientFactory: (endpoint, fingerprint) =>
              tracked = TrackingPinnedClient(
                pinnedHost: endpoint.host,
                pinnedPort: endpoint.port,
                pinnedSha256: fingerprint,
              ),
        );

        await expectLater(
          client.connect(),
          throwsA(isA<RpcUnauthorizedException>()),
        );
        expect(tracked.closeCount, 1);
      });

      test('hello 期间被关闭（4402）也释放 pinned client', () async {
        final server = await startTlsServer();
        _WsHarness(closeAfterHello: 4402, respondHello: false).attach(server);
        late TrackingPinnedClient tracked;
        final client = NekoRpcClient(
          computer: _computerFor(server),
          clientFactory: (endpoint, fingerprint) =>
              tracked = TrackingPinnedClient(
                pinnedHost: endpoint.host,
                pinnedPort: endpoint.port,
                pinnedSha256: fingerprint,
              ),
        );

        await expectLater(
          client.connect(),
          throwsA(isA<RpcIncompatibleException>()),
        );
        expect(tracked.closeCount, 1);
      });

      test('dispose 关闭 pinned client 且重复调用幂等', () async {
        final server = await startTlsServer();
        _WsHarness().attach(server);
        late TrackingPinnedClient tracked;
        final client = NekoRpcClient(
          computer: _computerFor(server),
          clientFactory: (endpoint, fingerprint) =>
              tracked = TrackingPinnedClient(
                pinnedHost: endpoint.host,
                pinnedPort: endpoint.port,
                pinnedSha256: fingerprint,
              ),
        );

        await client.connect();
        expect(tracked.closeCount, 0, reason: '连接保持期间不释放');

        client.dispose();
        expect(tracked.closeCount, 1);
        client.dispose();
        expect(tracked.closeCount, 1, reason: '重复 dispose 幂等');
      });

      test('未连接即 dispose：释放 pinned client 且幂等', () async {
        final server = await startTlsServer();
        late TrackingPinnedClient tracked;
        final client = NekoRpcClient(
          computer: _computerFor(server),
          clientFactory: (endpoint, fingerprint) =>
              tracked = TrackingPinnedClient(
                pinnedHost: endpoint.host,
                pinnedPort: endpoint.port,
                pinnedSha256: fingerprint,
              ),
        );

        client.dispose();
        expect(tracked.closeCount, 1);
        client.dispose();
        expect(tracked.closeCount, 1);
        expect(() => client.connect(), throwsStateError);
      });
    });
  });
}

Future<void> _until(bool Function() condition) async {
  final deadline = DateTime.now().add(const Duration(seconds: 5));
  while (!condition()) {
    if (DateTime.now().isAfter(deadline)) {
      fail('等待超时');
    }
    await Future<void>.delayed(const Duration(milliseconds: 10));
  }
}
