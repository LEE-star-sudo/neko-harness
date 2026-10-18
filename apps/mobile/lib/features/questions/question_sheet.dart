import 'package:flutter/material.dart';
import 'package:neko_mobile/core/api/models.dart';
import 'package:neko_mobile/features/chat/interactions_controller.dart';
import 'package:neko_mobile/features/questions/question_draft.dart';
import 'package:neko_mobile/ui/neko_icons.dart';
import 'package:neko_mobile/ui/theme.dart';

String questionStatusLabel(QuestionStatus status) => switch (status) {
  QuestionStatus.pending => '等待回答',
  QuestionStatus.answered => '已回答',
  QuestionStatus.skipped => '已跳过',
  QuestionStatus.cancelled => '已取消',
};

/// 输入区上方的“等待回答 · N”条：独立于 Bash 审批（图标、颜色与文案都不同），
/// 打开问题 sheet；新问题出现不抢焦点、不清草稿。
class QuestionBar extends StatelessWidget {
  const QuestionBar({super.key, required this.interactions});

  final InteractionsController interactions;

  @override
  Widget build(BuildContext context) {
    final pending = interactions.pending;
    if (!interactions.questionsSupported || pending.isEmpty) {
      return const SizedBox.shrink();
    }
    final tokens = NekoTokens.of(context);
    return Material(
      color: tokens.primary.withValues(alpha: 0.1),
      child: Semantics(
        button: true,
        label: '等待回答 ${pending.length} 个问题',
        excludeSemantics: true,
        child: InkWell(
          key: const Key('question-bar'),
          onTap: () => showQuestionSheet(
            context,
            interactions,
            initialId: pending.first.id,
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: NekoSpace.md),
              child: Row(
                children: <Widget>[
                  NekoIcon(NekoIcons.help, color: tokens.primary),
                  const SizedBox(width: NekoSpace.sm),
                  Text(
                    '等待回答 · ${pending.length}',
                    key: const Key('question-bar-count'),
                    style: TextStyle(
                      color: tokens.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(width: NekoSpace.sm),
                  Expanded(
                    child: Text(
                      pending.first.preview,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.small(tokens.textMuted),
                    ),
                  ),
                  const NekoIcon(NekoIcons.chevronUp),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// 问题 sheet：关闭/下拉只是关闭（草稿保留在内存，问题仍未决），回答与跳过各有独立按钮。
Future<void> showQuestionSheet(
  BuildContext context,
  InteractionsController interactions, {
  required int initialId,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (context) =>
        QuestionSheet(interactions: interactions, initialId: initialId),
  );
}

class QuestionSheet extends StatefulWidget {
  const QuestionSheet({
    super.key,
    required this.interactions,
    required this.initialId,
  });

  final InteractionsController interactions;
  final int initialId;

  @override
  State<QuestionSheet> createState() => _QuestionSheetState();
}

class _QuestionSheetState extends State<QuestionSheet> {
  late int _id = widget.initialId;
  final Set<String> _shown = <String>{};

  InteractionsController get _interactions => widget.interactions;

  @override
  void initState() {
    super.initState();
    // 读取会通知监听者；不能在构建阶段同步触发（祖先的 ListenableBuilder 会报错）。
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _interactions.loadQuestion(_id);
    });
  }

  @override
  void dispose() {
    // 展示过的问题版本：用户关闭后不再自动展开。
    for (final key in _shown) {
      _interactions.markClosed(key);
    }
    super.dispose();
  }

  void _open(int id) {
    setState(() => _id = id);
    _interactions.loadQuestion(id);
  }

  @override
  Widget build(BuildContext context) {
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: keyboard),
      child: SafeArea(
        top: false,
        child: ListenableBuilder(
          listenable: _interactions,
          builder: (context, _) {
            final record = _interactions.record(_id);
            if (record != null) {
              _shown.add(_interactions.keyFor(record.id, record.version));
            }
            final ids = _interactions.pending.map((s) => s.id).toList();
            final index = ids.indexOf(_id);
            return Column(
              key: const Key('question-sheet'),
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                _Header(
                  index: index,
                  total: ids.length,
                  onPrevious: index > 0 ? () => _open(ids[index - 1]) : null,
                  onNext: index >= 0 && index < ids.length - 1
                      ? () => _open(ids[index + 1])
                      : null,
                ),
                Flexible(
                  child: record == null
                      ? _Loading(
                          error: _interactions.loadError(_id),
                          loading: _interactions.isLoading(_id),
                          onRetry: () =>
                              _interactions.loadQuestion(_id, force: true),
                        )
                      : record.pending
                      ? _QuestionEditor(
                          key: ValueKey<String>(
                            _interactions.keyFor(record.id, record.version),
                          ),
                          interactions: _interactions,
                          record: record,
                        )
                      : _QuestionFinal(
                          record: record,
                          note: _interactions.settlementNote(record),
                          nextId: ids.isEmpty ? null : ids.first,
                          onNext: _open,
                        ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.index,
    required this.total,
    this.onPrevious,
    this.onNext,
  });

  final int index;
  final int total;
  final VoidCallback? onPrevious;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    final tokens = NekoTokens.of(context);
    return Padding(
      padding: const EdgeInsets.only(left: NekoSpace.md),
      child: Row(
        children: <Widget>[
          NekoIcon(NekoIcons.help, color: tokens.primary),
          const SizedBox(width: NekoSpace.sm),
          Flexible(
            child: Semantics(
              header: true,
              child: Text(
                '助手提问',
                key: const Key('question-label'),
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
          ),
          if (total > 1 && index >= 0) ...<Widget>[
            const SizedBox(width: NekoSpace.sm),
            Text(
              '${index + 1}/$total',
              key: const Key('question-position'),
              style: context.small(tokens.textMuted),
            ),
            TextButton(
              key: const Key('question-previous'),
              onPressed: onPrevious,
              child: const Text('上一题'),
            ),
            TextButton(
              key: const Key('question-next'),
              onPressed: onNext,
              child: const Text('下一题'),
            ),
          ],
          const Spacer(),
          IconButton(
            key: const Key('question-close'),
            tooltip: '关闭（问题仍在等待回答）',
            constraints: const BoxConstraints(
              minWidth: NekoSpace.touch,
              minHeight: NekoSpace.touch,
            ),
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const NekoIcon(NekoIcons.close),
          ),
        ],
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading({
    required this.error,
    required this.loading,
    required this.onRetry,
  });

  final String? error;
  final bool loading;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final tokens = NekoTokens.of(context);
    return Padding(
      padding: const EdgeInsets.all(NekoSpace.xl),
      child: error == null || loading
          ? const Center(
              key: Key('question-loading'),
              child: CircularProgressIndicator(),
            )
          : Column(
              key: const Key('question-load-error'),
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(error!, style: TextStyle(color: tokens.danger)),
                const SizedBox(height: NekoSpace.sm),
                TextButton(
                  key: const Key('question-load-retry'),
                  onPressed: onRetry,
                  child: const Text('重试'),
                ),
              ],
            ),
    );
  }
}

/// 未决问题的编辑区：正文（纯文本）、选项、始终可见的文字输入，以及固定在底部的提交/跳过。
/// 草稿由 [InteractionsController] 按 server/session/question/version 保存。
class _QuestionEditor extends StatefulWidget {
  const _QuestionEditor({
    super.key,
    required this.interactions,
    required this.record,
  });

  final InteractionsController interactions;
  final QuestionRecord record;

  @override
  State<_QuestionEditor> createState() => _QuestionEditorState();
}

class _QuestionEditorState extends State<_QuestionEditor> {
  late QuestionDraft _draft = widget.interactions.draftFor(widget.record);
  late final TextEditingController _text = TextEditingController(
    text: _draft.text,
  );

  QuestionRecord get _record => widget.record;

  @override
  void initState() {
    super.initState();
    _text.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _onTextChanged() {
    if (_text.text == _draft.text) return;
    setState(() => _draft = _draft.withText(_text.text));
    widget.interactions.saveDraft(_record, _draft);
  }

  void _toggle(QuestionOption option) {
    setState(() => _draft = _draft.toggle(_record, option.id));
    widget.interactions.saveDraft(_record, _draft);
  }

  @override
  Widget build(BuildContext context) {
    final interactions = widget.interactions;
    final tokens = NekoTokens.of(context);
    final connected = interactions.connected;
    final submitting = interactions.isSubmitting(_record);
    final error = interactions.submitError(_record);
    final response = draftResponse(_record, _draft);
    final problem = draftProblem(_record, _draft);
    final hasOptions = _record.options.isNotEmpty;
    final overLimit = _draft.text.length > QuestionLimits.textChars;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Flexible(
          child: SingleChildScrollView(
            key: const Key('question-scroll'),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.symmetric(horizontal: NekoSpace.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                if (!connected)
                  _Notice(
                    key: const Key('question-offline'),
                    text: '当前离线：暂时无法提交，恢复连接后会重新读取问题状态，不会自动发送答案。',
                    color: tokens.warning,
                  ),
                // 问题正文一律按纯文本显示：不解析 Markdown/HTML，不生成链接。
                Text(
                  _record.question,
                  key: const Key('question-text'),
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                const SizedBox(height: NekoSpace.sm),
                if (hasOptions)
                  Semantics(
                    container: true,
                    label: _record.multiple ? '多选，可选择多个选项' : '单选，只能选择一个选项',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: <Widget>[
                        Padding(
                          padding: const EdgeInsets.only(bottom: NekoSpace.xs),
                          child: Text(
                            _record.multiple ? '可多选' : '单选',
                            key: const Key('question-mode'),
                            style: context.meta(tokens.textFaint),
                          ),
                        ),
                        for (final option in _record.options)
                          _OptionTile(
                            option: option,
                            multiple: _record.multiple,
                            selected: _draft.optionIds.contains(option.id),
                            enabled: !submitting,
                            onTap: () => _toggle(option),
                          ),
                      ],
                    ),
                  ),
                const SizedBox(height: NekoSpace.sm),
                TextField(
                  key: const Key('question-input'),
                  controller: _text,
                  enabled: !submitting,
                  minLines: hasOptions ? 1 : 3,
                  maxLines: 6,
                  keyboardType: TextInputType.multiline,
                  textInputAction: TextInputAction.newline,
                  decoration: InputDecoration(
                    labelText: hasOptions ? '补充说明（可选）' : '你的回答',
                    alignLabelWithHint: true,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: NekoSpace.xs),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Expanded(
                        child: response != null && problem != null
                            ? Text(
                                problem,
                                key: const Key('question-problem'),
                                style: context.small(tokens.danger),
                              )
                            : const SizedBox.shrink(),
                      ),
                      Text(
                        '${_draft.text.length}/${QuestionLimits.textChars}',
                        key: const Key('question-counter'),
                        style: context.meta(
                          overLimit ? tokens.danger : tokens.textFaint,
                        ),
                      ),
                    ],
                  ),
                ),
                if (error != null)
                  _Notice(
                    key: const Key('question-error'),
                    text: error,
                    color: tokens.danger,
                  ),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            NekoSpace.md,
            NekoSpace.xs,
            NekoSpace.md,
            NekoSpace.sm,
          ),
          child: SizedBox(
            width: double.infinity,
            child: Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: NekoSpace.sm,
              runSpacing: NekoSpace.xs,
              children: <Widget>[
                TextButton(
                  key: const Key('question-skip'),
                  onPressed: connected && !submitting
                      ? () =>
                            interactions.respond(_record, const SkipResponse())
                      : null,
                  child: const Text('跳过'),
                ),
                FilledButton(
                  key: const Key('question-submit'),
                  onPressed: connected && !submitting && problem == null
                      ? () => interactions.respond(_record, response!)
                      : null,
                  child: submitting
                      ? const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: <Widget>[
                            SizedBox.square(
                              dimension: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                            SizedBox(width: NekoSpace.sm),
                            Text('提交中…'),
                          ],
                        )
                      : const Text('提交回答'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _OptionTile extends StatelessWidget {
  const _OptionTile({
    required this.option,
    required this.multiple,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final QuestionOption option;
  final bool multiple;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = NekoTokens.of(context);
    final icon = multiple
        ? (selected ? NekoIcons.checkboxOn : NekoIcons.checkboxOff)
        : (selected ? NekoIcons.radioOn : NekoIcons.radioOff);
    final description = option.description;
    final label = <String>[
      option.label,
      if (option.recommended) '推荐',
      if (description != null && description.isNotEmpty) description,
    ].join('，');
    return Semantics(
      container: true,
      excludeSemantics: true,
      label: label,
      checked: selected,
      inMutuallyExclusiveGroup: multiple ? null : true,
      enabled: enabled,
      onTap: enabled ? onTap : null,
      child: InkWell(
        key: Key('question-option-${option.id}'),
        borderRadius: BorderRadius.circular(NekoTokens.radiusControl),
        onTap: enabled ? onTap : null,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: NekoSpace.touch),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: NekoSpace.sm),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Padding(
                  padding: const EdgeInsets.only(top: 1),
                  child: NekoIcon(
                    icon,
                    size: 20,
                    color: selected ? tokens.primary : tokens.textMuted,
                  ),
                ),
                const SizedBox(width: NekoSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text.rich(
                        TextSpan(
                          children: <InlineSpan>[
                            TextSpan(
                              text: option.label,
                              style: TextStyle(
                                color: tokens.text,
                                fontWeight: selected
                                    ? FontWeight.w600
                                    : FontWeight.w400,
                              ),
                            ),
                            if (option.recommended)
                              WidgetSpan(
                                alignment: PlaceholderAlignment.middle,
                                child: Padding(
                                  padding: const EdgeInsets.only(
                                    left: NekoSpace.sm,
                                  ),
                                  child: _RecommendedBadge(
                                    key: Key(
                                      'question-recommended-${option.id}',
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      if (description != null && description.isNotEmpty)
                        Text(
                          description,
                          style: context.small(tokens.textMuted),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RecommendedBadge extends StatelessWidget {
  const _RecommendedBadge({super.key});

  @override
  Widget build(BuildContext context) {
    final tokens = NekoTokens.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        border: Border.all(color: tokens.primary, width: 0.8),
        borderRadius: BorderRadius.circular(NekoTokens.radiusControl),
      ),
      child: Text('推荐', style: context.meta(tokens.primary)),
    );
  }
}

/// 已结算问题：显示真实终态与获胜答案（本端、其他端或停止），不再有回答控件。
class _QuestionFinal extends StatelessWidget {
  const _QuestionFinal({
    required this.record,
    required this.note,
    required this.nextId,
    required this.onNext,
  });

  final QuestionRecord record;
  final String? note;
  final int? nextId;
  final void Function(int id) onNext;

  @override
  Widget build(BuildContext context) {
    final tokens = NekoTokens.of(context);
    final labels = record.answerLabels;
    final text = record.answer?.text;
    final (Color color, String detail) = switch (record.status) {
      QuestionStatus.answered => (tokens.success, ''),
      QuestionStatus.skipped => (tokens.textMuted, '已跳过，未提供答案。'),
      QuestionStatus.cancelled => (tokens.danger, '运行已停止或会话已归档，问题不再需要回答。'),
      QuestionStatus.pending => (tokens.textMuted, ''),
    };
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Flexible(
          child: SingleChildScrollView(
            key: const Key('question-scroll'),
            padding: const EdgeInsets.symmetric(horizontal: NekoSpace.md),
            child: Column(
              key: const Key('question-final'),
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                if (note != null)
                  _Notice(
                    key: const Key('question-note'),
                    text: note!,
                    color: tokens.warning,
                  ),
                Text(
                  record.question,
                  key: const Key('question-text'),
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                const SizedBox(height: NekoSpace.md),
                Text(
                  questionStatusLabel(record.status),
                  key: const Key('question-final-status'),
                  style: Theme.of(context).textTheme.titleSmall
                      ?.copyWith(color: color),
                ),
                if (detail.isNotEmpty)
                  Text(
                    detail,
                    key: const Key('question-final-detail'),
                    style: context.small(tokens.textMuted),
                  ),
                if (labels.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: NekoSpace.xs),
                    child: Text(
                      '选择：${labels.join('、')}',
                      key: const Key('question-final-options'),
                    ),
                  ),
                if (text != null && text.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: NekoSpace.xs),
                    child: Text(
                      '文字：$text',
                      key: const Key('question-final-text'),
                    ),
                  ),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            NekoSpace.md,
            NekoSpace.sm,
            NekoSpace.md,
            NekoSpace.sm,
          ),
          child: SizedBox(
            width: double.infinity,
            child: Wrap(
              alignment: WrapAlignment.end,
              spacing: NekoSpace.sm,
              runSpacing: NekoSpace.xs,
              children: <Widget>[
                if (nextId != null)
                  TextButton(
                    key: const Key('question-next-pending'),
                    onPressed: () => onNext(nextId!),
                    child: const Text('下一题'),
                  ),
                FilledButton(
                  key: const Key('question-done'),
                  onPressed: () => Navigator.of(context).maybePop(),
                  child: const Text('关闭'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({super.key, required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: NekoSpace.sm),
      padding: const EdgeInsets.all(NekoSpace.sm),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(NekoTokens.radiusControl),
      ),
      child: Text(text, style: context.small(color)),
    );
  }
}
