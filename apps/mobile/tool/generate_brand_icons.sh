#!/usr/bin/env bash
# 由 assets/brand 下的 SVG 源图生成 Android 旧版位图与 iOS AppIcon。
# 依赖：rsvg-convert（brew install librsvg）、sips（macOS 自带）。
# Android 自适应图标的矢量前景 res/drawable/ic_launcher_foreground.xml 与 SVG 保持同一路径，改图标时需同步修改。
set -euo pipefail
cd "$(dirname "$0")/.."

ROUND=assets/brand/neko-icon-round.svg
SQUARE=assets/brand/neko-icon.svg
RES=android/app/src/main/res
APPICON=ios/Runner/Assets.xcassets/AppIcon.appiconset

android() { rsvg-convert -w "$2" -h "$2" "$ROUND" -o "$RES/mipmap-$1/ic_launcher.png"; }
android mdpi 48
android hdpi 72
android xhdpi 96
android xxhdpi 144
android xxxhdpi 192

# iOS 图标不允许 alpha 通道：经 jpeg 中转得到 RGB png。
ios() {
	local tmp
	tmp="$(mktemp -d)"
	rsvg-convert -w "$2" -h "$2" "$SQUARE" -o "$tmp/icon.png"
	sips -s format jpeg "$tmp/icon.png" --out "$tmp/icon.jpg" >/dev/null
	sips -s format png "$tmp/icon.jpg" --out "$APPICON/$1" >/dev/null
	rm -rf "$tmp"
}
for entry in \
	Icon-App-20x20@1x.png:20 Icon-App-20x20@2x.png:40 Icon-App-20x20@3x.png:60 \
	Icon-App-29x29@1x.png:29 Icon-App-29x29@2x.png:58 Icon-App-29x29@3x.png:87 \
	Icon-App-40x40@1x.png:40 Icon-App-40x40@2x.png:80 Icon-App-40x40@3x.png:120 \
	Icon-App-60x60@2x.png:120 Icon-App-60x60@3x.png:180 \
	Icon-App-76x76@1x.png:76 Icon-App-76x76@2x.png:152 Icon-App-83.5x83.5@2x.png:167 \
	Icon-App-1024x1024@1x.png:1024; do
	ios "${entry%%:*}" "${entry##*:}"
done
echo "done"
