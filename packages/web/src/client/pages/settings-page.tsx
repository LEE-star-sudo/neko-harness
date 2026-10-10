import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { appActions } from "../lib/bootstrap";
import { useNekoState } from "../lib/store";

const sources = { saved: "使用已保存密钥", environment: "使用环境变量", runtime: "使用运行时配置", none: "尚未配置" };
export function SettingsPage() {
	const { credentials, phase } = useNekoState();
	const [key, setKey] = useState("");
	const [busy, setBusy] = useState(false);
	const pending = useRef(false);
	const [message, setMessage] = useState("");
	async function update(remove: boolean) {
		if (pending.current) return;
		pending.current = true;
		setBusy(true);
		setMessage("");
		try {
			if (remove) await appActions.removeCredential();
			else await appActions.saveCredential(key);
			setKey("");
			setMessage(remove ? "已移除保存的密钥" : "已保存，下次请求生效");
		} catch {
			setMessage("操作失败，请检查连接后重试。");
		} finally {
			pending.current = false;
			setBusy(false);
		}
	}
	const disabled = busy || phase !== "ready" || !credentials;
	return (
		<div className="flex min-h-dvh flex-col bg-base">
			<header className="flex items-center justify-between border-b border-sakura-200/70 bg-surface px-5 py-4">
				<Link to="/" className="focus-neko rounded-lg text-sakura-700">
					← 返回聊天
				</Link>
				<span className="text-xs text-ink-500">{phase === "ready" ? "已连接" : "连接中…"}</span>
			</header>
			<main className="mx-auto w-full max-w-lg px-5 py-12 sm:py-20">
				<h1 className="mb-2 text-2xl font-bold text-ink-900">设置</h1>
				<p className="mb-6 text-sm text-ink-500">连接你的 DeepSeek，继续对话。</p>
				<section className="rounded-3xl border border-sakura-200 bg-surface p-6 shadow-soft">
					<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
						<h2 className="text-lg font-bold text-ink-900">DeepSeek</h2>
						<span className="rounded-full bg-tianyi-50 px-3 py-1 text-xs text-tianyi-800">
							{credentials ? sources[credentials.source] : "读取中…"}
						</span>
					</div>
					<p className="mb-5 text-sm text-ink-500">
						环境变量：{credentials ? (credentials.environmentConfigured ? "已配置" : "未配置") : "读取中…"}
					</p>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void update(false);
						}}
					>
						<label className="mb-2 block text-sm font-medium text-ink-700" htmlFor="deepseek-key">
							API Key
						</label>
						<input
							id="deepseek-key"
							type="password"
							autoComplete="off"
							spellCheck={false}
							value={key}
							maxLength={4096}
							disabled={disabled}
							onChange={(event) => setKey(event.target.value)}
							placeholder={credentials?.savedConfigured ? "输入新密钥以替换" : "粘贴你的 API Key"}
							className="focus-neko w-full min-w-0 rounded-xl border border-sakura-200 bg-base px-3 py-3 text-sm"
						/>
						<p className="mt-2 text-xs leading-relaxed text-ink-500">保存后优先于环境变量，所有工作区共用。</p>
						<div className="mt-5 flex flex-wrap items-center gap-3">
							<button
								type="submit"
								disabled={disabled || !key.trim()}
								className="focus-neko rounded-full bg-sakura-100 px-5 py-2 text-sm font-semibold text-sakura-800 disabled:opacity-50"
							>
								{busy ? "处理中…" : "保存密钥"}
							</button>
							{credentials?.savedConfigured && (
								<button
									type="button"
									disabled={disabled}
									onClick={() => void update(true)}
									className="focus-neko rounded-full px-3 py-2 text-sm text-ink-500 disabled:opacity-50"
								>
									移除已保存密钥
								</button>
							)}
						</div>
					</form>
					<output className="mt-4 min-h-5 text-sm text-tianyi-800">{message}</output>
					<a
						href="https://platform.deepseek.com/api_keys"
						target="_blank"
						rel="noreferrer"
						className="focus-neko mt-2 inline-block rounded text-sm text-sakura-700"
					>
						获取 DeepSeek API Key ↗
					</a>
				</section>
			</main>
		</div>
	);
}
