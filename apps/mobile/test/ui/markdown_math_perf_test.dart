import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/ui/widgets/markdown_view.dart';

String _answer(int formulas, {required bool math}) {
  final out = StringBuffer('## 推导\n\n');
  for (var i = 0; i < formulas; i++) {
    out.write(
      math
          ? '第 $i 步：令 \$s_$i = q\\cdot k_$i\$，则 \$\$\\frac{a_$i + b_$i}{\\sqrt{d_k}}\$\$ 成立。\n\n'
          : '第 $i 步：令 s_$i = q·k_$i，则 (a_$i + b_$i)/sqrt(d_k) 成立。\n\n',
    );
  }
  return out.toString();
}

/// 逐 delta 流式更新整段文本，返回每次更新（构建+布局）的平均耗时。
Future<double> _streamMs(WidgetTester tester, String full, int steps) async {
  final notifier = ValueNotifier<String>('');
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: ValueListenableBuilder<String>(
            valueListenable: notifier,
            builder: (context, text, _) => NekoMarkdown(text),
          ),
        ),
      ),
    ),
  );
  final stopwatch = Stopwatch();
  for (var i = 1; i <= steps; i++) {
    notifier.value = full.substring(0, full.length * i ~/ steps);
    stopwatch.start();
    await tester.pump();
    stopwatch.stop();
  }
  return stopwatch.elapsedMicroseconds / steps / 1000;
}

void main() {
  testWidgets('流式更新含数十个公式的长回答：单次更新耗时可接受', (tester) async {
    const steps = 40;
    final plain = await _streamMs(tester, _answer(40, math: false), steps);
    final math = await _streamMs(tester, _answer(40, math: true), steps);
    // ignore: avoid_print
    print(
      'stream avg ms/update: plain=${plain.toStringAsFixed(1)} math=${math.toStringAsFixed(1)}',
    );
    expect(tester.takeException(), isNull);
    // 本机按 250ms 守护；共享 CI runner 抖动大（实测 264ms/次，基线同样偏慢），
    // 只在 CI 放宽上限，仍足以拦住“每次出现独立解析”被移除导致的数倍回归。
    final ceiling = Platform.environment['CI'] == 'true' ? 600.0 : 250.0;
    expect(math, lessThan(ceiling));
  });
}
