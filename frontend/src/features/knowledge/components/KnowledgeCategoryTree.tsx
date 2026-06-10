import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, FileText, Trash2, FolderPlus, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createKnowledgeCategory, deleteKnowledgeCategory } from "@/api/domains/knowledge.api";
import type { KnowledgeTreeNode } from "@/features/knowledge/types";

interface Props {
  tree: KnowledgeTreeNode[];
  onSelectPage: (id: number) => void;
  activePageId: number | null;
  onRefresh: () => void;
}

export function KnowledgeCategoryTree({ tree, onSelectPage, activePageId, onRefresh }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    try { const s = sessionStorage.getItem("knowledge-expanded"); return s ? new Set(JSON.parse(s)) : new Set<number>(); } catch { return new Set<number>(); }
  });
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [creating, setCreating] = useState(false);

  // Auto-expand to show active page
  useEffect(() => {
    if (!activePageId || !tree.length) return;
    const find = (nodes: KnowledgeTreeNode[]): boolean => {
      for (const n of nodes) {
        if (n.pages.some(p => p.id === activePageId)) return true;
        if (find(n.children)) { setExpanded(p => new Set([...p, n.categoryId])); return true; }
      }
      return false;
    };
    find(tree);
  }, [activePageId, tree]);

  const toggle = (id: number) => setExpanded(p => {
    const next = new Set(p);
    next.has(id) ? next.delete(id) : next.add(id);
    try { sessionStorage.setItem("knowledge-expanded", JSON.stringify([...next])); } catch {}
    return next;
  });

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createKnowledgeCategory({ name: newName.trim(), slug: newSlug.trim() || newName.trim().replace(/[^a-zA-Z0-9]/g, "-").toLowerCase() });
      setNewName(""); setNewSlug(""); setShowCreate(false); onRefresh();
    } catch { alert("创建失败"); }
    finally { setCreating(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-[var(--app-color-border-default)] px-2 py-1.5">
        <button onClick={() => setShowCreate(!showCreate)} className="flex w-full items-center gap-1.5 rounded-[var(--app-radius-element)] px-2 py-1.5 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]">
          <FolderPlus className="size-3.5" />新建文件夹
        </button>
        {showCreate && (
          <div className="mt-1.5 space-y-1.5 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2">
            <input value={newName} onChange={e => { setNewName(e.target.value); if (!newSlug) setNewSlug(e.target.value.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()); }} placeholder="文件夹名称" autoFocus className="w-full rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-1 text-xs" />
            <input value={newSlug} onChange={e => setNewSlug(e.target.value)} placeholder="slug" className="w-full rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-1 text-[11px] font-mono" />
            <div className="flex gap-1.5">
              <button onClick={handleCreate} disabled={creating || !newName.trim()} className="flex items-center gap-1 rounded bg-[var(--app-color-accent)] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"><Check className="size-3" />创建</button>
              <button onClick={() => { setShowCreate(false); setNewName(""); setNewSlug(""); }} className="rounded border border-[var(--app-color-border-default)] px-2.5 py-1 text-[11px]"><X className="size-3" /></button>
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? <div className="p-4 text-center text-xs text-[var(--app-color-text-tertiary)]">暂无分类</div>
          : tree.map(n => <TreeNode key={n.categoryId} node={n} depth={0} expanded={expanded} toggle={toggle} activePageId={activePageId} onSelectPage={onSelectPage} onRefresh={onRefresh} />)}
      </div>
    </div>
  );
}

function TreeNode({ node, depth, expanded, toggle, activePageId, onSelectPage, onRefresh }: {
  node: KnowledgeTreeNode; depth: number; expanded: Set<number>; toggle: (id: number) => void;
  activePageId: number | null; onSelectPage: (id: number) => void; onRefresh: () => void;
}) {
  const open = expanded.has(node.categoryId);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`删除「${node.categoryName}」？`)) return;
    setDeleting(true);
    try { await deleteKnowledgeCategory(node.categoryId); onRefresh(); } catch { alert("删除失败"); } finally { setDeleting(false); }
  }

  return (
    <div>
      <button onClick={() => toggle(node.categoryId)} className={cn("group flex w-full items-center gap-1.5 rounded-[var(--app-radius-element)] px-2 py-1.5 text-left hover:bg-[var(--app-color-surface-hover)]", depth === 0 && "text-[13px] font-semibold", depth >= 1 && "text-xs")}>
        {open ? <ChevronDown className="size-3.5 shrink-0 opacity-40" /> : <ChevronRight className="size-3.5 shrink-0 opacity-40" />}
        <span className="flex-1 truncate">{node.categoryName}</span>
        <span className="text-[10px] opacity-40">{node.pages.length + node.children.length}</span>
        {node.pages.length === 0 && node.children.length === 0 && (
          <span onClick={handleDelete} className={cn("rounded p-0.5 hover:bg-red-100 hover:text-red-500 opacity-0 group-hover:opacity-100", deleting && "opacity-50")}><Trash2 className="size-3" /></span>
        )}
      </button>
      {open && (
        <div className="ml-3 border-l-2 border-[var(--app-color-border-default)] pl-2">
          {node.children.map(c => <TreeNode key={c.categoryId} node={c} depth={depth + 1} expanded={expanded} toggle={toggle} activePageId={activePageId} onSelectPage={onSelectPage} onRefresh={onRefresh} />)}
          {node.pages.map(p => (
            <button key={p.id} onClick={() => onSelectPage(p.id)} className={cn("flex w-full items-center gap-1.5 rounded-[var(--app-radius-element)] px-2 py-1 text-left text-xs", p.id === activePageId ? "bg-[var(--app-color-accent-soft)] font-medium text-[var(--app-color-accent)]" : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]")}>
              <FileText className="size-3 shrink-0 opacity-50" /><span className="truncate">{p.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
