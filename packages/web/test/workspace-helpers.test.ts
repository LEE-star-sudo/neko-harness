import { expect, it } from "bun:test";
import { clampWorkspaceWidth, WORKSPACE_WIDTH } from "../src/client/lib/layout.ts";
import {
	agentLabel,
	ancestorDirs,
	formatBytes,
	isNotFound,
	lineCount,
	splitPath,
} from "../src/client/lib/workspace.ts";

it("clamps the sidebar width to its bounds", () => {
	expect(clampWorkspaceWidth(100)).toBe(WORKSPACE_WIDTH.min);
	expect(clampWorkspaceWidth(5000)).toBe(WORKSPACE_WIDTH.max);
	expect(clampWorkspaceWidth(480.4)).toBe(480);
	expect(WORKSPACE_WIDTH.min).toBeLessThan(WORKSPACE_WIDTH.initial);
	expect(WORKSPACE_WIDTH.initial).toBeLessThan(WORKSPACE_WIDTH.max);
});

it("splits paths, lists ancestors and labels agents", () => {
	expect(splitPath("src/ui/button.tsx")).toEqual({ name: "button.tsx", dir: "src/ui" });
	expect(splitPath("README.md")).toEqual({ name: "README.md", dir: "" });
	expect(splitPath("/etc/hosts")).toEqual({ name: "hosts", dir: "/etc" });
	expect(ancestorDirs("a/b/c.ts")).toEqual(["a", "a/b"]);
	expect(ancestorDirs("c.ts")).toEqual([]);
	expect(agentLabel("main")).toBe("主 agent");
	expect(agentLabel("Fix the parser")).toBe("Fix the parser");
});

it("counts displayed lines without a phantom last line and formats sizes", () => {
	expect(lineCount("")).toBe(1);
	expect(lineCount("a")).toBe(1);
	expect(lineCount("a\n")).toBe(1);
	expect(lineCount("a\nb")).toBe(2);
	expect(lineCount("a\n\n")).toBe(2);
	expect(formatBytes(12)).toBe("12 B");
	expect(formatBytes(2048)).toBe("2.0 KiB");
	expect(formatBytes(512 * 1024)).toBe("512 KiB");
	expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MiB");
});

it("recognises the server's missing-file error", () => {
	expect(isNotFound("File not found.")).toBe(true);
	expect(isNotFound("ENOENT: no such file")).toBe(true);
	expect(isNotFound("Path is outside the workspace.")).toBe(false);
	expect(isNotFound(undefined)).toBe(false);
});
