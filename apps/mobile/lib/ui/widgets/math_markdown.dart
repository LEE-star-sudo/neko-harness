import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:flutter_math_fork/flutter_math.dart';
import 'package:markdown/markdown.dart' as md;

/// 公式 Markdown 扩展：`$..$`、`$$..$$`、`\(..\)`、`\[..\]`。规则与 Web 的 `math.ts` 对齐。
/// 行内公式不折行；块级公式独占段落、居中并可横向滚动。

const String mathInlineTag = 'neko-math';
const String mathBlockTag = 'neko-math-block';

// 行内：`\(..\)`，或 `$..$`/`$$..$$`（起始后非空白、结尾前非空白、结尾后非数字，避免把 "$5 and $10" 当公式；
// `\$` 为字面量；内容不含反引号，避免货币符号与后面的行内代码配成公式）。
final RegExp _inlinePattern = RegExp(
  r'\\\(([\s\S]+?)\\\)|(\$\$?)(?![\s$])((?:\\[\s\S]|[^$\\`])+?)(?<!\s)\2(?!\d)',
);

class MathInlineSyntax extends md.InlineSyntax {
  MathInlineSyntax() : super(_inlinePattern.pattern);

  @override
  bool onMatch(md.InlineParser parser, Match match) {
    final paren = match[1] != null;
    final tex = (paren ? match[1]! : match[3]!).trim();
    if (tex.isEmpty) return false;
    parser.addNode(
      md.Element.text(mathInlineTag, tex)
        ..attributes['display'] = (!paren && match[2] == r'$$').toString()
        ..attributes['source'] = match[0]!,
    );
    return true;
  }
}

/// 未闭合或不成对的 `\(`、`\[`、`\)`、`\]` 保持原文（默认转义规则会吞掉反斜杠）；须排在 [MathInlineSyntax] 之后。
class MathLiteralSyntax extends md.InlineSyntax {
  MathLiteralSyntax() : super(r'\\[()\[\]]');

  @override
  bool onMatch(md.InlineParser parser, Match match) {
    parser.addNode(md.Text(match[0]!));
    return true;
  }
}

/// 行首（至多 3 空格缩进）的 `$$` 或 `\[` 起始，必须找到行尾的结束定界符才成块（允许内部空行）；
/// 找不到时不识别为块，避免流式中未闭合的定界符吞掉后续全部内容。
class MathBlockSyntax extends md.BlockSyntax {
  const MathBlockSyntax();

  static final RegExp _open = RegExp(r'^ {0,3}(\$\$|\\\[)');

  @override
  RegExp get pattern => _open;

  @override
  bool canParse(md.BlockParser parser) => _scan(parser) != null;

  @override
  md.Node? parse(md.BlockParser parser) {
    final scanned = _scan(parser);
    if (scanned == null) return null;
    for (var i = 0; i < scanned.source.length; i++) {
      parser.advance();
    }
    return md.Element.text(mathBlockTag, scanned.tex)
      ..attributes['source'] = scanned.source.join('\n');
  }

  ({String tex, List<String> source})? _scan(md.BlockParser parser) {
    final match = _open.firstMatch(parser.current.content);
    if (match == null) return null;
    final close = match[1] == r'$$' ? r'$$' : r'\]';
    final buffer = StringBuffer();
    final source = <String>[];
    for (var index = 0; ; index++) {
      final raw = index == 0
          ? parser.current.content
          : parser.peek(index)?.content;
      if (raw == null) return null;
      source.add(raw);
      final line = index == 0 ? raw.substring(match.end) : raw;
      final trimmed = line.trimRight();
      if (trimmed.endsWith(close)) {
        buffer.write(trimmed.substring(0, trimmed.length - close.length));
        final tex = buffer.toString().trim();
        return tex.isEmpty ? null : (tex: tex, source: source);
      }
      buffer
        ..write(line)
        ..write('\n');
    }
  }
}

/// 把 `escapeHtml` 为显示 HTML 原文而加的 `\<` 还原；公式内 `a < b` 因此保持原义。
String _unescapeLt(String text) => text.replaceAll(r'\<', '<');

class MathBuilder extends MarkdownElementBuilder {
  @override
  Widget? visitElementAfterWithContext(
    BuildContext context,
    md.Element element,
    TextStyle? preferredStyle,
    TextStyle? parentStyle,
  ) {
    final block = element.tag == mathBlockTag;
    final style = parentStyle ?? preferredStyle;
    final tex = _unescapeLt(element.textContent);
    final source = _unescapeLt(element.attributes['source'] ?? tex);
    final display = block || element.attributes['display'] == 'true';
    final math = Math.tex(
      tex,
      mathStyle: display ? MathStyle.display : MathStyle.text,
      textStyle: style,
      onErrorFallback: (_) => Text(source, style: style),
    );
    if (!block) return math;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: ConstrainedBox(
            constraints: BoxConstraints(minWidth: constraints.maxWidth),
            child: Center(child: math),
          ),
        ),
      ),
    );
  }
}
