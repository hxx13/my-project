import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, FileText } from "lucide-react";
import { useMyMaterialRequests, useWithdrawMaterialRequest, useConfirmMaterialReceive } from "@/api/hooks/useMaterial";
import type { MaterialRequest } from "@/api/domains/material.api";
import { StudentCard, Badge, Skeleton, EmptyState } from "../components/ui";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿", PENDING: "待审核", FIRST_OK: "初审通过",
  APPROVED: "已通过", REJECTED: "已拒绝", FULFILLED: "待领取", RECEIVED: "已完成",
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600", PENDING: "bg-yellow-100 text-yellow-700",
  FIRST_OK: "bg-blue-100 text-blue-700", APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700", FULFILLED: "bg-indigo-100 text-indigo-700",
  RECEIVED: "bg-emerald-100 text-emerald-700",
};

export default function StudentMaterialRequestsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMyMaterialRequests({ page, size: 20, status: statusFilter });
  const withdraw = useWithdrawMaterialRequest();
  const confirm = useConfirmMaterialReceive();

  return (
    <div className="h-full bg-[var(--student-canvas-soft)] flex flex-col">
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-[var(--student-hairline)]">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[13px] text-[var(--student-mute)]"><ChevronLeft className="size-4" /> 返回</button>
        <h2 className="text-[15px] font-semibold">我的申领</h2>
      </div>
      <div className="flex gap-1.5 px-5 py-2 bg-white border-b border-[var(--student-hairline)] overflow-x-auto">
        {[{ label: "全部", value: undefined }, ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ label: v, value: k }))].map((opt) => (
          <button key={opt.value ?? "all"} onClick={() => { setStatusFilter(opt.value); setPage(1); }}
            className={cn("px-3 py-1 rounded-[var(--student-radius-pill)] text-[12px] whitespace-nowrap transition-colors",
              statusFilter === opt.value ? "bg-[var(--student-primary)] text-white" : "bg-[var(--student-canvas-soft)] text-[var(--student-body)] hover:bg-[var(--student-primary-soft)]")}>
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[80px]" />)
        ) : !data?.data || data.data.length === 0 ? (
          <EmptyState icon={FileText} title="暂无申领记录" />
        ) : (
          data.data.map((req) => (
            <StudentCard key={req.id} className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[var(--student-mute)] font-mono">{req.id}</span>
                <span className={cn("text-[11px] px-2 py-0.5 rounded-full", STATUS_COLORS[req.status] || "bg-gray-100")}>{STATUS_LABELS[req.status] || req.status}</span>
              </div>
              <div className="text-[13px] space-y-0.5">
                {req.lines?.map((l, i) => (
                  <p key={i} className="text-[var(--student-body)]">{l.snapshotName} × {l.qty} {l.fulfilledQty > 0 && <span className="text-green-600">(出库 {l.fulfilledQty})</span>}</p>
                ))}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--student-mute)]">
                <span>{req.createdAt?.replace("T", " ").slice(0, 19)}</span>
                <div className="flex gap-2">
                  {(req.status === "PENDING" || req.status === "FIRST_OK") && (
                    <button onClick={() => withdraw.mutate(req.id)} className="text-red-500 hover:underline">撤回</button>
                  )}
                  {req.status === "FULFILLED" && (
                    <button onClick={() => confirm.mutate(req.id)} className="text-[var(--student-primary)] hover:underline font-semibold">确认领取</button>
                  )}
                </div>
              </div>
            </StudentCard>
          ))
        )}
      </div>
      {data && data.total > 20 && (
        <div className="flex justify-center gap-2 p-3 bg-white border-t">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 text-[12px] rounded border disabled:opacity-30">上一页</button>
          <span className="px-3 py-1 text-[12px]">第 {page} 页 / 共 {Math.ceil(data.total / 20)} 页</span>
          <button disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage(page + 1)} className="px-3 py-1 text-[12px] rounded border disabled:opacity-30">下一页</button>
        </div>
      )}
    </div>
  );
}
