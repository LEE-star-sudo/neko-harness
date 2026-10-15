import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:neko_mobile/core/api/models.dart';
import 'package:neko_mobile/core/rpc/connection_manager.dart';
import 'package:neko_mobile/features/app_controller.dart';
import 'package:neko_mobile/features/approvals/approval_sheet.dart';
import 'package:neko_mobile/features/chat/chat_controller.dart';
import 'package:neko_mobile/features/computers/computers_page.dart';
import 'package:neko_mobile/features/sessions/session_list_page.dart';
import 'package:neko_mobile/features/sessions/sessions_controller.dart';
import 'package:neko_mobile/features/subagents/subagent_page.dart';
import 'package:neko_mobile/ui/theme.dart';
import 'package:neko_mobile/ui/widgets/transcript_view.dart';

/// 主会话页：抽屉导航工作区/会话，单列转录 + 审批条 + 输入区（design D10）。
class ChatPage extends ConsumerWidget {
  const ChatPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chat = ref.watch(chatControllerProvider);
    final sessions = ref.watch(sessionsControllerProvider);
    final manager = ref.watch(connectionManagerProvider);
    return ListenableBuilder(
      listenable: Listenable.merge(<Listenable>[
        chat,
        sessions,
        chat.transcript,
      ]),
      builder: (context, _) {
        final session = sessions.sessions
            .where((s) => s.id == chat.sessionId)
            .firstOrNull;
        final status = chat.transcript.status;
        return Scaffold(
          drawer: NekoDrawer(sessions: sessions, chat: chat, manager: manager),
          appBar: AppBar(
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  chat.sessionId == null
                      ? 'Neko'
                      : (session?.title.isNotEmpty ?? false)
                      ? session!.title
                      : '会话 ${chat.sessionId}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  key: const Key('chat-title'),
                ),
                Text(
                  status.busy
                      ? (status.status ?? '运行中…')
                      : (sessions.currentWorkspace?.name ?? ''),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
            actions: <Widget>[
              const ConnectionIndicator(),
              IconButton(
                key: const Key('open-sessions'),
                tooltip: '会话列表',
                icon: const Icon(Icons.forum_outlined),
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const SessionListPage(),
                  ),
                ),
              ),
            ],
          ),
          body: SafeArea(
            top: false,
            child: Column(
              children: <Widget>[
                ConnectionBanner(manager: manager),
                if (chat.error != null)
                  ErrorBanner(text: chat.error!, onClose: chat.clearError),
                Expanded(
                  child: chat.sessionId == null
                      ? _EmptySession(sessions: sessions, chat: chat)
                      : chat.phase == ChatPhase.error && !chat.transcript.loaded
                      ? _AttachError(chat: chat)
                      : TranscriptView(
                          key: ValueKey<String>('main-${chat.sessionId}'),
                          actions: chat,
                          onOpenSubagent: (round) =>
                              openSubagent(context, round),
                        ),
                ),
                ApprovalBar(
                  approvals: chat.approvals,
                  onDecide: chat.decide,
                  enabled: chat.canControl,
                ),
                PendingTray(chat: chat),
                if (chat.sessionId != null) Composer(chat: chat),
              ],
            ),
          ),
        );
      },
    );
  }
}

void openSubagent(BuildContext context, SubagentRound round) {
  Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => SubagentPage(
        agentId: round.readonly ? 'round-${round.taskId}' : round.agentId,
        title: round.title,
      ),
    ),
  );
}

class _EmptySession extends StatelessWidget {
  const _EmptySession({required this.sessions, required this.chat});

  final SessionsController sessions;
  final ChatController chat;

  @override
  Widget build(BuildContext context) {
    final tokens = NekoTokens.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text(
              sessions.workspaces.isEmpty
                  ? '电脑上还没有登记工作区，请先在电脑端添加。'
                  : '选择一个会话或新建会话',
              textAlign: TextAlign.center,
              style: TextStyle(color: tokens.textMuted),
            ),
            const SizedBox(height: 16),
            if (sessions.workspaces.isNotEmpty)
              FilledButton.icon(
                key: const Key('empty-new-session'),
                onPressed: !sessions.ready || sessions.creating
                    ? null
                    : () async {
                        final created = await sessions.create();
                        if (created != null) await chat.attach(created.id);
                      },
                icon: const Icon(Icons.add),
                label: const Text('新建会话'),
              ),
          ],
        ),
      ),
    );
  }
}

/// 附着失败：内容未知，给出重试而不是无限加载。
class _AttachError extends StatelessWidget {
  const _AttachError({required this.chat});

  final ChatController chat;

  @override
  Widget build(BuildContext context) {
    final tokens = NekoTokens.of(context);
    return Center(
      key: const Key('attach-error'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(
            chat.error ?? '加载会话失败',
            textAlign: TextAlign.center,
            style: TextStyle(color: tokens.textMuted),
          ),
          const SizedBox(height: 12),
          FilledButton.tonal(
            key: const Key('attach-retry'),
            onPressed: chat.api != null
                ? () => chat.attach(chat.sessionId!)
                : null,
            child: const Text('重试'),
          ),
        ],
      ),
    );
  }
}

/// AppBar 连接状态指示：在线/连接中/重连中/离线一目了然；
/// 断线态点击立即重连，终态点击回到扫码引导。
class ConnectionIndicator extends ConsumerWidget {
  const ConnectionIndicator({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final manager = ref.watch(connectionManagerProvider);
    final tokens = NekoTokens.of(context);
    return StreamBuilder<NekoConnectionState>(
      stream: manager.states,
      initialData: manager.state,
      builder: (context, snapshot) {
        final state = snapshot.data ?? const NekoConnIdle();
        final (
          IconData icon,
          Color color,
          String label,
          bool spinning,
        ) = switch (state) {
          NekoConnReady() => (Icons.circle, tokens.success, '在线', false),
          NekoConnConnecting() => (Icons.sync, tokens.warning, '连接中', true),
          NekoConnRestoring() => (Icons.sync, tokens.warning, '重连中', true),
          NekoConnOffline() => (Icons.cloud_off, tokens.danger, '离线', false),
          NekoConnRevoked() => (Icons.block, tokens.danger, '授权已撤销', false),
          NekoConnTrustChanged() => (
            Icons.gpp_maybe,
            tokens.danger,
            '证书已变更',
            false,
          ),
          NekoConnIncompatible() => (
            Icons.error_outline,
            tokens.danger,
            '版本不兼容',
            false,
          ),
          NekoConnIdle() => (Icons.circle, tokens.textFaint, '未连接', false),
        };
        final retryable =
            state is NekoConnOffline ||
            state is NekoConnConnecting ||
            state is NekoConnRestoring;
        final terminal =
            state is NekoConnRevoked ||
            state is NekoConnTrustChanged ||
            state is NekoConnIncompatible;
        return Tooltip(
          message: label,
          child: InkWell(
            key: const Key('connection-indicator'),
            borderRadius: BorderRadius.circular(NekoTokens.radiusControl),
            onTap: retryable
                ? manager.onForeground
                : terminal
                ? () {
                    manager.stopToScan();
                    context.go('/scan');
                  }
                : null,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  SizedBox.square(
                    dimension: 16,
                    child: spinning
                        ? CircularProgressIndicator(
                            strokeWidth: 2,
                            color: color,
                          )
                        : Icon(icon, size: 14, color: color),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    label,
                    key: const Key('connection-indicator-label'),
                    style: TextStyle(color: color, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

/// 连接状态条：离线/恢复中时内容保留、控制禁用。
class ConnectionBanner extends StatelessWidget {
  const ConnectionBanner({super.key, required this.manager});

  final ConnectionManager manager;

  @override
  Widget build(BuildContext context) {
    final tokens = NekoTokens.of(context);
    return StreamBuilder<NekoConnectionState>(
      stream: manager.states,
      initialData: manager.state,
      builder: (context, snapshot) {
        final state = snapshot.data;
        final (String? text, Widget? leading, Widget? action) = switch (state) {
          NekoConnOffline(:final nextRetryIn) => (
            '电脑暂不可达，${nextRetryIn.inSeconds + 1} 秒后重试；电脑上的任务不受影响',
            null,
            TextButton(
              key: const Key('banner-retry'),
              onPressed: manager.onForeground,
              child: const Text('立即重试'),
            ),
          ),
          NekoConnConnecting() || NekoConnRestoring() => (
            '正在恢复连接…',
            const SizedBox.square(
              dimension: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            TextButton(
              key: const Key('banner-retry'),
              onPressed: manager.onForeground,
              child: const Text('立即重连'),
            ),
          ),
          NekoConnRevoked() => (
            '设备授权已被电脑撤销，请重新扫码配对',
            Icon(Icons.block, size: 18, color: tokens.danger),
            TextButton(
              key: const Key('banner-rescan'),
              onPressed: () {
                manager.stopToScan();
                context.go('/scan');
              },
              child: const Text('重新配对'),
            ),
          ),
          NekoConnTrustChanged() => (
            '电脑证书已变更，请重新扫码配对',
            Icon(Icons.gpp_maybe, size: 18, color: tokens.danger),
            TextButton(
              key: const Key('banner-rescan'),
              onPressed: () {
                manager.stopToScan();
                context.go('/scan');
              },
              child: const Text('重新配对'),
            ),
          ),
          NekoConnIncompatible() => (
            '应用与电脑协议版本不兼容，请升级后重试',
            Icon(Icons.error_outline, size: 18, color: tokens.danger),
            null,
          ),
          _ => (null, null, null),
        };
        if (text == null) return const SizedBox.shrink();
        return Material(
          key: const Key('connection-banner'),
          color: tokens.surfaceMuted,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Row(
              children: <Widget>[
                leading ??
                    Icon(Icons.cloud_off, size: 18, color: tokens.textMuted),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(text, style: TextStyle(color: tokens.textMuted)),
                ),
                ?action,
              ],
            ),
          ),
        );
      },
    );
  }
}

class ErrorBanner extends StatelessWidget {
  const ErrorBanner({super.key, required this.text, required this.onClose});

  final String text;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final tokens = NekoTokens.of(context);
    return Material(
      key: const Key('error-banner'),
      color: tokens.danger.withValues(alpha: 0.1),
      child: Row(
        children: <Widget>[
          const SizedBox(width: 16),
          Expanded(
            child: Text(text, style: TextStyle(color: tokens.danger)),
          ),
          IconButton(
            tooltip: '关闭',
            onPressed: onClose,
            icon: const Icon(Icons.close),
          ),
        ],
      ),
    );
  }
}

/// 待确认的发送：只允许以原请求重试或放弃，不自动重发。
class PendingTray extends StatelessWidget {
  const PendingTray({super.key, required this.chat});

  final ChatController chat;

  @override
  Widget build(BuildContext context) {
    final unknown = chat.pending.where((p) => p.unknown).toList();
    if (unknown.isEmpty) return const SizedBox.shrink();
    final tokens = NekoTokens.of(context);
    return Column(
      children: <Widget>[
        for (final record in unknown)
          Material(
            key: Key('pending-${record.requestId}'),
            color: tokens.surfaceMuted,
            child: Padding(
              padding: const EdgeInsets.only(left: 16),
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      '待确认：${record.text}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  TextButton(
                    key: Key('pending-retry-${record.requestId}'),
                    onPressed: chat.canControl && !chat.sending
                        ? () => chat.retry(record)
                        : null,
                    child: const Text('重试'),
                  ),
                  TextButton(
                    key: Key('pending-discard-${record.requestId}'),
                    onPressed: () => chat.discard(record),
                    child: const Text('放弃'),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// 输入区：离线时仍可编辑草稿；忙碌时可选择排队或引导当前运行，并可停止。
class Composer extends StatefulWidget {
  const Composer({super.key, required this.chat});

  final ChatController chat;

  @override
  State<Composer> createState() => _ComposerState();
}

class _ComposerState extends State<Composer> {
  bool _steer = false;

  @override
  Widget build(BuildContext context) {
    final chat = widget.chat;
    final tokens = NekoTokens.of(context);
    final busy = chat.transcript.status.busy;
    final can = chat.canControl;
    return Material(
      color: tokens.base,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            if (busy && can)
              Align(
                alignment: Alignment.centerLeft,
                child: FilterChip(
                  key: const Key('composer-steer'),
                  label: const Text('引导当前运行'),
                  tooltip: '关闭时消息在当前回答结束后排队处理',
                  selected: _steer,
                  onSelected: (value) => setState(() => _steer = value),
                ),
              ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: <Widget>[
                Expanded(
                  child: TextField(
                    key: const Key('composer-input'),
                    controller: chat.input,
                    minLines: 1,
                    maxLines: 6,
                    textInputAction: TextInputAction.newline,
                    decoration: InputDecoration(
                      isDense: true,
                      hintText: !can
                          ? '未连接，可继续编辑草稿'
                          : busy
                          ? (_steer ? '引导当前运行…' : '回答结束后排队处理')
                          : '发消息给 Agent',
                    ),
                  ),
                ),
                if (busy)
                  IconButton(
                    key: const Key('composer-stop'),
                    tooltip: '停止当前运行',
                    onPressed: can ? chat.abort : null,
                    icon: Icon(
                      Icons.stop_circle_outlined,
                      color: tokens.danger,
                    ),
                  ),
                ListenableBuilder(
                  listenable: chat.input,
                  builder: (context, _) => IconButton.filled(
                    key: const Key('composer-send'),
                    tooltip: busy && _steer ? '引导' : '发送',
                    onPressed:
                        can &&
                            !chat.sending &&
                            chat.input.text.trim().isNotEmpty
                        ? () => chat.send(steer: busy && _steer)
                        : null,
                    icon: chat.sending
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.arrow_upward),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// 抽屉：电脑、工作区（同名显示完整路径）与当前工作区最近会话。
class NekoDrawer extends StatelessWidget {
  const NekoDrawer({
    super.key,
    required this.sessions,
    required this.chat,
    required this.manager,
  });

  final SessionsController sessions;
  final ChatController chat;
  final ConnectionManager manager;

  @override
  Widget build(BuildContext context) {
    final tokens = NekoTokens.of(context);
    final names = <String, int>{};
    for (final w in sessions.workspaces) {
      names[w.name] = (names[w.name] ?? 0) + 1;
    }
    return Drawer(
      child: SafeArea(
        child: ListenableBuilder(
          listenable: sessions,
          builder: (context, _) => ListView(
            children: <Widget>[
              ListTile(
                leading: const Icon(Icons.computer),
                title: Text(manager.computer?.serverName ?? '未连接'),
                subtitle: const Text('电脑与设置'),
                onTap: () {
                  Navigator.of(context).pop();
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const ComputersPage(),
                    ),
                  );
                },
              ),
              const Divider(),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: Text('工作区', style: TextStyle(color: tokens.textFaint)),
              ),
              for (final w in sessions.workspaces)
                ListTile(
                  key: Key('workspace-${w.root}'),
                  selected: w.root == sessions.workspace,
                  title: Text(
                    w.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle:
                      (names[w.name] ?? 0) > 1 || w.root == sessions.workspace
                      ? Text(
                          w.root,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12),
                        )
                      : null,
                  onTap: () => sessions.selectWorkspace(w.root),
                ),
              const Divider(),
              ListTile(
                key: const Key('drawer-new-session'),
                leading: const Icon(Icons.add),
                title: const Text('新建会话'),
                enabled: sessions.ready && !sessions.creating,
                onTap: () async {
                  final navigator = Navigator.of(context);
                  final created = await sessions.create();
                  if (created != null) {
                    navigator.pop();
                    await chat.attach(created.id);
                  }
                },
              ),
              for (final s in sessions.sessions.take(10))
                ListTile(
                  key: Key('drawer-session-${s.id}'),
                  selected: s.id == chat.sessionId,
                  title: Text(
                    s.title.isEmpty ? '新会话' : s.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onTap: () {
                    Navigator.of(context).pop();
                    chat.attach(s.id);
                  },
                ),
              ListTile(
                leading: const Icon(Icons.list),
                title: const Text('全部会话'),
                onTap: () {
                  Navigator.of(context).pop();
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const SessionListPage(),
                    ),
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.qr_code_scanner),
                title: const Text('扫码配对新电脑'),
                onTap: () {
                  Navigator.of(context).pop();
                  manager.stopToScan();
                  context.go('/scan');
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
