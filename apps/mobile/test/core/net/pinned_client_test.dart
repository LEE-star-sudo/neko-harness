import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/net/pinned_client.dart';

String _fixtureFingerprint(String fileName) {
  final pem = File('test/fixtures/tls/$fileName').readAsStringSync();
  final body = pem
      .replaceAll(RegExp('-----[A-Z ]+-----'), '')
      .replaceAll(RegExp(r'\s+'), '');
  return sha256.convert(base64Decode(body)).toString();
}

/// 统计 TLS 连接交付与握手失败的 ServerSocket。
///
/// dart:io 只有在握手成功后才把连接加入流；客户端证书校验拒绝表现为
/// onError（握手失败）而非连接交付。由此可区分「TLS 到达证书阶段被拒」
/// 与「HTTP 请求到达」。
class _RecordingServerSocket extends Stream<Socket> implements ServerSocket {
  _RecordingServerSocket(this._inner);

  final SecureServerSocket _inner;
  var deliveredConnections = 0;
  var handshakeFailures = 0;

  @override
  StreamSubscription<Socket> listen(
    void Function(Socket socket)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) {
    return _inner
        .map((socket) {
          deliveredConnections++;
          return socket as Socket;
        })
        .listen(
          onData,
          onError: (Object error, [StackTrace? stackTrace]) {
            handshakeFailures++;
            if (onError is void Function(Object, StackTrace)) {
              onError(error, stackTrace ?? StackTrace.current);
            } else if (onError is void Function(Object)) {
              onError(error);
            }
          },
          onDone: onDone,
          cancelOnError: cancelOnError,
        );
  }

  @override
  InternetAddress get address => _inner.address;

  @override
  int get port => _inner.port;

  @override
  Future<ServerSocket> close() => _inner.close().then((_) => this);
}

class _TlsServer {
  _TlsServer._(this.socket, this.http);

  final _RecordingServerSocket socket;
  final HttpServer http;
  void Function(HttpRequest request)? handler;
  var requestsReceived = 0;

  int get port => http.port;

  void serve() {
    http.listen((request) {
      requestsReceived++;
      final h = handler;
      if (h == null) {
        request.response.statusCode = HttpStatus.ok;
        request.response.close();
      } else {
        h(request);
      }
    });
  }

  Future<void> close() async {
    await http.close(force: true);
  }
}

final List<_TlsServer> _startedServers = <_TlsServer>[];

Future<_TlsServer> _startTlsServer({
  required String chainFile,
  required String keyFile,
}) async {
  final context = SecurityContext()
    ..useCertificateChain('test/fixtures/tls/$chainFile')
    ..usePrivateKey('test/fixtures/tls/$keyFile');
  final raw = await SecureServerSocket.bind(
    InternetAddress.loopbackIPv4,
    0,
    context,
  );
  final socket = _RecordingServerSocket(raw);
  final server = _TlsServer._(socket, HttpServer.listenOn(socket));
  server.serve();
  _startedServers.add(server);
  return server;
}

Future<void> _stopServers() async {
  final servers = List<_TlsServer>.of(_startedServers);
  _startedServers.clear();
  for (final server in servers) {
    await server.close();
  }
}

/// 客户端失败先于服务端握手失败计数送达，轮询等待服务端状态收敛。
Future<void> _until(bool Function() condition, String what) async {
  final deadline = DateTime.now().add(const Duration(seconds: 5));
  while (!condition()) {
    if (DateTime.now().isAfter(deadline)) {
      fail('等待超时: $what');
    }
    await Future<void>.delayed(const Duration(milliseconds: 10));
  }
}

PinnedHttpClient _pinnedTo(
  _TlsServer server, {
  String host = 'localhost',
  String fingerprintFile = 'server.crt',
  DateTime Function()? clock,
}) {
  return PinnedHttpClient(
    pinnedHost: host,
    pinnedPort: server.port,
    pinnedSha256: _fixtureFingerprint(fingerprintFile),
    clock: clock,
  );
}

void main() {
  tearDown(() async {
    await _stopServers();
  });

  group('校验逻辑', () {
    test('构造参数不合法即拒绝', () {
      const port = 4433;
      expect(
        () => PinnedHttpClient(
          pinnedHost: '',
          pinnedPort: port,
          pinnedSha256: 'a' * 64,
        ),
        throwsArgumentError,
      );
      expect(
        () => PinnedHttpClient(
          pinnedHost: 'localhost',
          pinnedPort: 0,
          pinnedSha256: 'a' * 64,
        ),
        throwsArgumentError,
      );
      expect(
        () => PinnedHttpClient(
          pinnedHost: 'localhost',
          pinnedPort: 65536,
          pinnedSha256: 'a' * 64,
        ),
        throwsArgumentError,
      );
      expect(
        () => PinnedHttpClient(
          pinnedHost: 'localhost',
          pinnedPort: port,
          pinnedSha256: 'not-hex',
        ),
        throwsArgumentError,
      );
      expect(
        () => PinnedHttpClient(
          pinnedHost: 'localhost',
          pinnedPort: port,
          pinnedSha256: 'A' * 63,
        ),
        throwsArgumentError,
      );
    });

    test('findProxy 对任意 URI 永远返回 DIRECT', () async {
      final server = await _startTlsServer(
        chainFile: 'server.crt',
        keyFile: 'server.key',
      );
      final client = _pinnedTo(server);
      addTearDown(client.close);
      // HttpClient 在 Dart 3.13 只有 findProxy setter：直接断言装到 client 上的
      // 同一个函数对象（构造器里 _client.findProxy = directProxy）。
      for (final uri in <Uri>[
        Uri.parse('https://example.com/'),
        Uri.parse('http://example.com/'),
        Uri.parse('wss://example.com/ws'),
        Uri.parse('ws://example.com/ws'),
      ]) {
        expect(PinnedHttpClient.directProxy(uri), PinnedHttpClient.direct);
      }
    });
  });

  group('成功路径', () {
    test('HTTPS POST：正确证书，header/body 端到端送达', () async {
      final server = await _startTlsServer(
        chainFile: 'server.crt',
        keyFile: 'server.key',
      );
      server.handler = (request) async {
        final body = await utf8.decoder.bind(request).join();
        request.response.headers.set(
          'x-echo-auth',
          request.headers.value('authorization') ?? '',
        );
        request.response.write(body);
        await request.response.close();
      };
      final client = _pinnedTo(server);
      addTearDown(client.close);

      final response = await client.post(
        Uri.parse('https://localhost:${server.port}/pair'),
        headers: {'authorization': 'test-credential'},
        body: utf8.encode('hello=world'),
      );
      expect(response.statusCode, HttpStatus.ok);
      expect(response.headers.value('x-echo-auth'), 'test-credential');
      expect(await utf8.decoder.bind(response).join(), 'hello=world');
      expect(server.socket.deliveredConnections, 1);
      expect(server.socket.handshakeFailures, 0);
      expect(server.requestsReceived, 1);
    });

    test('WSS：WebSocket.connect(customClient:) 复用同一 HttpClient', () async {
      final server = await _startTlsServer(
        chainFile: 'server.crt',
        keyFile: 'server.key',
      );
      server.handler = (request) {
        if (WebSocketTransformer.isUpgradeRequest(request)) {
          WebSocketTransformer.upgrade(request).then((socket) {
            socket.add('pong');
          });
        } else {
          request.response.statusCode = HttpStatus.notFound;
          request.response.close();
        }
      };
      final client = _pinnedTo(server);
      addTearDown(client.close);

      final socket = await client.openWebSocket(
        Uri.parse('wss://localhost:${server.port}/ws'),
      );
      expect(await socket.first, 'pong');
      expect(server.socket.deliveredConnections, 1);
      expect(server.socket.handshakeFailures, 0);
      await socket.close();
    });

    test('有效期边界：notBefore 与 notAfter 整秒恰好允许', () async {
      final server = await _startTlsServer(
        chainFile: 'server.crt',
        keyFile: 'server.key',
      );
      server.handler = (request) {
        request.response.write('ok');
        request.response.close();
      };
      for (final now in <DateTime>[
        DateTime.utc(2025, 1, 1, 0, 0, 0),
        DateTime.utc(2027, 12, 31, 23, 59, 59),
      ]) {
        final client = _pinnedTo(server, clock: () => now);
        addTearDown(client.close);
        final response = await client.post(
          Uri.parse('https://localhost:${server.port}/'),
        );
        expect(response.statusCode, HttpStatus.ok);
        await response.drain<void>();
      }
      expect(server.requestsReceived, 2);
      expect(server.socket.handshakeFailures, 0);
    });
  });

  group('证书拒绝（服务端零 HTTP 请求）', () {
    test('错误自签名：指纹不匹配被拒', () async {
      final server = await _startTlsServer(
        chainFile: 'selfsigned.crt',
        keyFile: 'selfsigned.key',
      );
      final client = _pinnedTo(server); // pin 的是 server.crt 的指纹
      addTearDown(client.close);

      await expectLater(
        client.post(Uri.parse('https://localhost:${server.port}/')),
        throwsA(isA<Exception>()),
      );
      // 服务端在该端口只持有 selfsigned.crt，回调收到的就是它。
      await _until(() => server.socket.handshakeFailures == 1, '服务端记录握手失败');
      expect(server.socket.deliveredConnections, 0);
      expect(server.requestsReceived, 0);
    });

    test('指纹相同但过期：clock 移过 notAfter 被拒', () async {
      final server = await _startTlsServer(
        chainFile: 'server.crt',
        keyFile: 'server.key',
      );
      final client = _pinnedTo(server, clock: () => DateTime.utc(2028, 1, 1));
      addTearDown(client.close);

      await expectLater(
        client.post(Uri.parse('https://localhost:${server.port}/')),
        throwsA(isA<Exception>()),
      );
      await _until(() => server.socket.handshakeFailures == 1, '服务端记录握手失败');
      expect(server.socket.deliveredConnections, 0);
      expect(server.requestsReceived, 0);
    });

    test('未到有效期：clock 早于 notBefore 被拒', () async {
      final server = await _startTlsServer(
        chainFile: 'server.crt',
        keyFile: 'server.key',
      );
      final client = _pinnedTo(
        server,
        clock: () => DateTime.utc(2024, 12, 31, 23, 59, 59),
      );
      addTearDown(client.close);

      await expectLater(
        client.post(Uri.parse('https://localhost:${server.port}/')),
        throwsA(isA<Exception>()),
      );
      await _until(() => server.socket.handshakeFailures == 1, '服务端记录握手失败');
      expect(server.socket.deliveredConnections, 0);
      expect(server.requestsReceived, 0);
    });

    test('伪造签发者攻击链：回调收到攻击者叶证书并拒绝', () async {
      // evil-chain = 攻击者叶证书（CN=localhost，签发者伪装成被 pin 证书的主题）+ 攻击者 CA。
      final server = await _startTlsServer(
        chainFile: 'evil-chain.crt',
        keyFile: 'evil-leaf.key',
      );
      final client = _pinnedTo(server); // host/port 均匹配，只剩指纹可拒绝
      addTearDown(client.close);

      Object? error;
      try {
        await client.post(Uri.parse('https://localhost:${server.port}/'));
      } catch (e) {
        error = e;
      }
      expect(error, isNotNull);
      expect(error, isNot(isA<SocketException>())); // 连接已建立，失败发生在证书校验
      await _until(() => server.socket.handshakeFailures == 1, '服务端记录握手失败');
      expect(server.socket.deliveredConnections, 0);
      expect(server.requestsReceived, 0);
    });

    test('CA 信任不能绕过 pin：被 testCA 信任的证书因指纹不符仍被拒', () async {
      final server = await _startTlsServer(
        chainFile: 'server.crt',
        keyFile: 'server.key',
      );

      // 先用 openssl 证明 server.crt 的证书链本身有效（签发至受信 CA）。
      // 不用 Dart 对照客户端：Dart 3.13 在 macOS 上经由 SecTrust 评估，
      // 本机 setTrustedCertificates 不生效（openssl verify 与 security
      // verify-cert 均通过，属上游平台路径问题，与 pin 逻辑无关）。
      final verify = await Process.run('openssl', [
        'verify',
        '-CAfile',
        'test/fixtures/tls/testCA.crt',
        'test/fixtures/tls/server.crt',
      ]);
      expect(
        verify.exitCode,
        0,
        reason: 'fixtures 证书链应有效: ${verify.stdout} ${verify.stderr}',
      );

      // 同一服务端、同一（链有效的）证书：pinned client 的 pin 指向另一张证书，必须拒绝。
      final client = _pinnedTo(server, fingerprintFile: 'selfsigned.crt');
      addTearDown(client.close);
      await expectLater(
        client.post(Uri.parse('https://localhost:${server.port}/')),
        throwsA(isA<Exception>()),
      );
      await _until(() => server.socket.handshakeFailures == 1, '服务端记录握手失败');
      expect(server.socket.deliveredConnections, 0);
      expect(server.requestsReceived, 0);
    });

    test('callback 拒绝错误 host', () async {
      final server = await _startTlsServer(
        chainFile: 'server.crt',
        keyFile: 'server.key',
      );
      final client = _pinnedTo(
        server,
        host: '127.0.0.1',
      ); // URL 用 localhost，指纹本身是对的
      addTearDown(client.close);

      Future<void> attempt() async {
        final request = await client.httpClient.getUrl(
          Uri.parse('https://localhost:${server.port}/'),
        );
        await request.close();
      }

      await expectLater(attempt(), throwsA(isA<Exception>()));
      await _until(() => server.socket.handshakeFailures == 1, '服务端记录握手失败');
      expect(server.socket.deliveredConnections, 0);
      expect(server.requestsReceived, 0);
    });

    test('callback 拒绝错误 port', () async {
      final server = await _startTlsServer(
        chainFile: 'server.crt',
        keyFile: 'server.key',
      );
      final client = PinnedHttpClient(
        pinnedHost: 'localhost',
        pinnedPort: server.port + 1, // pin 的端口与实际不符
        pinnedSha256: _fixtureFingerprint('server.crt'),
      );
      addTearDown(client.close);

      Future<void> attempt() async {
        final request = await client.httpClient.getUrl(
          Uri.parse('https://localhost:${server.port}/'),
        );
        await request.close();
      }

      await expectLater(attempt(), throwsA(isA<Exception>()));
      await _until(() => server.socket.handshakeFailures == 1, '服务端记录握手失败');
      expect(server.socket.deliveredConnections, 0);
      expect(server.requestsReceived, 0);
    });
  });

  group('端点与重定向', () {
    test('重定向不跟随：原始响应即 302，原始服务器恰收 1 次、目标 0 次', () async {
      final origin = await _startTlsServer(
        chainFile: 'server.crt',
        keyFile: 'server.key',
      );
      final target = await _startTlsServer(
        chainFile: 'server.crt',
        keyFile: 'server.key',
      );
      origin.handler = (request) {
        if (request.uri.path == '/redirect') {
          request.response.statusCode = HttpStatus.found;
          request.response.headers.set(
            HttpHeaders.locationHeader,
            'https://localhost:${target.port}/target',
          );
          request.response.close();
        } else {
          request.response.write('ok');
          request.response.close();
        }
      };
      final client = _pinnedTo(origin);
      addTearDown(client.close);

      final response = await client.post(
        Uri.parse('https://localhost:${origin.port}/redirect'),
      );
      expect(response.statusCode, HttpStatus.found);
      expect(
        response.headers.value(HttpHeaders.locationHeader),
        'https://localhost:${target.port}/target',
      );
      await response.drain<void>();

      expect(origin.requestsReceived, 1);
      expect(target.requestsReceived, 0);
      expect(target.socket.deliveredConnections, 0);
      expect(target.socket.handshakeFailures, 0);
    });

    test('http/ws 与错误端点在任何 socket 连接前拒绝', () async {
      final server = await _startTlsServer(
        chainFile: 'server.crt',
        keyFile: 'server.key',
      );
      final client = _pinnedTo(server);
      addTearDown(client.close);

      await expectLater(
        client.post(Uri.parse('http://localhost:${server.port}/')),
        throwsArgumentError,
      );
      await expectLater(
        client.post(Uri.parse('https://127.0.0.1:${server.port}/')),
        throwsArgumentError,
      );
      await expectLater(
        client.post(Uri.parse('https://localhost:${server.port + 1}/')),
        throwsArgumentError,
      );
      await expectLater(
        client.openWebSocket(Uri.parse('ws://localhost:${server.port}/ws')),
        throwsArgumentError,
      );
      await expectLater(
        client.openWebSocket(
          Uri.parse('wss://localhost:${server.port + 1}/ws'),
        ),
        throwsArgumentError,
      );
      await expectLater(
        client.post(Uri.parse('ftp://localhost:${server.port}/')),
        throwsArgumentError,
      );

      // 全部在网络层动手前抛出：服务端没有任何连接痕迹。
      expect(server.socket.deliveredConnections, 0);
      expect(server.socket.handshakeFailures, 0);
      expect(server.requestsReceived, 0);
    });
  });

  test('close 后不再接受请求', () async {
    final server = await _startTlsServer(
      chainFile: 'server.crt',
      keyFile: 'server.key',
    );
    final client = _pinnedTo(server);
    client.close();
    await expectLater(
      client.post(Uri.parse('https://localhost:${server.port}/')),
      throwsA(isA<StateError>()),
    );
  });
}
