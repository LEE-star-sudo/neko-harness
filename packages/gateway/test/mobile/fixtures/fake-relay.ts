// 实现与真实 PowerShell 中继相同的 stdout/stdin 协议，供 relay.test.ts 通过注入 spawn 使用。
const mode = process.env.FAKE_RELAY_MODE ?? "ready";
const watchdogMs = Number(process.env.FAKE_RELAY_WATCHDOG_MS ?? "8000");

const say = (line: string): void => {
	process.stdout.write(`${line}\n`);
};

if (mode === "error-port") {
	say("ERROR port_in_use Only one usage of each socket address");
	process.exit(2);
} else if (mode === "error-target") {
	say("ERROR target_unreachable connect timed out");
	process.exit(3);
} else if (mode === "crash-before-ready") {
	process.stderr.write("Add-Type : Cannot add type. constrained language mode\n");
	process.exit(1);
} else if (mode === "hang") {
	setInterval(() => {}, 1_000);
} else {
	say("READY");
	let last = Date.now();
	process.stdin.on("data", () => {
		last = Date.now();
	});
	if (mode !== "ignore-eof") {
		process.stdin.on("end", () => process.exit(0));
		setInterval(() => {
			if (Date.now() - last > watchdogMs) process.exit(0);
		}, 50);
	} else {
		process.stdin.on("end", () => {});
		setInterval(() => {}, 1_000);
	}
	if (mode === "crash-after-ready") setTimeout(() => process.exit(5), 100);
}
