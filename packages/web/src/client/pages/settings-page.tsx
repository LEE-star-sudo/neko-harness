import { Link } from "@tanstack/react-router";
import { useGatewayInfo } from "../lib/api";

/** 设置页（v1 占位）：展示网关连接信息，模型/主题等配置后续变更提供。 */
export function SettingsPage() {
	const info = useGatewayInfo();
	return (
		<div className="flex h-dvh flex-col bg-base">
			<header className="flex items-center gap-3 border-b border-sakura-200/70 bg-surface/80 px-4 py-2.5 backdrop-blur">
				<Link to="/" className="focus-neko rounded-lg text-sakura-700 no-underline hover:text-sakura-800">
					← 返回
				</Link>
				<span className="text-lg font-bold text-sakura-800">设置</span>
			</header>
			<main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
				<div className="w-full rounded-card border border-tianyi-200 bg-surface p-6 text-left shadow-soft">
					<h2 className="mb-3 font-bold text-ink-900">网关</h2>
					{info.isPending && <p className="text-sm text-ink-500">读取中…</p>}
					{info.isError && <p className="text-sm text-sakura-800">无法获取网关信息（/api/info）。</p>}
					{info.data !== undefined && (
						<dl className="space-y-1.5 font-mono text-xs text-ink-700">
							<div className="flex gap-2">
								<dt className="shrink-0 text-ink-500">WebSocket</dt>
								<dd>{info.data.gatewayWs}</dd>
							</div>
							<div className="flex gap-2">
								<dt className="shrink-0 text-ink-500">serverId</dt>
								<dd className="break-all">{info.data.serverId}</dd>
							</div>
							<div className="flex gap-2">
								<dt className="shrink-0 text-ink-500">Unix socket</dt>
								<dd className="break-all">{info.data.socketPath}</dd>
							</div>
						</dl>
					)}
				</div>
				<div className="w-full rounded-card border border-sakura-200 bg-surface p-6 text-left shadow-soft">
					<h2 className="mb-2 font-bold text-ink-900">模型与主题</h2>
					<p className="text-sm text-ink-600">
						模型选择、主题切换等配置将在后续变更提供。当前会话使用环境变量 <code>DEEPSEEK_API_KEY</code>{" "}
						与默认模型运行。
					</p>
				</div>
			</main>
		</div>
	);
}
