/**
 * 我的领用记录 + 回收站（与小程序 suppliesMine 行为对齐：修改、导出/预览、删除、恢复、PDF 链接）。
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import {
  createOrReuseSupplyClaimPdfLink,
  deleteMySupplyClaim,
  fetchMySupplyClaimRecycle,
  fetchSupplyClaimDetail,
  fetchSupplyMine,
  listSupplyClaimPdfLinks,
  restoreMySupplyClaimRecycle,
  type SupplyClaimOrder,
  type SupplyClaimPdfLinkItem,
} from "@/api/domains/supplies.api";
import { ADMIN_PENDING_BADGES_REFRESH_EVENT } from "@/features/admin/adminPendingBadgesEvents";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "待出库",
  FULFILLED: "已完成",
  WITHDRAWN: "已撤回",
  CLOSED: "已关闭",
  DELETED: "已删除",
};

function toTimeText(v?: string | null) {
  if (!v) return "-";
  return String(v).replace("T", " ").slice(0, 16);
}

function displayLink(item: SupplyClaimPdfLinkItem) {
  return item.downloadUrl || item.downloadPath || "";
}

export default function AdminSuppliesMinePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState<"mine" | "recycle">("mine");
  const [page, setPage] = useState(1);
  const [recyclePage, setRecyclePage] = useState(1);
  const size = 10;
  const [rows, setRows] = useState<SupplyClaimOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [recycleRows, setRecycleRows] = useState<SupplyClaimOrder[]>([]);
  const [recycleTotal, setRecycleTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<SupplyClaimOrder | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [linkModalRow, setLinkModalRow] = useState<SupplyClaimOrder | null>(null);
  const [linkRows, setLinkRows] = useState<SupplyClaimPdfLinkItem[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mine, rec] = await Promise.all([
        fetchSupplyMine({ page, size }),
        fetchMySupplyClaimRecycle({ page: recyclePage, size }),
      ]);
      setRows(mine.data || []);
      setTotal(Number(mine.total || 0));
      setRecycleRows(rec.data || []);
      setRecycleTotal(Number(rec.total || 0));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, recyclePage, size]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: string) => {
    try {
      const d = await fetchSupplyClaimDetail(id);
      setDetail(d);
      setDetailOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    }
  };

  const goRevise = (id: string) => {
    setDetailOpen(false);
    setDetail(null);
    navigate(`/admin/supplies?reviseClaimId=${encodeURIComponent(id)}`, {
      state: { returnTo: `${location.pathname}${location.search}` },
    });
  };

  const goExport = (id: string) => {
    navigate(`/admin/supplies/claim-export?claimId=${encodeURIComponent(id)}`, {
      state: { returnTo: `${location.pathname}${location.search}` },
    });
  };

  const openLinkModal = async (row: SupplyClaimOrder) => {
    setLinkModalRow(row);
    setLinkLoading(true);
    try {
      const data = await listSupplyClaimPdfLinks(row.id);
      setLinkRows(data.links || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载链接失败");
      setLinkRows([]);
    } finally {
      setLinkLoading(false);
    }
  };

  const doGenerateLink = async (row: SupplyClaimOrder) => {
    setLinkLoading(true);
    try {
      const created = await createOrReuseSupplyClaimPdfLink(row.id);
      const data = await listSupplyClaimPdfLinks(row.id);
      setLinkRows(data.links || []);
      const copyText = created.downloadUrl || created.downloadPath;
      if (copyText) await navigator.clipboard.writeText(copyText);
      toast.success(created.reused ? "已复用链接（已复制）" : "已生成链接（已复制）");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "获取链接失败");
    } finally {
      setLinkLoading(false);
    }
  };

  const confirmDelete = async () => {
    const id = deleteId;
    if (!id) return;
    setDeleteId(null);
    try {
      await deleteMySupplyClaim(id);
      toast.success("已删除");
      await load();
      window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const restore = async (id: string) => {
    try {
      await restoreMySupplyClaimRecycle(id);
      toast.success("已恢复");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "恢复失败");
    }
  };

  return (
    <div className="space-y-4">
      <AdminSubPageHeader
        fallbackTo="/admin/supplies"
        backLabel="返回领用物资"
        title="我的领用记录"
        description="查看与修改待出库单、导出/预览、PDF 链接与回收站；与小程序「我的领用」同源。"
      />
      <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
        <button
          type="button"
          className={`rounded-full px-4 py-1.5 ${tab === "mine" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          onClick={() => setTab("mine")}
        >
          我的记录
        </button>
        <button
          type="button"
          className={`rounded-full px-4 py-1.5 ${tab === "recycle" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          onClick={() => setTab("recycle")}
        >
          回收站
        </button>
      </div>

      {loading ? <div className="text-sm text-slate-500">加载中…</div> : null}

      {tab === "mine" && !loading && rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 py-10 text-center text-sm text-slate-500">暂无记录</div>
      ) : null}

      {tab === "mine" ? (
        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              role="button"
              tabIndex={0}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
              onClick={() => void openDetail(row.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") void openDetail(row.id);
              }}
            >
              <div className="font-medium text-slate-800">领用</div>
              <div className="mt-1 text-xs text-slate-500">
                {STATUS_LABEL[String(row.status || "").toUpperCase()] || row.status} · {toTimeText(row.createdAt)}
              </div>
              {String(row.status || "").toUpperCase() === "FULFILLED" ? (
                <div className="mt-1 text-xs text-slate-600">
                  出库 {toTimeText(row.fulfilledAt)}
                  {row.fulfilledByName ? ` · ${row.fulfilledByName}` : ""}
                </div>
              ) : null}
              <div className="mt-2 text-[11px] text-slate-400">点击查看明细</div>
              <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                {String(row.status || "").toUpperCase() === "PENDING" ? (
                  <button
                    type="button"
                    className="rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-white"
                    onClick={() => goRevise(row.id)}
                  >
                    修改
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                  onClick={() => goExport(row.id)}
                >
                  导出/预览
                </button>
                <button
                  type="button"
                  className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800"
                  onClick={() => void openLinkModal(row)}
                >
                  PDF 链接
                </button>
                <button
                  type="button"
                  className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
                  onClick={() => setDeleteId(row.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "recycle" && !loading && recycleRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 py-10 text-center text-sm text-slate-500">回收站为空</div>
      ) : null}

      {tab === "recycle" ? (
        <div className="space-y-3">
          {recycleRows.map((row) => (
            <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm">
              <div className="font-medium text-slate-700">
                {STATUS_LABEL[String(row.status || "").toUpperCase()] || row.status} · {toTimeText(row.createdAt)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                删除：{toTimeText(row.deletedTime)} · 清理：{toTimeText(row.purgeAfterTime)}
              </div>
              <button
                type="button"
                className="mt-3 rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-white"
                onClick={() => void restore(row.id)}
              >
                恢复
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "mine" && total > size ? (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span>第 {page} 页</span>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            disabled={page * size >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      ) : null}

      {tab === "recycle" && recycleTotal > size ? (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            disabled={recyclePage <= 1}
            onClick={() => setRecyclePage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span>第 {recyclePage} 页</span>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            disabled={recyclePage * size >= recycleTotal}
            onClick={() => setRecyclePage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      ) : null}

      {detailOpen && detail ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setDetailOpen(false)}>
          <div className="max-h-[82vh] w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="text-base font-semibold text-slate-900">领用明细</div>
              <div className="text-xs text-slate-500">
                {STATUS_LABEL[String(detail.status || "").toUpperCase()] || detail.status} · {toTimeText(detail.createdAt)}
              </div>
            </div>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto px-4 py-3 text-sm">
              <div className="text-slate-600">
                申请人 <span className="font-medium text-slate-900">{detail.applicantName || "本人"}</span>
              </div>
              {String(detail.status || "").toUpperCase() === "FULFILLED" ? (
                <div className="text-xs text-slate-500">
                  出库完成 {toTimeText(detail.fulfilledAt)}
                  {detail.fulfilledByName ? ` · 操作人 ${detail.fulfilledByName}` : ""}
                </div>
              ) : null}
              {(detail.lines || []).map((line) => (
                <div key={line.id} className="rounded border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <div className="font-medium text-slate-800">{line.snapshotName}</div>
                  <div className="text-xs text-slate-600">
                    申请 {line.qty} · 实发 {line.fulfilledQty ?? 0}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
              {String(detail.status || "").toUpperCase() === "PENDING" ? (
                <button
                  type="button"
                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white"
                  onClick={() => goRevise(detail.id)}
                >
                  修改
                </button>
              ) : null}
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700" onClick={() => setDetailOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteId ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4" onClick={() => setDeleteId(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold text-slate-900">删除记录</div>
            <p className="mt-2 text-sm text-slate-600">确认删除该领用工单？删除后可在回收站恢复。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" onClick={() => setDeleteId(null)}>
                取消
              </button>
              <button type="button" className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white" onClick={() => void confirmDelete()}>
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {linkModalRow ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 p-4" onClick={() => setLinkModalRow(null)}>
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">PDF 下载链接</h3>
                <p className="text-xs text-slate-500">领用单 {linkModalRow.id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
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
                              await navigator.clipboard.writeText(displayLink(item));
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
                  {!linkRows.length ? (
                    <tr>
                      <td className="px-2 py-8 text-center text-slate-500" colSpan={4}>
                        {linkLoading ? "加载中…" : "暂无链接，点击「获取下载链接」生成"}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
