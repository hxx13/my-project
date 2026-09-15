import { useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  FileText,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import toast from "react-hot-toast";
import CageOpDrawer from "@/components/cage/CageOpDrawer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tree } from "@/components/tree/Tree";
import { DndScope, type DndRef } from "@/components/tree/DndScope";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import { uploadAdminFileTemplate } from "@/api/domains/fileTemplates.api";
import {
  createSopDocument,
  createSopNode,
  deleteSopDocument,
  deleteSopNode,
  updateSopDocument,
  updateSopNode,
  type SopDocument,
  type SopNode,
} from "@/api/domains/sop.api";
import { buildSopTree, collectSopSubtreeIds, documentsOfNode, formatBytes, type SopTreeNode } from "../sopTree";
import SopNodePicker from "./SopNodePicker";

/** 转移弹窗的载荷：分类与文档共用同一个弹窗 */
type MoveTarget = {
  kind: "node" | "doc";
  id: number;
  title: string;
  /** 当前所在的父分类（节点）或分类（文档） */
  from: number | null;
};

/**
 * SOP 管理抽屉：分类树 CRUD + 文档上传/改名/转移/删除。
 *
 * 变更**不在这里改本地树**，一律落库后让 `onChanged()` 重新拉取：分类树是多人共用的结构，
 * 本地乐观改法一旦并发就和服务端分叉，用户看到的树会一直错到下次刷新。
 */
export function SopManageDrawer({
  open,
  onClose,
  nodes,
  documents,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  nodes: SopNode[];
  documents: SopDocument[];
  /** 任何写操作成功后调用，页面据此 invalidate 重新拉树 */
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  /** 上传目标分类：默认顶层/未分类 */
  const [uploadNodeId, setUploadNodeId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<MoveTarget | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tree = useMemo(() => buildSopTree(nodes), [nodes]);
  const unfiled = useMemo(() => documentsOfNode(documents, null), [documents]);

  /** 统一收口：忙态、错误提示、刷新。任何写操作都从这里走，别各写各的 try/catch */
  const run = async (fallbackMessage: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : fallbackMessage);
    } finally {
      setBusy(false);
    }
  };

  /* ── 分类 ── */

  const doRenameNode = async (node: SopTreeNode) => {
    const name = await appPrompt("修改分类名称", node.name, { title: "改名" });
    const trimmed = (name ?? "").trim();
    if (!trimmed || trimmed === node.name) return;
    await run("改名失败", () => updateSopNode(node.id, { name: trimmed }));
  };

  const doDeleteNode = async (node: SopTreeNode) => {
    const ok = await appConfirm(
      `确认删除分类「${node.name}」？该分类下有子分类或文档时无法删除。`,
      { title: "删除分类", danger: true },
    );
    if (!ok) return;
    await run("删除失败", () => deleteSopNode(node.id));
  };

  /** 拖拽落点：把被拖的分类挂到落点分类下 */
  const handleDrop = (active: DndRef, over: DndRef) => {
    if (active.kind !== "tree-node" || over.kind !== "tree-node") return;
    const id = Number(active.id);
    const parentId = Number(over.id);
    if (!Number.isFinite(id) || !Number.isFinite(parentId) || id === parentId) return;
    void run("移动失败", () => updateSopNode(id, { parentId, moveParent: true }));
  };

  /* ── 文档 ── */

  const doRenameDoc = async (doc: SopDocument) => {
    const title = await appPrompt("修改文档名称", doc.title, { title: "改名" });
    const trimmed = (title ?? "").trim();
    if (!trimmed || trimmed === doc.title) return;
    await run("改名失败", () => updateSopDocument(doc.id, { title: trimmed }));
  };

  const doDeleteDoc = async (doc: SopDocument) => {
    const ok = await appConfirm(`确认删除文档「${doc.title}」？`, { title: "删除文档", danger: true });
    if (!ok) return;
    await run("删除失败", () => deleteSopDocument(doc.id));
  };

  /* ── 转移（分类与文档共用） ── */

  const openMove = (t: MoveTarget) => {
    setMoving(t);
    setMoveTargetId(t.from);
  };

  const confirmMove = async () => {
    const m = moving;
    if (!m) return;
    setMoving(null);
    if (m.from === moveTargetId) return;
    if (m.kind === "node") {
      await run("移动失败", () => updateSopNode(m.id, { parentId: moveTargetId, moveParent: true }));
    } else {
      await run("转移失败", () => updateSopDocument(m.id, { nodeId: moveTargetId, moveNode: true }));
    }
  };

  /** 上传：先落 admin_file_template 拿 fileId，再登记进 SOP 表 */
  const handleFilePicked = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    // 同一个文件连选两次不会触发 change，必须清空
    ev.target.value = "";
    if (!file) return;
    const looksPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!looksPdf) {
      toast.error("只能上传 PDF 文件");
      return;
    }
    await run("上传失败", async () => {
      // 必须带 purpose=SOP：这张表是全站共用的 blob 表，
      // 不打标的话这些 PDF 会串到「文件模板库」列表里去
      const uploaded = await uploadAdminFileTemplate(file, "SOP");
      const title = (uploaded.originalName || file.name).replace(/\.pdf$/i, "") || "未命名文档";
      await createSopDocument({ nodeId: uploadNodeId, fileId: uploaded.id, title });
      toast.success("上传成功");
    });
  };

  /* ── 文档行（节点下 & 未分类共用） ── */

  const renderDocRow = (doc: SopDocument, indent: number) => (
    <div
      key={`doc-${doc.id}`}
      className="group flex items-center gap-1 rounded-twin-sm py-0.5 pr-1 hover:bg-[var(--app-color-surface-hover)]"
      style={{ paddingLeft: indent * 8 + 24 }}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--app-color-text-tertiary)]" />
      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--app-color-text-secondary)]" title={doc.title}>
        {doc.title}
      </span>
      <span className="shrink-0 text-[10px] tabular-nums text-[var(--app-color-text-tertiary)]">{formatBytes(doc.sizeBytes)}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          title="文档操作"
          aria-label="文档操作"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--app-color-text-tertiary)] opacity-0 transition hover:text-[var(--app-color-text-primary)] focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[9rem]">
          <DropdownMenuItem onSelect={() => void doRenameDoc(doc)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            改名
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openMove({ kind: "doc", id: doc.id, title: doc.title, from: doc.nodeId })}>
            <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
            转移到分类…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void doDeleteDoc(doc)} className="text-[var(--app-color-feedback-error)]">
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <>
      {/* 用项目统一的「右侧收纳抽屉壳」CageOpDrawer（笼架页那个）。
          它是**非模态**的浮动抽屉：没有遮罩、不锁焦点，开着也能点左边的文档，
          管理 PDF 时正合适。样式/把手/头身脚三段都由壳提供，这里只管内容。 */}
      {open ? (
        <CageOpDrawer
          title="SOP 管理"
          hint="分类增删改移；文档上传、改名、转移分类"
          collapseLabel="SOP 管理"
          onClose={onClose}
          width={420}
          headerExtra={
            busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--twin-mute)]" /> : null
          }
        >
          {/* 上传：先选目标分类，再选文件 */}
          <div className="mb-4 space-y-2 rounded-twin-lg border border-[var(--twin-hairline)] px-3 py-3">
            <div className="text-[11px] font-semibold text-[var(--twin-mute)]">上传 PDF 到分类</div>
            <SopNodePicker nodes={nodes} value={uploadNodeId} onChange={setUploadNodeId} />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-twin-md bg-[var(--twin-primary)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              选择 PDF 上传
            </button>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(ev) => void handleFilePicked(ev)} />
          </div>

          {/* 未分类文档没有节点可挂，单独列一块；否则它们只存在于库里、界面上永远看不到 */}
          {unfiled.length > 0 ? (
            <div className="mb-2 rounded-twin-lg border border-dashed border-[var(--twin-hairline)] pb-1">
              <div className="px-2 py-1.5 text-[11px] font-semibold text-[var(--twin-mute)]">
                未分类（{unfiled.length}）
              </div>
              {unfiled.map((d) => renderDocRow(d, 0))}
            </div>
          ) : null}

          <DndScope onDrop={handleDrop}>
            <Tree<SopTreeNode>
              nodes={tree}
              getId={(n) => n.id}
              getName={(n) => n.name}
              getChildren={(n) => n.children}
              getCount={(n) => documentsOfNode(documents, n.id).length || null}
              selectedId={selectedId}
              expanded={expanded}
              onSelect={setSelectedId}
              onToggle={(id) => setExpanded((p) => (p.has(id) ? new Set([...p].filter((v) => v !== id)) : new Set([...p, id])))}
              createPlaceholder="分类名称"
              createRootLabel="新建顶层分类"
              onCreate={(parentId, name) => void run("新建失败", () => createSopNode(parentId, name))}
              emptyText="暂无分类"
              noMatchText="没有匹配的分类"
              draggable
              droppable
              renderExtras={(n, depth) => documentsOfNode(documents, n.id).map((d) => renderDocRow(d, depth))}
              renderMenu={(n, h) => (
                <>
                  <DropdownMenuItem onSelect={h.startCreateChild}>
                    <FolderPlus className="mr-2 h-3.5 w-3.5" />
                    新建子分类
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void doRenameNode(n)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    改名
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openMove({ kind: "node", id: n.id, title: n.name, from: n.parentId })}>
                    <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
                    移动到…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void doDeleteNode(n)} className="text-[var(--app-color-feedback-error)]">
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    删除
                  </DropdownMenuItem>
                </>
              )}
            />
          </DndScope>
        </CageOpDrawer>
      ) : null}

      {/* 转移分类：节点与文档共用 */}
      <Dialog open={!!moving} onOpenChange={(v) => !v && setMoving(null)}>
        <DialogContent className="border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-primary)] sm:max-w-sm">
          <DialogTitle className="text-sm font-semibold">
            {moving?.kind === "node" ? "移动分类" : "转移文档分类"}
          </DialogTitle>
          <p className="text-xs text-[var(--app-color-text-secondary)]">将「{moving?.title}」转移到：</p>
          <SopNodePicker
            nodes={nodes}
            value={moveTargetId}
            onChange={setMoveTargetId}
            // 节点不能移进自己或自己的子孙（后端也会拒，这里先挡一道免得白跑一趟）
            excludeIds={moving?.kind === "node" ? collectSopSubtreeIds(nodes, moving.id) : undefined}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMoving(null)}
              className="rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy || moving?.from === moveTargetId}
              onClick={() => void confirmMove()}
              className="rounded-lg bg-[var(--app-color-accent-hover)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              确认转移
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default SopManageDrawer;
