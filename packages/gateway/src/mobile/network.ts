import type { NetworkInterfaceInfo } from "node:os";
import { networkInterfaces } from "node:os";

/** 常见虚拟接口名前缀（macOS/Linux 短名，如 utun0、bridge100、veth1a2b3c）。 */
const VIRTUAL_INTERFACE_PREFIXES = [
	"anpi",
	"awdl",
	"bridge",
	"docker",
	"gif",
	"ipsec",
	"llw",
	"ppp",
	"stf",
	"tap",
	"tun",
	"utun",
	"vboxnet",
	"veth",
	"virbr",
	"vmnet",
] as const;

/** Windows 接口名是描述性字符串（如 "vEthernet (WSL)"），按关键词排除。 */
const VIRTUAL_INTERFACE_KEYWORDS = ["hyper-v", "virtual", "virtualbox", "vmware", "vpn", "wsl"] as const;

function isVirtualInterfaceName(name: string): boolean {
	const lower = name.toLowerCase();
	if (VIRTUAL_INTERFACE_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;
	return VIRTUAL_INTERFACE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/** RFC 2544 基准测试段（198.18.0.0/15）：代理工具 fake-ip 常用，手机无法直连。 */
function isBenchmarkAddress(address: string): boolean {
	return address.startsWith("198.18.") || address.startsWith("198.19.");
}

function collectListenCandidates(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>, skipVirtual: boolean): string[] {
	const candidates: string[] = [];
	for (const [name, infos] of Object.entries(interfaces)) {
		if (infos === undefined) continue;
		if (skipVirtual && isVirtualInterfaceName(name)) continue;
		for (const info of infos) {
			if (info.family !== "IPv4" || info.internal) continue;
			if (info.address.startsWith("169.254.")) continue;
			if (skipVirtual && isBenchmarkAddress(info.address)) continue;
			candidates.push(info.address);
		}
	}
	return candidates.sort();
}

/**
 * 可供手机直连的 IPv4 候选：过滤虚拟接口与 RFC 2544 段；过滤后为空（例如只剩 VPN）
 * 时回退到未过滤列表，保证始终有地址可选。
 */
export function mobileListenCandidates(interfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>): string[] {
	const source = interfaces ?? networkInterfaces();
	const filtered = collectListenCandidates(source, true);
	return filtered.length > 0 ? filtered : collectListenCandidates(source, false);
}

/** 把上次连接成功的地址排到候选最前；不在当前候选中（网络已变化）时不虚构。 */
export function prioritizeListenCandidate(
	candidates: readonly string[],
	lastConnectedAddress: string | null,
): string[] {
	if (lastConnectedAddress === null || !candidates.includes(lastConnectedAddress)) return [...candidates];
	return [lastConnectedAddress, ...candidates.filter((candidate) => candidate !== lastConnectedAddress)];
}

export function isIpv4Literal(address: string): boolean {
	const parts = address.split(".");
	return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
