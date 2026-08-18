import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
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
import { STUDENT_NAV_REGISTRY, collectStudentRegistryItems } from "@/features/student/nav/studentNavRegistry";
import { normalizeStudentPath } from "@/features/student/nav/buildStudentNavModel";

/** 依据 scope 选择路径规范化函数（学生端路径无 /console 前缀） */
function normalizeForScope(path: string, scope: "ADMIN" | "STUDENT"): string {
  return scope === "STUDENT" ? normalizeStudentPath(path) : normalizeAdminPath(path);
}

export default function AdminNavManager() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<"ADMIN" | "STUDENT">("ADMIN");
  const [tree, setTree] = useState<AdminNavConfigNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [createParentTitle, setCreateParentTitle] = useState<string | undefined>();

  const loadTree = useCallback(async () => {
    const data = await fetchAdminNavConfig(scope);
    setTree(data);
    setSelectedId((prev) => {
      if (prev && findNodeById(data, prev)) return prev;
      return data.length > 0 ? data[0].id : null;
    });
  }, [scope]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const selectedNode = selectedId ? findNodeById(tree, selectedId) : undefined;

  const handleCreate = async (type: "GROUP" | "SUBGROUP", title: string, parentId: string | null) => {
    try {
      const created = await createNavGroup({ parentId, type, title, scope });
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
    if (scope === "STUDENT") {
      for (const g of STUDENT_NAV_REGISTRY) {
        for (const it of collectStudentRegistryItems(g)) {
          paths.add(normalizeStudentPath(it.path));
        }
      }
    } else {
      for (const g of ADMIN_NAV_REGISTRY) {
        for (const it of collectRegistryGroupItems(g)) {
          paths.add(normalizeAdminPath(it.path));
        }
      }
    }
    return paths;
  }, [scope]);

  // 已在 DB 树中的路径集合
  const dbPaths = useMemo(() => {
    const paths = new Set<string>();
    const walk = (nodes: AdminNavConfigNode[]) => {
      for (const n of nodes) {
        if (n.type === "ITEM" && n.itemPath) paths.add(normalizeForScope(n.itemPath, scope));
        if (n.children) walk(n.children);
      }
    };
    walk(tree);
    return paths;
  }, [tree, scope]);

  // 注册表中存在但 DB 树中缺失的条目
  const missingRegistryItems = useMemo(() => {
    const result: { path: string; label: string; icon: string; groupTitle: string }[] = [];
    if (scope === "STUDENT") {
      for (const g of STUDENT_NAV_REGISTRY) {
        for (const it of collectStudentRegistryItems(g)) {
          const np = normalizeStudentPath(it.path);
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
    } else {
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
    }
    return result;
  }, [dbPaths, scope]);

  // DB 树中在注册表内但被隐藏（visible=false）的条目
  const hiddenRegistryItems = useMemo(() => {
    const result: { id: string; title: string; path: string }[] = [];
    const walk = (nodes: AdminNavConfigNode[]) => {
      for (const n of nodes) {
        if (n.type === "ITEM" && n.itemPath && !n.visible && allRegistryPaths.has(normalizeForScope(n.itemPath, scope))) {
          result.push({ id: n.id, title: n.title, path: n.itemPath });
        }
        if (n.children) walk(n.children);
      }
    };
    walk(tree);
    return result;
  }, [tree, allRegistryPaths, scope]);

  const [restoring, setRestoring] = useState(false);

  const handleRestoreMissing = async () => {
    if (missingRegistryItems.length === 0) return;
    setRestoring(true);
    try {
      const result = await ensureNavItems(missingRegistryItems, scope);
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
      <div className="w-80 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col min-h-0 overflow-hidden">
        <div className="shrink-0 px-4 py-3 border-b border-gray-200">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            返回后台
          </button>
        </div>

        {/* 作用域切换：后台导航 / 学生端导航 */}
        <div className="shrink-0 px-4 py-2 border-b border-gray-200 bg-white">
          <div className="inline-flex w-full rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setScope("ADMIN")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                scope === "ADMIN" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
              )}
            >
              后台导航
            </button>
            <button
              type="button"
              onClick={() => setScope("STUDENT")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                scope === "STUDENT" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
              )}
            >
              学生端导航
            </button>
          </div>
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

      {/* Right: 未入库/已隐藏面板 + 编辑器 */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {/* 注册表中未入库的条目 */}
        {missingRegistryItems.length > 0 ? (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50/60 px-4 py-2">
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
          <div className="shrink-0 border-b border-gray-200 bg-gray-50/80 px-4 py-2">
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

        {/* Editor（可滚动） */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <AdminNavManagerEditor
            node={selectedNode ?? null}
            tree={tree}
            allNodes={allNodes}
            registryPaths={allRegistryPaths}
            scope={scope}
            onRefresh={loadTree}
          />
        </div>
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
