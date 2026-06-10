import { useState } from "react";
import { usePendingMaterialRequests, useAllMaterialRequests, useApproveMaterialRequest, useRejectMaterialRequest, useFulfillMaterialRequest } from "@/api/hooks/useMaterial";
import type { MaterialRequest, MaterialRequestLine } from "@/api/domains/material.api";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";
import DataSkeleton from "@/components/ui/DataSkeleton";

type TabKey = "pending" | "all";

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

export default function MaterialReviewPage() {
  const [tab, setTab] = useState<TabKey>("pending");
  const { data: pendingData, isLoading: pendingLoading } = usePendingMaterialRequests();
  const { data: allData, isLoading: allLoading } = useAllMaterialRequests({ page: 1, size: 50 });
  const approve = useApproveMaterialRequest();
  const reject = useRejectMaterialRequest();
  const fulfill = useFulfillMaterialRequest();

  const list = tab === "pending" ? (pendingData ?? []) : (allData?.data ?? []);
  const loading = tab === "pending" ? pendingLoading : allLoading;

  return (
    <div className="space-y-6">
      <AdminSubPageHeader title="申领审核" backTo="/admin" description="审核学生物资申领请求，支持简单流程与复核流程。" />

      <div className="flex gap-1">
        {([["pending", "待审核"], ["all", "全部记录"]] as [TabKey, string][]).map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-twin-sm px-4 py-1.5 text-sm font-medium transition-colors ${tab === k ? "bg-[var(--twin-primary)] text-[var(--twin-on-primary)]" : "border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"}`}>
            {v}
          </button>
        ))}
      </div>

      {loading ? <DataSkeleton variant="card" rows={5} /> : null}

      <div className="space-y-3">
        {list.map((req: MaterialRequest) => (
          <div key={req.id} className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--twin-mute)] font-mono">{req.id}</span>
              <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium ${statusBadge(req.status)}`}>{statusLabel(req.status)}</span>
            </div>

            <div>
              <span className="font-medium text-[var(--twin-ink)]">{req.applicantName || req.userId}</span>
              {req.applicantGroup && <span className="text-[var(--twin-mute)] ml-2">({req.applicantGroup})</span>}
              <span className="text-[var(--twin-mute)] ml-2 text-xs">{req.workflowType === "DUAL_REVIEW" ? "· 复核流程" : "· 简单流程"}</span>
            </div>

            <div className="space-y-1">
              {req.lines?.map((l: MaterialRequestLine, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--twin-body)]">{l.snapshotName} × {l.qty}</span>
                  {l.fulfilledQty > 0 && <span className="text-xs text-green-600 font-medium">已出库 {l.fulfilledQty}</span>}
                </div>
              ))}
            </div>

            <div className="text-xs text-[var(--twin-mute)]">{req.createdAt?.replace("T", " ").slice(0, 19)}</div>

            {(req.status === "PENDING" || req.status === "FIRST_OK") && (
              <div className="flex gap-2 pt-1 border-t border-[var(--twin-hairline)]">
                <button onClick={() => approve.mutate(req.id)} disabled={approve.isPending}
                  className="rounded-twin-sm bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {req.status === "PENDING" && req.workflowType === "DUAL_REVIEW" ? "初审通过" : "通过"}
                </button>
                <button onClick={() => reject.mutate(req.id)} disabled={reject.isPending}
                  className="rounded-twin-sm bg-red-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-colors">拒绝</button>
              </div>
            )}

            {req.status === "APPROVED" && (
              <div className="flex gap-2 pt-1 border-t border-[var(--twin-hairline)]">
                <button onClick={() => {
                  const lines = req.lines?.map(l => ({ lineId: l.id, grant: true, fulfillQty: l.qty })) ?? [];
                  fulfill.mutate({ id: req.id, lines });
                }} disabled={fulfill.isPending}
                  className="rounded-twin-sm bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">确认出库</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!loading && list.length === 0 && (
        <p className="text-center text-sm text-[var(--twin-mute)] py-12">{tab === "pending" ? "暂无待审核申领" : "暂无申领记录"}</p>
      )}
    </div>
  );
}
