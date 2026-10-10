import { expect, it } from "bun:test";
import { commandSuggestions, isCommandQuery } from "../src/client/lib/command-suggestions.ts";

const skills = [
	{ name: "alpha", description: "First", location: "/a/SKILL.md" },
	{ name: "beta", description: "Second", location: "/b/SKILL.md" },
	{ name: "plugin:task", description: "Namespaced", location: "/c/SKILL.md" },
];
it("discovers skills before the colon and filters command prefixes", () => {
	expect(commandSuggestions("/", skills).map((s) => s.label)).toEqual([
		"/compact",
		"/skill:alpha",
		"/skill:beta",
		"/skill:plugin:task",
	]);
	for (const text of ["/s", "/skill", "/skill:"]) expect(commandSuggestions(text, skills)).toHaveLength(3);
	expect(commandSuggestions("/skill:b", skills).map((s) => s.label)).toEqual(["/skill:beta"]);
	expect(commandSuggestions("/co", skills).map((s) => s.label)).toEqual(["/compact"]);
	expect(commandSuggestions("/unknown", skills)).toEqual([]);
	expect(commandSuggestions("/skill:", [])).toEqual([]);
});
it("allows discoverable skill names and stops completion at arguments", () => {
	expect(isCommandQuery("/skill:plugin:task")).toBe(true);
	expect(isCommandQuery("/skill:alpha args")).toBe(false);
	expect(isCommandQuery("/skill:alpha\nargs")).toBe(false);
	expect(isCommandQuery("email@example.com")).toBe(false);
});
