import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/rpc/rpc_client.dart';

import '../../helpers/chat_harness.dart';

void main() {
  late ChatHarness h;

  setUp(() => h = ChatHarness());
  tearDown(() => h.dispose());

  testWidgets('错误与待确认堆叠在输入区上方，各自可操作且不遮挡输入框', (tester) async {
    await h.bind();
    h.api.on('chat.submit', (_) => throw kOffline);
    await tester.pumpWidget(h.build());
    await settle(tester);
    await tester.enterText(find.byKey(const Key('composer-input')), '第一条');
    await settle(tester);
    await tester.tap(find.byKey(const Key('composer-send')));
    await settle(tester);
    final pending = find.textContaining('待确认：第一条');
    expect(pending, findsOneWidget);

    h.api.on(
      'chat.submit',
      (_) => throw const MobileApiException('rejected', 'KEY_REQUIRED'),
    );
    await tester.enterText(find.byKey(const Key('composer-input')), '第二条');
    await settle(tester);
    await tester.tap(find.byKey(const Key('composer-send')));
    await settle(tester);

    final error = find.byKey(const Key('error-banner'));
    expect(error, findsOneWidget);
    final input = tester.getRect(find.byKey(const Key('composer-input')));
    final errorRect = tester.getRect(error);
    final pendingRect = tester.getRect(
      find.byKey(Key('pending-${h.chat.pending.first.requestId}')),
    );
    expect(errorRect.bottom, lessThanOrEqualTo(input.top));
    expect(pendingRect.bottom, lessThanOrEqualTo(input.top));
    expect(errorRect.height, lessThan(56));
    expect(h.chat.input.text, '第二条', reason: '被拒绝时保留草稿');

    // 关闭错误后待确认仍在，输入框可用。
    await tester.tap(find.byTooltip('关闭'));
    await settle(tester);
    expect(find.byKey(const Key('error-banner')), findsNothing);
    expect(pending, findsOneWidget);
    expect(
      tester.getRect(find.byKey(const Key('composer-input'))).height,
      greaterThan(0),
    );
    expect(h.api.callsOf('chat.submit'), hasLength(2), reason: '不自动重发');
  });
}
