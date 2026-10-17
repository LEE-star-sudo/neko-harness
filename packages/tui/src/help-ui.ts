import { getKeybindings, matchesKey, TUI_KEYBINDINGS, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { PickerDetail } from "./components/picker.ts";
import { shortcutHints } from "./components/shortcut-hints.ts";
import { commands } from "./labels.ts";
import { theme } from "./theme/index.ts";

const keyLabel = (key: string) =>
	key
		.split("+")
		.map(
			(part) => ({ escape: "Esc", pageUp: "PgUp", pageDown: "PgDn" })[part] ?? part[0]!.toUpperCase() + part.slice(1),
		)
		.join("+");

export function helpLines(platform: string = process.platform): string[] {
	const rows: string[] = [];
	const section = (title: string, hints: readonly (readonly [string, string])[]) => {
		rows.push(theme.accent(title), ...hints.map(([key, description]) => shortcutHints([key, description])), "");
	};
	section("Chat", [
		["Enter", "Send; steer while running"],
		["Alt+Enter", "Queue while running"],
		["Esc", "Stop a running task or blocking compaction"],
		["Esc Esc", "Clear draft when idle (press twice quickly)"],
		["Up / Down", "Browse previous inputs in this session"],
		["Ctrl+C", "Stop while running; exit when idle"],
		["Ctrl+S", "Open sessions"],
		[platform === "win32" ? "Alt+V" : "Ctrl+V", "Paste clipboard image or text"],
		["/", "Complete commands"],
		["@", "Complete workspace files"],
		["/skill:", "Complete installed skills"],
	]);
	section("Menus", [
		["↑↓", "Select"],
		["Enter", "Open or apply"],
		["Type", "Filter list"],
		["Esc / Ctrl+C", "Back or close"],
		["↑↓ / Wheel", "Scroll details"],
		["PgUp / PgDn", "Page through details"],
	]);
	section("Agents", [
		["→", "Open agents from an empty editor; open selected task"],
		["←", "Return to main chat"],
		["E", "Expand or collapse tool results and thinking"],
		["↑ / ↓", "Select Allow once / Deny when approval appears"],
		["Enter", "Confirm selected approval option"],
		["PgUp / PgDn", "Scroll full approval command"],
		["[/]", "Select another pending approval"],
		["S", "Stop current round; keep agent context (Enter confirms)"],
		["Click", "Open round card or status-bar Agents entry"],
	]);
	section("Jobs", [
		["/jobs", "View background jobs"],
		["Enter", "Open job output"],
		["S", "Stop selected running job (Enter confirms)"],
		["End", "Jump to the newest output"],
		["←", "Back"],
	]);
	section("Web search", [
		["/search", "Choose the web search provider"],
		["Enter", "Apply the highlighted provider"],
	]);
	section("Skills", [
		["U", "Install for user"],
		["P", "Install for project"],
		["D", "Remove"],
		["V", "Preview"],
		["Y / N", "Confirm / cancel changes"],
	]);
	section("Credentials", [
		["← / →", "Switch provider"],
		["Enter", "Save key"],
		["Ctrl+R", "Remove saved key"],
	]);
	const bindings = getKeybindings();
	for (const [prefix, title] of [
		["tui.editor.", "Editing"],
		["tui.altScreen.", "Main transcript and search"],
	] as const) {
		const hints: [string, string][] = [];
		for (const id of Object.keys(TUI_KEYBINDINGS) as (keyof typeof TUI_KEYBINDINGS)[]) {
			if (!id.startsWith(prefix) || id === "tui.editor.pageUp" || id === "tui.editor.pageDown") continue;
			const keys = bindings.getKeys(id);
			if (keys.length) hints.push([keys.map(keyLabel).join(" / "), bindings.getDefinition(id).description ?? id]);
		}
		if (prefix === "tui.editor.") {
			for (const id of ["tui.input.newLine", "tui.input.tab"] as const)
				hints.push([bindings.getKeys(id).map(keyLabel).join(" / "), bindings.getDefinition(id).description ?? id]);
		}
		section(title, hints);
	}
	section("Mouse", [
		["Wheel", "Scroll transcript or details"],
		["Click", "Expand messages, thinking, tools and images"],
		["Drag", "Select text; release to copy"],
	]);
	section(
		"Commands",
		commands.map((command) => [`/${command.name}`, command.description ?? ""]),
	);
	return rows;
}

export class HelpDetail implements PickerDetail {
	backCloses = true;
	#offset = 0;
	#max = 0;
	#page = 1;
	get help() {
		return shortcutHints(["↑↓/Wheel", "Scroll"], ["PgUp/PgDn", "Page"], ["Esc", "Close"]);
	}
	scroll(delta: number) {
		this.#offset = Math.max(0, Math.min(this.#max, this.#offset + delta));
	}
	handleKey(data: string): boolean {
		if (matchesKey(data, "up")) this.scroll(-1);
		else if (matchesKey(data, "down")) this.scroll(1);
		else if (matchesKey(data, "pageUp")) this.scroll(-this.#page);
		else if (matchesKey(data, "pageDown")) this.scroll(this.#page);
		else return false;
		return true;
	}
	lines(width: number, height: number): readonly string[] {
		const rows = helpLines().flatMap((line) => wrapTextWithAnsi(line, width));
		this.#max = Math.max(0, rows.length - height);
		this.#page = Math.max(1, height - 1);
		this.#offset = Math.min(this.#offset, this.#max);
		return rows.slice(this.#offset, this.#offset + height);
	}
}
