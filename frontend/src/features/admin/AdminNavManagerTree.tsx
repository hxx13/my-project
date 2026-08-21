import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, GripVertical, Plus } from "lucide-react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { AdminNavConfigNode } from "@/api/domains/adminNavConfig.api";

interface Props {
  tree: AdminNavConfigNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddClick: (parentId: string | null, parentTitle?: string) => void;
}

export function AdminNavManagerTree({ tree, selectedId, onSelect, onAddClick }: Props) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-[var(--twin-hairline)]">
        <span className="font-semibold text-sm text-[var(--twin-ink)]">文件夹结构</span>
        <button
          onClick={() => onAddClick(null)}
          className="inline-flex items-center gap-1 rounded-md bg-[var(--twin-primary)] px-3 py-1 text-xs font-medium text-[var(--twin-on-primary)] hover:opacity-90 transition-opacity"
        >
          <Plus className="h-3 w-3" /> 新建
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain p-2">
        <SortableContext items={tree.map((n) => n.id)} strategy={verticalListSortingStrategy}>
          {tree.map((node) => (
            <SortableTreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddClick={onAddClick}
            />
          ))}
        </SortableContext>
        {tree.length === 0 && (
          <p className="text-center text-[var(--twin-mute)] text-sm py-8">暂无配置，请先创建文件夹</p>
        )}
      </div>
    </div>
  );
}

function SortableTreeNode({ node, depth, selectedId, onSelect, onAddClick }: {
  node: AdminNavConfigNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddClick: (parentId: string | null, parentTitle?: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const childCount = node.children?.length ?? 0;
  const prevChildCountRef = useRef(childCount);

  useEffect(() => {
    if (childCount > prevChildCountRef.current) setExpanded(true);
    prevChildCountRef.current = childCount;
  }, [childCount]);

  const isGroup = node.type === "GROUP";
  const isSubgroup = node.type === "SUBGROUP";
  const isItem = node.type === "ITEM";
  const isFolder = isGroup || isSubgroup;
  const hasChildren = childCount > 0;
  const isSelected = node.id === selectedId;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id, data: { type: node.type } });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : undefined }}
      className="relative"
    >
      <div
        onClick={() => {
          if (isFolder) setExpanded(!expanded);
          onSelect(node.id);
        }}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors group",
          isSelected
            ? "bg-[var(--twin-primary)]/15 text-[var(--twin-ink)] border-l-[3px] border-[var(--twin-primary)]"
            : "hover:bg-[var(--twin-canvas-soft)] text-[var(--twin-body)] border-l-[3px] border-transparent",
          depth > 0 && "ml-3"
        )}
      >
        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab active:cursor-grabbing text-[var(--twin-mute)] hover:text-[var(--twin-body)] touch-none"
          aria-label="拖拽排序"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {/* Expand/collapse chevron for folders */}
        {isFolder ? (
          expanded ? <ChevronDown className="h-3.5 w-3.5 text-[var(--twin-mute)] shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-[var(--twin-mute)] shrink-0" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        {/* Icon: GROUP = indigo folder, SUBGROUP = teal folder, ITEM = document */}
        <span className="shrink-0">
          {isGroup && (
            expanded
              ? <FolderOpen className="h-4 w-4 text-indigo-400" />
              : <Folder className="h-4 w-4 text-indigo-400" />
          )}
          {isSubgroup && (
            expanded
              ? <FolderOpen className="h-4 w-4 text-teal-400" />
              : <Folder className="h-4 w-4 text-teal-400" />
          )}
          {isItem && <span className="text-xs">📄</span>}
        </span>

        {/* Title + type badge */}
        <span className="flex-1 truncate">{node.title}</span>

        {isGroup && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium shrink-0">
            分组
          </span>
        )}
        {isSubgroup && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-medium shrink-0">
            子分组
          </span>
        )}
        {isItem && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-[var(--twin-mute)] font-medium shrink-0">
            入口
          </span>
        )}

        {isFolder && (
          <span className="text-xs text-[var(--twin-mute)]">{childCount}项</span>
        )}

        {isFolder && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddClick(node.id, node.title); }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--twin-canvas-soft-2)] transition-all"
            title="添加子项"
          >
            <Plus className="h-3 w-3 text-[var(--twin-body)]" />
          </button>
        )}
      </div>

      {isFolder && expanded && hasChildren && (
        <SortableContext items={node.children!.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {node.children!.map((child) => (
            <SortableTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddClick={onAddClick}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
}
