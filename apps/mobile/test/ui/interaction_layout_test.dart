import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/chat_harness.dart';
import '../helpers/fake_api.dart';
import '../helpers/interaction_data.dart';
import '../helpers/interaction_ui.dart';

Map<String, dynamic> _approval(int id) => <String, dynamic>{
  'id': id,
  'version': 'v1',
  'taskId': 9,
  'agentId': 'agent-4',
  'title': '看看测试',
  'command': 'bun test ${'--very-long-flag ' * 40}',
  'cwd': '/a/neko/${'deep-directory/' * 8}',
  'timeoutSeconds': 120,
  'requestedAt': 0,
};

/// 2000 码元的问题正文 + 12 个带长标签/说明的选项：最坏情况下的 sheet。
Map<String, dynamic> _bigQuestion() => questionJson(
  question: '${'这是一道很长的问题。' * 199}末',
  multiple: true,
  options: <Map<String, dynamic>>[
    for (var i = 0; i < 12; i++)
      optionJson(
        'o$i',
        '选项 $i：${'较长的标签' * 8}',
        description: '说明文字 ' * 40,
        recommended: i == 3,
      ),
  ],
);

const double _w = 360;
const double _h = 640;

/// 在 360x640 窄屏下检查待办入口、问题条与问题 sheet：大字体、软键盘、安全区、
/// 与审批/排队共存时不溢出，关键控件在可见区域内且热区 >=44dp。
void main() {
  late ChatHarness h;

  setUp(() => h = ChatHarness());
  tearDown(() => h.dispose());

  void narrow(
    WidgetTester tester, {
    double keyboard = 0,
    double top = 0,
    double bottom = 0,
  }) {
    tester.view
      ..physicalSize = const Size(_w, _h)
      ..devicePixelRatio = 1
      ..viewInsets = FakeViewPadding(bottom: keyboard)
      ..padding = FakeViewPadding(top: top, bottom: keyboard > 0 ? 0 : bottom)
      ..viewPadding = FakeViewPadding(top: top, bottom: bottom);
    addTearDown(tester.view.reset);
  }

  void expectVisible(
    WidgetTester tester,
    Finder finder, {
    double bottomLimit = _h,
    String? reason,
  }) {
    final rect = tester.getRect(finder);
    expect(rect.left, greaterThanOrEqualTo(0), reason: reason);
    expect(rect.right, lessThanOrEqualTo(_w), reason: reason);
    expect(rect.top, greaterThanOrEqualTo(0), reason: reason);
    expect(rect.bottom, lessThanOrEqualTo(bottomLimit), reason: reason);
  }

  void expectTouch(WidgetTester tester, String key) {
    final size = tester.getSize(find.byKey(Key(key)));
    expect(size.height, greaterThanOrEqualTo(44), reason: key);
    expect(size.width, greaterThanOrEqualTo(44), reason: key);
  }

  for (final mode in <ThemeMode>[ThemeMode.light, ThemeMode.dark]) {
    for (final scale in <double>[1.0, 1.5, 2.0]) {
      testWidgets('问题 sheet：窄屏 ×$scale（$mode）最坏内容无溢出，提交/跳过固定可见', (
        tester,
      ) async {
        narrow(tester);
        withQuestion(h, _bigQuestion());
        await h.bind(capabilities: kInteractionCaps);
        quietChat(h);
        await tester.pumpWidget(h.build(mode: mode, textScale: scale));
        await settle(tester);
        expect(tester.takeException(), isNull);
        await openQuestionSheet(tester);
        expect(tester.takeException(), isNull);

        for (final key in <String>[
          'question-submit',
          'question-skip',
          'question-close',
        ]) {
          expectVisible(tester, find.byKey(Key(key)), reason: key);
        }
        expectTouch(tester, 'question-submit');
        expectTouch(tester, 'question-skip');
        expectTouch(tester, 'question-close');
        // 正文与选项可滚动，没有被截断：滚动到最后一个选项。
        final scroll = tester.state<ScrollableState>(
          find
              .descendant(
                of: find.byKey(const Key('question-scroll')),
                matching: find.byType(Scrollable),
              )
              .first,
        );
        expect(scroll.position.maxScrollExtent, greaterThan(0));
        await tester.ensureVisible(
          find.byKey(const Key('question-option-o11')),
        );
        await tester.pump();
        expectTouch(tester, 'question-option-o11');
        // 超长选项在 ×2 字体下可能比屏幕还高：只要求滚动后它进入可视区域且不横向溢出。
        final rect = tester.getRect(
          find.byKey(const Key('question-option-o11')),
        );
        expect(rect.left, greaterThanOrEqualTo(0));
        expect(rect.right, lessThanOrEqualTo(_w));
        expect(rect.top, lessThan(_h));
        expect(rect.bottom, greaterThan(0));
        // 每个选项热区 >=44dp 高。
        for (var i = 0; i < 12; i++) {
          final size = tester.getSize(find.byKey(Key('question-option-o$i')));
          expect(size.height, greaterThanOrEqualTo(44), reason: 'o$i');
        }
        // 提交/跳过始终在屏内（不随内容滚走）。
        expectVisible(tester, find.byKey(const Key('question-submit')));
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('软键盘：聚焦文字输入后 sheet 抬到键盘之上，提交/跳过仍可见可点', (tester) async {
    narrow(tester, keyboard: 300);
    // 超长正文（让内容必须滚动）+ 普通选项。
    withQuestion(h, questionJson(question: '${'这是一道很长的问题。' * 199}末'));
    await h.bind(capabilities: kInteractionCaps);
    quietChat(h);
    await tester.pumpWidget(h.build(textScale: 1.5));
    await settle(tester);
    await openQuestionSheet(tester);
    await tester.ensureVisible(find.byKey(const Key('question-input')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('question-input')));
    await tester.pump();
    expect(tester.takeException(), isNull);
    const visibleBottom = _h - 300;
    for (final key in <String>[
      'question-submit',
      'question-skip',
      'question-input',
    ]) {
      expectVisible(
        tester,
        find.byKey(Key(key)),
        bottomLimit: visibleBottom,
        reason: key,
      );
    }
    expectTouch(tester, 'question-submit');
    expectTouch(tester, 'question-skip');
    // 键盘下仍能选择、输入并提交（先选择再输入：输入会让滚动回到光标处）。
    await tester.ensureVisible(find.byKey(const Key('question-option-pg')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('question-option-pg')));
    await tester.pump();
    expect(optionSelected(tester, 'pg'), isTrue);
    await tester.enterText(find.byKey(const Key('question-input')), '补充');
    await tester.pump();
    h.api.on('questions.respond', (_) => questionJson(status: 'skipped'));
    await tester.tap(find.byKey(const Key('question-submit')));
    await settle(tester);
    expect(h.api.callsOf('questions.respond'), hasLength(1));
    expect(
      h.api.callsOf('questions.respond').single!['response'],
      <String, Object?>{
        'kind': 'answer',
        'optionIds': <String>['pg'],
        'text': '补充',
      },
    );
  });

  testWidgets('安全区：底部手势条不遮挡 sheet 按钮', (tester) async {
    narrow(tester, top: 24, bottom: 34);
    withQuestion(h, _bigQuestion());
    await h.bind(capabilities: kInteractionCaps);
    quietChat(h);
    await tester.pumpWidget(h.build());
    await settle(tester);
    await openQuestionSheet(tester);
    expect(tester.takeException(), isNull);
    for (final key in <String>['question-submit', 'question-skip']) {
      expectVisible(
        tester,
        find.byKey(Key(key)),
        bottomLimit: _h - 34,
        reason: key,
      );
    }
    // 顶部安全区：sheet 顶端不进入状态栏。
    expect(
      tester.getTopLeft(find.byKey(const Key('question-label'))).dy,
      greaterThanOrEqualTo(24),
    );
  });

  testWidgets('键盘弹出时会话页的审批/问题/排队/输入区共存不溢出', (tester) async {
    narrow(tester, keyboard: 280, bottom: 34);
    h.approvals = <Object>[_approval(31)];
    withQuestion(h);
    h.snapshot = snapshotOf(
      <Map<String, dynamic>>[userItem('u-1', '跑测试')],
      busy: true,
      queued: <Map<String, dynamic>>[
        <String, dynamic>{
          'id': 4,
          'mode': 'followUp',
          'preview': '稍后跑测试',
          'images': 0,
        },
      ],
    );
    h.todoList = fixtureTodos();
    await h.bind(capabilities: kInteractionCaps);
    quietChat(h);
    await tester.pumpWidget(h.build(textScale: 1.5));
    await settle(tester);
    expect(tester.takeException(), isNull);
    for (final key in <String>[
      'approval-bar',
      'question-bar',
      'queue-tray',
      'composer-input',
      'composer-send',
      'composer-stop',
      'todo-entry',
    ]) {
      expect(find.byKey(Key(key)), findsOneWidget, reason: key);
      expectVisible(tester, find.byKey(Key(key)), bottomLimit: _h - 280);
    }
    expectTouch(tester, 'todo-entry');
    expectTouch(tester, 'composer-stop');
  });

  group('审批、排队、问题与待办并存：各有独立目标', () {
    Future<void> pumpAll(WidgetTester tester) async {
      narrow(tester);
      h.approvals = <Object>[_approval(31)];
      withQuestion(h);
      h.snapshot = snapshotOf(
        <Map<String, dynamic>>[userItem('u-1', '跑测试')],
        busy: true,
        queued: <Map<String, dynamic>>[
          <String, dynamic>{
            'id': 4,
            'mode': 'followUp',
            'preview': '稍后跑测试',
            'images': 0,
          },
        ],
      );
      h.todoList = fixtureTodos();
      await h.bind(capabilities: kInteractionCaps);
      quietChat(h);
      await tester.pumpWidget(h.build());
      await settle(tester);
    }

    testWidgets('同时可见；问题条只打开问题面板（不批准命令、不引导输入）', (tester) async {
      await pumpAll(tester);
      for (final key in <String>[
        'approval-bar',
        'question-bar',
        'queue-tray',
        'todo-entry',
        'composer-input',
      ]) {
        expect(find.byKey(Key(key)), findsOneWidget, reason: key);
      }
      await tester.tap(find.byKey(const Key('question-bar')));
      await transition(tester);
      expect(find.byKey(const Key('question-sheet')), findsOneWidget);
      expect(find.byKey(const Key('approval-allow-31')), findsNothing);
      expect(find.byKey(const Key('todo-sheet')), findsNothing);
      // 在问题面板里回答，不会产生审批决定或引导。
      h.api.on('questions.respond', (_) => questionJson(status: 'skipped'));
      await tester.tap(find.byKey(const Key('question-skip')));
      await settle(tester);
      expect(h.api.callsOf('questions.respond'), hasLength(1));
      expect(h.api.callsOf('approvals.decide'), isEmpty);
      expect(h.api.callsOf('chat.steer'), isEmpty);
      expect(h.api.callsOf('chat.withdraw'), isEmpty);
      expect(h.api.callsOf('chat.submit'), isEmpty);
    });

    testWidgets('审批、排队、待办各自独立：不会弹出问题面板，同一时刻只有一个完整面板', (tester) async {
      await pumpAll(tester);
      await tester.tap(find.byKey(const Key('approval-bar')));
      await transition(tester);
      expect(find.byKey(const Key('approval-allow-31')), findsOneWidget);
      expect(find.byKey(const Key('question-sheet')), findsNothing);
      await tester.tapAt(const Offset(10, 10));
      await transition(tester);

      h.api.on(
        'chat.steer',
        (_) => <String, dynamic>{'result': 'steered', 'id': 9},
      );
      await tester.tap(find.byKey(const Key('queued-steer-4')));
      await settle(tester);
      expect(h.api.callsOf('chat.steer'), hasLength(1));
      expect(h.api.callsOf('questions.respond'), isEmpty);
      expect(find.byKey(const Key('question-sheet')), findsNothing);

      await tester.tap(find.byKey(const Key('todo-entry')));
      await transition(tester);
      expect(find.byKey(const Key('todo-sheet')), findsOneWidget);
      expect(find.byKey(const Key('question-sheet')), findsNothing);
      expect(find.byKey(const Key('approval-allow-31')), findsNothing);
      expect(h.api.callsOf('approvals.decide'), isEmpty);
    });

    testWidgets('停止与返回始终可达：问题等待时仍可停止运行', (tester) async {
      await pumpAll(tester);
      h.api.on('chat.abort', (_) => <String, dynamic>{'accepted': true});
      expectTouch(tester, 'composer-stop');
      await tester.tap(find.byKey(const Key('composer-stop')));
      await settle(tester);
      expect(h.api.callsOf('chat.abort'), hasLength(1));
      expect(h.api.callsOf('questions.respond'), isEmpty);
    });
  });
}
