import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Folder, GripVertical, Loader2, PanelRightClose, PanelRightOpen } from "lucide-react";
import toast from "react-hot-toast";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { cn } from "@/lib/utils";
import { AdminNavManagerTree } from "./AdminNavManagerTree";
import { AdminNavManagerEditor } from "./AdminNavManagerEditor";
import { AdminNavManagerCreateDialog } from "./AdminNavManagerCreateDialog";
import { AdminNavManagerRightPanel } from "./AdminNavManagerRightPanel";
import {
  fetchAdminNavConfig,
  createNavGroup,
  ensureNavItems,
  updateNavGroup,
  moveNavItem,
  reorderNavNodes,
  type AdminNavConfigNode,
} from "@/api/domains/adminNavConfig.api";
import { ADMIN_NAV_REGISTRY, collectRegistryGroupItems } from "./adminNavRegistry";
import { normalizeAdminPath } from "./buildAdminNavModel";
import { shouldHideAdminSidebarPath } from "./hiddenAdminNavPaths";
import { STUDENT_NAV_REGISTRY, collectStudentRegistryItems } from "@/features/student/nav/studentNavRegistry";
import { normalizeStudentPath } from "@/features/student/nav/buildStudentNavModel";
import {
  findNavNodeById,
  buildNavParentMap,
  getNavContainerChildren,
  reorderNavContainerChildren,
  moveNavNodeToContainer,
  ROOT_CONTAINER,
} from "./adminNavManagerUtils";

/** 依据 scope 选择路径规范化函数（学生端路径无 /console 前缀） */
function normalizeForScope(path: string, scope: "ADMIN" | "STUDENT"): string {
  return scope === "STUDENT" ? normalizeStudentPath(path) : normalizeAdminPath(path);
}

/** 判断注册表条目是否为真正的侧栏入口（排除 sidebarVisible 恒为 false 的内部条目） */
function isSidebarManagedEntry(item: { sidebarVisible: (ctx: any) => boolean }): boolean {
  return item.sidebarVisible.toString().replace(/\s+/g, "") !== "()=>false";
}

/** 后台真正侧栏入口的规范化路径集合（排除内部条目） */
const MANAGED_ADMIN_PATHS = new Set(
  ADMIN_NAV_REGISTRY.flatMap((g) => collectRegistryGroupItems(g))
    .filter((it) => isSidebarManagedEntry(it))
    .map((it) => normalizeAdminPath(it.path))
);

/** 学生端侧栏入口路径集合 */
const MANAGED_STUDENT_PATHS = new Set(
  STUDENT_NAV_REGISTRY.flatMap((g) => collectStudentRegistryItems(g))
    .map((it) => normalizeStudentPath(it.path))
);

/** 过滤不应出现在入口管理器的节点：非侧栏入口的子页面/重定向 + 已不在注册表中的陈旧条目 */
function filterManagedTree(nodes: AdminNavConfigNode[], scope: "ADMIN" | "STUDENT"): AdminNavConfigNode[] {
  const managedPaths = scope === "STUDENT" ? MANAGED_STUDENT_PATHS : MANAGED_ADMIN_PATHS;
  const normalize = scope === "STUDENT" ? normalizeStudentPath : normalizeAdminPath;
  return nodes
    .filter((n) => {
      if (n.type !== "ITEM" || !n.itemPath) return true;
      if (scope === "ADMIN" && shouldHideAdminSidebarPath(n.itemPath)) return false;
      return managedPaths.has(normalize(n.itemPath));
    })
    .map((n) => (n.children?.length ? { ...n, children: filterManagedTree(n.children, scope) } : n));
}

type DropResolve =
  | { kind: "move"; nodeId: string; newParentId: string | null; orderedIds: string[] }
  | { kind: "reorder"; containerId: string; orderedIds: string[] }
  | null;

/** 依据 active/over 解析一次拖拽的落点与最终顺序（不产生副作用） */
function resolveDrop(
  tree: AdminNavConfigNode[],
  parentMap: Map<string, string>,
  activeId: string,
  overId: string,
): DropResolve {
  if (activeId === overId) return null;
  const activeNode = findNavNodeById(tree, activeId);
  const overNode = findNavNodeById(tree, overId);
  if (!activeNode || !overNode) return null;

  const activeIsItem = activeNode.type === "ITEM";
  const overIsFolder = overNode.type === "GROUP" || overNode.type === "SUBGROUP";
  const activeContainer = parentMap.get(activeId);
  if (!activeContainer) return null;

  // 入口拖到文件夹上 → 移入该文件夹（追加末尾）
  if (activeIsItem && overIsFolder) {
    const kids = getNavContainerChildren(tree, overId)
      .map((c) => c.id)
      .filter((id) => id !== activeId);
    return { kind: "move", nodeId: activeId, newParentId: overId, orderedIds: [...kids, activeId] };
  }

  const overContainer = parentMap.get(overId);
  if (!overContainer) return null;

  if (activeContainer !== overContainer) {
    // 跨容器：仅入口可跨文件夹；文件夹不可跨父级
    if (!activeIsItem) return null;
    const kids = getNavContainerChildren(tree, overContainer)
      .map((c) => c.id)
      .filter((id) => id !== activeId);
    const idx = kids.indexOf(overId);
    const orderedIds = [...kids];
    orderedIds.splice(idx < 0 ? orderedIds.length : idx, 0, activeId);
    return {
      kind: "move",
      nodeId: activeId,
      newParentId: overContainer === ROOT_CONTAINER ? null : overContainer,
      orderedIds,
    };
  }

  // 同级重排
  const kids = getNavContainerChildren(tree, overContainer).map((c) => c.id);
  const oldIdx = kids.indexOf(activeId);
  const newIdx = kids.indexOf(overId);
  if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return null;
  return { kind: "reorder", containerId: overContainer, orderedIds: arrayMove(kids, oldIdx, newIdx) };
}

/** 将解析结果应用到树上（用于拖拽过程中的乐观预览） */
function applyDropToTree(
  tree: AdminNavConfigNode[],
  parentMap: Map<string, string>,
  activeId: string,
  overId: string,
): AdminNavConfigNode[] {
  const result = resolveDrop(tree, parentMap, activeId, overId);
  if (!result) return tree;
  if (result.kind === "move") {
    const container = result.newParentId ?? ROOT_CONTAINER;
    const idx = result.orderedIds.indexOf(activeId);
    return moveNavNodeToContainer(tree, activeId, container, idx < 0 ? Number.MAX_SAFE_INTEGER : idx);
  }
  return reorderNavContainerChildren(tree, result.containerId, result.orderedIds);
}

export default function AdminNavManager() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [scope, setScope] = useState<"ADMIN" | "STUDENT">("ADMIN");
  const [tree, setTree] = useState<AdminNavConfigNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [createParentTitle, setCreateParentTitle] = useState<string | undefined>();
  const [rightOpen, setRightOpen] = useState(true);
  // tree 对应的 scope；与当前 scope 不一致时表示正在切换加载中，避免右侧面板用错位数据闪烁
  const [loadedScope, setLoadedScope] = useState<"ADMIN" | "STUDENT">("ADMIN");

  // 拖拽状态：dragTree 为拖拽过程中的乐观预览，null 表示未拖拽
  const [dragTree, setDragTree] = useState<AdminNavConfigNode[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const loadTree = useCallback(async () => {
    const data = await fetchAdminNavConfig(scope);
    const filtered = filterManagedTree(data, scope);
    setTree(filtered);
    setLoadedScope(scope);
    setSelectedId((prev) => {
      if (prev && findNavNodeById(filtered, prev)) return prev;
      return filtered.length > 0 ? filtered[0].id : null;
    });
  }, [scope]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const renderedTree = dragTree ?? tree;
  const parentMap = useMemo(() => buildNavParentMap(renderedTree), [renderedTree]);
  const committedParentMap = useMemo(() => buildNavParentMap(tree), [tree]);

  const selectedNode = selectedId ? findNavNodeById(renderedTree, selectedId) : undefined;
  const scopeReady = loadedScope === scope;

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

  const allNodes = useMemo(() => flattenTree(renderedTree), [renderedTree]);
  const folderOptions = useMemo(() => buildFolderOptions(renderedTree), [renderedTree]);

  // 真正侧栏入口的路径集合（与 filterManagedTree 共用同一份）
  const allRegistryPaths = scope === "STUDENT" ? MANAGED_STUDENT_PATHS : MANAGED_ADMIN_PATHS;

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

  const missingRegistryItems = useMemo(() => {
    const result: { path: string; label: string; icon: string; groupTitle: string }[] = [];
    if (scope === "STUDENT") {
      for (const g of STUDENT_NAV_REGISTRY) {
        for (const it of collectStudentRegistryItems(g)) {
          const np = normalizeStudentPath(it.path);
          if (!dbPaths.has(np)) result.push({ path: it.path, label: it.label, icon: (it.icon as any)?.displayName || "Layers", groupTitle: g.title });
        }
      }
    } else {
      for (const g of ADMIN_NAV_REGISTRY) {
        for (const it of collectRegistryGroupItems(g)) {
          if (!isSidebarManagedEntry(it)) continue;
          const np = normalizeAdminPath(it.path);
          if (!dbPaths.has(np)) result.push({ path: it.path, label: it.label, icon: (it.icon as any)?.displayName || "Layers", groupTitle: g.title });
        }
      }
    }
    return result;
  }, [dbPaths, scope]);

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

  // 拖拽
  const onDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setDragTree(tree);
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    setDragTree((prev) => {
      const base = prev ?? tree;
      const map = buildNavParentMap(base);
      return applyDropToTree(base, map, String(active.id), String(over.id));
    });
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setDragTree(null);
    if (!over) return;
    const result = resolveDrop(tree, committedParentMap, String(active.id), String(over.id));
    if (!result) return;
    try {
      if (result.kind === "move") {
        const moved = await moveNavItem(result.nodeId, result.newParentId);
        if (!moved) {
          toast.error("移动失败");
          await loadTree();
          return;
        }
        await reorderNavNodes(result.newParentId, result.orderedIds, scope);
      } else {
        const parentId = result.containerId === ROOT_CONTAINER ? null : result.containerId;
        await reorderNavNodes(parentId, result.orderedIds, scope);
      }
      await loadTree();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "拖拽保存失败");
      await loadTree();
    }
  };

  const onDragCancel = () => {
    setActiveId(null);
    setDragTree(null);
  };

  // GSAP 入场动画
  useGSAP(
    () => {
      if (!rootRef.current) return;
      gsap.from(rootRef.current.querySelectorAll("[data-nav-mgr-panel]"), {
        opacity: 0,
        y: 14,
        duration: 0.5,
        ease: "power2.out",
        stagger: 0.08,
      });
    },
    { scope: rootRef },
  );

  const activeNode = activeId ? findNavNodeById(renderedTree, activeId) : undefined;

  return (
    <div ref={rootRef} className="flex min-h-0 flex-col h-[calc(100dvh-var(--admin-chrome-offset))] max-h-[calc(100dvh-var(--admin-chrome-offset))]">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] shadow-twin-level-2">
          {scopeReady ? (
            <>
          {/* 左栏：作用域切换 + 文件夹树 */}
          <div data-nav-mgr-panel className="flex w-72 shrink-0 flex-col min-h-0 border-r border-[var(--twin-hairline)]">
            <div className="shrink-0 px-4 py-3 border-b border-[var(--twin-hairline)]">
              <button
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-1.5 text-sm text-[var(--twin-mute)] hover:text-[var(--twin-ink)] transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                返回后台
              </button>
            </div>

            <div className="shrink-0 px-4 py-2 border-b border-[var(--twin-hairline)]">
              <div className="inline-flex w-full rounded-lg bg-[var(--twin-canvas)] p-1 ring-1 ring-[var(--twin-hairline)]">
                <button
                  type="button"
                  onClick={() => setScope("ADMIN")}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    scope === "ADMIN" ? "bg-[var(--twin-primary)] text-[var(--twin-on-primary)]" : "text-[var(--twin-mute)] hover:text-[var(--twin-body)]"
                  )}
                >
                  后台导航
                </button>
                <button
                  type="button"
                  onClick={() => setScope("STUDENT")}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    scope === "STUDENT" ? "bg-[var(--twin-primary)] text-[var(--twin-on-primary)]" : "text-[var(--twin-mute)] hover:text-[var(--twin-body)]"
                  )}
                >
                  学生端导航
                </button>
              </div>
            </div>

            <AdminNavManagerTree
              tree={renderedTree}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAddClick={(pid, ptitle) => {
                setCreateParentId(pid);
                setCreateParentTitle(ptitle);
                setCreateOpen(true);
              }}
            />
          </div>

          {/* 中栏：编辑器 */}
          <div data-nav-mgr-panel className="flex min-w-0 flex-1 flex-col min-h-0">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-4 py-2">
              <span className="text-xs font-semibold text-[var(--twin-mute)]">节点编辑</span>
              <button
                type="button"
                onClick={() => setRightOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-body)] transition-colors"
                title={rightOpen ? "收起收纳区" : "展开收纳区"}
              >
                {rightOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                收纳区
              </button>
            </div>
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

          {/* 右栏：收纳区（可折叠） */}
          {rightOpen && (
            <div data-nav-mgr-panel className="flex w-72 shrink-0 flex-col min-h-0 border-l border-[var(--twin-hairline)]">
              <AdminNavManagerRightPanel
                missingItems={missingRegistryItems}
                hiddenItems={hiddenRegistryItems}
                restoring={restoring}
                showingHidden={showingHidden}
                onRestoreMissing={() => void handleRestoreMissing()}
                onShowHidden={(id) => void handleShowHiddenItem(id)}
              />
            </div>
          )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center gap-2 text-[var(--twin-mute)]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">加载中…</span>
            </div>
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeNode ? (
            <div className="flex items-center gap-2 rounded-md border border-[var(--twin-primary)]/50 bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] shadow-twin-level-2">
              <GripVertical className="h-3.5 w-3.5 text-[var(--twin-mute)]" />
              {activeNode.type === "GROUP" ? (
                <Folder className="h-4 w-4 text-indigo-400" />
              ) : activeNode.type === "SUBGROUP" ? (
                <Folder className="h-4 w-4 text-teal-400" />
              ) : (
                <span className="text-xs">📄</span>
              )}
              <span className="truncate">{activeNode.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

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
