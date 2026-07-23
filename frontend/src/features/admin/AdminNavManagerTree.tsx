import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, GripVertical, Plus } from "lucide-react";
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <span className="font-semibold text-sm text-gray-700">文件夹结构</span>
        <button
          onClick={() => onAddClick(null)}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-3 w-3" /> 新建
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {tree.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
            onAddClick={onAddClick}
          />
        ))}
        {tree.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">暂无配置，请先创建文件夹</p>
        )}
      </div>
    </div>
  );
}

function TreeNode({ node, depth, selectedId, onSelect, onAddClick }: {
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
    if (childCount > prevChildCountRef.current) {
      setExpanded(true);
    }
    prevChildCountRef.current = childCount;
  }, [childCount]);

  const hasChildren = childCount > 0;
  const nodeType = node.type;
  const isGroup = nodeType === "GROUP";
  const isSubgroup = nodeType === "SUBGROUP";
  const isItem = nodeType === "ITEM";
  const isFolder = isGroup || isSubgroup;
  const isSelected = node.id === selectedId;

  return (
    <div>
      <div
        onClick={() => {
          if (isFolder) setExpanded(!expanded);
          onSelect(node.id);
        }}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors group",
          isSelected
            ? "bg-blue-100 text-blue-800 border-l-[3px] border-blue-600"
            : "hover:bg-gray-100 text-gray-700 border-l-[3px] border-transparent",
          depth > 0 && (isSubgroup ? "ml-4" : "ml-5")
        )}
      >
        {/* Expand/collapse chevron for folders */}
        {isFolder && (
          expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        )}
        {/* Drag handle for items */}
        {isItem && <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />}

        {/* Icon: GROUP = indigo folder, SUBGROUP = teal folder, ITEM = document */}
        <span className="shrink-0">
          {isGroup && (
            expanded
              ? <FolderOpen className="h-4 w-4 text-indigo-500" />
              : <Folder className="h-4 w-4 text-indigo-500" />
          )}
          {isSubgroup && (
            expanded
              ? <FolderOpen className="h-4 w-4 text-teal-500" />
              : <Folder className="h-4 w-4 text-teal-500" />
          )}
          {isItem && <span className="text-xs">📄</span>}
        </span>

        {/* Title + type badge */}
        <span className="flex-1 truncate">{node.title}</span>

        {/* Type badge */}
        {isGroup && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 font-medium shrink-0">
            分组
          </span>
        )}
        {isSubgroup && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-600 font-medium shrink-0">
            子分组
          </span>
        )}
        {isItem && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium shrink-0">
            入口
          </span>
        )}

        {/* Child count for folders */}
        {isFolder && (
          <span className="text-xs text-gray-400">{node.children?.length ?? 0}项</span>
        )}

        {/* Add button for folders */}
        {isFolder && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddClick(node.id, node.title); }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 transition-all"
            title="添加子项"
          >
            <Plus className="h-3 w-3 text-gray-500" />
          </button>
        )}
      </div>

      {/* Children */}
      {isFolder && expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddClick={onAddClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
