import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:neko_mobile/core/pairing/pairing_models.dart';
import 'package:neko_mobile/core/pairing/pairing_text.dart';
import 'package:neko_mobile/features/connect/scan_controller.dart';

/// 1.2 MainActivity 提供的系统设置通道。
const MethodChannel kSettingsChannel = MethodChannel(
  'dev.neko.harness.mobile/settings',
);

const String kOpenAppDetailsSettingsMethod = 'openAppDetailsSettings';

Future<void> openAppDetailsSettings() async {
  try {
    await kSettingsChannel.invokeMethod<void>(kOpenAppDetailsSettingsMethod);
  } on MissingPluginException {
    // 非 Android 环境（如测试）：忽略。
  } on PlatformException {
    // 设置页无法打开时静默失败，页面有其他入口可用。
  }
}

/// 扫描器构造器：生产用 MobileScanner；测试注入假实现。
typedef ScannerBuilder = Widget Function({
  Key? key,
  required void Function(String code) onDetected,
  required void Function() onCameraError,
});

ScannerBuilder _defaultScannerBuilder() {
  return ({key, required onDetected, required onCameraError}) {
    return MobileScanner(
      key: key,
      onDetect: (capture) {
        final raw = capture.barcodes.firstOrNull?.rawValue;
        if (raw != null) {
          onDetected(raw);
        }
      },
      errorBuilder: (context, error) {
        // 相机错误可能随 MobileScanner 的构建同步上报；回调推迟到当前帧结束后，
        // 避免在 build 期间触发 ScanController 通知 → setState during build。
        scheduleMicrotask(onCameraError);
        return const SizedBox.shrink();
      },
    );
  };
}

final scannerBuilderProvider = Provider<ScannerBuilder>(
  (ref) => _defaultScannerBuilder(),
);

final scanControllerProvider = Provider<ScanController>((ref) {
  throw UnimplementedError('scanControllerProvider 必须在应用根部或测试中覆盖');
});

class ScanPage extends ConsumerStatefulWidget {
  const ScanPage({super.key});

  @override
  ConsumerState<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends ConsumerState<ScanPage> {
  final TextEditingController _pasteController = TextEditingController();
  int _scannerKey = 0;
  bool _lastCameraActive = true;
  late final ScanController _controller;

  @override
  void initState() {
    super.initState();
    // dispose 中不能用 ref，缓存到字段。
    _controller = ref.read(scanControllerProvider);
    _controller.addListener(_onStateChanged);
  }

  void _onStateChanged(ScanState state) {
    if (!mounted) {
      return;
    }
    setState(() {
      final active = state is ScanCamera && state.cameraActive;
      if (active && !_lastCameraActive) {
        _scannerKey++;
      }
      _lastCameraActive = active;
    });
  }

  @override
  void dispose() {
    _controller.removeListener(_onStateChanged);
    _pasteController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scannerBuilder = ref.watch(scannerBuilderProvider);
    final state = _controller.state;

    return Scaffold(
      appBar: AppBar(title: const Text('连接电脑')),
      body: switch (state) {
        ScanCamera() => _buildCamera(_controller, scannerBuilder, state),
        ScanConfirm() => _buildConfirm(state.target),
        ScanPairing() => const Center(child: CircularProgressIndicator()),
        ScanPairingDone() => _buildDone(state.computer),
        ScanFailed() => _buildFailed(state.failure),
      },
    );
  }

  Widget _buildCamera(
    ScanController controller,
    ScannerBuilder scannerBuilder,
    ScanCamera state,
  ) {
    return Column(
      children: <Widget>[
        Expanded(
          child: state.cameraActive
              ? scannerBuilder(
                  key: ObjectKey(_scannerKey),
                  onDetected: controller.onScannedText,
                  onCameraError: controller.markCameraUnavailable,
                )
              : const Center(child: Icon(Icons.videocam_off, size: 64)),
        ),
        if (!state.cameraActive)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              children: <Widget>[
                const Text('相机不可用或权限被拒绝，可在系统设置中开启相机权限。'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  alignment: WrapAlignment.center,
                  children: <Widget>[
                    FilledButton.tonal(
                      key: const Key('open-settings-button'),
                      onPressed: openAppDetailsSettings,
                      child: const Text('打开应用设置'),
                    ),
                    FilledButton.tonal(
                      key: const Key('retry-camera-button'),
                      onPressed: controller.retryCamera,
                      child: const Text('重试相机'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        if (state.lastError != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              state.lastError!.message,
              key: const Key('scan-error-text'),
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        _PastePanel(controller: controller, pasteController: _pasteController),
      ],
    );
  }

  Widget _buildConfirm(PairingTarget target) {
    final controller = _controller;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(
            '连接 ${target.name}？',
            key: const Key('confirm-name'),
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Text(
            '${target.endpoint.host}:${target.endpoint.port}',
            key: const Key('confirm-endpoint'),
          ),
          Text(
            '证书指纹 ${target.fingerprint.substring(0, 12)}…',
            key: const Key('confirm-fingerprint'),
          ),
          const SizedBox(height: 24),
          FilledButton(
            key: const Key('confirm-pair-button'),
            onPressed: controller.confirm,
            child: const Text('确认连接'),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            key: const Key('confirm-back-button'),
            onPressed: controller.backToCamera,
            child: const Text('返回'),
          ),
        ],
      ),
    );
  }

  Widget _buildDone(PairedComputer computer) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text('已配对 ${computer.serverName}', key: const Key('done-title')),
          const SizedBox(height: 8),
          const Text('正在建立连接，详情见首页。', key: Key('done-subtitle')),
          const SizedBox(height: 24),
          FilledButton(
            key: const Key('done-home-button'),
            onPressed: () => context.go('/'),
            child: const Text('完成'),
          ),
        ],
      ),
    );
  }

  Widget _buildFailed(ScanFailure failure) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(
            failure.message,
            key: const Key('failed-message'),
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
          const SizedBox(height: 24),
          FilledButton.tonal(
            key: const Key('failed-back-button'),
            onPressed: ref.read(scanControllerProvider).backToCamera,
            child: const Text('返回'),
          ),
        ],
      ),
    );
  }
}

class _PastePanel extends ConsumerWidget {
  const _PastePanel({required this.controller, required this.pasteController});

  final ScanController controller;
  final TextEditingController pasteController;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: <Widget>[
          Expanded(
            child: TextField(
              key: const Key('paste-field'),
              controller: pasteController,
              decoration: const InputDecoration(
                labelText: '粘贴配对文本',
                border: OutlineInputBorder(),
              ),
              onSubmitted: (_) => _submit(),
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            key: const Key('paste-submit-button'),
            onPressed: _submit,
            child: const Text('配对'),
          ),
        ],
      ),
    );
  }

  void _submit() {
    final text = pasteController.text.trim();
    if (text.isEmpty) {
      return;
    }
    // 失败时保留草稿文本，便于修正后重试。
    controller.onScannedText(text);
  }
}
