/**
 * 我的领用记录 + 回收站（与小程序 suppliesMine 行为对齐：修改、导出/预览、删除、恢复、PDF 链接）。
 */
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import toast from "react-hot-toast";
import { copyTextToClipboard } from "@/lib/copyToClipboard";
import {
  createOrReuseSupplyClaimPdfLink,
  fetchSupplyClaimDetail,
  listSupplyClaimPdfLinks,
  type SupplyClaimOrder,
  type SupplyClaimPdfLinkItem,
} from "@/api/domains/supplies.api";
import {
  useSupplyMine,
  useMySupplyClaimRecycle,
  useDeleteMySupplyClaim,
  useRestoreMySupplyClaimRecycle,
} from "@/api/hooks/useSupplies";
import { ADMIN_PENDING_BADGES_REFRESH_EVENT } from "@/features/admin/adminPendingBadgesEvents";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";
import { Portal } from "@/components/Portal";
import DataSkeleton from "@/components/ui/DataSkeleton";
import EmptyState from "@/components/ui/EmptyState";
import { formatDateTimeAsiaShanghai, formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "待出库",
  FULFILLED: "已完成",
  WITHDRAWN: "已撤回",
  CLOSED: "已关闭",
  DELETED: "已删除",
};

function toTimeText(v?: string | null) {
  return formatDateTimeAsiaShanghaiShort(v);
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
  const [detail, setDetail] = useState<SupplyClaimOrder | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [linkModalRow, setLinkModalRow] = useState<SupplyClaimOrder | null>(null);
  const [linkRows, setLinkRows] = useState<SupplyClaimPdfLinkItem[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);

  const { data: mineData, isLoading: mineLoading } = useSupplyMine({ page, size });
  const { data: recycleData, isLoading: recycleLoading } = useMySupplyClaimRecycle({ page: recyclePage, size });

  const deleteMut = useDeleteMySupplyClaim();
  const restoreMut = useRestoreMySupplyClaimRecycle();

  const rows = mineData?.data ?? [];
  const total = mineData?.total ?? 0;
  const recycleRows = recycleData?.data ?? [];
  const recycleTotal = recycleData?.total ?? 0;

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
    navigate(`${toAdminRoutePath("/admin/supplies")}?reviseClaimId=${encodeURIComponent(id)}`, {
      state: { returnTo: `${location.pathname}${location.search}` },
    });
  };

  const goExport = (id: string) => {
    navigate(`${toAdminRoutePath("/admin/supplies/claim-export")}?claimId=${encodeURIComponent(id)}`, {
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
      if (copyText) await copyTextToClipboard(copyText);
      toast.success(created.reused ? "已复用链接（已复制）" : "已生成链接（已复制）");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "获取链接失败");
    } finally {
      setLinkLoading(false);
    }
  };

  const confirmDelete = () => {
    const id = deleteId;
    if (!id) return;
    setDeleteId(null);
    deleteMut.mutate(id, {
      onSuccess: () => window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT)),
    });
  };

  const restore = (id: string) => {
    restoreMut.mutate(id);
  };

  const loading = tab === "mine" ? mineLoading : recycleLoading;

  return (
    <div className="space-y-4">
      <AdminSubPageHeader
        fallbackTo="/admin/supplies"
        backLabel="返回领用物资"
        title="我的领用记录"
        description="查看与修改待出库单、导出/预览、PDF 链接与回收站；与小程序「我的领用」同源。"
      />
      <div className="inline-flex rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-0.5 text-xs font-medium">
        <button
          type="button"
          className={`rounded-full px-4 py-1.5 ${tab === "mine" ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-sm" : "text-[var(--twin-body)]"}`}
          onClick={() => setTab("mine")}
        >
          我的记录
        </button>
        <button
          type="button"
          className={`rounded-full px-4 py-1.5 ${tab === "recycle" ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-sm" : "text-[var(--twin-body)]"}`}
          onClick={() => setTab("recycle")}
        >
          回收站
        </button>
      </div>

      {loading ? <DataSkeleton variant="table" rows={4} /> : null}

      {tab === "mine" && !loading && rows.length === 0 ? (
        <EmptyState title="暂无记录" description="去领用物资页提交第一单吧" />
      ) : null}

      {tab === "mine" ? (
        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              role="button"
              tabIndex={0}
              className="cursor-pointer rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1 transition hover:border-[var(--twin-hairline-strong)]"
              onClick={() => void openDetail(row.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") void openDetail(row.id);
              }}
            >
              <div className="font-medium text-[var(--twin-ink)]">领用</div>
              <div className="mt-1 text-xs text-[var(--twin-mute)]">
                {STATUS_LABEL[String(row.status || "").toUpperCase()] || row.status} · {toTimeText(row.createdAt)}
              </div>
              {String(row.status || "").toUpperCase() === "FULFILLED" ? (
                <div className="mt-1 text-xs text-[var(--twin-body)]">
                  出库 {toTimeText(row.fulfilledAt)}
                  {row.fulfilledByName ? ` · ${row.fulfilledByName}` : ""}
                </div>
              ) : null}
              <div className="mt-2 text-[11px] text-[var(--twin-mute)]">点击查看明细</div>
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
                  className="rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs font-medium text-[var(--twin-body)]"
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
        <EmptyState title="回收站为空" />
      ) : null}

      {tab === "recycle" ? (
        <div className="space-y-3">
          {recycleRows.map((row) => (
            <div key={row.id} className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-4 text-sm">
              <div className="font-medium text-[var(--twin-body)]">
                {STATUS_LABEL[String(row.status || "").toUpperCase()] || row.status} · {toTimeText(row.createdAt)}
              </div>
              <div className="mt-1 text-xs text-[var(--twin-mute)]">
                删除：{toTimeText(row.deletedTime)} · 清理：{toTimeText(row.purgeAfterTime)}
              </div>
              <button
                type="button"
                className="mt-3 rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-white"
                onClick={() => restore(row.id)}
              >
                恢复
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "mine" && total > size ? (
        <div className="flex items-center gap-2 text-xs text-[var(--twin-body)]">
          <button
            type="button"
            className="rounded border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span>第 {page} 页</span>
          <button
            type="button"
            className="rounded border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-40"
            disabled={page * size >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      ) : null}

      {tab === "recycle" && recycleTotal > size ? (
        <div className="flex items-center gap-2 text-xs text-[var(--twin-body)]">
          <button
            type="button"
            className="rounded border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-40"
            disabled={recyclePage <= 1}
            onClick={() => setRecyclePage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span>第 {recyclePage} 页</span>
          <button
            type="button"
            className="rounded border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-40"
            disabled={recyclePage * size >= recycleTotal}
            onClick={() => setRecyclePage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      ) : null}

      {detailOpen && detail ? (
        <Portal>
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setDetailOpen(false)}>
            <div className="max-h-[82vh] w-full max-w-lg overflow-hidden rounded-twin-xl bg-[var(--twin-canvas)] shadow-twin-level-4" onClick={(e) => e.stopPropagation()}>
              <div className="border-b border-[var(--twin-hairline)] px-4 py-3">
                <div className="text-base font-semibold text-[var(--twin-ink)]">领用明细</div>
                <div className="text-xs text-[var(--twin-mute)]">
                  {STATUS_LABEL[String(detail.status || "").toUpperCase()] || detail.status} · {toTimeText(detail.createdAt)}
                </div>
              </div>
              <div className="max-h-[50vh] space-y-2 overflow-y-auto px-4 py-3 text-sm">
                <div className="text-[var(--twin-body)]">
                  申请人 <span className="font-medium text-[var(--twin-ink)]">{detail.applicantName || "本人"}</span>
                </div>
                {String(detail.status || "").toUpperCase() === "FULFILLED" ? (
                  <div className="text-xs text-[var(--twin-mute)]">
                    出库完成 {toTimeText(detail.fulfilledAt)}
                    {detail.fulfilledByName ? ` · 操作人 ${detail.fulfilledByName}` : ""}
                  </div>
                ) : null}
                {(detail.lines || []).map((line) => (
                  <div key={line.id} className="rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2">
                    <div className="font-medium text-[var(--twin-ink)]">{line.snapshotName}</div>
                    <div className="text-xs text-[var(--twin-body)]">
                      申请 {line.qty} · 实发 {line.fulfilledQty ?? 0}
                    </div>
                    {line.remark ? (
                      <div className="mt-1 text-xs text-[var(--twin-mute)]">备注：{line.remark}</div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-[var(--twin-hairline)] px-4 py-3">
                {String(detail.status || "").toUpperCase() === "PENDING" ? (
                  <button
                    type="button"
                    className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white"
                    onClick={() => goRevise(detail.id)}
                  >
                    修改
                  </button>
                ) : null}
                <button type="button" className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-body)]" onClick={() => setDetailOpen(false)}>
                  关闭
                </button>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {deleteId ? (
        <Portal>
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4" onClick={() => setDeleteId(null)}>
            <div className="w-full max-w-sm rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-4" onClick={(e) => e.stopPropagation()}>
              <div className="text-base font-semibold text-[var(--twin-ink)]">删除记录</div>
              <p className="mt-2 text-sm text-[var(--twin-body)]">确认删除该领用工单？删除后可在回收站恢复。</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)]" onClick={() => setDeleteId(null)}>
                  取消
                </button>
                <button type="button" className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white" onClick={() => confirmDelete()}>
                  删除
                </button>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {linkModalRow ? (
        <Portal>
          <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 p-4" onClick={() => setLinkModalRow(null)}>
          <div className="w-full max-w-2xl rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">PDF 下载链接</h3>
                <p className="text-xs text-[var(--twin-mute)]">领用单 {linkModalRow.id}</p>
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
                  className="rounded border border-[var(--twin-hairline)] px-3 py-1 text-xs text-[var(--twin-body)]"
                  onClick={() => setLinkModalRow(null)}
                >
                  关闭
                </button>
              </div>
            </div>
            <div className="max-h-[55vh] overflow-auto rounded border border-[var(--twin-hairline)]">
              <table className="min-w-full border-collapse text-xs">
                <thead className="bg-[var(--twin-canvas-soft)]">
                  <tr>
                    <th className="border-b border-[var(--twin-hairline)] px-2 py-2 text-left">文件名</th>
                    <th className="border-b border-[var(--twin-hairline)] px-2 py-2 text-left">状态</th>
                    <th className="border-b border-[var(--twin-hairline)] px-2 py-2 text-left">过期时间</th>
                    <th className="border-b border-[var(--twin-hairline)] px-2 py-2 text-left">链接</th>
                  </tr>
                </thead>
                <tbody>
                  {linkRows.map((item) => (
                    <tr key={item.id}>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{item.fileName}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{item.status}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">{formatDateTimeAsiaShanghai(item.expireAt)}</td>
                      <td className="border-b border-[var(--twin-hairline)] px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="rounded border border-[var(--twin-hairline)] px-2 py-1"
                            onClick={async () => {
                              await copyTextToClipboard(displayLink(item));
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
                      <td className="px-2 py-8 text-center text-[var(--twin-mute)]" colSpan={4}>
                        {linkLoading ? "加载中…" : "暂无链接，点击「获取下载链接」生成"}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </Portal>
      ) : null}
    </div>
  );
}
