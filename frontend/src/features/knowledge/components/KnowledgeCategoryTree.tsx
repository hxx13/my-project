import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, FileText, Trash2, FolderPlus, Check, X } from "lucide-react";
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
}

const DEPTH_COLORS = ["text-indigo-600", "text-blue-600", "text-teal-600"];
const DEPTH_BORDER = ["border-indigo-200", "border-blue-200", "border-teal-200"];

export function KnowledgeCategoryTree({
  tree, isLoading, depth = 0, onRefresh, onSelectPage, activePageId,
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

  // Auto-expand parents of active page (only on depth=0, only when activePageId changes)
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
  }, [activePageId, depth]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createKnowledgeCategory({ name: newName.trim(), slug: newSlug.trim() || newName.trim().replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() });
      setNewName(""); setNewSlug(""); setShowCreate(false); refresh();
    } catch { alert("创建失败"); }
    finally { setCreating(false); }
  };

  if (isLoading && depth === 0) {
    return <div className="space-y-1 p-2">{Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="h-7 animate-skeleton-pulse rounded bg-[var(--app-color-surface-hover)]" />
    ))}</div>;
  }

  return (
    <div className={cn(depth === 0 && "flex h-full flex-col", depth > 0 && "ml-3 border-l-2 pl-2", depth > 0 && DEPTH_BORDER[Math.min(depth, 2)])}>
      {/* Toolbar (depth=0 only) */}
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

      {/* Tree */}
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

      {/* Children always render when expanded */}
      {hasChildren && isOpen && (
        node.children.length > 0
          ? <KnowledgeCategoryTree tree={node.children} depth={depth + 1} onSelectPage={onSelectPage} activePageId={activePageId} />
          : <div className="ml-6 py-1 text-[11px] text-[var(--app-color-text-tertiary)] italic">空文件夹</div>
      )}

      {/* Pages */}
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
