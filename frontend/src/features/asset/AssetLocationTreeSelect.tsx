import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AssetLocationNode } from "@/api/domains/assetLocation.api";
import { useAssetLocationTree } from "@/api/hooks/useAssetLocation";
import { Portal } from "@/components/Portal";
import { useMultiSelectPopover } from "@/features/admin/violations/shared/useMultiSelectPopover";
import { cn } from "@/lib/utils";

/**
 * 搜索过滤：命中的节点保留**整棵子树**（可继续往下展开挑选），
 * 只有子孙命中的节点保留「命中链」。
 */
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

type AssetLocationTreeSelectProps = {
  /** 已选节点 id；null 表示未选 */
  value: number | null;
  onChange: (nodeId: number, path: string) => void;
  placeholder?: string;
  className?: string;
};

/**
 * 地点树选择器：按树状分级展开选择，**默认全部收起**（地点几百个时不会一屏铺满）。
 * 浮层经 Portal 以 fixed 定位挂到 body，弹窗/表格内不被裁切（复用 useMultiSelectPopover）。
 */
export function AssetLocationTreeSelect({
  value,
  onChange,
  placeholder = "选择地点",
  className,
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

  /** 已选节点的全路径（触发器上显示） */
  const selectedPath = useMemo(() => {
    if (value == null) return "";
    const walk = (nodes: AssetLocationNode[], prefix: string): string => {
      for (const n of nodes) {
        const label = prefix ? `${prefix} / ${n.name}` : n.name;
        if (n.id === value) return label;
        const hit = walk(n.children ?? [], label);
        if (hit) return hit;
      }
      return "";
    };
    return walk(tree, "");
  }, [tree, value]);

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderNode = (node: AssetLocationNode, depth: number, prefix: string) => {
    const children = node.children ?? [];
    const hasChildren = children.length > 0;
    const label = prefix ? `${prefix} / ${node.name}` : node.name;
    // 搜索态：祖先自动展开以露出命中项；命中项自身保持收起，用户可继续往下展开挑选
    const isMatch = searching && node.name.toLowerCase().includes(keyword.trim().toLowerCase());
    const isOpen = searching ? (!isMatch || expanded.has(node.id)) : expanded.has(node.id);
    const isSelected = node.id === value;
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
              onChange(node.id, label);
              close();
            }}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left text-[12px]",
              isSelected ? "font-medium text-[var(--twin-link-deep)]" : "text-[var(--app-color-text-primary)]"
            )}
          >
            {node.icon && <span className="shrink-0 text-[13px] leading-none">{node.icon}</span>}
            <span className="min-w-0 flex-1 truncate" title={node.name}>{node.name}</span>
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
        role="combobox"
        aria-expanded={open}
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cn(
          "flex h-7 w-full cursor-pointer items-center justify-between gap-1 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 text-[11px]",
          className
        )}
      >
        <span className={cn("min-w-0 truncate", selectedPath ? "text-[var(--twin-ink)]" : "text-[var(--twin-mute)]")}>
          {selectedPath || placeholder}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-[var(--twin-mute)]" />
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
                className="h-7 w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 text-[11px] text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)]"
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
