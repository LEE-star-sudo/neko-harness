import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:neko_mobile/core/pairing/pairing_text.dart';

DateTime fixedClock() => DateTime.utc(2026, 10, 15, 12, 0, 0);

int get _fixedNowMs => fixedClock().millisecondsSinceEpoch;

String _b64url(Object? value) {
  if (value is List<int>) {
    return base64Url.encode(value).replaceAll('=', '');
  }
  return base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
}

String buildPairingText(Map<String, Object?> json, {int version = 1}) {
  return 'nekopair:$version:${_b64url(json)}';
}

Map<String, Object?> validPayload({
  String? sid,
  String? name,
  String? ep,
  String? fp,
  String? code,
  Object? exp,
}) {
  return <String, Object?>{
    'v': 1,
    'sid': sid ?? 'srv-1',
    'name': name ?? '工作机',
    'ep': ep ?? 'https://192.168.1.20:8323',
    'fp': fp ?? 'ab' * 32,
    'code': code ?? _b64url(List<int>.filled(32, 7)),
    'exp': exp ?? (_fixedNowMs + 120000),
  };
}

void main() {
  group('合法文本', () {
    test('完整字段解析成功，fp 归一小写，endpoint 规范化', () {
      final result = parsePairingText(
        buildPairingText(validPayload(fp: 'AB' * 32)),
        clock: fixedClock,
      );
      expect(result, isA<PairingTextOk>());
      final target = (result as PairingTextOk).target;
      expect(target.serverId, 'srv-1');
      expect(target.name, '工作机');
      expect(target.endpoint.toString(), 'https://192.168.1.20:8323');
      expect(target.fingerprint, 'ab' * 32);
      expect(
        target.pairUri.toString(),
        'https://192.168.1.20:8323/mobile/v1/pair',
      );
    });

    test('name 恰好 64 字符、端口边界 1/65535、code 32 字节均可接受', () {
      final ok = parsePairingText(
        buildPairingText(
          validPayload(
            name: 'x' * 64,
            ep: 'https://255.255.255.255:1',
            code: _b64url(List<int>.filled(32, 0)),
          ),
        ),
        clock: fixedClock,
      );
      expect(ok, isA<PairingTextOk>());
      final ok2 = parsePairingText(
        buildPairingText(validPayload(ep: 'https://0.0.0.0:65535')),
        clock: fixedClock,
      );
      expect(ok2, isA<PairingTextOk>());
    });

    test('ep 以斜杠结尾可接受', () {
      final result = parsePairingText(
        buildPairingText(validPayload(ep: 'https://192.168.1.20:8323/')),
        clock: fixedClock,
      );
      expect(result, isA<PairingTextOk>());
      expect((result as PairingTextOk).target.endpoint.path, isEmpty);
    });

    test('支持周围空白', () {
      final result = parsePairingText(
        '  ${buildPairingText(validPayload())}\n',
        clock: fixedClock,
      );
      expect(result, isA<PairingTextOk>());
    });
  });

  group('invalid', () {
    void expectInvalid(String text, [String? why]) {
      final result = parsePairingText(text, clock: fixedClock);
      expect(result, isA<PairingTextError>(), reason: why);
      expect(
        (result as PairingTextError).kind,
        PairingTextErrorKind.invalid,
        reason: why,
      );
    }

    test('前缀错误', () {
      expectInvalid('http://example.com');
      expectInvalid('nekopairx:1:abc');
    });

    test('版本段缺失或非数字', () {
      expectInvalid('nekopair:');
      expectInvalid('nekopair::abc');
      expectInvalid('nekopair:v1:abc');
    });

    test('base64/UTF-8/JSON 损坏', () {
      expectInvalid('nekopair:1:not-base64!!');
      expectInvalid(
        'nekopair:1:${base64Url.encode(<int>[0xff, 0xfe]).replaceAll('=', '')}',
      );
      expectInvalid('nekopair:1:${_b64url(<int>[1, 2, 3])}');
    });

    test('sid 缺失或为空', () {
      final missing = validPayload()..remove('sid');
      expectInvalid(buildPairingText(missing));
      expectInvalid(buildPairingText(validPayload(sid: '')));
    });

    test('name 缺失或超过 64 字符', () {
      final missing = validPayload()..remove('name');
      expectInvalid(buildPairingText(missing));
      expectInvalid(buildPairingText(validPayload(name: 'x' * 65)));
    });

    test('ep 协议/端口/host 边界', () {
      expectInvalid(
        buildPairingText(validPayload(ep: 'http://192.168.1.20:8323')),
      );
      expectInvalid(buildPairingText(validPayload(ep: 'https://192.168.1.20')));
      expectInvalid(
        buildPairingText(validPayload(ep: 'https://192.168.1.20:0')),
      );
      expectInvalid(
        buildPairingText(validPayload(ep: 'https://192.168.1.20:65536')),
      );
      expectInvalid(
        buildPairingText(validPayload(ep: 'https://192.168.1.20:abc')),
      );
      expectInvalid(
        buildPairingText(validPayload(ep: 'https://example.com:8323')),
      );
      expectInvalid(
        buildPairingText(validPayload(ep: 'https://256.1.1.1:8323')),
      );
      expectInvalid(
        buildPairingText(validPayload(ep: 'https://01.2.3.4:8323')),
      );
      expectInvalid(
        buildPairingText(validPayload(ep: 'https://1.2.3.4.5:8323')),
      );
    });

    test('ep 携带 userinfo/query/fragment/path 一律拒绝', () {
      expectInvalid(
        buildPairingText(validPayload(ep: 'https://user@192.168.1.20:8323')),
      );
      expectInvalid(
        buildPairingText(validPayload(ep: 'https://192.168.1.20:8323?x=1')),
      );
      expectInvalid(
        buildPairingText(validPayload(ep: 'https://192.168.1.20:8323#x')),
      );
      expectInvalid(
        buildPairingText(validPayload(ep: 'https://192.168.1.20:8323/mobile')),
      );
    });

    test('fp 形态', () {
      expectInvalid(buildPairingText(validPayload(fp: 'ab' * 31)));
      expectInvalid(buildPairingText(validPayload(fp: 'ab' * 33)));
      expectInvalid(buildPairingText(validPayload(fp: 'gb' * 32)));
    });

    test('code 形态', () {
      expectInvalid(buildPairingText(validPayload(code: '!!!')));
      expectInvalid(
        buildPairingText(validPayload(code: _b64url(List<int>.filled(31, 0)))),
      );
      expectInvalid(
        buildPairingText(validPayload(code: _b64url(List<int>.filled(33, 0)))),
      );
    });

    test('exp 形态', () {
      final missing = validPayload()..remove('exp');
      expectInvalid(buildPairingText(missing));
      expectInvalid(buildPairingText(validPayload(exp: '123')));
      expectInvalid(buildPairingText(validPayload(exp: 1234.5)));
      expectInvalid(buildPairingText(validPayload(exp: 0)));
      expectInvalid(buildPairingText(validPayload(exp: -5)));
    });
  });

  group('不支持的版本与过期', () {
    test('v=2 / v=99 → unsupportedVersion，且载荷垃圾也优先报版本', () {
      final r2 = parsePairingText('nekopair:2:garbage', clock: fixedClock);
      expect(r2, isA<PairingTextError>());
      final e2 = r2 as PairingTextError;
      expect(e2.kind, PairingTextErrorKind.unsupportedVersion);
      expect(e2.unsupportedVersion, 2);

      final r99 = parsePairingText(
        buildPairingText(validPayload(), version: 99),
        clock: fixedClock,
      );
      expect((r99 as PairingTextError).unsupportedVersion, 99);
    });

    test('exp 早于或等于当前时间 → expired', () {
      final before = parsePairingText(
        buildPairingText(validPayload(exp: _fixedNowMs - 1)),
        clock: fixedClock,
      );
      expect((before as PairingTextError).kind, PairingTextErrorKind.expired);

      final equal = parsePairingText(
        buildPairingText(validPayload(exp: _fixedNowMs)),
        clock: fixedClock,
      );
      expect((equal as PairingTextError).kind, PairingTextErrorKind.expired);
    });
  });
}
