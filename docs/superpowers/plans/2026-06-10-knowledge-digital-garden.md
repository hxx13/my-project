# 知识库数字花园重构 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将知识库从多页面跳转模式重构为单页应用壳的数字花园，新增知识图谱、生长时间线、标签系统和仪表盘。

**Architecture:** 单条路由 `/admin/knowledge` 挂载 KnowledgeShell，内部 5 种视图（仪表盘/文档浏览/图谱/时间线/编辑器）由 `useKnowledgeShell` hook 的状态机驱动。左侧目录树重构为回调模式（点击不导航，更新 state）。后端新增 4 个 Controller + 3 个 Service，新增 6 个 API 端点，数据库加 1 个 tags JSON 列。

**Tech Stack:** React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui + TanStack Query v5 + D3.js + Spring Boot + MyBatis + MySQL

**Spec:** `docs/superpowers/specs/2026-06-10-knowledge-digital-garden-design.md`
**Base Spec:** `docs/数字花园设计计划.md` (v2, 已有后端+数据库设计)

---

## 文件变更地图

### 新建文件

| 文件 | 职责 |
|------|------|
| `frontend/src/features/knowledge/hooks/useKnowledgeShell.ts` | 壳状态机：当前视图、选中文档、编辑模式、query params 同步 |
| `frontend/src/features/knowledge/components/KnowledgeShell.tsx` | 主壳组件：TabBar + 三栏布局 + 视图路由 |
| `frontend/src/features/knowledge/components/TabBar.tsx` | 顶栏：视图切换 tabs + 新建按钮 |
| `frontend/src/features/knowledge/components/KnowledgeDashboard.tsx` | 仪表盘：统计卡片 + 标签云 + 文档卡片网格 |
| `frontend/src/features/knowledge/components/KnowledgeGraphView.tsx` | 知识图谱：D3 力导向图 + 筛选面板 |
| `frontend/src/features/knowledge/components/KnowledgeTimelineView.tsx` | 生长记录：Git-log 风格垂直时间线 |
| `frontend/src/features/knowledge/components/KnowledgeHistoryDrawer.tsx` | 版本历史：右侧滑入 Drawer |
| `frontend/src/features/knowledge/components/TagCloud.tsx` | 标签云组件（可复用） |
| `frontend/src/features/knowledge/components/BacklinksList.tsx` | 反向链接列表 |
| `frontend/src/features/knowledge/components/ResizeHandle.tsx` | 可拖拽分隔条 |
| `src/main/java/com/example/demo/modules/knowledge/service/WikilinkScanner.java` | 正则扫描 `content_md` 中的 `[[title]]` |
| `src/main/java/com/example/demo/modules/knowledge/service/ReferenceAnalyzer.java` | 关键词共现 + 分类相似度自动发现引用 |
| `src/main/java/com/example/demo/modules/knowledge/service/GraphService.java` | 合并手动+自动引用，构建 nodes+edges |
| `src/main/java/com/example/demo/modules/knowledge/controller/KnowledgeGraphController.java` | `/api/admin/knowledge/graph/**` |
| `src/main/java/com/example/demo/modules/knowledge/controller/KnowledgeTimelineController.java` | `/api/admin/knowledge/timeline/**` |
| `src/main/java/com/example/demo/modules/knowledge/controller/KnowledgeTagController.java` | `/api/admin/knowledge/tags/**` |
| `src/main/java/com/example/demo/modules/knowledge/controller/KnowledgeStatsController.java` | `/api/admin/knowledge/stats/**` |
| `src/main/java/com/example/demo/modules/knowledge/model/GraphResponse.java` | 图谱响应 DTO |
| `src/main/java/com/example/demo/modules/knowledge/model/TimelineResponse.java` | 时间线响应 DTO |
| `src/main/java/com/example/demo/modules/knowledge/model/TagStatsResponse.java` | 标签统计 DTO |
| `src/main/java/com/example/demo/modules/knowledge/model/StatsResponse.java` | 仪表盘统计 DTO |
| `scripts/migration_knowledge_tags.sql` | `ALTER TABLE knowledge_pages ADD COLUMN tags JSON` |

### 修改文件

| 文件 | 变更 |
|------|------|
| `frontend/src/router/index.tsx` | 删除 5 条知识库路由，保留 1 条 |
| `frontend/src/pages/AdminKnowledgeHomePage.tsx` | 简化为 `<KnowledgeShell />` 挂载点 |
| `frontend/src/features/knowledge/components/KnowledgeLayout.tsx` | 左侧栏支持可拖拽调整宽度 |
| `frontend/src/features/knowledge/components/KnowledgeCategoryTree.tsx` | `onNavigate` → `onSelectPage` 回调，不调 `navigate()` |
| `frontend/src/features/knowledge/components/KnowledgePageRenderer.tsx` | `[[wikilink]]` 渲染为可点击链接 |
| `frontend/src/features/knowledge/components/KnowledgeEditorPanel.tsx` | 新增标签输入 + `[[wikilink]]` 自动补全 |
| `frontend/src/api/domains/knowledge.api.ts` | 新增 6 个 API 函数 |
| `frontend/src/features/knowledge/types.ts` | 新增类型：GraphData, TimelineEvent, TagStats 等 |
| `src/main/java/com/example/demo/modules/knowledge/service/KnowledgePageService.java` | save 方法加入标签保存 + wikilink 扫描调用 |
| `src/main/java/com/example/demo/common/exception/ErrorCodeConstants.java` | 新增 KNOWLEDGE_GRAPH_* 错误码（如需要） |

### 删除文件

| 文件 | 原因 |
|------|------|
| `frontend/src/pages/AdminKnowledgePageDetail.tsx` | 并入 KnowledgeShell 浏览视图 |
| `frontend/src/pages/AdminKnowledgeEditorPage.tsx` | 并入 KnowledgeShell 编辑模式 |
| `frontend/src/pages/AdminKnowledgeHistoryPage.tsx` | 并入 KnowledgeHistoryDrawer |

---

## Phase 1: 壳 + 浏览打通（核心）

### Task 1.1: 壳状态管理 Hook

**Files:**
- Create: `frontend/src/features/knowledge/hooks/useKnowledgeShell.ts`
- Modify: `frontend/src/features/knowledge/types.ts`

- [ ] **Step 1: 新增壳状态类型定义**

编辑 `frontend/src/features/knowledge/types.ts`，在文件末尾追加：

```typescript
// ── Shell State ──
export type ShellView = 'browse' | 'graph' | 'timeline';

export interface ShellState {
  view: ShellView;
  selectedPageId: number | null;
  isEditing: boolean;
  editingPageId: number | null;  // null = 新建模式
  isHistoryOpen: boolean;
  historyPageId: number | null;
  searchParams: URLSearchParams;  // 同步到 URL
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: number;
  title: string;
  categoryId: number;
  categoryName: string;
  refCount: number;
}

export interface GraphEdge {
  source: number;
  target: number;
  type: 'manual' | 'auto';
}

export interface TimelineEvent {
  id: number;
  pageId: number;
  pageTitle: string;
  categoryName: string;
  type: 'created' | 'edited' | 'imported' | 'rollback';
  author: string;
  summary: string | null;
  createdAt: string;
}

export interface TagStats {
  name: string;
  count: number;
}

export interface KnowledgeStats {
  totalPages: number;
  totalCategories: number;
  totalTags: number;
  lastUpdated: string | null;
}
```

- [ ] **Step 2: 编写 useKnowledgeShell hook**

创建 `frontend/src/features/knowledge/hooks/useKnowledgeShell.ts`：

```typescript
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ShellView } from '@/features/knowledge/types';

interface UseKnowledgeShellReturn {
  view: ShellView;
  selectedPageId: number | null;
  isEditing: boolean;
  editingPageId: number | null;
  isHistoryOpen: boolean;
  historyPageId: number | null;
  setView: (v: ShellView) => void;
  selectPage: (id: number) => void;
  deselectPage: () => void;
  startEdit: (pageId?: number) => void;
  stopEdit: () => void;
  openHistory: (pageId: number) => void;
  closeHistory: () => void;
}

export function useKnowledgeShell(): UseKnowledgeShellReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const view = (searchParams.get('view') as ShellView) || 'browse';
  const selectedPageId = searchParams.get('page') ? Number(searchParams.get('page')) : null;
  const editingPageId = searchParams.has('edit') ? Number(searchParams.get('edit')) : null;
  const isEditing = editingPageId !== null || searchParams.has('new');

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyPageId, setHistoryPageId] = useState<number | null>(null);

  const setView = useCallback((v: ShellView) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('view', v);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const selectPage = useCallback((id: number) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('page', String(id));
      next.delete('edit');
      next.delete('new');
      return next;
    }, { replace: false });
  }, [setSearchParams]);

  const deselectPage = useCallback(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('page');
      next.delete('edit');
      next.delete('new');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const startEdit = useCallback((pageId?: number) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (pageId) {
        next.set('edit', String(pageId));
        next.delete('new');
      } else {
        next.set('new', '');
        next.delete('edit');
        next.delete('page');
      }
      return next;
    }, { replace: false });
  }, [setSearchParams]);

  const stopEdit = useCallback(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('edit');
      next.delete('new');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const openHistory = useCallback((pageId: number) => {
    setHistoryPageId(pageId);
    setIsHistoryOpen(true);
  }, []);

  const closeHistory = useCallback(() => {
    setIsHistoryOpen(false);
    setHistoryPageId(null);
  }, []);

  return {
    view, selectedPageId, isEditing, editingPageId: editingPageId ?? null,
    isHistoryOpen, historyPageId,
    setView, selectPage, deselectPage, startEdit, stopEdit, openHistory, closeHistory,
  };
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30
```

预期：与本次变更无关的已有类型错误可忽略，但 `useKnowledgeShell.ts` 和 `types.ts` 本身无错误。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/knowledge/types.ts frontend/src/features/knowledge/hooks/useKnowledgeShell.ts
git commit -m "feat: add useKnowledgeShell hook and shell types"
```

---

### Task 1.2: TabBar 组件

**Files:**
- Create: `frontend/src/features/knowledge/components/TabBar.tsx`

- [ ] **Step 1: 编写 TabBar 组件**

创建 `frontend/src/features/knowledge/components/TabBar.tsx`：

```typescript
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShellView } from "@/features/knowledge/types";

interface Props {
  view: ShellView;
  onViewChange: (v: ShellView) => void;
  onNewDocument: () => void;
}

const TABS: { key: ShellView; label: string; icon: string }[] = [
  { key: 'browse', label: '文档浏览', icon: '📄' },
  { key: 'graph', label: '知识图谱', icon: '🕸️' },
  { key: 'timeline', label: '生长记录', icon: '🌱' },
];

export function TabBar({ view, onViewChange, onNewDocument }: Props) {
  return (
    <div className="flex items-center border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 h-9 shrink-0">
      <div className="flex items-center gap-0">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => onViewChange(tab.key)}
            className={cn(
              "px-3 py-1.5 text-[11px] font-medium transition-colors border-b-2 -mb-[1px]",
              view === tab.key
                ? "border-[var(--app-color-accent)] text-[var(--app-color-accent)]"
                : "border-transparent text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-secondary)]"
            )}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
      <div className="ml-auto">
        <button
          onClick={onNewDocument}
          className="flex items-center gap-1 rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-3 py-1 text-[11px] font-medium text-white hover:bg-[var(--app-color-accent-hover)]"
        >
          <Plus className="size-3" />
          新建
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/knowledge/components/TabBar.tsx
git commit -m "feat: add TabBar component for view switching"
```

---

### Task 1.3: 可拖拽分隔条组件

**Files:**
- Create: `frontend/src/features/knowledge/components/ResizeHandle.tsx`
- Modify: `frontend/src/features/knowledge/components/KnowledgeLayout.tsx`

- [ ] **Step 1: 编写 ResizeHandle 组件**

创建 `frontend/src/features/knowledge/components/ResizeHandle.tsx`：

```typescript
import { useCallback, useRef, useEffect } from "react";

interface Props {
  onResize: (delta: number) => void;
  direction?: 'horizontal' | 'vertical';
}

export function ResizeHandle({ onResize, direction = 'horizontal' }: Props) {
  const dragging = useRef(false);
  const startX = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [direction]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      startX.current = e.clientX;
      onResize(delta);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onResize, direction]);

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-[4px] shrink-0 cursor-col-resize hover:bg-[var(--app-color-accent)] transition-colors bg-transparent active:bg-[var(--app-color-accent)] relative group"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}
```

- [ ] **Step 2: 修改 KnowledgeLayout 支持可拖拽左侧栏**

编辑 `frontend/src/features/knowledge/components/KnowledgeLayout.tsx`：

将现有的固定宽度 LeftPanel 改为可拖拽。完整替换文件内容：

```typescript
import { type ReactNode, useState, useCallback, useEffect } from "react";
import { ResizeHandle } from "./ResizeHandle";

interface KnowledgeLayoutProps {
  sidebar: ReactNode;
  content: ReactNode;
  outline?: ReactNode;
}

const STORAGE_KEY = 'knowledge-sidebar-width';
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
    <div className="flex h-[calc(100vh-6.5rem)] bg-[var(--app-color-surface-page)]">
      {/* Left sidebar — draggable width */}
      <aside
        style={{ width: sidebarWidth }}
        className="shrink-0 overflow-y-auto border-r border-[var(--app-color-border-default)] bg-[var(--sidebar)]"
      >
        {sidebar}
      </aside>

      <ResizeHandle onResize={handleResize} />

      {/* Center content */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[var(--container-content)] px-[var(--app-space-container-padding)] py-[var(--app-space-container-padding)]">
          {content}
        </div>
      </main>

      {/* Right outline */}
      {outline && (
        <aside className="hidden w-[240px] shrink-0 overflow-y-auto border-l border-[var(--app-color-border-default)] bg-[var(--sidebar)] xl:block">
          <div className="p-[var(--app-space-container-padding)]">{outline}</div>
        </aside>
      )}
    </div>
  );
}

export function KnowledgeLayoutSkeleton() {
  return (
    <div className="flex h-[calc(100vh-6.5rem)] bg-[var(--app-color-surface-page)]">
      <aside className="w-[260px] shrink-0 border-r border-[var(--app-color-border-default)] bg-[var(--sidebar)] p-[var(--app-space-container-padding)]">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-5 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]" style={{ width: `${60 + Math.random() * 40}%` }} />
          ))}
        </div>
      </aside>
      <main className="flex-1 p-[var(--app-space-container-padding)]">
        <div className="mx-auto max-w-[var(--container-content)] space-y-4">
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
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/knowledge/components/ResizeHandle.tsx frontend/src/features/knowledge/components/KnowledgeLayout.tsx
git commit -m "feat: add draggable sidebar with ResizeHandle + localStorage persistence"
```

---

### Task 1.4: 重构 KnowledgeCategoryTree（点击回调模式）

**Files:**
- Modify: `frontend/src/features/knowledge/components/KnowledgeCategoryTree.tsx`

- [ ] **Step 1: 修改 Props 接口 + 移除 navigate 依赖**

将 `onNavigate` prop 改为 `onSelectPage`，移除 `useNavigate` 和 `navigate()` 调用。完整替换文件：

```typescript
import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, FileText, Trash2, FolderPlus, Check, X, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import * as Icons from "lucide-react";
import { deleteKnowledgeCategory, createKnowledgeCategory } from "@/api/domains/knowledge.api";
import type { KnowledgeTreeNode } from "@/features/knowledge/types";

interface Props {
  tree: KnowledgeTreeNode[];
  isLoading?: boolean;
  depth?: number;
  onRefresh?: () => void;
  onSelectPage: (pageId: number) => void;
  activePageId?: number | null;
  activeTag?: string | null;
  onSelectTag?: (tag: string | null) => void;
}

const DEPTH_COLORS = ["text-indigo-600", "text-blue-600", "text-teal-600"];
const DEPTH_BORDER = ["border-indigo-200", "border-blue-200", "border-teal-200"];

export function KnowledgeCategoryTree({
  tree, isLoading, depth = 0, onRefresh, onSelectPage, activePageId, activeTag, onSelectTag
}: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    try {
      const stored = sessionStorage.getItem('knowledge-expanded');
      if (stored) return new Set(JSON.parse(stored));
    } catch {}
    return new Set<number>();
  });
  const persistExpand = (s: Set<number>) => {
    try { sessionStorage.setItem('knowledge-expanded', JSON.stringify([...s])); } catch {}
    setExpanded(s);
  };
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => {
    sessionStorage.removeItem('knowledge-expanded');
    setRefreshKey(k => k + 1); onRefresh?.();
  };

  const toggle = (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    persistExpand(next);
  };

  // Auto-expand parents of active page
  useEffect(() => {
    if (depth !== 0 || !activePageId || !tree.length) return;
    const findAndExpand = (nodes: KnowledgeTreeNode[], target: number): boolean => {
      for (const n of nodes) {
        if (n.pages.some(p => p.id === target)) return true;
        if (findAndExpand(n.children, target)) {
          persistExpand(new Set([...expanded, n.categoryId]));
          return true;
        }
      }
      return false;
    };
    findAndExpand(tree, activePageId);
  }, [activePageId, depth]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createKnowledgeCategory({ name: newName.trim(), slug: newSlug.trim() || undefined });
      setNewName(""); setNewSlug(""); setShowCreate(false); refresh();
    } catch { alert("创建失败"); }
    finally { setCreating(false); }
  };

  // Extract all unique tags from tree pages for tag cloud
  const allPages = tree.flatMap(n => n.pages);
  // Tags are stored per-page but not yet in KnowledgeTreeNode; skip tag cloud for now

  if (isLoading && depth === 0) {
    return <div className="space-y-1 p-2">{Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="h-7 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]" />
    ))}</div>;
  }

  return (
    <div className={cn(depth === 0 && "flex h-full flex-col", depth > 0 && "ml-3 border-l-2 pl-2", depth > 0 && DEPTH_BORDER[Math.min(depth, 2)])}>
      {depth === 0 && (
        <div className="shrink-0 border-b border-[var(--app-color-border-default)] px-2 py-1.5">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex w-full items-center gap-1.5 rounded-[var(--app-radius-element)] px-2 py-1.5 text-xs font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
          >
            <FolderPlus className="size-3.5" />
            新建文件夹
          </button>
          {showCreate && (
            <div className="mt-1.5 space-y-1.5 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2">
              <input
                value={newName} onChange={e => { setNewName(e.target.value); if (!newSlug) setNewSlug(e.target.value.replace(/[^a-zA-Z0-9一-龥]/g, '-').replace(/-+/g, '-').toLowerCase()); }}
                placeholder="文件夹名称" autoFocus
                className="w-full rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-border-strong)] focus:outline-none"
              />
              <input
                value={newSlug} onChange={e => setNewSlug(e.target.value)}
                placeholder="slug（可选，自动生成）"
                className="w-full rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-1 text-[11px] font-mono text-[var(--app-color-text-secondary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-border-strong)] focus:outline-none"
              />
              <div className="flex gap-1.5">
                <button onClick={handleCreate} disabled={creating || !newName.trim()} className="flex items-center gap-1 rounded bg-[var(--app-color-accent)] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[var(--app-color-accent-hover)] disabled:opacity-50">
                  <Check className="size-3" />创建
                </button>
                <button onClick={() => { setShowCreate(false); setNewName(""); setNewSlug(""); }} className="rounded border border-[var(--app-color-border-default)] px-2.5 py-1 text-[11px] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]">
                  <X className="size-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={cn("flex-1 overflow-y-auto", depth === 0 && "py-1")}>
        {!tree.length && depth === 0
          ? <div className="p-4 text-center text-xs text-[var(--app-color-text-tertiary)]">暂无分类</div>
          : tree.map((node) => (
            <TreeNode
              key={`${node.categoryId}-${refreshKey}`}
              node={node} depth={depth}
              expanded={expanded} toggle={toggle}
              activePageId={activePageId}
              onSelectPage={onSelectPage}
              onDeleted={refresh}
            />
          ))}
      </div>
    </div>
  );
}

function TreeNode({ node, depth, expanded, toggle, activePageId, onSelectPage, onDeleted }: {
  node: KnowledgeTreeNode; depth: number; expanded: Set<number>;
  toggle: (id: number) => void; activePageId?: number | null;
  onSelectPage: (id: number) => void; onDeleted: () => void;
}) {
  const isOpen = expanded.has(node.categoryId);
  const hasChildren = node.children.length > 0;
  const hasPages = node.pages.length > 0;
  const totallyEmpty = !hasChildren && !hasPages;
  const ci = Math.min(depth, 2);
  const colorClass = hasChildren ? DEPTH_COLORS[ci] : "text-[var(--app-color-text-primary)]";
  const IconComp = (Icons as any)[node.icon] || (hasChildren ? Icons.Folder : Icons.FileText);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`删除「${node.categoryName}」？`)) return;
    setDeleting(true);
    try { await deleteKnowledgeCategory(node.categoryId); onDeleted(); }
    catch { alert("删除失败"); }
    finally { setDeleting(false); }
  };

  return (
    <div className="py-0.5">
      <button
        onClick={() => (hasChildren || hasPages) ? toggle(node.categoryId) : null}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-[var(--app-radius-element)] px-2 py-1.5 text-left transition-colors",
          depth === 0 && "text-[13px] font-semibold",
          depth === 1 && "text-[13px] font-medium",
          depth >= 2 && "text-xs",
          (hasChildren || hasPages) && "cursor-pointer hover:bg-[var(--app-color-surface-hover)]"
        )}
      >
        {(hasChildren || hasPages) ? (
          isOpen ? <ChevronDown className="size-3.5 shrink-0 opacity-40" /> : <ChevronRight className="size-3.5 shrink-0 opacity-40" />
        ) : <span className="w-3.5 shrink-0" />}
        <IconComp className={cn("size-3.5 shrink-0", colorClass)} />
        <span className={cn("flex-1 truncate", colorClass)}>{node.categoryName}</span>
        {hasPages ? <span className="text-[10px] opacity-40">{node.pages.length}</span>
          : hasChildren ? <span className="text-[10px] opacity-30">{node.children.length}</span>
          : null}
        {totallyEmpty && (
          <span onClick={handleDelete} className={cn("rounded p-0.5 hover:bg-red-100 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity", deleting && "opacity-50")} title="删除空文件夹">
            <Trash2 className="size-3" />
          </span>
        )}
      </button>

      {hasChildren && isOpen && (
        node.children.length > 0
          ? <KnowledgeCategoryTree tree={node.children} depth={depth + 1} onSelectPage={onSelectPage} activePageId={activePageId} />
          : <div className="ml-6 py-1 text-[11px] text-[var(--app-color-text-tertiary)] italic">空文件夹</div>
      )}

      {hasPages && isOpen && (
        <div className="ml-5">
          {node.pages.map((page) => (
            <button key={page.id} onClick={() => onSelectPage(page.id)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-[var(--app-radius-element)] px-2 py-1 text-left text-xs transition-colors",
                page.id === activePageId
                  ? "bg-[var(--app-color-accent-soft)] font-medium text-[var(--app-color-accent)]"
                  : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
              )}>
              <FileText className="size-3 shrink-0 opacity-50" />
              <span className="truncate">{page.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

关键变更：`useNavigate` 和 `useParams` 移除；`onNavigate` → `onSelectPage` 回调；`activePageId` 类型从 `string | undefined` 改为 `number | null`。

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/knowledge/components/KnowledgeCategoryTree.tsx
git commit -m "refactor: KnowledgeCategoryTree uses onSelectPage callback instead of navigate"
```

---

### Task 1.5: KnowledgeShell 主壳组件 + 仪表盘

**Files:**
- Create: `frontend/src/features/knowledge/components/KnowledgeShell.tsx`
- Create: `frontend/src/features/knowledge/components/KnowledgeDashboard.tsx`

- [ ] **Step 1: 编写仪表盘组件**

创建 `frontend/src/features/knowledge/components/KnowledgeDashboard.tsx`：

```typescript
import { useNavigate } from "react-router-dom";
import { BookOpen, Folder, Tag, Clock } from "lucide-react";
import type { KnowledgeStats, TagStats, KnowledgePage } from "@/features/knowledge/types";

interface Props {
  stats: KnowledgeStats | null;
  tags: TagStats[];
  recentPages: KnowledgePage[];
  onSelectPage: (id: number) => void;
  onSelectTag: (tag: string) => void;
  activeTag: string | null;
}

export function KnowledgeDashboard({ stats, tags, recentPages, onSelectPage, onSelectTag, activeTag }: Props) {
  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<BookOpen className="size-4" />} value={stats?.totalPages ?? '-'} label="文档总数" accent="text-[var(--app-color-accent)]" />
        <StatCard icon={<Folder className="size-4" />} value={stats?.totalCategories ?? '-'} label="分类数" accent="text-indigo-500" />
        <StatCard icon={<Tag className="size-4" />} value={stats?.totalTags ?? '-'} label="标签数" accent="text-emerald-500" />
        <StatCard icon={<Clock className="size-4" />} value={stats?.lastUpdated ? formatRelative(stats.lastUpdated) : '-'} label="最近更新" accent="text-amber-500" />
      </div>

      {/* Tag cloud */}
      {tags.length > 0 && (
        <div className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-4">
          <h3 className="text-[11px] font-semibold text-[var(--app-color-text-tertiary)] uppercase tracking-wider mb-3">标签云</h3>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => {
              const size = 10 + Math.min(tag.count / 10, 8);
              const isActive = activeTag === tag.name;
              return (
                <button
                  key={tag.name}
                  onClick={() => onSelectTag(isActive ? null : tag.name)}
                  className="rounded-full px-2.5 py-0.5 font-mono transition-colors"
                  style={{ fontSize: `${size}px` }}
                  css={isActive
                    ? "background: var(--app-color-accent); color: white;"
                    : `background: color-mix(in srgb, var(--app-color-accent) ${10 + tag.count}%, transparent); color: var(--app-color-text-secondary); hover:background: color-mix(in srgb, var(--app-color-accent) 20%, transparent);`
                  }
                >
                  {tag.name}
                  <span className="ml-1 opacity-50 text-[9px]">{tag.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent pages grid */}
      <div>
        <h3 className="text-[11px] font-semibold text-[var(--app-color-text-tertiary)] uppercase tracking-wider mb-3">最近文档</h3>
        <div className="grid grid-cols-3 gap-3">
          {recentPages.map(page => (
            <button
              key={page.id}
              onClick={() => onSelectPage(page.id)}
              className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3 text-left hover:bg-[var(--app-color-surface-hover)] transition-colors"
            >
              <h4 className="text-sm font-medium text-[var(--app-color-text-primary)] truncate">{page.title}</h4>
              <p className="mt-1 text-[11px] text-[var(--app-color-text-tertiary)] line-clamp-2 font-mono">
                {page.title}
              </p>
              <div className="mt-2 flex items-center gap-2 text-[9px] text-[var(--app-color-text-tertiary)] font-mono">
                <span>v{page.version}</span>
                <span>·</span>
                <span>{formatRelative(page.updatedAt)}</span>
              </div>
            </button>
          ))}
          {recentPages.length === 0 && (
            <div className="col-span-3 py-12 text-center text-sm text-[var(--app-color-text-tertiary)]">
              暂无文档，点击上方"新建"开始
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, value, label, accent }: { icon: React.ReactNode; value: string | number; label: string; accent: string }) {
  return (
    <div className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3 text-center">
      <div className={cn("flex justify-center mb-1", accent)}>{icon}</div>
      <div className={cn("text-xl font-bold font-mono", accent)}>{value}</div>
      <div className="text-[10px] text-[var(--app-color-text-tertiary)]">{label}</div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return `${Math.floor(days / 30)}月前`;
}
```

- [ ] **Step 2: 编写 KnowledgeShell 主壳组件**

创建 `frontend/src/features/knowledge/components/KnowledgeShell.tsx`：

```typescript
import { useKnowledgeShell } from "@/features/knowledge/hooks/useKnowledgeShell";
import { useKnowledgeCategories } from "@/features/knowledge/hooks/useKnowledgeCategories";
import { useKnowledgePage } from "@/features/knowledge/hooks/useKnowledgePage";
import { TabBar } from "./TabBar";
import { KnowledgeLayout, KnowledgeLayoutSkeleton } from "./KnowledgeLayout";
import { KnowledgeCategoryTree } from "./KnowledgeCategoryTree";
import { KnowledgeDashboard } from "./KnowledgeDashboard";
import { KnowledgePageRenderer } from "./KnowledgePageRenderer";
import { KnowledgePageOutline } from "./KnowledgePageOutline";
import { KnowledgePageMeta } from "./KnowledgePageMeta";
import { KnowledgeEditorPanel } from "./KnowledgeEditorPanel";
import { AlertTriangle, RefreshCw, Pencil, Clock, ArrowLeft } from "lucide-react";

export function KnowledgeShell() {
  const shell = useKnowledgeShell();
  const { data: tree, isLoading: treeLoading, isError, error, refetch } = useKnowledgeCategories();
  const { data: page, isLoading: pageLoading } = useKnowledgePage(shell.selectedPageId);

  if (treeLoading) return <KnowledgeLayoutSkeleton />;

  if (isError) {
    return (
      <KnowledgeLayout
        sidebar={null}
        content={
          <div className="flex flex-col items-center justify-center py-16">
            <AlertTriangle className="size-12 text-[var(--app-color-feedback-warning)]" />
            <h2 className="mt-4 text-lg font-semibold">加载失败</h2>
            <p className="mt-1 text-sm text-[var(--app-color-text-secondary)]">
              {error instanceof Error ? error.message : "无法获取知识库数据"}
            </p>
            <button onClick={() => refetch()} className="mt-4 inline-flex items-center gap-1.5 rounded-[var(--app-radius-element)] border px-4 py-2 text-sm">
              <RefreshCw className="size-3.5" />重新加载
            </button>
          </div>
        }
      />
    );
  }

  const renderCenter = () => {
    // Edit mode
    if (shell.isEditing) {
      return (
        <KnowledgeEditorPanel
          existingPage={shell.editingPageId ? page : null}
          onSaved={(savedPage) => {
            shell.selectPage(savedPage.id);
            shell.stopEdit();
          }}
          onCancel={() => shell.stopEdit()}
        />
      );
    }

    // Graph view
    if (shell.view === 'graph') {
      return (
        <div className="flex items-center justify-center py-16 text-sm text-[var(--app-color-text-tertiary)]">
          🕸️ 知识图谱 — Phase 2 实现
        </div>
      );
    }

    // Timeline view
    if (shell.view === 'timeline') {
      return (
        <div className="flex items-center justify-center py-16 text-sm text-[var(--app-color-text-tertiary)]">
          🌱 生长记录 — Phase 2 实现
        </div>
      );
    }

    // Browse: no page selected → dashboard
    if (!shell.selectedPageId) {
      return (
        <KnowledgeDashboard
          stats={null}
          tags={[]}
          recentPages={[]}
          onSelectPage={shell.selectPage}
          onSelectTag={() => {}}
          activeTag={null}
        />
      );
    }

    // Browse: page selected
    if (pageLoading) {
      return (
        <div className="space-y-4">
          <div className="h-8 w-3/4 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]" />
          <div className="h-4 w-1/3 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]" />
          <div className="h-px bg-[var(--app-color-border-default)]" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]" style={{ width: `${70 + Math.random() * 30}%` }} />
          ))}
        </div>
      );
    }

    if (!page) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-lg font-semibold">文档不存在</p>
          <button onClick={shell.deselectPage} className="mt-4 rounded-[var(--app-radius-element)] border px-4 py-2 text-sm">返回知识库首页</button>
        </div>
      );
    }

    return (
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <button onClick={shell.deselectPage} className="mb-2 flex items-center gap-1 text-xs text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)]">
              <ArrowLeft className="size-3" />返回知识库
            </button>
            <h1 className="text-xl font-bold text-[var(--app-color-text-primary)]">{page.title}</h1>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => shell.startEdit(page.id)} className="rounded-[var(--app-radius-element)] border px-3 py-1.5 text-xs font-medium hover:bg-[var(--app-color-surface-hover)]">
              <Pencil className="mr-1 inline size-3" />编辑
            </button>
            <button onClick={() => shell.openHistory(page.id)} className="rounded-[var(--app-radius-element)] border px-3 py-1.5 text-xs font-medium hover:bg-[var(--app-color-surface-hover)]">
              <Clock className="mr-1 inline size-3" />历史
            </button>
          </div>
        </div>
        <div className="mt-6">
          <KnowledgePageRenderer contentMd={page.contentMd} contentHtml={page.contentHtml} />
          <KnowledgePageMeta page={page} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col bg-[var(--app-color-surface-page)]">
      <TabBar view={shell.view} onViewChange={shell.setView} onNewDocument={() => shell.startEdit()} />
      <div className="flex-1 min-h-0">
        <KnowledgeLayout
          sidebar={
            <KnowledgeCategoryTree
              tree={tree ?? []}
              isLoading={false}
              onRefresh={refetch}
              onSelectPage={shell.selectPage}
              activePageId={shell.selectedPageId}
            />
          }
          outline={
            !shell.isEditing && shell.view === 'browse' && page
              ? <KnowledgePageOutline contentMd={page.contentMd} contentHtml={page.contentHtml} />
              : null
          }
          content={renderCenter()}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/knowledge/components/KnowledgeDashboard.tsx frontend/src/features/knowledge/components/KnowledgeShell.tsx
git commit -m "feat: add KnowledgeShell and KnowledgeDashboard components"
```

---

### Task 1.6: 路由清理 + 页面简化

**Files:**
- Modify: `frontend/src/router/index.tsx`
- Modify: `frontend/src/pages/AdminKnowledgeHomePage.tsx`
- Delete: `frontend/src/pages/AdminKnowledgePageDetail.tsx`
- Delete: `frontend/src/pages/AdminKnowledgeEditorPage.tsx`
- Delete: `frontend/src/pages/AdminKnowledgeHistoryPage.tsx`

- [ ] **Step 1: 删除旧路由，保留单条**

编辑 `frontend/src/router/index.tsx`，删除以下 5 条路由：
```
{ path: "knowledge/category/:categoryId", element: <AdminKnowledgeHomePage/>},
{ path: "knowledge/page/:pageId", element: <AdminKnowledgePageDetail/>},
{ path: "knowledge/page/:pageId/edit", element: <AdminKnowledgeEditorPage/>},
{ path: "knowledge/page/:pageId/history", element: <AdminKnowledgeHistoryPage/>},
{ path: "knowledge/new", element: <AdminKnowledgeEditorPage/>},
```

只保留：
```
{ path: "knowledge", element: <AdminKnowledgeHomePage/>},
```

同时删除文件顶部的对应 import 行（`AdminKnowledgePageDetail`, `AdminKnowledgeEditorPage`, `AdminKnowledgeHistoryPage`）。

- [ ] **Step 2: 简化 AdminKnowledgeHomePage**

将 `frontend/src/pages/AdminKnowledgeHomePage.tsx` 替换为：

```typescript
import { KnowledgeShell } from "@/features/knowledge/components/KnowledgeShell";

export default function AdminKnowledgeHomePage() {
  return <KnowledgeShell />;
}
```

- [ ] **Step 3: 删除 3 个旧页面文件**

```bash
rm frontend/src/pages/AdminKnowledgePageDetail.tsx
rm frontend/src/pages/AdminKnowledgeEditorPage.tsx
rm frontend/src/pages/AdminKnowledgeHistoryPage.tsx
```

- [ ] **Step 4: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit --pretty 2>&1 | grep -E "(error|Error)" | head -10
```

预期：与本次变更无关的已有类型错误可忽略，新增文件无类型错误。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/router/index.tsx frontend/src/pages/AdminKnowledgeHomePage.tsx
git rm frontend/src/pages/AdminKnowledgePageDetail.tsx frontend/src/pages/AdminKnowledgeEditorPage.tsx frontend/src/pages/AdminKnowledgeHistoryPage.tsx
git commit -m "refactor: collapse 6 knowledge routes into 1, simplify homepage to Shell mount"
```

---

## Phase 2: 图谱 + 时间线

### Task 2.1: 数据库迁移 + 后端 Model

**Files:**
- Create: `scripts/migration_knowledge_tags.sql`
- Create: `src/main/java/.../knowledge/model/GraphResponse.java`
- Create: `src/main/java/.../knowledge/model/TimelineResponse.java`
- Create: `src/main/java/.../knowledge/model/TagStatsResponse.java`
- Create: `src/main/java/.../knowledge/model/StatsResponse.java`

- [ ] **Step 1: 编写 SQL 迁移文件**

创建 `scripts/migration_knowledge_tags.sql`：

```sql
-- Migration: Add tags column to knowledge_pages
-- Date: 2026-06-10
-- Run: Auto-executed by KnowledgeSchemaMigrator

ALTER TABLE knowledge_pages ADD COLUMN IF NOT EXISTS tags JSON DEFAULT '[]';
```

- [ ] **Step 2: 更新 KnowledgeSchemaMigrator 自动执行迁移**

找到 `src/main/java/com/example/demo/modules/knowledge/config/KnowledgeSchemaMigrator.java`，在 `migrate()` 方法中追加 ALTER TABLE 逻辑（幂等——检测列是否存在后再执行）。具体代码取决于现有 SchemaMigrator 的模式。

- [ ] **Step 3: 编写 Response DTO**

创建 `GraphResponse.java`：
```java
package com.example.demo.modules.knowledge.model;

import java.util.List;

public class GraphResponse {
    private List<GraphNode> nodes;
    private List<GraphEdge> edges;

    public static class GraphNode {
        private Long id;
        private String title;
        private Long categoryId;
        private String categoryName;
        private int refCount;
        // getters/setters
    }

    public static class GraphEdge {
        private Long source;
        private Long target;
        private String type; // "manual" or "auto"
        // getters/setters
    }
    // getters/setters for nodes/edges
}
```

创建 `TimelineResponse.java`（字段对应 `KnowledgeHistory` + 关联 page 的 title 和 categoryName）。

创建 `TagStatsResponse.java`（`String name; int count`）。

创建 `StatsResponse.java`（`int totalPages; int totalCategories; int totalTags; String lastUpdated`）。

- [ ] **Step 4: Commit**

```bash
git add scripts/migration_knowledge_tags.sql src/main/java/com/example/demo/modules/knowledge/model/
git commit -m "feat: add tags migration + response DTOs for graph/timeline/tags/stats"
```

---

### Task 2.2: WikilinkScanner + ReferenceAnalyzer + GraphService

**Files:**
- Create: `src/main/java/.../knowledge/service/WikilinkScanner.java`
- Create: `src/main/java/.../knowledge/service/ReferenceAnalyzer.java`
- Create: `src/main/java/.../knowledge/service/GraphService.java`

- [ ] **Step 1: 编写 WikilinkScanner**

```java
@Service
public class WikilinkScanner {
    private static final Pattern WIKILINK_PATTERN = Pattern.compile("\\[\\[([^\\]]+)\\]\\]");

    /**
     * Extract [[title]] references from markdown content.
     * Returns list of referenced page titles.
     */
    public List<String> scan(String contentMd) {
        if (contentMd == null || contentMd.isEmpty()) return List.of();
        return WIKILINK_PATTERN.matcher(contentMd)
            .results()
            .map(mr -> mr.group(1).trim())
            .distinct()
            .collect(Collectors.toList());
    }
}
```

- [ ] **Step 2: 编写 ReferenceAnalyzer**

自动发现：基于标题关键词共现 + 同分类下的文档互相引用。返回候选 Edges（type=auto，低权重）。

- [ ] **Step 3: 编写 GraphService**

合并 WikilinkScanner（手动）+ ReferenceAnalyzer（自动），去重，构建 nodes+edges。被引用次数作为 refCount 写入 node。

- [ ] **Step 4: Commit**

---

### Task 2.3: 四个新 Controller

**Files:**
- Create: `KnowledgeGraphController.java`
- Create: `KnowledgeTimelineController.java`
- Create: `KnowledgeTagController.java`
- Create: `KnowledgeStatsController.java`

- [ ] **Step 1: KnowledgeGraphController**

`GET /graph` → 调用 GraphService，返回 GraphResponse
`GET /pages/{id}/backlinks` → 查询引用关系，返回 backlinks 列表
`POST /graph/rebuild` → 触发全量重扫（SUPER_ADMIN）

- [ ] **Step 2: KnowledgeTimelineController**

`GET /timeline?limit=&type=&author=&since=` → 查询 knowledge_history 表 JOIN knowledge_pages

- [ ] **Step 3: KnowledgeTagController**

`GET /tags?categoryId=` → 查询所有 knowledge_pages.tags JSON 字段，聚合计数

- [ ] **Step 4: KnowledgeStatsController**

`GET /stats` → COUNT knowledge_pages / COUNT DISTINCT tags / MAX(updated_at)

- [ ] **Step 5: Commit**

---

### Task 2.4: 前端 API 函数 + 类型补充

**Files:**
- Modify: `frontend/src/api/domains/knowledge.api.ts`

- [ ] **Step 1: 在 knowledge.api.ts 末尾追加 6 个新函数**

```typescript
// ── Graph ──
export function fetchKnowledgeGraph(params?: { categoryId?: number; tag?: string }): Promise<GraphData> {
  return adminHttp.get('/knowledge/graph', { params }).then(r => r.data?.data ?? r.data);
}

export function fetchPageBacklinks(pageId: number): Promise<{ pageId: number; title: string; type: 'manual' | 'auto' }[]> {
  return adminHttp.get(`/knowledge/pages/${pageId}/backlinks`).then(r => r.data?.data ?? r.data);
}

export function rebuildGraph(): Promise<void> {
  return adminHttp.post('/knowledge/graph/rebuild').then(r => r.data);
}

// ── Timeline ──
export function fetchKnowledgeTimeline(params?: {
  limit?: number; type?: string; author?: string; since?: string;
}): Promise<TimelineEvent[]> {
  return adminHttp.get('/knowledge/timeline', { params }).then(r => r.data?.data ?? r.data);
}

// ── Tags ──
export function fetchKnowledgeTags(params?: { categoryId?: number }): Promise<TagStats[]> {
  return adminHttp.get('/knowledge/tags', { params }).then(r => r.data?.data ?? r.data);
}

// ── Stats ──
export function fetchKnowledgeStats(): Promise<KnowledgeStats> {
  return adminHttp.get('/knowledge/stats').then(r => r.data?.data ?? r.data);
}
```

- [ ] **Step 2: Commit**

---

### Task 2.5: 前端知识图谱视图

**Files:**
- Create: `frontend/src/features/knowledge/components/KnowledgeGraphView.tsx`

- [ ] **Step 1: 安装 D3.js**

```bash
cd frontend && npm install d3 @types/d3
```

- [ ] **Step 2: 编写 KnowledgeGraphView**

D3 forceSimulation + SVG/Canvas 渲染。接受 `onSelectPage` 回调。筛选面板：按分类 checkbox + 按标签。暗色背景画布。悬停 Tooltip。

- [ ] **Step 3: 集成到 KnowledgeShell**

在 `renderCenter()` 中替换图谱占位符为 `<KnowledgeGraphView onSelectPage={shell.selectPage} />`

- [ ] **Step 4: Commit**

---

### Task 2.6: 前端时间线视图

**Files:**
- Create: `frontend/src/features/knowledge/components/KnowledgeTimelineView.tsx`

- [ ] **Step 1: 编写 KnowledgeTimelineView**

使用 `useKnowledgeSearch` 类似的 TanStack Query hook 获取时间线数据。左侧筛选面板（事件类型/作者/时间范围）。主区域垂直时间线，按日期分组，无限滚动。

- [ ] **Step 2: 集成到 KnowledgeShell**

替换时间线占位符。

- [ ] **Step 3: Commit**

---

### Task 2.7: 前端历史弹窗

**Files:**
- Create: `frontend/src/features/knowledge/components/KnowledgeHistoryDrawer.tsx`

- [ ] **Step 1: 编写 KnowledgeHistoryDrawer**

基于 shadcn/ui Sheet/Drawer 组件。右侧滑入。传入 `pageId`，用 `useKnowledgeHistory` 获取数据。垂直展示版本列表（版本号/作者/时间/摘要）。点击版本展示内容预览（可只显示前 200 字符）。"回滚到此版本"按钮（ADMIN+角色判断）。

- [ ] **Step 2: 集成到 KnowledgeShell**

在 Shell 底部渲染 `<KnowledgeHistoryDrawer open={shell.isHistoryOpen} pageId={shell.historyPageId} onClose={shell.closeHistory} />`

- [ ] **Step 3: Commit**

---

## Phase 3: 编辑器增强

### Task 3.1: [[wikilink]] 自动补全

**Files:**
- Modify: `frontend/src/features/knowledge/components/KnowledgeEditorPanel.tsx`

- [ ] **Step 1: 添加 wikilink 自动补全逻辑**

在编辑器的 `<textarea>` 上添加 `onKeyDown` 监听。当用户键入 `[[` 时，弹出下拉菜单显示已有文档标题列表（模糊匹配）。选中后插入 `[[标题]]`。使用 `useKnowledgeCategories()` 获取所有页面标题列表。

- [ ] **Step 2: [[wikilink]] 语法高亮**

在 textarea 的显示层（可用 overlay div）中用正则高亮 `[[...]]` 为特殊颜色。

- [ ] **Step 3: Commit**

---

### Task 3.2: 标签输入组件

**Files:**
- Modify: `frontend/src/features/knowledge/components/KnowledgeEditorPanel.tsx`

- [ ] **Step 1: 添加标签输入行**

在分类选择器下方新增一行：标签输入框 + 已有标签的 pill 展示。输入时自动补全已有标签名。按回车或逗号添加标签。点击 pill 的 × 移除。

- [ ] **Step 2: 保存时携带 tags**

在 `useKnowledgeSave` mutation 中，请求体新增 `tags` 字段（JSON 数组）。

- [ ] **Step 3: Commit**

---

### Task 3.3: 编辑器保存优化

**Files:**
- Modify: `frontend/src/features/knowledge/components/KnowledgeEditorPanel.tsx`

- [ ] **Step 1: Ctrl+S 快捷键**

添加 `useEffect` 监听 keydown，Ctrl+S 时调用保存函数。

- [ ] **Step 2: 保存后自动切换**

保存成功后，调用 `onSaved(page)` → Shell 的 `selectPage(page.id) + stopEdit()`。

- [ ] **Step 3: Commit**

---

### Task 3.4: 反向链接列表组件

**Files:**
- Create: `frontend/src/features/knowledge/components/BacklinksList.tsx`
- Modify: `frontend/src/features/knowledge/components/KnowledgeShell.tsx`

- [ ] **Step 1: 编写 BacklinksList**

```typescript
import { fetchPageBacklinks } from "@/api/domains/knowledge.api";
import { useQuery } from "@tanstack/react-query";

interface Props {
  pageId: number;
  onSelectPage: (id: number) => void;
}

export function BacklinksList({ pageId, onSelectPage }: Props) {
  const { data: backlinks } = useQuery({
    queryKey: ['knowledge', 'backlinks', pageId],
    queryFn: () => fetchPageBacklinks(pageId),
    staleTime: 2 * 60 * 1000,
  });

  if (!backlinks || backlinks.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-[var(--app-color-border-default)]">
      <h4 className="text-[10px] font-semibold text-[var(--app-color-text-tertiary)] uppercase tracking-wider mb-2 font-mono">
        🔗 反向链接 · {backlinks.length}
      </h4>
      {backlinks.map(bl => (
        <button
          key={bl.pageId}
          onClick={() => onSelectPage(bl.pageId)}
          className="block w-full text-left text-[11px] text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-accent)] py-0.5 truncate font-mono"
        >
          <span className={bl.type === 'manual' ? 'text-emerald-500' : 'text-amber-500'}>●</span>{' '}
          {bl.title}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 集成到 KnowledgeShell 右侧面板**

在 Shell 的 `outline` prop 中，浏览视图且有选中页面时，在 `KnowledgePageOutline` 下方追加 `<BacklinksList pageId={shell.selectedPageId!} onSelectPage={shell.selectPage} />`

- [ ] **Step 3: Commit**

---

## Phase 4: 极客风润色

### Task 4.1: 代码块 GitHub Dark 主题

**Files:**
- Modify: `frontend/src/index.css`（或新建 `frontend/src/styles/knowledge-code.css`）

- [ ] **Step 1: 添加知识库代码块 CSS 变量**

```css
:root {
  --knowledge-code-bg: #0d1117;
  --knowledge-code-text: #c9d1d9;
  --knowledge-graph-bg-start: #0a0f1a;
  --knowledge-graph-bg-end: #111827;
}
```

- [ ] **Step 2: 在 KnowledgePageRenderer 中应用**

HTML 内容中的 `<pre><code>` 块应用 `background: var(--knowledge-code-bg)` + macOS 三灯装饰（用 CSS `::before` 伪元素）。

- [ ] **Step 3: Commit**

---

### Task 4.2: JetBrains Mono 字体 + 动效

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: 添加字体引入 + 技术元数据样式**

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

.font-mono-tech {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
}
```

- [ ] **Step 2: 给标签/slug/版本号等元素加 font-mono-tech**

在 TagCloud、KnowledgePageMeta、编辑器 slug 输入等组件中使用等宽字体。

- [ ] **Step 3: 添加过渡动效**

文档切换 cross-fade（150ms opacity transition），编辑器切换 scale(0.98→1)。用 Tailwind 的 `transition-*` 工具类或 CSS 动画。

- [ ] **Step 4: Commit**

---

### Task 4.3: 底部状态栏 + 终端装饰

**Files:**
- Modify: `frontend/src/features/knowledge/components/KnowledgeShell.tsx`

- [ ] **Step 1: 添加 StatusBar**

Shell 底部 24px 高的状态栏：绿色圆点 + "326 篇 · 23 分类 · 58 标签 · 最近更新 2h前"。等宽字体。暗底。

数据通过 `useKnowledgeStats()` hook（TanStack Query，staleTime 5min）获取。

- [ ] **Step 2: Commit**

---

### Task 4.4: [[wikilink]] 渲染支持

**Files:**
- Modify: `frontend/src/features/knowledge/components/KnowledgePageRenderer.tsx`

- [ ] **Step 1: 在渲染前处理 wikilink**

在 `contentHtml` / `contentMd` 渲染前，用正则将 `[[title]]` 替换为可点击的 `<span>`（渲染时 onClick 调用 `onNavigateToPage`，通过 slug 查找 pageId 后 selectPage）。

- [ ] **Step 2: Commit**

---

## 验证清单

全部 Phase 完成后：

- [ ] **前端编译通过**：`cd frontend && npx tsc --noEmit`
- [ ] **前端构建通过**：`cd frontend && npm run build`
- [ ] **后端编译通过**：`mvn compile -q`
- [ ] **冒烟测试**：打开 `/admin/knowledge` → 目录树可展开 → 点击文档即时显示 → 顶栏切换视图 → 新建/编辑文档
- [ ] **门禁检查**：
  - G02（弹窗/Modal）：历史 Drawer 关闭后 body scroll lock 释放
  - 如涉及动画则 G01（参见 `@gates` 注册表）
