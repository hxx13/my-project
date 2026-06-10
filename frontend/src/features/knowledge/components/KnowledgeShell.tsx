import { useState } from "react";
import { useKnowledgeShell } from "@/features/knowledge/hooks/useKnowledgeShell";
import { useKnowledgeCategories } from "@/features/knowledge/hooks/useKnowledgeCategories";
import { useKnowledgePage } from "@/features/knowledge/hooks/useKnowledgePage";
import { TabBar } from "./TabBar";
import { KnowledgeLayout } from "./KnowledgeLayout";
import { KnowledgeCategoryTree } from "./KnowledgeCategoryTree";
import { KnowledgeDashboard } from "./KnowledgeDashboard";
import { KnowledgePageRenderer } from "./KnowledgePageRenderer";
import { KnowledgePageOutline } from "./KnowledgePageOutline";
import { KnowledgePageMeta } from "./KnowledgePageMeta";
import { KnowledgeEditorPanel } from "./KnowledgeEditorPanel";
import { KnowledgeGraphView } from "./KnowledgeGraphView";
import { KnowledgeTimelineView } from "./KnowledgeTimelineView";
import { KnowledgeHistoryDrawer } from "./KnowledgeHistoryDrawer";
import { KnowledgeImportDialog } from "./KnowledgeImportDialog";
import { BacklinksList } from "./BacklinksList";
import { AlertTriangle, RefreshCw, Pencil, Clock, Upload } from "lucide-react";

export function KnowledgeShell() {
  const shell = useKnowledgeShell();
  const { data: tree, isLoading, isError, error, refetch } = useKnowledgeCategories();
  const [showImport, setShowImport] = useState(false);
  const { data: page } = useKnowledgePage(shell.selectedPageId);

  // ── Graph view: 全屏沉浸式，不使用三栏布局 ──
  // ── Graph: 全屏沉浸，无 TabBar（图谱自带返回按钮）──
  if (shell.view === "graph") {
    return (
      <div className="h-full bg-[#0a0f1a] page-full-bleed">
        <KnowledgeGraphView tree={tree ?? []} onSelectPage={shell.selectPage} onClose={() => shell.setView("browse")} />
        <KnowledgeHistoryDrawer open={shell.isHistoryOpen} pageId={shell.historyPageId} onClose={shell.closeHistory} onRollback={refetch} />
        <KnowledgeImportDialog open={showImport} onClose={() => setShowImport(false)} onImported={refetch} />
      </div>
    );
  }

  const renderCenter = () => {
    if (shell.isEditing) return <KnowledgeEditorPanel page={shell.editingPageId ? page ?? null : null} onSaved={p => { shell.selectPage(p.id); shell.stopEdit(); }} onCancel={() => shell.stopEdit()} />;
    if (shell.view === "timeline") return <KnowledgeTimelineView onSelectPage={shell.selectPage} />;
    if (!shell.selectedPageId) return <div className="p-6"><KnowledgeDashboard stats={null} onSelectPage={shell.selectPage} /></div>;
    if (!page) return <div className="flex flex-col items-center justify-center py-16"><p className="text-lg font-semibold">文档不存在</p><button onClick={shell.deselectPage} className="mt-4 rounded border px-4 py-2 text-sm">返回首页</button></div>;

    return (
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0"><h1 className="text-xl font-bold truncate">{page.title}</h1></div>
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => shell.startEdit(page.id)} className="rounded border px-3 py-1.5 text-xs hover:bg-[var(--app-color-surface-hover)]"><Pencil className="size-3 inline mr-1" />编辑</button>
            <button onClick={() => shell.openHistory(page.id)} className="rounded border px-3 py-1.5 text-xs hover:bg-[var(--app-color-surface-hover)]"><Clock className="size-3 inline mr-1" />历史</button>
          </div>
        </div>
        <KnowledgePageRenderer contentMd={page.contentMd} contentHtml={page.contentHtml} />
        <KnowledgePageMeta page={page} />
      </div>
    );
  };

  if (isLoading) return <div className="flex h-full flex-col bg-[var(--app-color-surface-page)]"><TabBar view={shell.view} onViewChange={shell.setView} onNewDocument={() => shell.startEdit()} onImport={() => setShowImport(true)} /><div className="flex-1 flex items-center justify-center"><div className="text-sm text-[var(--app-color-text-tertiary)]">加载中…</div></div></div>;

  if (isError) return (
    <div className="flex h-full flex-col bg-[var(--app-color-surface-page)]">
      <TabBar view={shell.view} onViewChange={shell.setView} onNewDocument={() => shell.startEdit()} onImport={() => setShowImport(true)} />
      <div className="flex-1 flex flex-col items-center justify-center">
        <AlertTriangle className="size-12 text-[var(--app-color-feedback-warning)]" />
        <h2 className="mt-4 text-lg font-semibold">加载失败</h2>
        <p className="mt-1 text-sm text-[var(--app-color-text-secondary)]">{error instanceof Error ? error.message : "无法获取数据"}</p>
        <button onClick={() => refetch()} className="mt-4 inline-flex items-center gap-1.5 rounded border px-4 py-2 text-sm"><RefreshCw className="size-3.5" />重新加载</button>
      </div>
    </div>
  );

  return (
    <div className="h-full grid bg-[var(--app-color-surface-page)] page-full-bleed" style={{ gridTemplateRows: "auto 1fr" }}>
      <TabBar view={shell.view} onViewChange={shell.setView} onNewDocument={() => shell.startEdit()} onImport={() => setShowImport(true)} />
      <div className="min-h-0">
        <KnowledgeLayout
          sidebar={<KnowledgeCategoryTree tree={tree ?? []} onSelectPage={shell.selectPage} activePageId={shell.selectedPageId} onRefresh={refetch} />}
          content={renderCenter()}
          outline={shell.view === "browse" && page && !shell.isEditing ? <div className="p-4"><KnowledgePageOutline contentMd={page.contentMd} contentHtml={page.contentHtml} /><BacklinksList pageId={page.id} onSelectPage={shell.selectPage} /></div> : undefined}
        />
      </div>
      <KnowledgeHistoryDrawer open={shell.isHistoryOpen} pageId={shell.historyPageId} onClose={shell.closeHistory} onRollback={refetch} />
      <KnowledgeImportDialog open={showImport} onClose={() => setShowImport(false)} onImported={refetch} />
    </div>
  );
}
