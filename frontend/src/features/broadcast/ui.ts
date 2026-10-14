/**
 * 广播页共用样式片段。
 * 只用现有设计令牌与共用组件，不新造视觉体系。
 *
 * 分两层：
 * - `panel*` 是**外框**（页面上的卡片），由页面给；
 * - `block*` 是**内容块**（标题行 + 内滚区），面板组件自己用。
 * 这样同一块内容既能放进页面卡片，也能直接塞进弹窗，不必复制一套外框。
 */

/** 页面上的卡片外框 */
export const panelClass =
  "flex min-h-0 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] shadow-twin-level-2";

/** 内容块的标题行 */
export const blockHeadClass =
  "flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5";

export const blockTitleClass = "text-sm font-semibold text-[var(--app-color-text-primary)]";

/** 内容块的内滚区 */
export const blockBodyClass = "min-h-0 flex-1 overflow-auto overscroll-y-contain";

/** 表头 */
export const thClass =
  "sticky top-0 z-10 whitespace-nowrap border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-left text-xs font-medium text-[var(--app-color-text-secondary)]";

export const tdClass = "border-b border-[var(--twin-hairline)] px-3 py-2 text-sm text-[var(--app-color-text-primary)]";

/** 分区行 */
export const rowClass =
  "flex items-center gap-3 border-b border-[var(--twin-hairline)] px-3 py-1.5 text-sm hover:bg-[var(--app-color-surface-hover)]";

/** 状态点 */
export const dotClass = "inline-block h-2 w-2 shrink-0 rounded-full";

export function dotColor(kind: "ok" | "warn" | "bad"): string {
  return kind === "ok"
    ? "var(--app-color-feedback-success)"
    : kind === "warn"
      ? "var(--app-color-feedback-warning)"
      : "var(--app-color-feedback-danger)";
}
