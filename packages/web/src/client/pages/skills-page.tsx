import { ChordError } from "@earendil-works/chord";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Markdown } from "../components/markdown";
import { Icon } from "../components/primitives";
import { appActions } from "../lib/bootstrap";
import type { NekoMarketSkill } from "../lib/contract";
import { useNekoState } from "../lib/store";

/** 分类名中文化；未知分类回落原名。 */
const CATEGORY_LABELS: Record<string, string> = {
	documents: "文档处理",
	development: "开发工作流",
	frontend: "前端 / UI",
	research: "研究检索",
	skills: "技能生态",
	automation: "自动化",
	database: "数据库",
	writing: "写作",
	uncategorized: "未分类",
};

const formatSize = (bytes: number): string =>
	bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;

const formatDate = (iso: string): string => (iso === "" ? "" : iso.slice(0, 10));

const marketErrorCode = (error: unknown): string | null =>
	error instanceof ChordError ? (error.reason ?? null) : null;

type GroupBy = "category" | "source";

function groupSkills(skills: readonly NekoMarketSkill[], groupBy: GroupBy): [string, NekoMarketSkill[]][] {
	const groups = new Map<string, NekoMarketSkill[]>();
	for (const skill of skills) {
		const key = groupBy === "category" ? (CATEGORY_LABELS[skill.category] ?? skill.category) : skill.source;
		const list = groups.get(key) ?? [];
		list.push(skill);
		groups.set(key, list);
	}
	return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

/** 三级安装状态徽章：项目级/用户级实心 sakura 点，内置为 ink 徽章。 */
function InstallBadges({ skill }: { skill: NekoMarketSkill }) {
	return (
		<span className="flex shrink-0 items-center gap-1.5 text-xs">
			{skill.installed.project && (
				<span className="inline-flex items-center gap-1 rounded-full bg-sakura-100 px-2 py-0.5 text-sakura-800">
					<span className="inline-block h-1.5 w-1.5 rounded-full bg-sakura-500" />
					项目级{skill.activeLevel === "project" ? "·生效" : ""}
				</span>
			)}
			{skill.installed.user && (
				<span className="inline-flex items-center gap-1 rounded-full bg-sakura-100 px-2 py-0.5 text-sakura-800">
					<span className="inline-block h-1.5 w-1.5 rounded-full bg-sakura-500" />
					用户级{skill.activeLevel === "user" ? "·生效" : ""}
				</span>
			)}
			{skill.installed.builtin && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-600">内置</span>}
		</span>
	);
}

type ConfirmState = {
	readonly title: string;
	readonly body: string;
	readonly confirmLabel: string;
	readonly danger?: boolean;
	readonly action: () => Promise<void>;
};

function ConfirmModal({ confirm, onClose }: { confirm: ConfirmState; onClose: () => void }) {
	const [busy, setBusy] = useState(false);
	return (
		<Portal>
			<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
				<button type="button" aria-label="取消" onClick={onClose} className="absolute inset-0 bg-ink-900/20" />
				<div
					role="alertdialog"
					aria-modal="true"
					aria-label={confirm.title}
					className="relative w-full max-w-sm rounded-card border border-sakura-200 bg-surface p-5 shadow-lift"
				>
					<h3 className="text-base font-bold text-ink-900">{confirm.title}</h3>
					<p className="mt-2 text-sm text-ink-600">{confirm.body}</p>
					<div className="mt-4 flex justify-end gap-2">
						<button
							type="button"
							onClick={onClose}
							className="focus-neko rounded-full px-4 py-1.5 text-sm text-ink-500"
						>
							取消
						</button>
						<button
							type="button"
							disabled={busy}
							className={`focus-neko rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50 ${
								confirm.danger ? "bg-sakura-100 text-sakura-800" : "bg-tianyi-100 text-tianyi-800"
							}`}
							onClick={() => {
								setBusy(true);
								void confirm.action().finally(() => {
									setBusy(false);
									onClose();
								});
							}}
						>
							{busy ? "处理中…" : confirm.confirmLabel}
						</button>
					</div>
				</div>
			</div>
		</Portal>
	);
}

function Portal({ children }: { children: React.ReactNode }) {
	return createPortal(children, document.body);
}

function SkillDrawer({ name, onClose, onChanged }: { name: string; onClose: () => void; onChanged: () => void }) {
	const [detail, setDetail] = useState<NekoMarketSkill | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [tab, setTab] = useState<"about" | "preview">("about");
	const [preview, setPreview] = useState<{ body: string; files: readonly string[] } | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [notice, setNotice] = useState("");
	const [confirm, setConfirm] = useState<ConfirmState | null>(null);

	useEffect(() => {
		let stale = false;
		setDetail(null);
		setError(null);
		setPreview(null);
		setTab("about");
		setNotice("");
		appActions
			.marketDetail(name)
			.then((value) => {
				if (!stale) setDetail(value);
			})
			.catch((e: unknown) => {
				if (!stale) setError(e instanceof Error ? e.message : String(e));
			});
		return () => {
			stale = true;
		};
	}, [name]);

	useEffect(() => {
		if (tab !== "preview" || preview !== null || previewError !== null) return;
		let stale = false;
		appActions
			.marketPreview(name)
			.then((value) => {
				if (!stale) setPreview(value);
			})
			.catch((e: unknown) => {
				if (!stale) setPreviewError(e instanceof Error ? e.message : String(e));
			});
		return () => {
			stale = true;
		};
	}, [tab, name, preview, previewError]);

	const runInstall = async (scope: "user" | "project", overwrite: boolean) => {
		setBusy(scope);
		setNotice("");
		try {
			const result = await appActions.marketInstall(name, scope, overwrite);
			setNotice(
				result.shadowedBy === "project"
					? `已安装到用户级，但项目级同名技能优先，此安装暂不生效。下次发送消息时生效。`
					: "安装完成，下次发送消息时生效。",
			);
			onChanged();
			const fresh = await appActions.marketDetail(name);
			setDetail(fresh);
		} catch (e: unknown) {
			if (marketErrorCode(e) === "skill_exists" && !overwrite) {
				setConfirm({
					title: "覆盖已安装技能",
					body: `${scope === "user" ? "用户级" : "项目级"}已存在 ${name}。以市场版本覆盖？本地改动将丢失。`,
					confirmLabel: "覆盖安装",
					action: () => runInstall(scope, true),
				});
			} else {
				setNotice(`操作失败：${e instanceof Error ? e.message : String(e)}`);
			}
		} finally {
			setBusy(null);
		}
	};

	const askInstall = (scope: "user" | "project") => {
		if (detail === null) return;
		const exists = scope === "user" ? detail.installed.user : detail.installed.project;
		const shadowed = scope === "user" && detail.installed.project;
		if (exists) {
			setConfirm({
				title: "覆盖已安装技能",
				body: `${scope === "user" ? "用户级" : "项目级"}已存在 ${name}。以市场版本 ${detail.version} 覆盖？本地改动将丢失。`,
				confirmLabel: "覆盖安装",
				action: () => runInstall(scope, true),
			});
		} else if (shadowed) {
			setConfirm({
				title: "安装后暂不生效",
				body: `项目级已存在同名 ${name}，项目级优先。仍要安装到用户级吗？`,
				confirmLabel: "仍安装",
				action: () => runInstall(scope, false),
			});
		} else {
			void runInstall(scope, false);
		}
	};

	const askUninstall = (scope: "user" | "project") => {
		setConfirm({
			title: "卸载技能",
			body: `删除${scope === "user" ? "用户级" : "项目级"}的 ${name}？此操作不可撤销。`,
			confirmLabel: "卸载",
			danger: true,
			action: async () => {
				setBusy(scope);
				setNotice("");
				try {
					await appActions.marketUninstall(name, scope);
					setNotice("已卸载，下次发送消息时生效。");
					onChanged();
					setDetail(await appActions.marketDetail(name));
				} catch (e: unknown) {
					setNotice(`操作失败：${e instanceof Error ? e.message : String(e)}`);
				} finally {
					setBusy(null);
				}
			},
		});
	};

	return (
		<Portal>
			<button type="button" aria-label="关闭详情" onClick={onClose} className="fixed inset-0 z-40 bg-ink-900/10" />
			<aside
				role="dialog"
				aria-label={`技能详情 ${name}`}
				className="fixed inset-0 z-50 flex flex-col bg-base sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[26rem] sm:border-l sm:border-sakura-200 sm:shadow-lift"
			>
				<header className="flex items-center justify-between gap-2 border-b border-sakura-100 px-4 py-3">
					<div className="flex min-w-0 items-center gap-2">
						<span className="text-sakura-500">
							<Icon name="sparkles" size={16} />
						</span>
						<h2 className="truncate text-lg font-bold text-ink-900">{name}</h2>
						{detail && <span className="shrink-0 text-xs text-ink-400">{detail.version}</span>}
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label="关闭详情"
						className="focus-neko rounded-lg p-1 text-ink-500 hover:bg-ink-100"
					>
						<Icon name="close" size={16} />
					</button>
				</header>

				<div className="flex gap-1 border-b border-sakura-100 px-4 py-2">
					{(["about", "preview"] as const).map((key) => (
						<button
							key={key}
							type="button"
							onClick={() => setTab(key)}
							className={`focus-neko rounded-full px-3 py-1 text-sm ${
								tab === key ? "bg-tianyi-100 font-semibold text-tianyi-800" : "text-ink-500"
							}`}
						>
							{key === "about" ? "说明" : "预览"}
						</button>
					))}
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
					{error !== null && <p className="text-sm text-sakura-800">加载失败：{error}</p>}
					{detail === null && error === null && <p className="text-sm text-ink-500">加载中…</p>}
					{detail !== null && tab === "about" && (
						<div className="space-y-3">
							<p className="text-sm text-ink-700">{detail.description}</p>
							<dl className="space-y-1.5 text-xs text-ink-600">
								{[
									["分类", CATEGORY_LABELS[detail.category] ?? detail.category],
									["来源", detail.source],
									["大小", formatSize(detail.sizeBytes)],
									["SHA-256", `${detail.sha256.slice(0, 12)}…`],
									["上传于", formatDate(detail.uploadedAt)],
									...(detail.license !== "" ? [["许可证", detail.license]] : []),
								].map(([label, value]) => (
									<div key={label} className="flex gap-2">
										<dt className="w-14 shrink-0 text-ink-400">{label}</dt>
										<dd className="min-w-0 font-mono">{value}</dd>
									</div>
								))}
							</dl>
							<div className="rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-600">
								<InstallBadges skill={detail} />
								{!detail.installed.project && !detail.installed.user && !detail.installed.builtin && "尚未安装"}
							</div>
						</div>
					)}
					{detail !== null && tab === "preview" && (
						<div>
							{preview === null && previewError === null && <p className="text-sm text-ink-500">下载并解开预览…</p>}
							{previewError !== null && <p className="text-sm text-sakura-800">预览失败:{previewError}</p>}
							{preview !== null && (
								<>
									<Markdown text={preview.body} />
									<h3 className="mb-1 mt-4 text-xs font-medium text-ink-400">包内文件</h3>
									<ul className="space-y-0.5 font-mono text-xs text-ink-600">
										{preview.files.map((file) => (
											<li key={file}>{file}</li>
										))}
									</ul>
								</>
							)}
						</div>
					)}
				</div>

				{detail !== null && (
					<footer className="space-y-2 border-t border-sakura-100 px-4 py-3">
						{notice !== "" && <output className="block text-xs text-tianyi-800">{notice}</output>}
						{detail.installed.builtin && !detail.installed.user && !detail.installed.project ? (
							<p className="text-xs text-ink-500">内置技能随 neko 分发，无需安装，也不支持卸载。</p>
						) : (
							<div className="flex flex-wrap gap-2">
								{(["user", "project"] as const).map((scope) => {
									const installedHere = scope === "user" ? detail.installed.user : detail.installed.project;
									const label = scope === "user" ? "用户级" : "项目级";
									return installedHere ? (
										<button
											key={scope}
											type="button"
											disabled={busy !== null}
											onClick={() => askUninstall(scope)}
											className="focus-neko inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-sm text-ink-600 disabled:opacity-50"
										>
											<Icon name="trash" size={14} />
											{busy === scope ? "处理中…" : `卸载${label}`}
										</button>
									) : (
										<button
											key={scope}
											type="button"
											disabled={busy !== null}
											onClick={() => askInstall(scope)}
											className="focus-neko inline-flex items-center gap-1.5 rounded-full bg-tianyi-100 px-3 py-1.5 text-sm font-semibold text-tianyi-800 disabled:opacity-50"
										>
											<Icon name="download" size={14} />
											{busy === scope ? "安装中…" : `安装到${label}`}
										</button>
									);
								})}
							</div>
						)}
					</footer>
				)}
			</aside>
			{confirm && <ConfirmModal confirm={confirm} onClose={() => setConfirm(null)} />}
		</Portal>
	);
}

export function SkillsPage() {
	const { phase } = useNekoState();
	const [skills, setSkills] = useState<readonly NekoMarketSkill[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [groupBy, setGroupBy] = useState<GroupBy>("category");
	const [selected, setSelected] = useState<string | null>(null);
	const generation = useRef(0);

	const load = () => {
		const gen = ++generation.current;
		setLoading(true);
		setError(null);
		appActions
			.marketList()
			.then((value) => {
				if (gen === generation.current) setSkills(value);
			})
			.catch((e: unknown) => {
				if (gen === generation.current) setError(e instanceof Error ? e.message : String(e));
			})
			.finally(() => {
				if (gen === generation.current) setLoading(false);
			});
	};
	// 网关连接就绪后才拉目录；重连恢复后自动重试。
	// biome-ignore lint/correctness/useExhaustiveDependencies: load 只依赖 ref 与 appActions 单例
	useEffect(() => {
		if (phase === "ready") load();
	}, [phase]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (q === "") return skills;
		return skills.filter(
			(skill) => skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q),
		);
	}, [skills, query]);
	const groups = useMemo(() => groupSkills(filtered, groupBy), [filtered, groupBy]);

	return (
		<div className="flex min-h-dvh flex-col bg-base">
			<header className="sticky top-0 z-10 border-b border-sakura-100 bg-surface/90 px-4 py-3 backdrop-blur-md sm:px-6">
				<div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3">
					<Link
						to="/"
						className="focus-neko inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-sakura-700 hover:bg-sakura-50"
					>
						← 返回聊天
					</Link>
					<span className="text-ink-300">/</span>
					<h1 className="text-base font-bold text-ink-900 sm:text-lg">技能市场</h1>
					<div className="ml-auto flex flex-wrap items-center gap-2 sm:gap-3">
						<div className="flex rounded-full border border-sakura-200 p-0.5 text-xs">
							{(["category", "source"] as const).map((key) => (
								<button
									key={key}
									type="button"
									onClick={() => setGroupBy(key)}
									className={`focus-neko rounded-full px-3 py-1 ${
										groupBy === key ? "bg-sakura-100 font-semibold text-sakura-800" : "text-ink-500 hover:text-ink-800"
									}`}
								>
									{key === "category" ? "按分类" : "按来源"}
								</button>
							))}
						</div>
						<label className="relative">
							<span className="sr-only">搜索技能</span>
							<span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400">
								<Icon name="search" size={14} />
							</span>
							<input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="搜索技能…"
								className="focus-neko w-36 rounded-full border border-sakura-200 bg-surface py-1.5 pl-8 pr-3 text-sm sm:w-56"
							/>
						</label>
						<span className="text-xs text-ink-400">{phase === "ready" ? "已连接" : "连接中…"}</span>
					</div>
				</div>
			</header>

			<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
				{loading && (
					<p className="py-16 text-center text-sm text-ink-500">
						{phase === "ready" ? "加载市场目录…" : "等待网关连接…"}
					</p>
				)}
				{error !== null && (
					<div className="mx-auto max-w-md rounded-card border border-sakura-200 bg-surface p-6 text-center shadow-soft">
						<p className="text-sm text-ink-700">市场目录加载失败，请检查网络后重试。</p>
						<p className="mt-1 break-all font-mono text-xs text-ink-400">{error}</p>
						<button
							type="button"
							onClick={load}
							className="focus-neko mt-4 rounded-full bg-sakura-100 px-4 py-1.5 text-sm font-semibold text-sakura-800"
						>
							重试
						</button>
					</div>
				)}
				{!loading && error === null && filtered.length === 0 && (
					<p className="py-16 text-center text-sm text-ink-500">
						没有匹配的技能。反复出现的需求可以用 `/skill:skill-creator` 自己造一个。
					</p>
				)}

				{groups.map(([group, items]) => (
					<section key={group} className="mb-7">
						<h2 className="mb-2.5 flex items-baseline gap-2 text-lg font-bold text-ink-900">
							{group}
							<span className="text-xs font-normal text-ink-400">{items.length}</span>
						</h2>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{items.map((skill) => (
								<button
									key={skill.name}
									type="button"
									onClick={() => setSelected(skill.name)}
									className="focus-neko rounded-2xl border border-sakura-200 bg-surface p-4 text-left shadow-soft transition-shadow hover:shadow-lift"
								>
									<div className="mb-1 flex items-center justify-between gap-2">
										<span className="truncate text-base font-bold text-ink-900">{skill.name}</span>
										<InstallBadges skill={skill} />
									</div>
									<p className="mb-2.5 line-clamp-2 min-h-10 text-sm text-ink-500">{skill.description}</p>
									<div className="flex items-center gap-2 text-xs text-ink-400">
										<span className="rounded-full bg-tianyi-50 px-2 py-0.5 text-tianyi-800">{skill.source}</span>
										<span className="font-mono">{skill.version}</span>
										<span>{formatSize(skill.sizeBytes)}</span>
									</div>
								</button>
							))}
						</div>
					</section>
				))}
			</main>

			{selected !== null && <SkillDrawer name={selected} onClose={() => setSelected(null)} onChanged={() => load()} />}
		</div>
	);
}
