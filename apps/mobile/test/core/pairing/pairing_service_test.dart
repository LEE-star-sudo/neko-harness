import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/pairing/pairing_models.dart';
import 'package:neko_mobile/core/pairing/pairing_service.dart';
import 'package:neko_mobile/core/pairing/pairing_text.dart';
import 'package:neko_mobile/core/storage/key_value_store.dart';

import '../../helpers/tls_server.dart';
import '../../helpers/tracking_pinned_client.dart';

class _DeterministicIds {
  var next = 0;

  String call() => 'device-${next++}';
}

PairingTarget _targetFor(TlsTestServer server, {int codeFill = 7}) {
  final result = parsePairingText(
    buildPairingTextForService(server, codeFill: codeFill),
    clock: () => DateTime.utc(2026, 10, 15),
  );
  return (result as PairingTextOk).target;
}

String buildPairingTextForService(TlsTestServer server, {int codeFill = 7}) {
  final payload = <String, Object?>{
    'v': 1,
    'sid': 'srv-1',
    'name': '工作机',
    'ep': 'https://127.0.0.1:${server.port}',
    'fp': fixtureFingerprint('server.crt'),
    'code': base64Url
        .encode(List<int>.filled(32, codeFill))
        .replaceAll('=', ''),
    'exp': DateTime.utc(2026, 10, 15).millisecondsSinceEpoch + 120000,
  };
  return 'nekopair:1:${base64Url.encode(utf8.encode(jsonEncode(payload))).replaceAll('=', '')}';
}

Map<String, Object?> _okResponse({String? serverId, String? deviceId}) =>
    <String, Object?>{
      'serverId': serverId ?? 'srv-1',
      'serverName': '工作机',
      'deviceId': deviceId ?? 'device-1',
      'grantRevision': 1,
      'apiVersions': <int>[1],
    };

LocalPairingService _service(
  TlsTestServer server,
  KeyValueStore store, {
  _DeterministicIds? ids,
  List<String>? credentialCalls,
}) {
  final idGen = ids ?? _DeterministicIds();
  return LocalPairingService(
    store: store,
    clientFactory: defaultPinnedClientFactory,
    deviceName: 'Neko Mobile',
    clock: () => DateTime.utc(2026, 10, 15),
    idGenerator: idGen.call,
    credentialGenerator: () {
      credentialCalls?.add('called');
      return List<int>.filled(32, 9);
    },
  );
}

void main() {
  group('LocalPairingService', () {
    test('成功：pending 先于 POST 写入，成功后迁移为已配对记录', () async {
      final server = await startTlsServer();
      final store = InMemoryKeyValueStore();
      var pendingVisibleAtRequestTime = false;
      server.handler = (request) async {
        pendingVisibleAtRequestTime =
            await store.read(StorageKeys.pendingPairing('srv-1')) != null;
        request.response.write(jsonEncode(_okResponse()));
        await request.response.close();
      };
      final ids = _DeterministicIds();
      final service = _service(server, store, ids: ids);

      final computer = await service.pair(_targetFor(server));

      expect(pendingVisibleAtRequestTime, isTrue);
      expect(computer.serverId, 'srv-1');
      expect(computer.serverName, '工作机');
      expect(computer.deviceId, 'device-1');
      expect(
        computer.credential,
        base64Url.encode(List<int>.filled(32, 9)).replaceAll('=', ''),
      );
      expect(computer.grantRevision, 1);
      // 已配对记录写入、pending 删除。
      expect(await store.read(StorageKeys.pendingPairing('srv-1')), isNull);
      final stored = PairedComputer.fromJson(
        jsonDecode((await store.read(StorageKeys.pairedComputer('srv-1')))!),
      );
      expect(stored?.serverName, '工作机');

      final request = server.requests.single;
      expect(request.method, 'POST');
      expect(request.uri.path, '/mobile/v1/pair');
      expect(request.uri.hasQuery, isFalse);
      expect(request.uri.userInfo, isEmpty);
      expect(request.headers['content-type'], contains('application/json'));
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      expect(body['v'], 1);
      expect(body['sid'], 'srv-1');
      expect(body['deviceName'], 'Neko Mobile');
      expect(body['pairRequestId'], 'device-0');
      expect(body['deviceId'], 'device-1');
      expect(body['credential'], computer.credential);
      expect(computer.deviceId, 'device-1');
      expect(
        base64Url.decode(base64Url.normalize(body['credential'] as String)),
        hasLength(32),
      );
    });

    test('deviceId 安装期间稳定，新配对码触发新 pairRequestId/credential', () async {
      final server = await startTlsServer();
      final store = InMemoryKeyValueStore();
      final credentialCalls = <String>[];
      server.handler = (request) async {
        request.response.write(jsonEncode(_okResponse(deviceId: 'device-1')));
        await request.response.close();
      };
      final service = _service(server, store, credentialCalls: credentialCalls);

      await service.pair(_targetFor(server, codeFill: 7));
      await service.pair(_targetFor(server, codeFill: 8));
      final firstBody =
          jsonDecode(server.requests[0].body) as Map<String, dynamic>;
      final secondBody =
          jsonDecode(server.requests[1].body) as Map<String, dynamic>;

      expect(firstBody['deviceId'], 'device-1');
      expect(secondBody['deviceId'], 'device-1', reason: 'deviceId 安装期间稳定');
      expect(firstBody['code'], isNot(secondBody['code']));
      expect(firstBody['pairRequestId'], isNot(secondBody['pairRequestId']));
      expect(credentialCalls, hasLength(2));
    });

    test('响应丢失：同参数重试，不重新随机', () async {
      final server = await startTlsServer();
      final store = InMemoryKeyValueStore();
      var attempts = 0;
      server.handler = (request) async {
        attempts++;
        if (attempts == 1) {
          // 第一个请求收到后直接断开连接，模拟响应丢失。
          final socket = await request.response.detachSocket();
          socket.destroy();
          return;
        }
        request.response.write(jsonEncode(_okResponse()));
        await request.response.close();
      };
      final ids = _DeterministicIds();
      final service = _service(server, store, ids: ids);
      final target = _targetFor(server);

      final failed = service.pair(target);
      await expectLater(failed, throwsA(isA<PairingNetworkException>()));
      expect(await store.read(StorageKeys.pendingPairing('srv-1')), isNotNull);

      final computer = await service.pair(target);
      expect(computer.serverId, 'srv-1');
      final first = jsonDecode(server.requests[0].body) as Map<String, dynamic>;
      final second =
          jsonDecode(server.requests[1].body) as Map<String, dynamic>;
      expect(second['pairRequestId'], first['pairRequestId']);
      expect(second['deviceId'], first['deviceId']);
      expect(second['credential'], first['credential']);
      expect(ids.next, 2, reason: '首轮生成 pairRequestId 与 deviceId，重试不消耗新 id');
      // 成功后 pending 清理。
      expect(await store.read(StorageKeys.pendingPairing('srv-1')), isNull);
    });

    test('HTTP 状态码映射为可区分异常，且失败后保留 pending', () async {
      final cases = <int, Type>{
        HttpStatus.badRequest: InvalidPairingException,
        HttpStatus.forbidden: WrongServerException,
        HttpStatus.conflict: CodeUsedException,
        HttpStatus.gone: CodeExpiredException,
        HttpStatus.requestEntityTooLarge: PayloadTooLargeException,
        HttpStatus.tooManyRequests: RateLimitedException,
        HttpStatus.internalServerError: PairingNetworkException,
      };
      for (final entry in cases.entries) {
        final server = await startTlsServer();
        final store = InMemoryKeyValueStore();
        server.handler = (request) async {
          request.response.statusCode = entry.key;
          await request.response.close();
        };
        final service = _service(server, store);
        Object? error;
        try {
          await service.pair(_targetFor(server));
        } catch (e) {
          error = e;
        }
        expect(error.runtimeType, entry.value, reason: 'status ${entry.key}');
        expect(
          await store.read(StorageKeys.pendingPairing('srv-1')),
          isNotNull,
          reason: 'status ${entry.key}',
        );
        expect(
          await store.read(StorageKeys.pairedComputer('srv-1')),
          isNull,
          reason: 'status ${entry.key}',
        );
      }
    });

    test('响应 schema 错误按配对失败处理，不标记已配对', () async {
      final bodies = <String>[
        jsonEncode(<String, Object?>{
          'serverId': 'other',
          'serverName': 'x',
          'deviceId': 'device-1',
          'grantRevision': 1,
          'apiVersions': <int>[1],
        }),
        jsonEncode(<String, Object?>{
          'serverId': 'srv-1',
          'serverName': 'x',
          'deviceId': 'other',
          'grantRevision': 1,
          'apiVersions': <int>[1],
        }),
        jsonEncode(<String, Object?>{
          'serverId': 'srv-1',
          'serverName': 'x',
          'deviceId': 'device-1',
          'grantRevision': 0,
          'apiVersions': <int>[1],
        }),
        jsonEncode(<String, Object?>{
          'serverId': 'srv-1',
          'serverName': 'x',
          'deviceId': 'device-1',
          'grantRevision': 1,
          'apiVersions': <int>[2],
        }),
        'not-json',
      ];
      for (final body in bodies) {
        final server = await startTlsServer();
        final store = InMemoryKeyValueStore();
        server.handler = (request) async {
          request.response.write(body);
          await request.response.close();
        };
        final service = _service(server, store);
        await expectLater(
          service.pair(_targetFor(server)),
          throwsA(isA<PairingResponseException>()),
        );
        expect(await store.read(StorageKeys.pairedComputer('srv-1')), isNull);
        expect(
          await store.read(StorageKeys.pendingPairing('srv-1')),
          isNotNull,
        );
      }
    });

    test('证书不符 → PairingCertificateException，凭据不出现在异常与 URL', () async {
      final server = await startTlsServer(
        chainFile: 'selfsigned.crt',
        keyFile: 'selfsigned.key',
      );
      final store = InMemoryKeyValueStore();
      final service = _service(server, store);

      Object? error;
      try {
        await service.pair(_targetFor(server));
      } catch (e) {
        error = e;
      }
      expect(error, isA<PairingCertificateException>());
      final credential = base64Url
          .encode(List<int>.filled(32, 9))
          .replaceAll('=', '');
      expect(error.toString(), isNot(contains(credential)));
      expect(server.requests, isEmpty);
    });

    test('凭据仅在请求体内：URL 无凭据，异常无凭据', () async {
      final server = await startTlsServer();
      final store = InMemoryKeyValueStore();
      server.handler = (request) async {
        request.response.statusCode = HttpStatus.conflict;
        await request.response.close();
      };
      final service = _service(server, store);
      Object? error;
      try {
        await service.pair(_targetFor(server));
      } catch (e) {
        error = e;
      }
      expect(error, isA<CodeUsedException>());
      final request = server.requests.single;
      expect(request.uri.toString(), isNot(contains('credential')));
      expect(error.toString(), isNot(contains('credential')));
      // body 内确实带凭据。
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      expect(body['credential'], isNotEmpty);
    });

    group('资源生命周期', () {
      test('成功路径：读响应前未 close，返回后恰好一次，store 迁移不受影响', () async {
        final server = await startTlsServer();
        final store = InMemoryKeyValueStore();
        late TrackingPinnedClient tracked;
        var idCalls = 0;
        var observedCloseAtRequest = -1;
        server.handler = (request) async {
          observedCloseAtRequest = tracked.closeCount;
          request.response.write(jsonEncode(_okResponse(deviceId: 'device-1')));
          await request.response.close();
        };
        final service = LocalPairingService(
          store: store,
          clientFactory: (endpoint, fingerprint) =>
              tracked = TrackingPinnedClient(
                pinnedHost: endpoint.host,
                pinnedPort: endpoint.port,
                pinnedSha256: fingerprint,
              ),
          deviceName: 'Neko Mobile',
          clock: () => DateTime.utc(2026, 10, 15),
          idGenerator: () => 'device-${idCalls++}',
          credentialGenerator: () => List<int>.filled(32, 9),
        );

        final computer = await service.pair(_targetFor(server));

        expect(observedCloseAtRequest, 0, reason: '读取/响应完成前不得 close');
        expect(tracked.closeCount, 1);
        expect(computer.serverId, 'srv-1');
        expect(await store.read(StorageKeys.pendingPairing('srv-1')), isNull);
        expect(
          await store.read(StorageKeys.pairedComputer('srv-1')),
          isNotNull,
        );
      });

      test('错误状态码路径：drain 后恰好 close 一次', () async {
        final server = await startTlsServer();
        final store = InMemoryKeyValueStore();
        late TrackingPinnedClient tracked;
        var idCalls = 0;
        server.handler = (request) async {
          request.response.statusCode = HttpStatus.conflict;
          await request.response.close();
        };
        final service = LocalPairingService(
          store: store,
          clientFactory: (endpoint, fingerprint) =>
              tracked = TrackingPinnedClient(
                pinnedHost: endpoint.host,
                pinnedPort: endpoint.port,
                pinnedSha256: fingerprint,
              ),
          clock: () => DateTime.utc(2026, 10, 15),
          idGenerator: () => 'device-${idCalls++}',
          credentialGenerator: () => List<int>.filled(32, 9),
        );

        await expectLater(
          service.pair(_targetFor(server)),
          throwsA(isA<CodeUsedException>()),
        );
        expect(tracked.closeCount, 1);
        expect(
          await store.read(StorageKeys.pendingPairing('srv-1')),
          isNotNull,
        );
      });

      test('证书失败路径：异常后恰好 close 一次', () async {
        final server = await startTlsServer(
          chainFile: 'selfsigned.crt',
          keyFile: 'selfsigned.key',
        );
        final store = InMemoryKeyValueStore();
        late TrackingPinnedClient tracked;
        var idCalls = 0;
        final service = LocalPairingService(
          store: store,
          clientFactory: (endpoint, fingerprint) =>
              tracked = TrackingPinnedClient(
                pinnedHost: endpoint.host,
                pinnedPort: endpoint.port,
                pinnedSha256: fingerprint,
              ),
          clock: () => DateTime.utc(2026, 10, 15),
          idGenerator: () => 'device-${idCalls++}',
          credentialGenerator: () => List<int>.filled(32, 9),
        );

        await expectLater(
          service.pair(_targetFor(server)),
          throwsA(isA<PairingCertificateException>()),
        );
        expect(tracked.closeCount, 1);
      });

      test('响应丢失路径：异常后恰好 close 一次，重试用新 client', () async {
        final server = await startTlsServer();
        final store = InMemoryKeyValueStore();
        var attempts = 0;
        var idCalls = 0;
        final trackedClients = <TrackingPinnedClient>[];
        server.handler = (request) async {
          attempts++;
          if (attempts == 1) {
            final socket = await request.response.detachSocket();
            socket.destroy();
            return;
          }
          request.response.write(jsonEncode(_okResponse(deviceId: 'device-1')));
          await request.response.close();
        };
        LocalPairingService service() => LocalPairingService(
          store: store,
          clientFactory: (endpoint, fingerprint) {
            final client = TrackingPinnedClient(
              pinnedHost: endpoint.host,
              pinnedPort: endpoint.port,
              pinnedSha256: fingerprint,
            );
            trackedClients.add(client);
            return client;
          },
          clock: () => DateTime.utc(2026, 10, 15),
          idGenerator: () => 'device-${idCalls++}',
          credentialGenerator: () => List<int>.filled(32, 9),
        );

        await expectLater(
          service().pair(_targetFor(server)),
          throwsA(isA<PairingNetworkException>()),
        );
        expect(trackedClients.single.closeCount, 1);

        // 重试由调用方用新 service 实例发起（生产中由 UI 触发），同样恰好 close 一次。
        final computer = await service().pair(_targetFor(server));
        expect(computer.serverId, 'srv-1');
        expect(trackedClients, hasLength(2));
        expect(trackedClients[1].closeCount, 1);
      });
    });
  });
}
