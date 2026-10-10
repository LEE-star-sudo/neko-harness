/** Product language is English; conversation and tool payloads are never translated. */
export const commands = [
	{ name: "exit", description: "Exit neko TUI" },
	{ name: "sessions", description: "Switch or create a session" },
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
	idleHints: "Enter Send  Ctrl+S Sessions  / Commands  Ctrl+C Exit",
	busyHints: "Enter Steer  Alt+Enter Queue  Esc Stop  Ctrl+C Stop",
	idleCompact: "Enter Send  / Commands",
	busyCompact: "Enter Steer  Esc Stop",
};
