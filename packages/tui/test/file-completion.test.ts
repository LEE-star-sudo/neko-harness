import { expect, it } from "bun:test";
import { fileCompletion } from "../src/file-completion.ts";

it("uses Pi for file and directory completion without submitting", async () => {
	const provider = fileCompletion([], process.cwd(), () => {});
	const query = "@packages/core/src/";
	const result = await provider.getSuggestions([query], 0, query.length, { signal: new AbortController().signal });
	expect(result?.items.some((i) => i.value === "@packages/core/src/runtime.ts")).toBe(true);
	const item = result!.items.find((i) => i.value === "@packages/core/src/runtime.ts")!;
	const applied = provider.applyCompletion([query], 0, query.length, item, result!.prefix);
	expect(applied.lines[0]).toBe("@packages/core/src/runtime.ts ");
	const invalid = await provider.getSuggestions(["@../"], 0, 4, { signal: new AbortController().signal });
	expect(invalid).toBeNull();
});

it("closes Pi candidates before starting the double-Escape clear sequence", async () => {
	const { TuiAltScreen, visibleWidth } = await import("@earendil-works/pi-tui");
	const { BoundedEditor } = await import("../src/components/editor.ts");
	const { getEditorTheme } = await import("../src/theme.ts");
	for (const width of [120, 80, 60]) {
		const editor = new BoundedEditor(
			new TuiAltScreen({ columns: width, rows: 24 } as import("@earendil-works/pi-tui").Terminal),
			getEditorTheme(),
		);
		editor.setAutocompleteProvider(fileCompletion([], process.cwd(), () => {}));
		editor.render(width);
		editor.handleInput("@");
		await Bun.sleep(100);
		expect(editor.isShowingAutocomplete()).toBe(true);
		expect(editor.render(width).every((line) => visibleWidth(line) <= width)).toBe(true);
		editor.handleInput("\x1b");
		expect(editor.isShowingAutocomplete()).toBe(false);
		expect(editor.getText()).toBe("@");
		editor.handleInput("\x1b");
		expect(editor.getText()).toBe("@");
		editor.handleInput("\x1b");
		expect(editor.getText()).toBe("");
	}
});
