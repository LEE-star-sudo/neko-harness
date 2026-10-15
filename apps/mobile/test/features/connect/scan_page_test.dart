import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:neko_mobile/core/pairing/pairing_models.dart';
import 'package:neko_mobile/core/pairing/pairing_service.dart';
import 'package:neko_mobile/features/connect/scan_controller.dart';
import 'package:neko_mobile/features/connect/scan_page.dart';

import '../../helpers/fakes.dart';

String validPairingText({
  int version = 1,
  int expSeconds = 120,
  String name = '工作机',
}) {
  final payload = <String, Object?>{
    'v': version,
    'sid': 'srv-1',
    'name': name,
    'ep': 'https://192.168.1.20:8323',
    'fp': 'ab' * 32,
    'code': base64Url.encode(List<int>.filled(32, 7)).replaceAll('=', ''),
    'exp': DateTime.now()
        .add(Duration(seconds: expSeconds))
        .millisecondsSinceEpoch,
  };
  return 'nekopair:$version:${base64Url.encode(utf8.encode(jsonEncode(payload))).replaceAll('=', '')}';
}

class CapturedScanner {
  void Function(String code)? onDetected;
  void Function()? onCameraError;
  var buildCount = 0;
}

ScannerBuilder capturingScanner(CapturedScanner captured) {
  return ({key, required onDetected, required onCameraError}) {
    captured.onDetected = onDetected;
    captured.onCameraError = onCameraError;
    captured.buildCount++;
    return SizedBox(key: key);
  };
}

ScannerBuilder blankScanner() {
  return ({key, required onDetected, required onCameraError}) =>
      SizedBox(key: key);
}

Future<ScanController> pumpScanPage(
  WidgetTester tester, {
  required FakePairingService service,
  CapturedScanner? scanner,
  ScanController? controller,
}) async {
  final scanController =
      controller ??
      ScanController(pairingService: service, onPaired: (_) async {});
  final router = GoRouter(
    initialLocation: '/scan',
    routes: <RouteBase>[
      GoRoute(
        path: '/',
        builder: (context, state) => const Scaffold(body: Text('home-root')),
      ),
      GoRoute(path: '/scan', builder: (context, state) => const ScanPage()),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        scanControllerProvider.overrideWithValue(scanController),
        scannerBuilderProvider.overrideWithValue(
          scanner != null ? capturingScanner(scanner) : blankScanner(),
        ),
      ],
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  return scanController;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('粘贴非法文本显示错误且保留草稿', (tester) async {
    final service = FakePairingService();
    await pumpScanPage(tester, service: service);

    await tester.enterText(
      find.byKey(const Key('paste-field')),
      'not-a-pairing-text',
    );
    await tester.tap(find.byKey(const Key('paste-submit-button')));
    await tester.pump();

    expect(find.byKey(const Key('scan-error-text')), findsOneWidget);
    expect(find.textContaining('nekopair'), findsWidgets);
    expect(service.calls, 0);
    // 草稿保留。
    expect(find.text('not-a-pairing-text'), findsOneWidget);
  });

  testWidgets('粘贴过期与不支持版本文本区分提示', (tester) async {
    final service = FakePairingService();
    final controller = await pumpScanPage(tester, service: service);

    controller.onScannedText(validPairingText(expSeconds: -10));
    await tester.pump();
    expect(find.textContaining('过期'), findsOneWidget);

    controller.backToCamera();
    controller.onScannedText(validPairingText(version: 2));
    await tester.pump();
    expect(find.textContaining('不支持'), findsOneWidget);
  });

  testWidgets('扫码后先确认再配对：确认前不发起请求', (tester) async {
    final service = FakePairingService();
    final scanner = CapturedScanner();
    await pumpScanPage(tester, service: service, scanner: scanner);

    scanner.onDetected!(validPairingText());
    await tester.pump();

    // 展示目标电脑名称，等待确认。
    expect(find.byKey(const Key('confirm-name')), findsOneWidget);
    expect(find.textContaining('工作机'), findsWidgets);
    expect(service.calls, 0, reason: '确认前不得发起配对请求');

    await tester.tap(find.byKey(const Key('confirm-pair-button')));
    await tester.pumpAndSettle();

    expect(service.calls, 1);
    expect(find.byKey(const Key('done-title')), findsOneWidget);
    expect(find.textContaining('已配对 工作机'), findsOneWidget);
  });

  testWidgets('重复扫码回调只触发一次受理，不会重复 POST', (tester) async {
    final service = FakePairingService();
    final scanner = CapturedScanner();
    await pumpScanPage(tester, service: service, scanner: scanner);

    final text = validPairingText();
    scanner.onDetected!(text);
    scanner.onDetected!(text);
    scanner.onDetected!(validPairingText(name: '另一台'));
    await tester.pump();

    // 仍在确认页：重复回调未覆盖目标、未触发请求。
    expect(find.byKey(const Key('confirm-name')), findsOneWidget);
    expect(find.textContaining('工作机'), findsWidgets);
    expect(service.calls, 0);

    await tester.tap(find.byKey(const Key('confirm-pair-button')));
    await tester.pumpAndSettle();
    expect(service.calls, 1);
  });

  testWidgets('配对成功后移交连接管理', (tester) async {
    final service = FakePairingService();
    PairedComputer? handedOff;
    final scanner = CapturedScanner();
    final controller = ScanController(
      pairingService: service,
      onPaired: (computer) async {
        handedOff = computer;
      },
    );
    await pumpScanPage(
      tester,
      service: service,
      scanner: scanner,
      controller: controller,
    );

    scanner.onDetected!(validPairingText());
    await tester.pump();
    await tester.tap(find.byKey(const Key('confirm-pair-button')));
    await tester.pumpAndSettle();

    expect(handedOff?.serverId, 'srv-1');
    expect(find.byKey(const Key('done-home-button')), findsOneWidget);

    await tester.tap(find.byKey(const Key('done-home-button')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('done-title')), findsNothing);
  });

  testWidgets('配对中出现非配对类异常时进入失败页而不是一直转圈', (tester) async {
    final service = FakePairingService()..error = StateError('存储写入失败');
    final scanner = CapturedScanner();
    await pumpScanPage(tester, service: service, scanner: scanner);

    scanner.onDetected!(validPairingText());
    await tester.pump();
    await tester.tap(find.byKey(const Key('confirm-pair-button')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('failed-message')), findsOneWidget);
    expect(find.byKey(const Key('failed-back-button')), findsOneWidget);
  });

  testWidgets('相机不可用时显示引导，可打开应用设置与重试', (tester) async {
    final service = FakePairingService();
    final scanner = CapturedScanner();
    await pumpScanPage(tester, service: service, scanner: scanner);

    scanner.onCameraError!();
    await tester.pump();

    expect(find.textContaining('相机不可用或权限被拒绝'), findsOneWidget);
    expect(find.byKey(const Key('retry-camera-button')), findsOneWidget);

    const channel = MethodChannel('dev.neko.harness.mobile/settings');
    final binding = TestDefaultBinaryMessengerBinding.instance;
    final calls = <MethodCall>[];
    binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
      call,
    ) async {
      calls.add(call);
      return null;
    });
    addTearDown(
      () => binding.defaultBinaryMessenger.setMockMethodCallHandler(
        channel,
        null,
      ),
    );

    await tester.tap(find.byKey(const Key('open-settings-button')));
    await tester.pump();

    expect(calls, hasLength(1));
    expect(calls.single.method, 'openAppDetailsSettings');
  });

  testWidgets('配对网络失败显示可区分错误并可返回', (tester) async {
    final service = FakePairingService()
      ..error = const PairingNetworkException();
    final scanner = CapturedScanner();
    final controller = await pumpScanPage(
      tester,
      service: service,
      scanner: scanner,
    );

    scanner.onDetected!(validPairingText());
    await tester.pump();
    await tester.tap(find.byKey(const Key('confirm-pair-button')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('failed-message')), findsOneWidget);
    expect(find.textContaining('网络'), findsOneWidget);

    await tester.tap(find.byKey(const Key('failed-back-button')));
    await tester.pump();
    expect(controller.state, isA<ScanCamera>());
  });

  testWidgets('重试相机会重建扫描器', (tester) async {
    final service = FakePairingService();
    final scanner = CapturedScanner();
    await pumpScanPage(tester, service: service, scanner: scanner);

    scanner.onCameraError!();
    await tester.pump();
    expect(scanner.buildCount, 1, reason: '相机不可用时不重建扫描器');

    await tester.tap(find.byKey(const Key('retry-camera-button')));
    await tester.pump();
    expect(scanner.buildCount, 2);
  });
}
