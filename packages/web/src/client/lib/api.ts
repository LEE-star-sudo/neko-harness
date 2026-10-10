import { useQuery } from "@tanstack/react-query";
import { fetchGatewayInfo } from "./bootstrap";

/** 网关发现信息（/api/info），设置页展示用；流式会话状态不走 Query（D4/D7）。 */
export function useGatewayInfo() {
	return useQuery({ queryKey: ["gateway-info"], queryFn: fetchGatewayInfo, retry: false });
}
