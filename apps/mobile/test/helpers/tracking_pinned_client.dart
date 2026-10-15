import 'package:neko_mobile/core/net/pinned_client.dart';

/// 记录 close 次数的 PinnedHttpClient，用于资源生命周期断言。
class TrackingPinnedClient extends PinnedHttpClient {
  TrackingPinnedClient({
    required super.pinnedHost,
    required super.pinnedPort,
    required super.pinnedSha256,
  });

  var closeCount = 0;

  @override
  void close({bool force = false}) {
    closeCount++;
    super.close(force: force);
  }
}
