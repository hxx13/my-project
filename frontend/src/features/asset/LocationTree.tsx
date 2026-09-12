/**
 * LocationTree — 资产记录 · 左「地点树」
 *
 * 结构、缩进、展开热区、计数槽、行内「⋯」菜单、内联新建、拖放、移动弹窗外壳
 * 全部走通用 <Tree>；这里只提供资产地点自己的语义：
 *   - 计数 = 服务端算好的 totalCount
 *   - 图标 = 自定义 emoji（没设才回落到文件夹/文件）
 *   - 菜单多「改名」「设置图标」
 *   - 落点：资产卡（text/asset-id）+ 文件夹（text/location-node-id）
 *   - 移动：后端不支持移到根，故选择器必选一个有效父节点
 * 只负责渲染与交互，接口调用全部由父级回调处理。
 */

import { useState } from "react";
import { ArrowRightLeft, Pencil, FolderPlus, Smile, Trash2 } from "lucide-react";
import type { AssetLocationNode } from "@/api/domains/assetLocation.api";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import { toast } from "react-hot-toast";
import { Tree } from "@/components/tree/Tree";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import EmojiPicker from "@/components/ui/EmojiPicker";
import { AssetLocationTreeSelect } from "@/components/admin/AssetLocationTreeSelect";
import { collectDescendantIds, findPath } from "./locationTreeUtils";

export type LocationTreeProps = {
  tree: AssetLocationNode[];
  selectedId: number | null;
  expanded: Set<number>;
  /** 搜索关键字，空串表示不搜索 */
  keyword: string;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  /** 新建根地点，name 已 trim 且非空 */
  onCreateRoot: (name: string) => void;
  /** 在 parentId 下新建子地点，name 已 trim 且非空 */
  onCreateChild: (parentId: number, name: string) => void;
  /** 改名，name 已 trim 且与原名不同 */
  onRename: (id: number, name: string) => void;
  /** 移动到新父节点；后端不支持移到根，故 parentId 必为有效节点 id */
  onMove: (id: number, parentId: number) => void;
  /** 删除（用户已确认）；非空节点由后端拒绝，错误由父级 toast 透出 */
  onDelete: (id: number) => void;
  /** 设置地点图标；不传则不显示「设置图标」入口（父级接 mutation，本组件不直接调接口） */
  onSetIcon?: (id: number, icon: string) => void;
  /** 资产卡片落到节点上 */
  onDropAsset: (assetId: string, nodeId: number) => void;
};

export function LocationTree(props: LocationTreeProps) {
  const {
    tree,
    selectedId,
    expanded,
    keyword,
    onSelect,
    onToggle,
    onCreateRoot,
    onCreateChild,
    onRename,
    onMove,
    onDelete,
    onSetIcon,
    onDropAsset,
  } = props;

  const [iconTarget, setIconTarget] = useState<AssetLocationNode | null>(null);

  const doRename = async (node: AssetLocationNode) => {
    const name = await appPrompt("修改地点名称", node.name, { title: "改名" });
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === node.name) return;
    onRename(node.id, trimmed);
  };

  const doDelete = async (node: AssetLocationNode) => {
    const ok = await appConfirm(`确认删除地点「${node.name}」？该地点下有子地点或资产时无法删除。`, {
      title: "删除地点",
      danger: true,
    });
    if (!ok) return;
    onDelete(node.id);
  };

  /** 拖文件夹到另一个文件夹：拦掉自环和「拖进自己的子树」这两种非法落点 */
  const handleDropNode = async (nodeId: number, newParentId: number) => {
    if (nodeId === newParentId) return;
    const dragged = findPath(tree, nodeId).at(-1);
    const target = findPath(tree, newParentId).at(-1);
    if (!dragged || !target) return;
    if (dragged.parentId === newParentId) return; // 已经是同一个父节点，不用打扰
    if (collectDescendantIds(dragged).includes(newParentId)) {
      toast.error("不能把文件夹移动到它自己的子文件夹里");
      return;
    }
    const ok = await appConfirm(`把「${dragged.name}」移动到「${target.name}」下？`, { title: "移动地点" });
    if (!ok) return;
    onMove(nodeId, newParentId);
  };

  return (
    <>
      <Tree<AssetLocationNode>
        nodes={tree}
        getId={(n) => n.id}
        getName={(n) => n.name}
        getChildren={(n) => n.children}
        getCount={(n) => n.totalCount ?? null}
        getIcon={(n) => (n.icon ? <span className="shrink-0 text-[13px] leading-none">{n.icon}</span> : null)}
        selectedId={selectedId}
        expanded={expanded}
        keyword={keyword}
        onSelect={onSelect}
        onToggle={onToggle}
        createPlaceholder="地点名称"
        createRootLabel="新建地点"
        onCreate={(parentId, name) => (parentId == null ? onCreateRoot(name) : onCreateChild(parentId, name))}
        emptyText="暂无地点"
        noMatchText="没有匹配的地点"
        dragPayloadType="text/location-node-id"
        onDropRow={(nodeId, dt) => {
          const assetId = dt.getData("text/asset-id");
          if (assetId) {
            onDropAsset(assetId, nodeId);
            return;
          }
          const draggedNodeId = dt.getData("text/location-node-id");
          if (draggedNodeId) void handleDropNode(Number(draggedNodeId), nodeId);
        }}
        renderMenu={(n, h) => (
          <>
            <DropdownMenuItem onSelect={h.startCreateChild}>
              <FolderPlus className="mr-2 h-3.5 w-3.5" />
              新建子地点
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void doRename(n)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              改名
            </DropdownMenuItem>
            {onSetIcon && (
              <DropdownMenuItem onSelect={() => setIconTarget(n)}>
                <Smile className="mr-2 h-3.5 w-3.5" />
                设置图标
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={h.startMove}>
              <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
              移动地点
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void doDelete(n)} className="text-red-600 focus:text-red-700">
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              删除地点
            </DropdownMenuItem>
          </>
        )}
        move={{
          title: "移动地点",
          selectPlaceholder: "选择新父地点",
          // 候选排除自己 + 自己整棵子树
          excludeIds: (n) => new Set(collectDescendantIds(n)),
          renderSelect: (p) => (
            <AssetLocationTreeSelect value={p.value} onChange={p.onChange} excludeIds={p.excludeIds} placeholder={p.placeholder} />
          ),
          // 后端不支持移到根：选择器没选到有效节点时确认按钮禁用
          onConfirm: (n, parentId) => {
            if (parentId != null) onMove(n.id, parentId);
          },
        }}
      />

      {iconTarget && onSetIcon && (
        <EmojiPicker
          value={iconTarget.icon ?? ""}
          onChange={(emoji) => {
            onSetIcon(iconTarget.id, emoji);
            setIconTarget(null);
          }}
          onClose={() => setIconTarget(null)}
        />
      )}
    </>
  );
}

export default LocationTree;
