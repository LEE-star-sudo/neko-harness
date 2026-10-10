// 投影相关 helper 已上挪至 @neko-harness/core（gateway 与 web 共用）；此处 re-export 保持导入路径不变。
export {
	summarizeToolCall,
	type ToolSummary,
	toolResultText,
	totalUsage,
	truncateMiddle,
	userText,
} from "@neko-harness/core";
