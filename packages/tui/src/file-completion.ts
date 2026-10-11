import { type AutocompleteProvider, CombinedAutocompleteProvider, type SlashCommand } from "@earendil-works/pi-tui";
import { mentionAt } from "@neko-harness/core/file-mentions";
import { findFd, relativeQuery, workspaceTarget } from "@neko-harness/core/workspace-files";
/** Keep Pi's editor, quoting and ordering; constrain only @ candidates. */
export function fileCompletion(
	commands: SlashCommand[],
	root: string,
	notice: (text: string) => void,
): AutocompleteProvider {
	const fd = findFd();
	const native = new CombinedAutocompleteProvider(commands, root, fd);
	let lastNotice = "";
	const notify = (message: string) => {
		if (message !== lastNotice) {
			lastNotice = message;
			notice(message);
		}
	};
	return {
		applyCompletion: native.applyCompletion.bind(native),
		shouldTriggerFileCompletion: native.shouldTriggerFileCompletion.bind(native),
		async getSuggestions(lines, line, col, options) {
			const token = mentionAt(lines[line] ?? "", col);
			if (!token) return native.getSuggestions(lines, line, col, options);
			if (!fd) {
				notify("Install fd (or fdfind) for @ file completion.");
				return null;
			}
			try {
				relativeQuery(token.query);
				const signal = AbortSignal.any([options.signal, AbortSignal.timeout(2000)]);
				const result = await native.getSuggestions(lines, line, col, { ...options, signal });
				if (signal.aborted) {
					if (!options.signal.aborted) notify("File search timed out. Narrow the query.");
					return null;
				}
				if (!result) return null;
				const items = [];
				for (const item of result.items) {
					const path = item.value.slice(1).replace(/^"|"$/g, "").replace(/\/$/, "");
					if (path.split(/[\\/]/).includes(".git")) continue;
					try {
						await workspaceTarget(root, path);
						items.push(item);
					} catch {
						/* outside or disappeared */
					}
				}
				if (items.length >= 20) notify("Showing up to 20 paths. Type more to narrow results.");
				else lastNotice = "";
				return options.signal.aborted ? null : { ...result, items };
			} catch (error) {
				if (!options.signal.aborted) notify(error instanceof Error ? error.message : "File search failed.");
				return null;
			}
		},
	};
}
