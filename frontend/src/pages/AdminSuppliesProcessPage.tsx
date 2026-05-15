import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import {
  downloadPersonalClaimExcel,
  fetchSupplyClaimDetail,
  fetchSupplyPendingTasks,
  fetchSupplyRecentClosedClaims,
  deleteAdminSupplyClaim,
  fetchAdminClaimRecycle,
  fulfillSupplyClaim,
  purgeAdminClaimRecycle,
  purgeAdminClaimRecycleByIds,
  purgeAllAdminClaimRecycle,
  restoreAdminClaimRecycle,
  type SupplyClaimOrder,
  type SupplyClaimLine,
  type SupplyClaimPdfLinkItem,
} from "@/api/domains/supplies.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";

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
  const [loading, setLoading] = useState(false);
  const [pendingRows, setPendingRows] = useState<SupplyClaimOrder[]>([]);
  const [doneRows, setDoneRows] = useState<SupplyClaimOrder[]>([]);
  const [detail, setDetail] = useState<SupplyClaimOrder | null>(null);
  const [grantMap, setGrantMap] = useState<Record<number, boolean>>({});
  const [fulfilling, setFulfilling] = useState(false);
  const [linkModalClaim, setLinkModalClaim] = useState<SupplyClaimOrder | null>(null);
  const [pdfLinkRows, setPdfLinkRows] = useState<SupplyClaimPdfLinkItem[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);

  const [recycleRows, setRecycleRows] = useState<SupplyClaimOrder[]>([]);
  const [selectedRecycleIds, setSelectedRecycleIds] = useState<string[]>([]);

  const loadRecycle = async () => {
    const recycle = await fetchAdminClaimRecycle({ page: 1, size: 200 });
    setRecycleRows(recycle.data || []);
  };

  const loadData = async () => {
    if (!canReadMine) return;
    setLoading(true);
    try {
      const [pending, done] = await Promise.all([
        fetchSupplyPendingTasks(),
        fetchSupplyRecentClosedClaims(60),
      ]);
      setPendingRows(pending || []);
      setDoneRows(done || []);
      if (canProcess) {
        await loadRecycle();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const payload = (detail.lines || []).map((line: SupplyClaimLine) => ({
      lineId: line.id,
      grant: !!grantMap[line.id],
    }));
    setFulfilling(true);
    try {
      await fulfillSupplyClaim(detail.id, payload);
      toast.success("已完成出库");
      setDetail(null);
      setGrantMap({});
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "出库失败");
    } finally {
      setFulfilling(false);
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

  const renderClaimCard = (row: SupplyClaimOrder, done = false) => (
    <div key={row.id} className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium">{applicantLabel(row)}</div>
        <div className="text-xs text-slate-500">{claimStatusText(row.status)}</div>
      </div>
      <div className="mt-1 text-xs text-slate-500">
        申请：{toTextTime(row.createdAt)}
        {done ? ` | 完成：${toTextTime(row.fulfilledAt)}` : ""}
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700"
          onClick={() => goAuditExport(row.id)}
        >
          预览/导出页
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
          onClick={() => void exportClaimExcel(row.id)}
        >
          导出 Excel
        </button>
        <button
          type="button"
          className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700"
          onClick={() => openClaimDetail(row.id)}
        >
          查看并处理
        </button>
        {canProcess ? (
          <button
            type="button"
            className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700"
            onClick={async () => {
              if (!window.confirm("确认删除该申请单到回收站？")) return;
              await deleteAdminSupplyClaim(row.id);
              toast.success("已移入回收站");
              await loadData();
            }}
          >
            删除申请单
          </button>
        ) : null}
      </div>
    </div>
  );

  if (!canReadMine) {
    return <div className="p-6 text-sm text-slate-500">无权限访问物资处理页。</div>;
  }

  return (
    <div className="space-y-4">
      <AdminSubPageHeader
        fallbackTo="/admin/supplies"
        backLabel="返回领用物资"
        title="物资处理台"
        description="处理待出库领用单、查看已结单与回收站；预览/导出跳转至领用审计页的个人单次视图。"
      />
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">物资处理台</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className={`rounded px-3 py-1 text-xs ${activeTab === "pending" ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-700"}`}
              onClick={() => setActiveTab("pending")}
            >
              待处理
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1 text-xs ${activeTab === "done" ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-700"}`}
              onClick={() => setActiveTab("done")}
            >
              已处理
            </button>
          </div>
        </div>

        {loading ? <div className="text-sm text-slate-500">加载中...</div> : null}

        {!loading && activeTab === "pending" ? (
          <div className="space-y-2">
            {pendingRows.map((row) => renderClaimCard(row, false))}
            {pendingRows.length === 0 ? <div className="text-sm text-slate-500">暂无待处理物资单</div> : null}
          </div>
        ) : null}

        {!loading && activeTab === "done" ? (
          <div className="space-y-2">
            {doneRows.map((row) => renderClaimCard(row, true))}
            {doneRows.length === 0 ? <div className="text-sm text-slate-500">暂无已处理物资单</div> : null}
          </div>
        ) : null}
      </section>

      {canProcess ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold">申请单回收站（7天后自动清空）</h3>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-rose-300 px-3 py-1 text-xs text-rose-700"
                onClick={async () => {
                  if (!selectedRecycleIds.length) return toast.error("请先勾选回收站申请单");
                  if (!window.confirm(`确认彻底删除 ${selectedRecycleIds.length} 条回收站申请单吗？`)) return;
                  await purgeAdminClaimRecycleByIds(selectedRecycleIds);
                  setSelectedRecycleIds([]);
                  toast.success("已彻底删除");
                  await loadData();
                }}
              >
                选择性彻底删除
              </button>
              <button
                type="button"
                className="rounded bg-rose-600 px-3 py-1 text-xs text-white"
                onClick={async () => {
                  if (!window.confirm("确认一键清空回收站吗？")) return;
                  await purgeAllAdminClaimRecycle();
                  setSelectedRecycleIds([]);
                  toast.success("回收站已清空");
                  await loadData();
                }}
              >
                一键清空
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {recycleRows.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm">
                <span>{row.id}（{applicantLabel(row)} / {claimStatusText(row.status)}）</span>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedRecycleIds.includes(row.id)}
                    onChange={(e) => setSelectedRecycleIds((prev) => e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id))}
                  />
                  <button
                    type="button"
                    className="rounded border border-emerald-300 px-2 py-0.5 text-emerald-700"
                    onClick={async () => {
                      await restoreAdminClaimRecycle(row.id);
                      setSelectedRecycleIds((prev) => prev.filter((id) => id !== row.id));
                      toast.success("已恢复");
                      await loadData();
                    }}
                  >
                    恢复
                  </button>
                  <button
                    type="button"
                    className="rounded border border-rose-300 px-2 py-0.5 text-rose-700"
                    onClick={async () => {
                      if (!window.confirm("确认彻底删除该申请单？")) return;
                      await purgeAdminClaimRecycle(row.id);
                      setSelectedRecycleIds((prev) => prev.filter((id) => id !== row.id));
                      toast.success("已彻底删除");
                      await loadData();
                    }}
                  >
                    彻底删除
                  </button>
                </div>
              </div>
            ))}
            {recycleRows.length === 0 ? <div className="text-sm text-slate-500">回收站为空</div> : null}
          </div>
        </section>
      ) : null}

      {detail ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold">物资处理详情</h3>
              <button
                type="button"
                className="text-sm text-slate-500"
                onClick={() => {
                  setDetail(null);
                  setPdfLinkRows([]);
                }}
              >
                关闭
              </button>
            </div>
            <div className="mb-2 text-sm text-slate-600">
              申请人：{applicantLabel(detail)} | 状态：{claimStatusText(detail.status)} | 申请：{toTextTime(detail.createdAt)}
            </div>
            <div className="space-y-2">
              {(detail.lines || []).map((line) => (
                <div key={line.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm">
                  <span>{line.snapshotName}（申 {line.qty} / 发 {line.fulfilledQty ?? 0}）</span>
                  {canProcess && detail.status === "PENDING" ? (
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
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
                <button type="button" className="rounded border border-slate-300 px-3 py-1 text-sm" onClick={() => setDetail(null)}>取消</button>
                <button
                  type="button"
                  className="rounded bg-emerald-600 px-3 py-1 text-sm text-white"
                  onClick={submitFulfill}
                  disabled={fulfilling}
                >
                  {fulfilling ? "提交中..." : "确认出库"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

    </div>
  );
}

