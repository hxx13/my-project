import { type ReactNode, useState, useCallback } from "react";
import { ResizeHandle } from "./ResizeHandle";

interface KnowledgeLayoutProps {
  sidebar: ReactNode;
  content: ReactNode;
  outline?: ReactNode;
}

const STORAGE_KEY = "knowledge-sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 180;
const MAX_WIDTH = 400;

function loadSidebarWidth(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const w = parseInt(stored, 10);
      if (w >= MIN_WIDTH && w <= MAX_WIDTH) return w;
    }
  } catch {}
  return DEFAULT_WIDTH;
}

function saveSidebarWidth(w: number) {
  try { localStorage.setItem(STORAGE_KEY, String(w)); } catch {}
}

export function KnowledgeLayout({ sidebar, content, outline }: KnowledgeLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);

  const handleResize = useCallback((delta: number) => {
    setSidebarWidth(prev => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, prev + delta));
      saveSidebarWidth(next);
      return next;
    });
  }, []);

  return (
    <div className="flex h-full bg-[var(--app-color-surface-page)]">
      {/* Left sidebar — draggable width, independent scroll */}
      <aside
        style={{ width: sidebarWidth }}
        className="shrink-0 overflow-y-auto border-r border-[var(--app-color-border-default)] bg-[var(--sidebar)]"
      >
        {sidebar}
      </aside>

      <ResizeHandle onResize={handleResize} />

      {/* Center content — fills remaining space, scrolls when overflow */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {content}
      </main>

      {/* Right outline — 240px, hidden below 1280px */}
      {outline && (
        <aside className="hidden w-[240px] shrink-0 overflow-y-auto border-l border-[var(--app-color-border-default)] bg-[var(--sidebar)] xl:block">
          {outline}
        </aside>
      )}
    </div>
  );
}

export function KnowledgeLayoutSkeleton() {
  return (
    <div className="flex h-full bg-[var(--app-color-surface-page)]">
      <aside className="w-[260px] shrink-0 border-r border-[var(--app-color-border-default)] bg-[var(--sidebar)] p-4">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-5 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]" style={{ width: `${60 + Math.random() * 40}%` }} />
          ))}
        </div>
      </aside>
      <main className="flex-1 p-6">
        <div className="space-y-4">
          <div className="h-8 w-3/4 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]" />
          <div className="h-4 w-1/3 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]" />
          <div className="h-px bg-[var(--app-color-border-default)]" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]" style={{ width: `${80 + Math.random() * 20}%` }} />
          ))}
        </div>
      </main>
    </div>
  );
}
