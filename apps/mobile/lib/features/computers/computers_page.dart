import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:neko_mobile/core/pairing/pairing_models.dart';
import 'package:neko_mobile/core/rpc/connection_manager.dart';
import 'package:neko_mobile/features/app_controller.dart';
import 'package:neko_mobile/ui/theme.dart';

/// 已保存电脑（切换/忘记）与外观设置。
class ComputersPage extends ConsumerStatefulWidget {
  const ComputersPage({super.key});

  @override
  ConsumerState<ComputersPage> createState() => _ComputersPageState();
}

class _ComputersPageState extends ConsumerState<ComputersPage> {
  late Future<List<PairedComputer>> _computers = ref
      .read(connectionManagerProvider)
      .savedComputers();

  void _reload() => setState(() {
    _computers = ref.read(connectionManagerProvider).savedComputers();
  });

  Future<void> _forget(PairedComputer computer) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('忘记「${computer.serverName}」？'),
        content: const Text('将删除本机保存的凭据；再次控制需要重新扫码。电脑上的任务不受影响。'),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('取消'),
          ),
          FilledButton(
            key: const Key('forget-confirm'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('忘记'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(connectionManagerProvider).forget(computer.serverId);
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    final manager = ref.watch(connectionManagerProvider);
    final app = ref.watch(appControllerProvider);
    final tokens = NekoTokens.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('电脑与设置')),
      body: FutureBuilder<List<PairedComputer>>(
        future: _computers,
        builder: (context, snapshot) {
          final computers = snapshot.data ?? const <PairedComputer>[];
          return ListView(
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                child: Text(
                  '已配对的电脑',
                  style: TextStyle(color: tokens.textFaint),
                ),
              ),
              for (final computer in computers)
                ListTile(
                  key: Key('computer-${computer.serverId}'),
                  leading: Icon(
                    computer.serverId == manager.computer?.serverId
                        ? Icons.radio_button_checked
                        : Icons.radio_button_unchecked,
                  ),
                  title: Text(computer.serverName),
                  subtitle: Text(Uri.parse(computer.endpoint).host),
                  onTap: computer.serverId == manager.computer?.serverId
                      ? null
                      : () async {
                          final navigator = Navigator.of(context);
                          await manager.switchTo(computer.serverId);
                          navigator.pop();
                        },
                  trailing: IconButton(
                    key: Key('forget-${computer.serverId}'),
                    tooltip: '忘记这台电脑',
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () => _forget(computer),
                  ),
                ),
              ListTile(
                leading: const Icon(Icons.qr_code_scanner),
                title: const Text('扫码配对新电脑'),
                onTap: () {
                  manager.stopToScan();
                  context.go('/scan');
                },
              ),
              const Divider(),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: Text('外观', style: TextStyle(color: tokens.textFaint)),
              ),
              ValueListenableBuilder<ThemeMode>(
                valueListenable: app.themeMode,
                builder: (context, mode, _) => RadioGroup<ThemeMode>(
                  groupValue: mode,
                  onChanged: (value) {
                    if (value != null) app.setThemeMode(value);
                  },
                  child: const Column(
                    children: <Widget>[
                      RadioListTile<ThemeMode>(
                        value: ThemeMode.system,
                        title: Text('跟随系统'),
                      ),
                      RadioListTile<ThemeMode>(
                        value: ThemeMode.light,
                        title: Text('浅色'),
                      ),
                      RadioListTile<ThemeMode>(
                        value: ThemeMode.dark,
                        title: Text('深色'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
