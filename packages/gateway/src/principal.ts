/** Who a request acts as on the gateway host. Chord supplies none; the gateway stamps one per connection. */
export type GatewayPrincipal =
	| { readonly kind: "host" }
	| { readonly kind: "local"; readonly connectionId: string }
	| {
			readonly kind: "mobile";
			readonly connectionId: string;
			readonly deviceId: string;
			readonly grantRevision: number;
	  };

export const HOST_PRINCIPAL: GatewayPrincipal = { kind: "host" };

/** Mobile keys carry device, grant revision and connection so a revoked grant never reaches a live object. */
export function gatewayPrincipalKey(principal: GatewayPrincipal): string {
	switch (principal.kind) {
		case "mobile":
			return `mobile:${principal.deviceId}:${principal.grantRevision}:${principal.connectionId}`;
		case "local":
			return `local:${principal.connectionId}`;
		case "host":
			return "host";
	}
}

export function isMobilePrincipal(principal: unknown): principal is Extract<GatewayPrincipal, { kind: "mobile" }> {
	return typeof principal === "object" && principal !== null && (principal as { kind?: unknown }).kind === "mobile";
}
