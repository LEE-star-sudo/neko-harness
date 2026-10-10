import { execFile } from "node:child_process";

/** Ask the host's default browser to open the ready Web server, without a shell. */
export function openBrowser(url: string): Promise<void> {
	const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32.exe" : "xdg-open";
	const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
	return new Promise((resolve, reject) => {
		execFile(command, args, { timeout: 8000, windowsHide: true }, (error) => {
			if (error) reject(error);
			else resolve();
		});
	});
}
