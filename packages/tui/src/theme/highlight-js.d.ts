// highlight.js v11 的语言子路径(highlight.js/lib/languages/*)不带类型声明,在此统一补齐。
declare module "highlight.js/lib/languages/*" {
	import type { LanguageFn } from "highlight.js";
	const language: LanguageFn;
	export default language;
}
