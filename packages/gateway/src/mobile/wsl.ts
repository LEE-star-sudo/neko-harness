import { execFile } from "node:child_process";
import { accessSync, constants, readFileSync } from "node:fs";
import { type NetworkInterfaceInfo, networkInterfaces } from "node:os";
import { delimiter, join } from "node:path";
import { isIpv4Literal, mobileListenCandidates } from "./network.ts";

/** WSL 探测与 Windows 侧局域网地址发现（design D1/D4）。 */

export type WslEnvironment = {
	/** `powershell.exe` 的路径；互操作不可用或找不到时为 undefined。 */
	readonly powershell: string | undefined;
};

export type WslProbeDeps = {
	readonly platform: NodeJS.Platform;
	readonly env: NodeJS.ProcessEnv;
	readonly readProcVersion: () => string | undefined;
	readonly isExecutable: (path: string) => boolean;
};

const POWERSHELL_FALLBACK = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";

const defaultProbeDeps: WslProbeDeps = {
	platform: process.platform,
	env: process.env,
	readProcVersion() {
		try {
			return readFileSync("/proc/version", "utf8");
		} catch {
			return undefined;
		}
	},
	isExecutable(path) {
		try {
			accessSync(path, constants.X_OK);
			return true;
		} catch {
			return false;
		}
	},
};

/** 返回 WSL 环境信息；不在 WSL 内返回 undefined。 */
export function detectWsl(overrides: Partial<WslProbeDeps> = {}): WslEnvironment | undefined {
	const deps = { ...defaultProbeDeps, ...overrides };
	if (deps.platform !== "linux") return undefined;
	const { env } = deps;
	const version = deps.readProcVersion() ?? "";
	const inWsl = (env.WSL_DISTRO_NAME ?? "") !== "" || (env.WSL_INTEROP ?? "") !== "" || /microsoft|wsl/i.test(version);
	if (!inWsl) return undefined;
	const candidates = [
		...(env.PATH ?? "")
			.split(delimiter)
			.filter((dir) => dir !== "")
			.map((dir) => join(dir, "powershell.exe")),
		POWERSHELL_FALLBACK,
	];
	return { powershell: candidates.find((candidate) => deps.isExecutable(candidate)) };
}

export type WindowsInterface = { readonly name: string; readonly address: string };

/** 读取 Windows 上线的非回环/非隧道 IPv4 单播地址，输出紧凑 JSON 数组。 */
export const WINDOWS_ADDRESSES_SCRIPT = [
	"$ErrorActionPreference='Stop'",
	"$r=@()",
	"foreach($n in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()){",
	"if($n.OperationalStatus -ne 'Up'){continue}",
	"if($n.NetworkInterfaceType -eq 'Loopback' -or $n.NetworkInterfaceType -eq 'Tunnel'){continue}",
	"foreach($a in $n.GetIPProperties().UnicastAddresses){",
	"if($a.Address.AddressFamily -eq 'InterNetwork'){$r+=[pscustomobject]@{name=$n.Name;address=$a.Address.IPAddressToString}}",
	"}}",
	"ConvertTo-Json -InputObject @($r) -Compress",
].join("\n");

const WSL_ADAPTER_PATTERN = /wsl|hyper-v|vethernet/i;

export type PowerShellRunner = (powershell: string, script: string, timeoutMs: number) => Promise<string>;

export const runPowerShell: PowerShellRunner = (powershell, script, timeoutMs) =>
	new Promise((resolve, reject) => {
		execFile(
			powershell,
			["-NoProfile", "-NonInteractive", "-Command", script],
			{ timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024, encoding: "utf8" },
			(error, stdout) => (error ? reject(error) : resolve(stdout)),
		);
	});

export function parseWindowsInterfaces(output: string): WindowsInterface[] {
	const text = output.replace(/^\uFEFF/, "").trim();
	if (text === "") return [];
	const parsed: unknown = JSON.parse(text);
	const items = Array.isArray(parsed) ? parsed : [parsed];
	const result: WindowsInterface[] = [];
	for (const item of items) {
		if (typeof item !== "object" || item === null) continue;
		const { name, address } = item as Record<string, unknown>;
		if (typeof name === "string" && typeof address === "string" && isIpv4Literal(address)) {
			result.push({ name, address });
		}
	}
	return result;
}

/** 把 Windows 网卡列表转成与 os.networkInterfaces() 同形状，以复用同一套过滤规则。 */
export function toInterfaceDict(interfaces: readonly WindowsInterface[]): NodeJS.Dict<NetworkInterfaceInfo[]> {
	const dict: Record<string, NetworkInterfaceInfo[]> = {};
	for (const { name, address } of interfaces) {
		const list = dict[name] ?? [];
		dict[name] = list;
		list.push({
			address,
			netmask: "255.255.255.0",
			family: "IPv4",
			mac: "00:00:00:00:00:00",
			internal: false,
			cidr: `${address}/24`,
		});
	}
	return dict;
}

export type WindowsAddressDiscoveryOptions = {
	readonly powershell: string;
	readonly run?: PowerShellRunner;
	readonly cacheMs?: number;
	readonly timeoutMs?: number;
	readonly now?: () => number;
};

/** 经 PowerShell 读取 Windows 局域网候选地址；结果短时缓存，避免配对页轮询反复拉起进程。 */
export class WindowsAddressDiscovery {
	private readonly powershell: string;
	private readonly run: PowerShellRunner;
	private readonly cacheMs: number;
	private readonly timeoutMs: number;
	private readonly now: () => number;
	private cached: { readonly at: number; readonly addresses: string[] } | undefined;
	private pending: Promise<string[]> | undefined;

	constructor(options: WindowsAddressDiscoveryOptions) {
		this.powershell = options.powershell;
		this.run = options.run ?? runPowerShell;
		this.cacheMs = options.cacheMs ?? 15_000;
		this.timeoutMs = options.timeoutMs ?? 10_000;
		this.now = options.now ?? Date.now;
	}

	invalidate(): void {
		this.cached = undefined;
	}

	/** 手机可直连的 Windows 局域网 IPv4；读取失败时抛出带原因的错误。 */
	candidates(): Promise<string[]> {
		if (this.cached !== undefined && this.now() - this.cached.at < this.cacheMs) {
			return Promise.resolve([...this.cached.addresses]);
		}
		this.pending ??= this.read().finally(() => {
			this.pending = undefined;
		});
		return this.pending.then((addresses) => [...addresses]);
	}

	private async read(): Promise<string[]> {
		const output = await this.run(this.powershell, WINDOWS_ADDRESSES_SCRIPT, this.timeoutMs);
		// WSL/Hyper-V 虚拟交换机的地址手机一定不可达，连「无其他可用地址」的回退也不能纳入。
		const usable = parseWindowsInterfaces(output).filter((item) => !WSL_ADAPTER_PATTERN.test(item.name));
		const addresses = mobileListenCandidates(toInterfaceDict(usable));
		this.cached = { at: this.now(), addresses };
		return addresses;
	}
}

/** WSL 自身的 IPv4 地址集合；所选 Windows 地址出现在其中即为 mirrored 网络，可直接监听。 */
export function wslOwnAddresses(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): string[] {
	const result: string[] = [];
	for (const infos of Object.values(interfaces)) {
		for (const info of infos ?? []) {
			if (info.family === "IPv4" && !info.internal) result.push(info.address);
		}
	}
	return result;
}

/** WSL 内供 Windows 宿主访问的监听地址：优先 eth0 的 IPv4，其次任一非回环 IPv4。 */
export function primaryWslAddress(
	interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string | undefined {
	const eth0 = (interfaces.eth0 ?? []).find((info) => info.family === "IPv4" && !info.internal);
	return eth0?.address ?? wslOwnAddresses(interfaces)[0];
}
