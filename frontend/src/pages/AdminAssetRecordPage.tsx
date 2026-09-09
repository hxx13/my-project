import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ArrowDown, ArrowRightLeft, ArrowUp, Download, EyeOff, ImageIcon, Loader2, MoreHorizontal, Pencil, Plus, ScanLine, Search, Trash2, Upload, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearAssetTable,
  createAssetColumn,
  exportAssetExcel,
  fetchAssetFacets,
  fetchImportBatches,
  patchAssetRecord,
  previewImportAssets,
  confirmImportAssets,
  batchDeleteAssets,
  batchUpdateAssets,
  batchMoveAssetLocation,
  searchReplaceAssets,
  deleteByBatchId,
  searchAssets,
  type ImportPreview,
  type ImportLocationMapping,
  type ImportBatch,
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
  useBatchDeleteAssets,
  useBatchUpdateAssets,
  useSearchReplaceAssets,
  useDeleteByBatchId,
} from "@/api/hooks/useAsset";
import { queryKeys } from "@/api/hooks/queryKeys";
import AssetTransferApplyModal from "@/components/asset/AssetTransferApplyModal";
import MobileScanDialog from "@/pages/mobile/MobileScanDialog";
import AssetVisualView from "@/features/asset/AssetVisualView";
import AssetDetailDrawer from "@/features/asset/AssetDetailDrawer";
import AssetLocationSelect from "@/features/asset/AssetLocationSelect";
import { AssetLocationTreeSelect } from "@/features/asset/AssetLocationTreeSelect";
import {
  ASSET_CAMPUS_OPTIONS,
  ASSET_STATUS_OPTIONS,
  assetStatusLabel,
  assetEditableFields,
  isCampusColumn,
  isLocationColumn,
} from "@/features/asset/assetEditableFields";
import { findPath } from "@/features/asset/locationTreeUtils";
import { useAssetLocationTree } from "@/api/hooks/useAssetLocation";
import type { AssetLocationNode } from "@/api/domains/assetLocation.api";
import { Portal } from "@/components/Portal";
import { AutoImage } from "@/components/ui/AutoImage";
import EmojiPicker from "@/components/ui/EmojiPicker";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { AdminSearchSelect } from "@/components/admin/AdminSearchSelect";
import { adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { appConfirm, appPrompt } from "@/lib/appDialog";

/** 存放地点修正的哨兵选项：新建同名顶层节点（清空输入框 = 不关联） */
const NEW_LOCATION_NODE = "（新建同名节点）";

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
  return text; // 不再把"存放地点N"映射为"当前存放地点"
}

export default function AdminAssetRecordPage() {
  type DeleteCandidate = Pick<AssetRow, "id" | "assetCode" | "assetName" | "location" | "status" | "locked">;
  const [view, setView] = useState<"table" | "graph">("table");
  /** 扫码弹窗开关 */
  const [scanOpen, setScanOpen] = useState(false);
  /** 图形视图的扫码请求：seq 变化即视为一次新扫描 */
  const [scanRequest, setScanRequest] = useState<{ text: string; seq: number } | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(200);
  const [pageInput, setPageInput] = useState("1");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [assetName, setAssetName] = useState("");
  const [user, setUser] = useState("");
  const [model, setModel] = useState("");
  const [location, setLocation] = useState("");
  const [appliedAssetName, setAppliedAssetName] = useState("");
  const [appliedUser, setAppliedUser] = useState("");
  const [appliedModel, setAppliedModel] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");
  const [campus, setCampus] = useState("");
  const [appliedCampus, setAppliedCampus] = useState("");
  const [sortBy, setSortBy] = useState("assetCode");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetRow | null>(null);
  const [detailAsset, setDetailAsset] = useState<AssetRow | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, string>>({});
  // 新增资产的图标 / 照片（随提交一起写入）
  const [addIcon, setAddIcon] = useState("");
  const [addPhotos, setAddPhotos] = useState<string[]>([]);
  const [addIconPickerOpen, setAddIconPickerOpen] = useState(false);
  const [addUploading, setAddUploading] = useState(false);
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
    status: string;
    latestTransferTime: string;
    actions: string;
    dynamic: Record<string, string>;
  } | null>(null);
  const [tableEditMode, setTableEditMode] = useState(false);
  const [columnWidthOverrides, setColumnWidthOverrides] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  /** 批量转移：勾选资产 → 选目标地点 → 批量移入 */
  const [batchMoveOpen, setBatchMoveOpen] = useState(false);
  const [batchMoveTargetId, setBatchMoveTargetId] = useState<number | null>(null);
  const [batchMoveTarget, setBatchMoveTarget] = useState("");
  const [searchReplaceOpen, setSearchReplaceOpen] = useState(false);
  const [batchHistoryOpen, setBatchHistoryOpen] = useState(false);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [importPreviewData, setImportPreviewData] = useState<ImportPreview | null>(null);
  /** 存放地点修正：原始 text -> 选中的地点全路径（哨兵值见 NEW_LOCATION_NODE） */
  const [importLocationSel, setImportLocationSel] = useState<Record<string, string>>({});
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [batchEditColumnKey, setBatchEditColumnKey] = useState("");
  const [batchEditValue, setBatchEditValue] = useState("");
  const [searchReplaceColumnKey, setSearchReplaceColumnKey] = useState("");
  const [exportPickerOpen, setExportPickerOpen] = useState(false);
  const [exportColumnsChecked, setExportColumnsChecked] = useState<Record<string, boolean>>({});
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [searchReplaceSearch, setSearchReplaceSearch] = useState("");
  const [searchReplaceReplace, setSearchReplaceReplace] = useState("");
  const [searchReplaceMode, setSearchReplaceMode] = useState<"exact" | "contains" | "startsWith">("exact");
  const [batchHistoryPage, setBatchHistoryPage] = useState(1);
  const [batchHistoryData, setBatchHistoryData] = useState<{ rows: ImportBatch[]; total: number }>({ rows: [], total: 0 });
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

  // 组件卸载时清理拖拽监听器，防止内存泄漏
  useEffect(() => {
    return () => {
      if (resizeState.current) {
        document.removeEventListener("mousemove", onResizeMouseMove);
        document.removeEventListener("mouseup", onResizeMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
  }, []);

  const resolveColWidth = (columnKey: string, defaultCh: string) =>
    columnWidthOverrides[columnKey] ?? defaultCh;
  // ---

  const queryParams = useMemo(() => ({
    page,
    size,
    keyword: appliedKeyword || undefined,
    campus: appliedCampus || undefined,
    assetName: appliedAssetName || undefined,
    user: appliedUser || undefined,
    model: appliedModel || undefined,
    location: appliedLocation || undefined,
    sortBy,
    sortDirection,
  }), [page, size, appliedKeyword, appliedCampus, appliedAssetName, appliedUser, appliedModel, appliedLocation, sortBy, sortDirection]);

  const { data: assetData, isLoading } = useAssetList(queryParams);
  const rows = assetData?.rows ?? [];
  const total = assetData?.total ?? 0;
  const columns = assetData?.columns ?? [];

  const { data: facetsData } = useQuery({
    queryKey: [...queryKeys.asset.all, "facets", appliedKeyword, appliedCampus, appliedAssetName, appliedUser, appliedModel, appliedLocation] as const,
    queryFn: () => fetchAssetFacets({
      keyword: appliedKeyword || undefined,
      campus: appliedCampus || undefined,
      assetName: appliedAssetName || undefined,
      user: appliedUser || undefined,
      model: appliedModel || undefined,
      location: appliedLocation || undefined,
    }),
    placeholderData: (prev) => prev,
  });
  const facets: AssetFacets = facetsData ?? { assetNames: [], campuses: [], users: [], models: [], locations: [] };

  const { data: recycleData } = useAssetRecycle({ page: recyclePage, size: 20, keyword: recycleKeyword.trim() || undefined });
  const recycleRows: AssetRecycleRow[] = recycleData?.rows ?? [];
  const recycleTotal = recycleData?.total ?? 0;

  const qc = useQueryClient();
  const createAssetMut = useCreateAsset();
  const deleteAssetMut = useDeleteAsset();
  const importAssetMut = useImportAssetExcel();
  const restoreRecycleMut = useRestoreAssetRecycle();
  const purgeRecycleMut = usePurgeAssetRecycle();
  const batchDeleteMut = useBatchDeleteAssets();
  const batchUpdateMut = useBatchUpdateAssets();
  const searchReplaceMut = useSearchReplaceAssets();
  const deleteByBatchMut = useDeleteByBatchId();

  // ── 导入预览：存放地点修正 ──
  const { data: locationTree = [] } = useAssetLocationTree();
  const locationOptions = useMemo(() => {
    const out: { id: number; label: string }[] = [];
    const walk = (nodes: AssetLocationNode[], prefix: string) => {
      nodes.forEach((n) => {
        const label = prefix ? `${prefix} / ${n.name}` : n.name;
        out.push({ id: n.id, label });
        walk(n.children ?? [], label);
      });
    };
    walk(locationTree, "");
    return out;
  }, [locationTree]);
  const locationLabels = useMemo(() => locationOptions.map((o) => o.label), [locationOptions]);
  const locationLabelToId = useMemo(() => new Map(locationOptions.map((o) => [o.label, o.id])), [locationOptions]);
  const locationPathLabel = (nodeId: number) => findPath(locationTree, nodeId).map((n) => n.name).join(" / ");
  const importLocValues = importPreviewData?.locationValues ?? [];
  const importLocMatched = importLocValues.filter((v) => v.matchedNodeId != null).length;
  const importWarnings = importPreviewData?.warnings ?? [];

  const editableColumns = useMemo(() => assetEditableFields(columns).dynamic, [columns]);

  const pages = Math.max(1, Math.ceil(total / size));

  const widths = useMemo(() => {
    const base = widthProfile ?? {
      assetCode: "14ch",
      assetName: "20ch",
      status: "8ch",
      latestTransferTime: "16ch",
      actions: "16ch",
      dynamic: Object.fromEntries(editableColumns.map((c) => [c.columnKey, "14ch"])),
    };
    return {
      assetCode: resolveColWidth("assetCode", base.assetCode),
      assetName: resolveColWidth("assetName", base.assetName),
      status: resolveColWidth("status", base.status),
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

  const sortHeader = (field: string, label: string) => (
    <button
      type="button"
      onClick={() => toggleSort(field)}
      className="inline-flex items-center gap-1 hover:text-[var(--app-color-text-primary)]"
      title="点击切换排序"
    >
      {label}
      {sortBy === field ? (
        sortDirection === "asc" ? (
          <ArrowUp className="h-3 w-3 shrink-0" aria-hidden />
        ) : (
          <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
        )
      ) : null}
    </button>
  );

  const applySearch = () => {
    setAppliedKeyword(keyword.trim());
    setAppliedCampus(campus);
    setAppliedAssetName(assetName.trim());
    setAppliedUser(user.trim());
    setAppliedModel(model.trim());
    setAppliedLocation(location.trim());
    setPage(1);
  };

  // Debounced auto-search: 输入即搜，选择即搜，无需手动点击查询按钮
  useEffect(() => {
    const timer = setTimeout(() => {
      applySearch();
    }, 400);
    return () => clearTimeout(timer);
  }, [keyword, campus, assetName, user, model, location]);

  const resetSearch = () => {
    setKeyword("");
    setCampus("");
    setAssetName("");
    setUser("");
    setModel("");
    setLocation("");
    setAppliedKeyword("");
    setAppliedCampus("");
    setAppliedAssetName("");
    setAppliedUser("");
    setAppliedModel("");
    setAppliedLocation("");
    setPage(1);
  };

  // 换页/换筛选条件后清空勾选，避免批量删除误伤不在当前结果里的行
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, size, appliedKeyword, appliedCampus, appliedAssetName, appliedUser, appliedModel, appliedLocation]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const jumpToPage = () => {
    const n = Number(pageInput);
    if (!Number.isFinite(n)) {
      setPageInput(String(page));
      return;
    }
    setPage(Math.min(pages, Math.max(1, Math.round(n))));
  };

  const hasActiveFilter = Boolean(
    appliedKeyword || appliedCampus || appliedAssetName || appliedUser || appliedModel || appliedLocation
  );

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
      status: calcColumnWidth("状态", rows.map((r) => r.status), 6, 16),
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
      const preview = await previewImportAssets(file);
      setImportPreviewData(preview);
      setImportLocationSel(buildLocationDefaults(preview));
      setPendingImportFile(file);
      setImportPreviewOpen(true);
    } catch {
      // error handled by mutation — fallback to direct import
      try {
        await importAssetMut.mutateAsync(file);
      } catch {
        // error handled by mutation
      }
    }
  };

  /** 默认选择：自动匹配到的节点全路径；未匹配/树未加载时默认「新建同名节点」 */
  const buildLocationDefaults = (preview: ImportPreview): Record<string, string> => {
    const next: Record<string, string> = {};
    for (const v of preview.locationValues ?? []) {
      next[v.text] =
        v.matchedNodeId != null
          ? locationPathLabel(v.matchedNodeId) || v.matchedNodeName || NEW_LOCATION_NODE
          : NEW_LOCATION_NODE;
    }
    return next;
  };

  /** 选择值 -> 提交映射：哨兵新建 / 空=不关联 / 全路径 -> nodeId（手输未命中时退回自动匹配结果） */
  const buildLocationMappings = (): ImportLocationMapping[] =>
    (importPreviewData?.locationValues ?? []).map((v) => {
      const sel = importLocationSel[v.text] ?? "";
      if (sel === NEW_LOCATION_NODE) return { text: v.text, create: true };
      if (!sel) return { text: v.text, nodeId: null };
      return { text: v.text, nodeId: locationLabelToId.get(sel) ?? v.matchedNodeId ?? null };
    });

  const doConfirmImport = async () => {
    if (!importPreviewData) return;
    try {
      const res = await confirmImportAssets(importPreviewData.previewId, undefined, buildLocationMappings());
      toast.success(res.locationLinked ? `导入完成，已关联地点 ${res.locationLinked} 条` : "导入完成");
      setImportPreviewOpen(false);
      setImportPreviewData(null);
      setImportLocationSel({});
      setPendingImportFile(null);
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入确认失败");
    }
  };

  const fixedExportLabels = ["资产编码", "资产名称", "状态", "存放地点", "标注", "是否锁定", "申请转移时间", "申请转移地点", "申请人", "申请备注"];

  const buildExportCols = (): Record<string, boolean> => {
    const m: Record<string, boolean> = {};
    fixedExportLabels.forEach((l) => { m[l] = true; });
    (columns || []).forEach((c) => {
      const label = c.columnLabel || "";
      if (label && !fixedExportLabels.includes(label)) m[label] = true;
    });
    return m;
  };

  const getSavedExportCols = (): string[] | null => {
    try { const s = localStorage.getItem("assetExportCols"); return s ? JSON.parse(s) as string[] : null; } catch { return null; }
  };

  const saveExportCols = (cols: string[]) => { try { localStorage.setItem("assetExportCols", JSON.stringify(cols)); } catch { /* ignore */ } };

  const runExport = async (cols: string[]) => {
    try {
      const blob = await exportAssetExcel({
        keyword: appliedKeyword || undefined, campus: appliedCampus || undefined,
        assetName: appliedAssetName || undefined, user: appliedUser || undefined,
        model: appliedModel || undefined, location: appliedLocation || undefined,
        columns: cols.join(","),
      });
      downloadBlob(blob, `asset-records-${Date.now()}.xlsx`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "导出失败"); }
  };

  const openExportPicker = () => { setExportConfirmOpen(true); };

  const onConfirmExport = () => {
    setExportConfirmOpen(false);
    const saved = getSavedExportCols();
    if (saved) { runExport(saved); } else { runExport(Object.keys(buildExportCols())); }
  };

  const onOpenConfig = () => {
    setExportConfirmOpen(false);
    const saved = getSavedExportCols();
    if (saved) {
      const m = buildExportCols();
      Object.keys(m).forEach((k) => { m[k] = saved.includes(k); });
      setExportColumnsChecked(m);
    } else {
      setExportColumnsChecked(buildExportCols());
    }
    setExportPickerOpen(true);
  };

  const onSaveConfig = () => {
    const selected = Object.entries(exportColumnsChecked).filter(([, v]) => v).map(([k]) => k);
    if (!selected.length) { toast.error("请至少选择一列"); return; }
    saveExportCols(selected);
    setExportPickerOpen(false);
    toast.success("导出配置已保存");
  };

  const onAddColumn = async () => {
    const label = await appPrompt("请输入新增表头名称");
    if (!label || !label.trim()) return;
    try {
      await createAssetColumn(label.trim());
      toast.success("新增表头成功");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "新增失败");
    }
  };

  /** 扫码结果：原文当关键词。表格视图直接走全局搜索框；图形视图交给 AssetVisualView 定位+高亮 */
  const handleScanResult = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    if (view === "table") {
      setKeyword(text);
      setScanOpen(false);
      return;
    }
    setScanRequest({ text, seq: Date.now() });
    setScanOpen(false);
  };

  const openAddModal = () => {
    const initial: Record<string, string> = { assetCode: "", assetName: "" };
    for (const c of editableColumns) {
      initial[c.columnKey] = "";
    }
    setAddForm(initial);
    setAddIcon("");
    setAddPhotos([]);
    setAddOpen(true);
  };

  const onAddUploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setAddUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        const res = await uploadSingleImage(f);
        const url = res.publicUrl || res.url || "";
        if (url) urls.push(url);
      }
      if (urls.length) {
        setAddPhotos((prev) => [...prev, ...urls]);
        toast.success(`已上传 ${urls.length} 张照片`);
      } else {
        toast.error("上传失败");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setAddUploading(false);
    }
  };

  const submitAddAsset = async () => {
    const assetCode = (addForm.assetCode || "").trim();
    const newAssetName = (addForm.assetName || "").trim();
    if (!assetCode || !newAssetName) {
      toast.error("资产编号和资产名称不能为空");
      return;
    }
    const dynamicValues: Record<string, string> = {};
    // 地点列同时写固定字段 location：后端据它回填 location_node_id（并同步 EAV 列）
    let locationText: string | undefined;
    for (const c of editableColumns) {
      const v = (addForm[c.columnKey] || "").trim();
      dynamicValues[c.columnKey] = v;
      if (v && isLocationColumn(c)) locationText = v;
    }
    try {
      await createAssetMut.mutateAsync({
        assetCode,
        assetName: newAssetName,
        dynamicValues,
        ...(addIcon ? { icon: addIcon } : {}),
        photoUrls: JSON.stringify(addPhotos),
        ...(locationText !== undefined ? { location: locationText } : {}),
      });
      setAddOpen(false);
    } catch {
      // error handled by mutation
    }
  };

  const onClearTable = async () => {
    const ok = await appConfirm("确认清空当前资产表格的所有内容（资产、动态列、申请记录）吗？此操作不可撤销。");
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
    const ok = await appConfirm(`确认删除资产【${row?.assetCode || ""} ${row?.assetName || ""}】？删除后将进入回收站。`);
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
    const ok = await appConfirm("确认彻底删除该资产？彻底删除后不可恢复。");
    if (!ok) return;
    try {
      await purgeRecycleMut.mutateAsync(id);
    } catch {
      // error handled by mutation
    }
  };

  // ── 批量操作 ──

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const doBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    try {
      await batchDeleteMut.mutateAsync(ids);
      setSelectedIds(new Set());
      setBatchDeleteOpen(false);
    } catch {
      // error handled by mutation
    }
  };

  const doBatchEdit = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length || !batchEditColumnKey) return;
    try {
      await batchUpdateMut.mutateAsync({
        ids,
        columnKey: batchEditColumnKey,
        dynamicValues: { [batchEditColumnKey]: batchEditValue },
      });
      setSelectedIds(new Set());
      setBatchEditOpen(false);
    } catch {
      // error handled by mutation
    }
  };

  /** 批量转移：把勾选的资产一次性移到所选地点（直接调接口，自行汇报失败明细） */
  const doBatchMove = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length || batchMoveTargetId == null) return;
    const node = { id: batchMoveTargetId, label: batchMoveTarget || "目标地点" };
    try {
      const res = await batchMoveAssetLocation({ ids, nodeId: node.id });
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
      const failed = res.failed ?? [];
      if (failed.length === 0) {
        toast.success(`已转移 ${res.moved} 台到「${node.label}」`);
      } else {
        const codeOf = (id: string) => rows.find((r) => r.id === id)?.assetCode ?? id;
        toast.error(
          `成功 ${res.moved} 台，失败 ${failed.length} 台（${failed.map((f) => `${codeOf(f.id)}：${f.reason}`).join("；")}）`,
          { duration: 6000 }
        );
      }
      setSelectedIds(new Set());
      setBatchMoveOpen(false);
      setBatchMoveTargetId(null);
      setBatchMoveTarget("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量转移失败");
    }
  };

  const doSearchReplace = async () => {    if (!searchReplaceColumnKey || !searchReplaceSearch) return;
    try {
      await searchReplaceMut.mutateAsync({
        columnKey: searchReplaceColumnKey,
        search: searchReplaceSearch,
        replace: searchReplaceReplace,
        matchMode: searchReplaceMode,
      });
      setSearchReplaceOpen(false);
    } catch {
      // error handled by mutation
    }
  };

  const doDeleteByBatch = async (batchId: string) => {
    try {
      await deleteByBatchMut.mutateAsync(batchId);
      loadBatchHistory(batchHistoryPage);
    } catch {
      // error handled by mutation
    }
  };

  const loadBatchHistory = async (page: number) => {
    try {
      const data = await fetchImportBatches(page, 20);
      setBatchHistoryData(data);
      setBatchHistoryPage(page);
    } catch {
      // silent
    }
  };

  const openBatchHistory = () => {
    setBatchHistoryOpen(true);
    loadBatchHistory(1);
  };

  // ── 列显隐 ──

  const toggleColumnHidden = (columnKey: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnKey)) next.delete(columnKey); else next.add(columnKey);
      return next;
    });
  };

  const showAllColumns = () => setHiddenColumns(new Set());

  const finishEditing = async () => {
    // Collect all rows with pending unsaved edits（key = `${rowId}::${fieldKey}`）
    const colByKey = new Map(columns.map((c) => [c.columnKey, c]));
    const pendingByRow = new Map<
      string,
      { row: AssetRow; assetName?: string; status?: string; location?: string; dynamicValues: Record<string, string> }
    >();
    for (const [key, value] of Object.entries(editing)) {
      const sepIdx = key.indexOf("::");
      if (sepIdx < 0) continue;
      const rowId = key.slice(0, sepIdx);
      const fieldKey = key.slice(sepIdx + 2);
      if (!pendingByRow.has(rowId)) {
        const row = rows.find((r) => r.id === rowId);
        if (!row) continue;
        pendingByRow.set(rowId, {
          row,
          dynamicValues: { ...(row.dynamicValues || {}) },
        });
      }
      const entry = pendingByRow.get(rowId)!;
      if (fieldKey === "assetName") entry.assetName = value;
      else if (fieldKey === "status") entry.status = value;
      else {
        entry.dynamicValues[fieldKey] = value;
        const col = colByKey.get(fieldKey);
        // 地点列同时写固定字段 location，后端据它回填 location_node_id
        if (col && isLocationColumn(col)) entry.location = value;
      }
    }

    if (pendingByRow.size === 0) {
      setTableEditMode(false);
      return;
    }

    // 资产名称不允许清空（与抽屉编辑弹层一致）
    for (const { row, assetName } of pendingByRow.values()) {
      if (assetName !== undefined && !assetName.trim()) {
        toast.error(`${row.assetCode}: 资产名称不能为空`);
        return;
      }
    }

    const patches = Array.from(pendingByRow.entries()).map(([, { row, assetName, status, location, dynamicValues }]) => {
      const payload: { assetName?: string; status?: string; location?: string; dynamicValues: Record<string, string> } = { dynamicValues };
      if (assetName !== undefined) payload.assetName = assetName.trim();
      if (status !== undefined) payload.status = status.trim();
      if (location !== undefined) payload.location = location.trim();
      return [row.id, payload] as const;
    });
    const results = await Promise.allSettled(
      patches.map(([id, body]) => patchAssetRecord(id, body))
    );

    let saved = 0;
    const errors: string[] = [];
    patches.forEach(([id], idx) => {
      const result = results[idx];
      const row = rows.find((r) => r.id === id);
      if (result.status === "fulfilled") {
        saved++;
      } else {
        errors.push(`${row?.assetCode || id}: ${result.reason instanceof Error ? result.reason.message : "未知错误"}`);
      }
    });

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
    <AdminPageShell>
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
    <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--twin-hairline)] pb-2">
          <div className="flex items-center gap-0.5 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-0.5">
            <button type="button" onClick={() => setView("table")}
              className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${view === "table" ? "bg-[var(--twin-link-deep)] text-white shadow-sm" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
              表格
            </button>
            <button type="button" onClick={() => setView("graph")}
              className={`rounded-twin-md px-2.5 py-1 text-[11px] font-semibold transition ${view === "graph" ? "bg-[var(--twin-link-deep)] text-white shadow-sm" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
              图形
            </button>
          </div>

          {view === "table" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="w-44">
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applySearch()}
                  className={adminInputClass}
                  placeholder="编码/名称/地点/备注"
                />
              </div>
              <AdminSelect value={campus} onChange={(e) => setCampus(e.target.value)} className="w-24">
                <option value="">校区：全部</option>
                <option value="浦东">浦东</option>
                <option value="浦西">浦西</option>
              </AdminSelect>
              <div className="w-36"><AdminSearchSelect value={assetName} onChange={setAssetName} options={facets.assetNames} placeholder="资产名称" className="w-full" /></div>
              <div className="w-28"><AdminSearchSelect value={user} onChange={setUser} options={facets.users ?? []} placeholder="使用人" className="w-full" /></div>
              <div className="w-40"><AdminSearchSelect value={location} onChange={setLocation} options={facets.locations ?? []} placeholder="存放地点" className="w-full" /></div>
              <div className="w-36"><AdminSearchSelect value={model} onChange={setModel} options={facets.models} placeholder="规格型号" className="w-full" /></div>
              <button
                type="button"
                onClick={resetSearch}
                className="h-9 shrink-0 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 text-xs text-[var(--twin-mute)] transition hover:text-[var(--twin-ink)]"
              >
                重置
              </button>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
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
            <AdminButton
              type="button"
              tone="secondary"
              className="inline-flex min-h-9 items-center gap-2"
              onClick={() => setScanOpen(true)}
            >
              <ScanLine className="h-4 w-4 shrink-0" aria-hidden />
              扫码
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
                <DropdownMenuItem onSelect={() => openExportPicker()}>
                  <Download className="mr-2 inline h-4 w-4" />
                  选择导出列…
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
                <DropdownMenuItem
                  onSelect={() => {
                    setSearchReplaceColumnKey("");
                    setSearchReplaceSearch("");
                    setSearchReplaceReplace("");
                    setSearchReplaceMode("exact");
                    setSearchReplaceOpen(true);
                  }}
                >
                  查找替换
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openBatchHistory()}>按批次删除</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openRecycleModal()}>回收站</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {view === "table" && selectedIds.size > 0 && (
          <div className="shrink-0 mb-2 flex flex-wrap items-center gap-2 rounded-twin-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] px-3 py-2 text-sm">
            <span className="text-[var(--app-color-text-secondary)]">已选 <strong className="text-[var(--app-color-text-primary)]">{selectedIds.size}</strong> 项</span>
            <AdminButton type="button" tone="secondary" size="sm" onClick={() => setBatchDeleteOpen(true)}>
              <Trash2 className="mr-1 inline h-3.5 w-3.5" />
              批量删除
            </AdminButton>
            <AdminButton type="button" tone="secondary" size="sm" onClick={() => { setBatchEditOpen(true); setBatchEditColumnKey(""); setBatchEditValue(""); }}>
              <Pencil className="mr-1 inline h-3.5 w-3.5" />
              批量填入
            </AdminButton>
            <AdminButton type="button" tone="secondary" size="sm" onClick={() => { setBatchMoveTargetId(null); setBatchMoveTarget(""); setBatchMoveOpen(true); }}>
              <ArrowRightLeft className="mr-1 inline h-3.5 w-3.5" />
              批量转移
            </AdminButton>
            <AdminButton type="button" tone="secondary" size="sm" onClick={clearSelection}>
              取消选择
            </AdminButton>
          </div>
        )}

      {view === "table" ? (
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-sm text-[var(--app-color-text-tertiary)]">加载中…</div>
        ) : !isLoading && rows.length === 0 ? (
          <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-sm text-[var(--app-color-text-tertiary)]">
            {hasActiveFilter ? "没有符合筛选条件的资产，试试放宽条件或重置。" : "暂无资产数据，请先导入 CSV/Excel。"}
          </div>
        ) : (
          <div>
          <table className="w-max min-w-full border-collapse text-sm twin-table asset-ledger-table">
            <colgroup>
              <col style={{ width: "3ch" }} />
              <col style={{ width: widths.assetCode }} />
              <col style={{ width: widths.assetName }} />
              <col style={{ width: widths.status }} />
              {editableColumns.filter((c) => !hiddenColumns.has(c.columnKey)).map((c) => (
                <col key={c.columnKey} style={{ width: widths.dynamic[c.columnKey] }} />
              ))}
              {hiddenColumns.size > 0 && <col style={{ width: "10ch" }} />}
              <col style={{ width: widths.actions }} />
            </colgroup>
            <thead>
              <tr className="sticky top-0 z-[var(--z-dropdown)] bg-[var(--app-color-surface-container)] shadow-sm">
                <th className="sticky left-0 z-[1] border-b px-1 py-1.5 text-center bg-[var(--app-color-surface-container)]" style={{ width: "3ch", zIndex: 3 }}>
                  <input type="checkbox" checked={selectedIds.size === rows.length && rows.length > 0} onChange={toggleSelectAll} className="h-3.5 w-3.5" />
                </th>
                <th className="sticky left-[3ch] z-[1] border-b px-2 py-1.5 text-left whitespace-nowrap bg-[var(--app-color-surface-container)]" style={{ width: widths.assetCode, minWidth: widths.assetCode, zIndex: 3 }}>
                  {sortHeader("assetCode", "资产编码")}
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
                <th className="sticky left-[calc(3ch+var(--col-assetCode-w,14ch))] z-[1] border-b px-2 py-1.5 text-left whitespace-nowrap bg-[var(--app-color-surface-container)]" style={{ width: widths.assetName, minWidth: widths.assetName, zIndex: 3, "--col-assetCode-w": widths.assetCode } as React.CSSProperties}>
                  {sortHeader("assetName", "资产名称")}
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
                <th className="border-b px-2 py-1.5 text-left whitespace-nowrap" style={{ width: widths.status, minWidth: widths.status }}>
                  {sortHeader("status", "状态")}
                </th>
                {editableColumns.filter((c) => !hiddenColumns.has(c.columnKey)).map((c: AssetColumnDef) => (
                  <th key={c.columnKey} className="relative z-[var(--z-dropdown)] border-b px-2 py-1.5 text-left whitespace-nowrap bg-[var(--app-color-surface-container)]">
                    {sortHeader(c.columnKey, normalizeColumnLabel(c.columnLabel))}
                    <button
                      className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-secondary)]"
                      onClick={() => toggleColumnHidden(c.columnKey)}
                      title="隐藏此列"
                    >
                      <EyeOff className="h-3 w-3" />
                    </button>
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
                {hiddenColumns.size > 0 && (
                  <th className="border-b px-2 py-1.5 text-left whitespace-nowrap">
                    <button className="text-xs text-[var(--app-color-text-tertiary)] underline" onClick={showAllColumns}>
                      显示全部列
                    </button>
                  </th>
                )}
                <th className="border-b px-2 py-1.5 text-left whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="sticky left-0 border-b px-1 py-1.5 text-center bg-inherit" style={{ width: "3ch", minWidth: "3ch" }}>
                    <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelectRow(r.id)} className="h-3.5 w-3.5" />
                  </td>
                  <td className="sticky left-[3ch] border-b px-2 py-1.5 font-mono text-xs bg-inherit" style={{ width: widths.assetCode, minWidth: widths.assetCode }}>{r.assetCode}</td>
                  <td className="sticky left-[calc(3ch+var(--col-assetCode-w,14ch))] border-b px-2 py-1.5 bg-inherit" style={{ width: widths.assetName, minWidth: widths.assetName, "--col-assetCode-w": widths.assetCode } as React.CSSProperties}>
                    {tableEditMode ? (
                      <input
                        value={editing[`${r.id}::assetName`] ?? r.assetName}
                        onChange={(e) => setEditing((prev) => ({ ...prev, [`${r.id}::assetName`]: e.target.value }))}
                        className="w-full min-w-[14ch] rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-xs"
                      />
                    ) : (
                      r.assetName
                    )}
                  </td>
                  <td className="border-b px-2 py-1.5" style={{ width: widths.status, minWidth: widths.status }}>
                    {tableEditMode ? (
                      <select
                        value={editing[`${r.id}::status`] ?? r.status}
                        onChange={(e) => setEditing((prev) => ({ ...prev, [`${r.id}::status`]: e.target.value }))}
                        className="w-full min-w-[8ch] rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-xs"
                      >
                        {!ASSET_STATUS_OPTIONS.some((o) => o.value === (editing[`${r.id}::status`] ?? r.status)) &&
                        (editing[`${r.id}::status`] ?? r.status) ? (
                          <option value={editing[`${r.id}::status`] ?? r.status}>
                            {editing[`${r.id}::status`] ?? r.status}
                          </option>
                        ) : null}
                        {ASSET_STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="block min-w-0 truncate text-[var(--twin-ink)]" title={r.status}>
                        {assetStatusLabel(r.status)}
                      </span>
                    )}
                  </td>
                  {editableColumns.filter((c) => !hiddenColumns.has(c.columnKey)).map((c) => {
                    const key = `${r.id}::${c.columnKey}`;
                    const display = editing[key] ?? r.dynamicValues?.[c.columnKey] ?? "";
                    return (
                      <td key={key} className="border-b px-2 py-1.5">
                        {tableEditMode ? (
                          isLocationColumn(c) ? (
                            <AssetLocationSelect
                              value={display}
                              onChange={(v) => setEditing((prev) => ({ ...prev, [key]: v }))}
                              className="!rounded-twin-sm !text-xs"
                            />
                          ) : isCampusColumn(c) ? (
                            <select
                              value={display}
                              onChange={(e) => setEditing((prev) => ({ ...prev, [key]: e.target.value }))}
                              className="w-full min-w-[8ch] rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-xs"
                            >
                              <option value="">未设置</option>
                              {ASSET_CAMPUS_OPTIONS.map((o) => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={display}
                              onChange={(e) => setEditing((prev) => ({ ...prev, [key]: e.target.value }))}
                              className="w-full min-w-[14ch] rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-xs"
                              style={{ width: "100%", minWidth: "10ch" }}
                            />
                          )
                        ) : (
                          <span className="block min-w-0 max-w-[48ch] truncate text-[var(--twin-ink)]" title={String(display)}>
                            {display === "" ? <span className="text-[var(--twin-mute)]">—</span> : display}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  {hiddenColumns.size > 0 && <td className="border-b" />}
                  <td className="border-b px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <AdminButton
                        type="button"
                        tone="secondary"
                        size="sm"
                        onClick={() => setDetailAsset(r)}
                      >
                        详情
                      </AdminButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        </div>
        <div className="shrink-0 pt-2 flex flex-wrap items-center justify-end gap-3 text-sm text-[var(--twin-body)]">
          <label className="mr-auto flex items-center gap-2">
            <span className="text-[var(--app-color-text-tertiary)]">每页</span>
            <AdminSelect
              value={String(size)}
              onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}
              className="w-20"
            >
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </AdminSelect>
            <span className="text-[var(--app-color-text-tertiary)]">条，共 {total} 条</span>
          </label>
          <AdminButton type="button" tone="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            上一页
          </AdminButton>
          <span className="flex items-center gap-1">
            第
            <input
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={jumpToPage}
              onKeyDown={(e) => { if (e.key === "Enter") jumpToPage(); }}
              inputMode="numeric"
              aria-label="跳转页码"
              className="w-14 rounded-twin-sm border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 text-center text-sm text-[var(--app-color-text-primary)] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--admin-focus-ring)]"
            />
            / {pages} 页
          </span>
          <AdminButton type="button" tone="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            下一页
          </AdminButton>
        </div>
      </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <AssetVisualView scanRequest={scanRequest} onCreateAsset={openAddModal} />
        </div>
      )}

        <AssetTransferApplyModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          initialAsset={selectedAsset}
          onSuccess={() => {
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
                <div className="col-span-2 flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                  图标
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-2xl">
                      {addIcon || "📦"}
                    </div>
                    <AdminButton
                      type="button"
                      tone="secondary"
                      size="sm"
                      onClick={() => setAddIconPickerOpen(true)}
                      className="inline-flex items-center gap-1.5"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      选择图标
                    </AdminButton>
                  </div>
                </div>
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
                {editableColumns.map((c) => {
                  return (
                  <label key={`create-${c.columnKey}`} className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                    {normalizeColumnLabel(c.columnLabel)}
                    {isLocationColumn(c) ? (
                      <AssetLocationSelect
                        value={addForm[c.columnKey] || ""}
                        onChange={(v) => setAddForm((prev) => ({ ...prev, [c.columnKey]: v }))}
                        className="!rounded-twin-sm !text-sm"
                      />
                    ) : isCampusColumn(c) ? (
                      <select
                        value={addForm[c.columnKey] || ""}
                        onChange={(e) => setAddForm((prev) => ({ ...prev, [c.columnKey]: e.target.value }))}
                        className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
                      >
                        <option value="">未设置</option>
                        {ASSET_CAMPUS_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={addForm[c.columnKey] || ""}
                        onChange={(e) => setAddForm((prev) => ({ ...prev, [c.columnKey]: e.target.value }))}
                        className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
                      />
                    )}
                  </label>
                  );
                })}
                <div className="col-span-2 flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                  照片
                  <div className="flex flex-wrap items-center gap-2">
                    {addPhotos.map((u) => (
                      <div
                        key={u}
                        className="group relative h-16 w-16 overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]"
                      >
                        <AutoImage src={u} alt="" className="h-full w-full object-contain p-0.5" />
                        <button
                          type="button"
                          onClick={() => setAddPhotos((prev) => prev.filter((x) => x !== u))}
                          className="absolute right-0 top-0 inline-flex h-5 w-5 items-center justify-center bg-black/50 text-white opacity-0 transition group-hover:opacity-100"
                          aria-label="删除照片"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <label className="flex h-16 cursor-pointer items-center gap-1.5 rounded-twin-sm border border-dashed border-[var(--twin-hairline-strong)] px-3 text-[11px] text-[var(--twin-mute)] transition hover:border-[var(--twin-link-deep)] hover:text-[var(--twin-ink)]">
                      {addUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      上传照片
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          void onAddUploadPhotos(e.target.files);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                </div>
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
        {addIconPickerOpen && (
          <EmojiPicker
            value={addIcon}
            onChange={setAddIcon}
            onClose={() => setAddIconPickerOpen(false)}
          />
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
                <button className="rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-danger)] px-3 py-2 text-sm font-medium text-[var(--app-color-text-on-danger)] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--app-color-ring)]" onClick={() => void confirmDeleteAsset()}>
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
        <AssetDetailDrawer
          asset={detailAsset}
          columns={columns}
          onClose={() => setDetailAsset(null)}
        />

        <MobileScanDialog open={scanOpen} onClose={() => setScanOpen(false)} onResult={handleScanResult} />

        {/* ── 导入预览对话框 (4e) ── */}
        {importPreviewOpen && importPreviewData && (
          <Portal>
            <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-h-[85vh] max-w-4xl overflow-auto rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">导入预览</h3>
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-sm text-[var(--twin-body)]" onClick={() => { setImportPreviewOpen(false); setImportPreviewData(null); setPendingImportFile(null); }}>
                  关闭
                </button>
              </div>
              {importWarnings.length > 0 && (
                <div className="mb-3 rounded-twin-sm border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold mb-1">警告</p>
                  {importWarnings.map((w, i) => (
                    <p key={i}>{w.header}: {w.reason}</p>
                  ))}
                </div>
              )}
              <p className="mb-2 text-xs text-[var(--twin-mute)]">列匹配情况</p>
              <div className="mb-3 max-h-48 overflow-auto rounded-twin-sm border border-[var(--twin-hairline)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--twin-canvas-soft)]">
                    <tr>
                      <th className="px-2 py-1 text-left">文件列</th>
                      <th className="px-2 py-1 text-left">匹配系统字段</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreviewData.columns.map((col, i) => (
                      <tr key={i} className="border-t border-[var(--twin-hairline)]">
                        <td className="px-2 py-1">{col.header}</td>
                        <td className="px-2 py-1 text-[var(--twin-body)]">{col.matchedLabel || <span className="text-[var(--twin-mute)]">未匹配</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importPreviewData.sample.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1 text-xs text-[var(--twin-mute)]">示例数据（前3行）</p>
                  <div className="max-h-48 overflow-auto rounded-twin-sm border border-[var(--twin-hairline)] text-xs">
                    <table className="w-full border-collapse twin-table">
                      <thead className="bg-[var(--twin-canvas-soft)]">
                        <tr>{Object.keys(importPreviewData.sample[0]).map((k) => (<th key={k} className="px-2 py-1 text-left whitespace-nowrap">{k}</th>))}</tr>
                      </thead>
                      <tbody>
                        {importPreviewData.sample.slice(0, 3).map((row, ri) => (
                          <tr key={ri} className="border-t border-[var(--twin-hairline)]">
                            {Object.values(row).map((v, vi) => (<td key={vi} className="px-2 py-1 whitespace-nowrap">{v}</td>))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {importLocValues.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1 text-xs font-medium text-[var(--twin-ink)]">存放地点修正（{importLocValues.length} 个值）</p>
                  <p className="mb-1 text-xs text-[var(--twin-mute)]">共 {importLocValues.length} 个地点值，{importLocMatched} 个已自动匹配</p>
                  <div className="max-h-48 space-y-1.5 overflow-auto rounded-twin-sm border border-[var(--twin-hairline)] p-2">
                    {importLocValues.map((v) => (
                      <div key={v.text} className="flex items-center gap-2">
                        <span className="w-40 shrink-0 truncate text-xs text-[var(--twin-body)]" title={v.text}>{v.text}</span>
                        <div className="min-w-0 flex-1">
                          <AdminSearchSelect
                            value={importLocationSel[v.text] ?? ""}
                            onChange={(val) => setImportLocationSel((prev) => ({ ...prev, [v.text]: val }))}
                            options={[NEW_LOCATION_NODE, ...locationLabels]}
                            placeholder="（不关联）"
                            className="w-full !rounded-twin-sm !border-[var(--twin-hairline)] !text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]" onClick={() => { setImportPreviewOpen(false); setImportPreviewData(null); setPendingImportFile(null); }}>
                  取消
                </button>
                <button className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]" onClick={() => void doConfirmImport()}>
                  确认导入
                </button>
              </div>
            </div>
            </div>
          </Portal>
        )}

        {/* ── 批量删除确认对话框 (4f) ── */}
        {batchDeleteOpen && (
          <Portal>
            <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">批量删除</h3>
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-sm text-[var(--twin-body)]" onClick={() => setBatchDeleteOpen(false)}>
                  关闭
                </button>
              </div>
              <p className="mb-2 text-sm text-[var(--twin-body)]">
                确定删除选中的 <strong>{selectedIds.size}</strong> 条资产？删除后将移入回收站。
              </p>
              <p className="mb-3 text-xs text-[var(--twin-mute)]">
                前5条: {rows.filter((r) => selectedIds.has(r.id)).slice(0, 5).map((r) => r.assetCode).join(", ") || "—"}{selectedIds.size > 5 ? "…等" : ""}
              </p>
              <div className="flex justify-end gap-2">
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]" onClick={() => setBatchDeleteOpen(false)}>
                  取消
                </button>
                <button className="rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-danger)] px-3 py-2 text-sm font-medium text-[var(--app-color-text-on-danger)] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--app-color-ring)]" onClick={() => void doBatchDelete()}>
                  确认删除
                </button>
              </div>
            </div>
            </div>
          </Portal>
        )}

        {/* ── 批量填入对话框 (4g) ── */}
        {batchEditOpen && (
          <Portal>
            <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">批量填入 ({selectedIds.size} 条)</h3>
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-sm text-[var(--twin-body)]" onClick={() => setBatchEditOpen(false)}>
                  关闭
                </button>
              </div>
              <label className="mb-2 flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                选择目标列
                <select value={batchEditColumnKey} onChange={(e) => setBatchEditColumnKey(e.target.value)} className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]">
                  <option value="">-- 请选择 --</option>
                  {editableColumns.map((c) => (
                    <option key={c.columnKey} value={c.columnKey}>{normalizeColumnLabel(c.columnLabel)}</option>
                  ))}
                </select>
              </label>
              <label className="mb-3 flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                填入值
                <input value={batchEditValue} onChange={(e) => setBatchEditValue(e.target.value)} className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]" placeholder="留空表示清空" />
              </label>
              <div className="flex justify-end gap-2">
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]" onClick={() => setBatchEditOpen(false)}>
                  取消
                </button>
                <button className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]" disabled={!batchEditColumnKey} onClick={() => void doBatchEdit()}>
                  确认填入
                </button>
              </div>
            </div>
            </div>
          </Portal>
        )}

        {/* ── 批量转移对话框：勾选资产 → 选目标地点 ── */}
        {batchMoveOpen && (
          <Portal>
            <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-[var(--twin-ink)]">批量转移 ({selectedIds.size} 条)</h3>
                  <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-sm text-[var(--twin-body)]" onClick={() => setBatchMoveOpen(false)}>
                    关闭
                  </button>
                </div>
                <p className="mb-3 text-xs text-[var(--twin-mute)]">
                  选中的资产将一次性转移到目标地点，并各留一条「地点移动」记录。
                </p>
                <label className="mb-3 flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                  目标地点
                  <AssetLocationTreeSelect
                    value={batchMoveTargetId}
                    onChange={(id, path) => {
                      setBatchMoveTargetId(id);
                      setBatchMoveTarget(path);
                    }}
                    placeholder="选择目标地点"
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]" onClick={() => setBatchMoveOpen(false)}>
                    取消
                  </button>
                  <button
                    className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)] disabled:opacity-50"
                    disabled={batchMoveTargetId == null}
                    onClick={() => void doBatchMove()}
                  >
                    确认转移
                  </button>
                </div>
              </div>
            </div>
          </Portal>
        )}

        {/* ── 查找替换对话框 (4h) ── */}
        {searchReplaceOpen && (
          <Portal>
            <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">查找替换</h3>
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-sm text-[var(--twin-body)]" onClick={() => setSearchReplaceOpen(false)}>
                  关闭
                </button>
              </div>
              <label className="mb-2 flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                目标列
                <select value={searchReplaceColumnKey} onChange={(e) => setSearchReplaceColumnKey(e.target.value)} className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]">
                  <option value="">-- 请选择 --</option>
                  {editableColumns.map((c) => (
                    <option key={c.columnKey} value={c.columnKey}>{normalizeColumnLabel(c.columnLabel)}</option>
                  ))}
                </select>
              </label>
              <label className="mb-2 flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                搜索文本
                <input value={searchReplaceSearch} onChange={(e) => setSearchReplaceSearch(e.target.value)} className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]" placeholder="要查找的内容" />
              </label>
              <label className="mb-2 flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                替换为
                <input value={searchReplaceReplace} onChange={(e) => setSearchReplaceReplace(e.target.value)} className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]" placeholder="替换后的内容（留空表示删除）" />
              </label>
              <label className="mb-3 flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                匹配模式
                <select value={searchReplaceMode} onChange={(e) => setSearchReplaceMode(e.target.value as "exact" | "contains" | "startsWith")} className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]">
                  <option value="exact">完全匹配</option>
                  <option value="contains">包含</option>
                  <option value="startsWith">以…开头</option>
                </select>
              </label>
              <div className="flex justify-end gap-2">
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]" onClick={() => setSearchReplaceOpen(false)}>
                  取消
                </button>
                <button className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]" disabled={!searchReplaceColumnKey || !searchReplaceSearch} onClick={() => void doSearchReplace()}>
                  全部替换
                </button>
              </div>
            </div>
            </div>
          </Portal>
        )}

        {/* ── 按批次删除对话框 (4i) ── */}
        {batchHistoryOpen && (
          <Portal>
            <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-h-[85vh] max-w-3xl overflow-auto rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">导入批次历史</h3>
                <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-sm text-[var(--twin-body)]" onClick={() => setBatchHistoryOpen(false)}>
                  关闭
                </button>
              </div>
              <div className="overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--twin-canvas-soft)]">
                    <tr>
                      <th className="px-3 py-2 text-left">文件名</th>
                      <th className="px-3 py-2 text-left">导入时间</th>
                      <th className="px-3 py-2 text-left">导入人</th>
                      <th className="px-3 py-2 text-center">新增</th>
                      <th className="px-3 py-2 text-center">更新</th>
                      <th className="px-3 py-2 text-center">跳过</th>
                      <th className="px-3 py-2 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchHistoryData.rows.map((batch) => (
                      <tr key={batch.id} className="border-t border-[var(--twin-hairline)]">
                        <td className="px-3 py-2">{batch.fileName}</td>
                        <td className="px-3 py-2 text-xs text-[var(--twin-body)]">{batch.importedAt?.replace("T", " ").slice(0, 19) || "-"}</td>
                        <td className="px-3 py-2 text-xs">{batch.importedBy || "-"}</td>
                        <td className="px-3 py-2 text-center text-emerald-700">{batch.createdCount}</td>
                        <td className="px-3 py-2 text-center text-sky-700">{batch.updatedCount}</td>
                        <td className="px-3 py-2 text-center text-[var(--twin-mute)]">{batch.skippedCount}</td>
                        <td className="px-3 py-2">
                          <button className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100" onClick={() => void doDeleteByBatch(batch.id)}>
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!batchHistoryData.rows.length && (
                      <tr><td className="px-3 py-8 text-center text-[var(--twin-mute)]" colSpan={7}>暂无导入记录</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-end gap-3 text-sm text-[var(--twin-body)]">
                <button disabled={batchHistoryPage <= 1} onClick={() => loadBatchHistory(batchHistoryPage - 1)} className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 disabled:opacity-40">上一页</button>
                <span>第 {batchHistoryPage} 页，共 {batchHistoryData.total} 条</span>
                <button disabled={batchHistoryPage * 20 >= batchHistoryData.total} onClick={() => loadBatchHistory(batchHistoryPage + 1)} className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 disabled:opacity-40">下一页</button>
              </div>
            </div>
            </div>
          </Portal>
        )}

        {/* 导出确认对话框 */}
        {exportConfirmOpen && (
          <Portal>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => setExportConfirmOpen(false)}>
              <div className="w-[380px] rounded-twin-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <p className="mb-2 text-sm font-semibold">确认导出 Excel</p>
                <p className="mb-4 text-xs text-[var(--twin-mute)]">
                  {getSavedExportCols() ? `当前默认导出 ${getSavedExportCols()!.length} 列。` : '尚未配置导出列，将导出全部列。'}
                </p>
                <div className="flex items-center justify-between">
                  <span className="cursor-pointer text-xs text-[var(--twin-mute)] underline hover:text-[var(--twin-primary)]" onClick={onOpenConfig}>配置列</span>
                  <div className="flex gap-3">
                    <button className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1.5 text-xs" onClick={() => setExportConfirmOpen(false)}>取消</button>
                    <button className="rounded-twin-sm bg-[var(--twin-primary)] px-4 py-1.5 text-xs text-white" onClick={onConfirmExport}>导出</button>
                  </div>
                </div>
              </div>
            </div>
          </Portal>
        )}

        {/* 导出列选择对话框 */}
        {exportPickerOpen && (
          <Portal>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => setExportPickerOpen(false)}>
              <div className="w-[420px] max-h-[70vh] flex flex-col overflow-hidden rounded-twin-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-[var(--twin-hairline)] px-5 py-3">
                  <span className="font-semibold text-sm">配置导出列</span>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-primary)]"
                      onClick={() => {
                        const allChecked = Object.values(exportColumnsChecked).every(Boolean);
                        const next: Record<string, boolean> = {};
                        Object.keys(exportColumnsChecked).forEach((k) => { next[k] = !allChecked; });
                        setExportColumnsChecked(next);
                      }}
                    >
                      {Object.values(exportColumnsChecked).every(Boolean) ? "取消全选" : "全选"}
                    </button>
                    <button className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1 text-xs text-white" onClick={onSaveConfig}>保存</button>
                    <button className="text-xs text-[var(--twin-mute)]" onClick={() => setExportPickerOpen(false)}>关闭</button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  {Object.entries(exportColumnsChecked).map(([label, checked]) => (
                    <label key={label} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 hover:bg-[var(--twin-surface)]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setExportColumnsChecked((prev) => ({ ...prev, [label]: !prev[label] }))}
                        className="h-4 w-4 accent-[var(--twin-primary)]"
                      />
                      <span className="text-sm text-[var(--twin-text)]">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Portal>
        )}
      </div>
    </AdminPageShell>
  );
}
