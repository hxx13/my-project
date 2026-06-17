import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { usePendingMaterialRequests, useAllMaterialRequests, useApproveMaterialRequest, useRejectMaterialRequest, useDeleteMaterialRequest } from "@/api/hooks/useMaterial";
import { fetchAllMaterialDemands, resolveMaterialDemand, exportMaterialAuditTrail, type MaterialDemand } from "@/api/domains/material.api";
import {
  fetchPendingScanDelayRequests,
  reviewScanDelayRequest,
  type ScanDelayPendingRequest,
} from "@/api/domains/scanDelay.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import type { MaterialRequest, MaterialRequestLine } from "@/api/domains/material.api";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";
import DataSkeleton from "@/components/ui/DataSkeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authHttp } from "@/api/core/authHttp";
import toast from "react-hot-toast";

type TabKey = "pending" | "all" | "demands" | "scanDelay";

function statusLabel(s: string) {
  const m: Record<string, string> = { DRAFT: "草稿", PENDING: "待审核", FIRST_OK: "初审通过", APPROVED: "已通过", REJECTED: "已拒绝", FULFILLED: "已出库", RECEIVED: "已完成" };
  return m[s] || s;
}
function statusBadge(s: string): string {
  if (s === "PENDING" || s === "FIRST_OK") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "APPROVED") return "bg-green-50 text-green-700 border-green-200";
  if (s === "REJECTED") return "bg-red-50 text-red-700 border-red-200";
  if (s === "FULFILLED") return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "RECEIVED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}
function downloadBlob(blob: Blob, name: string) { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); }

export default function MaterialReviewPage() {
  const role = authStorage.getRole() || "STUDENT";
  const canDelete = hasMinRole(role, "SUPER_ADMIN");
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabKey) || "pending";
  const [tab, setTab] = useState<TabKey>(
    ["pending", "all", "demands", "scanDelay"].includes(initialTab) ? initialTab : "pending"
  );

  const { data: pendingData, isLoading: pendingLoading } = usePendingMaterialRequests();
  const { data: allData, isLoading: allLoading } = useAllMaterialRequests({ page: 1, size: 50 });
  const approve = useApproveMaterialRequest();
  const reject = useRejectMaterialRequest();
  const deleteReq = useDeleteMaterialRequest();
  const qc = useQueryClient();
  const { data: demandData, isLoading: demandLoading } = useQuery({
    queryKey: ["material", "demands", "all"],
    queryFn: () => fetchAllMaterialDemands({ page: 1, size: 200 }),
  });
  const { data: scanDelayPending = [], isLoading: scanDelayLoading } = useQuery({
    queryKey: ["scan-delay", "pending"],
    queryFn: fetchPendingScanDelayRequests,
  });
  const demands = demandData?.data ?? [];

  useEffect(() => {
    const t = searchParams.get("tab") as TabKey | null;
    if (t && ["pending", "all", "demands", "scanDelay"].includes(t) && t !== tab) {
      setTab(t);
    }
  }, [searchParams, tab]);

  const switchTab = (k: TabKey) => {
    setTab(k);
    setSearchParams(k === "pending" ? {} : { tab: k }, { replace: true });
  };

  const [demandVisible, setDemandVisible] = useState(true);
  const [toggleLoading, setToggleLoading] = useState(false);
  useEffect(() => {
    authHttp.get<{ success: boolean; data: { visible: boolean } }>("/material/admin/config/demand-entry-visible")
      .then(r => { if (r.data?.success) setDemandVisible(r.data.data.visible); }).catch(() => {});
  }, []);
  const toggleDemand = async () => { setToggleLoading(true); try { const r = await authHttp.post<{ success: boolean; data: { visible: boolean } }>("/material/admin/config/toggle-demand-entry"); if (r.data?.success) setDemandVisible(r.data.data.visible); } finally { setToggleLoading(false); } };

  const list = tab === "pending" ? (pendingData ?? []) : (allData?.data ?? []);
  const loading = tab === "pending" ? pendingLoading : tab === "all" ? allLoading : tab === "demands" ? demandLoading : scanDelayLoading;

  const handleExportPersonal = async (reqId: string) => {
    try { const blob = await exportMaterialAuditTrail({}); downloadBlob(blob, `material-request-${reqId}.xlsx`); toast.success("已导出"); }
    catch { toast.error("导出失败"); }
  };

  const handleScanDelayReview = async (req: ScanDelayPendingRequest, approveFlag: boolean) => {
    try {
      await reviewScanDelayRequest(req.id, approveFlag, approveFlag ? undefined : "已拒绝");
      // 保存后仅移除当前行，禁止整表 load；post-save-no-full-refresh.mdc
      qc.setQueryData<ScanDelayPendingRequest[]>(["scan-delay", "pending"], (prev) =>
        (prev ?? []).filter((r) => r.id !== req.id)
      );
      toast.success(approveFlag ? "已通过并授予免冻结" : "已拒绝");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  return (
    <div className="space-y-6">
      <AdminSubPageHeader title="学生审核" fallbackTo="/admin" description="审核学生物资申领、延迟免冻结申请与需求建议。" />
      <div className="flex flex-wrap gap-1">
        {([
          ["pending", `物资待审${pendingData ? ` (${pendingData.length})` : ""}`],
          ["scanDelay", `延迟免冻结${scanDelayPending.length ? ` (${scanDelayPending.length})` : ""}`],
          ["all", "物资全部"],
          ["demands", `需求建议${demands.length ? ` (${demands.filter((d: MaterialDemand) => d.status === 0).length})` : ""}`],
        ] as [TabKey, string][]).map(([k, v]) => (
          <button key={k} onClick={() => switchTab(k)} className={`rounded-twin-sm px-4 py-1.5 text-sm font-medium transition-colors ${tab === k ? "bg-[var(--twin-primary)] text-[var(--twin-on-primary)]" : "border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"}`}>{v}</button>
        ))}
      </div>

      {tab === "scanDelay" ? (
        <div className="space-y-3">
          {scanDelayLoading ? <DataSkeleton variant="card" rows={4} /> : null}
          {scanDelayPending.map((req) => (
            <div key={req.id} className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-[var(--twin-mute)]">#{req.id}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">待审核</span>
              </div>
              <p className="text-sm text-[var(--twin-ink)]">
                <span className="font-medium">{req.roomName || req.roomId}</span>
                <span className="text-[var(--twin-mute)]"> · {req.optionLabel || "延迟免冻结"}</span>
              </p>
              <p className="text-xs text-[var(--twin-mute)]">人员 ID：{req.subjectUserId}</p>
              {req.createdAt ? (
                <p className="text-xs text-[var(--twin-mute)]">{String(req.createdAt).replace("T", " ").slice(0, 19)}</p>
              ) : null}
              <div className="flex gap-2 pt-2 border-t border-[var(--twin-hairline)]">
                <button
                  type="button"
                  onClick={() => void handleScanDelayReview(req, true)}
                  className="rounded-twin-sm bg-green-600 px-4 py-1.5 text-sm font-medium text-white"
                >
                  通过并授予免冻结
                </button>
                <button
                  type="button"
                  onClick={() => void handleScanDelayReview(req, false)}
                  className="rounded-twin-sm bg-red-500 px-4 py-1.5 text-sm font-medium text-white"
                >
                  拒绝
                </button>
              </div>
            </div>
          ))}
          {!scanDelayLoading && scanDelayPending.length === 0 && (
            <p className="text-center text-sm text-[var(--twin-mute)] py-12">暂无待审核的延迟免冻结申请</p>
          )}
        </div>
      ) : tab === "demands" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-4 py-2.5 shadow-twin-level-1">
            <span className="text-sm text-[var(--twin-ink)]">学生端需求建议入口</span>
            <button onClick={toggleDemand} disabled={toggleLoading}
              className={`rounded-twin-sm px-3 py-1 text-xs font-medium border ${demandVisible ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
              {demandVisible ? "已开启" : "已关闭"}
            </button>
          </div>
          <div className="space-y-3">
            {demandLoading ? <DataSkeleton variant="card" rows={5} /> : null}
            {demands.map((d: MaterialDemand) => (
              <div key={d.id} className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-[var(--twin-ink)]">{d.userName || d.userId}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${d.status === 1 ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"}`}>{d.status === 1 ? "已处理" : "未处理"}</span>
                  </div>
                  <p className="text-sm text-[var(--twin-ink)]">{d.suggestion}</p>
                  <p className="text-xs text-[var(--twin-mute)] mt-1">{d.createdAt?.replace("T", " ").slice(0, 19)}</p>
                </div>
                {d.status === 0 && (
                  <button onClick={async () => { await resolveMaterialDemand(d.id); qc.invalidateQueries({ queryKey: ["material", "demands"] }); toast.success("已标记"); }}
                    className="rounded-twin-sm bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 shrink-0">标记处理</button>
                )}
              </div>
            ))}
            {!demandLoading && demands.length === 0 && <p className="text-center text-sm text-[var(--twin-mute)] py-12">暂无需求建议</p>}
          </div>
        </div>
      ) : (
        <>
          {loading ? <DataSkeleton variant="card" rows={5} /> : null}
          <div className="space-y-3">
            {list.map((req: MaterialRequest) => (
              <div key={req.id} className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--twin-mute)] font-mono">{req.id}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium ${statusBadge(req.status)}`}>{statusLabel(req.status)}</span>
                    <button onClick={() => handleExportPersonal(req.id)} className="text-[11px] text-blue-600 hover:underline">导出</button>
                    {canDelete && <button onClick={() => { if (!window.confirm("删除此申领？")) return; deleteReq.mutate(req.id); }} className="text-[11px] text-red-500 hover:underline">删除</button>}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-[var(--twin-ink)]">{req.applicantName || req.userId}</span>
                  {req.applicantGroup && <span className="text-[var(--twin-mute)] ml-2">({req.applicantGroup})</span>}
                </div>
                <div className="space-y-1">{req.lines?.map((l: MaterialRequestLine, i: number) => (<div key={i} className="flex items-center justify-between text-sm"><span className="text-[var(--twin-body)]">{l.snapshotName} × {l.qty}</span>{l.fulfilledQty > 0 && <span className="text-xs text-green-600">已出库 {l.fulfilledQty}</span>}</div>))}</div>
                <div className="text-xs text-[var(--twin-mute)]">{req.createdAt?.replace("T", " ").slice(0, 19)}</div>
                {(req.status === "PENDING" || req.status === "FIRST_OK") && (
                  <div className="flex gap-2 pt-1 border-t border-[var(--twin-hairline)]">
                    <button onClick={() => approve.mutate(req.id, { onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "审核失败") })} className="rounded-twin-sm bg-green-600 px-4 py-1.5 text-sm font-medium text-white">
                      {req.status === "FIRST_OK" ? "复审通过并出库" : req.workflowType === "DUAL_REVIEW" ? "初审通过" : "通过并出库"}
                    </button>
                    <button onClick={() => reject.mutate(req.id, { onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "操作失败") })} className="rounded-twin-sm bg-red-500 px-4 py-1.5 text-sm font-medium text-white">拒绝</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {!loading && list.length === 0 && <p className="text-center text-sm text-[var(--twin-mute)] py-12">{tab === "pending" ? "暂无待审核申领" : "暂无申领记录"}</p>}
        </>
      )}
    </div>
  );
}
