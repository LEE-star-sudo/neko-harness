import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/api/models.dart';
import 'package:neko_mobile/features/chat/transcript.dart';

import '../../helpers/fake_api.dart';

void main() {
  group('协议 fixtures（与 gateway 共用）', () {
    test('chat.attach 快照解析为条目、状态、引用与流式区', () {
      final result = asJson(
        fixtureMessage('chat-attach-result.json')['result'],
      );
      final transcript = Transcript()
        ..applySnapshot(asJson(result['snapshot']));
      expect(transcript.items.map((e) => e.type), <ChatItemType>[
        ChatItemType.user,
        ChatItemType.assistant,
        ChatItemType.tool,
        ChatItemType.user,
      ]);
      expect(transcript.items[1].refFor('text')?.bytes, 9216);
      expect(transcript.items[2].tool?.status, ToolStatus.done);
      expect(transcript.items[3].images.single.entryId, 1029);
      expect(transcript.status.busy, isTrue);
      expect(transcript.status.subagents.single.callId, 'call_7');
      expect(transcript.status.approvalCount, 1);
      expect(transcript.streaming?.toolCalls.single.name, 'read');
      expect(transcript.historyBefore, 'u-1026');
    });

    test('chat.patch 补丁追加流式文本并更新条目', () {
      final result = asJson(
        fixtureMessage('chat-attach-result.json')['result'],
      );
      final transcript = Transcript()
        ..applySnapshot(asJson(result['snapshot']));
      final patch = asJson(
        fixtureMessage('chat-patch-notification.json')['params'],
      );
      expect(
        transcript.applyPatch(<String, dynamic>{...patch, 'seq': 1}),
        isTrue,
      );
      expect(transcript.streaming?.text, '正在汇总测试结果：131 个测试全部通过。');
      expect(transcript.items.last.key, 't-call_10');
    });

    test('审批与子 agent fixtures 可解析', () {
      final approvals = asJsonList(
        asJson(
          fixtureMessage('approvals-list-result.json')['result'],
        )['approvals'],
      ).map(Approval.fromJson).toList();
      expect(approvals.first.timeoutSeconds, 300);
      expect(approvals.first.version, isNotEmpty);
      final opened = asJson(
        fixtureMessage('subagents-open-result.json')['result'],
      );
      final transcript = Transcript()
        ..applySnapshot(asJson(opened['snapshot']));
      expect(transcript.historyBefore, 'entry:3');
      expect(transcript.status.subagents.single.usage?.totalTokens, 1060);
    });
  });

  test('upsert 替换已有条目、追加新条目；序号不连续要求重取', () {
    final transcript = Transcript()
      ..applySnapshot(
        snapshotOf(<Map<String, dynamic>>[
          userItem('u-1', 'a'),
          assistantItem('a-2', 'b'),
        ]),
      );
    expect(
      transcript.applyPatch(<String, dynamic>{
        'seq': 1,
        'upserts': <Map<String, dynamic>>[
          assistantItem('a-2', 'b2'),
          userItem('u-3', 'c'),
        ],
      }),
      isTrue,
    );
    expect(transcript.items.map((e) => e.text), <String>['a', 'b2', 'c']);
    expect(
      transcript.applyPatch(<String, dynamic>{'seq': 1, 'upserts': <Object>[]}),
      isTrue,
    );
    expect(
      transcript.applyPatch(<String, dynamic>{'seq': 3, 'upserts': <Object>[]}),
      isFalse,
    );
  });

  test('向上翻页插入开头且去重', () {
    final transcript = Transcript()
      ..applySnapshot(
        snapshotOf(<Map<String, dynamic>>[
          userItem('u-3', 'c'),
        ], historyBefore: 'u-3'),
      );
    transcript.prepend(<ChatItem>[
      ChatItem.fromJson(userItem('u-1', 'a')),
      ChatItem.fromJson(userItem('u-3', 'dup')),
    ], null);
    expect(transcript.items.map((e) => e.key), <String>['u-1', 'u-3']);
    expect(transcript.items.last.text, 'c');
    expect(transcript.hasOlder, isFalse);
  });

  test('流式区整段替换与结束', () {
    final transcript = Transcript()
      ..applySnapshot(snapshotOf(<Map<String, dynamic>>[], busy: true));
    transcript.applyPatch(<String, dynamic>{
      'seq': 1,
      'upserts': <Object>[],
      'streaming': <String, dynamic>{
        'text': 'x',
        'thinking': '',
        'textOmitted': 0,
        'thinkingOmitted': 0,
        'toolCalls': <Object>[],
      },
    });
    transcript.applyPatch(<String, dynamic>{
      'seq': 2,
      'upserts': <Object>[],
      'streamingAppend': <String, dynamic>{'text': 'yz'},
    });
    expect(transcript.streaming?.text, 'xyz');
    transcript.applyPatch(<String, dynamic>{
      'seq': 3,
      'upserts': <Object>[],
      'streaming': null,
    });
    expect(transcript.streaming, isNull);
  });
}
