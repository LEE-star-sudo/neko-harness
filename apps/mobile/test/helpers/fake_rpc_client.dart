import 'dart:async';

import 'package:neko_mobile/core/pairing/pairing_models.dart';
import 'package:neko_mobile/core/pairing/pairing_service.dart';
import 'package:neko_mobile/core/rpc/rpc_client.dart';

final PairedComputer kDummyComputer = PairedComputer(
  serverId: 'srv-1',
  serverName: '工作机',
  endpoint: 'https://192.168.1.20:8323',
  fingerprint: 'ab' * 32,
  deviceId: 'dev-1',
  credential: 'cred-1',
  grantRevision: 1,
  pairedAt: 0,
);

const RpcHelloResult kDummyHello = RpcHelloResult(
  apiVersion: 1,
  serverId: 'srv-1',
  serverName: '工作机',
  gatewayVersion: '0.3.1',
  capabilities: <String>['sessions', 'chat'],
);

/// 可控的 NekoRpcClient：脚本化 connect 结果，手动触发 close 事件。
/// [connectHandler] 收到自身实例；为空时 connect 直接成功。
class FakeRpcClient extends NekoRpcClient {
  FakeRpcClient({this.connectHandler})
    : super(
        computer: kDummyComputer,
        clientFactory: defaultPinnedClientFactory,
      );

  final Future<NekoRpcClient> Function(FakeRpcClient self)? connectHandler;

  final StreamController<RpcState> statesController =
      StreamController<RpcState>.broadcast(sync: true);

  var connectCalls = 0;
  var disposedCount = 0;

  @override
  Future<NekoRpcClient> connect() async {
    connectCalls++;
    final handler = connectHandler;
    if (handler != null) {
      return handler(this);
    }
    return this;
  }

  @override
  RpcHelloResult get hello => kDummyHello;

  @override
  Stream<RpcState> get states => statesController.stream;

  @override
  void dispose() {
    disposedCount++;
    // 走真实 dispose：验证连接关闭事件同步派发中释放 client 的链路
    // （sync 广播 controller 不允许在派发中 close）。
    super.dispose();
  }

  /// 模拟底层 WSS 关闭。
  void simulateClose(int? closeCode) {
    statesController.add(RpcClosed(closeCode: closeCode));
  }
}
