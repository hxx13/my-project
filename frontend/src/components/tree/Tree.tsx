/**
 * Tree — 通用「文件管理器式」递归树（资产地点树 / 物品台账空间树共用）
 *
 * 只负责树本身的结构与交互：缩进、展开热区、计数徽标、行内「⋯」菜单、
 * 内联新建输入框、搜索裁枝、拖放落点高亮、移动弹窗外壳。
 *
 * 节点形状、图标、菜单项、拖拽载荷语义、落库方式全部由调用方用访问器与插槽提供 ——
 * 两棵树此前各抄一份、改一处漏一处，正是这些 chrome 的重复。
 */

import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Plus,
  X,
} from "lucide-react";
import { Portal } from "@/components/Portal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { filterTree, type TreeLike } from "./filterTree";

/** 行内「⋯」菜单给调用方的把手：菜单项自己写在 renderMenu 里，这些是它需要的动作 */
export type TreeMenuHelpers = {
  /** 展开并在本节点下开内联新建输入框 */
  startCreateChild: () => void;
  /** 打开「移动」弹窗（本组件持有弹窗状态） */
  startMove: () => void;
  isOpen: boolean;
};

export type TreeMoveConfig<T> = {
  title: string;
  /** 选择器的 placeholder，如「选择新父空间」 */
  selectPlaceholder: string;
  /** 候选排除项：自己 + 自己整棵子树 */
  excludeIds: (node: T) => Set<number>;
  /** 选择器由调用方给（资产树 / 空间树各一个），本组件只管弹窗外壳与状态 */
  renderSelect: (props: {
    /** 已选路径；根节点时为 ""（「移到根」由下面的按钮表达，选择器表达不了这个值） */
    value: string;
    onChange: (path: string, nodeId: number | null) => void;
    excludeIds: Set<number>;
    placeholder: string;
  }) => ReactNode;
  /** parentId = null 表示移到顶层 */
  onConfirm: (node: T, parentId: number | null) => void;
  /** 是否需要「移到根（顶层）」按钮 */
  allowMoveToRoot?: boolean;
};

export type TreeProps<T extends TreeLike<T>> = {
  nodes: T[];
  getId: (node: T) => number;
  getName: (node: T) => string;
  getChildren: (node: T) => T[] | null | undefined;
  /** 计数徽标数字；null/0 显示空槽（槽位始终占位，不推挤图标与名称） */
  getCount?: (node: T) => number | null;
  /** 自定义图标（如 emoji）；返回 null/undefined 时按 hasChildren/open 出 Folder/File */
  getIcon?: (node: T) => ReactNode;
  /** 是否算「可展开」；默认 = 有子节点。空间树还要看这个空间有没有挂物品 */
  expandable?: (node: T) => boolean;

  selectedId: number | null;
  expanded: Set<number>;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  /** 搜索关键字；非空时裁掉未命中分支并强制展开命中链 */
  keyword?: string;

  /** 行内「⋯」菜单项；DropdownMenuContent 已由本组件套好 */
  renderMenu?: (node: T, helpers: TreeMenuHelpers) => ReactNode;
  /** 行下方、子节点上方的内容（空间树用来列该空间直接挂的物品） */
  renderExtras?: (node: T, depth: number) => ReactNode;

  /** 行被拖走时写入的载荷类型；不传则行不可拖 */
  dragPayloadType?: string;
  /** 有东西落到某行；dataTransfer 原样交给调用方解析 */
  onDropRow?: (nodeId: number, dataTransfer: DataTransfer) => void;

  /** 内联新建输入框的 placeholder，如「空间名称」 */
  createPlaceholder?: string;
  /** 顶部「新建 X」按钮文案；不传则不显示顶部按钮 */
  createRootLabel?: string;
  onCreate?: (parentId: number | null, name: string) => void;

  emptyText?: string;
  noMatchText?: string;

  /** 移动弹窗；不传则该树没有「移动」入口 */
  move?: TreeMoveConfig<T>;
};

export function Tree<T extends TreeLike<T>>(props: TreeProps<T>) {
  const {
    nodes,
    getId,
    getName,
    getChildren,
    getCount,
    getIcon,
    expandable,
    selectedId,
    expanded,
    onSelect,
    onToggle,
    keyword = "",
    renderMenu,
    renderExtras,
    dragPayloadType,
    onDropRow,
    createPlaceholder = "名称",
    createRootLabel,
    onCreate,
    emptyText = "暂无数据",
    noMatchText = "没有匹配项",
    move,
  } = props;

  const [creating, setCreating] = useState<{ parentId: number | null; name: string } | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [moveTarget, setMoveTarget] = useState<T | null>(null);
  const [moveParentId, setMoveParentId] = useState<number | null>(null);
  const [moveParentPath, setMoveParentPath] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const searching = keyword.trim().length > 0;
  const childrenOf = (n: T) => getChildren(n) ?? [];
  const canExpand = (n: T) => (expandable ? expandable(n) : childrenOf(n).length > 0);

  /** 搜索裁枝：命中节点保留祖先链。空 keyword 时 filterTree 原样返回 nodes，不复制 */
  const shownNodes = useMemo(() => filterTree(nodes, keyword), [nodes, keyword]);

  /** 展开后把新露出的内容滚进视野：内容落在可视区外时看着像没展开 */
  const expandAndReveal = (n: T) => {
    const id = getId(n);
    const willOpen = !(searching || expanded.has(id));
    onToggle(id);
    if (!willOpen) return;
    requestAnimationFrame(() => {
      rootRef.current?.querySelector(`[data-tree-children="${id}"]`)?.scrollIntoView({ block: "nearest" });
    });
  };

  const startCreate = (parentId: number | null) => {
    setCreating({ parentId, name: "" });
    if (parentId != null && !expanded.has(parentId)) onToggle(parentId);
  };

  const submitCreate = () => {
    const current = creating;
    if (!current) return;
    const name = current.name.trim();
    setCreating(null);
    if (!name) return;
    onCreate?.(current.parentId, name);
  };

  const openMove = (n: T) => {
    setMoveTarget(n);
    setMoveParentId(null);
    setMoveParentPath("");
  };

  const closeMove = () => {
    setMoveTarget(null);
    setMoveParentId(null);
    setMoveParentPath("");
  };

  const confirmMove = () => {
    if (!moveTarget || !move) return;
    move.onConfirm(moveTarget, moveParentId);
    closeMove();
  };

  const moveExcludeIds = useMemo(
    () => (move && moveTarget ? move.excludeIds(moveTarget) : new Set<number>()),
    [move, moveTarget]
  );

  const renderCreateInput = (depth: number): ReactNode => (
    <div className="flex items-center gap-1" style={{ paddingLeft: depth * 8 + 16 }}>
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
        placeholder={createPlaceholder}
        className="h-7 min-w-0 flex-1 rounded-twin-sm border border-[var(--twin-link-deep)] bg-[var(--twin-canvas)] px-2 text-[12px] text-[var(--twin-ink)] outline-none placeholder:text-[var(--twin-mute)]"
      />
      {/* 两个按钮都要 onMouseDown preventDefault：否则按下即失焦、输入框（连同按钮）先被卸载，点击落不到 */}
      <button
        type="button"
        aria-label="确认"
        title="确认（回车）"
        onMouseDown={(e) => e.preventDefault()}
        onClick={submitCreate}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-twin-sm border border-[var(--twin-link-deep)] text-[var(--twin-link-deep)] transition hover:bg-[color-mix(in_srgb,var(--twin-link-deep)_10%,transparent)]"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="取消"
        title="取消（Esc）"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setCreating(null)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-twin-sm border border-[var(--twin-hairline)] text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const renderNode = (n: T, depth: number): ReactNode => {
    const id = getId(n);
    const children = childrenOf(n);
    const expandableNode = canExpand(n);
    const open = searching || expanded.has(id);
    const isSelected = selectedId === id;
    const isDragOver = dragOverId === id;
    const isCreatingHere = creating?.parentId === id;
    const count = getCount?.(n) ?? null;
    const hasCount = count != null && count > 0;
    const customIcon = getIcon?.(n);
    return (
      <div key={id}>
        <div
          draggable={!!dragPayloadType}
          onDragStart={
            dragPayloadType
              ? (e: DragEvent) => {
                  e.dataTransfer.setData(dragPayloadType, String(id));
                  e.dataTransfer.effectAllowed = "move";
                }
              : undefined
          }
          className={cn(
            "group flex items-center rounded-twin-sm",
            isDragOver && "bg-[color-mix(in_srgb,var(--twin-primary)_10%,transparent)] ring-2 ring-inset ring-[var(--twin-primary)]"
          )}
          style={{ paddingLeft: depth * 8 }}
          onDragOver={(e) => {
            if (!onDropRow) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (dragOverId !== id) setDragOverId(id);
          }}
          onDragLeave={() => setDragOverId((prev) => (prev === id ? null : prev))}
          onDrop={(e) => {
            if (!onDropRow) return;
            e.preventDefault();
            e.stopPropagation();
            setDragOverId(null);
            onDropRow(id, e.dataTransfer);
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (expandableNode && !open) expandAndReveal(n);
              onSelect(id);
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
                if (!expandableNode) return;
                e.stopPropagation();
                expandAndReveal(n);
              }}
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--twin-mute)]",
                expandableNode && "hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
              )}
            >
              {expandableNode ? (
                open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <span className="h-3.5 w-3.5" />
              )}
            </span>
            {/* 固定宽度的计数槽：始终占位且数字居中，位数变化（9 → 10）或有无计数都不会推动后面的图标与名称 */}
            <span
              className={cn(
                "w-6 shrink-0 truncate rounded-full text-center text-[9px] leading-[15px]",
                hasCount
                  ? (isSelected ? "bg-[var(--twin-link-deep)] text-white" : "bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)]")
                  : ""
              )}
            >
              {hasCount ? count : ""}
            </span>
            {customIcon ?? (children.length > 0 ? (
              open ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            ) : (
              <File className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]" />
            ))}
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[12px]",
                isSelected ? "font-medium text-[var(--twin-link-deep)]" : "text-[var(--twin-body)]"
              )}
              title={getName(n)}
            >
              {getName(n)}
            </span>
          </button>
          {renderMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger
                title="更多操作"
                aria-label="更多操作"
                className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--twin-mute)] opacity-0 transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)] focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[9rem]">
                {renderMenu(n, {
                  startCreateChild: () => startCreate(id),
                  startMove: () => openMove(n),
                  isOpen: open,
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {isCreatingHere && renderCreateInput(depth + 1)}

        {open && renderExtras?.(n, depth)}
        {open && expandableNode && (
          <div className="space-y-0.5" data-tree-children={id}>
            {children.map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const anyVisible = shownNodes.length > 0;

  return (
    <div ref={rootRef} className="space-y-0.5">
      {createRootLabel && (
        <button
          type="button"
          onClick={() => startCreate(null)}
          className="flex w-full items-center gap-1.5 rounded-twin-sm px-2 py-1.5 text-left text-[12px] text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
        >
          <Plus className="h-3.5 w-3.5" /> {createRootLabel}
        </button>
      )}
      {creating?.parentId === null && renderCreateInput(0)}
      {shownNodes.map((n) => renderNode(n, 0))}
      {!creating && !anyVisible && (
        <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">
          {searching ? noMatchText : emptyText}
        </div>
      )}

      {move && moveTarget && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeMove}>
            <div
              className="w-full max-w-md rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-[var(--twin-ink)]">{move.title}</h3>
              <p className="mt-2 text-sm text-[var(--twin-body)]">将「{getName(moveTarget)}」移动到：</p>
              <div className="mt-3">
                {move.renderSelect({
                  value: moveParentId != null ? moveParentPath : "",
                  onChange: (path, nodeId) => {
                    setMoveParentPath(path);
                    setMoveParentId(nodeId);
                  },
                  excludeIds: moveExcludeIds,
                  placeholder: move.selectPlaceholder,
                })}
              </div>
              {move.allowMoveToRoot && (
                <button
                  type="button"
                  onClick={() => {
                    setMoveParentPath("（根）");
                    setMoveParentId(null);
                  }}
                  className={cn(
                    "mt-2 rounded-twin-sm border px-2 py-1 text-xs transition",
                    moveParentPath === "（根）" && moveParentId == null
                      ? "border-[var(--twin-link-deep)] text-[var(--twin-link-deep)]"
                      : "border-[var(--twin-hairline)] text-[var(--twin-body)]"
                  )}
                >
                  移到根（顶层）
                </button>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]"
                  onClick={closeMove}
                >
                  取消
                </button>
                <button
                  className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)] disabled:opacity-50"
                  disabled={!moveParentPath}
                  onClick={confirmMove}
                >
                  确认移动
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}

export default Tree;
