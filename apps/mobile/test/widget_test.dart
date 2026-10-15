import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/rpc/connection_manager.dart';
import 'package:neko_mobile/core/storage/key_value_store.dart';
import 'package:neko_mobile/features/connect/scan_controller.dart';
import 'package:neko_mobile/features/connect/scan_page.dart';
import 'package:neko_mobile/main.dart';

import 'helpers/fakes.dart';

void main() {
  testWidgets('应用冒烟：无已配对记录时首页引导扫码', (tester) async {
    final store = InMemoryKeyValueStore();
    final manager = ConnectionManager(
      store: store,
      rpcFactory: (computer) => throw UnimplementedError('冒烟测试不发起连接'),
    );
    final controller = ScanController(
      pairingService: FakePairingService(),
      onPaired: (_) async {},
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          connectionManagerProvider.overrideWithValue(manager),
          scanControllerProvider.overrideWithValue(controller),
          scannerBuilderProvider.overrideWithValue(
            ({key, required onDetected, required onCameraError}) =>
                SizedBox(key: key),
          ),
        ],
        child: const NekoApp(),
      ),
    );
    await tester.pump();

    expect(find.text('NekoAI'), findsOneWidget);
    expect(find.byKey(const Key('home-idle-text')), findsOneWidget);
    expect(find.byKey(const Key('home-go-scan')), findsOneWidget);
    manager.dispose();
  });
}
