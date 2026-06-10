import { useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, ChevronDown, FileText, Trash2, FolderPlus, Check, X, Pencil, MoveHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { createKnowledgeCategory, updateKnowledgeCategory, deleteKnowledgeCategory, updateKnowledgePage } from "@/api/domains/knowledge.api";
import type { KnowledgeTreeNode } from "@/features/knowledge/types";

// ═══════════════════════════════════════════
// 共享组件
// ═══════════════════════════════════════════

/** Portal 渲染的下拉菜单 — 统一用于文件夹移动和文档移动 */
function Dropdown({ anchor, open, onClose, children }: { anchor: HTMLElement | null; open: boolean; onClose: () => void; children: ReactNode }) {
  const elRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useEffect(() => {
    if (!open || !anchor) return;
    const r = anchor.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4 });
    const onClick = (e: MouseEvent) => { if (elRef.current && !elRef.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener("click", onClick), 0);
    return () => document.removeEventListener("click", onClick);
  }, [open, anchor, onClose]);
  if (!open) return null;
  return createPortal(
    <div ref={elRef} className="fixed rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] shadow-[var(--app-elevation-modal)] py-1 text-[11px] min-w-[160px]" style={{ left: pos.left, top: pos.top, zIndex: "var(--z-modal)" }}>
      {children}
    </div>, document.body
  );
}

/** 统一的"移动到…"菜单 */
function MoveMenu({ anchor, open, onClose, targets, currentId, onMove, label, showRoot }: {
  anchor: HTMLElement | null; open: boolean; onClose: () => void;
  targets: { id: number; name: string }[]; currentId: number; onMove: (targetId: number | null) => void;
  label: string; showRoot: boolean;
}) {
  return (
    <Dropdown anchor={anchor} open={open} onClose={onClose}>
      <div className="px-2 py-1 text-[var(--app-color-text-tertiary)] text-[10px] uppercase">{label}</div>
      {showRoot && <button onClick={() => onMove(null)} className="block w-full text-left px-3 py-1.5 hover:bg-[var(--app-color-surface-hover)]">📁 顶层</button>}
      {targets.filter(t => t.id !== currentId).map(t => (
        <button key={t.id} onClick={() => onMove(t.id)} className="block w-full text-left px-3 py-1.5 hover:bg-[var(--app-color-surface-hover)]">{t.name}</button>
      ))}
    </Dropdown>
  );
}

// ═══════════════════════════════════════════
// Props
// ═══════════════════════════════════════════

interface Props { tree: KnowledgeTreeNode[]; onSelectPage: (id: number) => void; activePageId: number | null; onRefresh: () => void }

// ═══════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════

export function KnowledgeCategoryTree({ tree, onSelectPage, activePageId, onRefresh }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    try { const s = sessionStorage.getItem("knowledge-expanded"); return s ? new Set(JSON.parse(s)) : new Set<number>(); } catch { return new Set<number>(); }
  });
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [creating, setCreating] = useState(false);

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
    const next = new Set(p); next.has(id) ? next.delete(id) : next.add(id);
    try { sessionStorage.setItem("knowledge-expanded", JSON.stringify([...next])); } catch {}
    return next;
  });

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createKnowledgeCategory({ name: newName.trim(), slug: newSlug.trim() || newName.trim().replace(/[^a-zA-Z0-9]/g, "-").toLowerCase() });
      setNewName(""); setNewSlug(""); setShowCreate(false); onRefresh();
    } catch { alert("创建失败"); } finally { setCreating(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-[var(--app-color-border-default)] px-2 py-1.5">
        <button onClick={() => setShowCreate(!showCreate)} className="flex w-full items-center gap-1.5 rounded-[var(--app-radius-element)] px-2 py-1.5 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"><FolderPlus className="size-3.5" />新建文件夹</button>
        {showCreate && (
          <div className="mt-1.5 space-y-1.5 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2">
            <input value={newName} onChange={e => { setNewName(e.target.value); if (!newSlug) setNewSlug(e.target.value.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()); }} placeholder="文件夹名称" autoFocus className="w-full rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-1 text-xs" />
            <input value={newSlug} onChange={e => setNewSlug(e.target.value)} placeholder="slug" className="w-full rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-1 text-[11px] font-mono" />
            <div className="flex gap-1.5"><button onClick={handleCreate} disabled={creating || !newName.trim()} className="flex items-center gap-1 rounded bg-[var(--app-color-accent)] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"><Check className="size-3" />创建</button><button onClick={() => { setShowCreate(false); setNewName(""); setNewSlug(""); }} className="rounded border border-[var(--app-color-border-default)] px-2.5 py-1 text-[11px]"><X className="size-3" /></button></div>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? <div className="p-4 text-center text-xs text-[var(--app-color-text-tertiary)]">暂无分类</div> : tree.map(n => <TreeNode key={n.categoryId} node={n} depth={0} expanded={expanded} toggle={toggle} activePageId={activePageId} onSelectPage={onSelectPage} onRefresh={onRefresh} allCats={tree} />)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// TreeNode
// ═══════════════════════════════════════════

function TreeNode({ node, depth, expanded, toggle, activePageId, onSelectPage, onRefresh, allCats }: {
  node: KnowledgeTreeNode; depth: number; expanded: Set<number>; toggle: (id: number) => void;
  activePageId: number | null; onSelectPage: (id: number) => void; onRefresh: () => void; allCats: KnowledgeTreeNode[];
}) {
  const open = expanded.has(node.categoryId);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(""); const [editSlug, setEditSlug] = useState("");
  const [saving, setSaving] = useState(false);

  // 统一的移动菜单状态
  const [moveAnchor, setMoveAnchor] = useState<HTMLElement | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ type: "folder"; catId: number } | { type: "page"; pageId: number; slug: string; title: string } | null>(null);

  function startEdit() { setEditName(node.categoryName); setEditSlug(node.categorySlug); setEditing(true); }

  async function handleSaveEdit() {
    if (!editName.trim()) return; setSaving(true);
    try { await updateKnowledgeCategory(node.categoryId, { name: editName.trim(), slug: editSlug.trim() || undefined }); setEditing(false); onRefresh(); }
    catch { alert("保存失败"); } finally { setSaving(false); }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation(); if (!confirm(`删除「${node.categoryName}」？`)) return;
    setDeleting(true);
    try { await deleteKnowledgeCategory(node.categoryId); onRefresh(); } catch { alert("删除失败"); } finally { setDeleting(false); }
  }

  async function handleMove(targetId: number | null) {
    if (!moveTarget) return;
    try {
      if (moveTarget.type === "folder") {
        // pass all current values + new parentId; 0 = move to root
        await updateKnowledgeCategory(moveTarget.catId, { name: node.categoryName, slug: node.categorySlug, parentId: targetId ?? 0 });
      } else {
        await updateKnowledgePage(moveTarget.pageId, { categoryId: targetId ?? 0, slug: moveTarget.slug, title: moveTarget.title });
      }
      setMoveAnchor(null); setMoveTarget(null); onRefresh();
    } catch { alert("移动失败"); }
  }

  const allCategories = (function flatten(nodes: KnowledgeTreeNode[]): { id: number; name: string }[] {
    return nodes.flatMap(n => [{ id: n.categoryId, name: n.categoryName }, ...flatten(n.children)]);
  })(allCats);

  return (
    <div>
      {/* ── 分类行 ── */}
      <div className="group flex items-center gap-0.5 rounded-[var(--app-radius-element)] pr-1 hover:bg-[var(--app-color-surface-hover)]">
        <button onClick={() => toggle(node.categoryId)} className={cn("flex flex-1 items-center gap-1.5 rounded-[var(--app-radius-element)] px-2 py-1.5 text-left", depth === 0 && "text-[13px] font-semibold", depth >= 1 && "text-xs")}>
          {open ? <ChevronDown className="size-3.5 shrink-0 opacity-40" /> : <ChevronRight className="size-3.5 shrink-0 opacity-40" />}
          {editing ? <input value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-1 py-0 text-xs min-w-0" onClick={e => e.stopPropagation()} autoFocus /> : <span className="flex-1 truncate">{node.categoryName}</span>}
          <span className="text-[10px] opacity-40">{node.pages.length + node.children.length}</span>
        </button>
        {editing ? (
          <div className="flex gap-0.5 shrink-0"><button onClick={handleSaveEdit} disabled={saving} className="rounded p-0.5 text-emerald-500 hover:bg-emerald-50"><Check className="size-3" /></button><button onClick={() => setEditing(false)} className="rounded p-0.5 hover:bg-[var(--app-color-surface-hover)]"><X className="size-3" /></button></div>
        ) : (
          <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={(e) => { e.stopPropagation(); setMoveAnchor(e.currentTarget); setMoveTarget({ type: "folder", catId: node.categoryId }); }} className="rounded p-0.5 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)] hover:bg-[var(--app-color-surface-hover)]" title="移动"><MoveHorizontal className="size-3" /></button>
            <button onClick={startEdit} className="rounded p-0.5 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)] hover:bg-[var(--app-color-surface-hover)]" title="重命名"><Pencil className="size-3" /></button>
            {node.pages.length === 0 && node.children.length === 0 && <button onClick={handleDelete} disabled={deleting} className="rounded p-0.5 text-[var(--app-color-text-tertiary)] hover:text-red-500 hover:bg-red-50" title="删除"><Trash2 className="size-3" /></button>}
          </div>
        )}
      </div>

      {/* ── 展开子内容 ── */}
      {open && (
        <div className="ml-3 border-l-2 border-[var(--app-color-border-default)] pl-2">
          {node.children.map(c => <TreeNode key={c.categoryId} node={c} depth={depth + 1} expanded={expanded} toggle={toggle} activePageId={activePageId} onSelectPage={onSelectPage} onRefresh={onRefresh} allCats={allCats} />)}
          {node.pages.map(p => (
            <div key={p.id} className="group flex items-center gap-0.5 rounded-[var(--app-radius-element)] pr-1 hover:bg-[var(--app-color-surface-hover)]">
              <button onClick={() => onSelectPage(p.id)} className={cn("flex flex-1 items-center gap-1.5 rounded-[var(--app-radius-element)] px-2 py-1 text-left text-xs", p.id === activePageId ? "bg-[var(--app-color-accent-soft)] font-medium text-[var(--app-color-accent)]" : "text-[var(--app-color-text-secondary)]")}><FileText className="size-3 shrink-0 opacity-50" /><span className="truncate">{p.title}</span></button>
              <button onClick={(e) => { e.stopPropagation(); setMoveAnchor(e.currentTarget); setMoveTarget({ type: "page", pageId: p.id, slug: p.slug, title: p.title }); }} className="rounded p-0.5 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" title="移动"><MoveHorizontal className="size-3" /></button>
            </div>
          ))}
        </div>
      )}

      {/* ── 统一的移动菜单（文件夹和文档共用）── */}
      <MoveMenu
        anchor={moveAnchor}
        open={moveTarget !== null}
        onClose={() => { setMoveAnchor(null); setMoveTarget(null); }}
        targets={allCategories}
        currentId={moveTarget?.type === "folder" ? moveTarget.catId : node.categoryId}
        onMove={handleMove}
        showRoot={moveTarget?.type === "folder"}
        label={moveTarget?.type === "folder" ? `移动「${node.categoryName}」到` : "移动文档到"}
      />
    </div>
  );
}
