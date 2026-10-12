/** Installation happens on the gateway host, which may differ from the browser. */
export function fileSearchInstallHelp(platform: NodeJS.Platform = process.platform): string {
	const docs = "https://github.com/sharkdp/fd#installation";
	let install: string;
	switch (platform) {
		case "win32":
			install = "请执行：winget install sharkdp.fd。";
			break;
		case "darwin":
			install = "请执行：brew install fd。";
			break;
		case "linux":
			install = `Debian/Ubuntu 请执行：sudo apt install fd-find。其他发行版请参考：${docs} 。`;
			break;
		default:
			install = `安装方法请参考：${docs} 。`;
	}
	return `未找到 fd 或 fdfind，暂时无法使用 @ 文件补全。请在运行 neko 的电脑上安装。${install}安装后重新打开终端并重启 neko。`;
}
