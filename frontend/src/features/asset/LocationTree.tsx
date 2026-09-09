/**
 * LocationTree — 资产记录 · 左「地点树」
 *
 * 任意深度递归（顶层 460 个平铺节点，层级由用户后续手工整理）。
 * 节点行 = 展开箭头 + 名称 + totalCount 徽标。
 * 交互：
 *   - 点击行选中；有子节点时点击行/箭头展开收起
 *   - 悬停「⋯」或右键 → 菜单：新建子节点 / 改名 / 删除（prompt/confirm 由本组件弹）
 *   - 资产卡片拖到节点行 → onDropAsset(assetId, nodeId)，落点行高亮
 * 搜索态由父级 keyword 驱动：filterTree 裁掉未命中分支并强制展开命中链。
 * 只负责渲染与交互，接口调用全部由父级回调处理。
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal, Pencil, FolderPlus, Trash2 } from "lucide-react";
import type { AssetLocationNode } from "@/api/domains/assetLocation.api";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import { cn } from "@/lib/utils";
import { filterTree, findPath } from "./locationTreeUtils";

export type LocationTreeProps = {
  tree: AssetLocationNode[];
  selectedId: number | null;
  expanded: Set<number>;
  /** 搜索关键字，空串表示不搜索 */
  keyword: string;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  /** 在 parentId 下新建子地点，name 已 trim 且非空 */
  onCreateChild: (parentId: number, name: string) => void;
  /** 改名，name 已 trim 且与原名不同 */
  onRename: (id: number, name: string) => void;
  /** 删除（用户已确认）；非空节点由后端拒绝，错误由父级 toast 透出 */
  onDelete: (id: number) => void;
  /** 资产卡片落到节点上 */
  onDropAsset: (assetId: string, nodeId: number) => void;
};

type MenuState = { id: number; x: number; y: number };

export function LocationTree(props: LocationTreeProps) {
  const {
    tree,
    selectedId,
    expanded,
    keyword,
    onSelect,
    onToggle,
    onCreateChild,
    onRename,
    onDelete,
    onDropAsset,
  } = props;

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const searching = keyword.trim().length > 0;

  const visible = useMemo(() => filterTree(tree, keyword), [tree, keyword]);

  // 菜单/遮罩层关闭：Esc 或任意点击（遮罩捕获）
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu]);

  const doCreateChild = async (node: AssetLocationNode) => {
    const name = await appPrompt(`在「${node.name}」下新建子地点`, "", {
      title: "新建子节点",
      placeholder: "地点名称",
    });
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreateChild(node.id, trimmed);
    if (!expanded.has(node.id)) onToggle(node.id);
  };

  const doRename = async (node: AssetLocationNode) => {
    const name = await appPrompt("修改地点名称", node.name, { title: "改名" });
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === node.name) return;
    onRename(node.id, trimmed);
  };

  const doDelete = async (node: AssetLocationNode) => {
    const ok = await appConfirm(`确认删除地点「${node.name}」？该地点下有子地点或资产时无法删除。`, {
      title: "删除地点",
      danger: true,
    });
    if (!ok) return;
    onDelete(node.id);
  };

  const renderNode = (node: AssetLocationNode, depth: number): ReactNode => {
    const children = node.children ?? [];
    const hasChildren = children.length > 0;
    const open = searching || expanded.has(node.id);
    const isSelected = selectedId === node.id;
    const isDragOver = dragOverId === node.id;
    return (
      <div key={node.id}>
        <div
          className={cn(
            "group flex items-center rounded-twin-sm pr-0.5 transition",
            isSelected ? "bg-[var(--twin-link-deep)]/10" : "hover:bg-[var(--twin-canvas-soft)]",
            isDragOver && "bg-[var(--twin-primary)]/10 ring-2 ring-inset ring-[var(--twin-primary)]"
          )}
          style={{ paddingLeft: depth * 12 }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ id: node.id, x: e.clientX, y: e.clientY });
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (dragOverId !== node.id) setDragOverId(node.id);
          }}
          onDragLeave={() => setDragOverId((prev) => (prev === node.id ? null : prev))}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverId(null);
            const assetId = e.dataTransfer.getData("text/asset-id");
            if (assetId) onDropAsset(assetId, node.id);
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (hasChildren && !open) onToggle(node.id);
              onSelect(node.id);
            }}
            className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--twin-mute)]">
              {hasChildren ? (
                open ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )
              ) : (
                <span className="h-3 w-3" />
              )}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[12px]",
                isSelected ? "font-medium text-[var(--twin-link-deep)]" : "text-[var(--twin-body)]"
              )}
              title={node.name}
            >
              {node.name}
            </span>
            {node.totalCount != null && node.totalCount > 0 && (
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 text-[10px] leading-4",
                  isSelected ? "bg-[var(--twin-link-deep)] text-white" : "bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)]"
                )}
              >
                {node.totalCount}
              </span>
            )}
          </button>
          <button
            type="button"
            title="更多操作"
            aria-label="更多操作"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ id: node.id, x: r.right - 144, y: r.bottom });
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--twin-mute)] opacity-0 transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)] group-hover:opacity-100 focus-visible:opacity-100"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
        {open && hasChildren && <div className="space-y-0.5">{children.map((c) => renderNode(c, depth + 1))}</div>}
      </div>
    );
  };

  const menuNode = menu ? findPath(tree, menu.id).at(-1) ?? null : null;

  return (
    <div className="space-y-0.5">
      {visible.map((n) => renderNode(n, 0))}
      {visible.length === 0 && (
        <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">
          {searching ? "没有匹配的地点" : "暂无地点"}
        </div>
      )}

      {menu && menuNode && (
        <div
          className="fixed inset-0 z-[var(--z-overlay)]"
          onClick={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        >
          <div
            className="absolute w-36 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1 shadow-twin-level-3"
            style={{
              left: Math.max(4, Math.min(menu.x, window.innerWidth - 150)),
              top: Math.min(menu.y, window.innerHeight - 130),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-twin-sm px-2 py-1.5 text-left text-[12px] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
              onClick={() => {
                setMenu(null);
                void doCreateChild(menuNode);
              }}
            >
              <FolderPlus className="h-3.5 w-3.5 shrink-0" /> 新建子节点
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-twin-sm px-2 py-1.5 text-left text-[12px] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
              onClick={() => {
                setMenu(null);
                void doRename(menuNode);
              }}
            >
              <Pencil className="h-3.5 w-3.5 shrink-0" /> 改名
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-twin-sm px-2 py-1.5 text-left text-[12px] text-[var(--app-color-surface-danger)] hover:bg-[var(--twin-canvas-soft)]"
              onClick={() => {
                setMenu(null);
                void doDelete(menuNode);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0" /> 删除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default LocationTree;
