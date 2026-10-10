/** Product language is English; conversation and tool payloads are never translated. */
import type { SlashCommand } from "@earendil-works/pi-tui";

export const commands: SlashCommand[] = [
	{ name: "compact", description: "Compact context (/compact optional instructions)" },
	{ name: "exit", description: "Exit neko TUI" },
	{ name: "sessions", description: "Switch or create a session" },
	{ name: "login", description: "Configure DeepSeek API key" },
	{ name: "model", description: "Choose a model" },
	{ name: "think", description: "Set thinking level (/think high)" },
	{ name: "fork", description: "Fork this session" },
	{ name: "archive", description: "Archive this session" },
];
export const labels = {
	ready: "Ready",
	connecting: "Connecting...",
	loading: "Loading...",
	applying: "Applying...",
	noResults: "No results",
	close: "Esc Close",
	retry: "Enter Retry  Esc Close",
	select: "Up/Down Select  Enter Apply  Esc Close",
	idleHints: "Enter Send  Ctrl+S Sessions  / Commands  Esc Esc Clear  Ctrl+C Exit",
	busyHints: "Enter Steer  Alt+Enter Queue  Esc Stop  Ctrl+C Stop",
	idleCompact: "Enter Send  / Commands",
	busyCompact: "Enter Steer  Esc Stop",
};
