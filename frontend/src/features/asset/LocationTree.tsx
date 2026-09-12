/**
 * LocationTree — 资产记录 · 左「地点树」（文件管理器式，对齐物品台账 SpaceTree）
 *
 * 任意深度递归（顶层 460 个平铺节点，层级由用户后续手工整理）。
 * 顶部「新建地点」→ 内联输入建根节点。
 * 节点行 = 展开箭头 + 文件夹(有子)/文件(无子)图标 + 名称 + totalCount 徽标，缩进按层级。
 * 悬停行内操作：新建子地点（内联输入）/ 改名 / 移动（弹窗选新父节点）/ 删除（appConfirm）。
 * 资产卡片拖到节点行 → onDropAsset(assetId, nodeId)，落点行 ring 高亮。
 * 搜索态由父级 keyword 驱动：filterTree 裁掉未命中分支并强制展开命中链。
 * 只负责渲染与交互，接口调用全部由父级回调处理。
 */

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Smile,
  Trash2,
} from "lucide-react";
import type { AssetLocationNode } from "@/api/domains/assetLocation.api";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import { Portal } from "@/components/Portal";
import EmojiPicker from "@/components/ui/EmojiPicker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { collectDescendantIds, filterTree } from "./locationTreeUtils";

export type LocationTreeProps = {
  tree: AssetLocationNode[];
  selectedId: number | null;
  expanded: Set<number>;
  /** 搜索关键字，空串表示不搜索 */
  keyword: string;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  /** 新建根地点，name 已 trim 且非空 */
  onCreateRoot: (name: string) => void;
  /** 在 parentId 下新建子地点，name 已 trim 且非空 */
  onCreateChild: (parentId: number, name: string) => void;
  /** 改名，name 已 trim 且与原名不同 */
  onRename: (id: number, name: string) => void;
  /** 移动到新父节点；后端不支持移到根，故 parentId 必为有效节点 id */
  onMove: (id: number, parentId: number) => void;
  /** 删除（用户已确认）；非空节点由后端拒绝，错误由父级 toast 透出 */
  onDelete: (id: number) => void;
  /** 设置地点图标；不传则不显示「设置图标」入口（父级接 mutation，本组件不直接调接口） */
  onSetIcon?: (id: number, icon: string) => void;
  /** 资产卡片落到节点上 */
  onDropAsset: (assetId: string, nodeId: number) => void;
};

export function LocationTree(props: LocationTreeProps) {
  const {
    tree,
    selectedId,
    expanded,
    keyword,
    onSelect,
    onToggle,
    onCreateRoot,
    onCreateChild,
    onRename,
    onMove,
    onDelete,
    onSetIcon,
    onDropAsset,
  } = props;

  const [creating, setCreating] = useState<{ parentId: number | null; name: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<AssetLocationNode | null>(null);
  const [moveParentId, setMoveParentId] = useState("");
  const [iconTarget, setIconTarget] = useState<AssetLocationNode | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searching = keyword.trim().length > 0;

  /** 展开后把第一个子节点滚进视野：子节点落在可视区外时看着像没展开 */
  const expandAndReveal = (node: AssetLocationNode) => {
    const willOpen = !(searching || expanded.has(node.id));
    onToggle(node.id);
    if (!willOpen) return;
    const firstChild = (node.children ?? [])[0];
    if (!firstChild) return;
    requestAnimationFrame(() => {
      rootRef.current?.querySelector(`[data-node-id="${firstChild.id}"]`)?.scrollIntoView({ block: "nearest" });
    });
  };

  const visible = useMemo(() => filterTree(tree, keyword), [tree, keyword]);

  const nodeOptions = useMemo(() => {
    const out: { value: number; label: string }[] = [];
    const walk = (nodes: AssetLocationNode[], depth: number) => {
      for (const n of nodes) {
        out.push({ value: n.id, label: `${"　".repeat(depth)}${n.name}` });
        if (n.children?.length) walk(n.children, depth + 1);
      }
    };
    walk(tree, 0);
    return out;
  }, [tree]);

  const moveCandidates = useMemo(() => {
    if (!moveTarget) return [];
    const excluded = new Set(collectDescendantIds(moveTarget));
    return nodeOptions.filter((o) => !excluded.has(o.value));
  }, [moveTarget, nodeOptions]);

  const submitCreate = () => {
    const current = creating;
    if (!current) return;
    const name = current.name.trim();
    setCreating(null);
    if (!name) return;
    if (current.parentId == null) {
      onCreateRoot(name);
      return;
    }
    onCreateChild(current.parentId, name);
    if (!expanded.has(current.parentId)) onToggle(current.parentId);
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

  const submitMove = () => {
    if (!moveTarget || !moveParentId) return;
    onMove(moveTarget.id, Number(moveParentId));
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
            submitCreate();
          } else if (e.key === "Escape") {
            setCreating(null);
          }
        }}
        onBlur={() => setCreating(null)}
        placeholder="地点名称，回车确认"
        className="h-7 w-full rounded-twin-sm border border-[var(--twin-link-deep)] bg-[var(--twin-canvas)] px-2 text-[12px] text-[var(--twin-ink)] outline-none placeholder:text-[var(--twin-mute)]"
      />
    </div>
  );

  const renderNode = (node: AssetLocationNode, depth: number): ReactNode => {
    const children = node.children ?? [];
    const hasChildren = children.length > 0;
    const open = searching || expanded.has(node.id);
    const isSelected = selectedId === node.id;
    const isDragOver = dragOverId === node.id;
    const isCreatingHere = creating?.parentId === node.id;
    return (
      <div key={node.id}>
        <div
          data-node-id={node.id}
          className={cn(
            "group flex items-center rounded-twin-sm",
            isDragOver && "bg-[color-mix(in_srgb,var(--twin-primary)_10%,transparent)] ring-2 ring-inset ring-[var(--twin-primary)]"
          )}
          style={{ paddingLeft: depth * 12 }}
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
              if (hasChildren && !open) expandAndReveal(node);
              onSelect(node.id);
            }}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 rounded-twin-sm py-1 pr-1 text-left transition",
              isSelected ? "bg-[color-mix(in_srgb,var(--twin-link-deep)_10%,transparent)]" : "hover:bg-[var(--twin-canvas-soft)]"
            )}
          >
            {/* 展开箭头是独立热区：点击只切换展开/收起，不再被行点击吞掉 */}
            <span
              role="button"
              tabIndex={-1}
              aria-label={open ? "收起" : "展开"}
              onClick={(e) => {
                if (!hasChildren) return;
                e.stopPropagation();
                expandAndReveal(node);
              }}
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--twin-mute)]",
                hasChildren && "hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
              )}
            >
              {hasChildren ? (
                open ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )
              ) : (
                <span className="h-3.5 w-3.5" />
              )}
            </span>
            {node.icon ? (
              <span className="shrink-0 text-[13px] leading-none">{node.icon}</span>
            ) : hasChildren ? (
              open ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              )
            ) : (
              <File className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]" />
            )}
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
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[12px]",
                isSelected ? "font-medium text-[var(--twin-link-deep)]" : "text-[var(--twin-body)]"
              )}
              title={node.name}
            >
              {node.name}
            </span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              title="更多操作"
              aria-label="更多操作"
              className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--twin-mute)] opacity-0 transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)] focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[9rem]">
              <DropdownMenuItem
                onSelect={() => {
                  setCreating({ parentId: node.id, name: "" });
                  if (!open) onToggle(node.id);
                }}
              >
                <FolderPlus className="mr-2 h-3.5 w-3.5" />
                新建子地点
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void doRename(node)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                改名
              </DropdownMenuItem>
              {onSetIcon && (
                <DropdownMenuItem onSelect={() => setIconTarget(node)}>
                  <Smile className="mr-2 h-3.5 w-3.5" />
                  设置图标
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => {
                  setMoveTarget(node);
                  setMoveParentId("");
                }}
              >
                <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
                移动地点
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void doDelete(node)} className="text-red-600 focus:text-red-700">
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                删除地点
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {isCreatingHere && renderCreateInput(depth + 1)}
        {open && hasChildren && <div className="space-y-0.5">{children.map((c) => renderNode(c, depth + 1))}</div>}
      </div>
    );
  };

  return (
    <div ref={rootRef} className="space-y-0.5">
      <button
        type="button"
        onClick={() => setCreating({ parentId: null, name: "" })}
        className="flex w-full items-center gap-1.5 rounded-twin-sm px-2 py-1.5 text-left text-[12px] text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
      >
        <Plus className="h-3.5 w-3.5" /> 新建地点
      </button>
      {creating?.parentId === null && renderCreateInput(0)}
      {visible.map((n) => renderNode(n, 0))}
      {visible.length === 0 && !creating && (
        <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">
          {searching ? "没有匹配的地点" : "暂无地点"}
        </div>
      )}

      {moveTarget && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setMoveTarget(null)}>
            <div
              className="w-full max-w-md rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-[var(--twin-ink)]">移动地点</h3>
              <p className="mt-2 text-sm text-[var(--twin-body)]">将「{moveTarget.name}」移动到：</p>
              <select
                value={moveParentId}
                onChange={(e) => setMoveParentId(e.target.value)}
                className="mt-3 w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
              >
                <option value="">请选择新父地点</option>
                {moveCandidates.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]"
                  onClick={() => setMoveTarget(null)}
                >
                  取消
                </button>
                <button
                  className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)] disabled:opacity-50"
                  disabled={!moveParentId}
                  onClick={submitMove}
                >
                  确认移动
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {iconTarget && onSetIcon && (
        <EmojiPicker
          value={iconTarget.icon ?? ""}
          onChange={(emoji) => {
            onSetIcon(iconTarget.id, emoji);
            setIconTarget(null);
          }}
          onClose={() => setIconTarget(null)}
        />
      )}
    </div>
  );
}

export default LocationTree;
