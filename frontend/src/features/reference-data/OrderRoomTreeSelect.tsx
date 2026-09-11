import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { fetchOrderRoomTree, type OrderRoomNode } from "@/api/domains/cageShelf.api";
import { cn } from "@/lib/utils";

/**
 * 「领用方式/房间」选择器：房间树（校区 → 区域/楼 → 楼层 → 房间）。
 *
 * 与资产「地点选择器」同一套交互口径：树状分级、**默认全部收起**、带搜索（命中项的祖先自动展开）。
 * 差异：**只有房间（ROOM）可选中**——校区/区域/楼层点一下只做展开收起，避免选到中间层。
 * 取值 `value` 是房间全路径文本，`onChange` 一并回传房间节点 id。
 */

function filterKeepSubtrees(nodes: OrderRoomNode[], keyword: string): OrderRoomNode[] {
  const k = keyword.trim().toLowerCase();
  if (!k) return nodes;
  const out: OrderRoomNode[] = [];
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

export function OrderRoomTreeSelect({
  value,
  onChange,
  placeholder = "选择领用房间",
  className,
  disabled = false,
  invalid = false,
}: {
  /** 房间全路径文本；空串表示未选 */
  value: string;
  onChange: (path: string, roomId: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** 必选未填时高亮 */
  invalid?: boolean;
}) {
  const { data: tree = [] } = useQuery({
    queryKey: ["order-room-tree"],
    queryFn: fetchOrderRoomTree,
    staleTime: 5 * 60_000,
  });
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState("");

  const searching = keyword.trim().length > 0;
  const visible = useMemo(() => filterKeepSubtrees(tree, keyword), [tree, keyword]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderNode = (node: OrderRoomNode, depth: number, prefix: string) => {
    const children = node.children ?? [];
    const hasChildren = children.length > 0;
    const isRoom = node.level === "ROOM";
    const label = prefix ? `${prefix} / ${node.name}` : node.name;
    const isMatch = searching && node.name.toLowerCase().includes(keyword.trim().toLowerCase());
    const isOpen = searching ? !isMatch || expanded.has(node.id) : expanded.has(node.id);
    const isSelected = isRoom && label === value;
    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center rounded-md",
            isSelected ? "bg-[color-mix(in_srgb,var(--twin-link-deep)_10%,transparent)]" : "hover:bg-[var(--app-color-surface-hover)]",
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
              hasChildren ? "hover:text-[var(--app-color-text-primary)]" : "opacity-0",
            )}
          >
            {hasChildren ? (isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : null}
          </button>
          <button
            type="button"
            onClick={() => {
              if (isRoom) {
                onChange(label, node.id);
                setOpen(false);
              } else if (hasChildren) {
                toggleExpand(node.id);
              }
            }}
            title={label}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left text-[12px]",
              isSelected ? "font-medium text-[var(--twin-link-deep)]" : "text-[var(--app-color-text-primary)]",
              !isRoom && "font-medium text-[var(--app-color-text-secondary)]",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
          </button>
        </div>
        {isOpen && hasChildren && <div>{children.map((c) => renderNode(c, depth + 1, label))}</div>}
      </div>
    );
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-1 rounded-twin-sm border bg-[var(--twin-canvas)] px-3 text-sm",
          invalid ? "border-[var(--app-color-feedback-danger)]" : "border-[var(--twin-hairline)]",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        )}
      >
        <span className={cn("min-w-0 truncate text-left", value ? "text-[var(--twin-ink)]" : "text-[var(--twin-mute)]")}>
          {value || placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full min-w-[240px] overflow-hidden rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-1 shadow-lg">
          <div className="sticky top-0 z-[1] mb-1 bg-[var(--app-color-surface-elevated)] px-1 pb-1">
            <input
              autoFocus
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索房间…"
              className="h-8 w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 text-[12px] text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)]"
            />
          </div>
          <div className="max-h-64 overflow-auto">
            {visible.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-[var(--app-color-text-tertiary)]">没有匹配的房间</div>
            ) : (
              visible.map((n) => renderNode(n, 0, ""))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default OrderRoomTreeSelect;
