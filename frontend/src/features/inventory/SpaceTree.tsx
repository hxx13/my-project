/**
 * SpaceTree — 物品台账「左：地点树」
 *
 * 结构、缩进、展开热区、计数槽、行内「⋯」菜单、内联新建、拖放、移动弹窗外壳
 * 全部走通用 <Tree>；这里只提供空间树自己的语义：
 *   - 计数 = 子树物品数（含子孙）
 *   - 展开箭头还要看该空间有没有直接挂物品（有物品就要能展开）
 *   - 行下方列该空间的物品（文件行）
 *   - 移动：树选择器选新父空间，「移到根」单列一个按钮
 *   - 删除：本组件自持确认弹窗
 *
 * 行的拖放只接线（draggable/droppable），落点由页面在 DndScope.onDrop 里解析。
 */

import { useState } from "react";
import { ArrowRightLeft, FilePlus, FolderPlus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { createSpace, deleteSpace, updateSpace, type Item, type SpaceNode } from "@/api/domains/inventory.api";
import { Portal } from "@/components/Portal";
import { Tree } from "@/components/tree/Tree";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { SpaceTreeSelect } from "@/components/admin/SpaceTreeSelect";
import ItemIcon from "./ItemIcon";
import { categoryColor, showQty, sumSubtreeItemCount } from "./constants";

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
  const [deleteTarget, setDeleteTarget] = useState<SpaceNode | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["inventory", "spaces"] });
  };

  const handleCreate = async (parentId: number | null, name: string) => {
    try {
      await createSpace({ name, parentId: parentId ?? undefined });
      toast.success("空间已创建");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    }
  };

  const handleMove = async (node: SpaceNode, parentId: number | null) => {
    try {
      await updateSpace(node.id, parentId == null ? { moveToRoot: true } : { parentId });
      toast.success("已移动");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移动失败");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSpace(deleteTarget.id);
      toast.success("空间已删除");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
    setDeleteTarget(null);
  };

  return (
    <>
      <Tree<SpaceNode>
        nodes={tree}
        getId={(n) => n.id}
        getName={(n) => n.name}
        getChildren={(n) => n.children}
        getCount={(n) => sumSubtreeItemCount([n])}
        expandable={(n) => (n.children?.length ?? 0) > 0 || (itemsBySpace?.get(n.id)?.length ?? 0) > 0}
        selectedId={selectedId}
        expanded={expanded}
        keyword={search}
        onSelect={onSelect}
        onToggle={onToggle}
        createPlaceholder="空间名称"
        createRootLabel="新建空间"
        onCreate={(parentId, name) => void handleCreate(parentId, name)}
        emptyText="暂无空间，点击上方「新建空间」"
        noMatchText="没有匹配的空间"
        draggable
        droppable
        renderExtras={(n, depth) => {
          const items = itemsBySpace?.get(n.id) ?? [];
          if (items.length === 0) return null;
          return (
            <div className="space-y-0.5" data-tree-children={n.id}>
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onOpenItem?.(it)}
                  className="flex w-full items-center gap-1.5 rounded-twin-sm py-0.5 text-left text-[11px] text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)]"
                  style={{ paddingLeft: depth * 8 + 20 }}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: categoryColor(it.categoryName) }} />
                  <ItemIcon value={it.iconValue} className="text-[13px] leading-none" />
                  <span className="min-w-0 flex-1 truncate">{it.name}</span>
                  {showQty(it) ? <span className="shrink-0 text-[9px] text-[var(--twin-mute)]">×{it.qty}</span> : null}
                  {it.rfidCode && <span className="shrink-0 font-mono text-[9px] text-[var(--twin-mute)]">{it.rfidCode}</span>}
                </button>
              ))}
            </div>
          );
        }}
        renderMenu={(n, h) => (
          <>
            {onCreateItem && (
              <DropdownMenuItem onSelect={() => onCreateItem(n.id)}>
                <FilePlus className="mr-2 h-3.5 w-3.5" />
                新建物品
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={h.startCreateChild}>
              <FolderPlus className="mr-2 h-3.5 w-3.5" />
              新建子空间
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={h.startMove}>
              <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
              移动空间
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setDeleteTarget(n)} className="text-red-600 focus:text-red-700">
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              删除空间
            </DropdownMenuItem>
          </>
        )}
        move={{
          title: "移动空间",
          selectPlaceholder: "选择新父空间",
          allowMoveToRoot: true,
          // 候选排除自己 + 自己整棵子树（不能挪进自己的子树）
          excludeIds: (n) => {
            const ids = new Set<number>([n.id]);
            const walk = (list: SpaceNode[]) => {
              for (const c of list) {
                ids.add(c.id);
                walk(c.children ?? []);
              }
            };
            walk(n.children ?? []);
            return ids;
          },
          renderSelect: (p) => (
            <SpaceTreeSelect value={p.value} onChange={p.onChange} excludeIds={p.excludeIds} placeholder={p.placeholder} />
          ),
          onConfirm: (n, parentId) => void handleMove(n, parentId),
        }}
      />

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
    </>
  );
}
