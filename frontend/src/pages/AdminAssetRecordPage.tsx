import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Archive, Download, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { AutoImage } from "@/components/ui/AutoImage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearAssetTable,
  createAssetColumn,
  exportAssetExcel,
  fetchAssetFacets,
  patchAssetRecord,
  searchAssets,
  type AssetRecycleRow,
  type AssetColumnDef,
  type AssetFacets,
  type AssetRow,
} from "@/api/domains/asset.api";
import {
  useAssetList,
  useCreateAsset,
  useDeleteAsset,
  useImportAssetExcel,
  useAssetRecycle,
  useRestoreAssetRecycle,
  usePurgeAssetRecycle,
} from "@/api/hooks/useAsset";
import { queryKeys } from "@/api/hooks/queryKeys";
import AssetTransferApplyModal from "@/components/asset/AssetTransferApplyModal";
import { Portal } from "@/components/Portal";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCh(v: string): number {
  const m = String(v).match(/^([\d.]+)ch$/);
  return m ? parseFloat(m[1]) : 14;
}

function calcColumnWidth(header: string, samples: Array<string | number | undefined | null>, minCh = 8, maxCh = 60) {
  let maxLen = Array.from(String(header || "")).length;
  for (const sample of samples) {
    const text = sample == null ? "" : String(sample).replace(/\s+/g, " ").trim();
    const len = Array.from(text).length;
    if (len > maxLen) maxLen = len;
  }
  const ch = Math.min(maxCh, Math.max(minCh, Math.ceil(maxLen * 1.15) + 2));
  return `${ch}ch`;
}

function normalizeColumnLabel(label: string) {
  const text = String(label || "").trim();
  if (/^存放地点\d+$/i.test(text)) return "当前存放地点";
  return text;
}

function parseTransferPhotoUrls(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    try {
      const j = JSON.parse(s) as unknown;
      if (Array.isArray(j)) return j.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
    } catch {
      return [s];
    }
  }
  return [];
}

function transferStatusLabel(s: string | undefined) {
  if (s === "IN_PROGRESS") return "进行中";
  if (s === "COMPLETED" || s === "SUBMITTED") return "转移完毕";
  return s || "-";
}

export default function AdminAssetRecordPage() {
  type DeleteCandidate = Pick<AssetRow, "id" | "assetCode" | "assetName" | "location" | "status" | "locked">;
  const [page, setPage] = useState(1);
  const [size] = useState(200);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [assetName, setAssetName] = useState("__ALL__");
  const [user, setUser] = useState("__ALL__");
  const [model, setModel] = useState("__ALL__");
  const [appliedAssetName, setAppliedAssetName] = useState("");
  const [appliedUser, setAppliedUser] = useState("");
  const [appliedModel, setAppliedModel] = useState("");
  const [campus, setCampus] = useState("");
  const [appliedCampus, setAppliedCampus] = useState("");
  const [sortBy, setSortBy] = useState("updateTime");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetRow | null>(null);
  const [detailAsset, setDetailAsset] = useState<AssetRow | null>(null);
  const [detailImagePreview, setDetailImagePreview] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteKeyword, setDeleteKeyword] = useState("");
  const [deleteCandidates, setDeleteCandidates] = useState<DeleteCandidate[]>([]);
  const [selectedDeleteId, setSelectedDeleteId] = useState("");
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [recycleKeyword, setRecycleKeyword] = useState("");
  const [recyclePage, setRecyclePage] = useState(1);
  const [widthProfile, setWidthProfile] = useState<{
    assetCode: string;
    assetName: string;
    latestTransferTime: string;
    actions: string;
    dynamic: Record<string, string>;
  } | null>(null);
  const [tableEditMode, setTableEditMode] = useState(false);
  const [columnWidthOverrides, setColumnWidthOverrides] = useState<Record<string, string>>({});
  const importInputRef = useRef<HTMLInputElement>(null);

  // --- 表头拖拽调节列宽 ---
  const resizeState = useRef<{
    columnKey: string;
    startX: number;
    startWidthCh: number;
  } | null>(null);

  const onResizeMouseDown = (e: React.MouseEvent, columnKey: string, currentWidthCh: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizeState.current = { columnKey, startX: e.clientX, startWidthCh: currentWidthCh };
    document.addEventListener("mousemove", onResizeMouseMove);
    document.addEventListener("mouseup", onResizeMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const onResizeMouseMove = (e: MouseEvent) => {
    if (!resizeState.current) return;
    const { columnKey, startX, startWidthCh } = resizeState.current;
    const deltaPx = e.clientX - startX;
    // 1ch ≈ 8px in most monospace contexts, use a rough conversion
    const deltaCh = Math.round(deltaPx / 8);
    const newWidthCh = Math.max(6, startWidthCh + deltaCh);
    setColumnWidthOverrides((prev) => ({
      ...prev,
      [columnKey]: `${newWidthCh}ch`,
    }));
  };

  const onResizeMouseUp = () => {
    resizeState.current = null;
    document.removeEventListener("mousemove", onResizeMouseMove);
    document.removeEventListener("mouseup", onResizeMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  const resolveColWidth = (columnKey: string, defaultCh: string) =>
    columnWidthOverrides[columnKey] ?? defaultCh;
  // ---

  const normalizeAll = (value: string) => (value === "__ALL__" ? "" : value);

  const queryParams = useMemo(() => ({
    page,
    size,
    keyword: appliedKeyword || undefined,
    campus: appliedCampus || undefined,
    assetName: appliedAssetName || undefined,
    user: appliedUser || undefined,
    model: appliedModel || undefined,
    sortBy,
    sortDirection,
  }), [page, size, appliedKeyword, appliedCampus, appliedAssetName, appliedUser, appliedModel, sortBy, sortDirection]);

  const { data: assetData, isLoading } = useAssetList(queryParams);
  const rows = assetData?.rows ?? [];
  const total = assetData?.total ?? 0;
  const columns = assetData?.columns ?? [];

  const { data: facetsData } = useQuery({
    queryKey: [...queryKeys.asset.all, "facets", appliedKeyword, appliedCampus, appliedAssetName, appliedUser, appliedModel] as const,
    queryFn: () => fetchAssetFacets({
      keyword: appliedKeyword || undefined,
      campus: appliedCampus || undefined,
      assetName: appliedAssetName || undefined,
      user: appliedUser || undefined,
      model: appliedModel || undefined,
    }),
    placeholderData: (prev) => prev,
  });
  const facets: AssetFacets = facetsData ?? { assetNames: [], campuses: [], users: [], models: [] };

  const { data: recycleData } = useAssetRecycle({ page: recyclePage, size: 20, keyword: recycleKeyword.trim() || undefined });
  const recycleRows: AssetRecycleRow[] = recycleData?.rows ?? [];
  const recycleTotal = recycleData?.total ?? 0;

  const qc = useQueryClient();
  const createAssetMut = useCreateAsset();
  const deleteAssetMut = useDeleteAsset();
  const importAssetMut = useImportAssetExcel();
  const restoreRecycleMut = useRestoreAssetRecycle();
  const purgeRecycleMut = usePurgeAssetRecycle();

  useEffect(() => {
    const names = facets.assetNames || [];
    const users = facets.users || [];
    const models = facets.models || [];
    if (assetName !== "__ALL__" && !names.includes(assetName)) setAssetName("__ALL__");
    if (user !== "__ALL__" && !users.includes(user)) setUser("__ALL__");
    if (model !== "__ALL__" && !models.includes(model)) setModel("__ALL__");
  }, [facets]);

  const editableColumns = useMemo(
    () =>
      columns.filter((c) => {
        const label = (c.columnLabel || "").trim();
        if (label === "资产编号" || label === "资产编码") return false;
        if (c.columnKey === "col_资产编号" || c.columnKey === "col_资产编码") return false;
        // 移入详情弹窗
        if (label === "申请转移时间" || label === "申请转移地点" || label === "申请人" || label === "申请备注") return false;
        if (label === "数量" || label === "单价" || label === "价值" || label === "记账日期" || label === "资产类别") return false;
        if (label === "是否锁定") return false;
        if (label.includes("规格型号") || label.includes("型号")) return false;
        return true;
      }),
    [columns]
  );

  const pages = Math.max(1, Math.ceil(total / size));

  const detailAfterPhotoUrls = useMemo(
    () => (detailAsset ? parseTransferPhotoUrls(detailAsset.latestTransferPhotoUrlsAfter) : []),
    [detailAsset]
  );

  const detailBeforePhotoUrls = useMemo(
    () => (detailAsset ? parseTransferPhotoUrls(detailAsset.latestTransferPhotoUrlsBefore) : []),
    [detailAsset]
  );

  const detailAssetPhotos = useMemo(
    () => (detailAsset ? parseTransferPhotoUrls(detailAsset.photoUrls) : []),
    [detailAsset]
  );

  const widths = useMemo(() => {
    const base = widthProfile ?? {
      assetCode: "14ch",
      assetName: "20ch",
      latestTransferTime: "16ch",
      actions: "16ch",
      dynamic: Object.fromEntries(editableColumns.map((c) => [c.columnKey, "14ch"])),
    };
    return {
      assetCode: resolveColWidth("assetCode", base.assetCode),
      assetName: resolveColWidth("assetName", base.assetName),
      latestTransferTime: resolveColWidth("latestTransferTime", base.latestTransferTime),
      actions: resolveColWidth("actions", base.actions),
      dynamic: Object.fromEntries(
        editableColumns.map((c) => [c.columnKey, resolveColWidth(c.columnKey, base.dynamic[c.columnKey] ?? "14ch")])
      ),
    };
  }, [widthProfile, editableColumns, columnWidthOverrides]);

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDirection("asc");
    }
    setPage(1);
  };

  const applySearch = () => {
    setAppliedKeyword(keyword.trim());
    setAppliedCampus(campus);
    setAppliedAssetName(assetName === "__ALL__" ? "" : assetName);
    setAppliedUser(user === "__ALL__" ? "" : user);
    setAppliedModel(model === "__ALL__" ? "" : model);
    setPage(1);
  };

  // Debounced auto-search: 输入即搜，选择即搜，无需手动点击查询按钮
  useEffect(() => {
    const timer = setTimeout(() => {
      applySearch();
    }, 400);
    return () => clearTimeout(timer);
  }, [keyword, campus, assetName, user, model]);

  const resetSearch = () => {
    setKeyword("");
    setCampus("");
    setAssetName("__ALL__");
    setUser("__ALL__");
    setModel("__ALL__");
    setAppliedKeyword("");
    setAppliedCampus("");
    setAppliedAssetName("");
    setAppliedUser("");
    setAppliedModel("");
    setPage(1);
  };

  const applyColumnWidths = (showToast = false) => {
    const dynamic: Record<string, string> = {};
    for (const c of editableColumns) {
      dynamic[c.columnKey] = calcColumnWidth(
        c.columnLabel,
        rows.map((r) => r.dynamicValues?.[c.columnKey]),
        8,
        80
      );
    }
    setWidthProfile({
      assetCode: calcColumnWidth("资产编码", rows.map((r) => r.assetCode), 10, 40),
      assetName: calcColumnWidth("资产名称", rows.map((r) => r.assetName), 12, 80),
      latestTransferTime: calcColumnWidth("转移时间", rows.map((r) => r.latestTransferTime), 14, 30),
      actions: "16ch",
      dynamic,
    });
    if (showToast) {
      toast.success("已按当前内容刷新列宽");
    }
  };

  const refreshColumnWidths = () => {
    applyColumnWidths(true);
  };

  useEffect(() => {
    if (!rows.length && !editableColumns.length) return;
    applyColumnWidths(false);
  }, [rows, editableColumns]);

  const onImport = async (file?: File) => {
    if (!file) return;
    try {
      await importAssetMut.mutateAsync(file);
    } catch {
      // error handled by mutation
    }
  };

  const onExport = async () => {
    try {
      const blob = await exportAssetExcel({
        keyword: appliedKeyword || undefined,
        campus: appliedCampus || undefined,
        assetName: appliedAssetName || undefined,
        user: appliedUser || undefined,
        model: appliedModel || undefined,
      });
      downloadBlob(blob, `asset-records-${Date.now()}.xlsx`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    }
  };

  const onAddColumn = async () => {
    const label = window.prompt("请输入新增表头名称");
    if (!label || !label.trim()) return;
    try {
      await createAssetColumn(label.trim());
      toast.success("新增表头成功");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "新增失败");
    }
  };

  const openAddModal = () => {
    const initial: Record<string, string> = { assetCode: "", assetName: "" };
    for (const c of editableColumns) {
      initial[c.columnKey] = "";
    }
    setAddForm(initial);
    setAddOpen(true);
  };

  const submitAddAsset = async () => {
    const assetCode = (addForm.assetCode || "").trim();
    const newAssetName = (addForm.assetName || "").trim();
    if (!assetCode || !newAssetName) {
      toast.error("资产编号和资产名称不能为空");
      return;
    }
    const dynamicValues: Record<string, string> = {};
    for (const c of editableColumns) {
      dynamicValues[c.columnKey] = (addForm[c.columnKey] || "").trim();
    }
    try {
      await createAssetMut.mutateAsync({ assetCode, assetName: newAssetName, dynamicValues });
      setAddOpen(false);
    } catch {
      // error handled by mutation
    }
  };

  const onClearTable = async () => {
    const ok = window.confirm("确认清空当前资产表格的所有内容（资产、动态列、申请记录）吗？此操作不可撤销。");
    if (!ok) return;
    try {
      const result = await clearAssetTable();
      toast.success(
        `已清空：资产${result.assetRows}条，动态列${result.dynamicColumns}条，申请${result.transferRequests}条`
      );
      setPage(1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "清空失败");
    }
  };

  const searchDeleteAssets = async () => {
    const kw = deleteKeyword.trim();
    if (!kw) {
      setDeleteCandidates([]);
      return;
    }
    try {
      const result = await searchAssets(kw, 30);
      setDeleteCandidates(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "检索资产失败");
    }
  };

  const confirmDeleteAsset = async () => {
    if (!selectedDeleteId) {
      toast.error("请先选择要删除的资产");
      return;
    }
    const row = deleteCandidates.find((x) => x.id === selectedDeleteId);
    const ok = window.confirm(`确认删除资产【${row?.assetCode || ""} ${row?.assetName || ""}】？删除后将进入回收站。`);
    if (!ok) return;
    try {
      await deleteAssetMut.mutateAsync(selectedDeleteId);
      setDeleteOpen(false);
      setDeleteKeyword("");
      setDeleteCandidates([]);
      setSelectedDeleteId("");
    } catch {
      // error handled by mutation
    }
  };

  const openRecycleModal = () => {
    setRecycleOpen(true);
    setRecyclePage(1);
  };

  const doRestore = async (id: string) => {
    try {
      await restoreRecycleMut.mutateAsync(id);
    } catch {
      // error handled by mutation
    }
  };

  const doPurge = async (id: string) => {
    const ok = window.confirm("确认彻底删除该资产？彻底删除后不可恢复。");
    if (!ok) return;
    try {
      await purgeRecycleMut.mutateAsync(id);
    } catch {
      // error handled by mutation
    }
  };

  const finishEditing = async () => {
    // Collect all rows with pending unsaved edits
    const pendingByRow = new Map<string, { row: AssetRow; dynamicValues: Record<string, string> }>();
    for (const [key, value] of Object.entries(editing)) {
      const sepIdx = key.indexOf("::");
      if (sepIdx < 0) continue;
      const rowId = key.slice(0, sepIdx);
      const columnKey = key.slice(sepIdx + 2);
      if (!pendingByRow.has(rowId)) {
        const row = rows.find((r) => r.id === rowId);
        if (!row) continue;
        pendingByRow.set(rowId, {
          row,
          dynamicValues: { ...(row.dynamicValues || {}) },
        });
      }
      pendingByRow.get(rowId)!.dynamicValues[columnKey] = value;
    }

    if (pendingByRow.size === 0) {
      setTableEditMode(false);
      return;
    }

    let saved = 0;
    const errors: string[] = [];
    for (const [, { row, dynamicValues }] of pendingByRow) {
      try {
        await patchAssetRecord(row.id, { dynamicValues });
        saved++;
      } catch (e) {
        errors.push(`${row.assetCode}: ${e instanceof Error ? e.message : "未知错误"}`);
      }
    }

    if (saved > 0) {
      toast.success(`已保存 ${saved} 条记录`);
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
    }
    if (errors.length > 0) {
      errors.forEach((msg) => toast.error(msg));
    }

    setEditing({});
    setTableEditMode(false);
  };

  return (
    <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <Archive className="h-6 w-6 shrink-0 text-[var(--twin-link-deep)]" aria-hidden />
          资产记录
        </span>
      }
      description="支持 CSV/Excel 导入、Excel 导出、动态表头、搜索修改，以及申请转移流程。"
      actions={
        <div className="flex min-w-0 flex-wrap justify-end gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="sr-only"
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              void onImport(f);
              e.currentTarget.value = "";
            }}
          />
          <AdminButton
            type="button"
            tone="secondary"
            className="inline-flex min-h-9 items-center gap-2"
            onClick={() => {
              setSelectedAsset(null);
              setModalOpen(true);
            }}
          >
            申请转移
          </AdminButton>
          <AdminButton type="button" tone="secondary" className="inline-flex min-h-9 items-center gap-2" onClick={openAddModal}>
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            新增资产
          </AdminButton>
          <AdminButton
            type="button"
            tone={tableEditMode ? "secondary" : "primary"}
            className="inline-flex min-h-9 items-center gap-2"
            onClick={() => {
              if (tableEditMode) {
                void finishEditing();
              } else {
                setTableEditMode(true);
              }
            }}
          >
            <Pencil className="h-4 w-4 shrink-0" aria-hidden />
            {tableEditMode ? "完成编辑" : "编辑表格"}
          </AdminButton>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 text-sm font-medium text-[var(--twin-ink)] outline-none transition-colors hover:bg-[var(--twin-canvas-soft)] focus-visible:ring-[3px] focus-visible:ring-[color:var(--admin-focus-ring)] disabled:pointer-events-none disabled:opacity-50">
              <MoreHorizontal className="h-4 w-4 shrink-0" />
              更多操作
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              <DropdownMenuLabel className="text-xs font-normal text-[var(--twin-mute)]">数据与维护</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  window.setTimeout(() => importInputRef.current?.click(), 0);
                }}
              >
                <Upload className="mr-2 inline h-4 w-4" />
                导入文件
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void onExport()}>
                <Download className="mr-2 inline h-4 w-4" />
                导出 Excel
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void onAddColumn()}>
                <Plus className="mr-2 inline h-4 w-4" />
                新增表头
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => refreshColumnWidths()}>刷新列宽</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void onClearTable()} className="text-rose-700 focus:text-rose-800">
                <Trash2 className="mr-2 inline h-4 w-4" />
                清空当前表格
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setDeleteKeyword("");
                  setDeleteCandidates([]);
                  setSelectedDeleteId("");
                  setDeleteOpen(true);
                }}
              >
                <Trash2 className="mr-2 inline h-4 w-4" />
                删除资产
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openRecycleModal()}>回收站</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-auto pb-2">
        <AdminFormCard title="筛选" description={`共 ${total} 条；列宽可随内容在「更多操作」中刷新。`}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex w-40 shrink-0 flex-col gap-1">
              <span className={adminLabelClass}>全局搜索</span>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
                className={adminInputClass}
                placeholder="编码/名称..."
              />
            </label>
            <label className="flex w-20 shrink-0 flex-col gap-1">
              <span className={adminLabelClass}>校区</span>
              <AdminSelect value={campus} onChange={(e) => setCampus(e.target.value)} className="w-full">
                <option value="">全部</option>
                <option value="浦东">浦东</option>
                <option value="浦西">浦西</option>
              </AdminSelect>
            </label>
            <label className="flex w-36 shrink-0 flex-col gap-1">
              <span className={adminLabelClass}>资产名称</span>
              <AdminSelect value={assetName} onChange={(e) => setAssetName(e.target.value)} className="w-full">
                <option value="__ALL__">全部</option>
                {facets.assetNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </AdminSelect>
            </label>
            <label className="flex w-28 shrink-0 flex-col gap-1">
              <span className={adminLabelClass}>使用人</span>
              <AdminSelect value={user} onChange={(e) => setUser(e.target.value)} className="w-full">
                <option value="__ALL__">全部</option>
                {(facets.users && facets.users.length ? facets.users : facets.campuses).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </AdminSelect>
            </label>
            <label className="flex w-36 shrink-0 flex-col gap-1">
              <span className={adminLabelClass}>规格型号</span>
              <AdminSelect value={model} onChange={(e) => setModel(e.target.value)} className="w-full">
                <option value="__ALL__">全部</option>
                {facets.models.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </AdminSelect>
            </label>
            <div className="flex shrink-0 items-end gap-2">
              <AdminButton type="button" onClick={applySearch} className="inline-flex items-center gap-1">
                <Search className="h-4 w-4" aria-hidden />
                查询
              </AdminButton>
              <AdminButton type="button" tone="secondary" onClick={resetSearch} className="inline-flex items-center gap-1">
                重置
              </AdminButton>
            </div>
          </div>
        </AdminFormCard>

        <AdminTableShell
          loading={isLoading}
          empty={!isLoading && rows.length === 0}
          emptyMessage="暂无资产数据，请先导入 CSV/Excel。"
          scrollable
          className="w-full min-w-0 overscroll-x-contain"
        >
          <table className="w-max min-w-full border-collapse text-sm">
            <colgroup>
              <col style={{ width: widths.assetCode }} />
              <col style={{ width: widths.assetName }} />
              {editableColumns.map((c) => (
                <col key={c.columnKey} style={{ width: widths.dynamic[c.columnKey] }} />
              ))}
              <col style={{ width: widths.actions }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-[var(--twin-canvas)]">
              <tr>
                <th className="border-b px-2 py-1.5 text-left whitespace-nowrap" style={{ position: "relative" }}>
                  资产编码
                  <span
                    onMouseDown={(e) => onResizeMouseDown(e, "assetCode", parseCh(widths.assetCode))}
                    style={{
                      position: "absolute", right: 0, top: 0, bottom: 0,
                      width: "8px", cursor: "col-resize",
                      borderRight: "2px solid transparent",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderRightColor = "var(--twin-hairline-strong, #cbd5e1)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderRightColor = "transparent")}
                  />
                </th>
                <th className="border-b px-2 py-1.5 text-left whitespace-nowrap" style={{ position: "relative" }}>
                  资产名称
                  <span
                    onMouseDown={(e) => onResizeMouseDown(e, "assetName", parseCh(widths.assetName))}
                    style={{
                      position: "absolute", right: 0, top: 0, bottom: 0,
                      width: "8px", cursor: "col-resize",
                      borderRight: "2px solid transparent",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderRightColor = "var(--twin-hairline-strong, #cbd5e1)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderRightColor = "transparent")}
                  />
                </th>
                {editableColumns.map((c: AssetColumnDef) => (
                  <th key={c.columnKey} className="border-b px-2 py-1.5 text-left whitespace-nowrap" style={{ position: "relative" }}>
                    <button className="underline decoration-dotted" onClick={() => toggleSort(c.columnKey)}>{normalizeColumnLabel(c.columnLabel)}</button>
                    <span
                      onMouseDown={(e) => onResizeMouseDown(e, c.columnKey, parseCh(widths.dynamic[c.columnKey] ?? "14ch"))}
                      style={{
                        position: "absolute", right: 0, top: 0, bottom: 0,
                        width: "8px", cursor: "col-resize",
                        borderRight: "2px solid transparent",
                        transition: "border-color 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderRightColor = "var(--twin-hairline-strong, #cbd5e1)")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderRightColor = "transparent")}
                    />
                  </th>
                ))}
                <th className="border-b px-2 py-1.5 text-left whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-[var(--twin-canvas-soft)]">
                  <td className="border-b px-2 py-1.5 font-mono text-xs">{r.assetCode}</td>
                  <td className="border-b px-2 py-1.5">{r.assetName}</td>
                  {editableColumns.map((c) => {
                    const key = `${r.id}::${c.columnKey}`;
                    const display = editing[key] ?? r.dynamicValues?.[c.columnKey] ?? "";
                    return (
                      <td key={key} className="border-b px-2 py-1.5">
                        {tableEditMode ? (
                          <input
                            value={display}
                            onChange={(e) => setEditing((prev) => ({ ...prev, [key]: e.target.value }))}
                            className="w-full min-w-[14ch] rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-xs"
                            style={{ width: "100%", minWidth: "10ch" }}
                          />
                        ) : (
                          <span className="block min-w-0 max-w-[48ch] truncate text-[var(--twin-ink)]" title={String(display)}>
                            {display === "" ? <span className="text-[var(--twin-mute)]">—</span> : display}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="border-b px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <AdminButton
                        type="button"
                        tone="secondary"
                        size="sm"
                        onClick={() => setDetailAsset(r)}
                        className="border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                      >
                        详情
                      </AdminButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableShell>

        <div className="flex items-center justify-end gap-3 text-sm text-[var(--twin-body)]">
          <AdminButton type="button" tone="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            上一页
          </AdminButton>
          <span>
            第 {page} / {pages} 页，共 {total} 条
          </span>
          <AdminButton type="button" tone="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            下一页
          </AdminButton>
        </div>

        <AssetTransferApplyModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          initialAsset={selectedAsset}
          onSuccess={async () => {
            // query invalidation is handled by useCreateAssetTransfer hook internally
          }}
        />
        {addOpen && (
          <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-h-[85vh] max-w-3xl overflow-auto rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">新增资产</h3>
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-sm text-[var(--twin-body)]" onClick={() => setAddOpen(false)}>
                  关闭
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                  资产编号
                  <input
                    value={addForm.assetCode || ""}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, assetCode: e.target.value }))}
                    className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
                    placeholder="请输入资产编号"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                  资产名称
                  <input
                    value={addForm.assetName || ""}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, assetName: e.target.value }))}
                    className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
                    placeholder="请输入资产名称"
                  />
                </label>
                {editableColumns.map((c) => (
                  <label key={`create-${c.columnKey}`} className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                    {normalizeColumnLabel(c.columnLabel)}
                    <input
                      value={addForm[c.columnKey] || ""}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, [c.columnKey]: e.target.value }))}
                      className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]" onClick={() => setAddOpen(false)}>
                  取消
                </button>
                <button className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]" onClick={() => void submitAddAsset()}>
                  确认新增
                </button>
              </div>
            </div>
            </div>
          </Portal>
        )}
        {deleteOpen && (
          <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">删除资产（移入回收站）</h3>
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-sm text-[var(--twin-body)]" onClick={() => setDeleteOpen(false)}>
                  关闭
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={deleteKeyword}
                  onChange={(e) => setDeleteKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void searchDeleteAssets()}
                  className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
                  placeholder="输入资产编码/名称检索"
                />
                <button onClick={() => void searchDeleteAssets()} className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]">检索</button>
              </div>
              <div className="mt-3 max-h-64 overflow-auto rounded-twin-sm border border-[var(--twin-hairline)]">
                {deleteCandidates.map((row) => (
                  <label key={row.id} className="flex cursor-pointer items-center gap-2 border-b border-[var(--twin-hairline)] px-3 py-2 text-sm last:border-b-0">
                    <input
                      type="radio"
                      checked={selectedDeleteId === row.id}
                      onChange={() => setSelectedDeleteId(row.id)}
                    />
                    <span className="font-mono text-xs text-[var(--twin-body)]">{row.assetCode}</span>
                    <span className="text-[var(--twin-ink)]">{row.assetName}</span>
                    <span className="text-[var(--twin-mute)]">{row.location || "-"}</span>
                  </label>
                ))}
                {!deleteCandidates.length && <div className="px-3 py-6 text-center text-sm text-[var(--twin-mute)]">暂无结果</div>}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]" onClick={() => setDeleteOpen(false)}>
                  取消
                </button>
                <button className="rounded-twin-sm bg-red-600 px-3 py-2 text-sm font-medium text-white" onClick={() => void confirmDeleteAsset()}>
                  确认删除
                </button>
              </div>
            </div>
            </div>
          </Portal>
        )}
        {recycleOpen && (
          <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-h-[85vh] max-w-3xl overflow-auto rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">回收站</h3>
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-sm text-[var(--twin-body)]" onClick={() => setRecycleOpen(false)}>
                  关闭
                </button>
              </div>
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={recycleKeyword}
                  onChange={(e) => setRecycleKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setRecyclePage(1)}
                  className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
                  placeholder="检索回收站资产"
                />
                <button onClick={() => setRecyclePage(1)} className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]">查询</button>
              </div>
              <div className="overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--twin-canvas-soft)]">
                    <tr>
                      <th className="px-3 py-2 text-left">资产编码</th>
                      <th className="px-3 py-2 text-left">资产名称</th>
                      <th className="px-3 py-2 text-left">删除时间</th>
                      <th className="px-3 py-2 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recycleRows.map((row) => (
                      <tr key={row.id} className="border-t border-[var(--twin-hairline)]">
                        <td className="px-3 py-2 font-mono text-xs">{row.assetCode}</td>
                        <td className="px-3 py-2">{row.assetName}</td>
                        <td className="px-3 py-2 text-[var(--twin-body)]">{row.deletedTime ? String(row.deletedTime).replace("T", " ").slice(0, 19) : "-"}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700" onClick={() => void doRestore(row.id)}>
                              恢复
                            </button>
                            <button className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700" onClick={() => void doPurge(row.id)}>
                              彻底删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!recycleRows.length && (
                      <tr>
                        <td className="px-3 py-8 text-center text-[var(--twin-mute)]" colSpan={4}>回收站为空</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-end gap-3 text-sm text-[var(--twin-body)]">
                <button
                  disabled={recyclePage <= 1}
                  onClick={() => setRecyclePage((p) => Math.max(1, p - 1))}
                  className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 disabled:opacity-40"
                >
                  上一页
                </button>
                <span>第 {recyclePage} 页，共 {recycleTotal} 条</span>
                <button
                  disabled={recyclePage * 20 >= recycleTotal}
                  onClick={() => setRecyclePage((p) => p + 1)}
                  className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            </div>
            </div>
          </Portal>
        )}
        {detailAsset && (
          <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">资产详情</h3>
                <button
                  type="button"
                  className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-sm text-[var(--twin-body)]"
                  onClick={() => {
                    setDetailImagePreview(null);
                    setDetailAsset(null);
                  }}
                >
                  关闭
                </button>
              </div>
              <div className="space-y-2 text-sm text-[var(--twin-body)]">
                <div><span className="text-[var(--twin-mute)]">资产编码：</span>{detailAsset.assetCode || "-"}</div>
                <div><span className="text-[var(--twin-mute)]">资产名称：</span>{detailAsset.assetName || "-"}</div>
                <div><span className="text-[var(--twin-mute)]">当前存放地点：</span>{detailAsset.location || "-"}</div>
                <div><span className="text-[var(--twin-mute)]">是否锁定：</span>{detailAsset.locked === 1 ? "已锁定" : "未锁定"}</div>
                {(() => {
                  const dynEntries = Object.entries(detailAsset.dynamicValues || {}).filter(([, v]) => v && String(v).trim());
                  if (!dynEntries.length) return null;
                  const modelCol = columns.find((c) => (c.columnLabel || "").includes("规格型号") || (c.columnLabel || "").includes("型号"));
                  return (
                    <div className="pt-2">
                      <hr className="my-2 border-[var(--twin-hairline)]" />
                      <div className="text-xs font-semibold text-[var(--twin-mute)] uppercase tracking-wide">详细字段</div>
                      {modelCol && dynEntries.some(([k]) => k === modelCol.columnKey) && (
                        <div className="mt-1"><span className="text-[var(--twin-mute)]">规格型号：</span>
                          <span className="break-all">{detailAsset.dynamicValues[modelCol.columnKey] || "-"}</span>
                        </div>
                      )}
                      {dynEntries.filter(([k]) => !modelCol || k !== modelCol.columnKey).map(([key, val]) => {
                        const colDef = columns.find((c) => c.columnKey === key);
                        const label = colDef ? (colDef.columnLabel || key) : key;
                        return (
                          <div key={key} className="mt-1"><span className="text-[var(--twin-mute)]">{label}：</span>
                            <span className="break-all">{String(val)}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {detailAssetPhotos.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[var(--twin-mute)]">资产照片（转移前参考）</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {detailAssetPhotos.map((u) => (
                        <button
                          key={u}
                          type="button"
                          className="h-20 w-20 overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-0"
                          onClick={() => setDetailImagePreview(u)}
                        >
                          <AutoImage src={u} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {detailAsset.latestTransferRequestId && (
                  <>
                    <hr className="my-2 border-[var(--twin-hairline)]" />
                    <div className="text-xs font-semibold text-[var(--twin-mute)] uppercase tracking-wide">转移记录</div>
                    <div><span className="text-[var(--twin-mute)]">申请单号：</span>{detailAsset.latestTransferRequestId}</div>
                    <div><span className="text-[var(--twin-mute)]">转移状态：</span>{transferStatusLabel(detailAsset.latestTransferStatus)}</div>
                    <div><span className="text-[var(--twin-mute)]">申请人：</span>{detailAsset.latestTransferApplicant || "-"}</div>
                    <div><span className="text-[var(--twin-mute)]">转移时间：</span>{detailAsset.latestTransferTime ? String(detailAsset.latestTransferTime).replace("T", " ").slice(0, 19) : "-"}</div>
                    <div><span className="text-[var(--twin-mute)]">转移地点：</span>{detailAsset.latestTransferLocation || "-"}</div>
                    <div><span className="text-[var(--twin-mute)]">上次存放地点：</span>{detailAsset.latestTransferFromLocation || "-"}</div>
                    <div><span className="text-[var(--twin-mute)]">转移备注：</span>{detailAsset.latestTransferRemark || "-"}</div>
                  </>
                )}
                {detailBeforePhotoUrls.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[var(--twin-mute)]">转移前照片</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {detailBeforePhotoUrls.map((u) => (
                        <button
                          key={u}
                          type="button"
                          className="h-20 w-20 overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-0"
                          onClick={() => setDetailImagePreview(u)}
                        >
                          <AutoImage src={u} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {detailAfterPhotoUrls.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[var(--twin-mute)]">转移后照片</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {detailAfterPhotoUrls.map((u) => (
                        <button
                          key={u}
                          type="button"
                          className="h-20 w-20 overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-0"
                          onClick={() => setDetailImagePreview(u)}
                        >
                          <AutoImage src={u} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
          </Portal>
        )}
        {detailImagePreview && (
          <Portal>
            <button
              type="button"
              className="fixed inset-0 z-[60] flex cursor-default items-center justify-center border-0 bg-black/80 p-4"
              onClick={() => setDetailImagePreview(null)}
              aria-label="关闭预览"
            >
              <AutoImage src={detailImagePreview} alt="" className="max-h-[90vh] max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
            </button>
          </Portal>
        )}
      </div>
    </AdminPageShell>
  );
}
