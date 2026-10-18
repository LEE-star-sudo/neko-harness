import type { ChatView } from "@neko-harness/core";
import type { QuestionList, QuestionRecord, QuestionSummary, TodoList } from "@neko-harness/core/interactions";

/** DOM-free builders shared by the todo / question tests. */
export const question = (over: Partial<QuestionRecord> = {}): QuestionRecord => ({
	id: 7,
	callId: "call-7",
	version: "v1",
	question: "Which database should we use?",
	multiple: false,
	options: [
		{ id: "pg", label: "Postgres", recommended: true },
		{ id: "sqlite", label: "SQLite", description: "Embedded, zero setup" },
	],
	status: "pending",
	answer: null,
	createdAt: 1000,
	settledAt: null,
	...over,
});

export const summaryOf = (record: QuestionRecord): QuestionSummary => ({
	id: record.id,
	version: record.version,
	preview: record.question.slice(0, 256),
	multiple: record.multiple,
	optionCount: record.options.length,
	createdAt: record.createdAt,
});

export type ViewOptions = {
	busy?: boolean;
	/** Records are summarized; `null` leaves the field out, like a gateway built before ask_user. */
	questions?: readonly QuestionRecord[] | QuestionList | null;
	/** `null` leaves the field out, like a gateway built before todos. */
	todos?: TodoList | null;
	items?: ChatView["items"];
	subagents?: ChatView["subagents"];
	queued?: ChatView["queued"];
};

function questionList(questions: ViewOptions["questions"]): QuestionList | undefined {
	if (questions === null) return undefined;
	if (questions === undefined) return { revision: 1, pending: [] };
	if (Array.isArray(questions)) return { revision: 1, pending: questions.map(summaryOf) };
	return questions as QuestionList;
}

export function chatView(options: ViewOptions = {}): ChatView {
	const questions = questionList(options.questions);
	const todos = options.todos === undefined ? { revision: 1, items: [] } : options.todos;
	return {
		model: "faux/faux-1",
		agent: { model: null, thinkingLevel: null },
		cwd: "/w",
		busy: options.busy ?? true,
		status: null,
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
		items: options.items ?? [],
		streaming: null,
		...(options.queued ? { queued: options.queued } : {}),
		...(options.subagents ? { subagents: options.subagents } : {}),
		...(questions ? { questions } : {}),
		...(todos ? { todos } : {}),
	} as unknown as ChatView;
}
