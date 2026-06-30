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
  resetNavConfig,
  type AdminNavConfigNode,
} from "@/api/domains/adminNavConfig.api";
import { getNavFolderSiblings, getNavNodeSiblingIndex } from "@/features/admin/adminNavManagerUtils";
import { normalizeAdminPath } from "@/features/admin/buildAdminNavModel";

interface Props {
  node: AdminNavConfigNode | null;
  tree: AdminNavConfigNode[];
  allNodes: AdminNavConfigNode[];
  registryPaths: Set<string>;
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
    case "GROUP": return "border-l-indigo-500 bg-indigo-50/50";
    case "SUBGROUP": return "border-l-teal-500 bg-teal-50/50";
    case "ITEM": return "border-l-gray-400 bg-gray-50";
    default: return "";
  }
}

export function AdminNavManagerEditor({ node, tree, allNodes, registryPaths, onRefresh }: Props) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglingVis, setTogglingVis] = useState(false);

  useEffect(() => {
    if (node) setTitle(node.title);
  }, [node?.id]);

  if (!node) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p>选择一个文件夹或入口进行编辑</p>
      </div>
    );
  }

  const isGroup = node.type === "GROUP";
  const isSubgroup = node.type === "SUBGROUP";
  const isFolder = isGroup || isSubgroup;
  const isItem = node.type === "ITEM";
  const isRegistryItem = isItem && node.itemPath ? registryPaths.has(normalizeAdminPath(node.itemPath)) : false;

  const handleSaveTitle = async () => {
    if (!title.trim() || title === node.title) return;
    setSaving(true);
    await updateNavGroup(node.id, { title: title.trim() });
    setSaving(false);
    onRefresh();
  };

  const handleDelete = async () => {
    const msg = isFolder
      ? `确定要删除「${node.title}」及其所有子内容？`
      : `确定要从侧边栏移除「${node.title}」？`;
    if (!confirm(msg)) return;
    await deleteNavGroup(node.id);
    onRefresh();
  };

  const handleMoveItem = async (itemId: string, newParentId: string) => {
    if (newParentId === node.id) return;
    await moveNavItem(itemId, newParentId);
    onRefresh();
  };

  const handleRemoveItem = async (itemId: string) => {
    await moveNavItem(itemId, "__unassigned__");
    onRefresh();
  };

  const handleToggleVisibility = async () => {
    setTogglingVis(true);
    try {
      await updateNavGroup(node.id, { visible: !node.visible });
      toast.success(node.visible ? "入口已隐藏（左侧「已隐藏条目」中可恢复）" : "入口已显示");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setTogglingVis(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("确定要重置为默认配置？这将清空所有自定义修改，需要重启应用后生效。")) return;
    await resetNavConfig();
    onRefresh();
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
        <h3 className="text-lg font-semibold text-gray-800">编辑：{node.title}</h3>
        <p className="text-sm text-gray-400">
          <span className="font-medium text-gray-500">{typeLabel(node)}</span>
          {isFolder && childItems.length > 0 && ` · 包含 ${childItems.length} 个入口`}
          {isFolder && childFolders.length > 0 && ` · ${childFolders.length} 个子分组`}
          {isItem && node.itemPath && <span className="ml-2">· {node.itemPath}</span>}
        </p>
      </div>

      {/* Name editor */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">名称</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <Button onClick={handleSaveTitle} disabled={saving || title === node.title} size="sm">
            保存
          </Button>
        </div>
      </div>

      {/* Sort — folders only */}
      {isFolder && (
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">排序位置</label>
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="sm" disabled={!canMoveUp}
              onClick={() => handleMoveFolder("up")}>
              ↑ 上移
            </Button>
            <Button variant="outline" size="sm" disabled={!canMoveDown}
              onClick={() => handleMoveFolder("down")}>
              ↓ 下移
            </Button>
            <span className="text-xs text-gray-400">
              同级文件夹第 {siblingIndex >= 0 ? siblingIndex + 1 : "—"} 位 / 共 {folderSiblings.length} 个
            </span>
          </div>
        </div>
      )}

      {/* Item specific: path + icon info + move */}
      {isItem && (
        <div className="bg-gray-50 rounded-md p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-0.5">路由路径</label>
            <code className="text-sm text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{node.itemPath || "—"}</code>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-0.5">图标</label>
            <span className="text-sm text-gray-700">{node.itemIcon || "—"}</span>
          </div>
          {node.itemBadgeKey && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-0.5">气泡字段</label>
              <span className="text-sm text-gray-700">{node.itemBadgeKey}</span>
            </div>
          )}
          {/* Move item to another folder */}
          {targetFolders.length > 0 && (
            <div className="border-t border-gray-200 pt-3">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">移动到文件夹</label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
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
              <p className="mt-1 text-[11px] text-gray-400">将入口从当前文件夹移动到选中的目标文件夹中</p>
            </div>
          )}
        </div>
      )}

      <hr className="border-gray-200" />

      {/* Child items list — folders only */}
      {isFolder && (
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            包含的入口
            {childItems.length === 0 && (
              <span className="text-amber-500 ml-2">（暂无入口，请从其他文件夹拖拽或新建）</span>
            )}
          </label>
          {childItems.length > 0 && (
            <div className="border border-gray-200 rounded-md p-1 max-h-64 overflow-y-auto space-y-0.5">
              {childItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded text-sm group">
                  <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                  <span className="text-xs text-gray-500 w-16 shrink-0 truncate">{item.itemIcon || "📄"}</span>
                  <span className="flex-1 truncate">{item.title}</span>
                  <span className="text-xs text-gray-400 truncate max-w-[140px]">{item.itemPath}</span>
                  {targetFolders.length > 0 && (
                    <select
                      className="text-xs border border-gray-200 rounded px-1 py-0.5 opacity-0 group-hover:opacity-100"
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
                    className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600"
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
      <hr className="border-gray-200" />
      <div className="space-y-3">
        {isRegistryItem ? (
          /* 注册表条目：禁止硬删除，只能软隐藏 */
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-sm font-medium text-amber-800">此入口来自代码注册表，不可删除</p>
            </div>
            <p className="text-xs text-amber-700">
              注册表条目是系统基础导航结构的一部分。如果不再需要展示，可以隐藏而非删除。
              隐藏后可通过左侧「一键恢复全部」重新显示。
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={togglingVis}
                onClick={() => void handleToggleVisibility()}
                className={node.visible
                  ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                  : "border-green-300 text-green-700 hover:bg-green-50"}
              >
                {node.visible
                  ? <><EyeOff className="h-3.5 w-3.5 mr-1.5" />隐藏入口</>
                  : <><Eye className="h-3.5 w-3.5 mr-1.5" />显示入口</>}
              </Button>
            </div>
          </div>
        ) : (
          /* 自定义条目：允许删除 */
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              删除此{isFolder ? "文件夹" : "入口"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}
              className="border-amber-300 text-amber-700 hover:bg-amber-50">
              重置为默认
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

