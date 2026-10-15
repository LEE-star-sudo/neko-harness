import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:neko_mobile/core/net/pinned_client.dart';
import 'package:neko_mobile/core/pairing/pairing_models.dart';
import 'package:neko_mobile/core/pairing/pairing_text.dart';
import 'package:neko_mobile/core/storage/key_value_store.dart';
import 'package:uuid/uuid.dart';

/// 配对失败类别。code 与 design D4 的稳定错误码一致；message 不得包含凭据。
sealed class PairingException implements Exception {
  const PairingException(this.message);

  final String message;

  String get code;
}

class InvalidPairingException extends PairingException {
  const InvalidPairingException([super.message = '请求被电脑拒绝']);

  @override
  String get code => 'invalid';
}

class WrongServerException extends PairingException {
  const WrongServerException() : super('电脑标识与二维码不符');

  @override
  String get code => 'wrong_server';
}

class CodeUsedException extends PairingException {
  const CodeUsedException() : super('配对码已被使用');

  @override
  String get code => 'code_used';
}

class CodeExpiredException extends PairingException {
  const CodeExpiredException() : super('配对码已过期');

  @override
  String get code => 'code_expired';
}

class PayloadTooLargeException extends PairingException {
  const PayloadTooLargeException() : super('请求体超过电脑限制');

  @override
  String get code => 'payload_too_large';
}

class RateLimitedException extends PairingException {
  const RateLimitedException() : super('尝试过于频繁，请稍后再试');

  @override
  String get code => 'rate_limited';
}

/// 响应不符合 D4 成功 schema。
class PairingResponseException extends PairingException {
  const PairingResponseException([super.message = '电脑返回了无法识别的响应']);

  @override
  String get code => 'bad_response';
}

/// 网络层失败（连接中断、超时等）。pending 保留，可用相同参数重试。
class PairingNetworkException extends PairingException {
  const PairingNetworkException([super.message = '网络连接失败，请重试']);

  @override
  String get code => 'network';

  @override
  String toString() => 'PairingNetworkException: $message';
}

/// TLS 证书校验失败（指纹/有效期/主机不符）。
class PairingCertificateException extends PairingException {
  const PairingCertificateException() : super('电脑证书与配对指纹不符');

  @override
  String get code => 'certificate';
}

/// 配对服务。生产实现见 [LocalPairingService]；测试可注入假实现。
/// 配对请求（连接 + 响应体）的整体等待上限，静默的对端不会让配对一直转圈。
const Duration _requestTimeout = Duration(seconds: 15);

abstract class PairingService {
  Future<PairedComputer> pair(PairingTarget target);
}

/// 按 endpoint + 指纹构造 pin client 的工厂。
typedef PinnedClientFactory = PinnedHttpClient Function(
  Uri endpoint,
  String fingerprint,
);

PinnedHttpClient defaultPinnedClientFactory(Uri endpoint, String fingerprint) {
  return PinnedHttpClient(
    pinnedHost: endpoint.host,
    pinnedPort: endpoint.port,
    pinnedSha256: fingerprint,
  );
}

/// design D4 的本地实现：
/// 先持久化 pending 记录，再发请求；响应丢失后凭 pending 用相同参数重试。
class LocalPairingService implements PairingService {
  LocalPairingService({
    required this.store,
    required this.clientFactory,
    this.deviceName = 'Neko Mobile',
    DateTime Function()? clock,
    String Function()? idGenerator,
    List<int> Function()? credentialGenerator,
  }) : _clock = clock ?? DateTime.now,
       _idGenerator = idGenerator ?? const Uuid().v4,
       _credentialGenerator = credentialGenerator ?? _randomCredential;

  final KeyValueStore store;
  final PinnedClientFactory clientFactory;
  final String deviceName;
  final DateTime Function() _clock;
  final String Function() _idGenerator;
  final List<int> Function() _credentialGenerator;

  static List<int> _randomCredential() {
    final random = Random.secure();
    return List<int>.generate(32, (_) => random.nextInt(256));
  }

  static String credentialToBase64url(List<int> bytes) {
    return base64Url.encode(bytes).replaceAll('=', '');
  }

  /// 本机设备 ID：首次使用生成 UUIDv4 并持久化，安装期间稳定。
  Future<String> _deviceId() async {
    final existing = await store.read(StorageKeys.deviceId);
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }
    final id = _idGenerator();
    await store.write(StorageKeys.deviceId, id);
    return id;
  }

  Future<PendingPairing> _resolvePending(PairingTarget target) async {
    final key = StorageKeys.pendingPairing(target.serverId);
    final endpoint = _endpointString(target);
    final raw = await store.read(key);
    final existing = raw == null
        ? null
        : PendingPairing.fromJson(jsonDecode(raw));
    if (existing != null &&
        existing.endpoint == endpoint &&
        existing.fingerprint == target.fingerprint &&
        existing.code == target.code) {
      return existing;
    }
    final pending = PendingPairing(
      serverId: target.serverId,
      endpoint: endpoint,
      fingerprint: target.fingerprint,
      code: target.code,
      pairRequestId: _idGenerator(),
      deviceId: await _deviceId(),
      deviceName: deviceName,
      credential: credentialToBase64url(_credentialGenerator()),
      createdAt: _clock().millisecondsSinceEpoch,
    );
    // 任何网络请求之前先持久化未完成记录。
    await store.write(key, jsonEncode(pending.toJson()));
    return pending;
  }

  static String _endpointString(PairingTarget target) {
    return 'https://${target.endpoint.host}:${target.endpoint.port}';
  }

  @override
  Future<PairedComputer> pair(PairingTarget target) async {
    final pending = await _resolvePending(target);
    final client = clientFactory(target.endpoint, target.fingerprint);
    try {
      final body = jsonEncode(<String, dynamic>{
        'v': kPairingVersion,
        'sid': target.serverId,
        'code': pending.code,
        'pairRequestId': pending.pairRequestId,
        'deviceId': pending.deviceId,
        'deviceName': pending.deviceName,
        'credential': pending.credential,
      });
      final bodyBytes = utf8.encode(body);
      if (bodyBytes.length > 4096) {
        throw const PayloadTooLargeException();
      }

      final HttpClientResponse response;
      try {
        response = await client
            .post(
              target.pairUri,
              headers: const <String, String>{
                'content-type': 'application/json',
              },
              body: bodyBytes,
            )
            .timeout(_requestTimeout);
      } on HandshakeException {
        throw const PairingCertificateException();
      } on SocketException {
        throw const PairingNetworkException();
      } on HttpException {
        throw const PairingNetworkException();
      } on TimeoutException {
        throw const PairingNetworkException();
      }

      switch (response.statusCode) {
        case HttpStatus.ok:
          return await _handleSuccess(target, pending, response);
        case HttpStatus.badRequest:
          await response.drain<void>();
          throw const InvalidPairingException();
        case HttpStatus.forbidden:
          await response.drain<void>();
          throw const WrongServerException();
        case HttpStatus.conflict:
          await response.drain<void>();
          throw const CodeUsedException();
        case HttpStatus.gone:
          await response.drain<void>();
          throw const CodeExpiredException();
        case HttpStatus.requestEntityTooLarge:
          await response.drain<void>();
          throw const PayloadTooLargeException();
        case HttpStatus.tooManyRequests:
          await response.drain<void>();
          throw const RateLimitedException();
        default:
          await response.drain<void>();
          throw PairingNetworkException('电脑返回了未知状态 ${response.statusCode}');
      }
    } finally {
      // 响应体已读完/错误路径已 drain 后才关闭；异常路径同样释放。
      client.close();
    }
  }

  Future<PairedComputer> _handleSuccess(
    PairingTarget target,
    PendingPairing pending,
    HttpClientResponse response,
  ) async {
    final Object? data;
    final String text;
    try {
      text = await utf8.decoder.bind(response).join().timeout(_requestTimeout);
    } on TimeoutException {
      throw const PairingNetworkException('电脑响应超时，请重试');
    } on HttpException {
      // 连接在响应体传输中断开：与响应丢失同语义，保留 pending 供重试。
      throw const PairingNetworkException('电脑连接中断，请重试');
    } on SocketException {
      throw const PairingNetworkException('电脑连接中断，请重试');
    }
    try {
      data = jsonDecode(text);
    } on FormatException {
      throw const PairingResponseException('响应不是合法 JSON');
    }
    if (data is! Map<String, dynamic>) {
      throw const PairingResponseException('响应不是 JSON 对象');
    }
    final serverId = data['serverId'];
    final serverName = data['serverName'];
    final deviceId = data['deviceId'];
    final grantRevision = data['grantRevision'];
    final apiVersions = data['apiVersions'];
    if (serverId is! String || serverId != target.serverId) {
      throw const PairingResponseException('serverId 与请求不一致');
    }
    if (deviceId is! String || deviceId != pending.deviceId) {
      throw const PairingResponseException('deviceId 与请求不一致');
    }
    if (serverName is! String || serverName.isEmpty || serverName.length > 64) {
      throw const PairingResponseException('serverName 不合法');
    }
    if (grantRevision is! int || grantRevision < 1) {
      throw const PairingResponseException('grantRevision 不合法');
    }
    if (apiVersions is! List || !apiVersions.contains(1)) {
      throw const PairingResponseException('apiVersions 不含 1');
    }
    final computer = PairedComputer(
      serverId: serverId,
      serverName: serverName,
      endpoint: pending.endpoint,
      fingerprint: pending.fingerprint,
      deviceId: pending.deviceId,
      credential: pending.credential,
      grantRevision: grantRevision,
      pairedAt: _clock().millisecondsSinceEpoch,
    );
    await store.write(
      StorageKeys.pairedComputer(serverId),
      jsonEncode(computer.toJson()),
    );
    await store.delete(StorageKeys.pendingPairing(serverId));
    return computer;
  }
}
