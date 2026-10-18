import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/rpc/rpc_client.dart';
import 'package:neko_mobile/features/questions/question_draft.dart';
import 'package:neko_mobile/ui/widgets/markdown_view.dart';

import '../../helpers/chat_harness.dart';
import '../../helpers/fake_api.dart';
import '../../helpers/interaction_data.dart';
import '../../helpers/interaction_ui.dart';

void main() {
  late ChatHarness h;

  setUp(() => h = ChatHarness());
  tearDown(() => h.dispose());

  /// 已绑定新电脑（声明 todos/questions）、有一道未决单选题，聊天草稿非空（不自动展开）。
  Future<void> pumpQuiet(
    WidgetTester tester, {
    Map<String, dynamic>? record,
    double textScale = 1,
  }) async {
    withQuestion(h, record);
    await h.bind(capabilities: kInteractionCaps);
    quietChat(h);
    await tester.pumpWidget(h.build(textScale: textScale));
    await settle(tester);
  }

  group('问题条与 sheet 的内容', () {
    testWidgets('问题条显示“等待回答 · N”；旧电脑不显示也不请求', (tester) async {
      await pumpQuiet(tester);
      expect(find.byKey(const Key('question-bar')), findsOneWidget);
      expect(find.text('等待回答 · 1'), findsOneWidget);
      expect(find.byKey(const Key('question-sheet')), findsNothing);
    });

    testWidgets('旧电脑：没有问题条/入口，且从不请求 questions.*', (tester) async {
      withQuestion(h);
      await h.bind(); // 不声明能力
      await tester.pumpWidget(h.build());
      await settle(tester);
      expect(find.byKey(const Key('question-bar')), findsNothing);
      expect(find.byKey(const Key('composer-question-hint')), findsNothing);
      expect(h.api.callsOf('questions.list'), isEmpty);
      expect(h.api.callsOf('questions.get'), isEmpty);
      expect(h.api.callsOf('todos.get'), isEmpty);
    });

    testWidgets('“助手提问”标签、完整问题、选项与推荐标记；没有任何预选', (tester) async {
      await pumpQuiet(tester);
      await openQuestionSheet(tester);
      expect(find.byKey(const Key('question-label')), findsOneWidget);
      expect(find.text('助手提问'), findsOneWidget);
      expect(find.text('使用哪种数据库？'), findsWidgets);
      for (final label in <String>['PostgreSQL', 'MySQL', 'SQLite']) {
        expect(find.textContaining(label), findsWidgets);
      }
      expect(find.text('嵌入式，无需服务'), findsOneWidget);
      // 推荐仅是标记：只有 pg 带徽标，且没有任何选项被预选。
      expect(find.byKey(const Key('question-recommended-pg')), findsOneWidget);
      expect(find.byKey(const Key('question-recommended-my')), findsNothing);
      expect(find.text('推荐'), findsOneWidget);
      for (final id in <String>['pg', 'my', 'lite']) {
        expect(optionSelected(tester, id), isFalse, reason: id);
      }
      expect(buttonEnabled(tester, 'question-submit'), isFalse);
      expect(buttonEnabled(tester, 'question-skip'), isTrue);
      expect(h.api.callsOf('questions.respond'), isEmpty);
    });

    testWidgets('文字输入始终可见：有选项时是“补充说明（可选）”，无选项时是回答本身', (tester) async {
      await pumpQuiet(tester);
      await openQuestionSheet(tester);
      expect(find.byKey(const Key('question-input')), findsOneWidget);
      expect(find.text('补充说明（可选）'), findsOneWidget);
      await tester.tap(find.byKey(const Key('question-close')));
      await transition(tester);

      withQuestion(
        h,
        questionJson(
          id: 700,
          version: 'v-700',
          question: '你想叫它什么名字？',
          options: <Map<String, dynamic>>[],
        ),
      );
      h.api.notify('questions.changed', <String, dynamic>{
        'subscriptionId': 'chat-1',
        'revision': 9,
      });
      await settle(tester);
      await openQuestionSheet(tester);
      expect(find.byKey(const Key('question-input')), findsOneWidget);
      expect(find.text('你的回答'), findsOneWidget);
      expect(find.byKey(const Key('question-mode')), findsNothing);
      // 仅文字即可提交。
      expect(buttonEnabled(tester, 'question-submit'), isFalse);
      await tester.enterText(find.byKey(const Key('question-input')), '小喵');
      await tester.pump();
      expect(buttonEnabled(tester, 'question-submit'), isTrue);
    });

    testWidgets('问题与选项按纯文本显示：HTML/Markdown/链接原样，不生成链接', (tester) async {
      await pumpQuiet(
        tester,
        record: questionJson(
          question: '<b>粗体</b> **加粗** [链接](https://evil.example) https://evil.example\n第二行',
          options: <Map<String, dynamic>>[
            optionJson('a', '<i>斜体</i>', description: '`code` [x](y)'),
            optionJson('b', '**B**'),
          ],
        ),
      );
      await openQuestionSheet(tester);
      expect(
        find.descendant(
          of: find.byKey(const Key('question-sheet')),
          matching: find.byType(NekoMarkdown),
        ),
        findsNothing,
      );
      final question = tester.widget<Text>(
        find.byKey(const Key('question-text')),
      );
      expect(
        question.data,
        '<b>粗体</b> **加粗** [链接](https://evil.example) https://evil.example\n第二行',
      );
      expect(question.textSpan, isNull, reason: '无富文本片段，因此没有链接手势');
      expect(
        find.textContaining('<i>斜体</i>', findRichText: true),
        findsOneWidget,
      );
      expect(find.text('`code` [x](y)'), findsOneWidget);
      expect(find.textContaining('**B**', findRichText: true), findsOneWidget);
    });
  });

  group('选择、提交与跳过', () {
    testWidgets('点选只改变草稿，不提交；单选互换；再次点击取消', (tester) async {
      await pumpQuiet(tester);
      await openQuestionSheet(tester);
      await tester.tap(find.byKey(const Key('question-option-my')));
      await tester.pump();
      expect(optionSelected(tester, 'my'), isTrue);
      expect(buttonEnabled(tester, 'question-submit'), isTrue);
      await tester.tap(find.byKey(const Key('question-option-lite')));
      await tester.pump();
      expect(optionSelected(tester, 'my'), isFalse);
      expect(optionSelected(tester, 'lite'), isTrue);
      await tester.tap(find.byKey(const Key('question-option-lite')));
      await tester.pump();
      expect(optionSelected(tester, 'lite'), isFalse);
      expect(buttonEnabled(tester, 'question-submit'), isFalse);
      expect(h.api.callsOf('questions.respond'), isEmpty);
      expect(h.api.callsOf('chat.submit'), isEmpty);
    });

    testWidgets('多选：可同时选择多个选项，提交按选项顺序', (tester) async {
      await pumpQuiet(
        tester,
        record: questionJson(multiple: true, question: '需要哪些数据库？'),
      );
      await openQuestionSheet(tester);
      expect(find.text('可多选'), findsOneWidget);
      await tester.tap(find.byKey(const Key('question-option-lite')));
      await tester.tap(find.byKey(const Key('question-option-pg')));
      await tester.pump();
      expect(optionSelected(tester, 'pg'), isTrue);
      expect(optionSelected(tester, 'lite'), isTrue);
      h.api.on(
        'questions.respond',
        (_) => questionJson(
          multiple: true,
          status: 'answered',
          answer: <String, dynamic>{
            'optionIds': <String>['pg', 'lite'],
            'text': null,
          },
          settledAt: 2,
        ),
      );
      await tester.tap(find.byKey(const Key('question-submit')));
      await settle(tester);
      expect(
        h.api.callsOf('questions.respond').single!['response'],
        <String, Object?>{
          'kind': 'answer',
          'optionIds': <String>['pg', 'lite'],
        },
      );
    });

    testWidgets('显式提交：选项 + 补充文字作为独立字段；成功后显示终态并移除问题条', (tester) async {
      await pumpQuiet(tester);
      h.api.on('questions.respond', (_) {
        final receipt = questionJson(
          status: 'answered',
          answer: <String, dynamic>{
            'optionIds': <String>['lite'],
            'text': '先用 SQLite',
          },
          settledAt: 2,
        );
        h.questionRecords[612] = receipt;
        h.questionList = questionListJson(9, <Map<String, dynamic>>[]);
        return receipt;
      });
      await openQuestionSheet(tester);
      await tester.tap(find.byKey(const Key('question-option-lite')));
      await tester.enterText(
        find.byKey(const Key('question-input')),
        '先用 SQLite',
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('question-submit')));
      await settle(tester);
      final call = h.api.callsOf('questions.respond').single!;
      expect(call['id'], 612);
      expect(call['version'], 'v-612');
      expect(call['subscriptionId'], 'chat-1');
      expect(call['response'], <String, Object?>{
        'kind': 'answer',
        'optionIds': <String>['lite'],
        'text': '先用 SQLite',
      });
      expect(find.byKey(const Key('question-final')), findsOneWidget);
      expect(find.text('已回答'), findsOneWidget);
      expect(find.text('选择：SQLite'), findsOneWidget);
      expect(find.text('文字：先用 SQLite'), findsOneWidget);
      expect(find.byKey(const Key('question-submit')), findsNothing);
      expect(find.byKey(const Key('question-skip')), findsNothing);
      // 不是聊天输入：没有走 chat.submit，聊天草稿原样保留。
      expect(h.api.callsOf('chat.submit'), isEmpty);
      expect(h.chat.input.text, '还没写完的草稿');
      await tester.tap(find.byKey(const Key('question-done')));
      await transition(tester);
      expect(find.byKey(const Key('question-bar')), findsNothing);
    });

    testWidgets('跳过是独立的次要按钮：结算为已跳过', (tester) async {
      await pumpQuiet(tester);
      h.api.on('questions.respond', (_) {
        h.questionList = questionListJson(9, <Map<String, dynamic>>[]);
        return questionJson(status: 'skipped', settledAt: 2);
      });
      await openQuestionSheet(tester);
      await tester.tap(find.byKey(const Key('question-option-pg')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('question-skip')));
      await settle(tester);
      expect(
        h.api.callsOf('questions.respond').single!['response'],
        <String, Object?>{'kind': 'skip'},
      );
      expect(find.text('已跳过'), findsOneWidget);
      expect(find.text('已跳过，未提供答案。'), findsOneWidget);
    });

    testWidgets('提交中禁用全部控件，连点只发一次请求', (tester) async {
      await pumpQuiet(tester);
      final gate = Completer<void>();
      h.api.on('questions.respond', (_) async {
        await gate.future;
        return questionJson(
          status: 'answered',
          answer: <String, dynamic>{
            'optionIds': <String>['pg'],
            'text': null,
          },
          settledAt: 2,
        );
      });
      await openQuestionSheet(tester);
      await tester.tap(find.byKey(const Key('question-option-pg')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('question-submit')));
      await tester.pump();
      expect(find.text('提交中…'), findsOneWidget);
      expect(buttonEnabled(tester, 'question-submit'), isFalse);
      expect(buttonEnabled(tester, 'question-skip'), isFalse);
      await tester.tap(
        find.byKey(const Key('question-submit')),
        warnIfMissed: false,
      );
      await tester.tap(
        find.byKey(const Key('question-skip')),
        warnIfMissed: false,
      );
      await tester.tap(
        find.byKey(const Key('question-option-my')),
        warnIfMissed: false,
      );
      await tester.pump();
      expect(optionSelected(tester, 'my'), isFalse, reason: '提交中不能改草稿');
      expect(h.api.callsOf('questions.respond'), hasLength(1));
      gate.complete();
      await settle(tester);
      expect(h.api.callsOf('questions.respond'), hasLength(1));
      expect(find.byKey(const Key('question-final')), findsOneWidget);
    });

    testWidgets('失败保留选择与文字并显示原因；可再次明确提交', (tester) async {
      await pumpQuiet(tester);
      var fail = true;
      h.api.on('questions.respond', (_) {
        if (fail) {
          throw const MobileApiException('rejected', '问题版本已变化');
        }
        return questionJson(
          status: 'answered',
          answer: <String, dynamic>{
            'optionIds': <String>['my'],
            'text': '再试',
          },
          settledAt: 2,
        );
      });
      await openQuestionSheet(tester);
      await tester.tap(find.byKey(const Key('question-option-my')));
      await tester.enterText(find.byKey(const Key('question-input')), '再试');
      await tester.pump();
      await tester.tap(find.byKey(const Key('question-submit')));
      await settle(tester);
      expect(find.byKey(const Key('question-error')), findsOneWidget);
      expect(find.textContaining('问题版本已变化'), findsOneWidget);
      expect(optionSelected(tester, 'my'), isTrue);
      expect(
        tester
            .widget<TextField>(find.byKey(const Key('question-input')))
            .controller
            ?.text,
        '再试',
      );
      expect(buttonEnabled(tester, 'question-submit'), isTrue);
      expect(find.byKey(const Key('question-final')), findsNothing);

      fail = false;
      await tester.tap(find.byKey(const Key('question-submit')));
      await settle(tester);
      expect(h.api.callsOf('questions.respond'), hasLength(2));
      expect(find.byKey(const Key('question-final')), findsOneWidget);
    });

    testWidgets('超过上限：UTF-16 码元（emoji 占 2）、问题提示且不可提交', (tester) async {
      await pumpQuiet(
        tester,
        record: questionJson(options: <Map<String, dynamic>>[]),
      );
      await openQuestionSheet(tester);
      final input = find.byKey(const Key('question-input'));
      await tester.enterText(input, 'a' * 4000);
      await tester.pump();
      expect(buttonEnabled(tester, 'question-submit'), isTrue);
      expect(find.text('4000/4000'), findsOneWidget);
      await tester.enterText(input, 'a' * 4001);
      await tester.pump();
      expect(buttonEnabled(tester, 'question-submit'), isFalse);
      expect(find.byKey(const Key('question-problem')), findsOneWidget);
      // 2000 个 emoji = 4000 个码元：满额可提交；2001 个 = 4002 个码元：被拒绝（rune 数仍只有 2001）。
      await tester.enterText(input, '😀' * 2000);
      await tester.pump();
      expect('😀' * 2000, hasLength(4000));
      expect(buttonEnabled(tester, 'question-submit'), isTrue);
      expect(find.text('4000/4000'), findsOneWidget);
      await tester.enterText(input, '😀' * 2001);
      await tester.pump();
      expect(buttonEnabled(tester, 'question-submit'), isFalse);
      expect(find.text('4002/4000'), findsOneWidget);
      expect(h.api.callsOf('questions.respond'), isEmpty);
    });

    testWidgets('多个未决问题按序切换，同一时刻只展开一个编辑面板', (tester) async {
      final second = questionJson(
        id: 700,
        version: 'v-700',
        question: '要不要加缓存？',
        options: <Map<String, dynamic>>[
          optionJson('yes', '要'),
          optionJson('no', '不要'),
        ],
      );
      withQuestion(h);
      h.questionRecords[700] = second;
      h.questionList = questionListJson(3, <Map<String, dynamic>>[
        questionJson(),
        second,
      ]);
      await h.bind(capabilities: kInteractionCaps);
      quietChat(h);
      await tester.pumpWidget(h.build());
      await settle(tester);
      expect(find.text('等待回答 · 2'), findsOneWidget);
      await openQuestionSheet(tester);
      expect(find.byKey(const Key('question-position')), findsOneWidget);
      expect(find.text('1/2'), findsOneWidget);
      expect(find.byKey(const Key('question-input')), findsOneWidget);
      expect(questionText(tester), '使用哪种数据库？');
      await tester.tap(find.byKey(const Key('question-next')));
      await transition(tester);
      expect(questionText(tester), '要不要加缓存？');
      expect(find.byKey(const Key('question-input')), findsOneWidget);
      expect(find.text('2/2'), findsOneWidget);
    });
  });

  group('关闭只是关闭；草稿隔离', () {
    testWidgets('关闭按钮/下拉/点遮罩：问题仍未决，草稿保留，聊天草稿不变', (tester) async {
      await pumpQuiet(tester);
      await openQuestionSheet(tester);
      await tester.tap(find.byKey(const Key('question-option-lite')));
      await tester.enterText(find.byKey(const Key('question-input')), '答案草稿');
      await tester.pump();

      // 关闭按钮。
      await tester.tap(find.byKey(const Key('question-close')));
      await transition(tester);
      expect(find.byKey(const Key('question-sheet')), findsNothing);
      expect(find.byKey(const Key('question-bar')), findsOneWidget);
      expect(h.chat.input.text, '还没写完的草稿');

      // 再打开：选择与文字原样恢复；再用下拉关闭。
      await openQuestionSheet(tester);
      expect(optionSelected(tester, 'lite'), isTrue);
      expect(
        tester
            .widget<TextField>(find.byKey(const Key('question-input')))
            .controller
            ?.text,
        '答案草稿',
      );
      await tester.fling(
        find.byKey(const Key('question-label')),
        const Offset(0, 500),
        1500,
      );
      await transition(tester);
      expect(find.byKey(const Key('question-sheet')), findsNothing);

      // 点击遮罩关闭。
      await openQuestionSheet(tester);
      await tester.tapAt(const Offset(10, 10));
      await transition(tester);
      expect(find.byKey(const Key('question-sheet')), findsNothing);

      expect(h.api.callsOf('questions.respond'), isEmpty);
      expect(h.api.callsOf('chat.abort'), isEmpty);
      expect(h.api.callsOf('chat.submit'), isEmpty);
      expect(find.byKey(const Key('question-bar')), findsOneWidget);
      expect(h.chat.input.text, '还没写完的草稿');
      expect(h.chat.interactions.pending.single.id, 612);
    });

    testWidgets('答案草稿与聊天草稿互不影响', (tester) async {
      await pumpQuiet(tester);
      await openQuestionSheet(tester);
      await tester.enterText(find.byKey(const Key('question-input')), '答案里的话');
      await tester.pump();
      expect(h.chat.input.text, '还没写完的草稿');
      await tester.tap(find.byKey(const Key('question-close')));
      await transition(tester);
      await tester.enterText(
        find.byKey(const Key('composer-input')),
        '聊天里新写的话',
      );
      await tester.pump();
      await openQuestionSheet(tester);
      expect(
        tester
            .widget<TextField>(find.byKey(const Key('question-input')))
            .controller
            ?.text,
        '答案里的话',
      );
      expect(h.chat.input.text, '聊天里新写的话');
    });

    testWidgets('答案草稿不跨会话复用', (tester) async {
      await pumpQuiet(tester);
      await openQuestionSheet(tester);
      await tester.enterText(
        find.byKey(const Key('question-input')),
        '会话 7 的答案',
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('question-close')));
      await transition(tester);

      // 另一个会话里恰好有同 id、同 version 的问题：草稿按 session 隔离，不复用；
      // 进入新会话且输入为空，问题 sheet 自动展开（按 session 的键，不受会话 7 里的关闭影响）。
      await h.chat.attach('8');
      await settle(tester);
      await transition(tester);
      expect(find.byKey(const Key('question-sheet')), findsOneWidget);
      expect(
        tester
            .widget<TextField>(find.byKey(const Key('question-input')))
            .controller
            ?.text,
        isEmpty,
      );
    });
  });

  group('他端结算与离线', () {
    testWidgets('其他端先回答：打开的 sheet 更新为实际获胜答案，控件移除', (tester) async {
      await pumpQuiet(tester);
      await openQuestionSheet(tester);
      await tester.tap(find.byKey(const Key('question-option-pg')));
      await tester.pump();

      h.questionRecords[612] = questionJson(
        status: 'answered',
        answer: <String, dynamic>{
          'optionIds': <String>['my'],
          'text': '桌面端回答的',
        },
        settledAt: 9,
      );
      h.questionList = questionListJson(9, <Map<String, dynamic>>[]);
      h.api.notify('questions.changed', <String, dynamic>{
        'subscriptionId': 'chat-1',
        'revision': 9,
      });
      await settle(tester);
      expect(find.byKey(const Key('question-final')), findsOneWidget);
      expect(find.text('已回答'), findsOneWidget);
      expect(find.text('选择：MySQL'), findsOneWidget);
      expect(find.text('文字：桌面端回答的'), findsOneWidget);
      expect(find.byKey(const Key('question-submit')), findsNothing);
      expect(find.byKey(const Key('question-skip')), findsNothing);
      expect(h.api.callsOf('questions.respond'), isEmpty, reason: '没有覆盖他端的决定');
    });

    testWidgets('回执显示他端获胜：以返回记录为准并说明', (tester) async {
      await pumpQuiet(tester);
      h.api.on('questions.respond', (_) {
        h.questionList = questionListJson(9, <Map<String, dynamic>>[]);
        return questionJson(status: 'skipped', settledAt: 9);
      });
      await openQuestionSheet(tester);
      await tester.tap(find.byKey(const Key('question-option-pg')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('question-submit')));
      await settle(tester);
      expect(find.byKey(const Key('question-note')), findsOneWidget);
      expect(find.text('已跳过'), findsOneWidget);
      expect(find.text('选择：PostgreSQL'), findsNothing);
    });

    testWidgets('运行被停止：显示已取消', (tester) async {
      await pumpQuiet(tester);
      await openQuestionSheet(tester);
      h.questionRecords[612] = questionJson(status: 'cancelled', settledAt: 9);
      h.questionList = questionListJson(9, <Map<String, dynamic>>[]);
      h.api.notify('questions.changed', <String, dynamic>{
        'subscriptionId': 'chat-1',
        'revision': 9,
      });
      await settle(tester);
      expect(find.text('已取消'), findsOneWidget);
      expect(find.byKey(const Key('question-submit')), findsNothing);
    });

    testWidgets('离线：控件禁用并提示；重连后不自动发送答案', (tester) async {
      await pumpQuiet(tester);
      await openQuestionSheet(tester);
      await tester.tap(find.byKey(const Key('question-option-pg')));
      await tester.pump();
      expect(buttonEnabled(tester, 'question-submit'), isTrue);

      h.chat.unbind();
      await settle(tester);
      expect(find.byKey(const Key('question-offline')), findsOneWidget);
      expect(buttonEnabled(tester, 'question-submit'), isFalse);
      expect(buttonEnabled(tester, 'question-skip'), isFalse);
      expect(optionSelected(tester, 'pg'), isTrue, reason: '草稿仍在');

      await h.chat.bind(h.api, 'srv', capabilities: kInteractionCaps);
      await settle(tester);
      expect(find.byKey(const Key('question-offline')), findsNothing);
      expect(h.api.callsOf('questions.respond'), isEmpty, reason: '不自动重发');
      expect(buttonEnabled(tester, 'question-submit'), isTrue);
    });

    testWidgets('无回执：不显示已回答，提示未收到回执，需用户明确重试', (tester) async {
      await pumpQuiet(tester);
      h.api.on('questions.respond', (_) => throw const RpcNetworkException());
      await openQuestionSheet(tester);
      await tester.tap(find.byKey(const Key('question-option-pg')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('question-submit')));
      await settle(tester);
      expect(find.byKey(const Key('question-final')), findsNothing);
      expect(find.textContaining('未收到电脑的回执'), findsOneWidget);
      expect(optionSelected(tester, 'pg'), isTrue);
      expect(buttonEnabled(tester, 'question-submit'), isTrue);
      expect(h.api.callsOf('questions.respond'), hasLength(1));
    });
  });

  group('自动展开', () {
    testWidgets('进入有未决问题的会话且输入未聚焦、草稿为空：自动展开一次；关闭后同一版本不再展开', (tester) async {
      withQuestion(h);
      await h.bind(capabilities: kInteractionCaps);
      await tester.pumpWidget(h.build());
      await settle(tester);
      expect(find.byKey(const Key('question-sheet')), findsOneWidget);
      await tester.tap(find.byKey(const Key('question-close')));
      await transition(tester);
      expect(find.byKey(const Key('question-sheet')), findsNothing);

      // 通知/刷新/重新进入会话：同一版本不再自动展开。
      h.questionList = questionListJson(9, <Map<String, dynamic>>[
        h.questionRecords[612]!,
      ]);
      h.api.notify('questions.changed', <String, dynamic>{
        'subscriptionId': 'chat-1',
        'revision': 9,
      });
      await settle(tester);
      // 另一个会话的同一问题按各自的键处理（会话 8 里它是第一次出现，会自动展开）。
      await h.chat.attach('8');
      await settle(tester);
      await transition(tester);
      expect(find.byKey(const Key('question-sheet')), findsOneWidget);
      await tester.tap(find.byKey(const Key('question-close')));
      await transition(tester);
      await h.chat.attach('7');
      await settle(tester);
      expect(find.byKey(const Key('question-sheet')), findsNothing);
      expect(find.byKey(const Key('question-bar')), findsOneWidget);
    });

    testWidgets('聊天草稿非空：只显示问题条，不改变焦点和草稿', (tester) async {
      await pumpQuiet(tester);
      expect(find.byKey(const Key('question-sheet')), findsNothing);
      expect(find.byKey(const Key('question-bar')), findsOneWidget);
      expect(h.chat.input.text, '还没写完的草稿');
    });

    testWidgets('输入框聚焦时新问题出现：只显示问题条，之后也不会突然弹出', (tester) async {
      await h.bind(capabilities: kInteractionCaps);
      await tester.pumpWidget(h.build());
      await settle(tester);
      await tester.tap(find.byKey(const Key('composer-input')));
      await tester.pump();
      withQuestion(h);
      h.api.notify('questions.changed', <String, dynamic>{
        'subscriptionId': 'chat-1',
        'revision': 9,
      });
      await settle(tester);
      expect(find.byKey(const Key('question-bar')), findsOneWidget);
      expect(find.byKey(const Key('question-sheet')), findsNothing);
      // 失去焦点后也不补弹。
      FocusManager.instance.primaryFocus?.unfocus();
      await settle(tester);
      expect(find.byKey(const Key('question-sheet')), findsNothing);
    });

    testWidgets('页面空闲时新问题首次出现：自动展开一次', (tester) async {
      await h.bind(capabilities: kInteractionCaps);
      await tester.pumpWidget(h.build());
      await settle(tester);
      expect(find.byKey(const Key('question-sheet')), findsNothing);
      withQuestion(h);
      h.api.notify('questions.changed', <String, dynamic>{
        'subscriptionId': 'chat-1',
        'revision': 9,
      });
      await settle(tester);
      await transition(tester);
      expect(find.byKey(const Key('question-sheet')), findsOneWidget);
    });
  });

  group('转录里的 ask_user 卡片', () {
    testWidgets('等待中的卡片只读，“查看问题”打开同一个问题面板', (tester) async {
      h.snapshot = snapshotWith(
        items: <Map<String, dynamic>>[
          <String, dynamic>{
            'key': 't-ask',
            'type': 'tool',
            'tool': <String, dynamic>{
              'callId': 'call_612',
              'name': 'ask_user',
              'summary': 'ask_user',
              'status': 'running',
              'interaction': <String, dynamic>{
                'kind': 'ask_user',
                'id': 612,
                'question': '使用哪种数据库？',
                'multiple': false,
                'options': <Object>[
                  <String, dynamic>{'id': 'pg', 'label': 'PostgreSQL'},
                ],
                'status': 'pending',
              },
            },
          },
        ],
      );
      await pumpQuiet(tester);
      await tester.tap(find.text('助手提问').first);
      await tester.pump();
      // 卡片里没有回答控件。
      expect(find.byKey(const Key('question-submit')), findsNothing);
      await tester.tap(find.byKey(const Key('open-question-612')));
      await transition(tester);
      expect(find.byKey(const Key('question-sheet')), findsOneWidget);
      expect(find.byKey(const Key('question-submit')), findsOneWidget);
    });
  });

  group('聊天输入提示', () {
    testWidgets('有未决问题：提示消息会排队并提供入口；发送仍是普通排队输入，不当作答案', (tester) async {
      withQuestion(h);
      h.snapshot = snapshotOf(<Map<String, dynamic>>[
        userItem('u-1', '问我一个问题'),
      ], busy: true);
      await h.bind(capabilities: kInteractionCaps);
      quietChat(h, '');
      await tester.pumpWidget(h.build());
      await settle(tester);
      // 草稿为空会自动展开：先关闭，再检查输入区提示。
      if (find.byKey(const Key('question-sheet')).evaluate().isNotEmpty) {
        await tester.tap(find.byKey(const Key('question-close')));
        await transition(tester);
      }
      expect(find.byKey(const Key('composer-question-hint')), findsOneWidget);
      expect(find.textContaining('此处发送的消息会排队'), findsOneWidget);

      h.api.on(
        'chat.submit',
        (_) => <String, dynamic>{'accepted': true, 'queued': true},
      );
      await tester.enterText(find.byKey(const Key('composer-input')), '先别管数据库');
      await tester.pump();
      await tester.tap(find.byKey(const Key('composer-send')));
      await settle(tester);
      final submit = h.api.callsOf('chat.submit').single!;
      expect(submit['text'], '先别管数据库');
      expect(submit.containsKey('mode'), isFalse, reason: '发送不预选引导');
      expect(h.api.callsOf('questions.respond'), isEmpty);

      await tester.tap(find.byKey(const Key('composer-open-question')));
      await transition(tester);
      expect(find.byKey(const Key('question-sheet')), findsOneWidget);
    });

    testWidgets('没有未决问题时不显示提示', (tester) async {
      await h.bind(capabilities: kInteractionCaps);
      await tester.pumpWidget(h.build());
      await settle(tester);
      expect(find.byKey(const Key('composer-question-hint')), findsNothing);
      expect(find.byKey(const Key('question-bar')), findsNothing);
    });

    testWidgets('忙碌且等待回答：标题副标题区分“等待你的回答”与生成中', (tester) async {
      withQuestion(h);
      h.snapshot = snapshotOf(<Map<String, dynamic>>[
        userItem('u-1', 'x'),
      ], busy: true);
      await h.bind(capabilities: kInteractionCaps);
      quietChat(h);
      await tester.pumpWidget(h.build());
      await settle(tester);
      expect(find.text('等待你的回答'), findsOneWidget);
      expect(find.text('思考中…'), findsNothing);
    });
  });

  test('QuestionLimits 与服务端常量一致', () {
    expect(QuestionLimits.questionChars, 2000);
    expect(QuestionLimits.maxOptions, 12);
    expect(QuestionLimits.optionIdChars, 64);
    expect(QuestionLimits.labelChars, 200);
    expect(QuestionLimits.descriptionChars, 500);
    expect(QuestionLimits.textChars, 4000);
    expect(QuestionLimits.responseBytes, 16384);
  });
}
