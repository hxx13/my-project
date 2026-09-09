import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import type { AssetLocationNode } from "@/api/domains/assetLocation.api";
import { useAssetLocationTree } from "@/api/hooks/useAssetLocation";
import { Portal } from "@/components/Portal";
import { useMultiSelectPopover } from "@/features/admin/violations/shared/useMultiSelectPopover";
import { cn } from "@/lib/utils";

/**
 * 通用「地点选择器」——资产转移 / 存放地点字段的统一入口。
 *
 * 交互：树状分级，**默认全部收起**（地点几百个时不会一屏铺满）；带搜索，命中项保留整棵子树可继续下钻。
 * 取值：`value` 是地点**全路径文本**（与 EAV「存放地点」列、转移地点文本同一口径）；
 *       `onChange` 同时回传节点 id，转移类调用方直接拿 id 调 `/assets/{id}/location` 或 `/assets/batch-location`。
 *
 * 浮层经 Portal 以 fixed 定位挂到 body（复用 useMultiSelectPopover），弹窗/表格/滚动容器内都不会被裁切。
 */

/** 搜索过滤：命中的节点保留整棵子树，只有子孙命中的节点保留「命中链」 */
function filterKeepSubtrees(nodes: AssetLocationNode[], keyword: string): AssetLocationNode[] {
  const k = keyword.trim().toLowerCase();
  if (!k) return nodes;
  const out: AssetLocationNode[] = [];
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

export type AssetLocationTreeSelectProps = {
  /** 地点全路径文本；空串表示未选 */
  value: string;
  /** 选中回调：同时给出全路径文本与节点 id */
  onChange: (path: string, nodeId: number) => void;
  /** 允许清空（用于存放地点这类可空字段） */
  clearable?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
};

export function AssetLocationTreeSelect({
  value,
  onChange,
  clearable = false,
  placeholder = "选择地点",
  className,
  disabled = false,
  id,
}: AssetLocationTreeSelectProps) {
  const { data: tree = [] } = useAssetLocationTree();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [keyword, setKeyword] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { panelStyle } = useMultiSelectPopover({ triggerRef, panelRef, open, onClose: close });

  const searching = keyword.trim().length > 0;
  const visible = useMemo(() => filterKeepSubtrees(tree, keyword), [tree, keyword]);

  const toggleExpand = (nodeId: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });

  const renderNode = (node: AssetLocationNode, depth: number, prefix: string) => {
    const children = node.children ?? [];
    const hasChildren = children.length > 0;
    const label = prefix ? `${prefix} / ${node.name}` : node.name;
    // 搜索态：祖先自动展开露出命中项；命中项自身保持收起，可继续下钻
    const isMatch = searching && node.name.toLowerCase().includes(keyword.trim().toLowerCase());
    const isOpen = searching ? !isMatch || expanded.has(node.id) : expanded.has(node.id);
    const isSelected = label === value;
    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center rounded-md",
            isSelected ? "bg-[var(--twin-link-deep)]/10" : "hover:bg-[var(--app-color-surface-hover)]"
          )}
          style={{ paddingLeft: depth * 12 }}
        >
          <button
            type="button"
            aria-label={isOpen ? "收起" : "展开"}
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleExpand(node.id);
            }}
            className={cn(
              "flex h-6 w-5 shrink-0 items-center justify-center text-[var(--app-color-text-tertiary)]",
              hasChildren ? "hover:text-[var(--app-color-text-primary)]" : "opacity-0"
            )}
          >
            {hasChildren ? (
              isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(label, node.id);
              close();
            }}
            title={label}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left text-[12px]",
              isSelected ? "font-medium text-[var(--twin-link-deep)]" : "text-[var(--app-color-text-primary)]"
            )}
          >
            {node.icon && <span className="shrink-0 text-[13px] leading-none">{node.icon}</span>}
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
          </button>
        </div>
        {isOpen && hasChildren && <div>{children.map((c) => renderNode(c, depth + 1, label))}</div>}
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
          "flex h-9 w-full items-center justify-between gap-1 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 text-sm",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          className
        )}
      >
        <span className={cn("min-w-0 truncate", value ? "text-[var(--twin-ink)]" : "text-[var(--twin-mute)]")}>
          {value || placeholder}
        </span>
        {clearable && value ? (
          <button
            type="button"
            aria-label="清空"
            onClick={(e) => {
              e.stopPropagation();
              onChange("", 0);
              setOpen(false);
            }}
            className="shrink-0 text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]" />
        )}
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
                placeholder="搜索地点…"
                className="h-8 w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 text-[12px] text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)]"
              />
            </div>
            {visible.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-[var(--app-color-text-tertiary)]">没有匹配的地点</div>
            ) : (
              visible.map((n) => renderNode(n, 0, ""))
            )}
          </div>
        </Portal>
      )}
    </div>
  );
}

export default AssetLocationTreeSelect;
