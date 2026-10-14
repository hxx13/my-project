/**
 * VideoCategoryTreeSelect — 监控分类树的文件夹选择器。
 *
 * 与 `features/file-templates/FileFolderTreeSelect`、`components/admin/AssetLocationTreeSelect`
 * 同一套交互（树状分级、默认全收起、带搜索、命中链自动展开、浮层走 Portal），
 * 但**不绑数据源**：节点由调用方传进来，所以不用再为第三种数据源抄一份 hook。
 *
 * 用途：把一路通道「移动到」某个分类文件夹时选目标。
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Portal } from "@/components/Portal";
import { useMultiSelectPopover } from "@/features/admin/violations/shared/useMultiSelectPopover";
import { cn } from "@/lib/utils";

export type VideoTreeOption = {
  id: number;
  name: string;
  children?: VideoTreeOption[];
  /** 名字后面跟的补充说明（如「(12/12)」在线数） */
  suffix?: string;
};

/** 搜索过滤：命中节点保留整棵子树，只有子孙命中的节点保留「命中链」 */
function filterKeepSubtrees(nodes: VideoTreeOption[], keyword: string): VideoTreeOption[] {
  const k = keyword.trim().toLowerCase();
  if (!k) return nodes;
  const out: VideoTreeOption[] = [];
  for (const n of nodes) {
    if (n.name.toLowerCase().includes(k)) {
      out.push(n);
      continue;
    }
    const kids = filterKeepSubtrees(n.children ?? [], keyword);
    if (kids.length) out.push({ ...n, children: kids });
  }
  return out;
}

export type VideoCategoryTreeSelectProps = {
  nodes: VideoTreeOption[];
  value?: number | null;
  /** 选中某个文件夹；选「未分类」时回传 null */
  onSelect: (id: number | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
};

export function VideoCategoryTreeSelect({
  nodes,
  value,
  onSelect,
  placeholder = "选择文件夹",
  className,
  disabled = false,
  id,
}: VideoCategoryTreeSelectProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [keyword, setKeyword] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { panelStyle } = useMultiSelectPopover({ triggerRef, panelRef, open, onClose: close });

  const searching = keyword.trim().length > 0;
  const visible = useMemo(() => filterKeepSubtrees(nodes, keyword), [nodes, keyword]);

  /** 当前选中节点的全路径，用作触发器的显示文本 */
  const selectedLabel = useMemo(() => {
    if (value == null) return "";
    const walk = (list: VideoTreeOption[], prefix: string): string => {
      for (const n of list) {
        const label = prefix ? `${prefix} / ${n.name}` : n.name;
        if (n.id === value) return label;
        const hit = walk(n.children ?? [], label);
        if (hit) return hit;
      }
      return "";
    };
    return walk(nodes, "");
  }, [nodes, value]);

  const toggleExpand = (nodeId: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });

  const renderNode = (node: VideoTreeOption, depth: number) => {
    const children = node.children ?? [];
    const hasChildren = children.length > 0;
    const isMatch = searching && node.name.toLowerCase().includes(keyword.trim().toLowerCase());
    const isOpen = searching ? !isMatch || expanded.has(node.id) : expanded.has(node.id);
    const isSelected = node.id === value;
    return (
      <div key={node.id}>
        <div
          data-node-id={node.id}
          className={cn(
            "flex items-center rounded-md",
            isSelected ? "bg-[var(--app-color-surface-hover)]" : "hover:bg-[var(--app-color-surface-hover)]"
          )}
          style={{ paddingLeft: depth * 14 }}
        >
          <button
            type="button"
            aria-label={isOpen ? "收起" : "展开"}
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleExpand(node.id);
            }}
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--app-color-text-tertiary)]",
              hasChildren ? "hover:text-[var(--app-color-text-primary)]" : "opacity-0"
            )}
          >
            {hasChildren ? (
              isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => {
              onSelect(node.id);
              close();
            }}
            title={node.name}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 py-1 pr-2 text-left text-[12px]",
              isSelected
                ? "font-medium text-[var(--app-color-accent)]"
                : "text-[var(--app-color-text-primary)]"
            )}
          >
            <span className="min-w-0 flex-1 truncate">
              {node.name}
              {node.suffix ? (
                <span className="ml-1 text-[10px] text-[var(--app-color-text-tertiary)]">{node.suffix}</span>
              ) : null}
            </span>
          </button>
        </div>
        {isOpen && hasChildren && <div>{children.map((c) => renderNode(c, depth + 1))}</div>}
      </div>
    );
  };

  return (
    <div className="relative">
      <div
        ref={triggerRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-1 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 text-sm",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          className
        )}
      >
        <span className={cn("min-w-0 truncate", selectedLabel ? "text-[var(--app-color-text-primary)]" : "text-[var(--app-color-text-tertiary)]")}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--app-color-text-tertiary)]" />
      </div>

      {open && (
        <Portal>
          <div
            ref={panelRef}
            style={panelStyle}
            className="max-h-72 overflow-auto rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-1 shadow-lg"
          >
            <div className="sticky top-0 z-[1] mb-1 bg-[var(--app-color-surface-elevated)] px-1 pb-1">
              <input
                autoFocus
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索文件夹…"
                className="h-8 w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 text-[12px] text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)]"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                close();
              }}
              className="mb-1 flex w-full items-center rounded-md px-2 py-1 text-left text-[12px] text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"
            >
              未分类（移出所有文件夹）
            </button>
            {visible.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-[var(--app-color-text-tertiary)]">没有匹配的文件夹</div>
            ) : (
              visible.map((n) => renderNode(n, 0))
            )}
          </div>
        </Portal>
      )}
    </div>
  );
}

export default VideoCategoryTreeSelect;
