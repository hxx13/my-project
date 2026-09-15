/**
 * FileFolderTree — 文件模板库 · 左「文件夹树」
 *
 * 结构、缩进、展开热区、计数槽、行内「⋯」菜单、内联新建、拖放、移动弹窗外壳
 * 全部走通用 <Tree>；这里只提供文件文件夹自己的语义：
 *   - 计数 = 服务端算好的 totalCount
 *   - 图标 = 自定义 emoji（没设才回落到文件夹/文件）
 *   - 菜单多「改名」「设置图标」
 *   - 移动：后端不支持移到根，故选择器必选一个有效父节点
 * 只负责渲染与交互，接口调用全部由父级回调处理。
 *
 * 行的拖放只接线（draggable/droppable），落点由页面在 DndScope.onDrop 里解析。
 */

import { useState } from "react";
import { ArrowRightLeft, Pencil, FolderPlus, Smile, Trash2 } from "lucide-react";
import type { FileFolderNode } from "@/api/domains/fileFolders.api";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import { Tree } from "@/components/tree/Tree";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import EmojiPicker from "@/components/ui/EmojiPicker";
import { FileFolderTreeSelect } from "./FileFolderTreeSelect";

/** 含自身的所有后代 id，返回 Set<number>（深度优先） */
function collectDescendantIds(node: FileFolderNode): Set<number> {
  const out = new Set<number>();
  const walk = (n: FileFolderNode) => {
    out.add(n.id);
    for (const child of n.children ?? []) walk(child);
  };
  walk(node);
  return out;
}

export type FileFolderTreeProps = {
  tree: FileFolderNode[];
  selectedId: number | null;
  expanded: Set<number>;
  /** 搜索关键字，空串表示不搜索 */
  keyword: string;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  /** 新建根文件夹，name 已 trim 且非空 */
  onCreateRoot: (name: string) => void;
  /** 在 parentId 下新建子文件夹，name 已 trim 且非空 */
  onCreateChild: (parentId: number, name: string) => void;
  /** 改名，name 已 trim 且与原名不同 */
  onRename: (id: number, name: string) => void;
  /** 移动到新父节点；后端不支持移到根，故 parentId 必为有效节点 id */
  onMove: (id: number, parentId: number) => void;
  /** 删除（用户已确认）；非空节点由后端拒绝，错误由父级 toast 透出 */
  onDelete: (id: number) => void;
  /** 设置文件夹图标；不传则不显示「设置图标」入口（父级接 mutation，本组件不直接调接口） */
  onSetIcon?: (id: number, icon: string) => void;
};

export function FileFolderTree(props: FileFolderTreeProps) {
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
  } = props;

  const [iconTarget, setIconTarget] = useState<FileFolderNode | null>(null);

  const doRename = async (node: FileFolderNode) => {
    const name = await appPrompt("修改文件夹名称", node.name, { title: "改名" });
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === node.name) return;
    onRename(node.id, trimmed);
  };

  const doDelete = async (node: FileFolderNode) => {
    const ok = await appConfirm(`确认删除文件夹「${node.name}」？其中有文件或子文件夹时无法删除。`, {
      title: "删除文件夹",
      danger: true,
    });
    if (!ok) return;
    onDelete(node.id);
  };

  return (
    <>
      <Tree<FileFolderNode>
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
        createPlaceholder="文件夹名称"
        createRootLabel="新建文件夹"
        onCreate={(parentId, name) => (parentId == null ? onCreateRoot(name) : onCreateChild(parentId, name))}
        emptyText="暂无文件夹"
        noMatchText="没有匹配的文件夹"
        draggable
        droppable
        renderMenu={(n, h) => (
          <>
            <DropdownMenuItem onSelect={h.startCreateChild}>
              <FolderPlus className="mr-2 h-3.5 w-3.5" />
              新建子文件夹
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
              移动文件夹
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void doDelete(n)} className="text-red-600 focus:text-red-700">
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              删除文件夹
            </DropdownMenuItem>
          </>
        )}
        move={{
          title: "移动文件夹",
          selectPlaceholder: "选择新父文件夹",
          // 候选排除自己 + 自己整棵子树
          excludeIds: (n) => collectDescendantIds(n),
          renderSelect: (p) => (
            <FileFolderTreeSelect value={p.value} onChange={p.onChange} excludeIds={p.excludeIds} placeholder={p.placeholder} />
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

export default FileFolderTree;
