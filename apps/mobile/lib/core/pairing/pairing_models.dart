/// 未完成配对记录：响应丢失后凭它用相同参数重试（design D4）。
class PendingPairing {
  const PendingPairing({
    required this.serverId,
    required this.endpoint,
    required this.fingerprint,
    required this.code,
    required this.pairRequestId,
    required this.deviceId,
    required this.deviceName,
    required this.credential,
    required this.createdAt,
  });

  final String serverId;

  /// 规范化的 `https://<ipv4>:<port>`。
  final String endpoint;

  /// DER SHA-256 小写 hex。
  final String fingerprint;

  /// 一次性配对码（base64url）。
  final String code;

  /// 本次配对请求幂等键（UUIDv4），重试不变。
  final String pairRequestId;

  /// 本机设备 ID（UUIDv4），安装期间稳定。
  final String deviceId;

  final String deviceName;

  /// 32 字节随机值 base64url；不落 URL/日志。
  final String credential;

  /// 创建时间 Unix 毫秒。
  final int createdAt;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'v': 1,
    'serverId': serverId,
    'endpoint': endpoint,
    'fingerprint': fingerprint,
    'code': code,
    'pairRequestId': pairRequestId,
    'deviceId': deviceId,
    'deviceName': deviceName,
    'credential': credential,
    'createdAt': createdAt,
  };

  static PendingPairing? fromJson(Object? raw) {
    if (raw is! Map) return null;
    String str(String key) {
      final v = raw[key];
      return v is String ? v : '';
    }

    final createdAt = raw['createdAt'];
    if (createdAt is! int) return null;
    final pending = PendingPairing(
      serverId: str('serverId'),
      endpoint: str('endpoint'),
      fingerprint: str('fingerprint'),
      code: str('code'),
      pairRequestId: str('pairRequestId'),
      deviceId: str('deviceId'),
      deviceName: str('deviceName'),
      credential: str('credential'),
      createdAt: createdAt,
    );
    if (pending.serverId.isEmpty ||
        pending.endpoint.isEmpty ||
        pending.fingerprint.isEmpty ||
        pending.code.isEmpty ||
        pending.pairRequestId.isEmpty ||
        pending.deviceId.isEmpty ||
        pending.credential.isEmpty) {
      return null;
    }
    return pending;
  }
}

/// 已配对电脑记录。
class PairedComputer {
  const PairedComputer({
    required this.serverId,
    required this.serverName,
    required this.endpoint,
    required this.fingerprint,
    required this.deviceId,
    required this.credential,
    required this.grantRevision,
    required this.pairedAt,
  });

  final String serverId;
  final String serverName;
  final String endpoint;
  final String fingerprint;
  final String deviceId;
  final String credential;
  final int grantRevision;
  final int pairedAt;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'v': 1,
    'serverId': serverId,
    'serverName': serverName,
    'endpoint': endpoint,
    'fingerprint': fingerprint,
    'deviceId': deviceId,
    'credential': credential,
    'grantRevision': grantRevision,
    'pairedAt': pairedAt,
  };

  static PairedComputer? fromJson(Object? raw) {
    if (raw is! Map) return null;
    String str(String key) {
      final v = raw[key];
      return v is String ? v : '';
    }

    final grantRevision = raw['grantRevision'];
    final pairedAt = raw['pairedAt'];
    if (grantRevision is! int || grantRevision < 1) return null;
    if (pairedAt is! int) return null;
    final computer = PairedComputer(
      serverId: str('serverId'),
      serverName: str('serverName'),
      endpoint: str('endpoint'),
      fingerprint: str('fingerprint'),
      deviceId: str('deviceId'),
      credential: str('credential'),
      grantRevision: grantRevision,
      pairedAt: pairedAt,
    );
    if (computer.serverId.isEmpty ||
        computer.endpoint.isEmpty ||
        computer.fingerprint.isEmpty ||
        computer.deviceId.isEmpty ||
        computer.credential.isEmpty) {
      return null;
    }
    return computer;
  }
}
