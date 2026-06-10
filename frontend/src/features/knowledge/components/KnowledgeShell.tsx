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
import { KnowledgeGraphView } from "./KnowledgeGraphView";
import { KnowledgeTimelineView } from "./KnowledgeTimelineView";
import { KnowledgeHistoryDrawer } from "./KnowledgeHistoryDrawer";
import { BacklinksList } from "./BacklinksList";
import { AlertTriangle, RefreshCw, Pencil, Clock, ArrowLeft } from "lucide-react";

export function KnowledgeShell() {
  const shell = useKnowledgeShell();
  const {
    data: tree,
    isLoading: treeLoading,
    isError,
    error,
    refetch,
  } = useKnowledgeCategories();
  const { data: page, isLoading: pageLoading } = useKnowledgePage(shell.selectedPageId);

  // ── Loading ──
  if (treeLoading) {
    return (
      <div className="flex h-[calc(100vh-6.5rem)] flex-col bg-[var(--app-color-surface-page)]">
        <TabBar view={shell.view} onViewChange={shell.setView} onNewDocument={() => shell.startEdit()} />
        <KnowledgeLayoutSkeleton />
      </div>
    );
  }

  // ── Error ──
  if (isError) {
    return (
      <div className="flex h-[calc(100vh-6.5rem)] flex-col bg-[var(--app-color-surface-page)]">
        <TabBar view={shell.view} onViewChange={shell.setView} onNewDocument={() => shell.startEdit()} />
        <KnowledgeLayout
          sidebar={null}
          content={
            <div className="flex flex-col items-center justify-center py-16">
              <AlertTriangle className="size-12 text-[var(--app-color-feedback-warning)]" />
              <h2 className="mt-4 text-lg font-semibold text-[var(--app-color-text-primary)]">加载失败</h2>
              <p className="mt-1 text-sm text-[var(--app-color-text-secondary)]">
                {error instanceof Error ? error.message : "无法获取知识库数据，请检查网络后重试"}
              </p>
              <button
                onClick={() => refetch()}
                className="mt-4 inline-flex items-center gap-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-4 py-2 text-sm font-medium text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]"
              >
                <RefreshCw className="size-3.5" />
                重新加载
              </button>
            </div>
          }
        />
      </div>
    );
  }

  // ── Center panel renderer ──
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
    if (shell.view === "graph") {
      return <KnowledgeGraphView onSelectPage={shell.selectPage} />;
    }

    // Timeline view
    if (shell.view === "timeline") {
      return <KnowledgeTimelineView onSelectPage={shell.selectPage} />;
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

    // Browse: page selected but loading
    if (pageLoading) {
      return (
        <div className="space-y-4">
          <div className="h-8 w-3/4 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]" />
          <div className="h-4 w-1/3 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]" />
          <div className="h-px bg-[var(--app-color-border-default)]" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-4 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]"
              style={{ width: `${70 + Math.random() * 30}%` }}
            />
          ))}
        </div>
      );
    }

    // Browse: page not found
    if (!page) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-lg font-semibold text-[var(--app-color-text-primary)]">文档不存在</p>
          <p className="mt-1 text-sm text-[var(--app-color-text-secondary)]">该页面可能已被移动、删除，或链接无效</p>
          <button
            onClick={shell.deselectPage}
            className="mt-4 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-4 py-2 text-sm font-medium text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]"
          >
            返回知识库首页
          </button>
        </div>
      );
    }

    // Browse: page displayed
    return (
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              onClick={shell.deselectPage}
              className="mb-2 flex items-center gap-1 text-xs text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)]"
            >
              <ArrowLeft className="size-3" />
              返回知识库
            </button>
            <h1 className="text-xl font-bold text-[var(--app-color-text-primary)]">{page.title}</h1>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={() => shell.startEdit(page.id)}
              className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
            >
              <Pencil className="mr-1 inline size-3" />
              编辑
            </button>
            <button
              onClick={() => shell.openHistory(page.id)}
              className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
            >
              <Clock className="mr-1 inline size-3" />
              历史
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

  // ── Right panel (browse mode only) ──
  const renderOutline = () => {
    if (shell.isEditing || shell.view !== "browse" || !page) return null;
    return (
      <>
        <KnowledgePageOutline contentMd={page.contentMd} contentHtml={page.contentHtml} />
        <BacklinksList pageId={page.id} onSelectPage={shell.selectPage} />
      </>
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
          outline={renderOutline()}
          content={renderCenter()}
        />
      </div>

      {/* Status bar */}
      <div className="knowledge-status-bar flex items-center gap-2 px-3 h-5 shrink-0 border-t border-[var(--app-color-border-default)]">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span>{tree?.length ?? 0} 分类</span>
        <span className="opacity-40">·</span>
        <span>{tree?.reduce((sum, n) => sum + n.pages.length + n.children.reduce((s, c) => s + c.pages.length, 0), 0) ?? 0} 篇</span>
      </div>

      <KnowledgeHistoryDrawer
        open={shell.isHistoryOpen}
        pageId={shell.historyPageId}
        onClose={shell.closeHistory}
        onRollback={() => {
          shell.closeHistory();
          refetch();
        }}
      />
    </div>
  );
}
