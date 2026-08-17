/**
 * SpaceTree — 物品台账「左：地点树」递归渲染（文件管理器式）
 *
 * 任意深度递归（楼 → 楼层 → 房间 → 区域 …）。
 * 每空间节点：展开箭头 + 名称 + itemCount 角标；展开后在下方列出该空间直接物品（文件行）。
 * 悬停节点出现两个操作：
 *   - 「新建物品」（文件）→ 回调 onCreateItem(spaceId) 打开完整新建表单
 *   - 「新建子空间」（文件夹）→ 该节点下内联输入名称建子空间
 * 顶部「新建空间」创建根空间（内联）。
 * 点击物品行 → onOpenItem(item)（打开物品详情抽屉）。
 * 搜索：大小写不敏感；搜索态下强制展开所有匹配分支。
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowRightLeft, ChevronDown, ChevronRight, File, FilePlus, Folder, FolderOpen, FolderPlus, Plus, Trash2 } from "lucide-react";
import { createSpace, deleteSpace, updateSpace, type Item, type SpaceNode } from "@/api/domains/inventory.api";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { Portal } from "@/components/Portal";
import ItemIcon from "./ItemIcon";
import { categoryColor, showQty } from "./constants";

export default function SpaceTree(props: {
  tree: SpaceNode[];
  selectedId: number | null;
  expanded: Set<number>;
  search: string;
  itemsBySpace?: Map<number, Item[]>;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
  onCreateItem?: (spaceId: number) => void;
  onOpenItem?: (item: Item) => void;
}) {
  const { tree, selectedId, expanded, search, itemsBySpace, onToggle, onSelect, onCreateItem, onOpenItem } = props;
  const qc = useQueryClient();
  const [creating, setCreating] = useState<{ parentId: number | null; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SpaceNode | null>(null);
  const [moveTarget, setMoveTarget] = useState<SpaceNode | null>(null);
  const [moveParentId, setMoveParentId] = useState("");
  const q = search.trim().toLowerCase();
  const searching = q.length > 0;

  const matches = (n: SpaceNode): boolean => n.name.toLowerCase().includes(q);
  const visible = (n: SpaceNode): boolean => {
    if (!searching) return true;
    if (matches(n)) return true;
    return (n.children ?? []).some(visible);
  };

  const submitCreate = async () => {
    const current = creating;
    if (!current) return;
    const name = current.name.trim();
    if (!name) {
      setCreating(null);
      return;
    }
    try {
      await createSpace({ name, parentId: current.parentId ?? undefined });
      toast.success("空间已创建");
      qc.invalidateQueries({ queryKey: ["inventory", "spaces"] });
      if (current.parentId != null && !expanded.has(current.parentId)) onToggle(current.parentId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    }
    setCreating(null);
  };

  const spaceOptions: { value: number; label: string }[] = (() => {
    const out: { value: number; label: string }[] = [];
    const walk = (nodes: SpaceNode[], depth: number) => {
      for (const n of nodes) {
        out.push({ value: n.id, label: `${"　".repeat(depth)}${n.name}` });
        if (n.children?.length) walk(n.children, depth + 1);
      }
    };
    walk(tree, 0);
    return out;
  })();

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSpace(deleteTarget.id);
      toast.success("空间已删除");
      qc.invalidateQueries({ queryKey: ["inventory", "spaces"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
    setDeleteTarget(null);
  };

  const submitMove = async () => {
    if (!moveTarget) return;
    try {
      await updateSpace(moveTarget.id, moveParentId ? { parentId: Number(moveParentId) } : { moveToRoot: true });
      toast.success("已移动");
      qc.invalidateQueries({ queryKey: ["inventory", "spaces"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移动失败");
    }
    setMoveTarget(null);
    setMoveParentId("");
  };

  const renderCreateInput = (depth: number): ReactNode => (
    <div className="flex items-center" style={{ paddingLeft: depth * 12 + 18 }}>
      <input
        autoFocus
        value={creating?.name ?? ""}
        onChange={(e) => setCreating((c) => (c ? { ...c, name: e.target.value } : c))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submitCreate();
          } else if (e.key === "Escape") {
            setCreating(null);
          }
        }}
        onBlur={() => setCreating(null)}
        placeholder="空间名称，回车确认"
        className="h-7 w-full rounded-twin-sm border border-[var(--twin-link-deep)] bg-[var(--twin-canvas)] px-2 text-[12px] text-[var(--twin-ink)] outline-none placeholder:text-[var(--twin-mute)]"
      />
    </div>
  );

  const render = (n: SpaceNode, depth: number): ReactNode => {
    if (!visible(n)) return null;
    const open = searching ? true : expanded.has(n.id);
    const hasChildren = n.children.length > 0;
    const isSelected = selectedId === n.id;
    const isCreatingHere = creating?.parentId === n.id;
    const items = itemsBySpace?.get(n.id) ?? [];
    return (
      <div key={n.id}>
        <div className="group flex items-center" style={{ paddingLeft: depth * 12 }}>
          <button
            type="button"
            onClick={() => {
              if (hasChildren && !open) onToggle(n.id);
              onSelect(n.id);
            }}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 rounded-twin-sm py-1 pr-1 text-left transition",
              isSelected ? "bg-[var(--twin-link-deep)]/10" : "hover:bg-[var(--twin-canvas-soft)]"
            )}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--twin-mute)]">
              {hasChildren || items.length > 0 ? (
                open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
              ) : (
                <span className="h-3 w-3" />
              )}
            </span>
            {hasChildren ? (
              open ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            ) : (
              <File className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]" />
            )}
            <span className={cn("min-w-0 flex-1 truncate text-[12px]", isSelected ? "font-medium text-[var(--twin-link-deep)]" : "text-[var(--twin-body)]")}>
              {n.name}
            </span>
            {n.itemCount != null && n.itemCount > 0 && (
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 text-[10px] leading-4",
                  isSelected ? "bg-[var(--twin-link-deep)] text-white" : "bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)]"
                )}
              >
                {n.itemCount}
              </span>
            )}
          </button>
          {onCreateItem && (
            <button
              type="button"
              onClick={() => onCreateItem(n.id)}
              title="在此新建物品"
              className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--twin-mute)] opacity-0 transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)] group-hover:opacity-100"
            >
              <FilePlus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setCreating({ parentId: n.id, name: "" });
              if (!open) onToggle(n.id);
            }}
            title="新建子空间"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--twin-mute)] opacity-0 transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)] group-hover:opacity-100"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMoveTarget(n)}
            title="移动空间"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--twin-mute)] opacity-0 transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)] group-hover:opacity-100"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeleteTarget(n)}
            title="删除空间"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--twin-mute)] opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {isCreatingHere && renderCreateInput(depth + 1)}

        {open && (
          <>
            {/* 该空间直接物品（文件行） */}
            {items.length > 0 && (
              <div className="space-y-0.5">
                {items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onOpenItem?.(it)}
                    className="flex w-full items-center gap-1.5 rounded-twin-sm py-0.5 text-left text-[11px] text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)]"
                    style={{ paddingLeft: depth * 12 + 22 }}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: categoryColor(it.categoryName) }} />
                    <ItemIcon value={it.iconValue} className="text-[13px] leading-none" />
                    <span className="min-w-0 flex-1 truncate">{it.name}</span>
                    {showQty(it) ? <span className="shrink-0 text-[9px] text-[var(--twin-mute)]">×{it.qty}</span> : null}
                    {it.rfidCode && <span className="shrink-0 font-mono text-[9px] text-[var(--twin-mute)]">{it.rfidCode}</span>}
                  </button>
                ))}
              </div>
            )}
            {hasChildren && <div className="space-y-0.5">{n.children.map((c) => render(c, depth + 1))}</div>}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => setCreating({ parentId: null, name: "" })}
        className="flex w-full items-center gap-1.5 rounded-twin-sm px-2 py-1.5 text-left text-[12px] text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
      >
        <Plus className="h-3.5 w-3.5" /> 新建空间
      </button>
      {creating?.parentId === null && renderCreateInput(0)}
      {tree.map((n) => render(n, 0))}
      {tree.length === 0 && !creating && (
        <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">暂无空间，点击上方「新建空间」</div>
      )}

      {deleteTarget && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleteTarget(null)}>
            <div className="w-full max-w-sm rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-[var(--twin-ink)]">删除空间</h3>
              <p className="mt-2 text-sm text-[var(--twin-body)]">确认删除「{deleteTarget.name}」？仅当该空间下没有子空间和物品时才能删除。</p>
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]" onClick={() => setDeleteTarget(null)}>取消</button>
                <button className="rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-danger)] px-3 py-2 text-sm font-medium text-[var(--app-color-text-on-danger)]" onClick={() => void confirmDelete()}>确认删除</button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {moveTarget && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setMoveTarget(null)}>
            <div className="w-full max-w-md rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-[var(--twin-ink)]">移动空间</h3>
              <p className="mt-2 text-sm text-[var(--twin-body)]">将「{moveTarget.name}」移动到：</p>
              <select value={moveParentId} onChange={(e) => setMoveParentId(e.target.value)} className="mt-3 w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]">
                <option value="">（根）</option>
                {spaceOptions.filter((o) => o.value !== moveTarget.id).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]" onClick={() => setMoveTarget(null)}>取消</button>
                <button className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]" onClick={() => void submitMove()}>确认移动</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
