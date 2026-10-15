/// 移动 API v1 DTO（docs/mobile-api-v1.md）。解析宽松：缺失字段取默认值，
/// 未知字段忽略，使电脑端追加可选字段不破坏旧 App。
library;

typedef Json = Map<String, dynamic>;

String _str(Object? v, [String fallback = '']) => v is String ? v : fallback;
String? _strOrNull(Object? v) => v is String ? v : null;
int _int(Object? v, [int fallback = 0]) =>
    v is int ? v : (v is num ? v.round() : fallback);
int? _intOrNull(Object? v) => v is int ? v : (v is num ? v.round() : null);
double? _numOrNull(Object? v) => v is num ? v.toDouble() : null;
bool _bool(Object? v) => v == true;
Json _map(Object? v) =>
    v is Map ? v.cast<String, dynamic>() : <String, dynamic>{};
List<Json> _list(Object? v) => v is List
    ? v.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList()
    : <Json>[];

Json asJson(Object? value) => _map(value);
List<Json> asJsonList(Object? value) => _list(value);

class Workspace {
  const Workspace({required this.root, required this.name});

  factory Workspace.fromJson(Json json) =>
      Workspace(root: _str(json['root']), name: _str(json['name']));

  final String root;
  final String name;
}

class SessionSummary {
  const SessionSummary({
    required this.id,
    required this.workspace,
    required this.title,
    required this.preview,
    required this.lastUsedAt,
    this.lastMessageAt,
  });

  factory SessionSummary.fromJson(Json json) => SessionSummary(
    id: _str(json['id']),
    workspace: _str(json['workspace']),
    title: _str(json['title']),
    preview: _str(json['preview']),
    lastUsedAt: _int(json['lastUsedAt']),
    lastMessageAt: _intOrNull(json['lastMessageAt']),
  );

  final String id;
  final String workspace;
  final String title;
  final String preview;
  final int lastUsedAt;

  /// 旧网关不返回该字段，此时回退到最近使用时间。
  final int? lastMessageAt;

  /// 列表排序与展示用的时间：最近消息时间（无消息为创建时间），由服务端决定顺序。
  int get messageAt => lastMessageAt ?? lastUsedAt;
}

class ContentRef {
  const ContentRef({
    required this.sessionId,
    required this.key,
    required this.field,
    required this.digest,
    required this.bytes,
    this.agentId,
  });

  factory ContentRef.fromJson(Json json) => ContentRef(
    sessionId: _str(json['sessionId']),
    agentId: _strOrNull(json['agentId']),
    key: _str(json['key']),
    field: _str(json['field']),
    digest: _str(json['digest']),
    bytes: _int(json['bytes']),
  );

  final String sessionId;
  final String? agentId;
  final String key;
  final String field;
  final String digest;
  final int bytes;

  Json toJson() => <String, dynamic>{
    'sessionId': sessionId,
    'agentId': ?agentId,
    'key': key,
    'field': field,
    'digest': digest,
    'bytes': bytes,
  };
}

class ImageRef {
  const ImageRef({
    required this.name,
    required this.mimeType,
    required this.width,
    required this.height,
    required this.bytes,
    required this.entryId,
    required this.contentIndex,
  });

  factory ImageRef.fromJson(Json json) => ImageRef(
    name: _str(json['name']),
    mimeType: _str(json['mimeType']),
    width: _int(json['width']),
    height: _int(json['height']),
    bytes: _int(json['bytes']),
    entryId: _int(json['entryId']),
    contentIndex: _int(json['contentIndex']),
  );

  final String name;
  final String mimeType;
  final int width;
  final int height;
  final int bytes;
  final int entryId;
  final int contentIndex;

  String get cacheKey => '$entryId:$contentIndex';
}

enum ToolStatus { running, done, error }

class ToolInfo {
  const ToolInfo({
    required this.callId,
    required this.name,
    required this.summary,
    required this.status,
    this.detail,
    this.output,
    this.result,
    this.diff,
    this.diffAdded,
    this.diffRemoved,
    this.diffTruncated = false,
    this.durationMs,
    this.note,
  });

  factory ToolInfo.fromJson(Json json) => ToolInfo(
    callId: _str(json['callId']),
    name: _str(json['name'], 'tool'),
    summary: _str(json['summary']),
    status: switch (json['status']) {
      'done' => ToolStatus.done,
      'error' => ToolStatus.error,
      _ => ToolStatus.running,
    },
    detail: _strOrNull(json['detail']),
    output: _strOrNull(json['output']),
    result: _strOrNull(json['result']),
    diff: _strOrNull(json['diff']),
    diffAdded: _intOrNull(json['diffAdded']),
    diffRemoved: _intOrNull(json['diffRemoved']),
    diffTruncated: _bool(json['diffTruncated']),
    durationMs: _intOrNull(json['durationMs']),
    note: _strOrNull(json['note']),
  );

  final String callId;
  final String name;
  final String summary;
  final ToolStatus status;
  final String? detail;
  final String? output;
  final String? result;
  final String? diff;
  final int? diffAdded;
  final int? diffRemoved;
  final bool diffTruncated;
  final int? durationMs;
  final String? note;
}

enum ChatItemType { user, assistant, tool, system }

class ChatItem {
  const ChatItem({
    required this.key,
    required this.type,
    this.text = '',
    this.thinking = '',
    this.note,
    this.error,
    this.skill,
    this.tool,
    this.images = const <ImageRef>[],
    this.refs = const <ContentRef>[],
  });

  factory ChatItem.fromJson(Json json) {
    final legacyError = json['type'] == 'error';
    return ChatItem(
      key: _str(json['key']),
      type: switch (json['type']) {
        'user' => ChatItemType.user,
        'assistant' || 'error' => ChatItemType.assistant,
        'tool' => ChatItemType.tool,
        _ => ChatItemType.system,
      },
      text: legacyError ? '' : _str(json['text']),
      thinking: _str(json['thinking']),
      note: _strOrNull(json['note']),
      error: legacyError ? _str(json['text']) : _strOrNull(json['error']),
      skill: _strOrNull(json['skill']),
      tool: json['tool'] is Map ? ToolInfo.fromJson(_map(json['tool'])) : null,
      images: _list(json['images']).map(ImageRef.fromJson).toList(),
      refs: _list(json['refs']).map(ContentRef.fromJson).toList(),
    );
  }

  final String key;
  final ChatItemType type;
  final String text;
  final String thinking;
  final String? note;
  final String? error;
  final String? skill;
  final ToolInfo? tool;
  final List<ImageRef> images;

  /// 被截为预览的大字段引用；字段名见 [ContentRef.field]。
  final List<ContentRef> refs;

  ContentRef? refFor(String field) {
    for (final ref in refs) {
      if (ref.field == field) return ref;
    }
    return null;
  }
}

class Usage {
  const Usage({
    this.input = 0,
    this.output = 0,
    this.cacheRead = 0,
    this.cacheWrite = 0,
    this.totalTokens = 0,
    this.cost = 0,
  });

  factory Usage.fromJson(Json json) => Usage(
    input: _int(json['input']),
    output: _int(json['output']),
    cacheRead: _int(json['cacheRead']),
    cacheWrite: _int(json['cacheWrite']),
    totalTokens: _int(json['totalTokens']),
    cost: _numOrNull(json['cost']) ?? 0,
  );

  final int input;
  final int output;
  final int cacheRead;
  final int cacheWrite;
  final int totalTokens;
  final double cost;
}

class SubagentRound {
  const SubagentRound({
    required this.taskId,
    this.callId = '',
    required this.agentId,
    required this.role,
    required this.title,
    required this.status,
    required this.approvalCount,
    required this.readonly,
    this.round,
    this.usage,
  });

  factory SubagentRound.fromJson(Json json) => SubagentRound(
    taskId: _int(json['taskId']),
    callId: _str(json['callId']),
    agentId: _str(json['agentId']),
    round: _intOrNull(json['round']),
    role: _str(json['role']),
    title: _str(json['title']),
    status: _str(json['status']),
    approvalCount: _int(json['approvalCount']),
    readonly: _bool(json['readonly']),
    usage: json['usage'] is Map ? Usage.fromJson(_map(json['usage'])) : null,
  );

  final int taskId;
  final String callId;
  final String agentId;
  final int? round;
  final String role;
  final String title;
  final String status;
  final int approvalCount;
  final bool readonly;
  final Usage? usage;

  bool get active => status == 'queued' || status == 'running';
}

class AgentSummary {
  const AgentSummary({
    required this.agentId,
    required this.role,
    required this.title,
    required this.status,
    required this.roundCount,
    required this.approvalCount,
    this.activeRoundId,
  });

  factory AgentSummary.fromJson(Json json) => AgentSummary(
    agentId: _str(json['agentId']),
    role: _str(json['role']),
    title: _str(json['title']),
    status: _str(json['status']),
    activeRoundId: _intOrNull(json['activeRoundId']),
    roundCount: _int(json['roundCount']),
    approvalCount: _int(json['approvalCount']),
  );

  final String agentId;
  final String role;
  final String title;
  final String status;
  final int? activeRoundId;
  final int roundCount;
  final int approvalCount;
}

class ChatStatus {
  const ChatStatus({
    this.busy = false,
    this.status,
    this.usage = const Usage(),
    this.taskUsage,
    this.contextPercent,
    this.model,
    this.thinkingLevel,
    this.subagents = const <SubagentRound>[],
    this.agents = const <AgentSummary>[],
    this.approvalCount = 0,
    this.readonly = false,
  });

  factory ChatStatus.fromJson(Json json) {
    final agent = _map(json['agent']);
    final context = _map(json['contextUsage']);
    return ChatStatus(
      busy: _bool(json['busy']),
      status: _strOrNull(json['status']),
      usage: Usage.fromJson(_map(json['usage'])),
      taskUsage: json['taskUsage'] is Map
          ? Usage.fromJson(_map(json['taskUsage']))
          : null,
      contextPercent: _numOrNull(context['percent']),
      model: _strOrNull(agent['model']),
      thinkingLevel: _strOrNull(agent['thinkingLevel']),
      subagents: _list(json['subagents']).map(SubagentRound.fromJson).toList(),
      agents: _list(json['agents']).map(AgentSummary.fromJson).toList(),
      approvalCount: _int(json['approvalCount']),
      readonly: _bool(json['readonly']),
    );
  }

  final bool busy;
  final String? status;
  final Usage usage;
  final Usage? taskUsage;
  final double? contextPercent;
  final String? model;
  final String? thinkingLevel;
  final List<SubagentRound> subagents;
  final List<AgentSummary> agents;
  final int approvalCount;
  final bool readonly;
}

class StreamingToolCall {
  const StreamingToolCall({
    required this.callId,
    required this.name,
    required this.summary,
    required this.done,
  });

  factory StreamingToolCall.fromJson(Json json) => StreamingToolCall(
    callId: _str(json['callId']),
    name: _str(json['name']),
    summary: _str(json['summary']),
    done: json['status'] == 'done',
  );

  final String callId;
  final String name;
  final String summary;
  final bool done;
}

class Streaming {
  const Streaming({
    this.text = '',
    this.thinking = '',
    this.textOmitted = 0,
    this.thinkingOmitted = 0,
    this.toolCalls = const <StreamingToolCall>[],
  });

  factory Streaming.fromJson(Json json) => Streaming(
    text: _str(json['text']),
    thinking: _str(json['thinking']),
    textOmitted: _int(json['textOmitted']),
    thinkingOmitted: _int(json['thinkingOmitted']),
    toolCalls: _list(json['toolCalls'])
        .map(StreamingToolCall.fromJson)
        .toList(),
  );

  final String text;
  final String thinking;
  final int textOmitted;
  final int thinkingOmitted;
  final List<StreamingToolCall> toolCalls;

  Streaming append({String? text, String? thinking}) => Streaming(
    text: this.text + (text ?? ''),
    thinking: this.thinking + (thinking ?? ''),
    textOmitted: textOmitted,
    thinkingOmitted: thinkingOmitted,
    toolCalls: toolCalls,
  );
}

class Approval {
  const Approval({
    required this.id,
    required this.version,
    required this.taskId,
    required this.command,
    required this.cwd,
    required this.requestedAt,
    this.agentId,
    this.title,
    this.timeoutSeconds,
  });

  factory Approval.fromJson(Json json) => Approval(
    id: _int(json['id']),
    version: _str(json['version']),
    taskId: _int(json['taskId']),
    agentId: _strOrNull(json['agentId']),
    title: _strOrNull(json['title']),
    command: _str(json['command']),
    cwd: _str(json['cwd']),
    timeoutSeconds: _numOrNull(json['timeoutSeconds']),
    requestedAt: _int(json['requestedAt']),
  );

  final int id;
  final String version;
  final int taskId;
  final String? agentId;
  final String? title;
  final String command;
  final String cwd;
  final double? timeoutSeconds;
  final int requestedAt;
}
