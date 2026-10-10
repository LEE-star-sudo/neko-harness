import { Link } from "@tanstack/react-router";

/** 设置页（v1 占位）。 */
export function SettingsPage() {
	return (
		<div className="flex h-dvh flex-col bg-base">
			<header className="flex items-center gap-3 border-b border-sakura-200/70 bg-surface/80 px-4 py-2.5 backdrop-blur">
				<Link to="/" className="focus-neko rounded-lg text-sakura-700 no-underline hover:text-sakura-800">
					← 返回
				</Link>
				<span className="text-lg font-bold text-sakura-800">设置</span>
			</header>
			<main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
				<div className="w-full rounded-card border border-tianyi-200 bg-surface p-6 shadow-soft">
					<h2 className="mb-2 font-bold text-ink-900">设置页（v1 占位）</h2>
					<p className="text-sm text-ink-600">
						模型选择、主题切换与会话管理将在后续变更提供。当前会话使用环境变量 <code>DEEPSEEK_API_KEY</code>{" "}
						与默认模型运行。
					</p>
				</div>
			</main>
		</div>
	);
}
