import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ClipboardList, Download } from "lucide-react";
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
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

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
  if (v == null || v === "") return "-";
  return String(v).replace("T", " ").slice(0, 19);
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
  if (/^存放地点\d+$/i.test(text)) return "当前存放地点";
  return text;
}

/** 与小程序资产页一致：优先匹配「存放地点」系列表头对应的动态列 */
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
  const [rows, setRows] = useState<AssetTransferRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
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
  const role = authStorage.getRole() || "STUDENT";
  const canDeleteTransfer = hasMinRole(role, "ADMIN");

  const pages = Math.max(1, Math.ceil(total / size));

  const hydrateSummaries = async (list: AssetTransferRecord[]) => {
    setSummaryHydrating(true);
    try {
      const updates: Record<string, AssetSummary> = {};
      const seen = new Set<string>();
      for (const row of list) {
        if (!row.assetId || seen.has(row.assetId)) continue;
        seen.add(row.assetId);
        try {
          const data = await fetchAssetRecords({
            page: 1,
            size: 1,
            assetId: row.assetId,
          });
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
      if (Object.keys(updates).length) {
        setSummaryByAssetId((prev) => ({ ...prev, ...updates }));
      }
    } finally {
      setSummaryHydrating(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchTransferRecords({ page, size, keyword: appliedKeyword || undefined });
      const list = (data.rows || []).map(normalizeTransferRecord);
      setRows(list);
      setTotal(data.total || 0);
      if (continueRow) {
        const next = list.find((x) => x.id === continueRow.id);
        if (next) setContinueRow(next);
      }
      void hydrateSummaries(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, size, appliedKeyword]);

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
      await appendTransferAfterPhotos(continueRow.id, urls);
      toast.success("已追加转移后照片");
      setAppendUrlsText("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "追加失败");
    } finally {
      setActionLoading(false);
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
      await load();
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
      await load();
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
      await load();
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
      await removeTransferAfterPhoto(requestId, photoUrl);
      toast.success("已删除");
      const data = await fetchTransferRecords({ page, size, keyword: appliedKeyword || undefined });
      const list = (data.rows || []).map(normalizeTransferRecord);
      setRows(list);
      setTotal(data.total || 0);
      const nextContinue = list.find((x) => x.id === requestId);
      if (continueRow?.id === requestId && nextContinue) {
        setContinueRow(nextContinue);
      }
      void hydrateSummaries(list);
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
        await navigator.clipboard.writeText(copyText);
      }
      toast.success(created.reused ? "已复用链接（已复制）" : "已生成链接（已复制）");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "获取链接失败");
    } finally {
      setLinkLoading(false);
    }
  };

  const displayLink = (item: TransferPdfLinkItem) => item.downloadUrl || item.downloadPath;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <ClipboardList className="h-6 w-6 text-indigo-600" />
            转移记录
          </h1>
        </div>
        <button onClick={() => void onExport()} className="inline-flex items-center gap-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <Download className="h-4 w-4" />
          导出Excel
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex min-w-[18rem] flex-1 flex-col gap-1 text-xs text-slate-600">
          搜索
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setAppliedKeyword(keyword.trim());
                setPage(1);
              }
            }}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="资产编码/名称/地点/申请人"
          />
        </label>
        <button onClick={() => { setAppliedKeyword(keyword.trim()); setPage(1); }} className="rounded bg-blue-600 px-3 py-2 text-sm text-white">
          查询
        </button>
      </div>

      <AdminDataTableWrap scrollable>
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="border-b px-2 py-2 text-left text-xs">资产编码</th>
              <th className="border-b px-2 py-2 text-left text-xs">资产名称</th>
              <th className="border-b px-2 py-2 text-left text-xs">申请人</th>
              <th className="border-b px-2 py-2 text-left text-xs">转移时间</th>
              <th className="border-b px-2 py-2 text-left text-xs">转移地点</th>
              <th className="border-b px-2 py-2 text-left text-xs">备注</th>
              <th className="border-b px-2 py-2 text-left text-xs">创建时间</th>
              <th className="border-b px-2 py-2 text-left text-xs">当前存放</th>
              <th className="border-b px-2 py-2 text-left text-xs">使用人</th>
              <th className="border-b px-2 py-2 text-left text-xs">型号</th>
              <th className="border-b px-2 py-2 text-left text-xs">状态</th>
              <th className="border-b px-2 py-2 text-left text-xs">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const latestLink = latestLinkByRequest[r.id];
              const sum = summaryByAssetId[r.assetId];
              const sumCell = (field: keyof AssetSummary) =>
                summaryHydrating && !sum ? "加载中…" : (sum?.[field] ?? "—");
              return (
                <tr key={r.id} className="hover:bg-slate-50">
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
                  <td className="border-b px-2 py-2 max-w-[6rem] truncate text-xs text-slate-600" title={sumCell("summaryLocation")}>
                    {sumCell("summaryLocation")}
                  </td>
                  <td className="border-b px-2 py-2 max-w-[5rem] truncate text-xs text-slate-600" title={sumCell("summaryUser")}>
                    {sumCell("summaryUser")}
                  </td>
                  <td className="border-b px-2 py-2 max-w-[5rem] truncate text-xs text-slate-600" title={sumCell("summaryModel")}>
                    {sumCell("summaryModel")}
                  </td>
                  <td className="border-b px-2 py-2 text-xs">{statusLabel(r.status)}</td>
                  <td className="border-b px-2 py-2 align-top">
                    <div className="flex max-w-[11rem] flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-800"
                        onClick={() => void openDetail(r)}
                      >
                        详情
                      </button>
                      <button
                        type="button"
                        className="rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-800"
                        onClick={() => void openLinkModal(r)}
                      >
                        下载链接
                      </button>
                      {r.status === "IN_PROGRESS" && (
                        <>
                          <button
                            type="button"
                            disabled={actionLoading}
                            className="rounded border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-800 disabled:opacity-50"
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
                            className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-900 disabled:opacity-50"
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
                          className="rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-800 disabled:opacity-50"
                          onClick={() => void doDeleteRow(r)}
                        >
                          删除记录
                        </button>
                      )}
                    </div>
                    {latestLink && (
                      <div className="mt-1 max-w-[11rem] text-[10px] leading-tight text-slate-500">
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
                <td className="px-3 py-10 text-center text-slate-500" colSpan={12}>
                  {loading ? "加载中..." : "暂无记录"}
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

      {continueRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">补充转移后照片</h3>
              <button
                type="button"
                className="rounded border border-slate-200 px-3 py-1 text-sm text-slate-600"
                onClick={() => {
                  setContinueRow(null);
                  setAppendUrlsText("");
                }}
              >
                关闭
              </button>
            </div>

            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">申请信息</p>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                <div className="flex gap-1">
                  <dt className="shrink-0 text-slate-500">状态</dt>
                  <dd className="text-slate-800">{statusLabel(continueRow.status)}</dd>
                </div>
                <div className="flex gap-1 sm:col-span-2">
                  <dt className="shrink-0 text-slate-500">资产</dt>
                  <dd className="text-slate-800">
                    {continueRow.assetName}（{continueRow.assetCode}）
                  </dd>
                </div>
                <div className="flex gap-1">
                  <dt className="shrink-0 text-slate-500">申请人</dt>
                  <dd className="text-slate-800">{continueRow.applicantName || continueRow.applicantId}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="shrink-0 text-slate-500">转移时间</dt>
                  <dd className="text-slate-800">{formatDateTime(continueRow.transferTime)}</dd>
                </div>
                <div className="flex gap-1 sm:col-span-2">
                  <dt className="shrink-0 text-slate-500">转移地点</dt>
                  <dd className="break-words text-slate-800">{continueRow.transferLocation || "—"}</dd>
                </div>
                <div className="flex gap-1 sm:col-span-2">
                  <dt className="shrink-0 text-slate-500">备注</dt>
                  <dd className="break-words text-slate-800">{continueRow.remark || "—"}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="shrink-0 text-slate-500">创建时间</dt>
                  <dd className="text-slate-800">{formatDateTime(continueRow.createTime)}</dd>
                </div>
              </dl>
            </div>

            <div className="mb-4 rounded-lg border border-slate-200 p-3 text-xs">
              <p className="mb-2 font-semibold text-slate-600">资产摘要（与小程序列表一致）</p>
              <p className="text-slate-700">
                <span className="text-slate-500">当前存放：</span>
                {summaryHydrating && !summaryByAssetId[continueRow.assetId]
                  ? "加载中…"
                  : (summaryByAssetId[continueRow.assetId]?.summaryLocation ?? "—")}
              </p>
              <p className="text-slate-700">
                <span className="text-slate-500">使用人：</span>
                {summaryHydrating && !summaryByAssetId[continueRow.assetId]
                  ? "加载中…"
                  : (summaryByAssetId[continueRow.assetId]?.summaryUser ?? "—")}
              </p>
              <p className="text-slate-700">
                <span className="text-slate-500">型号：</span>
                {summaryHydrating && !summaryByAssetId[continueRow.assetId]
                  ? "加载中…"
                  : (summaryByAssetId[continueRow.assetId]?.summaryModel ?? "—")}
              </p>
            </div>

            {beforePhotosForRecord(continueRow).length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold text-slate-600">转移前照片</p>
                <div className="flex flex-wrap gap-1">
                  {beforePhotosForRecord(continueRow).map((u) => (
                    <button
                      key={u}
                      type="button"
                      className="h-16 w-16 overflow-hidden rounded border border-slate-200 p-0"
                      onClick={() => setPreviewUrl(u)}
                    >
                      <img src={u} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold text-slate-600">已有转移后照片（可删除单张）</p>
              {parsePhotoUrlJson(continueRow.photoUrlsAfter).length === 0 ? (
                <p className="text-xs text-slate-400">暂无</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {parsePhotoUrlJson(continueRow.photoUrlsAfter).map((u) => (
                    <div key={u} className="relative inline-block">
                      <button type="button" className="block h-16 w-16 overflow-hidden rounded border border-slate-200 p-0" onClick={() => setPreviewUrl(u)}>
                        <img src={u} alt="" className="h-full w-full object-cover" />
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

            <label className="mb-3 flex flex-col gap-1 text-xs text-slate-600">
              追加照片 URL（每行一个；与小程序一致可填可访问的图片地址）
              <textarea
                value={appendUrlsText}
                onChange={(e) => setAppendUrlsText(e.target.value)}
                rows={4}
                className="rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                placeholder="https://... 或业务系统返回的媒体地址"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => void doAppendUrls()}
                className="rounded bg-slate-700 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                追加到记录
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => void doComplete()}
                className="rounded bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                确认转移完毕
              </button>
            </div>
          </div>
        </div>
      )}

      {detailTransfer && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4" onClick={closeDetail}>
          <div
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">物品详情</h3>
              <button type="button" className="rounded border border-slate-200 px-3 py-1 text-sm text-slate-600" onClick={closeDetail}>
                关闭
              </button>
            </div>
            <div className="mb-3 space-y-1 border-b border-slate-100 pb-3 text-xs">
              <p>
                <span className="text-slate-500">资产：</span>
                {detailTransfer.assetName}（{detailTransfer.assetCode}）
              </p>
              <p>
                <span className="text-slate-500">转移状态：</span>
                {statusLabel(detailTransfer.status)}
              </p>
            </div>
            {detailLoading && <p className="text-sm text-slate-500">加载详情中…</p>}
            {!detailLoading && detailAsset && (
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-xs text-slate-500">当前位置</span>
                  <br />
                  <span className="text-slate-900">{displayStoredLocation(detailAsset, detailColumns)}</span>
                </p>
                <p>
                  <span className="text-xs text-slate-500">锁定状态</span>
                  <br />
                  <span className="text-slate-900">{detailAsset.locked === 1 ? "已锁定" : "未锁定"}</span>
                </p>
                {detailAsset.note ? (
                  <p>
                    <span className="text-xs text-slate-500">备注</span>
                    <br />
                    <span className="text-slate-900">{detailAsset.note}</span>
                  </p>
                ) : null}
                {detailRows.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-slate-500">资产字段</p>
                    <ul className="space-y-2 rounded border border-slate-100 bg-slate-50/50 p-2">
                      {detailRows.map((row) => (
                        <li key={row.key} className="text-xs">
                          <span className="text-slate-500">{row.label}</span>
                          <div className="break-all text-slate-900">{row.value}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {!detailLoading && !detailAsset && <p className="text-sm text-slate-500">未获取到该资产详情</p>}
          </div>
        </div>
      )}

      {previewUrl && (
        <button
          type="button"
          className="fixed inset-0 z-[60] flex cursor-default items-center justify-center border-0 bg-black/80 p-4"
          onClick={() => setPreviewUrl(null)}
          aria-label="关闭预览"
        >
          <img src={previewUrl} alt="" className="max-h-[90vh] max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        </button>
      )}

      {linkModalRow && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">PDF 下载链接</h3>
                <p className="text-xs text-slate-500">{linkModalRow.assetName}（{linkModalRow.assetCode}）</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={linkLoading}
                  onClick={() => void doGenerateLink(linkModalRow)}
                  className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs text-emerald-800 disabled:opacity-50"
                >
                  获取下载链接
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-700"
                  onClick={() => setLinkModalRow(null)}
                >
                  关闭
                </button>
              </div>
            </div>
            <div className="max-h-[55vh] overflow-auto rounded border border-slate-200">
              <table className="min-w-full border-collapse text-xs">
                <thead className="bg-slate-50">
                  <tr>
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
                      <td className="border-b px-2 py-2">{item.expireAt ? String(item.expireAt).replace("T", " ").slice(0, 19) : "-"}</td>
                      <td className="border-b px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-1"
                            onClick={async () => {
                              const text = displayLink(item);
                              await navigator.clipboard.writeText(text);
                              toast.success("已复制");
                            }}
                          >
                            复制
                          </button>
                          <a
                            href={displayLink(item)}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-indigo-800"
                          >
                            打开
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!linkRows.length && (
                    <tr>
                      <td className="px-2 py-8 text-center text-slate-500" colSpan={4}>
                        {linkLoading ? "加载中..." : "暂无链接，点击“获取下载链接”生成"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
