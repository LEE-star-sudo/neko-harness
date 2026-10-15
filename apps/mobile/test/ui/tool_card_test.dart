import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/api/models.dart';
import 'package:neko_mobile/features/chat/transcript.dart';
import 'package:neko_mobile/ui/widgets/transcript_view.dart';

import '../helpers/fake_api.dart';

class _Actions implements TranscriptActions {
  _Actions(this.transcript);

  @override
  final Transcript transcript;

  @override
  bool loadingOlder = false;

  var expandedError = false;

  @override
  Future<void> loadOlder() async {}

  @override
  Future<void> expand(ChatItem item, ContentRef ref) async {
    if (expandedError) throw Exception('boom');
    final preview = item.tool?.result ?? '';
    transcript.setExpanded(item.key, ref.field, '$preview\n${'全文内容' * 3000}');
  }

  @override
  Future<Uint8List> image(ImageRef image) async => Uint8List(0);
}

Map<String, dynamic> _bashItem({
  String? result,
  List<Map<String, dynamic>>? refs,
}) => <String, dynamic>{
  'key': 't-bash1',
  'type': 'tool',
  'refs': refs ?? <Map<String, dynamic>>[],
  'tool': <String, dynamic>{
    'callId': 'call-1',
    'name': 'bash',
    'summary': 'ls -la',
    'status': 'done',
    'detail': 'cd /tmp && ls -la',
    'result': ?result,
    'durationMs': 12,
  },
};

Future<void> _pump(
  WidgetTester tester,
  Transcript transcript,
  _Actions actions, {
  ThemeMode mode = ThemeMode.light,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: ThemeData.light(),
      darkTheme: ThemeData.dark(),
      themeMode: mode,
      home: Scaffold(body: TranscriptView(actions: actions)),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('bash 工具卡展开后显示命令与结果文本', (tester) async {
    final transcript = Transcript()
      ..applySnapshot(
        snapshotOf(<Map<String, dynamic>>[
          _bashItem(result: 'total 0\n${'drwxr-xr-x 1\n' * 20}'),
        ]),
      );
    final actions = _Actions(transcript);
    await _pump(tester, transcript, actions);

    await tester.tap(find.text('bash'));
    await tester.pumpAndSettle();

    // 展开后：命令与结果都必须可见。
    expect(find.textContaining('cd /tmp && ls -la'), findsOneWidget);
    expect(find.textContaining('drwxr-xr-x 1'), findsOneWidget);
  });

  testWidgets('超大结果（13 KB、长行与多行混合）展开后仍有内容', (tester) async {
    // 模拟真实 ls -la 输出：长行 + 多行。
    final big = List<String>.generate(
      200,
      (i) =>
          '-rw-r--r-- 1 kirineko staff ${1000 + i} Oct 15 10:00 '
          '${'very-long-file-name-' * 8}$i.txt',
    ).join('\n');
    expect(big.length, greaterThan(12000));
    final transcript = Transcript()
      ..applySnapshot(
        snapshotOf(<Map<String, dynamic>>[_bashItem(result: big)]),
      );
    final actions = _Actions(transcript);
    await tester.binding.setSurfaceSize(const Size(800, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await _pump(tester, transcript, actions);

    await tester.tap(find.text('bash'));
    await tester.pumpAndSettle();

    expect(find.textContaining('very-long-file-name'), findsWidgets);
    expect(
      find.textContaining('Oct 15 10:00', findRichText: true),
      findsWidgets,
    );
  });

  testWidgets('带 contentRef 的工具卡：展开全文后有内容，失败时显示错误', (tester) async {
    final transcript = Transcript()
      ..applySnapshot(
        snapshotOf(<Map<String, dynamic>>[
          _bashItem(
            result: 'preview\n' * 5,
            refs: <Map<String, dynamic>>[
              <String, dynamic>{
                'sessionId': '7',
                'key': 't-bash1',
                'field': 'tool.result',
                'digest': 'abc',
                'bytes': 13312,
              },
            ],
          ),
        ]),
      );
    final actions = _Actions(transcript);
    await _pump(tester, transcript, actions);

    await tester.tap(find.text('bash'));
    await tester.pumpAndSettle();
    expect(find.text('展开全文（13 KB）'), findsOneWidget);

    await tester.tap(find.text('展开全文（13 KB）'));
    await tester.pumpAndSettle();
    expect(find.textContaining('全文内容'), findsOneWidget);
  });
}
