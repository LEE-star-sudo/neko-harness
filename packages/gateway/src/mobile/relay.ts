import { type ChildProcess, spawn as nodeSpawn } from "node:child_process";
import { isIpv4Literal } from "./network.ts";

/**
 * WSL 下的 Windows 侧 TCP 中继（design D2/D5）：经 powershell.exe 内嵌 C# 在所选 Windows 局域网 IP 上监听，
 * 把连接原样转发到 WSL 内的移动监听。无需管理员权限；stdin 兼作控制通道，EOF 或心跳超时即自退。
 */

export type RelayErrorCode = "port_in_use" | "listen_failed" | "target_unreachable" | "start_failed" | "timeout";

export class RelayError extends Error {
	readonly code: RelayErrorCode;
	constructor(code: RelayErrorCode, message: string) {
		super(message);
		this.name = "RelayError";
		this.code = code;
	}
}

export const RELAY_HEARTBEAT_INTERVAL_MS = 2_000;
export const RELAY_WATCHDOG_MS = 8_000;
const START_TIMEOUT_MS = 20_000;
const STOP_GRACE_MS = 1_000;
const STDERR_TAIL_BYTES = 2_000;

// 仅使用 C# 5 语法与 .NET Framework 4.x API，以兼容 Windows PowerShell 5.1。
export const RELAY_SOURCE = `using System;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Threading;

public static class NekoRelay
{
    static readonly Stopwatch Clock = Stopwatch.StartNew();
    static long lastBeatMs = 0;

    static void Touch() { Interlocked.Exchange(ref lastBeatMs, Clock.ElapsedMilliseconds); }
    static string Flat(string text) { return text.Replace("\\r", " ").Replace("\\n", " "); }
    static void Close(TcpClient client) { if (client != null) { try { client.Close(); } catch (Exception) { } } }

    static void Copy(TcpClient from, TcpClient to)
    {
        byte[] buffer = new byte[16384];
        try
        {
            System.IO.Stream source = from.GetStream();
            System.IO.Stream sink = to.GetStream();
            int count;
            while ((count = source.Read(buffer, 0, buffer.Length)) > 0) { sink.Write(buffer, 0, count); }
        }
        catch (Exception) { }
        try { to.Client.Shutdown(SocketShutdown.Send); } catch (Exception) { }
    }

    static void Pump(object state)
    {
        object[] args = (object[])state;
        TcpClient client = (TcpClient)args[0];
        TcpClient target = null;
        try
        {
            target = new TcpClient();
            target.NoDelay = true;
            client.NoDelay = true;
            target.Connect((string)args[1], (int)args[2]);
            Thread upstream = new Thread(delegate() { Copy(client, target); });
            upstream.IsBackground = true;
            upstream.Start();
            Copy(target, client);
        }
        catch (Exception) { }
        finally { Close(client); Close(target); }
    }

    public static void Run(string listenIp, int listenPort, string targetIp, int targetPort, int watchdogMs)
    {
        TcpListener listener = new TcpListener(IPAddress.Parse(listenIp), listenPort);
        listener.ExclusiveAddressUse = true;
        try { listener.Start(128); }
        catch (SocketException e)
        {
            string code = (e.SocketErrorCode == SocketError.AddressAlreadyInUse || e.SocketErrorCode == SocketError.AccessDenied) ? "port_in_use" : "listen_failed";
            Console.Out.WriteLine("ERROR " + code + " " + Flat(e.Message));
            Console.Out.Flush();
            Environment.Exit(2);
        }
        try
        {
            TcpClient probe = new TcpClient();
            IAsyncResult pending = probe.BeginConnect(targetIp, targetPort, null, null);
            if (!pending.AsyncWaitHandle.WaitOne(3000)) { throw new TimeoutException("connect timed out"); }
            probe.EndConnect(pending);
            probe.Close();
        }
        catch (Exception e)
        {
            Console.Out.WriteLine("ERROR target_unreachable " + Flat(e.Message));
            Console.Out.Flush();
            Environment.Exit(3);
        }
        Touch();
        Thread input = new Thread(delegate()
        {
            try { while (Console.In.ReadLine() != null) { Touch(); } } catch (Exception) { }
            Environment.Exit(0);
        });
        input.IsBackground = true;
        input.Start();
        Thread watchdog = new Thread(delegate()
        {
            while (true)
            {
                Thread.Sleep(1000);
                if (Clock.ElapsedMilliseconds - Interlocked.Read(ref lastBeatMs) > watchdogMs) { Environment.Exit(0); }
            }
        });
        watchdog.IsBackground = true;
        watchdog.Start();
        Console.Out.WriteLine("READY");
        Console.Out.Flush();
        while (true)
        {
            TcpClient accepted;
            try { accepted = listener.AcceptTcpClient(); }
            catch (Exception) { Environment.Exit(4); return; }
            ThreadPool.QueueUserWorkItem(Pump, new object[] { accepted, targetIp, targetPort });
        }
    }
}`;

export type RelayEndpoints = {
	readonly listenAddress: string;
	readonly listenPort: number;
	readonly targetAddress: string;
	readonly targetPort: number;
};

function assertPort(port: number, label: string): void {
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`relay ${label} port is invalid`);
}

/** 构造传给 powershell.exe 的完整脚本；参数先校验为 IPv4 字面量/端口，杜绝注入。 */
export function buildRelayScript(endpoints: RelayEndpoints, watchdogMs = RELAY_WATCHDOG_MS): string {
	if (!isIpv4Literal(endpoints.listenAddress) || !isIpv4Literal(endpoints.targetAddress)) {
		throw new Error("relay addresses must be IPv4 literals");
	}
	assertPort(endpoints.listenPort, "listen");
	assertPort(endpoints.targetPort, "target");
	if (!Number.isInteger(watchdogMs) || watchdogMs < 1_000) throw new Error("relay watchdog is invalid");
	return [
		"$ErrorActionPreference='Stop'",
		`$src=@'\n${RELAY_SOURCE}\n'@`,
		"Add-Type -TypeDefinition $src -Language CSharp",
		`[NekoRelay]::Run('${endpoints.listenAddress}',${endpoints.listenPort},'${endpoints.targetAddress}',${endpoints.targetPort},${watchdogMs})`,
	].join("\n");
}

export function encodeRelayCommand(script: string): string {
	return Buffer.from(script, "utf16le").toString("base64");
}

export type RelayOptions = RelayEndpoints & {
	readonly powershell: string;
	readonly spawn?: typeof nodeSpawn;
	readonly heartbeatMs?: number;
	readonly watchdogMs?: number;
	readonly startTimeoutMs?: number;
	readonly stopGraceMs?: number;
};

export type RelayHandle = {
	/** 中继进程退出时解析为原因（主动 stop 也会解析）。 */
	readonly exited: Promise<string>;
	/** 关闭 stdin 通知中继退出，宽限后强制结束。幂等。 */
	stop(): Promise<void>;
};

function describeExit(child: ChildProcess): string {
	return child.signalCode !== null ? `signal ${child.signalCode}` : `exit code ${child.exitCode}`;
}

export async function startWindowsRelay(options: RelayOptions): Promise<RelayHandle> {
	const watchdogMs = options.watchdogMs ?? RELAY_WATCHDOG_MS;
	const script = buildRelayScript(options, watchdogMs);
	const spawn = options.spawn ?? nodeSpawn;
	const child = spawn(
		options.powershell,
		["-NoProfile", "-NonInteractive", "-EncodedCommand", encodeRelayCommand(script)],
		{ stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
	);

	let stderrTail = "";
	child.stderr?.on("data", (chunk: Buffer) => {
		stderrTail = (stderrTail + chunk.toString("utf8")).slice(-STDERR_TAIL_BYTES);
	});
	child.stdin?.on("error", () => {});

	const exited = new Promise<string>((resolve) => {
		child.once("error", (error) => resolve(`spawn error: ${error.message}`));
		child.once("exit", () => resolve(describeExit(child)));
	});

	let heartbeat: ReturnType<typeof setInterval> | undefined;
	let stopping: Promise<void> | undefined;
	const stop = (): Promise<void> => {
		stopping ??= (async () => {
			clearInterval(heartbeat);
			child.stdin?.end();
			const grace = options.stopGraceMs ?? STOP_GRACE_MS;
			const done = await Promise.race([exited.then(() => true), delay(grace).then(() => false)]);
			if (!done) {
				child.kill("SIGKILL");
				await Promise.race([exited, delay(grace)]);
			}
		})();
		return stopping;
	};

	const ready = new Promise<void>((resolve, reject) => {
		let buffer = "";
		const timer = setTimeout(
			() => reject(new RelayError("timeout", "Windows relay did not become ready in time")),
			options.startTimeoutMs ?? START_TIMEOUT_MS,
		);
		const finish = (action: () => void): void => {
			clearTimeout(timer);
			action();
		};
		child.stdout?.on("data", (chunk: Buffer) => {
			buffer += chunk.toString("utf8");
			for (;;) {
				const newline = buffer.indexOf("\n");
				if (newline < 0) break;
				const line = buffer.slice(0, newline).trim();
				buffer = buffer.slice(newline + 1);
				if (line === "READY") finish(resolve);
				else if (line.startsWith("ERROR ")) {
					const [, code = "start_failed", ...rest] = line.split(" ");
					const known: RelayErrorCode[] = ["port_in_use", "listen_failed", "target_unreachable"];
					const mapped = known.find((item) => item === code) ?? "start_failed";
					finish(() => reject(new RelayError(mapped, rest.join(" ") || code)));
				}
			}
		});
		void exited.then((reason) => {
			const detail = stderrTail.trim();
			finish(() =>
				reject(
					new RelayError(
						"start_failed",
						`Windows relay exited before it was ready (${reason})${detail === "" ? "" : `: ${detail}`}`,
					),
				),
			);
		});
	});

	try {
		await ready;
	} catch (error) {
		await stop();
		throw error;
	}
	heartbeat = setInterval(() => {
		child.stdin?.write("\n");
	}, options.heartbeatMs ?? RELAY_HEARTBEAT_INTERVAL_MS);
	heartbeat.unref?.();
	return { exited, stop };
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
