/**
 * 布局常量单一来源。与 styles.css 中的 --breakpoint-mobile / .chat-column
 * 保持一致，由 test/layout-tokens.test.ts 对拍守护（CSS 媒体查询无法引用
 * 脚本常量，只能靠测试防止漂移）。
 * 本模块保持 DOM-free（根 tsc 不含 DOM lib 也会编译到它），
 * matchMedia 调用由使用方（client 代码）发起。
 */
export const MOBILE_BREAKPOINT = 768;
export const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT}px)`;
export const MESSAGE_COLUMN_REM = 48;
