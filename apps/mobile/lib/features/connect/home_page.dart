import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:neko_mobile/core/rpc/connection_manager.dart';
import 'package:neko_mobile/core/rpc/rpc_client.dart';
import 'package:neko_mobile/features/app_controller.dart';
import 'package:neko_mobile/features/chat/chat_page.dart';
import 'package:neko_mobile/ui/neko_icons.dart';
import 'package:neko_mobile/ui/theme.dart';

/// M0 首页：展示当前连接状态；未配对时引导扫码。
/// 前后台切换回到前台时触发连接恢复。
class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(connectionManagerProvider).onForeground();
    }
  }

  @override
  Widget build(BuildContext context) {
    final manager = ref.watch(connectionManagerProvider);
    final app = ref.watch(appControllerOrNullProvider);
    return StreamBuilder<NekoConnectionState>(
      stream: manager.states,
      initialData: manager.state,
      builder: (context, snapshot) {
        final state = snapshot.data ?? const NekoConnIdle();
        // 就绪后进入会话；短暂断线时保留会话页（内容可读、控制禁用）。
        if (app != null &&
            (state is NekoConnReady ||
                (app.chat.sessionId != null &&
                    (state is NekoConnOffline ||
                        state is NekoConnRestoring ||
                        state is NekoConnConnecting)))) {
          return const ChatPage();
        }
        return _buildStatus(state);
      },
    );
  }

  Widget _buildStatus(NekoConnectionState state) {
    return Scaffold(
      appBar: AppBar(title: const Text('NekoAI')),
      body: Builder(
        builder: (context) {
          return switch (state) {
            NekoConnIdle() => _buildIdle(),
            NekoConnConnecting() => _buildPending('正在连接电脑…', 'connecting'),
            NekoConnRestoring() => _buildPending('正在恢复连接…', 'restoring'),
            NekoConnOffline(:final nextRetryIn) => _buildOffline(nextRetryIn),
            NekoConnReady(:final computer, :final hello) => _buildReady(
              computer.serverName,
              hello,
            ),
            NekoConnRevoked() => _buildTerminal(
              '设备授权已被电脑撤销',
              '电脑端已移除本设备。如需重新控制，请重新扫码配对。',
              'revoked',
            ),
            NekoConnTrustChanged() => _buildTerminal(
              '电脑证书与配对指纹不符',
              '电脑可能重新生成了证书。请重新扫码配对以建立信任。',
              'trust-changed',
            ),
            NekoConnIncompatible() => _buildTerminal(
              '应用与电脑协议版本不兼容',
              '请升级手机应用或电脑端后重试。',
              'incompatible',
            ),
          };
        },
      ),
    );
  }

  Widget _buildIdle() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          const Text('尚未连接电脑', key: Key('home-idle-text')),
          const SizedBox(height: NekoSpace.md),
          FilledButton(
            key: const Key('home-go-scan'),
            onPressed: () => context.go('/scan'),
            child: const Text('扫码连接'),
          ),
        ],
      ),
    );
  }

  Widget _buildPending(String message, String keyPrefix) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          const CircularProgressIndicator(),
          const SizedBox(height: NekoSpace.md),
          Text(message, key: Key('home-$keyPrefix-text')),
          const SizedBox(height: NekoSpace.md),
          OutlinedButton(
            key: const Key('home-pending-scan'),
            onPressed: () {
              ref.read(connectionManagerProvider).stopToScan();
              context.go('/scan');
            },
            child: const Text('返回扫码'),
          ),
        ],
      ),
    );
  }

  Widget _buildOffline(Duration nextRetryIn) {
    final seconds = (nextRetryIn.inMilliseconds / 1000).toStringAsFixed(1);
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          const NekoIcon(NekoIcons.cloudOff, size: 48),
          const SizedBox(height: NekoSpace.md),
          Text('网络不可达或电脑已离线', key: const Key('home-offline-text')),
          Text('$seconds 秒后自动重试', key: const Key('home-offline-retry')),
          const SizedBox(height: NekoSpace.sm),
          const Text('电脑上的任务不受影响，恢复后自动继续。'),
          const SizedBox(height: NekoSpace.md),
          FilledButton.tonal(
            key: const Key('home-retry-now'),
            onPressed: () => ref.read(connectionManagerProvider).onForeground(),
            child: const Text('立即重试'),
          ),
          const SizedBox(height: NekoSpace.sm),
          OutlinedButton(
            key: const Key('home-offline-scan'),
            onPressed: () {
              ref.read(connectionManagerProvider).stopToScan();
              context.go('/scan');
            },
            child: const Text('返回扫码'),
          ),
        ],
      ),
    );
  }

  Widget _buildReady(String computerName, RpcHelloResult hello) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Text('已连接 $computerName', key: const Key('home-ready-title')),
          const SizedBox(height: NekoSpace.sm),
          Text(
            'server ${hello.serverName} · api v${hello.apiVersion}',
            key: const Key('home-ready-hello'),
          ),
          Text(
            'gateway ${hello.gatewayVersion} · capabilities ${hello.capabilities.length}',
            key: const Key('home-ready-capabilities'),
          ),
          const SizedBox(height: NekoSpace.lg),
          OutlinedButton(
            key: const Key('home-ready-scan'),
            onPressed: () {
              ref.read(connectionManagerProvider).stopToScan();
              context.go('/scan');
            },
            child: const Text('返回扫码'),
          ),
        ],
      ),
    );
  }

  Widget _buildTerminal(String title, String guidance, String keyPrefix) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Text(title, key: Key('home-$keyPrefix-title')),
          const SizedBox(height: NekoSpace.sm),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: NekoSpace.xl),
            child: Text(
              guidance,
              key: Key('home-$keyPrefix-guidance'),
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: NekoSpace.lg),
          FilledButton(
            key: Key('home-$keyPrefix-scan'),
            onPressed: () {
              ref.read(connectionManagerProvider).stopToScan();
              context.go('/scan');
            },
            child: const Text('重新扫码配对'),
          ),
        ],
      ),
    );
  }
}
