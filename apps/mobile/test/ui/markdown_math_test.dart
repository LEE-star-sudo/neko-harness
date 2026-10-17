import 'package:flutter/material.dart';
import 'package:flutter_math_fork/flutter_math.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/ui/widgets/markdown_view.dart';

Future<void> _pump(
  WidgetTester tester,
  String text, {
  double width = 360,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Align(
          alignment: Alignment.topLeft,
          child: SizedBox(width: width, child: NekoMarkdown(text)),
        ),
      ),
    ),
  );
  await tester.pump();
}

int _mathCount(WidgetTester tester) => find.byType(Math).evaluate().length;

/// 可见文字：普通文字、富文本与可选文字（公式的 WidgetSpan 占位不计入）。
String _visibleText(WidgetTester tester) {
  final out = StringBuffer();
  for (final widget in tester.allWidgets) {
    if (widget is RichText) {
      out.writeln(widget.text.toPlainText(includePlaceholders: false));
    }
    if (widget is EditableText) {
      out.writeln(
        widget.controller
            .buildTextSpan(
              context: tester.element(find.byWidget(widget)),
              style: widget.style,
              withComposing: false,
            )
            .toPlainText(includePlaceholders: false),
      );
    }
  }
  return out.toString();
}

void main() {
  testWidgets('行内与块级公式都渲染，不残留定界符', (tester) async {
    await _pump(
      tester,
      '相似度 \$s_i = q\\cdot k_i\$ 如下：\n\n\$\$\\frac{qK^{\\top}}{\\sqrt{d_k}}\$\$\n',
    );
    expect(tester.takeException(), isNull);
    expect(_mathCount(tester), 2);
    expect(_visibleText(tester), isNot(contains('\$')));
    expect(find.byType(SingleChildScrollView), findsOneWidget);
  });

  testWidgets('括号定界符与 \$ 效果一致', (tester) async {
    await _pump(tester, '速度 \\(v = \\frac{s}{t}\\)\n\n\\[\\sum_{i=1}^{n} i\\]');
    expect(_mathCount(tester), 2);
    final text = _visibleText(tester);
    expect(text, isNot(contains('\\(')));
    expect(text, isNot(contains('\\[')));
    expect(text, contains('速度'));
  });

  testWidgets('含空行的块级公式整体渲染', (tester) async {
    await _pump(tester, '\\[\n\\sum_{i=1}^{n} i\n\n+ 1\n\\]\n\n后续段落');
    expect(_mathCount(tester), 1);
    expect(_visibleText(tester), contains('后续段落'));
  });

  testWidgets('小于号与转义大括号保持原义', (tester) async {
    await _pump(tester, '比较 \$a < b\$ 与集合 \$\\{a,b\\}\$ 以及 <b>标签</b>');
    expect(tester.takeException(), isNull);
    expect(_mathCount(tester), 2);
    final text = _visibleText(tester);
    expect(text, isNot(contains('\\<')));
    expect(text, contains('<b>标签</b>'));
  });

  testWidgets('代码、货币与转义美元保持原文', (tester) async {
    await _pump(
      tester,
      '价格 \$5 and \$10，转义 \\\$a\\\$，行内 `\$x\$`\n\n```sh\necho \$HOME \\(x\\)\n```',
    );
    expect(_mathCount(tester), 0);
    final text = _visibleText(tester);
    expect(text, contains('\$5 and \$10'));
    expect(text, contains('\$x\$'));
    expect(text, contains('echo \$HOME \\(x\\)'));
  });

  testWidgets('非法公式显示原文，其余内容正常', (tester) async {
    await _pump(tester, '坏公式 \$\\frac{a\$ 之后 \$x^2\$');
    expect(tester.takeException(), isNull);
    expect(_mathCount(tester), 2);
    final text = _visibleText(tester);
    expect(text, contains('\$\\frac{a\$'));
    expect(text, contains('之后'));
  });

  testWidgets('未闭合公式保持原文且不吞掉后续段落', (tester) async {
    await _pump(tester, '流式 \\(\\frac{a\n\n\$\$\\sum_{i=1}\n\n\\[x\n\n最后一段');
    expect(tester.takeException(), isNull);
    expect(_mathCount(tester), 0);
    final text = _visibleText(tester);
    expect(text, contains('\\(\\frac{a'));
    expect(text, contains('\$\$\\sum_{i=1}'));
    expect(text, contains('最后一段'));
  });

  testWidgets('超宽块级公式在窄屏下独立横向滚动，不溢出', (tester) async {
    final wide = List<String>.generate(40, (i) => 'x_$i').join(' + ');
    await _pump(tester, '\$\$$wide\$\$', width: 240);
    expect(tester.takeException(), isNull);
    expect(_mathCount(tester), 1);
    final scroll = tester.widget<SingleChildScrollView>(
      find.byType(SingleChildScrollView),
    );
    expect(scroll.scrollDirection, Axis.horizontal);
    final mathWidth = tester.getSize(find.byType(Math)).width;
    expect(mathWidth, greaterThan(240));
    expect(
      tester.getSize(find.byType(SingleChildScrollView)).width,
      lessThanOrEqualTo(240),
    );
  });

  testWidgets('同一公式重复出现与重建时都正常渲染', (tester) async {
    await _pump(tester, '\$x^2\$ 与 \$x^2\$ 再来 \\(x^2\\)\n\n\$\$x^2\$\$');
    expect(tester.takeException(), isNull);
    expect(_mathCount(tester), 4);
    await _pump(tester, '\$x^2\$ 与 \$x^2\$ 再来 \\(x^2\\)\n\n\$\$x^2\$\$ 追加');
    expect(tester.takeException(), isNull);
    expect(_mathCount(tester), 4);
  });
}
