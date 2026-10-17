import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:neko_mobile/core/rpc/rpc_client.dart';

typedef FakeHandler = FutureOr<Object?> Function(Map<String, Object?>? params);

/// 脚本化的移动 API：按方法名返回结果或抛错，记录调用，手动推送通知。
class FakeMobileApi implements MobileApi {
  final Map<String, FakeHandler> handlers = <String, FakeHandler>{};
  final List<(String, Map<String, Object?>?)> calls =
      <(String, Map<String, Object?>?)>[];
  final StreamController<RpcNotification> _notifications =
      StreamController<RpcNotification>.broadcast(sync: true);

  void on(String method, FakeHandler handler) => handlers[method] = handler;

  List<Map<String, Object?>?> callsOf(String method) =>
      calls.where((c) => c.$1 == method).map((c) => c.$2).toList();

  void notify(String method, Map<String, dynamic> params) =>
      _notifications.add(RpcNotification(method, params));

  @override
  Stream<RpcNotification> get notifications => _notifications.stream;

  @override
  Future<Object?> call(String method, [Map<String, Object?>? params]) async {
    calls.add((method, params));
    final handler = handlers[method];
    if (handler == null) throw MobileApiException('not_found', method);
    // 经 JSON 往返，保证与线上一样只有 JSON 值。
    return jsonDecode(jsonEncode(await handler(params)));
  }

  Future<void> close() => _notifications.close();
}

/// 读取 TS/Dart 共用的协议 fixtures（packages/gateway/test/fixtures/mobile-api-v1）。
Map<String, dynamic> fixtureMessage(String name) {
  final file = File('../../packages/gateway/test/fixtures/mobile-api-v1/$name');
  final json = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
  return json['message'] as Map<String, dynamic>;
}

Map<String, dynamic> snapshotOf(
  List<Map<String, dynamic>> items, {
  bool busy = false,
  List<Map<String, dynamic>>? queued,
  String? historyBefore,
  List<Map<String, dynamic>> subagents = const <Map<String, dynamic>>[],
  Map<String, dynamic>? streaming,
}) => <String, dynamic>{
  'busy': busy,
  'queued': ?queued,
  'status': busy ? '思考中…' : null,
  'usage': <String, dynamic>{
    'input': 1,
    'output': 1,
    'cacheRead': 0,
    'cacheWrite': 0,
    'totalTokens': 2,
    'cost': 0,
  },
  'agent': <String, dynamic>{'model': 'faux/faux-1', 'thinkingLevel': null},
  'subagents': subagents,
  'agents': <Map<String, dynamic>>[],
  'approvalCount': 0,
  'items': items,
  'historyBefore': historyBefore,
  'streaming': streaming,
};

Map<String, dynamic> userItem(String key, String text) => <String, dynamic>{
  'key': key,
  'type': 'user',
  'text': text,
};

Map<String, dynamic> assistantItem(String key, String text) =>
    <String, dynamic>{
      'key': key,
      'type': 'assistant',
      'text': text,
      'thinking': '',
    };
