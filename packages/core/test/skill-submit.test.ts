import { afterEach, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxText, type TranscriptContext } from "@earendil-works/pi-ai";
import { fauxProvider } from "../../../test/faux.ts";
import { MemoryCredentialStore } from "../src/credentials.ts";
import { createNekoRuntime } from "../src/index.ts";

const dirs: string[] = [];
function directory() {
	const d = realpathSync(mkdtempSync(join(tmpdir(), "neko-skill-submit-")));
	dirs.push(d);
	return d;
}
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const writeSkill = (root: string, name: string, description: string, extra = "") => {
	const skillDir = join(root, ".agents", "skills", name);
	mkdirSync(skillDir, { recursive: true });
	writeFileSync(join(skillDir, "SKILL.md"), `---\ndescription: ${description}\n${extra}---\nbody of ${name}`);
};

async function setup() {
	const home = directory();
	const workspace = directory();
	writeSkill(workspace, "pdf", "Read PDFs");
	writeSkill(workspace, "hidden", "Hidden", "disable-model-invocation: true\n");
	const contexts: TranscriptContext[] = [];
	const faux = fauxProvider({ models: [{ id: "faux-1" }] });
	faux.setResponses(
		Array.from({ length: 20 }, () => (context: TranscriptContext) => {
			contexts.push(context);
			return fauxAssistantMessage([fauxText("ok")]);
		}),
	);
	const runtime = await createNekoRuntime({
		storage: "memory",
		credentials: new MemoryCredentialStore(),
		providers: [faux.provider],
		model: { provider: "faux", modelId: "faux-1" },
		cwd: workspace,
		promptHome: home,
	});
	return { runtime, contexts, workspace };
}

const lastUserText = (context: TranscriptContext): string => {
	const message = [...context.messages].reverse().find((m) => m.role === "user");
	const content = message?.content;
	return typeof content === "string" ? content : (content ?? []).map((b) => (b.type === "text" ? b.text : "")).join("");
};

it("expands /skill: with args into a skill block; hidden skills expand too", async () => {
	const { runtime, contexts, workspace } = await setup();
	try {
		await runtime.waitAnswer(await runtime.submit("/skill:pdf summarize this"));
		const text = lastUserText(contexts[0]!);
		expect(text).toContain(`<skill name="pdf" location="${join(workspace, ".agents", "skills", "pdf", "SKILL.md")}">`);
		expect(text).toContain("body of pdf");
		expect(text).toContain("summarize this");
		expect(text).not.toContain("description: Read PDFs");

		await runtime.waitAnswer(await runtime.submit("/skill:hidden"));
		expect(lastUserText(contexts[1]!)).toContain("body of hidden");
	} finally {
		await runtime.close();
	}
});

it("passes unknown skills through and does not expand block content", async () => {
	const { runtime, contexts } = await setup();
	try {
		await runtime.waitAnswer(await runtime.submit("/skill:nope hi"));
		expect(lastUserText(contexts[0]!)).toBe("/skill:nope hi");

		await runtime.waitAnswer(await runtime.submit([{ type: "text", text: "/skill:pdf" }]));
		expect(lastUserText(contexts[1]!)).toBe("/skill:pdf");
	} finally {
		await runtime.close();
	}
});

it("listSkills returns both levels including hidden skills", async () => {
	const { runtime, workspace } = await setup();
	try {
		const skills = await runtime.listSkills();
		const byName = new Map(skills.map((s) => [s.name, s]));
		expect(byName.get("pdf")?.description).toBe("Read PDFs");
		expect(byName.get("hidden")?.description).toBe("Hidden");
		expect(byName.get("pdf")?.location).toBe(join(workspace, ".agents", "skills", "pdf", "SKILL.md"));

		// A skill added mid-session shows up on the next query (mtime invalidation).
		writeSkill(workspace, "fresh", "Added later");
		const again = await runtime.listSkills();
		expect(again.map((s) => s.name)).toContain("fresh");
	} finally {
		await runtime.close();
	}
});

it("does not expand a duplicate request again after the skill changes", async () => {
	const { runtime, workspace } = await setup();
	try {
		const first = await runtime.submit("/skill:pdf args", { requestId: "skill-retry" });
		await runtime.waitAnswer(first);
		writeSkill(workspace, "pdf", "Changed description");
		writeFileSync(
			join(workspace, ".agents", "skills", "pdf", "SKILL.md"),
			"---\ndescription: Changed\n---\nChanged body",
		);
		const again = await runtime.submit("/skill:pdf args", { requestId: "skill-retry" });
		expect(again.id).toBe(first.id);
	} finally {
		await runtime.close();
	}
});
