import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
import { isKeyRelease, isKeyRepeat, matchesKey } from "@earendil-works/pi-tui";
import type { ImageFile } from "@neko-harness/core/image-transfer";

const exec = promisify(execFile);
export function imagePaths(text: string): string[] | null {
	const paths: string[] = [];
	let word = "",
		quote = "",
		escaped = false;
	for (const c of text.trim()) {
		if (escaped) {
			word += c;
			escaped = false;
		} else if (c === "\\" && quote !== "'") {
			escaped = true;
		} else if (quote) {
			if (c === quote) quote = "";
			else word += c;
		} else if (c === '"' || c === "'") quote = c;
		else if (/\s/.test(c)) {
			if (word) {
				paths.push(word);
				word = "";
			}
		} else word += c;
	}
	if (quote || escaped) return null;
	if (word) paths.push(word);
	return paths.length && paths.every((p) => /\.(png|jpe?g|webp)$/i.test(p)) ? paths : null;
}
export async function readImageFile(path: string, cwd: string): Promise<ImageFile> {
	const full = resolve(cwd, path.startsWith("~/") ? homedir() + path.slice(1) : path);
	const info = await stat(full);
	if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error("Image must be a file no larger than 20 MiB");
	const bytes = await readFile(full);
	const after = await stat(full);
	if (bytes.length !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs)
		throw new Error("Image changed while reading");
	const mimeType = /\.png$/i.test(full) ? "image/png" : /\.webp$/i.test(full) ? "image/webp" : "image/jpeg";
	return { name: basename(full), mimeType, bytes };
}
async function command(file: string, args: string[], encoding: "utf8" | "buffer" = "utf8") {
	return (await exec(file, args, { timeout: 2000, maxBuffer: 30 * 1024 * 1024, encoding })).stdout;
}
export async function clipboard(
	options: { platform?: string; wayland?: boolean; command?: typeof command } = {},
): Promise<{ paths?: string[]; image?: ImageFile; text?: string }> {
	const run = options.command ?? command;
	const platform = options.platform ?? process.platform;
	if (platform === "darwin") {
		const files = await run("osascript", [
			"-e",
			'try\nset fs to the clipboard as «class furl»\nreturn POSIX path of fs\non error\nreturn ""\nend try',
		]).catch(() => "");
		if (String(files).trim())
			return /\.(png|jpe?g|webp)$/i.test(String(files).trim())
				? { paths: [String(files).trim()] }
				: { text: String(files).trim() };
		const image = String(
			await run("osascript", ["-e", 'try\nreturn the clipboard as «class PNGf»\non error\nreturn ""\nend try']).catch(
				() => "",
			),
		);
		const hex = /«data PNGf([0-9A-Fa-f]+)»/.exec(image)?.[1];
		if (hex) return { image: { name: "Clipboard.png", mimeType: "image/png", bytes: Buffer.from(hex, "hex") } };
		return { text: String(await run("pbpaste", [])) };
	}
	if (platform === "win32") {
		const value = String(
			await run("powershell.exe", [
				"-NoProfile",
				"-STA",
				"-Command",
				'Add-Type -AssemblyName System.Windows.Forms; $i=[Windows.Forms.Clipboard]::GetImage(); if($i){$m=New-Object IO.MemoryStream; $i.Save($m,[Drawing.Imaging.ImageFormat]::Png); "IMAGE:"+[Convert]::ToBase64String($m.ToArray());$i.Dispose();$m.Dispose()}else{Get-Clipboard -Raw}',
			]),
		);
		if (value.startsWith("IMAGE:"))
			return {
				image: { name: "Clipboard.png", mimeType: "image/png", bytes: Buffer.from(value.slice(6).trim(), "base64") },
			};
		return { text: value };
	}
	const wayland = options.wayland ?? !!process.env.WAYLAND_DISPLAY;
	const tool = wayland ? "wl-paste" : "xclip";
	try {
		const bytes = await run(
			tool,
			wayland ? ["--type", "image/png"] : ["-selection", "clipboard", "-t", "image/png", "-o"],
			"buffer",
		);
		if (bytes.length) return { image: { name: "Clipboard.png", mimeType: "image/png", bytes: Buffer.from(bytes) } };
	} catch {}
	return { text: String(await run(tool, wayland ? ["--no-newline"] : ["-selection", "clipboard", "-o"])) };
}

export function isClipboardShortcut(data: string, platform: string = process.platform): boolean {
	return !isKeyRelease(data) && !isKeyRepeat(data) && matchesKey(data, platform === "win32" ? "alt+v" : "ctrl+v");
}
