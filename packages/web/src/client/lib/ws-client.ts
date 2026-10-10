import type { ClientMessage, ServerMessage } from "../../protocol";
import { storeActions } from "./store";

let socket: WebSocket | null = null;
let attempt = 0;
let started = false;

/** 连接 /ws 并自动重连；重连后服务器会推送最新快照（spec：断线重连场景）。 */
export function startNekoWeb(): void {
	if (started) return;
	started = true;
	connect();
}

function connect(): void {
	const proto = window.location.protocol === "https:" ? "wss" : "ws";
	const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
	socket = ws;
	storeActions.setConn(attempt === 0 ? "connecting" : "reconnecting");

	ws.onopen = () => {
		if (socket !== ws) return;
		attempt = 0;
		storeActions.setConn("open");
	};
	ws.onmessage = (event) => {
		if (socket !== ws) return;
		let message: ServerMessage;
		try {
			message = JSON.parse(String(event.data)) as ServerMessage;
		} catch {
			return;
		}
		if (message.type === "snapshot") {
			storeActions.setView(message.view);
		} else if (message.type === "notice") {
			storeActions.notice({ level: message.level, text: message.text });
		}
	};
	ws.onclose = () => {
		if (socket !== ws) return;
		socket = null;
		attempt += 1;
		storeActions.setConn("reconnecting");
		setTimeout(connect, Math.min(800 * attempt, 8000));
	};
	ws.onerror = () => ws.close();
}

export function sendMessage(message: ClientMessage): boolean {
	if (socket === null || socket.readyState !== WebSocket.OPEN) return false;
	socket.send(JSON.stringify(message));
	return true;
}
