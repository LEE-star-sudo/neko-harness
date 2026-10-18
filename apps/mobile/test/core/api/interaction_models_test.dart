import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/api/models.dart';
import 'package:neko_mobile/features/chat/transcript.dart';

import '../../helpers/fake_api.dart';

/// 待办 / 提问协议 fixtures（与 gateway 共用的锚点）的 Dart 解析对拍。
void main() {
  group('hello 能力', () {
    test('hello-result fixture 声明 todos / questions，且旧能力保持不变', () {
      final result = asJson(fixtureMessage('hello-result.json')['result']);
      final capabilities = (result['capabilities'] as List).cast<String>();
      expect(capabilities, containsAll(<String>['todos', 'questions']));
      expect(
        capabilities,
        containsAll(<String>['workspaces', 'sessions', 'chat', 'approvals']),
      );
    });
  });

  group('todos', () {
    test('todos.get 结果：有序条目、三态与 revision', () {
      final list = TodoList.fromJson(
        asJson(fixtureMessage('todos-get-result.json')['result']),
      );
      expect(list.revision, 4);
      expect(list.items.map((e) => e.id), <String>[
        'inspect',
        'design',
        'verify',
      ]);
      expect(list.items.map((e) => e.status), <TodoStatus>[
        TodoStatus.completed,
        TodoStatus.inProgress,
        TodoStatus.pending,
      ]);
      expect(list.items[1].text, '设计迁移步骤');
      expect((list.completed, list.total), (1, 3));
    });

    test('未知状态按待办处理，缺失字段不抛错', () {
      final item = TodoItem.fromJson(<String, dynamic>{
        'id': 'x',
        'text': 't',
        'status': 'blocked',
      });
      expect(item.status, TodoStatus.pending);
      expect(TodoList.fromJson(<String, dynamic>{}).items, isEmpty);
    });

    test('todos.changed 通知形状与请求形状', () {
      final params = asJson(
        fixtureMessage('todos-changed-notification.json')['params'],
      );
      expect(params['subscriptionId'], 'chat-1a2b3c4d-1');
      expect(params['revision'], 5);
      final request = fixtureMessage('todos-get-request.json');
      expect(request['method'], 'todos.get');
      expect(asJson(request['params']).keys, <String>['subscriptionId']);
    });
  });

  group('questions', () {
    test('questions.list 结果：revision 与摘要', () {
      final list = QuestionList.fromJson(
        asJson(fixtureMessage('questions-list-result.json')['result']),
      );
      expect(list.revision, 5);
      final summary = list.pending.single;
      expect(summary.id, 612);
      expect(summary.version, '6f1d0c52-8c1e-4f0d-9d55-1a2f3b4c5d6e');
      expect(summary.preview, '使用哪种数据库？');
      expect(summary.multiple, isFalse);
      expect(summary.optionCount, 3);
      expect(summary.createdAt, 1730100000000);
    });

    test('questions.get 结果：选项、推荐仅是标记、答案为空', () {
      final record = QuestionRecord.fromJson(
        asJson(fixtureMessage('questions-get-result.json')['result']),
      );
      expect(record.pending, isTrue);
      expect(record.answer, isNull);
      expect(record.settledAt, isNull);
      expect(record.options.map((o) => o.id), <String>['pg', 'my', 'lite']);
      expect(record.options.first.recommended, isTrue);
      expect(record.options[1].recommended, isFalse);
      expect(record.options[2].description, '嵌入式，无需服务');
      expect(record.callId, 'call_612');
    });

    test('questions.respond 结果：终态、答案与按标签还原', () {
      final record = QuestionRecord.fromJson(
        asJson(fixtureMessage('questions-respond-result.json')['result']),
      );
      expect(record.status, QuestionStatus.answered);
      expect(record.answer?.optionIds, <String>['lite']);
      expect(record.answer?.text, '先用 SQLite，之后再迁移');
      expect(record.answerLabels, <String>['SQLite']);
      expect(record.settledAt, 1730100060000);
    });

    test('questions.respond 请求：answer 形状含选项与文字', () {
      final request = fixtureMessage('questions-respond-request.json');
      final params = asJson(request['params']);
      expect(params['version'], isNotEmpty);
      expect(asJson(params['response']), <String, dynamic>{
        'kind': 'answer',
        'optionIds': <String>['lite'],
        'text': '先用 SQLite，之后再迁移',
      });
    });

    test('questions.changed 通知形状', () {
      final params = asJson(
        fixtureMessage('questions-changed-notification.json')['params'],
      );
      expect(params['subscriptionId'], 'chat-1a2b3c4d-1');
      expect(params['revision'], 6);
    });

    test('终态与未知状态：skipped、cancelled；未知终态按已取消处理', () {
      QuestionStatus statusOf(String raw) =>
          QuestionRecord.fromJson(<String, dynamic>{'id': 1, 'status': raw})
              .status;
      expect(statusOf('pending'), QuestionStatus.pending);
      expect(statusOf('skipped'), QuestionStatus.skipped);
      expect(statusOf('cancelled'), QuestionStatus.cancelled);
      expect(statusOf('expired'), QuestionStatus.cancelled);
    });

    test('题目已不再列出的选项 id 退回 id 本身', () {
      final record = QuestionRecord.fromJson(<String, dynamic>{
        'id': 1,
        'status': 'answered',
        'options': <Object>[
          <String, dynamic>{'id': 'a', 'label': 'A'},
        ],
        'answer': <String, dynamic>{
          'optionIds': <String>['a', 'gone'],
        },
      });
      expect(record.answerLabels, <String>['A', 'gone']);
    });
  });

  group('状态摘要与会话列表', () {
    test('chat.attach fixture：todos / questions 摘要', () {
      final result = asJson(
        fixtureMessage('chat-attach-result.json')['result'],
      );
      final transcript = Transcript()
        ..applySnapshot(asJson(result['snapshot']));
      final todos = transcript.status.todos!;
      expect((todos.revision, todos.count, todos.completed), (4, 3, 1));
      final questions = transcript.status.questions!;
      expect((questions.revision, questions.pendingCount), (5, 1));
    });

    test('缺省摘要 = 不支持；存在且为 0 = 支持但为空', () {
      final old = ChatStatus.fromJson(<String, dynamic>{'busy': false});
      expect(old.todos, isNull);
      expect(old.questions, isNull);
      final empty = ChatStatus.fromJson(<String, dynamic>{
        'todos': <String, dynamic>{'revision': 0, 'count': 0, 'completed': 0},
        'questions': <String, dynamic>{'revision': 0, 'pendingCount': 0},
      });
      expect(empty.todos?.count, 0);
      expect(empty.questions?.pendingCount, 0);
    });

    test('chat.patch 的 status 携带摘要', () {
      final transcript = Transcript()
        ..applySnapshot(snapshotOf(<Map<String, dynamic>>[]));
      expect(transcript.status.todos, isNull);
      transcript.applyPatch(<String, dynamic>{
        'seq': 1,
        'upserts': <Object>[],
        'status': <String, dynamic>{
          'busy': true,
          'todos': <String, dynamic>{'revision': 2, 'count': 2, 'completed': 1},
        },
      });
      expect(transcript.status.todos?.count, 2);
    });

    test('sessions.list fixture：awaitingAnswer 可选', () {
      final sessions = asJsonList(
        asJson(
          fixtureMessage('sessions-list-result.json')['result'],
        )['sessions'],
      ).map(SessionSummary.fromJson).toList();
      expect(sessions.first.awaitingAnswer, isTrue);
      expect(sessions.first.waitingForAnswer, isTrue);
      expect(sessions.last.awaitingAnswer, isNull);
      expect(sessions.last.waitingForAnswer, isFalse);
    });
  });

  group('tool.interaction', () {
    // fixtures 没有带 interaction 的工具条目，形状取自 MobileToolInteractionSchema。
    ToolInfo toolWith(Map<String, dynamic> interaction) =>
        ToolInfo.fromJson(<String, dynamic>{
          'callId': 'c',
          'name': 'ask_user',
          'summary': 's',
          'status': 'done',
          'interaction': interaction,
        });

    test('ask_user：状态、选项标签与答案', () {
      final tool = toolWith(<String, dynamic>{
        'kind': 'ask_user',
        'id': 612,
        'question': '使用哪种数据库？',
        'multiple': false,
        'options': <Object>[
          <String, dynamic>{
            'id': 'pg',
            'label': 'PostgreSQL',
            'recommended': true,
          },
          <String, dynamic>{'id': 'lite', 'label': 'SQLite'},
        ],
        'status': 'answered',
        'optionIds': <String>['lite'],
        'labels': <String>['SQLite'],
        'text': null,
      });
      final ask = tool.interaction as AskUserInteraction;
      expect(ask.id, 612);
      expect(ask.status, QuestionStatus.answered);
      expect(ask.labels, <String>['SQLite']);
      expect(ask.text, isNull);
      expect(ask.options.first.recommended, isTrue);
    });

    test('todo：动作、revision 与进度', () {
      final tool = toolWith(<String, dynamic>{
        'kind': 'todo',
        'action': 'replace',
        'revision': 4,
        'completed': 1,
        'total': 3,
      });
      final todo = tool.interaction as TodoInteraction;
      expect(
        (todo.action, todo.revision, todo.completed, todo.total),
        ('replace', 4, 1, 3),
      );
    });

    test('其他工具与未知 kind 没有 interaction', () {
      expect(
        ToolInfo.fromJson(<String, dynamic>{'callId': 'c', 'name': 'bash'})
            .interaction,
        isNull,
      );
      expect(toolWith(<String, dynamic>{'kind': 'future'}).interaction, isNull);
    });
  });
}
