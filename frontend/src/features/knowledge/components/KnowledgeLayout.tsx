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
