import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:neko_mobile/ui/theme.dart';

/// 助手正文 Markdown：不渲染 HTML（原样显示为文本），代码块与表格独立横向滚动。
class NekoMarkdown extends StatelessWidget {
  const NekoMarkdown(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final tokens = NekoTokens.of(context);
    final theme = Theme.of(context);
    final base = MarkdownStyleSheet.fromTheme(theme);
    return MarkdownBody(
      data: escapeHtml(text),
      selectable: true,
      softLineBreak: true,
      styleSheet: base.copyWith(
        p: theme.textTheme.bodyMedium?.copyWith(color: tokens.text),
        code: theme.textTheme.bodySmall?.copyWith(
          fontFamily: NekoTokens.monoFamily,
          backgroundColor: tokens.codeBackground,
          color: tokens.text,
        ),
        codeblockDecoration: BoxDecoration(
          color: tokens.codeBackground,
          borderRadius: BorderRadius.circular(NekoTokens.radiusControl),
        ),
        codeblockPadding: const EdgeInsets.all(12),
        blockquoteDecoration: BoxDecoration(
          border: Border(left: BorderSide(color: tokens.border, width: 3)),
        ),
        tableBorder: TableBorder.all(color: tokens.border),
        tableScrollbarThumbVisibility: false,
      ),
      onTapLink: (text, href, title) {},
      // 远程图片不自动加载：避免提示注入借手机发起请求（泄露数据/探测局域网）。
      imageBuilder: (uri, title, alt) => Text('[图片 ${alt ?? uri.toString()}]'),
    );
  }
}

final RegExp _fence = RegExp(r'^\s*(```|~~~)');
final RegExp _inlineCode = RegExp(r'`[^`]*`');

/// 在代码区之外把 `<` 转义为 Markdown 反斜杠转义，使 HTML 标签按原文显示。
String escapeHtml(String source) {
  final out = StringBuffer();
  var inFence = false;
  final lines = source.split('\n');
  for (var i = 0; i < lines.length; i++) {
    final line = lines[i];
    if (_fence.hasMatch(line)) {
      inFence = !inFence;
      out.write(line);
    } else if (inFence || line.startsWith('    ') || line.startsWith('\t')) {
      out.write(line);
    } else {
      var last = 0;
      for (final match in _inlineCode.allMatches(line)) {
        out
          ..write(line.substring(last, match.start).replaceAll('<', r'\<'))
          ..write(match.group(0));
        last = match.end;
      }
      out.write(line.substring(last).replaceAll('<', r'\<'));
    }
    if (i < lines.length - 1) out.write('\n');
  }
  return out.toString();
}
