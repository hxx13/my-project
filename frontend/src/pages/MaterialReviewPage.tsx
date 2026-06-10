import { useState } from "react";
import { usePendingMaterialRequests, useAllMaterialRequests, useApproveMaterialRequest, useRejectMaterialRequest, useFulfillMaterialRequest } from "@/api/hooks/useMaterial";
import type { MaterialRequest, MaterialRequestLine } from "@/api/domains/material.api";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";

type TabKey = "pending" | "all";

function statusLabel(s: string) {
  const m: Record<string, string> = { DRAFT: "草稿", PENDING: "待审核", FIRST_OK: "初审通过", APPROVED: "已通过", REJECTED: "已拒绝", FULFILLED: "已出库", RECEIVED: "已完成" };
  return m[s] || s;
}

export default function MaterialReviewPage() {
  const [tab, setTab] = useState<TabKey>("pending");
  const { data: pendingData } = usePendingMaterialRequests();
  const { data: allData } = useAllMaterialRequests({ page: 1, size: 50 });
  const approve = useApproveMaterialRequest();
  const reject = useRejectMaterialRequest();
  const fulfill = useFulfillMaterialRequest();

  const list = tab === "pending" ? (pendingData ?? []) : (allData?.data ?? []);

  return (
    <div className="h-full flex flex-col">
      <AdminSubPageHeader title="申领审核" backTo="/admin" />
      <div className="flex gap-1 px-4 py-2 bg-white border-b">
        {([["pending", "待审核"], ["all", "全部记录"]] as [TabKey, string][]).map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1 rounded text-[13px] ${tab === k ? "bg-blue-600 text-white" : "bg-gray-100"}`}>{v}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {list.map((req: MaterialRequest) => (
          <div key={req.id} className="bg-white rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-mono text-gray-500">{req.id}</span>
              <span className="text-[12px] px-2 py-0.5 rounded bg-blue-50 text-blue-700">{statusLabel(req.status)}</span>
            </div>
            <div className="text-[13px]">
              <span className="font-medium">{req.applicantName || req.userId}</span>
              {req.applicantGroup && <span className="text-gray-400 ml-2">({req.applicantGroup})</span>}
            </div>
            <div className="text-[12px] text-gray-600 space-y-0.5">
              {req.lines?.map((l: MaterialRequestLine, i: number) => (
                <p key={i}>{l.snapshotName} × {l.qty} {l.fulfilledQty > 0 && `(已出库 ${l.fulfilledQty})`}</p>
              ))}
            </div>
            <div className="text-[11px] text-gray-400">{req.createdAt?.replace("T", " ").slice(0, 19)}</div>
            <div className="flex gap-2">
              {(req.status === "PENDING" || req.status === "FIRST_OK") && (
                <>
                  <button onClick={() => approve.mutate(req.id)} className="px-3 py-1 text-[12px] rounded bg-green-600 text-white">通过</button>
                  <button onClick={() => reject.mutate(req.id)} className="px-3 py-1 text-[12px] rounded bg-red-500 text-white">拒绝</button>
                </>
              )}
              {req.status === "APPROVED" && (
                <button onClick={() => {
                  const lines = req.lines?.map(l => ({ lineId: l.id, grant: true, fulfillQty: l.qty })) ?? [];
                  fulfill.mutate({ id: req.id, lines });
                }} className="px-3 py-1 text-[12px] rounded bg-blue-600 text-white">确认出库</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
