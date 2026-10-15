import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:neko_mobile/core/api/models.dart';
import 'package:neko_mobile/core/rpc/connection_manager.dart';
import 'package:neko_mobile/features/app_controller.dart';
import 'package:neko_mobile/features/approvals/approval_sheet.dart';
import 'package:neko_mobile/features/chat/chat_page.dart';
import 'package:neko_mobile/features/subagents/subagent_controller.dart';
import 'package:neko_mobile/ui/theme.dart';
import 'package:neko_mobile/ui/widgets/transcript_view.dart';

String formatTokens(int tokens) =>
    tokens >= 1000 ? '${(tokens / 1000).toStringAsFixed(1)}k' : '$tokens';

/// 子 agent 全屏详情：连续历史、轮次与用量、停止当前轮、审批；返回不影响主会话草稿与滚动。
class SubagentPage extends ConsumerStatefulWidget {
  const SubagentPage({super.key, required this.agentId, required this.title});

  final String agentId;
  final String title;

  @override
  ConsumerState<SubagentPage> createState() => _SubagentPageState();
}

class _SubagentPageState extends ConsumerState<SubagentPage> {
  late final SubagentController _controller = SubagentController(
    chat: ref.read(chatControllerProvider),
    agentId: widget.agentId,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _stop(SubagentRound round) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('停止这一轮？'),
        content: Text('只停止「${round.title}」的当前轮次，主会话与其他子 agent 继续运行。'),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('取消'),
          ),
          FilledButton(
            key: const Key('subagent-stop-confirm'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('停止'),
          ),
        ],
      ),
    );
    if (confirmed == true) await _controller.stop(round);
  }

  @override
  Widget build(BuildContext context) {
    final chat = ref.watch(chatControllerProvider);
    final tokens = NekoTokens.of(context);
    return ListenableBuilder(
      listenable: Listenable.merge(<Listenable>[
        _controller,
        _controller.transcript,
      ]),
      builder: (context, _) {
        final status = _controller.transcript.status;
        final active = _controller.activeRound;
        final rounds = _controller.rounds;
        return Scaffold(
          appBar: AppBar(
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  widget.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  status.readonly
                      ? '分叉历史（只读）'
                      : status.busy
                      ? (status.status ?? '运行中…')
                      : '空闲',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
            actions: <Widget>[
              if (active != null && !status.readonly)
                IconButton(
                  key: const Key('subagent-stop'),
                  tooltip: '停止当前轮',
                  onPressed: _controller.canControl
                      ? () => _stop(active)
                      : null,
                  icon: Icon(Icons.stop_circle_outlined, color: tokens.danger),
                ),
            ],
          ),
          body: SafeArea(
            top: false,
            child: Column(
              children: <Widget>[
                ConnectionBanner(manager: ref.watch(connectionManagerProvider)),
                if (_controller.error != null)
                  ErrorBanner(
                    text: _controller.error!,
                    onClose: _controller.clearError,
                  ),
                if (rounds.isNotEmpty)
                  SizedBox(
                    height: 56,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                      children: <Widget>[
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: Chip(
                            label: Text(
                              '累计 ${formatTokens(status.usage.totalTokens)} tokens',
                            ),
                          ),
                        ),
                        for (final round in rounds)
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: Chip(
                              key: Key('round-${round.taskId}'),
                              avatar: round.active
                                  ? const SizedBox.square(
                                      dimension: 14,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : null,
                              label: Text(
                                '第 ${round.round ?? round.taskId} 轮 · ${round.status}'
                                '${round.usage == null ? '' : ' · ${formatTokens(round.usage!.totalTokens)}'}',
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                Expanded(
                  child: _controller.transcript.loaded
                      ? TranscriptView(
                          actions: _controller,
                          emptyText: '子 agent 还没有输出',
                        )
                      : Center(
                          child:
                              _controller.opening || chat.subscriptionId == null
                              ? const CircularProgressIndicator()
                              : TextButton(
                                  onPressed: _controller.open,
                                  child: const Text('重新加载'),
                                ),
                        ),
                ),
                ApprovalBar(
                  approvals: _controller.approvals,
                  onDecide: chat.decide,
                  enabled: chat.canControl,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
