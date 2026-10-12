import { expect, it } from "bun:test";
import { fileSearchInstallHelp } from "../src/file-search-help.ts";

it.each([
	["win32", "winget install sharkdp.fd"],
	["darwin", "brew install fd"],
	["linux", "Debian/Ubuntu 请执行：sudo apt install fd-find"],
	["freebsd", "https://github.com/sharkdp/fd#installation"],
] as const)("provides installation guidance for the %s host", (platform, command) => {
	const help = fileSearchInstallHelp(platform);
	expect(help).toContain(command);
	expect(help).toContain("运行 neko 的电脑");
	expect(help).toContain("重新打开终端并重启 neko");
	if (platform === "linux") {
		expect(help).toContain("其他发行版");
		expect(help).toContain("https://github.com/sharkdp/fd#installation");
	}
});
