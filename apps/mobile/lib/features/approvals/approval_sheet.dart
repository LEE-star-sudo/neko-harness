import 'package:flutter/material.dart';
import 'package:neko_mobile/core/api/models.dart';
import 'package:neko_mobile/ui/theme.dart';

typedef ApprovalDecider = Future<String?> Function(
  Approval approval, {
  required bool allow,
});

/// 输入区上方的待决审批条：数量 + 打开底部面板；新请求到达不抢焦点、不清草稿。
class ApprovalBar extends StatelessWidget {
  const ApprovalBar({
    super.key,
    required this.approvals,
    required this.onDecide,
    required this.enabled,
  });

  final List<Approval> approvals;
  final ApprovalDecider onDecide;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    if (approvals.isEmpty) return const SizedBox.shrink();
    final tokens = NekoTokens.of(context);
    return Material(
      color: tokens.warning.withValues(alpha: 0.12),
      child: InkWell(
        key: const Key('approval-bar'),
        onTap: () => showApprovalSheet(
          context,
          approvals: approvals,
          onDecide: onDecide,
          enabled: enabled,
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: <Widget>[
                Icon(Icons.gpp_maybe_outlined, color: tokens.warning),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${approvals.length} 个命令等待审批',
                    style: TextStyle(color: tokens.text),
                  ),
                ),
                const Icon(Icons.expand_less),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> showApprovalSheet(
  BuildContext context, {
  required List<Approval> approvals,
  required ApprovalDecider onDecide,
  required bool enabled,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (context) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      minChildSize: 0.3,
      maxChildSize: 0.95,
      builder: (context, scroll) => _ApprovalList(
        approvals: approvals,
        onDecide: onDecide,
        enabled: enabled,
        scroll: scroll,
      ),
    ),
  );
}

class _ApprovalList extends StatefulWidget {
  const _ApprovalList({
    required this.approvals,
    required this.onDecide,
    required this.enabled,
    required this.scroll,
  });

  final List<Approval> approvals;
  final ApprovalDecider onDecide;
  final bool enabled;
  final ScrollController scroll;

  @override
  State<_ApprovalList> createState() => _ApprovalListState();
}

class _ApprovalListState extends State<_ApprovalList> {
  late final List<Approval> _items = List<Approval>.of(widget.approvals);
  final Map<int, String> _results = <int, String>{};
  final Set<int> _busy = <int>{};

  Future<void> _decide(Approval approval, bool allow) async {
    setState(() => _busy.add(approval.id));
    final status = await widget.onDecide(approval, allow: allow);
    if (!mounted) return;
    setState(() {
      _busy.remove(approval.id);
      if (status != null) _results[approval.id] = status;
    });
  }

  @override
  Widget build(BuildContext context) {
    final tokens = NekoTokens.of(context);
    return ListView.separated(
      controller: widget.scroll,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      itemCount: _items.length,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final approval = _items[index];
        final result = _results[approval.id];
        return Card(
          key: Key('approval-${approval.id}'),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  approval.title ?? '子 agent #${approval.taskId}',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  constraints: const BoxConstraints(maxHeight: 240),
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: tokens.codeBackground,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: SingleChildScrollView(
                    child: SelectableText(
                      approval.command,
                      style: const TextStyle(
                        fontFamily: NekoTokens.monoFamily,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '目录：${approval.cwd}',
                  style: TextStyle(color: tokens.textMuted, fontSize: 12),
                ),
                if (approval.timeoutSeconds != null)
                  Text(
                    '超时：${approval.timeoutSeconds!.round()} 秒',
                    style: TextStyle(color: tokens.textMuted, fontSize: 12),
                  ),
                const SizedBox(height: 8),
                if (result != null)
                  Text(
                    switch (result) {
                      'allowed' => '已允许',
                      'denied' => '已拒绝',
                      'cancelled' => '任务已停止，命令未执行',
                      _ => '仍在等待（可能已被其他端处理，请刷新）',
                    },
                    key: Key('approval-result-${approval.id}'),
                    style: TextStyle(color: tokens.textMuted),
                  )
                else
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: <Widget>[
                      OutlinedButton(
                        key: Key('approval-deny-${approval.id}'),
                        onPressed:
                            !widget.enabled || _busy.contains(approval.id)
                            ? null
                            : () => _decide(approval, false),
                        child: const Text('拒绝'),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        key: Key('approval-allow-${approval.id}'),
                        onPressed:
                            !widget.enabled || _busy.contains(approval.id)
                            ? null
                            : () => _decide(approval, true),
                        child: const Text('允许本次'),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}
