import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/features/chat/chat_page.dart';
import 'package:neko_mobile/features/sessions/session_list_page.dart';

import '../../helpers/chat_harness.dart';
import '../../helpers/fake_api.dart';

Map<String, dynamic> _delegationRound({String status = 'running'}) =>
    <String, dynamic>{
      'taskId': 9,
      'callId': 'call_9',
      'agentId': 'agent-4',
      'round': 1,
      'role': 'explore',
      'title': '看看测试',
      'status': status,
      'approvalCount': 1,
      'readonly': false,
      'createdAt': 0,
      'endedAt': null,
    };

Map<String, dynamic> _approval() => <String, dynamic>{
  'id': 31,
  'version': 'v1',
  'taskId': 9,
  'agentId': 'agent-4',
  'title': '看看测试',
  'command': 'bun test ${'--very-long-flag ' * 40}',
  'cwd': '/a/neko',
  'timeoutSeconds': 120,
  'requestedAt': 0,
};

Future<void> transition(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  late ChatHarness h;

  setUp(() => h = ChatHarness());
  tearDown(() => h.dispose());

  testWidgets('渲染转录与 Markdown，HTML 原样显示', (tester) async {
    h.snapshot = snapshotOf(<Map<String, dynamic>>[
      userItem('u-1', '你好'),
      assistantItem('a-2', '<b>不是粗体</b>\n\n```\n<div>代码</div>\n```'),
    ]);
    await h.bind();
    await tester.pumpWidget(h.build());
    await settle(tester);
    expect(find.text('修复登录页'), findsOneWidget);
    expect(
      find.textContaining('<b>不是粗体</b>', findRichText: true),
      findsOneWidget,
    );
    expect(
      find.textContaining('<div>代码</div>', findRichText: true),
      findsOneWidget,
    );
  });

  testWidgets('审批条打开面板并决定；新请求不清空草稿', (tester) async {
    h.approvals = <Object>[_approval()];
    h.snapshot = snapshotOf(
      <Map<String, dynamic>>[userItem('u-1', '跑测试')],
      busy: true,
      subagents: <Map<String, dynamic>>[_delegationRound()],
    );
    await h.bind();
    await tester.pumpWidget(h.build());
    await settle(tester);
    await tester.enterText(find.byKey(const Key('composer-input')), '还没写完的草稿');
    h.approvals = <Object>[
      _approval(),
      <String, dynamic>{..._approval(), 'id': 32},
    ];
    h.api.notify('approvals.changed', <String, dynamic>{
      'subscriptionId': 'chat-1',
      'revision': 2,
    });
    await settle(tester);
    expect(find.text('2 个命令等待审批'), findsOneWidget);
    expect(h.chat.input.text, '还没写完的草稿');

    h.api.on('approvals.decide', (_) => <String, dynamic>{'status': 'denied'});
    await tester.tap(find.byKey(const Key('approval-bar')));
    await transition(tester);
    expect(find.textContaining('目录：/a/neko'), findsWidgets);
    expect(find.textContaining('超时：120 秒'), findsWidgets);
    await tester.ensureVisible(find.byKey(const Key('approval-allow-31')));
    await transition(tester);
    await tester.tap(find.byKey(const Key('approval-allow-31')));
    await settle(tester);
    // 被其他端抢先拒绝：显示实际终态。
    expect(find.text('已拒绝'), findsOneWidget);
    expect(h.api.callsOf('approvals.decide').single?['decision'], 'allow');
  });

  testWidgets('附着失败显示错误面板，修复后可重试成功', (tester) async {
    h.api.on('chat.attach', (_) => throw kOffline);
    await h.bind();
    await tester.pumpWidget(h.build());
    await settle(tester);
    expect(find.byKey(const Key('attach-error')), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);

    h.api.on(
      'chat.attach',
      (params) => <String, dynamic>{
        'subscriptionId': 'chat-2',
        'sessionId': params!['sessionId'],
        'snapshot': h.snapshot,
      },
    );
    await tester.tap(find.byKey(const Key('attach-retry')));
    await settle(tester);
    expect(find.byKey(const Key('attach-error')), findsNothing);
    expect(find.text('你好'), findsOneWidget);
  });

  testWidgets('离线时控制禁用但草稿可编辑；待确认只能重试或放弃', (tester) async {
    await h.bind();
    h.api.on('chat.submit', (_) => throw kOffline);
    await tester.pumpWidget(h.build());
    await settle(tester);
    await tester.enterText(find.byKey(const Key('composer-input')), '发出去');
    await settle(tester);
    await tester.tap(find.byKey(const Key('composer-send')));
    await settle(tester);
    expect(find.textContaining('待确认：发出去'), findsOneWidget);
    expect(h.api.callsOf('chat.submit'), hasLength(1));

    h.chat.unbind();
    await settle(tester);
    final send = tester.widget<IconButton>(
      find.byKey(const Key('composer-send')),
    );
    expect(send.onPressed, isNull);
    await tester.enterText(find.byKey(const Key('composer-input')), '离线草稿');
    expect(h.chat.input.text, '离线草稿');
    final retry = find.byKey(
      Key('pending-retry-${h.chat.pending.single.requestId}'),
    );
    expect(tester.widget<TextButton>(retry).onPressed, isNull);
    await settle(tester);
  });

  testWidgets('忙碌时可选择引导并停止', (tester) async {
    h.snapshot = snapshotOf(<Map<String, dynamic>>[
      userItem('u-1', 'x'),
    ], busy: true);
    await h.bind();
    h.api
      ..on(
        'chat.submit',
        (_) => <String, dynamic>{'accepted': true, 'queued': false},
      )
      ..on('chat.abort', (_) => <String, dynamic>{'accepted': true});
    await tester.pumpWidget(h.build());
    await settle(tester);
    await tester.tap(find.byKey(const Key('composer-steer')));
    await tester.enterText(find.byKey(const Key('composer-input')), '换个方向');
    await settle(tester);
    await tester.tap(find.byKey(const Key('composer-send')));
    await settle(tester);
    expect(h.api.callsOf('chat.submit').single?['mode'], 'steer');
    await tester.tap(find.byKey(const Key('composer-stop')));
    await settle(tester);
    expect(h.api.callsOf('chat.abort'), hasLength(1));
  });

  testWidgets('委派卡打开子详情；返回不停止、不发送并保留主草稿', (tester) async {
    h.snapshot = snapshotOf(
      <Map<String, dynamic>>[
        userItem('u-1', '调查'),
        <String, dynamic>{
          'key': 't-call_9',
          'type': 'tool',
          'tool': <String, dynamic>{
            'callId': 'call_9',
            'name': 'subagent',
            'summary': 'explore',
            'status': 'running',
          },
        },
      ],
      busy: true,
      subagents: <Map<String, dynamic>>[_delegationRound()],
    );
    h.api.on(
      'subagents.open',
      (_) => <String, dynamic>{
        'subagentSubscriptionId': 'agent-1',
        'agentId': 'agent-4',
        'snapshot': <String, dynamic>{
          ...snapshotOf(
            <Map<String, dynamic>>[assistantItem('c-1', '子 agent 的输出')],
            busy: true,
            subagents: <Map<String, dynamic>>[
              {
                ..._delegationRound(),
                'usage': <String, dynamic>{'totalTokens': 2048},
              },
            ],
            historyBefore: 'entry:3',
          ),
          'readonly': false,
        },
      },
    );
    h.api.on('subagents.close', (_) => null);
    await h.bind();
    await tester.pumpWidget(h.build());
    await settle(tester);
    await tester.enterText(find.byKey(const Key('composer-input')), '主会话草稿');
    await tester.tap(find.byKey(const Key('open-subagent-9')));
    await transition(tester);
    expect(find.text('子 agent 的输出'), findsOneWidget);
    expect(find.byKey(const Key('round-9')), findsOneWidget);
    expect(find.textContaining('2.0k'), findsOneWidget);
    expect(h.api.callsOf('subagents.open').single?['agentId'], 'agent-4');

    await tester.pageBack();
    await transition(tester);
    expect(h.api.callsOf('subagents.close'), hasLength(1));
    expect(h.api.callsOf('subagents.stop'), isEmpty);
    expect(h.api.callsOf('chat.submit'), isEmpty);
    expect(h.chat.input.text, '主会话草稿');
  });

  testWidgets('子详情停止当前轮需确认并绑定 taskId', (tester) async {
    h.snapshot = snapshotOf(
      <Map<String, dynamic>>[userItem('u-1', 'x')],
      busy: true,
      subagents: <Map<String, dynamic>>[_delegationRound()],
    );
    h.api
      ..on(
        'subagents.open',
        (_) => <String, dynamic>{
          'subagentSubscriptionId': 'agent-1',
          'agentId': 'agent-4',
          'snapshot': snapshotOf(<Map<String, dynamic>>[], busy: true),
        },
      )
      ..on('subagents.stop', (_) => <String, dynamic>{'stopped': true})
      ..on('subagents.close', (_) => null);
    await h.bind();
    await tester.pumpWidget(h.build());
    await settle(tester);
    final context = tester.element(find.byType(Scaffold).first);
    openSubagent(context, h.chat.transcript.status.subagents.single);
    await transition(tester);
    await tester.tap(find.byKey(const Key('subagent-stop')));
    await transition(tester);
    await tester.tap(find.byKey(const Key('subagent-stop-confirm')));
    await settle(tester);
    expect(h.api.callsOf('subagents.stop').single?['taskId'], 9);
  });

  testWidgets('会话列表：同名工作区显示完整路径，连续点新建只创建一个', (tester) async {
    var created = 0;
    h.api.on('sessions.create', (_) async {
      created++;
      await Future<void>.delayed(const Duration(milliseconds: 50));
      return <String, dynamic>{
        'id': '99',
        'workspace': '/a/neko',
        'title': '',
        'preview': '',
        'lastUsedAt': 0,
        'archived': false,
      };
    });
    await h.bind();
    await tester.pumpWidget(h.build(home: const SessionListPage()));
    await settle(tester);
    expect(find.text('/a/neko'), findsOneWidget);
    final fab = find.byKey(const Key('sessions-new'));
    await tester.tap(fab);
    await tester.tap(fab, warnIfMissed: false);
    await tester.pump(const Duration(milliseconds: 100));
    await settle(tester);
    expect(created, 1);

    await tester.pumpWidget(h.build());
    await settle(tester);
    await tester.tap(find.byTooltip('Open navigation menu'));
    await transition(tester);
    expect(find.text('/a/neko'), findsOneWidget);
    expect(find.text('/b/neko'), findsOneWidget);
  });

  testWidgets('大字体、窄屏与深色主题下无溢出', (tester) async {
    tester.view.physicalSize = const Size(360 * 3, 640 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    h.approvals = <Object>[_approval()];
    h.snapshot = snapshotOf(<Map<String, dynamic>>[
      userItem(
        'u-1',
        '/Users/kirineko/${'very-long-directory-name/' * 10}file.ts',
      ),
      assistantItem(
        'a-2',
        '| a | b | c |\n|---|---|---|\n| ${'长' * 80} | 2 | 3 |\n\n```\n${'x' * 300}\n```',
      ),
      <String, dynamic>{
        'key': 't-1',
        'type': 'tool',
        'tool': <String, dynamic>{
          'callId': 'c1',
          'name': 'bash',
          'summary': 'cat ${'/deep/path' * 20}',
          'status': 'error',
          'result': 'x' * 400,
        },
      },
    ], busy: true);
    await h.bind();
    for (final mode in <ThemeMode>[ThemeMode.light, ThemeMode.dark]) {
      await tester.pumpWidget(h.build(mode: mode, textScale: 2));
      await settle(tester);
      expect(tester.takeException(), isNull);
    }
    final send = tester.getSize(find.byKey(const Key('composer-send')));
    expect(send.width, greaterThanOrEqualTo(48));
    expect(send.height, greaterThanOrEqualTo(48));
  });

  test('相对时间格式', () {
    final now = DateTime(2026, 10, 15, 12);
    expect(relativeTime(now.millisecondsSinceEpoch - 30 * 1000, now), '刚刚');
    expect(
      relativeTime(now.millisecondsSinceEpoch - 3 * 3600 * 1000, now),
      '3 小时前',
    );
  });
}
