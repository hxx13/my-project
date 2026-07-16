import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";
import { AutoImage } from "@/components/ui/AutoImage";
import { copyTextToClipboard } from "@/lib/copyToClipboard";
import { queryKeys } from "@/api/hooks/queryKeys";
import { Portal } from "@/components/Portal";
import { ClipboardList, Download, Upload } from "lucide-react";
import {
  appendTransferAfterPhotos,
  completeTransferRequest,
  createOrReuseTransferPdfLink,
  deleteTransferRecordAdmin,
  exportTransferRecords,
  fetchAssetRecords,
  fetchTransferRecords,
  listTransferPdfLinks,
  removeTransferAfterPhoto,
  withdrawTransferRequest,
  type AssetColumnDef,
  type AssetRow,
  type AssetTransferRecord,
  type TransferPdfLinkItem,
} from "@/api/domains/asset.api";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import { authStorage } from "@/features/auth/authStorage";
import { authHttp } from "@/api/core/authHttp";
import { hasMinRole } from "@/features/auth/roleAccess";
import { formatDateTimeAsiaShanghai } from "@/lib/formatDateTimeAsiaShanghai";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function parsePhotoUrlJson(v: unknown): string[] {
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

function statusLabel(s: string | undefined) {
  if (s === "IN_PROGRESS") return "进行中";
  if (s === "COMPLETED" || s === "SUBMITTED") return "转移完毕";
  if (s === "WITHDRAWN") return "已撤回";
  return s || "-";
}

function formatDateTime(v: string | undefined | null) {
  return formatDateTimeAsiaShanghai(v);
}

function normalizeTransferRecord(r: AssetTransferRecord): AssetTransferRecord {
  const o = r as unknown as Record<string, unknown>;
  const tt = o.transferTime ?? o.transfer_time;
  const ct = o.createTime ?? o.create_time;
  return {
    ...r,
    transferTime: tt != null && String(tt).trim() !== "" ? String(tt) : r.transferTime,
    createTime: ct != null && String(ct).trim() !== "" ? String(ct) : r.createTime,
  };
}

function normalizeColumnLabel(label: string) {
  const text = label.trim();
  return text; // 不再把"存放地点N"映射为"当前存放地点"
}

function pickCurrentLocationColumn(columns: AssetColumnDef[]) {
  const list = Array.isArray(columns) ? columns : [];
  for (const col of list) {
    const raw = String(col.columnLabel || "").trim();
    if (/^存放地点\d+$/i.test(raw)) return col;
  }
  for (const col of list) {
    const raw = String(col.columnLabel || "").trim();
    if (raw.includes("存放地点")) return col;
  }
  for (const col of list) {
    const raw = String(col.columnLabel || "").trim();
    if (raw.includes("当前位置")) return col;
  }
  return null;
}

function displayStoredLocation(asset: AssetRow | null, columns: AssetColumnDef[]) {
  if (!asset) return "—";
  const col = pickCurrentLocationColumn(columns);
  const dv = asset.dynamicValues || {};
  if (col?.columnKey) {
    const v = dv[col.columnKey];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return asset.location && String(asset.location).trim() !== "" ? String(asset.location) : "—";
}

function pickSpecModelColumn(columns: AssetColumnDef[]) {
  for (const col of columns) {
    const label = String(col.columnLabel || "").trim();
    if (label.includes("规格型号")) return col;
  }
  for (const col of columns) {
    const label = String(col.columnLabel || "").trim();
    if (label.includes("型号")) return col;
  }
  return null;
}

function pickUserColumn(columns: AssetColumnDef[]) {
  for (const col of columns) {
    const label = String(col.columnLabel || "").trim();
    if (label === "使用人") return col;
  }
  for (const col of columns) {
    const label = String(col.columnLabel || "").trim();
    if (label.includes("使用人") && !label.includes("工号")) return col;
  }
  return null;
}

type AssetSummary = { summaryLocation: string; summaryUser: string; summaryModel: string };

function beforePhotosForRecord(r: AssetTransferRecord): string[] {
  const raw = parsePhotoUrlJson(r.photoUrlsBefore);
  if (raw.length) return raw;
  const legacy = r.photoUrl?.trim();
  return legacy ? [legacy] : [];
}

function toDetailRows(assetRow: AssetRow | null, columns: AssetColumnDef[]) {
  if (!assetRow) return [] as { key: string; label: string; value: string }[];
  const dynamic = assetRow.dynamicValues || {};
  const list: { key: string; label: string; value: string }[] = [];
  for (const col of columns) {
    const key = col.columnKey;
    if (!key) continue;
    const val = dynamic[key];
    if (val == null || String(val).trim() === "") continue;
    list.push({ key, label: normalizeColumnLabel(col.columnLabel || ""), value: String(val) });
  }
  return list;
}

export default function AdminAssetTransferRecordPage() {
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [size] = useState(20);
  const [continueRow, setContinueRow] = useState<AssetTransferRecord | null>(null);
  const [appendUrlsText, setAppendUrlsText] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [linkModalRow, setLinkModalRow] = useState<AssetTransferRecord | null>(null);
  const [linkRows, setLinkRows] = useState<TransferPdfLinkItem[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [latestLinkByRequest, setLatestLinkByRequest] = useState<Record<string, TransferPdfLinkItem | undefined>>({});
  const [summaryByAssetId, setSummaryByAssetId] = useState<Record<string, AssetSummary>>({});
  const [summaryHydrating, setSummaryHydrating] = useState(false);
  const [detailTransfer, setDetailTransfer] = useState<AssetTransferRecord | null>(null);
  const [detailAsset, setDetailAsset] = useState<AssetRow | null>(null);
  const [detailColumns, setDetailColumns] = useState<AssetColumnDef[]>([]);
  const [detailRows, setDetailRows] = useState<{ key: string; label: string; value: string }[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingAfterPhoto, setDeletingAfterPhoto] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const qc = useQueryClient();
  const role = authStorage.getRole() || "MEMBER";
  const canDeleteTransfer = hasMinRole(role, "ADMIN");

  const location = useLocation();
  const pageLabel = useMemo(() => adminChromeTitle(location.pathname), [location.pathname]);

  // Debounced auto-search: 输入即搜
  useEffect(() => {
    const kw = keyword.trim();
    if (kw === appliedKeyword) return;
    const timer = setTimeout(() => {
      setAppliedKeyword(keyword.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  const transferQueryKey = useMemo(
    () => ["transferRecords", { page, size, keyword: appliedKeyword || undefined }] as const,
    [page, size, appliedKeyword],
  );

  const { data: transferData, isLoading } = useQuery({
    queryKey: transferQueryKey,
    queryFn: () => fetchTransferRecords({ page, size, keyword: appliedKeyword || undefined }),
    placeholderData: (prev) => prev,
  });

  const rows = useMemo(() => (transferData?.rows || []).map(normalizeTransferRecord), [transferData]);
  const total = transferData?.total || 0;
  const pages = Math.max(1, Math.ceil(total / size));

  // Hydrate asset summaries for all unseen asset IDs on the current page
  useEffect(() => {
    if (rows.length === 0) return;
    let cancelled = false;
    const run = async () => {
      setSummaryHydrating(true);
      try {
        const updates: Record<string, AssetSummary> = {};
        const seen = new Set<string>();
        for (const row of rows) {
          if (!row.assetId || seen.has(row.assetId)) continue;
          seen.add(row.assetId);
          try {
            const data = await fetchAssetRecords({ page: 1, size: 1, assetId: row.assetId });
            const cols = data.columns || [];
            const assets = data.rows || [];
            const target =
              assets.find((x) => x.id === row.assetId) ||
              assets.find((x) => x.assetCode === row.assetCode) ||
              null;
            if (!target) {
              updates[row.assetId] = { summaryLocation: "-", summaryUser: "-", summaryModel: "-" };
              continue;
            }
            const locationCol = pickCurrentLocationColumn(cols);
            const userCol = pickUserColumn(cols);
            const modelCol = pickSpecModelColumn(cols);
            const dv = target.dynamicValues || {};
            updates[row.assetId] = {
              summaryLocation: (locationCol && dv[locationCol.columnKey]) || target.location || "-",
              summaryUser: (userCol && dv[userCol.columnKey]) || "-",
              summaryModel: (modelCol && dv[modelCol.columnKey]) || "-",
            };
          } catch {
            updates[row.assetId] = { summaryLocation: "-", summaryUser: "-", summaryModel: "-" };
          }
        }
        if (!cancelled && Object.keys(updates).length) {
          setSummaryByAssetId((prev) => ({ ...prev, ...updates }));
        }
      } finally {
        if (!cancelled) setSummaryHydrating(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  // Sync continueRow when rows change (e.g. after setQueryData updates)
  useEffect(() => {
    if (continueRow) {
      const next = rows.find((x) => x.id === continueRow.id);
      if (next) setContinueRow(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const onExport = async () => {
    try {
      const blob = await exportTransferRecords({ keyword: appliedKeyword || undefined });
      downloadBlob(blob, `asset-transfer-records-${Date.now()}.xlsx`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    }
  };

  const doAppendUrls = async () => {
    if (!continueRow) return;
    const urls = appendUrlsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!urls.length) {
      toast.error("请填写至少一行照片 URL");
      return;
    }
    setActionLoading(true);
    try {
      const updated = await appendTransferAfterPhotos(continueRow.id, urls);
      toast.success("已追加转移后照片");
      setAppendUrlsText("");
      qc.setQueryData(transferQueryKey, (prev: typeof transferData | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((r) =>
            r.id === continueRow.id
              ? { ...r, photoUrlsAfter: JSON.stringify(updated.photoUrlsAfter) }
              : r,
          ),
        };
      });
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "追加失败");
    } finally {
      setActionLoading(false);
    }
  };

  /** Web 端上传转移后照片到后端，获得 publicUrl（与小程序 syncToBackend → publicUrl 对齐） */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await authHttp.post<{ code: number; success: boolean; data: { url: string; publicUrl: string; recordId: number }; message?: string }>("/api/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data?.success && res.data.data?.publicUrl) {
        const url = res.data.data.publicUrl;
        setAppendUrlsText((prev) => {
          const trimmed = prev.trimEnd();
          return trimmed ? `${trimmed}\n${url}` : url;
        });
        toast.success("照片已上传");
      } else {
        toast.error(res.data?.message || "上传失败");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const doComplete = async () => {
    if (!continueRow) return;
    const after = parsePhotoUrlJson(continueRow.photoUrlsAfter);
    if (!after.length) {
      toast.error("请先上传或追加转移后照片");
      return;
    }
    if (!window.confirm("确认该资产已转移完毕？将写入目标地点并解锁资产。")) return;
    setActionLoading(true);
    try {
      await completeTransferRequest(continueRow.id);
      toast.success("已确认转移完毕");
      setContinueRow(null);
      setAppendUrlsText("");
      qc.setQueryData(transferQueryKey, (prev: typeof transferData | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((r) =>
            r.id === continueRow.id ? { ...r, status: "COMPLETED" } : r,
          ),
        };
      });
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setActionLoading(false);
    }
  };

  const doWithdrawRow = async (r: AssetTransferRecord) => {
    if (!window.confirm(`确认撤回「${r.assetName}（${r.assetCode}）」的转移申请？资产将解锁，本条记录标记为已撤回。`)) return;
    setActionLoading(true);
    try {
      await withdrawTransferRequest(r.id);
      toast.success("已撤回");
      if (continueRow?.id === r.id) {
        setContinueRow(null);
        setAppendUrlsText("");
      }
      qc.setQueryData(transferQueryKey, (prev: typeof transferData | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((x) => (x.id === r.id ? { ...x, status: "WITHDRAWN" } : x)),
        };
      });
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "撤回失败");
    } finally {
      setActionLoading(false);
    }
  };

  const doDeleteRow = async (r: AssetTransferRecord) => {
    const locHint =
      r.status === "COMPLETED" && (r.fromLocation == null || String(r.fromLocation).trim() === "")
        ? "该记录未保存「转移前所在地」，删除后不会自动回滚资产地点。"
        : "若为已完成的转移且系统保存了转移前所在地，将尝试把资产地点还原。";
    if (!window.confirm(`管理员删除「${r.assetName}（${r.assetCode}）」的转移记录？将永久移除该条申请数据；${locHint}`)) return;
    setActionLoading(true);
    try {
      await deleteTransferRecordAdmin(r.id);
      toast.success("已删除");
      if (continueRow?.id === r.id) {
        setContinueRow(null);
        setAppendUrlsText("");
      }
      qc.setQueryData(transferQueryKey, (prev: typeof transferData | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          total: prev.total - 1,
          rows: prev.rows.filter((x) => x.id !== r.id),
        };
      });
      qc.invalidateQueries({ queryKey: queryKeys.asset.all });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setActionLoading(false);
    }
  };

  const openDetail = async (r: AssetTransferRecord) => {
    setDetailTransfer(r);
    setDetailAsset(null);
    setDetailColumns([]);
    setDetailRows([]);
    setDetailLoading(true);
    try {
      const data = await fetchAssetRecords({
        page: 1,
        size: 1,
        assetId: r.assetId,
      });
      const cols = data.columns || [];
      setDetailColumns(cols);
      const records = data.rows || [];
      const target = records.find((x) => x.id === r.assetId) || records[0] || null;
      setDetailAsset(target);
      setDetailRows(toDetailRows(target, cols));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载详情失败");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailTransfer(null);
    setDetailAsset(null);
    setDetailColumns([]);
    setDetailRows([]);
    setDetailLoading(false);
  };

  const doRemoveAfterPhoto = async (requestId: string, photoUrl: string) => {
    if (deletingAfterPhoto) return;
    if (!window.confirm("确认删除这张转移后照片？")) return;
    setDeletingAfterPhoto(true);
    try {
      const updated = await removeTransferAfterPhoto(requestId, photoUrl);
      toast.success("已删除");
      qc.setQueryData(transferQueryKey, (prev: typeof transferData | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((r) =>
            r.id === requestId
              ? { ...r, photoUrlsAfter: updated.photoUrlsAfter ? JSON.stringify(updated.photoUrlsAfter) : r.photoUrlsAfter }
              : r,
          ),
        };
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletingAfterPhoto(false);
    }
  };

  const openLinkModal = async (r: AssetTransferRecord) => {
    setLinkModalRow(r);
    setLinkLoading(true);
    try {
      const data = await listTransferPdfLinks(r.id);
      setLinkRows(data.links || []);
      setLatestLinkByRequest((prev) => ({ ...prev, [r.id]: (data.links || [])[0] }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载链接失败");
      setLinkRows([]);
    } finally {
      setLinkLoading(false);
    }
  };

  const doGenerateLink = async (r: AssetTransferRecord) => {
    setLinkLoading(true);
    try {
      const created = await createOrReuseTransferPdfLink(r.id);
      const data = await listTransferPdfLinks(r.id);
      setLinkRows(data.links || []);
      setLatestLinkByRequest((prev) => ({ ...prev, [r.id]: (data.links || [])[0] }));
      const copyText = created.downloadUrl || created.downloadPath;
      if (copyText) {
        await copyTextToClipboard(copyText);
      }
      toast.success(created.reused ? "已复用链接（已复制）" : "已生成链接（已复制）");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "获取链接失败");
    } finally {
      setLinkLoading(false);
    }
  };

  const displayLink = (item: TransferPdfLinkItem) => item.downloadUrl || item.downloadPath;

  const sumCell = (assetId: string, field: keyof AssetSummary) =>
    summaryHydrating && !summaryByAssetId[assetId] ? "加载中…" : (summaryByAssetId[assetId]?.[field] ?? "—");

  return (
    <AdminPageShell>
    <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
      <AdminFormCard className="shrink-0 mb-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
          <h2 className="text-base font-bold text-[var(--app-color-text-primary)] shrink-0">{pageLabel}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton
              type="button"
              tone="primary"
              onClick={() => {
                setAppliedKeyword(keyword.trim());
                setPage(1);
              }}
            >
              查询
            </AdminButton>
            <AdminButton type="button" tone="secondary" className="inline-flex items-center gap-2" onClick={() => void onExport()}>
              <Download className="h-4 w-4" aria-hidden />
              导出 Excel
            </AdminButton>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex min-w-[18rem] flex-1 flex-col gap-1">
            <span className={adminLabelClass}>搜索</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setAppliedKeyword(keyword.trim());
                  setPage(1);
                }
              }}
              className={adminInputClass}
              placeholder="资产编码/名称/地点/申请人"
            />
          </label>
        </div>
      </AdminFormCard>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto">
      <div>
        <table className="min-w-full border-collapse text-sm">
          <thead className="border-b-2 border-[var(--app-color-border-strong)]">
            <tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold shadow-[var(--app-elevation-card)]">
              <th className="border-b p-3 text-left text-xs">资产编码</th>
              <th className="border-b p-3 text-left text-xs">资产名称</th>
              <th className="border-b p-3 text-left text-xs">申请人</th>
              <th className="border-b p-3 text-left text-xs">转移时间</th>
              <th className="border-b p-3 text-left text-xs">转移地点</th>
              <th className="border-b p-3 text-left text-xs">备注</th>
              <th className="border-b p-3 text-left text-xs">创建时间</th>
              <th className="border-b p-3 text-left text-xs">当前存放</th>
              <th className="border-b p-3 text-left text-xs">使用人</th>
              <th className="border-b p-3 text-left text-xs">型号</th>
              <th className="border-b p-3 text-left text-xs">状态</th>
              <th className="border-b p-3 text-left text-xs">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const latestLink = latestLinkByRequest[r.id];
              return (
                <tr key={r.id} className="hover:bg-[var(--twin-canvas-soft)]">
                  <td className="border-b px-2 py-2 text-xs">{r.assetCode}</td>
                  <td className="border-b px-2 py-2 text-xs">{r.assetName}</td>
                  <td className="border-b px-2 py-2 text-xs">{r.applicantName || r.applicantId}</td>
                  <td className="border-b px-2 py-2 whitespace-nowrap text-xs">{formatDateTime(r.transferTime)}</td>
                  <td className="border-b px-2 py-2 max-w-[8rem] truncate text-xs" title={r.transferLocation || ""}>
                    {r.transferLocation || "—"}
                  </td>
                  <td className="border-b px-2 py-2 max-w-[7rem] truncate text-xs" title={r.remark || ""}>
                    {r.remark || "—"}
                  </td>
                  <td className="border-b px-2 py-2 whitespace-nowrap text-xs">{formatDateTime(r.createTime)}</td>
                  <td className="border-b px-2 py-2 max-w-[6rem] truncate text-xs text-[var(--twin-body)]" title={sumCell(r.assetId, "summaryLocation")}>
                    {sumCell(r.assetId, "summaryLocation")}
                  </td>
                  <td className="border-b px-2 py-2 max-w-[5rem] truncate text-xs text-[var(--twin-body)]" title={sumCell(r.assetId, "summaryUser")}>
                    {sumCell(r.assetId, "summaryUser")}
                  </td>
                  <td className="border-b px-2 py-2 max-w-[5rem] truncate text-xs text-[var(--twin-body)]" title={sumCell(r.assetId, "summaryModel")}>
                    {sumCell(r.assetId, "summaryModel")}
                  </td>
                  <td className="border-b px-2 py-2 text-xs">{statusLabel(r.status)}</td>
                  <td className="border-b px-2 py-2 align-top">
                    <div className="flex max-w-[11rem] flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-1.5 py-0.5 text-[11px] text-[var(--twin-ink)]"
                        onClick={() => void openDetail(r)}
                      >
                        详情
                      </button>
                      <button
                        type="button"
                        className="rounded-twin-sm border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-800"
                        onClick={() => void openLinkModal(r)}
                      >
                        下载链接
                      </button>
                      {r.status === "IN_PROGRESS" && (
                        <>
                          <button
                            type="button"
                            disabled={actionLoading}
                            className="rounded-twin-sm border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-800 disabled:opacity-50"
                            onClick={() => {
                              setContinueRow(r);
                              setAppendUrlsText("");
                            }}
                          >
                            继续办理
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            className="rounded-twin-sm border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-900 disabled:opacity-50"
                            onClick={() => void doWithdrawRow(r)}
                          >
                            撤回
                          </button>
                        </>
                      )}
                      {canDeleteTransfer && (
                        <button
                          type="button"
                          disabled={actionLoading}
                          className="rounded-twin-sm border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-800 disabled:opacity-50"
                          onClick={() => void doDeleteRow(r)}
                        >
                          删除记录
                        </button>
                      )}
                    </div>
                    {latestLink && (
                      <div className="mt-1 max-w-[11rem] text-[10px] leading-tight text-[var(--twin-mute)]">
                        最近链接：
                        <a
                          href={displayLink(latestLink)}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-indigo-600 underline"
                        >
                          {latestLink.fileName || "打开"}
                        </a>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td className="px-3 py-10 text-center text-[var(--twin-mute)]" colSpan={12}>
                  {isLoading ? "加载中..." : "暂无记录"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
        </div>
        <div className="shrink-0 pt-2 flex items-center justify-end gap-3 text-sm text-[var(--twin-body)]">
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
      </div>

      {continueRow && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[var(--twin-ink)]">补充转移后照片</h3>
              <button
                type="button"
                className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 text-sm text-[var(--twin-body)]"
                onClick={() => {
                  setContinueRow(null);
                  setAppendUrlsText("");
                }}
              >
                关闭
              </button>
            </div>

            <div className="mb-4 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3 text-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--twin-mute)]">申请信息</p>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                <div className="flex gap-1">
                  <dt className="shrink-0 text-[var(--twin-mute)]">状态</dt>
                  <dd className="text-[var(--twin-ink)]">{statusLabel(continueRow.status)}</dd>
                </div>
                <div className="flex gap-1 sm:col-span-2">
                  <dt className="shrink-0 text-[var(--twin-mute)]">资产</dt>
                  <dd className="text-[var(--twin-ink)]">
                    {continueRow.assetName}（{continueRow.assetCode}）
                  </dd>
                </div>
                <div className="flex gap-1">
                  <dt className="shrink-0 text-[var(--twin-mute)]">申请人</dt>
                  <dd className="text-[var(--twin-ink)]">{continueRow.applicantName || continueRow.applicantId}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="shrink-0 text-[var(--twin-mute)]">转移时间</dt>
                  <dd className="text-[var(--twin-ink)]">{formatDateTime(continueRow.transferTime)}</dd>
                </div>
                <div className="flex gap-1 sm:col-span-2">
                  <dt className="shrink-0 text-[var(--twin-mute)]">转移地点</dt>
                  <dd className="break-words text-[var(--twin-ink)]">{continueRow.transferLocation || "—"}</dd>
                </div>
                <div className="flex gap-1 sm:col-span-2">
                  <dt className="shrink-0 text-[var(--twin-mute)]">备注</dt>
                  <dd className="break-words text-[var(--twin-ink)]">{continueRow.remark || "—"}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="shrink-0 text-[var(--twin-mute)]">创建时间</dt>
                  <dd className="text-[var(--twin-ink)]">{formatDateTime(continueRow.createTime)}</dd>
                </div>
              </dl>
            </div>

            <div className="mb-4 rounded-twin-lg border border-[var(--twin-hairline)] p-3 text-xs">
              <p className="mb-2 font-semibold text-[var(--twin-body)]">资产摘要（与小程序列表一致）</p>
              <p className="text-[var(--twin-body)]">
                <span className="text-[var(--twin-mute)]">当前存放：</span>
                {summaryHydrating && !summaryByAssetId[continueRow.assetId]
                  ? "加载中…"
                  : (summaryByAssetId[continueRow.assetId]?.summaryLocation ?? "—")}
              </p>
              <p className="text-[var(--twin-body)]">
                <span className="text-[var(--twin-mute)]">使用人：</span>
                {summaryHydrating && !summaryByAssetId[continueRow.assetId]
                  ? "加载中…"
                  : (summaryByAssetId[continueRow.assetId]?.summaryUser ?? "—")}
              </p>
              <p className="text-[var(--twin-body)]">
                <span className="text-[var(--twin-mute)]">型号：</span>
                {summaryHydrating && !summaryByAssetId[continueRow.assetId]
                  ? "加载中…"
                  : (summaryByAssetId[continueRow.assetId]?.summaryModel ?? "—")}
              </p>
            </div>

            {beforePhotosForRecord(continueRow).length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold text-[var(--twin-body)]">转移前照片</p>
                <div className="flex flex-wrap gap-1">
                  {beforePhotosForRecord(continueRow).map((u) => (
                    <button
                      key={u}
                      type="button"
                      className="h-16 w-16 overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)] p-0"
                      onClick={() => setPreviewUrl(u)}
                    >
                      <AutoImage src={u} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold text-[var(--twin-body)]">已有转移后照片（可删除单张）</p>
              {parsePhotoUrlJson(continueRow.photoUrlsAfter).length === 0 ? (
                <p className="text-xs text-[var(--twin-mute)]">暂无</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {parsePhotoUrlJson(continueRow.photoUrlsAfter).map((u) => (
                    <div key={u} className="relative inline-block">
                      <button type="button" className="block h-16 w-16 overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)] p-0" onClick={() => setPreviewUrl(u)}>
                        <AutoImage src={u} alt="" className="h-full w-full object-cover" />
                      </button>
                      <button
                        type="button"
                        disabled={deletingAfterPhoto}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white disabled:opacity-40"
                        onClick={() => void doRemoveAfterPhoto(continueRow.id, u)}
                        title="删除"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="mb-3 flex flex-col gap-1 text-xs text-[var(--twin-body)]">
              <span className="inline-flex items-center gap-2">
                追加照片 URL（每行一个；也可直接上传）
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void handleFileUpload(e)}
                />
                <button
                  type="button"
                  disabled={uploadingFile || actionLoading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-0.5 text-[11px] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft-2)] disabled:opacity-50"
                >
                  <Upload className="h-3 w-3" />
                  {uploadingFile ? "上传中…" : "上传照片"}
                </button>
              </span>
              <textarea
                value={appendUrlsText}
                onChange={(e) => setAppendUrlsText(e.target.value)}
                rows={4}
                className="rounded-twin-sm border border-[var(--twin-hairline-strong)] px-3 py-2 font-mono text-xs"
                placeholder="https://... 或点击「上传照片」选择本地图片"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => void doAppendUrls()}
                className="rounded-twin-sm bg-[var(--twin-ink)] px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                追加到记录
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => void doComplete()}
                className="rounded-twin-sm bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                确认转移完毕
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {detailTransfer && (
        <Portal>
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4" onClick={closeDetail}>
          <div
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[var(--twin-ink)]">物品详情</h3>
              <button type="button" className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 text-sm text-[var(--twin-body)]" onClick={closeDetail}>
                关闭
              </button>
            </div>
            <div className="mb-3 space-y-1 border-b border-[var(--twin-hairline)] pb-3 text-xs">
              <p>
                <span className="text-[var(--twin-mute)]">资产：</span>
                {detailTransfer.assetName}（{detailTransfer.assetCode}）
              </p>
              <p>
                <span className="text-[var(--twin-mute)]">转移状态：</span>
                {statusLabel(detailTransfer.status)}
              </p>
            </div>
            {detailLoading && <p className="text-sm text-[var(--twin-mute)]">加载详情中…</p>}
            {!detailLoading && detailAsset && (
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-xs text-[var(--twin-mute)]">当前位置</span>
                  <br />
                  <span className="text-[var(--twin-ink)]">{displayStoredLocation(detailAsset, detailColumns)}</span>
                </p>
                <p>
                  <span className="text-xs text-[var(--twin-mute)]">锁定状态</span>
                  <br />
                  <span className="text-[var(--twin-ink)]">{detailAsset.locked === 1 ? "已锁定" : "未锁定"}</span>
                </p>
                {detailAsset.note ? (
                  <p>
                    <span className="text-xs text-[var(--twin-mute)]">备注</span>
                    <br />
                    <span className="text-[var(--twin-ink)]">{detailAsset.note}</span>
                  </p>
                ) : null}
                {detailRows.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-[var(--twin-mute)]">资产字段</p>
                    <ul className="space-y-2 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-2">
                      {detailRows.map((row) => (
                        <li key={row.key} className="text-xs">
                          <span className="text-[var(--twin-mute)]">{row.label}</span>
                          <div className="break-all text-[var(--twin-ink)]">{row.value}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {!detailLoading && !detailAsset && <p className="text-sm text-[var(--twin-mute)]">未获取到该资产详情</p>}
          </div>
        </div>
        </Portal>
      )}

      {previewUrl && (
        <Portal>
        <button
          type="button"
          className="fixed inset-0 z-[60] flex cursor-default items-center justify-center border-0 bg-black/80 p-4"
          onClick={() => setPreviewUrl(null)}
          aria-label="关闭预览"
        >
          <AutoImage src={previewUrl} alt="" className="max-h-[90vh] max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        </button>
        </Portal>
      )}

      {linkModalRow && (
        <Portal>
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">PDF 下载链接</h3>
                <p className="text-xs text-[var(--twin-mute)]">{linkModalRow.assetName}（{linkModalRow.assetCode}）</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={linkLoading}
                  onClick={() => void doGenerateLink(linkModalRow)}
                  className="rounded-twin-sm border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs text-emerald-800 disabled:opacity-50"
                >
                  获取下载链接
                </button>
                <button
                  type="button"
                  className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 text-xs text-[var(--twin-body)]"
                  onClick={() => setLinkModalRow(null)}
                >
                  关闭
                </button>
              </div>
            </div>
            <div className="max-h-[55vh] overflow-auto rounded-twin-sm border border-[var(--twin-hairline)]">
              <table className="min-w-full border-collapse text-xs">
                <thead className="border-b-2 border-[var(--app-color-border-strong)]">
                  <tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold shadow-[var(--app-elevation-card)]">
                    <th className="border-b px-2 py-2 text-left">文件名</th>
                    <th className="border-b px-2 py-2 text-left">状态</th>
                    <th className="border-b px-2 py-2 text-left">过期时间</th>
                    <th className="border-b px-2 py-2 text-left">链接</th>
                  </tr>
                </thead>
                <tbody>
                  {linkRows.map((item) => (
                    <tr key={item.id}>
                      <td className="border-b px-2 py-2">{item.fileName}</td>
                      <td className="border-b px-2 py-2">{item.status}</td>
                      <td className="border-b px-2 py-2">{formatDateTimeAsiaShanghai(item.expireAt)}</td>
                      <td className="border-b px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1"
                            onClick={async () => {
                              const text = displayLink(item);
                              await copyTextToClipboard(text);
                              toast.success("已复制");
                            }}
                          >
                            复制
                          </button>
                          <a
                            href={displayLink(item)}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-twin-sm border border-indigo-300 bg-indigo-50 px-2 py-1 text-indigo-800"
                          >
                            打开
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!linkRows.length && (
                    <tr>
                      <td className="px-2 py-8 text-center text-[var(--twin-mute)]" colSpan={4}>
                        {linkLoading ? "加载中..." : '暂无链接，点击“获取下载链接”生成'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
    </AdminPageShell>
  );
}
