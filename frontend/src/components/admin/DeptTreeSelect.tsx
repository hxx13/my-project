import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Portal } from "@/components/Portal";
import { useMultiSelectPopover } from "@/features/admin/violations/shared/useMultiSelectPopover";
import { cn } from "@/lib/utils";

export interface DeptTreeNode {
  id: number;
  parentId?: number | null;
  name: string;
  sort?: number;
}

interface Props {
  /** 当前部门 id（字符串）；空串表示未选 */
  value: string;
  onChange: (id: string) => void;
  nodes: DeptTreeNode[];
  placeholder?: string;
  className?: string;
  id?: string;
}

interface BuiltNode extends DeptTreeNode {
  path: string;
  children: BuiltNode[];
}

function buildTree(nodes: DeptTreeNode[]): BuiltNode[] {
  const byId = new Map<number, BuiltNode>();
  nodes.forEach((n) => byId.set(n.id, { ...n, path: n.name, children: [] }));
  const roots: BuiltNode[] = [];
  nodes.forEach((n) => {
    const node = byId.get(n.id)!;
    const parent = n.parentId != null ? byId.get(Number(n.parentId)) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  const sortRec = (list: BuiltNode[], prefix: string) => {
    list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id);
    list.forEach((n) => {
      n.path = prefix ? `${prefix} / ${n.name}` : n.name;
      sortRec(n.children, n.path);
    });
  };
  sortRec(roots, "");
  return roots;
}

function filterTree(list: BuiltNode[], keyword: string): BuiltNode[] {
  const k = keyword.trim().toLowerCase();
  if (!k) return list;
  const out: BuiltNode[] = [];
  for (const n of list) {
    if (n.name.toLowerCase().includes(k) || n.path.toLowerCase().includes(k)) {
      out.push(n);
      continue;
    }
    const kids = filterTree(n.children, keyword);
    if (kids.length) out.push({ ...n, children: kids });
  }
  return out;
}

/**
 * 部门树选择器：树状分级、默认收起、带搜索，选中值回传部门 id。
 * 浮层走 Portal + fixed 定位，弹窗内不会被裁切。
 */
export function DeptTreeSelect({
  value,
  onChange,
  nodes,
  placeholder = "选择部门",
  className,
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [keyword, setKeyword] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { panelStyle } = useMultiSelectPopover({ triggerRef, panelRef, open, onClose: close });

  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const visible = useMemo(() => filterTree(tree, keyword), [tree, keyword]);
  const searching = keyword.trim().length > 0;

  const selectedPath = useMemo(() => {
    const find = (list: BuiltNode[]): string => {
      for (const n of list) {
        if (String(n.id) === value) return n.path;
        const inner = find(n.children);
        if (inner) return inner;
      }
      return "";
    };
    return find(tree);
  }, [tree, value]);

  const toggleExpand = (deptId: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });

  const renderNode = (node: BuiltNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isOpen = searching ? true : expanded.has(node.id);
    const isSelected = String(node.id) === value;
    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center rounded-md",
            isSelected
              ? "bg-[color-mix(in_srgb,var(--twin-link-deep)_10%,transparent)]"
              : "hover:bg-[var(--app-color-surface-hover)]"
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
              "flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--app-color-text-tertiary)]",
              hasChildren ? "hover:bg-[var(--app-color-surface-hover)]" : "opacity-0"
            )}
          >
            {hasChildren ? (
              isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
            ) : null}
          </button>
          <button
            type="button"
            title={node.path}
            onClick={() => {
              onChange(String(node.id));
              close();
            }}
            className={cn(
              "min-w-0 flex-1 truncate py-1 pr-2 text-left text-[12px]",
              isSelected ? "font-medium text-[var(--twin-link-deep)]" : "text-[var(--app-color-text-primary)]"
            )}
          >
            {node.name}
          </button>
        </div>
        {isOpen && hasChildren && <div>{node.children.map((c) => renderNode(c, depth + 1))}</div>}
      </div>
    );
  };

  return (
    <div className={cn("relative", className)}>
      <div
        ref={triggerRef}
        id={id}
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
        className="flex h-9 w-full cursor-pointer items-center justify-between gap-1 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 text-sm"
      >
        <span className={cn("min-w-0 flex-1 truncate", selectedPath ? "text-[var(--twin-ink)]" : "text-[var(--twin-mute)]")}>
          {selectedPath || placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]" />
      </div>

      {open && (
        <Portal>
          <div
            ref={panelRef}
            style={panelStyle}
            className="w-64 rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1.5 shadow-lg"
          >
            <input
              className="mb-1 h-8 w-full rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 text-xs"
              placeholder="搜索部门"
              value={keyword}
              autoFocus
              onChange={(e) => setKeyword(e.target.value)}
            />
            <div className="max-h-60 overflow-auto">
              {visible.length === 0 ? (
                <div className="px-2 py-3 text-center text-[11px] text-[var(--twin-mute)]">没有匹配的部门</div>
              ) : (
                visible.map((n) => renderNode(n, 0))
              )}
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
