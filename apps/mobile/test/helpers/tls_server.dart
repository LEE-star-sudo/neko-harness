import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';

String fixtureFingerprint(String fileName) {
  final pem = File('test/fixtures/tls/$fileName').readAsStringSync();
  final body = pem
      .replaceAll(RegExp('-----[A-Z ]+-----'), '')
      .replaceAll(RegExp(r'\s+'), '');
  return sha256.convert(base64Decode(body)).toString();
}

class RecordedRequest {
  RecordedRequest({
    required this.method,
    required this.uri,
    required this.headers,
    required this.body,
  });

  final String method;
  final Uri uri;

  /// 小写 header 名 → 逗号连接的值。
  final Map<String, String> headers;
  final String body;
}

/// 记录请求并委托 handler 的本地 TLS 测试服务器（fixture 证书）。
class TlsTestServer {
  TlsTestServer._(this._http);

  final HttpServer _http;
  final List<RecordedRequest> requests = <RecordedRequest>[];
  void Function(HttpRequest request)? handler;

  int get port => _http.port;

  void _serve() {
    _http.listen((request) async {
      // 升级请求没有业务体，join() 会吞掉 WebSocket 帧，跳过。
      final body = WebSocketTransformer.isUpgradeRequest(request)
          ? ''
          : await utf8.decoder.bind(request).join();
      final headers = <String, String>{};
      request.headers.forEach((name, values) {
        headers[name.toLowerCase()] = values.join(',');
      });
      requests.add(
        RecordedRequest(
          method: request.method,
          uri: request.uri,
          headers: headers,
          body: body,
        ),
      );
      final h = handler;
      if (h == null) {
        request.response.statusCode = HttpStatus.ok;
        await request.response.close();
      } else {
        h(request);
      }
    });
  }

  Future<void> close() => _http.close(force: true);
}

Future<TlsTestServer> startTlsServer({
  String chainFile = 'server.crt',
  String keyFile = 'server.key',
}) async {
  final context = SecurityContext()
    ..useCertificateChain('test/fixtures/tls/$chainFile')
    ..usePrivateKey('test/fixtures/tls/$keyFile');
  final secure = await SecureServerSocket.bind(
    InternetAddress.loopbackIPv4,
    0,
    context,
  );
  final server = TlsTestServer._(
    HttpServer.listenOn(_ServerSocketAdapter(secure)),
  );
  server._serve();
  addTearDown(server.close);
  return server;
}

/// Dart 3.13 中 SecureServerSocket 不是 ServerSocket 的子类型，需适配。
class _ServerSocketAdapter extends Stream<Socket> implements ServerSocket {
  _ServerSocketAdapter(this._inner);

  final SecureServerSocket _inner;

  @override
  StreamSubscription<Socket> listen(
    void Function(Socket socket)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) {
    return _inner
        .map((socket) => socket as Socket)
        .listen(
          onData,
          onError: onError,
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
