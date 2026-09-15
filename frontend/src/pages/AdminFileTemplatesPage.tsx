import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ArrowRightLeft, CheckCircle2, ClipboardList, Download, Folder, Loader2, Printer, Search, Trash2, Upload, XCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminPageShell, AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import { AdminSensitiveAction } from "@/features/admin/AdminSensitiveAction";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import {
  deleteAdminFileTemplate,
  downloadAdminFileTemplateBlob,
  fetchAdminFileTemplates,
  moveAdminFileTemplate,
  uploadAdminFileTemplate,
  type AdminFileTemplateRow,
} from "@/api/domains/fileTemplates.api";
import {
  useFileFolderTree,
  useCreateFileFolder,
  useUpdateFileFolder,
  useDeleteFileFolder,
} from "@/api/hooks/useFileFolders";
import { queryKeys } from "@/api/hooks/queryKeys";
import type { FileFolderNode } from "@/api/domains/fileFolders.api";
import { FileFolderTree } from "@/features/file-templates/FileFolderTree";
import { FileFolderTreeSelect } from "@/features/file-templates/FileFolderTreeSelect";
import { DndScope, type DndRef } from "@/components/tree/DndScope";
import { findPath, collectDescendantIds } from "@/features/asset/locationTreeUtils";
import DataSkeleton from "@/components/ui/DataSkeleton";
import EmptyState from "@/components/ui/EmptyState";
import { Portal } from "@/components/Portal";
import { PrintButton } from "@/features/print-station/PrintButton";
import { PrintQueueButton } from "@/features/print-station/PrintQueueDialog";
import { PrintCartDrawer } from "@/features/print-station/PrintCartDrawer";
import { createCart, type CartState, type PrintItem } from "@/features/print-station/printCart";
import { AdminButton } from "@/components/admin/AdminButton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { appConfirm } from "@/lib/appDialog";
function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtTime(v: string) {
  return v.length > 19 ? v.slice(0, 19).replace("T", " ") : v;
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** 选择列复选框：全站无 checkbox 原语，都用裸 input + 这个常量（同 RecordsTable）。 */
const CHECKBOX = "size-3.5 shrink-0 cursor-pointer align-middle accent-[var(--app-color-accent)]";

/** 左树上方「全部文件 / 未归类」两个固定入口的按钮样式（按当前 selectedId 高亮）。 */
function entryBtnClass(active: boolean) {
  return (
    "flex-1 rounded-twin-sm px-2 py-1.5 text-center text-[12px] transition " +
    (active
      ? "bg-[color-mix(in_srgb,var(--twin-link-deep)_10%,transparent)] font-medium text-[var(--twin-link-deep)]"
      : "text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]")
  );
}

/** 拖拽与文件选择器共用的类型白名单（唯一来源，别抄第二份）。 */
const ACCEPT_EXTENSIONS = ".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf";
const ACCEPTED_EXTS = new Set(ACCEPT_EXTENSIONS.split(","));

/** 从拖进来的文件里分出「能上传」和「被跳过」两拨。 */
function splitAcceptedFiles(files: File[]): { accepted: File[]; skipped: string[] } {
  const accepted: File[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    const i = f.name.lastIndexOf(".");
    const ext = i >= 0 ? "." + f.name.slice(i + 1).toLowerCase() : "";
    if (ACCEPTED_EXTS.has(ext)) accepted.push(f);
    else skipped.push(f.name);
  }
  return { accepted, skipped };
}

/** 逐条上传的成败结果。 */
type UploadResult = { name: string; ok: boolean; reason?: string };

export default function AdminFileTemplatesPage() {
  const role = authStorage.getRole();
  const currentUserId = authStorage.getUserId();
  const canUpload = hasMinRole(role, "STAFF");
  const queryClient = useQueryClient();

  /** selectedId 三态：null=全部文件、0=未归类、正整数=某文件夹，直接对应后端 folderId 参数 */
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [folderKeyword, setFolderKeyword] = useState("");
  const [fileKeyword, setFileKeyword] = useState("");
  const [rows, setRows] = useState<AdminFileTemplateRow[]>([]);
  /**
   * 上传中。Word/Excel 会在服务端用 LibreOffice 转 PDF，要好几秒 ——
   * 没有反馈的话用户会以为卡死，然后再点一次。
   */
  const [uploading, setUploading] = useState(false);
  /** 批量选择的文件 id。 */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** 行「移动」弹窗状态；moveParentId 为 null 表示「移到未归类」 */
  const [moveTarget, setMoveTarget] = useState<AdminFileTemplateRow | null>(null);
  const [moveParentId, setMoveParentId] = useState<number | null>(null);
  const [moveParentPath, setMoveParentPath] = useState("");

  // 待打清单：cart 只建一次 —— localFiles 存的是 File 对象，每次渲染重建会立刻丢。
  const [cart] = useState(() => createCart(window.localStorage));
  const [cartState, setCartState] = useState<CartState>(() => cart.getState());
  const cartCount = cartState.templateItems.length + cartState.localFiles.length;
  /** 上一次派发失败条目的原因（key → 原因），传给待打清单抽屉逐条展示。 */
  const [failReasons, setFailReasons] = useState<Record<string, string>>({});

  // ── 整页拖拽上传 ──
  /** 悬停中：非 null 表示文件正悬在页面上，count 是文件数（用于「松手即接受这 N 个」）。 */
  const [dragHover, setDragHover] = useState<{ count: number } | null>(null);
  /** dragenter/dragleave 进入-离开计数器，抵消子元素间移动时的反复触发（见 onDragEnter/onDragLeave）。 */
  const dragDepth = useRef(0);
  /** 松手后待决择的文件（弹窗开着）。 */
  const [dropBatch, setDropBatch] = useState<{ files: File[]; skipped: string[] } | null>(null);
  const [batchPhase, setBatchPhase] = useState<"choose" | "running" | "done">("choose");
  const [batchProgress, setBatchProgress] = useState<{ done: number; results: UploadResult[] }>({ done: 0, results: [] });

  const { data: tree = [], isLoading: treeLoading } = useFileFolderTree();
  const createFolder = useCreateFileFolder();
  const updateFolder = useUpdateFileFolder();
  const deleteFolder = useDeleteFileFolder();

  const { data, isLoading } = useQuery({
    queryKey: ["adminFileTemplates", selectedId] as const,
    queryFn: async () => {
      const { rows, schemaHint } = await fetchAdminFileTemplates(selectedId);
      if (schemaHint) toast(schemaHint, { duration: 12000 });
      return rows;
    },
  });

  useEffect(() => {
    if (data) setRows(data);
  }, [data]);

  // 列表一变（refetch / 上传 / 删除）即清空选择，避免选到已不可见的行
  useEffect(() => {
    setSelectedIds(new Set());
  }, [rows]);

  /** folderId → 文件夹名，供表格「所在文件夹」列查表 */
  const folderNameMap = useMemo(() => {
    const map = new Map<number, string>();
    const walk = (nodes: FileFolderNode[]) => {
      for (const n of nodes) {
        map.set(n.id, n.name);
        if (n.children) walk(n.children);
      }
    };
    walk(tree);
    return map;
  }, [tree]);

  /** 文件搜索：纯前端筛选当前列表（后端无按名搜模板接口，且当前列表已是单个文件夹直属文件，量小） */
  const filteredRows = useMemo(() => {
    const k = fileKeyword.trim().toLowerCase();
    if (!k) return rows;
    return rows.filter((r) => r.originalName.toLowerCase().includes(k));
  }, [rows, fileKeyword]);

  const toggleFolder = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const canDeleteRow = (r: AdminFileTemplateRow) =>
    hasMinRole(role, "ADMIN") || (!!currentUserId && r.uploadedByUserId === currentUserId);

  /** 拖放总入口：只处理「树节点 → 树节点」的文件夹移动（文件移动走行内按钮） */
  const handleDndDrop = (active: DndRef, over: DndRef) => {
    if (active.kind !== "tree-node" || over.kind !== "tree-node") return;
    const draggedId = Number(active.id);
    const targetId = Number(over.id);
    const dragged = findPath(tree, draggedId).at(-1);
    const target = findPath(tree, targetId).at(-1);
    if (!dragged || !target) return;
    if (dragged.parentId === targetId) return; // 已经是同一个父节点，不用打扰
    if (collectDescendantIds(dragged).includes(targetId)) {
      toast.error("不能把文件夹移动到它自己的子文件夹里");
      return;
    }
    void (async () => {
      const ok = await appConfirm(`把「${dragged.name}」移动到「${target.name}」下？`, { title: "移动文件夹" });
      if (!ok) return;
      updateFolder.mutate({ id: draggedId, payload: { parentId: targetId } });
    })();
  };

  /** 只认 OS 拖进来的文件；拖文字/链接/树节点（dnd-kit 指针拖拽）都不触发。 */
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const onDragEnter = (e: React.DragEvent) => {
    if (!canUpload || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragHover({ count: e.dataTransfer?.items?.length ?? 0 });
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!canUpload || !hasFiles(e)) return;
    e.preventDefault(); // 不 preventDefault 浏览器会把文件当页面直接打开
    e.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragHover(null);
    }
  };

  const closeDrop = () => {
    setDropBatch(null);
    setBatchPhase("choose");
    setBatchProgress({ done: 0, results: [] });
  };

  const onDrop = (e: React.DragEvent) => {
    if (!canUpload || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragHover(null);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const { accepted, skipped } = splitAcceptedFiles(files);
    if (accepted.length === 0) {
      toast.error(
        skipped.length ? `没有可上传的文件（已跳过 ${skipped.length} 个：${skipped.join("、")}）` : "没有可上传的文件",
      );
      return;
    }
    setBatchPhase("choose");
    setBatchProgress({ done: 0, results: [] });
    setDropBatch({ files: accepted, skipped });
  };

  /**
   * 串行逐条上传模板库文件：逐条成败、某条失败不打断整批。
   * onProgress 每传完一条回调一次，供拖拽弹窗逐条刷新进度；文件选择器路径不传。
   */
  const uploadFilesToLibrary = async (files: File[], onProgress?: (done: number, results: UploadResult[]) => void) => {
    const folderId = selectedId && selectedId > 0 ? selectedId : null;
    const results: UploadResult[] = [];
    const addedRows: AdminFileTemplateRow[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const row = await uploadAdminFileTemplate(f, "TEMPLATE", false, folderId);
        results.push({ name: f.name, ok: true });
        addedRows.push(row);
      } catch (err) {
        results.push({ name: f.name, ok: false, reason: err instanceof Error ? err.message : "上传失败" });
      }
      onProgress?.(i + 1, [...results]);
    }
    if (addedRows.length) setRows((prev) => [...addedRows, ...prev]);
    queryClient.invalidateQueries({ queryKey: queryKeys.fileFolder.all });
    return results;
  };

  /** 拖拽弹窗里的「上传到模板库」：复用同一条串行批量，只多一层弹窗进度态。 */
  const onUploadBatch = async () => {
    if (!dropBatch) return;
    setBatchPhase("running");
    setBatchProgress({ done: 0, results: [] });
    const results = await uploadFilesToLibrary(dropBatch.files, (done, r) => setBatchProgress({ done, results: r }));
    setBatchPhase("done");
    const fail = results.filter((r) => !r.ok).length;
    if (fail > 0) toast.error(`成功 ${results.length - fail} 条，失败 ${fail} 条`);
    else toast.success(`已上传 ${results.length} 条`);
  };

  /** 临时打印：直接进待打清单（复用 printCart），不落模板库。 */
  const onTempPrintBatch = () => {
    if (!dropBatch) return;
    const next = cart.addLocalFiles(dropBatch.files);
    setCartState(next);
    toast.success(`已加入待打清单 ${dropBatch.files.length} 项`);
    closeDrop();
  };

  /** 文件选择器「上传模板」（单/多选）：转成批量后走同一条串行逻辑；单选=长度 1 的批量。 */
  const onUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const { accepted, skipped } = splitAcceptedFiles(files);
    if (accepted.length === 0) {
      toast.error(
        skipped.length ? `没有可上传的文件（已跳过 ${skipped.length} 个：${skipped.join("、")}）` : "没有可上传的文件",
      );
      return;
    }
    if (skipped.length) toast(`已跳过 ${skipped.length} 个不支持的文件`);
    setUploading(true);
    try {
      const results = await uploadFilesToLibrary(accepted);
      const fail = results.filter((r) => !r.ok).length;
      if (fail > 0) toast.error(`成功 ${results.length - fail} 条，失败 ${fail} 条`);
      else toast.success(results.length === 1 ? "已上传" : `已上传 ${results.length} 条`);
    } finally {
      setUploading(false);
    }
  };

  /** 文件选择器「临时打印」（单/多选）：跟拖拽「临时打印」分支同一条路，直接进待打清单。 */
  const onTempPrintFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const { accepted, skipped } = splitAcceptedFiles(files);
    if (accepted.length === 0) {
      toast.error(
        skipped.length ? `没有可打印的文件（已跳过 ${skipped.length} 个：${skipped.join("、")}）` : "没有可打印的文件",
      );
      return;
    }
    if (skipped.length) toast(`已跳过 ${skipped.length} 个不支持的文件`);
    const next = cart.addLocalFiles(accepted);
    setCartState(next);
    toast.success(`已加入待打清单 ${accepted.length} 项`);
  };

  const onDownload = async (r: AdminFileTemplateRow) => {
    try {
      const { blob, fileName } = await downloadAdminFileTemplateBlob(r.id, r.originalName);
      triggerBlobDownload(blob, fileName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "下载失败");
    }
  };

  const onDelete = async (id: string) => {
    if (!await appConfirm("确认删除该模板？")) return;
    try {
      await deleteAdminFileTemplate(id);
      setRows((prev) => prev.filter((x) => x.id !== id));
      queryClient.invalidateQueries({ queryKey: queryKeys.fileFolder.all });
      toast.success("已删除");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const onMoveRow = async (r: AdminFileTemplateRow, targetId: number | null) => {
    try {
      await moveAdminFileTemplate(r.id, targetId);
      toast.success("已移动");
      queryClient.invalidateQueries({ queryKey: ["adminFileTemplates"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.fileFolder.all });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "移动失败");
    }
  };

  const openMove = (r: AdminFileTemplateRow) => {
    setMoveTarget(r);
    setMoveParentId(null);
    setMoveParentPath("");
  };

  const closeMove = () => {
    setMoveTarget(null);
    setMoveParentId(null);
    setMoveParentPath("");
  };

  const confirmMove = () => {
    if (!moveTarget) return;
    void onMoveRow(moveTarget, moveParentId);
    closeMove();
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.id));

  const addSelectedToCart = () => {
    const items: PrintItem[] = rows
      .filter((r) => selectedIds.has(r.id))
      .map((r) => ({ sourceType: "ADMIN_FILE", sourceId: r.id, fileName: r.originalName }));
    const before = cartState.templateItems.length;
    const next = cart.addTemplateItems(items);
    setCartState(next);
    setSelectedIds(new Set());
    const added = next.templateItems.length - before;
    if (added > 0) toast.success(`已加入待打清单 ${added} 项`);
    else toast("所选文件已在待打清单中");
  };

  return (
    <AdminPageShell>
      <DndScope onDrop={handleDndDrop}>
        <div
          className="flex h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[320px] flex-col gap-3"
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="flex min-h-0 flex-1 gap-3">
            {/* ════════ 左：文件夹树 ════════ */}
            <div className="flex w-[236px] shrink-0 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-sm">
              <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--twin-hairline)] px-3 py-2 text-[11px] font-medium text-[var(--twin-mute)]">
                <Folder className="h-3 w-3 shrink-0" /> 文件夹
              </div>
              <div className="mx-3 mb-1 mt-2 flex shrink-0 items-center gap-1.5 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5">
                <Search className="h-3 w-3 shrink-0 text-[var(--twin-mute)]" />
                <input
                  value={folderKeyword}
                  onChange={(e) => setFolderKeyword(e.target.value)}
                  placeholder="搜索文件夹…"
                  className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--twin-ink)] outline-none placeholder:text-[var(--twin-mute)]"
                />
              </div>
              <div className="flex shrink-0 gap-1 px-3 pb-1.5 pt-0.5">
                <button type="button" onClick={() => setSelectedId(null)} className={entryBtnClass(selectedId === null)}>
                  全部文件
                </button>
                <button type="button" onClick={() => setSelectedId(0)} className={entryBtnClass(selectedId === 0)}>
                  未归类
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-2">
                {treeLoading ? (
                  <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">加载中…</div>
                ) : (
                  <FileFolderTree
                    tree={tree}
                    selectedId={selectedId}
                    expanded={expanded}
                    keyword={folderKeyword}
                    onSelect={setSelectedId}
                    onToggle={toggleFolder}
                    onCreateRoot={(name) => createFolder.mutate({ name })}
                    onCreateChild={(parentId, name) => createFolder.mutate({ parentId, name })}
                    onRename={(id, name) => updateFolder.mutate({ id, payload: { name } })}
                    onMove={(id, parentId) => updateFolder.mutate({ id, payload: { parentId } })}
                    onDelete={(id) => deleteFolder.mutate(id)}
                    onSetIcon={(id, icon) => updateFolder.mutate({ id, payload: { icon } })}
                  />
                )}
              </div>
            </div>

            {/* ════════ 右：文件列表 ════════ */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-sm">
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--twin-hairline)] px-3 py-2">
                {canUpload ? (
                  <>
                    <label
                      className={
                        "inline-flex items-center gap-2 rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)] " +
                        (uploading ? "cursor-wait opacity-70" : "cursor-pointer")
                      }
                    >
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {uploading ? "正在转换文档…" : "上传模板"}
                      <input
                        type="file"
                        className="hidden"
                        disabled={uploading}
                        accept={ACCEPT_EXTENSIONS}
                        multiple
                        onChange={(ev) => void onUploadFiles(ev)}
                      />
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]">
                      <Printer className="h-4 w-4" />
                      临时打印
                      <input
                        type="file"
                        className="hidden"
                        accept={ACCEPT_EXTENSIONS}
                        multiple
                        onChange={onTempPrintFiles}
                      />
                    </label>
                    <PrintQueueButton />
                  </>
                ) : null}
                <div className="ml-auto flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5">
                    <Search className="h-3 w-3 shrink-0 text-[var(--twin-mute)]" />
                    <input
                      value={fileKeyword}
                      onChange={(e) => setFileKeyword(e.target.value)}
                      placeholder="搜索文件…"
                      className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--twin-ink)] outline-none placeholder:text-[var(--twin-mute)]"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={cartCount === 0}
                    className="inline-flex items-center gap-2 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setDrawerOpen(true)}
                  >
                    <ClipboardList className="h-4 w-4" />
                    待打清单
                    <span className="rounded-full bg-[var(--twin-primary)] px-1.5 text-[11px] font-medium leading-5 text-[var(--twin-on-primary)]">
                      {cartCount}
                    </span>
                  </button>
                </div>
              </div>

              {selectedIds.size > 0 ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2">
                  <span className="text-xs text-[var(--twin-body)]">已选 {selectedIds.size} 项</span>
                  <div className="ml-auto flex items-center gap-2">
                    <AdminButton type="button" tone="secondary" size="sm" onClick={addSelectedToCart}>
                      加入待打清单
                    </AdminButton>
                    <AdminButton type="button" tone="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                      取消选择
                    </AdminButton>
                  </div>
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
                <AdminDataTableWrap scrollable>
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[var(--twin-canvas-soft)] text-xs text-[var(--twin-body)]">
                      <tr>
                        <th className="w-[2.5rem] px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label="全选"
                            checked={allSelected}
                            ref={(el) => { if (el) el.indeterminate = !allSelected && selectedIds.size > 0; }}
                            onChange={() => setSelectedIds(allSelected ? new Set() : new Set(filteredRows.map((r) => r.id)))}
                            className={CHECKBOX}
                          />
                        </th>
                        <th className="px-3 py-2">文件名</th>
                        <th className="px-3 py-2">所在文件夹</th>
                        <th className="px-3 py-2">大小</th>
                        <th className="px-3 py-2">上传时间</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((r) => (
                        <tr key={r.id} className="border-t border-[var(--twin-hairline)]">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              aria-label={`选择 ${r.originalName}`}
                              checked={selectedIds.has(r.id)}
                              onChange={() => toggleSelect(r.id)}
                              className={CHECKBOX}
                            />
                          </td>
                          <td className="max-w-[20rem] truncate px-3 py-2 font-medium text-[var(--twin-ink)]" title={r.originalName}>
                            {r.originalName}
                          </td>
                          <td className="px-3 py-2 text-[var(--twin-body)]">
                            {r.folderId != null ? folderNameMap.get(r.folderId) ?? "未归类" : "未归类"}
                          </td>
                          <td className="px-3 py-2 text-[var(--twin-body)]">{fmtBytes(r.sizeBytes)}</td>
                          <td className="px-3 py-2 text-xs text-[var(--twin-body)]">{fmtTime(r.createTime)}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <PrintButton
                                sourceType="ADMIN_FILE"
                                sourceId={r.id}
                                fileName={r.originalName}
                              />
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--twin-link-deep)]"
                                onClick={() => void onDownload(r)}
                              >
                                <Download className="h-3.5 w-3.5" />
                                下载
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--twin-link-deep)]"
                                onClick={() => openMove(r)}
                              >
                                <ArrowRightLeft className="h-3.5 w-3.5" />
                                移动
                              </button>
                              {canDeleteRow(r) ? (
                                <AdminSensitiveAction label="删除文件模板" visibilityMinRole="MEMBER" configureMinRole="SUPER_ADMIN">
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-red-600"
                                    onClick={() => void onDelete(r.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    删除
                                  </button>
                                </AdminSensitiveAction>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {isLoading ? <DataSkeleton variant="table" rows={4} /> : null}
                  {!isLoading && !filteredRows.length ? (
                    <EmptyState title={fileKeyword.trim() ? "没有匹配的文件" : "暂无模板"} />
                  ) : null}
                </AdminDataTableWrap>
              </div>
            </div>
          </div>
        </div>
      </DndScope>

      {/* 行「移动」弹窗 */}
      {moveTarget ? (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeMove}>
            <div
              className="w-full max-w-md rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-[var(--twin-ink)]">移动文件</h3>
              <p className="mt-2 text-sm text-[var(--twin-body)]">将「{moveTarget.originalName}」移动到：</p>
              <div className="mt-3">
                <FileFolderTreeSelect
                  value={moveParentPath}
                  onChange={(path, nodeId) => {
                    setMoveParentPath(path);
                    setMoveParentId(nodeId);
                  }}
                  placeholder="选择目标文件夹"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setMoveParentPath("未归类");
                  setMoveParentId(null);
                }}
                className={
                  "mt-2 rounded-twin-sm border px-2 py-1 text-xs transition " +
                  (moveParentPath === "未归类" && moveParentId == null
                    ? "border-[var(--twin-link-deep)] text-[var(--twin-link-deep)]"
                    : "border-[var(--twin-hairline)] text-[var(--twin-body)]")
                }
              >
                移到未归类
              </button>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]"
                  onClick={closeMove}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)] disabled:opacity-50"
                  disabled={!moveParentPath}
                  onClick={confirmMove}
                >
                  确认移动
                </button>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {/* 整页拖入悬停的高亮遮罩（pointer-events-none 只做视觉，拖拽事件仍落在下面容器上） */}
      {dragHover ? (
        <Portal>
          <div className="pointer-events-none fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center bg-[color-mix(in_srgb,var(--twin-primary)_12%,transparent)] p-4">
            <div className="flex flex-col items-center gap-3 rounded-twin-xl border-2 border-dashed border-[var(--twin-primary)] bg-[var(--twin-canvas)] px-10 py-8 shadow-twin-level-3">
              <Upload className="h-8 w-8 text-[var(--twin-primary)]" />
              <div className="text-base font-medium text-[var(--twin-ink)]">
                {dragHover.count > 0 ? `松手即接受这 ${dragHover.count} 个文件` : "松手即接受文件"}
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {/* 拖拽落下的决择弹窗：上传到模板库 / 临时打印；上传时切到逐条进度 */}
      <Dialog
        open={dropBatch !== null}
        onOpenChange={(open) => {
          if (!open && batchPhase === "running") return; // 上传中不许关
          if (!open) closeDrop();
        }}
      >
        <DialogContent
          className="max-w-md"
          showClose={batchPhase !== "running"}
          closeOnOverlayClick={batchPhase !== "running"}
        >
          <DialogHeader>
            <DialogTitle>
              {batchPhase === "choose" ? "拖入了文件" : batchPhase === "running" ? "正在上传" : "上传完成"}
            </DialogTitle>
            <DialogDescription>
              {dropBatch?.files.length === 1 ? dropBatch.files[0].name : `共 ${dropBatch?.files.length} 个文件`}
            </DialogDescription>
          </DialogHeader>

          {dropBatch?.skipped.length ? (
            <p className="rounded-md border-l-4 border-[color-mix(in_srgb,var(--app-color-feedback-warning)_50%,transparent)] bg-[color-mix(in_srgb,var(--app-color-feedback-warning)_10%,transparent)] px-3 py-2 text-[12px] leading-relaxed text-[var(--app-color-text-secondary)]">
              已跳过 {dropBatch.skipped.length} 个：{dropBatch.skipped.join("、")}
            </p>
          ) : null}

          {batchPhase === "running" ? (
            <p className="text-[13px] text-[var(--app-color-text-secondary)]">
              第 {batchProgress.done + 1}/{dropBatch?.files.length} 个：{dropBatch?.files[batchProgress.done]?.name} 上传中…
            </p>
          ) : null}

          {/* 文件清单 / 逐条进度：沿用派发弹窗那套逐条列表的样式，不另造一套 */}
          <div className="max-h-[45vh] min-h-[150px] overflow-y-auto rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2">
            <ul className="space-y-1">
              {dropBatch?.files.map((f, i) => {
                const r = batchProgress.results[i];
                const isCurrent = batchPhase === "running" && i === batchProgress.done;
                return (
                  <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-[var(--app-color-text-primary)]">
                    <span className="mt-0.5 shrink-0">
                      {r ? (
                        r.ok ? (
                          <CheckCircle2 className="size-3.5 text-[var(--app-color-feedback-success)]" />
                        ) : (
                          <XCircle className="size-3.5 text-[var(--app-color-feedback-error)]" />
                        )
                      ) : isCurrent ? (
                        <Loader2 className="size-3.5 animate-spin text-[var(--app-color-text-tertiary)]" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="break-all">{f.name}</span>
                      {r && !r.ok ? (
                        <span className="mt-0.5 block text-[12px] text-[var(--app-color-feedback-error)]">{r.reason}</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {batchPhase === "done" ? (
            <p className="text-[13px] text-[var(--app-color-text-secondary)]">
              成功 {batchProgress.results.filter((r) => r.ok).length} 条，失败{" "}
              {batchProgress.results.filter((r) => !r.ok).length} 条
            </p>
          ) : null}

          {batchPhase !== "running" ? (
            <DialogFooter>
              {batchPhase === "choose" ? (
                <>
                  <button
                    type="button"
                    className="rounded-md border border-[var(--app-color-border-default)] px-3 py-1.5 text-sm text-[var(--app-color-text-primary)]"
                    onClick={closeDrop}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-[var(--app-color-border-default)] px-3 py-1.5 text-sm text-[var(--app-color-text-primary)]"
                    onClick={onTempPrintBatch}
                  >
                    临时打印
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-[var(--twin-primary)] px-3 py-1.5 text-sm font-medium text-[var(--twin-on-primary)]"
                    onClick={() => void onUploadBatch()}
                  >
                    上传到模板库
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="rounded-md bg-[var(--twin-primary)] px-3 py-1.5 text-sm font-medium text-[var(--twin-on-primary)]"
                  onClick={closeDrop}
                >
                  完成
                </button>
              )}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <PrintCartDrawer
        cart={cart}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onChanged={() => setCartState(cart.getState())}
        failReasons={failReasons}
        setFailReasons={setFailReasons}
      />
    </AdminPageShell>
  );
}
