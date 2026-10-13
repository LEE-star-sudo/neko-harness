import { createGatewayConnection, type NekoGatewayConnection } from "./client-session.ts";
import { createUnixLink } from "./unix-link.ts";
import { createWsLink } from "./ws-listener.ts";
export type NekoGatewayAddress =
	| { readonly transport: "unix"; readonly socketPath: string; readonly serverId: string }
	| { readonly transport: "ws"; readonly url: string; readonly serverId: string };
export type NekoGatewayClient = NekoGatewayConnection;
export async function connectNekoGateway(address: NekoGatewayAddress): Promise<NekoGatewayClient> {
	const link = address.transport === "unix" ? await createUnixLink(address.socketPath) : createWsLink(address.url);
	const connection = createGatewayConnection(link, address.serverId);
	try {
		await connection.ready();
		return connection;
	} catch (error) {
		await connection.close();
		throw error;
	}
}
