import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:neko_mobile/core/api/models.dart';
import 'package:neko_mobile/features/app_controller.dart';
import 'package:neko_mobile/ui/theme.dart';

String relativeTime(int millis, [DateTime? now]) {
  if (millis <= 0) return '';
  final at = DateTime.fromMillisecondsSinceEpoch(millis);
  final diff = (now ?? DateTime.now()).difference(at);
  if (diff.inMinutes < 1) return '刚刚';
  if (diff.inHours < 1) return '${diff.inMinutes} 分钟前';
  if (diff.inDays < 1) return '${diff.inHours} 小时前';
  if (diff.inDays < 30) return '${diff.inDays} 天前';
  return '${at.year}-${at.month.toString().padLeft(2, '0')}-${at.day.toString().padLeft(2, '0')}';
}

/// 当前工作区的会话列表：搜索、分页、新建与切换。
class SessionListPage extends ConsumerStatefulWidget {
  const SessionListPage({super.key});

  @override
  ConsumerState<SessionListPage> createState() => _SessionListPageState();
}

class _SessionListPageState extends ConsumerState<SessionListPage> {
  late final TextEditingController _search = TextEditingController(
    text: ref.read(sessionsControllerProvider).query,
  );

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _open(SessionSummary session) async {
    final chat = ref.read(chatControllerProvider);
    final navigator = Navigator.of(context);
    if (navigator.canPop()) navigator.pop();
    await chat.attach(session.id);
  }

  @override
  Widget build(BuildContext context) {
    final sessions = ref.watch(sessionsControllerProvider);
    final chat = ref.watch(chatControllerProvider);
    final tokens = NekoTokens.of(context);
    return ListenableBuilder(
      listenable: sessions,
      builder: (context, _) {
        final workspace = sessions.currentWorkspace;
        return Scaffold(
          appBar: AppBar(
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text('会话'),
                if (workspace != null)
                  Text(
                    workspace.root,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            ),
          ),
          floatingActionButton: FloatingActionButton.extended(
            key: const Key('sessions-new'),
            onPressed: !sessions.ready || sessions.creating || workspace == null
                ? null
                : () async {
                    final created = await sessions.create();
                    if (created != null && context.mounted) {
                      await _open(created);
                    }
                  },
            icon: sessions.creating
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.add),
            label: const Text('新建会话'),
          ),
          body: Column(
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: TextField(
                  key: const Key('sessions-search'),
                  controller: _search,
                  onChanged: sessions.search,
                  decoration: const InputDecoration(
                    isDense: true,
                    prefixIcon: Icon(Icons.search),
                    hintText: '搜索标题或首条消息',
                  ),
                ),
              ),
              if (sessions.error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    sessions.error!,
                    style: TextStyle(color: tokens.danger),
                  ),
                ),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: sessions.refresh,
                  child: ListView.builder(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.only(bottom: 96),
                    itemCount: sessions.sessions.length + 1,
                    itemBuilder: (context, index) {
                      if (index == sessions.sessions.length) {
                        if (sessions.hasMore) {
                          sessions.loadMore();
                          return const Padding(
                            padding: EdgeInsets.all(16),
                            child: Center(child: CircularProgressIndicator()),
                          );
                        }
                        if (sessions.sessions.isEmpty && !sessions.loading) {
                          return Padding(
                            padding: const EdgeInsets.all(32),
                            child: Center(
                              child: Text(
                                sessions.query.isEmpty ? '还没有会话' : '没有匹配的会话',
                                style: TextStyle(color: tokens.textFaint),
                              ),
                            ),
                          );
                        }
                        return const SizedBox.shrink();
                      }
                      final s = sessions.sessions[index];
                      return ListTile(
                        key: Key('session-${s.id}'),
                        selected: s.id == chat.sessionId,
                        title: Text(
                          s.title.isEmpty ? '新会话' : s.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Text(
                          s.preview.isEmpty
                              ? relativeTime(s.lastUsedAt)
                              : s.preview,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: Text(
                          relativeTime(s.lastUsedAt),
                          style: TextStyle(
                            color: tokens.textFaint,
                            fontSize: 12,
                          ),
                        ),
                        onTap: () => _open(s),
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
