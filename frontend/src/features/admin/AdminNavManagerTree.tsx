import { useState } from "react";
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
  const hasChildren = node.children && node.children.length > 0;
  const isGroup = node.type === "GROUP" || node.type === "SUBGROUP";
  const isSelected = node.id === selectedId;

  return (
    <div>
      <div
        onClick={() => {
          if (isGroup) setExpanded(!expanded);
          onSelect(node.id);
        }}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors group",
          isSelected
            ? "bg-blue-100 text-blue-800 border-l-[3px] border-blue-600"
            : "hover:bg-gray-100 text-gray-700 border-l-[3px] border-transparent",
          depth > 0 && "ml-3"
        )}
      >
        {isGroup && (
          expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        )}
        {!isGroup && <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />}
        <span className="flex-1 truncate">
          {isGroup
            ? (expanded ? <FolderOpen className="h-3.5 w-3.5 inline mr-1.5 text-amber-500" /> : <Folder className="h-3.5 w-3.5 inline mr-1.5 text-amber-500" />)
            : <span className="inline-block w-5 text-center mr-1.5">📄</span>
          }
          {node.title}
        </span>
        {isGroup && (
          <span className="text-xs text-gray-400">{node.children?.length ?? 0}项</span>
        )}
        {isGroup && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddClick(node.id, node.title); }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 transition-all"
            title="添加子项"
          >
            <Plus className="h-3 w-3 text-gray-500" />
          </button>
        )}
      </div>
      {isGroup && expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
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
