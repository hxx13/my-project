import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { AdminNavManagerTree } from "./AdminNavManagerTree";
import { AdminNavManagerEditor } from "./AdminNavManagerEditor";
import { AdminNavManagerCreateDialog } from "./AdminNavManagerCreateDialog";
import {
  fetchAdminNavConfig,
  createNavGroup,
  ensureNavItems,
  updateNavGroup,
  type AdminNavConfigNode,
} from "@/api/domains/adminNavConfig.api";
import { ADMIN_NAV_REGISTRY, collectRegistryGroupItems } from "./adminNavRegistry";
import { normalizeAdminPath } from "./buildAdminNavModel";

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
    try {
      const created = await createNavGroup({ parentId, type, title });
      if (!created) {
        toast.error("创建失败");
        return;
      }
      toast.success(parentId ? "子文件夹已创建" : "顶级分组已创建");
      await loadTree();
      if (parentId) setSelectedId(parentId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    }
  };

  const allNodes = flattenTree(tree);
  const folderOptions = useMemo(
    () => buildFolderOptions(tree),
    [tree],
  );

  // 注册表中所有条目的路径集合
  const allRegistryPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const g of ADMIN_NAV_REGISTRY) {
      for (const it of collectRegistryGroupItems(g)) {
        paths.add(normalizeAdminPath(it.path));
      }
    }
    return paths;
  }, []);

  // 已在 DB 树中的路径集合
  const dbPaths = useMemo(() => {
    const paths = new Set<string>();
    const walk = (nodes: AdminNavConfigNode[]) => {
      for (const n of nodes) {
        if (n.type === "ITEM" && n.itemPath) paths.add(normalizeAdminPath(n.itemPath));
        if (n.children) walk(n.children);
      }
    };
    walk(tree);
    return paths;
  }, [tree]);

  // 注册表中存在但 DB 树中缺失的条目
  const missingRegistryItems = useMemo(() => {
    const result: { path: string; label: string; icon: string; groupTitle: string }[] = [];
    for (const g of ADMIN_NAV_REGISTRY) {
      for (const it of collectRegistryGroupItems(g)) {
        const np = normalizeAdminPath(it.path);
        if (!dbPaths.has(np)) {
          result.push({
            path: it.path,
            label: it.label,
            icon: (it.icon as any)?.displayName || "Layers",
            groupTitle: g.title,
          });
        }
      }
    }
    return result;
  }, [dbPaths]);

  // DB 树中在注册表内但被隐藏（visible=false）的条目
  const hiddenRegistryItems = useMemo(() => {
    const result: { id: string; title: string; path: string }[] = [];
    const walk = (nodes: AdminNavConfigNode[]) => {
      for (const n of nodes) {
        if (n.type === "ITEM" && n.itemPath && !n.visible && allRegistryPaths.has(normalizeAdminPath(n.itemPath))) {
          result.push({ id: n.id, title: n.title, path: n.itemPath });
        }
        if (n.children) walk(n.children);
      }
    };
    walk(tree);
    return result;
  }, [tree, allRegistryPaths]);

  const [restoring, setRestoring] = useState(false);

  const handleRestoreMissing = async () => {
    if (missingRegistryItems.length === 0) return;
    setRestoring(true);
    try {
      const result = await ensureNavItems(missingRegistryItems);
      toast.success(`已恢复 ${result.created} 个条目（${result.existed} 个已存在）`);
      await loadTree();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "恢复失败");
    } finally {
      setRestoring(false);
    }
  };

  const [showingHidden, setShowingHidden] = useState<string | null>(null);

  const handleShowHiddenItem = async (itemId: string) => {
    setShowingHidden(itemId);
    try {
      await updateNavGroup(itemId, { visible: true });
      toast.success("入口已重新显示");
      await loadTree();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "恢复失败");
    } finally {
      setShowingHidden(null);
    }
  };

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

        {/* 注册表中未入库的条目 */}
        {missingRegistryItems.length > 0 ? (
          <div className="border-t border-amber-200 bg-amber-50/60 px-3 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-amber-800">
                未入库条目 ({missingRegistryItems.length})
              </span>
              <button
                type="button"
                disabled={restoring}
                onClick={() => void handleRestoreMissing()}
                className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`h-3 w-3 ${restoring ? "animate-spin" : ""}`} />
                一键恢复全部
              </button>
            </div>
            <p className="text-[10px] text-amber-600 mb-2">
              以下条目在代码注册表中存在但未入库，点击「一键恢复」将其添加到导航配置。
            </p>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {missingRegistryItems.map((item) => (
                <div key={item.path} className="flex items-center gap-1.5 text-[11px] text-amber-900 bg-white/70 rounded px-2 py-1">
                  <span className="text-[10px] opacity-60 font-mono shrink-0">{item.path}</span>
                  <span className="flex-1 truncate font-medium">{item.label}</span>
                  <span className="text-[10px] text-amber-500 shrink-0">{item.groupTitle}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* 已隐藏的注册表条目 */}
        {hiddenRegistryItems.length > 0 && (
          <div className="border-t border-gray-200 bg-gray-50/80 px-3 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-600">
                已隐藏条目 ({hiddenRegistryItems.length})
              </span>
            </div>
            <p className="text-[10px] text-gray-500 mb-2">
              以下条目在代码注册表中存在且已入库，但被手动隐藏。点击可重新显示。
            </p>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {hiddenRegistryItems.map((item) => (
                <div key={item.id} className="flex items-center gap-1.5 text-[11px] text-gray-700 bg-white/80 rounded px-2 py-1">
                  <span className="text-[10px] opacity-50 font-mono shrink-0">{item.path}</span>
                  <span className="flex-1 truncate">{item.title}</span>
                  <button
                    type="button"
                    disabled={showingHidden === item.id}
                    onClick={() => void handleShowHiddenItem(item.id)}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-green-700 bg-green-100 hover:bg-green-200 disabled:opacity-50 transition-colors"
                  >
                    {showingHidden === item.id ? "…" : "显示"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: editor */}
      <div className="flex-1 overflow-y-auto">
        <AdminNavManagerEditor
          node={selectedNode ?? null}
          tree={tree}
          allNodes={allNodes}
          registryPaths={allRegistryPaths}
          onRefresh={loadTree}
        />
      </div>

      <AdminNavManagerCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        parentId={createParentId}
        parentTitle={createParentTitle}
        folderOptions={folderOptions}
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

/** 扁平化文件夹选项（含层级深度，供父级选择器使用） */
function buildFolderOptions(tree: AdminNavConfigNode[]): { id: string; title: string; depth: number }[] {
  const result: { id: string; title: string; depth: number }[] = [];
  const walk = (nodes: AdminNavConfigNode[], depth: number) => {
    for (const n of nodes) {
      if (n.type === "GROUP" || n.type === "SUBGROUP") {
        result.push({ id: n.id, title: n.title, depth });
        if (n.children?.length) walk(n.children, depth + 1);
      }
    }
  };
  walk(tree, 0);
  return result;
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
