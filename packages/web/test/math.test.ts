import { expect, it } from "bun:test";
import { JSDOM } from "jsdom";

// DOMPurify 在导入时绑定全局 window，因此先安装 happy-dom 再动态导入被测模块。
const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.window.document });
const { renderMarkdownHtml } = await import("../src/client/lib/markdown-html.ts");
const { renderMath } = await import("../src/client/lib/math.ts");

it("行内与块级公式被渲染，不残留定界符", () => {
	const html = renderMarkdownHtml(
		"相似度 $s_i = q\\cdot k_i$ 如下：\n\n$$\\text{Attn}(q,K,V)=\\text{softmax}\\!\\left(\\frac{qK^{\\top}}{\\sqrt{d_k}}\\right)V$$\n",
	);
	expect(html).toContain("katex-display");
	expect(html).toContain('class="katex"');
	expect(html).not.toContain("$");
	expect(html).not.toContain("data-math");
});

it("转义命令保持原义", () => {
	const html = renderMarkdownHtml("集合 $\\{a,b\\}$ 与间距 $a\\,b\\!c$");
	expect(html).not.toContain("$");
	expect(html).toContain("{");
});

it("跨行块公式", () => {
	const html = renderMarkdownHtml("$$\n\\sum_{i=1}^{10}\\alpha_i v_i\n$$");
	expect(html).toContain("katex-display");
});

it("代码中的美元符号不被渲染", () => {
	const html = renderMarkdownHtml("`$x$` 和\n\n```sh\necho $HOME $x$\n```");
	expect(html).not.toContain("katex");
	expect(html).toContain("$x$");
});

it("货币与转义美元保持原文", () => {
	const html = renderMarkdownHtml("价格 $5 and $10，以及 \\$a\\$");
	expect(html).not.toContain("katex");
	expect(html).toContain("$5 and $10");
});

it("非法公式降级为原文，其余内容正常", () => {
	const html = renderMarkdownHtml("坏公式 $\\frac{a$ 之后 $x^2$");
	expect(html).toContain("$\\frac{a$");
	expect(html).toContain('class="katex"');
});

it("未闭合公式保持原文", () => {
	const html = renderMarkdownHtml("$$\\sum_{i=1}");
	expect(html).not.toContain("katex");
	expect(html).toContain("$$\\sum_{i=1}");
});

it("可产生链接的命令不生成链接", () => {
	for (const tex of ["\\href{https://evil.test}{x}", "\\url{https://evil.test}"]) {
		const html = renderMath(tex, false) ?? "";
		expect(html).not.toContain("<a");
		expect(html).not.toContain('evil.test"');
	}
	expect(renderMath("x^2", false)).toContain("katex");
});

it("消毒移除公式中的事件属性与脚本", () => {
	const html = renderMarkdownHtml("$x$ <img src=x onerror=alert(1)> <script>alert(1)</script>");
	expect(html).not.toContain("onerror");
	expect(html).not.toContain("<script");
	expect(html).toContain("katex");
});

it("公式内的 HTML 被转义为文本", () => {
	const html = renderMarkdownHtml("$<img src=x onerror=alert(1)>$");
	expect(html).not.toContain("<img");
});

it("模型伪造的占位符不会被回填", () => {
	const html = renderMarkdownHtml('<span data-math="x:0"></span> $a$');
	expect(html).toContain('data-math="x:0"');
});
