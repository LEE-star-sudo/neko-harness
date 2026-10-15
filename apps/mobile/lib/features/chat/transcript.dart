import 'package:flutter/foundation.dart';
import 'package:neko_mobile/core/api/models.dart';

/// 主会话与子 agent 共用的有界转录状态（design D8）：快照、补丁与向上翻页。
class Transcript extends ChangeNotifier {
  List<ChatItem> _items = <ChatItem>[];
  ChatStatus _status = const ChatStatus();
  Streaming? _streaming;
  String? _historyBefore;
  int _seq = 0;
  bool _loaded = false;

  /// 经 contentRef 读回的完整字段：`key|field` → 全文。
  final Map<String, String> _expanded = <String, String>{};

  List<ChatItem> get items => _items;

  ChatStatus get status => _status;

  Streaming? get streaming => _streaming;

  String? get historyBefore => _historyBefore;

  bool get loaded => _loaded;

  bool get hasOlder => _historyBefore != null;

  String? expanded(String key, String field) => _expanded['$key|$field'];

  void setExpanded(String key, String field, String text) {
    _expanded['$key|$field'] = text;
    notifyListeners();
  }

  void clear() {
    _items = <ChatItem>[];
    _status = const ChatStatus();
    _streaming = null;
    _historyBefore = null;
    _seq = 0;
    _loaded = false;
    _expanded.clear();
    notifyListeners();
  }

  void applySnapshot(Json snapshot) {
    _items = asJsonList(snapshot['items']).map(ChatItem.fromJson).toList();
    _status = ChatStatus.fromJson(snapshot);
    final streaming = snapshot['streaming'];
    _streaming = streaming is Map
        ? Streaming.fromJson(streaming.cast<String, dynamic>())
        : null;
    final before = snapshot['historyBefore'];
    _historyBefore = before is String ? before : null;
    _seq = 0;
    _loaded = true;
    _expanded.clear();
    notifyListeners();
  }

  /// 应用补丁；返回 false 表示序号不连续，调用方应重新取快照。
  bool applyPatch(Json params) {
    final seq = params['seq'];
    if (seq is! int || seq <= _seq) return true;
    if (seq != _seq + 1) return false;
    _seq = seq;
    final upserts = asJsonList(params['upserts']).map(ChatItem.fromJson);
    if (upserts.isNotEmpty) {
      final next = List<ChatItem>.of(_items);
      final index = <String, int>{
        for (var i = 0; i < next.length; i++) next[i].key: i,
      };
      for (final item in upserts) {
        final at = index[item.key];
        if (at != null) {
          next[at] = item;
          _expanded.removeWhere((k, _) => k.startsWith('${item.key}|'));
        } else {
          index[item.key] = next.length;
          next.add(item);
        }
      }
      _items = next;
    }
    final status = params['status'];
    if (status is Map) {
      _status = ChatStatus.fromJson(status.cast<String, dynamic>());
    }
    if (params.containsKey('streaming')) {
      final value = params['streaming'];
      _streaming = value is Map
          ? Streaming.fromJson(value.cast<String, dynamic>())
          : null;
    }
    final append = params['streamingAppend'];
    if (append is Map) {
      _streaming = (_streaming ?? const Streaming()).append(
        text: append['text'] as String?,
        thinking: append['thinking'] as String?,
      );
    }
    notifyListeners();
    return true;
  }

  /// 更早一页插入到开头；与已有 key 重复的条目丢弃。
  void prepend(List<ChatItem> older, String? historyBefore) {
    final known = _items.map((e) => e.key).toSet();
    _items = <ChatItem>[
      ...older.where((e) => !known.contains(e.key)),
      ..._items,
    ];
    _historyBefore = historyBefore;
    notifyListeners();
  }
}
