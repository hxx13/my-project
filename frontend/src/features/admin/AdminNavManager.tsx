import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AdminNavManagerTree } from "./AdminNavManagerTree";
import { AdminNavManagerEditor } from "./AdminNavManagerEditor";
import { AdminNavManagerCreateDialog } from "./AdminNavManagerCreateDialog";
import {
  fetchAdminNavConfig,
  createNavGroup,
  type AdminNavConfigNode,
} from "@/api/domains/adminNavConfig.api";

export default function AdminNavManager() {
  const navigate = useNavigate();
  const [tree, setTree] = useState<AdminNavConfigNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [createParentTitle, setCreateParentTitle] = useState<string | undefined>();

  const loadTree = useCallback(async () => {
    const data = await fetchAdminNavConfig();
    setTree(data);
    setSelectedId((prev) => {
      if (prev && findNodeById(data, prev)) return prev;
      return data.length > 0 ? data[0].id : null;
    });
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const selectedNode = selectedId ? findNodeById(tree, selectedId) : undefined;

  const handleCreate = async (type: "GROUP" | "SUBGROUP", title: string, parentId: string | null) => {
    await createNavGroup({ parentId, type, title });
    await loadTree();
  };

  const allNodes = flattenTree(tree);

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white">
      {/* Left: folder tree */}
      <div className="w-80 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            返回后台
          </button>
        </div>
        <AdminNavManagerTree
          tree={tree}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddClick={(pid, ptitle) => {
            setCreateParentId(pid);
            setCreateParentTitle(ptitle);
            setCreateOpen(true);
          }}
        />
      </div>

      {/* Right: editor */}
      <div className="flex-1 overflow-y-auto">
        <AdminNavManagerEditor
          node={selectedNode ?? null}
          allNodes={allNodes}
          onRefresh={loadTree}
        />
      </div>

      <AdminNavManagerCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        parentId={createParentId}
        parentTitle={createParentTitle}
        onCreate={handleCreate}
      />
    </div>
  );
}

/** Recursive tree search */
function findNodeById(tree: AdminNavConfigNode[], id: string): AdminNavConfigNode | undefined {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Flatten tree to array */
function flattenTree(tree: AdminNavConfigNode[]): AdminNavConfigNode[] {
  const result: AdminNavConfigNode[] = [];
  const walk = (nodes: AdminNavConfigNode[]) => {
    for (const n of nodes) {
      result.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(tree);
  return result;
}
