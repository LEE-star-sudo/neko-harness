import 'package:flutter/material.dart';
import 'package:path_drawing/path_drawing.dart';

/// 单个线性图标：24x24 栅格上的 SVG 路径，圆头圆角描边。
///
/// 形状沿用 Web `Icon`（`packages/web/src/client/components/primitives.tsx`）的风格：
/// 少笔画、统一 1.6 线宽、不填充，缺失的图标按同一规则补绘。
@immutable
class NekoIconData {
  const NekoIconData(this.name, this.path, {this.strokeWidth = 1.6});

  final String name;
  final String path;
  final double strokeWidth;

  static const double grid = 24;
}

class NekoIcons {
  const NekoIcons._();

  static const plus = NekoIconData('plus', 'M12 5v14M5 12h14');
  static const close = NekoIconData('close', 'm6 6 12 12M6 18 18 6');
  static const check = NekoIconData('check', 'M5 12.5l4.5 4.5L19 7.5');
  static const search = NekoIconData(
    'search',
    'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  );
  static const more = NekoIconData(
    'more',
    'M5 12h.01M12 12h.01M19 12h.01',
    strokeWidth: 3,
  );
  static const trash = NekoIconData(
    'trash',
    'M4.5 7h15M9.5 7V4.5h5V7m-7.5 0 .8 13h8.4l.8-13',
  );
  static const chat = NekoIconData('chat', 'M4 4h16v12H9l-5 4z');
  static const folder = NekoIconData('folder', 'M3 6h6l2 2h10v11H3z');

  static const up = NekoIconData('up', 'm5 12 7-7 7 7M12 5v14');
  static const down = NekoIconData('down', 'm5 12 7 7 7-7M12 5v14');
  static const arrowLeft = NekoIconData('arrowLeft', 'M19 12H5m6-6-6 6 6 6');

  /// 品牌猫脸（与启动图标同形，24 栅格线性版）。
  static const cat = NekoIconData(
    'cat',
    'M2.8 17.6V6.4l.8-5.2 5.2 4q3.2-.8 6.4 0l5.2-4 .8 5.2v11.2q0 5.2-5.2 5.2H8Q2.8 22.8 2.8 17.6ZM10.4 16.4q1.6 1.4 3.2 0M8 12.4h.01M16 12.4h.01',
  );
  static const bolt = NekoIconData('bolt', 'M13 2 4 14h6l-1 8 9-12h-6l1-8z');
  static const menu = NekoIconData('menu', 'M4 7h16M4 12h10M4 17h16');
  static const chevronDown = NekoIconData('chevronDown', 'm8 10 4 4 4-4');
  static const chevronRight = NekoIconData('chevronRight', 'm10 8 4 4-4 4');
  static const chevronUp = NekoIconData('chevronUp', 'm8 14 4-4 4 4');
  static const unfold = NekoIconData('unfold', 'm8 9 4-4 4 4M8 15l4 4 4-4');
  static const external = NekoIconData(
    'external',
    'M14 4h6v6M20 4l-8 8M18 14v6H4V6h6',
  );
  static const list = NekoIconData(
    'list',
    'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  );

  static const monitor = NekoIconData(
    'monitor',
    'M3 4h18v12H3zM8 20h8M12 16v4',
  );
  static const scan = NekoIconData(
    'scan',
    'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 12h8',
  );
  static const cameraOff = NekoIconData(
    'cameraOff',
    'M3 7h11v10H3zM14 11l7-4v10l-7-4M3 3l18 18',
  );
  static const imageOff = NekoIconData('imageOff', 'M4 5h16v14H4zM4 5l16 14');

  static const dot = NekoIconData('dot', 'M12 12h.01', strokeWidth: 10);
  static const spinner = NekoIconData('spinner', 'M21 12a9 9 0 1 1-9-9');
  static const checkCircle = NekoIconData(
    'checkCircle',
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12.5l2.7 2.7L16 9.8',
  );
  static const alert = NekoIconData(
    'alert',
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 8v5M12 16h.01',
  );
  static const stop = NekoIconData(
    'stop',
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5h5v5h-5z',
  );
  static const block = NekoIconData(
    'block',
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM6 6l12 12',
  );
  static const cloudOff = NekoIconData(
    'cloudOff',
    'M5 18h12a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.5 9.3 4.5 4.5 0 0 0 5 18ZM3 3l18 18',
  );
  static const shieldAlert = NekoIconData(
    'shieldAlert',
    'M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6zM12 9v3M12 15h.01',
  );
  static const radioOff = NekoIconData(
    'radioOff',
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  );
  static const radioOn = NekoIconData(
    'radioOn',
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
  );
  static const checkboxOff = NekoIconData(
    'checkboxOff',
    'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z',
  );
  static const checkboxOn = NekoIconData(
    'checkboxOn',
    'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4ZM7.5 12.5l3 3 6-6.5',
  );
  static const help = NekoIconData(
    'help',
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.4 9.6a2.7 2.7 0 0 1 5.2.9c0 1.7-2.6 2.2-2.6 3.8M12 17h.01',
  );

  static const List<NekoIconData> all = <NekoIconData>[
    plus,
    close,
    check,
    search,
    more,
    trash,
    chat,
    folder,
    up,
    down,
    arrowLeft,
    cat,
    bolt,
    menu,
    chevronDown,
    chevronRight,
    chevronUp,
    unfold,
    external,
    list,
    monitor,
    scan,
    cameraOff,
    imageOff,
    dot,
    spinner,
    checkCircle,
    alert,
    stop,
    block,
    cloudOff,
    shieldAlert,
    radioOff,
    radioOn,
    checkboxOff,
    checkboxOn,
    help,
  ];
}

final Map<String, Path> _paths = <String, Path>{};

Path nekoIconPath(NekoIconData icon) =>
    _paths.putIfAbsent(icon.name, () => parseSvgPathData(icon.path));

/// 颜色、大小取自 [IconTheme]，因此在 `IconButton`、`ListTile` 等内置组件里与原 `Icon` 行为一致。
class NekoIcon extends StatelessWidget {
  const NekoIcon(
    this.icon, {
    super.key,
    this.size,
    this.color,
    this.semanticLabel,
  });

  final NekoIconData icon;
  final double? size;
  final Color? color;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final theme = IconTheme.of(context);
    var dimension = size ?? theme.size ?? 20;
    if (theme.applyTextScaling ?? false) {
      dimension = MediaQuery.textScalerOf(context).scale(dimension);
    }
    final base = color ?? theme.color ?? _fallback(context);
    final opacity = theme.opacity ?? 1;
    final resolved = opacity == 1
        ? base
        : base.withValues(alpha: base.a * opacity);
    // Center：父级强制更宽（如 InputDecoration 的 prefixIconConstraints）时，图标仍按 size 画成正方形，
    // 不能随父级被拉伸放大。
    Widget child = Center(
      widthFactor: 1,
      heightFactor: 1,
      child: SizedBox.square(
        dimension: dimension,
        child: CustomPaint(painter: _NekoIconPainter(icon, resolved)),
      ),
    );
    child = semanticLabel == null
        ? ExcludeSemantics(child: child)
        : Semantics(label: semanticLabel, image: true, child: child);
    return child;
  }

  static Color _fallback(BuildContext context) =>
      Theme.of(context).colorScheme.onSurface;
}

class _NekoIconPainter extends CustomPainter {
  const _NekoIconPainter(this.icon, this.color);

  final NekoIconData icon;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / NekoIconData.grid;
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = icon.strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..isAntiAlias = true;
    canvas
      ..save()
      ..scale(scale)
      ..drawPath(nekoIconPath(icon), paint)
      ..restore();
  }

  @override
  bool shouldRepaint(_NekoIconPainter old) =>
      old.icon != icon || old.color != color;
}
