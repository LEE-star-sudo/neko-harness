import { useQuery } from "@tanstack/react-query";

export type ServerInfo = {
	model: string;
	cwd: string;
};

async function fetchInfo(): Promise<ServerInfo> {
	const response = await fetch("/api/info");
	if (!response.ok) throw new Error(`GET /api/info 失败（${response.status}）`);
	return (await response.json()) as ServerInfo;
}

/** RPC 式调用：服务器信息（模型、工作目录）。流式状态不走 Query（见 D4/D7）。 */
export function useServerInfo() {
	return useQuery({ queryKey: ["server-info"], queryFn: fetchInfo, staleTime: Number.POSITIVE_INFINITY, retry: false });
}
