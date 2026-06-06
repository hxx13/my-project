import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import {
  downloadPersonalClaimExcel,
  fetchSupplyClaimDetail,
  type SupplyClaimOrder,
  type SupplyClaimLine,
} from "@/api/domains/supplies.api";
import {
  useSupplyPendingTasks,
  useSupplyRecentClosed,
  useFulfillSupplyClaim,
  useDeleteAdminSupplyClaim,
  useAdminClaimRecycle,
  usePurgeAdminClaimByIds,
  usePurgeAllAdminClaims,
  useRestoreAdminClaim,
} from "@/api/hooks/useSupplies";
import { Portal } from "@/components/Portal";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";
import DataSkeleton from "@/components/ui/DataSkeleton";
import EmptyState from "@/components/ui/EmptyState";

type TabKey = "pending" | "done";

function toTextTime(v?: string | null) {
  if (!v) return "-";
  return String(v).replace("T", " ").slice(0, 19);
}

function claimStatusText(s: string) {
  if (s === "PENDING") return "待出库";
  if (s === "FULFILLED") return "已完成";
  if (s === "WITHDRAWN") return "已撤回";
  return s || "-";
}

function applicantLabel(o: SupplyClaimOrder) {
  return (o.applicantName && o.applicantName.trim()) || o.userId || "-";
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminSuppliesProcessPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = authStorage.getRole() || "STUDENT";
  const canProcess = hasMinRole(role, "SENIOR");
  const canReadMine = hasMinRole(role, "STAFF");
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [detail, setDetail] = useState<SupplyClaimOrder | null>(null);
  const [grantMap, setGrantMap] = useState<Record<number, boolean>>({});
  const [selectedRecycleIds, setSelectedRecycleIds] = useState<string[]>([]);

  const { data: pendingRows = [], isLoading: pendingLoading } = useSupplyPendingTasks();
  const { data: doneRows = [], isLoading: doneLoading } = useSupplyRecentClosed(60);
  const { data: recycleData, isLoading: recycleLoading } = useAdminClaimRecycle({ page: 1, size: 200 });
  const recycleRows = recycleData?.data ?? [];

  const fulfillMut = useFulfillSupplyClaim();
  const deleteMut = useDeleteAdminSupplyClaim();
  const purgeByIdsMut = usePurgeAdminClaimByIds();
  const purgeAllMut = usePurgeAllAdminClaims();
  const restoreMut = useRestoreAdminClaim();

  const openClaimDetail = async (id: string) => {
    try {
      const d = await fetchSupplyClaimDetail(id);
      setDetail(d);
      const initial: Record<number, boolean> = {};
      (d.lines || []).forEach((line) => {
        initial[line.id] = line.fulfilledQty > 0;
      });
      setGrantMap(initial);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载详情失败");
    }
  };

  const submitFulfill = async () => {
    if (!detail || !canProcess || detail.status !== "PENDING") return;
    const lines = (detail.lines || []).map((line: SupplyClaimLine) => ({
      lineId: line.id,
      grant: !!grantMap[line.id],
    }));
    try {
      await fulfillMut.mutateAsync({ id: detail.id, lines });
      setDetail(null);
      setGrantMap({});
    } catch {
      // error handled by mutation
    }
  };

  const goAuditExport = (claimId: string) => {
    navigate(`/admin/supplies/audit-export?tab=personal&claimId=${encodeURIComponent(claimId)}`, {
      state: { returnTo: `${location.pathname}${location.search}` },
    });
  };

  const exportClaimExcel = async (claimId: string) => {
    try {
      const blob = await downloadPersonalClaimExcel(claimId);
      downloadBlob(blob, `supply-claim-${claimId}.xlsx`);
      toast.success("已导出 Excel");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败");
    }
  };

  const loading = pendingLoading || doneLoading;

  const renderClaimCard = (row: SupplyClaimOrder, done = false) => (
    <div key={row.id} className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-[var(--twin-ink)]">{applicantLabel(row)}</div>
        <div className="text-xs text-[var(--twin-mute)]">{claimStatusText(row.status)}</div>
      </div>
      <div className="mt-1 text-xs text-[var(--twin-mute)]">
        申请：{toTextTime(row.createdAt)}
        {done ? ` | 完成：${toTextTime(row.fulfilledAt)}` : ""}
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
          onClick={() => goAuditExport(row.id)}
        >
          预览/导出页
        </button>
        <button
          type="button"
          className="rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs font-medium text-[var(--twin-body)]"
          onClick={() => void exportClaimExcel(row.id)}
        >
          导出 Excel
        </button>
        <button
          type="button"
          className="rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-white"
          onClick={() => openClaimDetail(row.id)}
        >
          查看并处理
        </button>
        {canProcess ? (
          <button
            type="button"
            className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
            onClick={() => {
              if (!window.confirm("确认删除该申请单到回收站？")) return;
              deleteMut.mutate(row.id);
            }}
          >
            删除申请单
          </button>
        ) : null}
      </div>
    </div>
  );

  if (!canReadMine) {
    return <div className="p-6 text-sm text-[var(--twin-body)]">无权限访问物资处理页。</div>;
  }

  return (
    <div className="space-y-4">
      <AdminSubPageHeader
        fallbackTo="/admin/supplies"
        backLabel="返回领用物资"
        title="物资处理台"
        description="处理待出库领用单、查看已结单与回收站；预览/导出跳转至领用审计页的个人单次视图。"
      />
      <section className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-5 shadow-twin-level-1">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--twin-ink)]">物资处理台</h2>
          <div className="inline-flex rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-0.5 text-xs font-medium">
            <button
              type="button"
              className={`rounded-full px-4 py-1.5 ${activeTab === "pending" ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-sm" : "text-[var(--twin-body)]"}`}
              onClick={() => setActiveTab("pending")}
            >
              待处理
            </button>
            <button
              type="button"
              className={`rounded-full px-4 py-1.5 ${activeTab === "done" ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-sm" : "text-[var(--twin-body)]"}`}
              onClick={() => setActiveTab("done")}
            >
              已处理
            </button>
          </div>
        </div>

        {loading ? <DataSkeleton variant="table" rows={4} /> : null}

        {!loading && activeTab === "pending" ? (
          <div className="space-y-2">
            {pendingRows.map((row) => renderClaimCard(row, false))}
            {pendingRows.length === 0 ? <EmptyState title="暂无待处理物资单" /> : null}
          </div>
        ) : null}

        {!loading && activeTab === "done" ? (
          <div className="space-y-2">
            {doneRows.map((row) => renderClaimCard(row, true))}
            {doneRows.length === 0 ? <EmptyState title="暂无已处理物资单" /> : null}
          </div>
        ) : null}
      </section>

      {canProcess ? (
        <section className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-5 shadow-twin-level-1">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-[var(--twin-ink)]">申请单回收站（7天后自动清空）</h3>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 disabled:opacity-50"
                disabled={purgeByIdsMut.isPending}
                onClick={() => {
                  if (!selectedRecycleIds.length) return toast.error("请先勾选回收站申请单");
                  if (!window.confirm(`确认彻底删除 ${selectedRecycleIds.length} 条回收站申请单吗？`)) return;
                  purgeByIdsMut.mutate(selectedRecycleIds, {
                    onSuccess: () => setSelectedRecycleIds([]),
                  });
                }}
              >
                选择性彻底删除
              </button>
              <button
                type="button"
                className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                disabled={purgeAllMut.isPending}
                onClick={() => {
                  if (!window.confirm("确认一键清空回收站吗？")) return;
                  purgeAllMut.mutate(undefined, {
                    onSuccess: () => setSelectedRecycleIds([]),
                  });
                }}
              >
                一键清空
              </button>
            </div>
          </div>
          {recycleLoading ? <DataSkeleton variant="table" rows={3} /> : null}
          {!recycleLoading && recycleRows.length === 0 ? <EmptyState title="回收站为空" /> : null}
          <div className="space-y-2">
            {recycleRows.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2 text-sm">
                <span className="text-[var(--twin-body)]">{row.id}（{applicantLabel(row)} / {claimStatusText(row.status)}）</span>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedRecycleIds.includes(row.id)}
                    onChange={(e) => setSelectedRecycleIds((prev) => e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id))}
                  />
                  <button
                    type="button"
                    className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 disabled:opacity-50"
                    disabled={restoreMut.isPending}
                    onClick={() => {
                      restoreMut.mutate(row.id, {
                        onSuccess: () => setSelectedRecycleIds((prev) => prev.filter((id) => id !== row.id)),
                      });
                    }}
                  >
                    恢复
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {detail ? (
        <Portal>
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => { setDetail(null); setGrantMap({}); }}>
          <div className="w-full max-w-xl rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[var(--twin-ink)]">物资处理详情</h3>
              <button
                type="button"
                className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)]"
                onClick={() => { setDetail(null); setGrantMap({}); }}
              >
                关闭
              </button>
            </div>
            <div className="mb-2 text-sm text-[var(--twin-body)]">
              申请人：{applicantLabel(detail)} | 状态：{claimStatusText(detail.status)} | 申请：{toTextTime(detail.createdAt)}
            </div>
            <div className="space-y-2">
              {(detail.lines || []).map((line) => (
                <div key={line.id} className="flex items-center justify-between rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2 text-sm">
                  <span className="text-[var(--twin-ink)]">{line.snapshotName}（申 {line.qty} / 发 {line.fulfilledQty ?? 0}）</span>
                  {canProcess && detail.status === "PENDING" ? (
                    <label className="inline-flex items-center gap-2 text-xs text-[var(--twin-body)]">
                      <input
                        type="checkbox"
                        checked={!!grantMap[line.id]}
                        onChange={(e) => setGrantMap((prev) => ({ ...prev, [line.id]: e.target.checked }))}
                      />
                      同意出库
                    </label>
                  ) : null}
                </div>
              ))}
            </div>
            {canProcess && detail.status === "PENDING" ? (
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className="rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-sm text-[var(--twin-body)]" onClick={() => { setDetail(null); setGrantMap({}); }}>取消</button>
                <button
                  type="button"
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() => void submitFulfill()}
                  disabled={fulfillMut.isPending}
                >
                  {fulfillMut.isPending ? "提交中..." : "确认出库"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        </Portal>
      ) : null}
    </div>
  );
}
