import { useState, useEffect } from "react";
import { GripVertical, Trash2, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import {
  updateNavGroup,
  deleteNavGroup,
  moveNavGroup,
  moveNavItem,
  reorderNavNodes,
  resetNavConfig,
  type AdminNavConfigNode,
} from "@/api/domains/adminNavConfig.api";
import { getNavFolderSiblings, getNavNodeSiblingIndex } from "@/features/admin/adminNavManagerUtils";
import { normalizeAdminPath } from "@/features/admin/buildAdminNavModel";
import { normalizeStudentPath } from "@/features/student/nav/buildStudentNavModel";

import { appConfirm } from "@/lib/appDialog";
interface Props {
  node: AdminNavConfigNode | null;
  tree: AdminNavConfigNode[];
  allNodes: AdminNavConfigNode[];
  registryPaths: Set<string>;
  scope?: "ADMIN" | "STUDENT";
  onRefresh: () => void;
}

/** Human-readable type label */
function typeLabel(node: AdminNavConfigNode): string {
  switch (node.type) {
    case "GROUP": return "顶级分组";
    case "SUBGROUP": return "子分组";
    case "ITEM": return "侧边栏入口";
    default: return node.type;
  }
}

/** Color accent per type */
function typeAccent(node: AdminNavConfigNode): string {
  switch (node.type) {
    case "GROUP": return "border-l-indigo-500 bg-indigo-500/[0.08]";
    case "SUBGROUP": return "border-l-teal-500 bg-teal-500/[0.08]";
    case "ITEM": return "border-l-slate-500 bg-white/[0.04]";
    default: return "";
  }
}

/** 判断某入口是否来自代码注册表 */
function isRegistryPath(registryPaths: Set<string>, normalizePath: (p: string) => string, itemPath?: string | null): boolean {
  return !!itemPath && registryPaths.has(normalizePath(itemPath));
}

/** 判断文件夹子树是否含注册表条目（用于删除警告） */
function containsRegistryItem(node: AdminNavConfigNode, registryPaths: Set<string>, normalizePath: (p: string) => string): boolean {
  const walk = (n: AdminNavConfigNode): boolean => {
    if (n.type === "ITEM" && isRegistryPath(registryPaths, normalizePath, n.itemPath)) return true;
    return (n.children ?? []).some(walk);
  };
  return walk(node);
}

export function AdminNavManagerEditor({ node, tree, allNodes, registryPaths, scope = "ADMIN", onRefresh }: Props) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglingVis, setTogglingVis] = useState(false);

  useEffect(() => {
    if (node) setTitle(node.title);
  }, [node?.id]);

  if (!node) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--twin-mute)]">
        <p>选择一个文件夹或入口进行编辑</p>
      </div>
    );
  }

  const isGroup = node.type === "GROUP";
  const isSubgroup = node.type === "SUBGROUP";
  const isFolder = isGroup || isSubgroup;
  const isItem = node.type === "ITEM";
  const normalizePath = scope === "STUDENT" ? normalizeStudentPath : normalizeAdminPath;
  const isRegistryItem = isItem && isRegistryPath(registryPaths, normalizePath, node.itemPath);

  const handleSaveTitle = async () => {
    if (!title.trim() || title === node.title) return;
    setSaving(true);
    try {
      await updateNavGroup(node.id, { title: title.trim() });
      toast.success("名称已保存");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const hasRegistry = containsRegistryItem(node, registryPaths, normalizePath);
    const msg = isFolder
      ? `确定要删除「${node.title}」及其所有子内容？${hasRegistry ? "\n\n⚠️ 其中包含注册表条目，删除后重启应用将重新播种默认结构。" : ""}`
      : `确定要删除「${node.title}」？`;
    if (!await appConfirm(msg)) return;
    try {
      await deleteNavGroup(node.id);
      toast.success("已删除");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const handleMoveItem = async (itemId: string, newParentId: string) => {
    if (newParentId === node.id) return;
    try {
      await moveNavItem(itemId, newParentId);
      // 移动后补齐排序：追加到目标文件夹末尾，避免旧 sort_order 残留导致乱序
      const target = allNodes.find((n) => n.id === newParentId);
      const orderedIds = [...(target?.children ?? []).map((c) => c.id).filter((id) => id !== itemId), itemId];
      await reorderNavNodes(newParentId, orderedIds, scope);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移动失败");
    }
  };

  /** 从文件夹移除入口：注册表条目 → 软隐藏；自定义条目 → 删除 */
  const handleRemoveItem = async (itemId: string) => {
    const target = allNodes.find((n) => n.id === itemId);
    if (!target) return;
    const isReg = isRegistryPath(registryPaths, normalizePath, target.itemPath);
    const msg = isReg
      ? `「${target.title}」来自代码注册表，不可删除，将从侧栏隐藏。确定隐藏吗？`
      : `确定要删除自定义入口「${target.title}」？`;
    if (!await appConfirm(msg)) return;
    try {
      if (isReg) {
        await updateNavGroup(itemId, { visible: false });
        toast.success("入口已隐藏（可在右侧「已隐藏条目」中恢复）");
      } else {
        await deleteNavGroup(itemId);
        toast.success("入口已删除");
      }
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  const handleToggleVisibility = async () => {
    setTogglingVis(true);
    try {
      await updateNavGroup(node.id, { visible: !node.visible });
      toast.success(node.visible ? "入口已隐藏（可在右侧「已隐藏条目」中恢复）" : "入口已显示");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setTogglingVis(false);
    }
  };

  const handleReset = async () => {
    if (!await appConfirm("确定要重置为默认配置？这将清空当前 scope 的所有自定义修改。")) return;
    try {
      await resetNavConfig(scope);
      toast.success("已重置，默认结构将自动重新播种");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重置失败");
    }
  };

  const targetFolders = allNodes
    .filter((n) => n.type === "GROUP" || n.type === "SUBGROUP")
    .filter((n) => n.id !== node.id);

  const childItems = node.children?.filter((c) => c.type === "ITEM") ?? [];
  const childFolders = node.children?.filter((c) => c.type === "SUBGROUP") ?? [];
  const folderSiblings = getNavFolderSiblings(tree, node);
  const siblingIndex = getNavNodeSiblingIndex(folderSiblings, node.id);
  const canMoveUp = siblingIndex > 0;
  const canMoveDown = siblingIndex >= 0 && siblingIndex < folderSiblings.length - 1;

  const handleMoveFolder = async (direction: "up" | "down") => {
    try {
      const moved = await moveNavGroup(node.id, direction);
      if (!moved) {
        toast.error("排序失败");
        return;
      }
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "排序失败");
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header with type accent */}
      <div className={cn("border-l-4 rounded-l-md pl-4 py-2", typeAccent(node))}>
        <h3 className="text-lg font-semibold text-[var(--twin-ink)]">编辑：{node.title}</h3>
        <p className="text-sm text-[var(--twin-mute)]">
          <span className="font-medium text-[var(--twin-body)]">{typeLabel(node)}</span>
          {isFolder && childItems.length > 0 && ` · 包含 ${childItems.length} 个入口`}
          {isFolder && childFolders.length > 0 && ` · ${childFolders.length} 个子分组`}
          {isItem && node.itemPath && <span className="ml-2 font-mono">· {node.itemPath}</span>}
        </p>
      </div>

      {/* Name editor */}
      <div>
        <label className="block text-sm font-medium text-[var(--twin-body)] mb-1">名称</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleSaveTitle(); }}
            className="flex-1 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--twin-primary)]"
          />
          <Button onClick={() => void handleSaveTitle()} disabled={saving || title === node.title} size="sm">
            保存
          </Button>
        </div>
      </div>

      {/* Sort — folders only（降级路径，拖拽为主） */}
      {isFolder && (
        <div>
          <label className="block text-sm font-medium text-[var(--twin-body)] mb-1">排序位置</label>
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="sm" disabled={!canMoveUp} onClick={() => handleMoveFolder("up")}>
              ↑ 上移
            </Button>
            <Button variant="outline" size="sm" disabled={!canMoveDown} onClick={() => handleMoveFolder("down")}>
              ↓ 下移
            </Button>
            <span className="text-xs text-[var(--twin-mute)]">
              同级文件夹第 {siblingIndex >= 0 ? siblingIndex + 1 : "—"} 位 / 共 {folderSiblings.length} 个
            </span>
          </div>
        </div>
      )}

      {/* Item specific: path + icon info + move */}
      {isItem && (
        <div className="bg-white/[0.03] rounded-md p-4 space-y-3 border border-[var(--twin-hairline)]">
          <div>
            <label className="block text-xs font-medium text-[var(--twin-mute)] mb-0.5">路由路径</label>
            <code className="text-sm text-[var(--twin-body)] bg-white/[0.06] px-2 py-0.5 rounded">{node.itemPath || "—"}</code>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--twin-mute)] mb-0.5">图标</label>
            <span className="text-sm text-[var(--twin-body)]">{node.itemIcon || "—"}</span>
          </div>
          {node.itemBadgeKey && (
            <div>
              <label className="block text-xs font-medium text-[var(--twin-mute)] mb-0.5">气泡字段</label>
              <span className="text-sm text-[var(--twin-body)]">{node.itemBadgeKey}</span>
            </div>
          )}
          {/* Move item to another folder（降级路径） */}
          {targetFolders.length > 0 && (
            <div className="border-t border-[var(--twin-hairline)] pt-3">
              <label className="block text-xs font-medium text-[var(--twin-mute)] mb-1.5">移动到文件夹</label>
              <select
                className="w-full rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
                value=""
                onChange={(e) => {
                  if (e.target.value) handleMoveItem(node.id, e.target.value);
                }}
              >
                <option value="">选择目标文件夹…</option>
                {targetFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.type === "GROUP" ? "📁" : "📂"} {f.title}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-[var(--twin-mute)]">将入口从当前文件夹移动到选中的目标文件夹中（也可直接在左侧树中拖拽）</p>
            </div>
          )}
        </div>
      )}

      <hr className="border-[var(--twin-hairline)]" />

      {/* Child items list — folders only */}
      {isFolder && (
        <div>
          <label className="block text-sm font-medium text-[var(--twin-body)] mb-2">
            包含的入口
            {childItems.length === 0 && (
              <span className="text-amber-500 ml-2">（暂无入口，请从其他文件夹拖拽或新建）</span>
            )}
          </label>
          {childItems.length > 0 && (
            <div className="border border-[var(--twin-hairline)] rounded-md p-1 max-h-64 overflow-y-auto space-y-0.5">
              {childItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] rounded text-sm group">
                  <GripVertical className="h-3.5 w-3.5 text-[var(--twin-mute)] shrink-0" />
                  <span className="text-xs text-[var(--twin-mute)] w-16 shrink-0 truncate">{item.itemIcon || "📄"}</span>
                  <span className="flex-1 truncate text-[var(--twin-body)]">{item.title}</span>
                  <span className="text-xs text-[var(--twin-mute)] truncate max-w-[140px] font-mono">{item.itemPath}</span>
                  {isRegistryPath(registryPaths, normalizePath, item.itemPath) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 shrink-0">注册表</span>
                  )}
                  {targetFolders.length > 0 && (
                    <select
                      className="text-xs border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 text-[var(--twin-body)]"
                      value={node.id}
                      onChange={(e) => handleMoveItem(item.id, e.target.value)}
                    >
                      <option value={node.id}>移动到...</option>
                      {targetFolders.map((f) => (
                        <option key={f.id} value={f.id}>{f.title}</option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300"
                    title="移除此入口"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Danger zone */}
      <hr className="border-[var(--twin-hairline)]" />
      <div className="space-y-3">
        {isRegistryItem ? (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
              <p className="text-sm font-medium text-amber-200">此入口来自代码注册表，不可删除</p>
            </div>
            <p className="text-xs text-amber-300/80">
              注册表条目是系统基础导航结构的一部分。如果不再需要展示，可以隐藏而非删除。
              隐藏后可通过右侧「一键恢复全部」重新显示。
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={togglingVis}
                onClick={() => void handleToggleVisibility()}
                className={node.visible
                  ? "border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                  : "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"}
              >
                {node.visible
                  ? <><EyeOff className="h-3.5 w-3.5 mr-1.5" />隐藏入口</>
                  : <><Eye className="h-3.5 w-3.5 mr-1.5" />显示入口</>}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              删除此{isFolder ? "文件夹" : "入口"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}
              className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10">
              重置为默认
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
