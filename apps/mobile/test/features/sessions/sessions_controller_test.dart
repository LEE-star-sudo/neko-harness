import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/rpc/connection_manager.dart';
import 'package:neko_mobile/core/rpc/rpc_client.dart';
import 'package:neko_mobile/core/storage/key_value_store.dart';
import 'package:neko_mobile/core/storage/prefs_store.dart';
import 'package:neko_mobile/features/chat/chat_controller.dart';
import 'package:neko_mobile/features/sessions/sessions_controller.dart';
import 'package:neko_mobile/ui/widgets/markdown_view.dart';

import '../../helpers/chat_harness.dart';
import '../../helpers/fake_api.dart';
import '../../helpers/fake_rpc_client.dart';

void main() {
  test('恢复上次工作区；搜索带 query；连续新建只调用一次', () async {
    final h = ChatHarness();
    addTearDown(h.dispose);
    await h.prefs.set(PrefKeys.workspace('srv'), '/b/neko');
    await h.bind(attach: null);
    final sessions = h.app.sessions;
    expect(sessions.workspace, '/b/neko');
    expect(h.api.callsOf('sessions.list').last?['workspace'], '/b/neko');

    sessions.search('登录');
    await Future<void>.delayed(const Duration(milliseconds: 300));
    expect(h.api.callsOf('sessions.list').last?['query'], '登录');

    var created = 0;
    h.api.on('sessions.create', (_) async {
      created++;
      await Future<void>.delayed(const Duration(milliseconds: 20));
      return <String, dynamic>{
        'id': '9',
        'workspace': '/b/neko',
        'title': '',
        'preview': '',
        'lastUsedAt': 0,
      };
    });
    final results = await Future.wait(<Future<Object?>>[
      sessions.create(),
      sessions.create(),
    ]);
    expect(created, 1);
    expect(results.first, same(results.last));
  });

  test('上次会话失效时回退到同工作区最近的会话', () async {
    final prefs = InMemoryPrefsStore();
    await prefs.set(PrefKeys.session('srv'), 'gone-1');
    final api = FakeMobileApi()
      ..on(
        'workspaces.list',
        (_) => <String, dynamic>{
          'workspaces': <Object>[
            <String, dynamic>{'root': '/a', 'name': 'a'},
          ],
        },
      )
      ..on(
        'sessions.list',
        (_) => <String, dynamic>{
          'sessions': <Object>[
            <String, dynamic>{
              'id': '5',
              'workspace': '/a',
              'title': 't',
              'preview': '',
              'lastUsedAt': 1,
            },
          ],
          'nextCursor': '50',
        },
      )
      ..on('approvals.list', (_) => <String, dynamic>{'approvals': <Object>[]})
      ..on('chat.attach', (params) {
        if (params!['sessionId'] == 'gone-1') {
          throw const MobileApiException('gone', 'archived');
        }
        return <String, dynamic>{
          'subscriptionId': 'chat-1',
          'sessionId': params['sessionId'],
          'snapshot': snapshotOf(<Map<String, dynamic>>[]),
        };
      });
    final sessions = SessionsController(prefs: prefs);
    final chat = ChatController(prefs: prefs);
    addTearDown(sessions.dispose);
    addTearDown(chat.dispose);
    await sessions.bind(api, 'srv');
    await chat.bind(api, 'srv');
    final target = await sessions.restoreSession();
    expect(target, 'gone-1');
    await chat.attach(target!);
    expect(chat.phase, ChatPhase.error);
    await chat.attach(sessions.sessions.first.id);
    expect(chat.sessionId, '5');
    expect(chat.canControl, isTrue);
  });

  test('已保存电脑：配对加入索引，可切换与忘记', () async {
    final store = InMemoryKeyValueStore();
    final manager = ConnectionManager(
      store: store,
      rpcFactory: (_) => FakeRpcClient(),
    );
    addTearDown(manager.dispose);
    final other = <String, dynamic>{
      ...kDummyComputer.toJson(),
      'serverId': 'srv-2',
      'serverName': '笔记本',
    };
    await store.write(
      'neko.computer.srv-1',
      jsonEncode(kDummyComputer.toJson()),
    );
    await store.write('neko.computer.srv-2', jsonEncode(other));
    await manager.connectPaired(kDummyComputer);
    await manager.switchTo('srv-2');
    expect(manager.computer?.serverId, 'srv-2');
    expect((await manager.savedComputers()).map((c) => c.serverId), <String>[
      'srv-1',
      'srv-2',
    ]);
    await manager.forget('srv-2');
    expect(manager.state, isA<NekoConnIdle>());
    expect((await manager.savedComputers()).map((c) => c.serverId), <String>[
      'srv-1',
    ]);
    expect(await store.read('neko.computer.srv-2'), isNull);
  });

  test('Markdown 转义只作用于代码之外的 HTML', () {
    expect(escapeHtml('a <b>x</b>'), r'a \<b>x\</b>');
    expect(escapeHtml('`<i>` and <i>'), r'`<i>` and \<i>');
    expect(escapeHtml('```\n<div>\n```\n<p>'), '```\n<div>\n```\n\\<p>');
  });
}
