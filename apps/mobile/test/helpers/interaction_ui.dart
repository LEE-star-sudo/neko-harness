import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/ui/neko_icons.dart';

import 'chat_harness.dart';
import 'interaction_data.dart';

/// sheet / 转场动画（不用 pumpAndSettle：转录里可能有常驻动画）。
Future<void> transition(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

/// 单个未决问题：写入 `questions.list` 与 `questions.get`。
Map<String, dynamic> withQuestion(
  ChatHarness h, [
  Map<String, dynamic>? record,
]) {
  final r = record ?? questionJson();
  h.questionRecords[r['id'] as int] = r;
  h.questionList = questionListJson(
    ((h.questionList['revision'] as int?) ?? 0) + 1,
    <Map<String, dynamic>>[r],
  );
  return r;
}

/// 聊天草稿非空：会话页不会自动展开问题 sheet，只显示问题条。
void quietChat(ChatHarness h, [String draft = '还没写完的草稿']) =>
    h.chat.input.text = draft;

/// 单选用实心环、多选用打勾的方框：读选项当前是否选中。
bool optionSelected(WidgetTester tester, String id) {
  final icon = tester.widget<NekoIcon>(
    find.descendant(
      of: find.byKey(Key('question-option-$id')),
      matching: find.byType(NekoIcon),
    ),
  );
  return icon.icon == NekoIcons.radioOn || icon.icon == NekoIcons.checkboxOn;
}

bool buttonEnabled(WidgetTester tester, String key) {
  final finder = find.byKey(Key(key));
  final widget = tester.widget(finder);
  if (widget is FilledButton) return widget.onPressed != null;
  if (widget is TextButton) return widget.onPressed != null;
  if (widget is OutlinedButton) return widget.onPressed != null;
  throw StateError('不是按钮：$key');
}

Future<void> openQuestionSheet(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('question-bar')));
  await transition(tester);
}

/// sheet 里显示的问题正文。
String? questionText(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(const Key('question-text'))).data;
