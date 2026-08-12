/// <reference types="@songloft/plugin-sdk" />

/**
 * 宿主(QuickJS 沙箱宿主)注入的全局函数声明。
 *
 * 注意:
 *  - 只声明 lib.dom / SDK 里【不存在】的标识符(如 __go_send 等),避免重复声明冲突。
 *  - `crypto` / `zlib` / `Buffer` 等宿主 polyfill 请通过 `(globalThis as any).xxx` 访问
 *    (运行期由宿主注入),不要在这里做全局声明——否则会与 lib.dom 的 `crypto` 冲突。
 */

declare function __go_send(name: string, dataJson: string): void;

declare function __go_raw_inflate(hex: string): string;

declare function __go_raw_deflate(data: string): string;

declare var __lx_script_sources: Record<string, any> | undefined;
