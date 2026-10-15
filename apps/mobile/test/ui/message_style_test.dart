import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/api/models.dart';
import 'package:neko_mobile/features/chat/transcript.dart';
import 'package:neko_mobile/ui/theme.dart';
import 'package:neko_mobile/ui/widgets/markdown_view.dart';
import 'package:neko_mobile/ui/widgets/transcript_view.dart';

import '../helpers/fake_api.dart';

class _Actions implements TranscriptActions {
  _Actions(this.transcript);

  @override
  final Transcript transcript;

  @override
  bool loadingOlder = false;

  @override
  Future<void> loadOlder() async {}

  @override
  Future<void> expand(ChatItem item, ContentRef ref) async {}

  @override
  Future<Uint8List> image(ImageRef image) async => Uint8List(0);
}

void main() {
  testWidgets('用户消息为紧凑气泡，助手内容满宽无气泡', (tester) async {
    final transcript = Transcript()
      ..applySnapshot(
        snapshotOf(<Map<String, dynamic>>[
          <String, dynamic>{'key': 'u1', 'type': 'user', 'text': '你好'},
          <String, dynamic>{
            'key': 'a1',
            'type': 'assistant',
            'text': '# 标题\n\n正文 `code`\n\n```\nblock\n```',
          },
        ]),
      );
    await tester.pumpWidget(
      MaterialApp(
        theme: buildNekoTheme(Brightness.light),
        home: Scaffold(body: TranscriptView(actions: _Actions(transcript))),
      ),
    );
    await tester.pump();

    final tokens = NekoTokens.light;
    final bubble = tester
        .widgetList<Container>(find.byType(Container))
        .where(
          (c) =>
              c.decoration is BoxDecoration &&
              (c.decoration! as BoxDecoration).color == tokens.userBubble,
        );
    expect(bubble, hasLength(1));
    final decoration = bubble.single.decoration! as BoxDecoration;
    expect(
      decoration.borderRadius,
      BorderRadius.circular(NekoTokens.radiusBubble),
    );
    expect(
      bubble.single.padding,
      const EdgeInsets.symmetric(
        horizontal: NekoSpace.md,
        vertical: NekoSpace.sm,
      ),
    );

    final screen = tester.getSize(find.byType(TranscriptView)).width;
    final markdown = tester.getSize(find.byType(NekoMarkdown)).width;
    expect(markdown, screen - 2 * NekoSpace.md);
    expect(
      find.ancestor(
        of: find.byType(NekoMarkdown),
        matching: find.byWidgetPredicate(
          (w) =>
              w is Container &&
              w.decoration is BoxDecoration &&
              (w.decoration! as BoxDecoration).color == tokens.userBubble,
        ),
      ),
      findsNothing,
    );
  });
}
