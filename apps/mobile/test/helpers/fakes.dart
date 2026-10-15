import 'package:neko_mobile/core/pairing/pairing_models.dart';
import 'package:neko_mobile/core/pairing/pairing_service.dart';
import 'package:neko_mobile/core/pairing/pairing_text.dart';

class FakePairingService implements PairingService {
  var calls = 0;
  PairingTarget? lastTarget;
  Object? error;
  PairedComputer? computer;

  @override
  Future<PairedComputer> pair(PairingTarget target) async {
    calls++;
    lastTarget = target;
    final failure = error;
    if (failure != null) {
      throw failure;
    }
    return computer ??
        PairedComputer(
          serverId: 'srv-1',
          serverName: '工作机',
          endpoint: 'https://192.168.1.20:8323',
          fingerprint: 'ab' * 32,
          deviceId: 'dev-1',
          credential: 'cred-1',
          grantRevision: 1,
          pairedAt: 0,
        );
  }
}
