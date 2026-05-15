import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Archive, Download, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import {
  clearAssetTable,
  createAssetRecord,
  createAssetColumn,
  deleteAssetRecord,
  exportAssetExcel,
  fetchAssetRecycle,
  fetchAssetFacets,
  fetchAssetRecords,
  importAssetExcel,
  patchAssetRecord,
  purgeRecycleAsset,
  restoreRecycleAsset,
  searchAssets,
  type AssetRecycleRow,
  type AssetColumnDef,
  type AssetFacets,
  type AssetPagedData,
  type AssetRow,
} from "@/api/domains/asset.api";
import AssetTransferApplyModal from "@/components/asset/AssetTransferApplyModal";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { AdminToolbar, AdminToolbarActions, AdminToolbarPrimary } from "@/components/admin/AdminToolbar";
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
  const [data, setData] = useState<AssetPagedData | null>(null);
  const [facets, setFacets] = useState<AssetFacets>({ assetNames: [], campuses: [], users: [], models: [] });
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
  const [loading, setLoading] = useState(false);
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
  const [recycleRows, setRecycleRows] = useState<AssetRecycleRow[]>([]);
  const [recyclePage, setRecyclePage] = useState(1);
  const [recycleTotal, setRecycleTotal] = useState(0);
  const [widthProfile, setWidthProfile] = useState<{
    assetCode: string;
    assetName: string;
    actions: string;
    dynamic: Record<string, string>;
  } | null>(null);
  const [tableEditMode, setTableEditMode] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const columns = data?.columns ?? [];
  const editableColumns = useMemo(
    () =>
      columns.filter((c) => {
        const label = (c.columnLabel || "").trim();
        if (label === "资产编号" || label === "资产编码") return false;
        if (c.columnKey === "col_资产编号" || c.columnKey === "col_资产编码") return false;
        return true;
      }),
    [columns]
  );
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const normalizeAll = (value: string) => (value === "__ALL__" ? "" : value);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchAssetRecords({
        page,
        size,
        keyword: appliedKeyword || undefined,
        assetName: appliedAssetName || undefined,
        user: appliedUser || undefined,
        model: appliedModel || undefined,
        sortBy,
        sortDirection,
      });
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, size, appliedKeyword, appliedAssetName, appliedUser, appliedModel, sortBy, sortDirection]);

  const refreshFacets = async (nextKeyword: string, nextAssetName: string, nextUser: string, nextModel: string) => {
    try {
      const data = await fetchAssetFacets({
        keyword: nextKeyword || undefined,
        assetName: normalizeAll(nextAssetName) || undefined,
        user: normalizeAll(nextUser) || undefined,
        model: normalizeAll(nextModel) || undefined,
      });
      setFacets(data);
      const names = data.assetNames || [];
      const users = data.users || [];
      const models = data.models || [];
      if (nextAssetName !== "__ALL__" && !names.includes(nextAssetName)) setAssetName("__ALL__");
      if (nextUser !== "__ALL__" && !users.includes(nextUser)) setUser("__ALL__");
      if (nextModel !== "__ALL__" && !models.includes(nextModel)) setModel("__ALL__");
    } catch (e) {
      // ignore facets failure, main list still works
    }
  };

  useEffect(() => {
    void refreshFacets(keyword.trim(), assetName, user, model);
  }, [keyword, assetName, user, model]);

  const detailAfterPhotoUrls = useMemo(
    () => (detailAsset ? parseTransferPhotoUrls(detailAsset.latestTransferPhotoUrlsAfter) : []),
    [detailAsset]
  );

  const totalColumns = useMemo(() => 3 + editableColumns.length, [editableColumns.length]);
  const widths = widthProfile ?? {
    assetCode: "14ch",
    assetName: "20ch",
    actions: "16ch",
    dynamic: Object.fromEntries(editableColumns.map((c) => [c.columnKey, "14ch"])),
  };

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
    setAppliedAssetName(assetName === "__ALL__" ? "" : assetName);
    setAppliedUser(user === "__ALL__" ? "" : user);
    setAppliedModel(model === "__ALL__" ? "" : model);
    setPage(1);
  };

  const resetSearch = () => {
    setKeyword("");
    setAssetName("__ALL__");
    setUser("__ALL__");
    setModel("__ALL__");
    setAppliedKeyword("");
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
      const stat = await importAssetExcel(file);
      toast.success(`导入成功：新增 ${stat.created}，更新 ${stat.updated}，跳过 ${stat.skipped}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    }
  };

  const onExport = async () => {
    try {
      const blob = await exportAssetExcel({
        keyword: appliedKeyword || undefined,
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
      await load();
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
      await createAssetRecord({ assetCode, assetName: newAssetName, dynamicValues });
      toast.success("新增资产成功");
      setAddOpen(false);
      await load();
      void refreshFacets(keyword.trim(), assetName, user, model);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "新增资产失败");
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
      await load();
      try {
        const facetData = await fetchAssetFacets();
        setFacets(facetData);
      } catch {
        // ignore
      }
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
      await deleteAssetRecord(selectedDeleteId);
      toast.success("资产已移入回收站");
      setDeleteOpen(false);
      setDeleteKeyword("");
      setDeleteCandidates([]);
      setSelectedDeleteId("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除资产失败");
    }
  };

  const loadRecycle = async (targetPage = recyclePage, kw = recycleKeyword) => {
    try {
      const res = await fetchAssetRecycle({ page: targetPage, size: 20, keyword: kw.trim() || undefined });
      setRecycleRows(res.rows || []);
      setRecycleTotal(res.total || 0);
      setRecyclePage(res.page || targetPage);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载回收站失败");
    }
  };

  const openRecycleModal = async () => {
    setRecycleOpen(true);
    setRecyclePage(1);
    await loadRecycle(1, recycleKeyword);
  };

  const doRestore = async (id: string) => {
    try {
      await restoreRecycleAsset(id);
      toast.success("恢复成功");
      await loadRecycle(recyclePage, recycleKeyword);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "恢复失败");
    }
  };

  const doPurge = async (id: string) => {
    const ok = window.confirm("确认彻底删除该资产？彻底删除后不可恢复。");
    if (!ok) return;
    try {
      await purgeRecycleAsset(id);
      toast.success("已彻底删除");
      await loadRecycle(recyclePage, recycleKeyword);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "彻底删除失败");
    }
  };

  const onSave = async (row: AssetRow) => {
    const dynamicValues = { ...(row.dynamicValues || {}) } as Record<string, string>;
    for (const c of editableColumns) {
      const key = `${row.id}::${c.columnKey}`;
      if (editing[key] != null) {
        dynamicValues[c.columnKey] = editing[key];
      }
    }
    try {
      await patchAssetRecord(row.id, { dynamicValues });
      toast.success("保存成功");
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc（接口仅回 id，用请求体推导行数据）
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((r) => (r.id === row.id ? { ...r, dynamicValues: { ...dynamicValues } } : r)),
        };
      });
      setEditing((prev) => {
        const next = { ...prev };
        for (const c of editableColumns) {
          delete next[`${row.id}::${c.columnKey}`];
        }
        return next;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden pb-2">
      <div className="flex w-full min-w-0 max-w-full flex-col gap-4 p-6">
        <AdminToolbar className="items-start justify-between gap-y-3">
          <div className="min-w-0 flex-1 basis-full sm:basis-[min(100%,24rem)]">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
              <Archive className="h-6 w-6 shrink-0 text-blue-600" />
              资产记录
            </h1>
            <p className="mt-1 text-sm text-slate-600">支持 CSV/Excel 导入、Excel 导出、动态表头、搜索修改，以及申请转移流程。</p>
          </div>
          <AdminToolbarActions className="min-w-0 w-full flex-col items-stretch sm:w-auto sm:flex-row sm:items-center sm:justify-end">
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
            <div className="flex min-w-0 flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedAsset(null);
                  setModalOpen(true);
                }}
                className="inline-flex min-h-9 items-center gap-2 rounded border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm text-indigo-800"
              >
                申请转移
              </button>
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex min-h-9 items-center gap-2 rounded border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800"
              >
                <Plus className="h-4 w-4 shrink-0" />
                新增资产
              </button>
              <AdminButton
                type="button"
                tone={tableEditMode ? "secondary" : "primary"}
                className="inline-flex min-h-9 items-center gap-2"
                onClick={() => setTableEditMode((v) => !v)}
              >
                <Pencil className="h-4 w-4 shrink-0" />
                {tableEditMode ? "完成编辑" : "编辑表格"}
              </AdminButton>
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-[3px] focus-visible:ring-[color:var(--admin-focus-ring)] disabled:pointer-events-none disabled:opacity-50">
                  <MoreHorizontal className="h-4 w-4 shrink-0" />
                  更多操作
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[12rem]">
                  <DropdownMenuLabel className="text-xs font-normal text-slate-500">数据与维护</DropdownMenuLabel>
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
                  <DropdownMenuItem onSelect={() => void openRecycleModal()}>回收站</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </AdminToolbarActions>
        </AdminToolbar>

        <AdminToolbar className="rounded-lg border border-slate-200 bg-white p-4">
          <AdminToolbarPrimary>
            <label className="flex w-full max-w-full min-w-0 flex-col gap-1 text-xs text-slate-600 sm:max-w-md">
              全局搜索
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
                className="w-full min-w-0 rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="资产编码/动态列/申请记录"
              />
            </label>
          </AdminToolbarPrimary>
          <label className="flex min-w-[12rem] shrink-0 flex-col gap-1 text-xs text-slate-600">
            资产名称
            <AdminSelect value={assetName} onChange={(e) => setAssetName(e.target.value)}>
              <option value="__ALL__">全部</option>
              {facets.assetNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </AdminSelect>
          </label>
          <label className="flex min-w-[10rem] shrink-0 flex-col gap-1 text-xs text-slate-600">
            使用人
            <AdminSelect value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="__ALL__">全部</option>
              {(facets.users && facets.users.length ? facets.users : facets.campuses).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </AdminSelect>
          </label>
          <label className="flex min-w-[10rem] shrink-0 flex-col gap-1 text-xs text-slate-600">
            规格型号
            <AdminSelect value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="__ALL__">全部</option>
              {facets.models.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </AdminSelect>
          </label>
          <AdminToolbarActions className="w-full shrink-0 sm:w-auto">
            <AdminButton type="button" onClick={applySearch} className="inline-flex items-center gap-1">
              <Search className="h-4 w-4" />
              查询
            </AdminButton>
            <AdminButton type="button" tone="secondary" onClick={resetSearch} className="inline-flex items-center gap-1">
              重置
            </AdminButton>
          </AdminToolbarActions>
        </AdminToolbar>

        {/* 与 WinCC 变量页一致：min-w-0 + 表格外壳；表头 sticky / 斑马纹见 index.css（post-save 规则仍适用） */}
        <AdminDataTableWrap scrollable className="w-full min-w-0 overscroll-x-contain">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b px-2 py-1.5 text-left whitespace-nowrap" style={{ width: widths.assetCode }}>资产编码</th>
                <th className="border-b px-2 py-1.5 text-left whitespace-nowrap" style={{ width: widths.assetName }}>资产名称</th>
                {editableColumns.map((c: AssetColumnDef) => (
                  <th key={c.columnKey} className="border-b px-2 py-1.5 text-left whitespace-nowrap" style={{ width: widths.dynamic[c.columnKey] }}>
                    <button className="underline decoration-dotted" onClick={() => toggleSort(c.columnKey)}>{normalizeColumnLabel(c.columnLabel)}</button>
                  </th>
                ))}
                <th className="border-b px-2 py-1.5 text-left whitespace-nowrap" style={{ width: widths.actions }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
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
                            className="w-full min-w-0 rounded border border-slate-300 px-2 py-1 text-xs"
                          />
                        ) : (
                          <span className="block min-w-0 max-w-[48ch] truncate text-slate-800" title={String(display)}>
                            {display === "" ? <span className="text-slate-400">—</span> : display}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="border-b px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      {tableEditMode ? (
                        <button
                          type="button"
                          onClick={() => void onSave(r)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                        >
                          保存
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setDetailAsset(r)}
                        className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs text-indigo-700"
                      >
                        详情
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={totalColumns}>
                    {loading ? "加载中..." : "暂无资产数据，请先导入 CSV/Excel。"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </AdminDataTableWrap>

        <div className="flex items-center justify-end gap-3 text-sm text-slate-600">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border px-3 py-1 disabled:opacity-40">
            上一页
          </button>
          <span>
            第 {page} / {pages} 页，共 {total} 条
          </span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1 disabled:opacity-40">
            下一页
          </button>
        </div>

        <AssetTransferApplyModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          initialAsset={selectedAsset}
          onSuccess={async () => {
            await load();
          }}
        />
        {addOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-h-[85vh] max-w-3xl overflow-auto rounded-xl bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">新增资产</h3>
                <button className="rounded border border-slate-200 px-3 py-1 text-sm text-slate-600" onClick={() => setAddOpen(false)}>
                  关闭
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-slate-600">
                  资产编号
                  <input
                    value={addForm.assetCode || ""}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, assetCode: e.target.value }))}
                    className="rounded border border-slate-300 px-3 py-2 text-sm"
                    placeholder="请输入资产编号"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600">
                  资产名称
                  <input
                    value={addForm.assetName || ""}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, assetName: e.target.value }))}
                    className="rounded border border-slate-300 px-3 py-2 text-sm"
                    placeholder="请输入资产名称"
                  />
                </label>
                {editableColumns.map((c) => (
                  <label key={`create-${c.columnKey}`} className="flex flex-col gap-1 text-xs text-slate-600">
                    {normalizeColumnLabel(c.columnLabel)}
                    <input
                      value={addForm[c.columnKey] || ""}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, [c.columnKey]: e.target.value }))}
                      className="rounded border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" onClick={() => setAddOpen(false)}>
                  取消
                </button>
                <button className="rounded bg-blue-600 px-3 py-2 text-sm text-white" onClick={() => void submitAddAsset()}>
                  确认新增
                </button>
              </div>
            </div>
          </div>
        )}
        {deleteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">删除资产（移入回收站）</h3>
                <button className="rounded border border-slate-200 px-3 py-1 text-sm text-slate-600" onClick={() => setDeleteOpen(false)}>
                  关闭
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={deleteKeyword}
                  onChange={(e) => setDeleteKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void searchDeleteAssets()}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  placeholder="输入资产编码/名称检索"
                />
                <button onClick={() => void searchDeleteAssets()} className="rounded bg-blue-600 px-3 py-2 text-sm text-white">检索</button>
              </div>
              <div className="mt-3 max-h-64 overflow-auto rounded border border-slate-200">
                {deleteCandidates.map((row) => (
                  <label key={row.id} className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                    <input
                      type="radio"
                      checked={selectedDeleteId === row.id}
                      onChange={() => setSelectedDeleteId(row.id)}
                    />
                    <span className="font-mono text-xs text-slate-600">{row.assetCode}</span>
                    <span>{row.assetName}</span>
                    <span className="text-slate-500">{row.location || "-"}</span>
                  </label>
                ))}
                {!deleteCandidates.length && <div className="px-3 py-6 text-center text-sm text-slate-500">暂无结果</div>}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" onClick={() => setDeleteOpen(false)}>
                  取消
                </button>
                <button className="rounded bg-rose-600 px-3 py-2 text-sm text-white" onClick={() => void confirmDeleteAsset()}>
                  确认删除
                </button>
              </div>
            </div>
          </div>
        )}
        {recycleOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-h-[85vh] max-w-3xl overflow-auto rounded-xl bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">回收站</h3>
                <button className="rounded border border-slate-200 px-3 py-1 text-sm text-slate-600" onClick={() => setRecycleOpen(false)}>
                  关闭
                </button>
              </div>
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={recycleKeyword}
                  onChange={(e) => setRecycleKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void loadRecycle(1, recycleKeyword)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  placeholder="检索回收站资产"
                />
                <button onClick={() => void loadRecycle(1, recycleKeyword)} className="rounded bg-blue-600 px-3 py-2 text-sm text-white">查询</button>
              </div>
              <div className="overflow-hidden rounded border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">资产编码</th>
                      <th className="px-3 py-2 text-left">资产名称</th>
                      <th className="px-3 py-2 text-left">删除时间</th>
                      <th className="px-3 py-2 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recycleRows.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{row.assetCode}</td>
                        <td className="px-3 py-2">{row.assetName}</td>
                        <td className="px-3 py-2">{row.deletedTime ? String(row.deletedTime).replace("T", " ").slice(0, 19) : "-"}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700" onClick={() => void doRestore(row.id)}>
                              恢复
                            </button>
                            <button className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700" onClick={() => void doPurge(row.id)}>
                              彻底删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!recycleRows.length && (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-500" colSpan={4}>回收站为空</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-end gap-3 text-sm text-slate-600">
                <button
                  disabled={recyclePage <= 1}
                  onClick={() => void loadRecycle(Math.max(1, recyclePage - 1), recycleKeyword)}
                  className="rounded border px-3 py-1 disabled:opacity-40"
                >
                  上一页
                </button>
                <span>第 {recyclePage} 页，共 {recycleTotal} 条</span>
                <button
                  disabled={recyclePage * 20 >= recycleTotal}
                  onClick={() => void loadRecycle(recyclePage + 1, recycleKeyword)}
                  className="rounded border px-3 py-1 disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        )}
        {detailAsset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">资产详情</h3>
                <button
                  type="button"
                  className="rounded border border-slate-200 px-3 py-1 text-sm text-slate-600"
                  onClick={() => {
                    setDetailImagePreview(null);
                    setDetailAsset(null);
                  }}
                >
                  关闭
                </button>
              </div>
              <div className="space-y-2 text-sm text-slate-700">
                <div><span className="text-slate-500">资产编码：</span>{detailAsset.assetCode || "-"}</div>
                <div><span className="text-slate-500">资产名称：</span>{detailAsset.assetName || "-"}</div>
                <div><span className="text-slate-500">申请单号：</span>{detailAsset.latestTransferRequestId || "-"}</div>
                <div><span className="text-slate-500">转移状态：</span>{transferStatusLabel(detailAsset.latestTransferStatus)}</div>
                <div><span className="text-slate-500">转移时间：</span>{detailAsset.latestTransferTime ? String(detailAsset.latestTransferTime).replace("T", " ").slice(0, 19) : "-"}</div>
                <div><span className="text-slate-500">转移备注：</span>{detailAsset.latestTransferRemark || "-"}</div>
                <div><span className="text-slate-500">转移地点：</span>{detailAsset.latestTransferLocation || "-"}</div>
                {detailAfterPhotoUrls.length > 0 && (
                  <div className="pt-2">
                    <div className="text-slate-500">转移后照片</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {detailAfterPhotoUrls.map((u) => (
                        <button
                          key={u}
                          type="button"
                          className="h-20 w-20 overflow-hidden rounded border border-slate-200 bg-slate-50 p-0"
                          onClick={() => setDetailImagePreview(u)}
                        >
                          <img src={u} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {detailImagePreview && (
          <button
            type="button"
            className="fixed inset-0 z-[60] flex cursor-default items-center justify-center border-0 bg-black/80 p-4"
            onClick={() => setDetailImagePreview(null)}
            aria-label="关闭预览"
          >
            <img src={detailImagePreview} alt="" className="max-h-[90vh] max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
          </button>
        )}
      </div>
    </div>
  );
}

