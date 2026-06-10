/**
 * 知识库三栏布局 — 每个面板独立滚动
 *
 * ## 架构约束（AI 开发者必读）
 *
 * 1. 高度链：本组件依赖父级提供 `h-full`（确定高度）。
 *    如果包裹本组件的容器没有确定高度，`overflow-y-auto` 无效——面板不会滚动。
 *    高度链追溯：AdminLayout flex-1 → PageTransition min-h-full → Shell h-full → 本组件 h-full
 *
 * 2. 不要在此加 `max-w-*`：内容宽度由父级 AdminLayout 的 `max-w-[1600px]` 控制。
 *    三栏已通过 flex 分区宽度，中间栏无需额外限制。文本可读性由 .docs-prose 的 per-element max-width 处理。
 *
 * 3. 独立滚动：左侧 `aside`、中间 `main`、右侧 `aside` 各有一个 `overflow-y-auto`。
 *    不要把它们合并成单一滚动容器——那样目录和内容会一起滚，失去独立滚动的特性。
 *
 * 4. 图谱视图不使用本组件：图谱需要全屏沉浸式空间，Shell 在 graph 视图下直接渲染
 *    KnowledgeGraphView 而不经过 KnowledgeLayout。
 */
import { type ReactNode, useState, useCallback } from "react";
import { ResizeHandle } from "./ResizeHandle";

interface Props { sidebar: ReactNode; content: ReactNode; outline?: ReactNode }

const KEY = "knowledge-sidebar-width";
const MIN = 180; const MAX = 400; const DEF = 260;

function load(): number {
  try { const v = localStorage.getItem(KEY); if (v) { const n = parseInt(v); if (n >= MIN && n <= MAX) return n; } } catch {}
  return DEF;
}
function save(w: number) { try { localStorage.setItem(KEY, String(w)); } catch {} }

export function KnowledgeLayout({ sidebar, content, outline }: Props) {
  const [w, setW] = useState(load);

  return (
    <div className="flex h-full bg-[var(--app-color-surface-page)]">
      {/* Left: category tree — independent scroll */}
      <aside style={{ width: w }} className="shrink-0 overflow-y-auto border-r border-[var(--app-color-border-default)] bg-[var(--sidebar)]">
        {sidebar}
      </aside>
      <ResizeHandle onResize={(d) => setW(p => { const n = Math.min(MAX, Math.max(MIN, p + d)); save(n); return n; })} />
      {/* Center: main content — independent scroll */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {content}
      </main>
      {/* Right: outline — independent scroll, hidden < 1280px */}
      {outline && (
        <aside className="hidden w-[220px] shrink-0 overflow-y-auto border-l border-[var(--app-color-border-default)] bg-[var(--sidebar)] xl:block">
          {outline}
        </aside>
      )}
    </div>
  );
}
