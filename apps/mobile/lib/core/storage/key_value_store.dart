import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// 键值存储抽象：生产用 flutter_secure_storage，测试用内存实现。
abstract class KeyValueStore {
  Future<String?> read(String key);

  Future<void> write(String key, String value);

  Future<void> delete(String key);
}

class InMemoryKeyValueStore implements KeyValueStore {
  final Map<String, String> _data = <String, String>{};

  @override
  Future<String?> read(String key) async => _data[key];

  @override
  Future<void> write(String key, String value) async {
    _data[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    _data.remove(key);
  }
}

class FlutterSecureKeyValueStore implements KeyValueStore {
  FlutterSecureKeyValueStore([FlutterSecureStorage? storage])
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// 存储键命名空间。键名不含任何秘密，秘密只出现在 value 中。
abstract final class StorageKeys {
  static const String deviceId = 'neko.deviceId';

  /// 最近/当前已配对电脑的 serverId（值为 serverId 字符串）。
  static const String lastComputer = 'neko.computer.last';

  static String pendingPairing(String serverId) =>
      'neko.pairing.pending.$serverId';

  static String pairedComputer(String serverId) => 'neko.computer.$serverId';

  /// 全部已保存电脑的 serverId（JSON 数组）。
  static const String computerIndex = 'neko.computer.index';
}
