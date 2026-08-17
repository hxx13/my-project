import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { fetchStudentPendingClaims, approveStudentClaim, type CageClaimItem } from "@/api/domains/cageShelf.api";

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "待审批",
  pending_release_approval: "待释放审批",
};

export default function StudentCageClaimReviewPage() {
  const [list, setList] = useState<CageClaimItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchStudentPendingClaims();
      setList(data.list ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载待审批列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handle = async (id: number, decision: "approved" | "rejected") => {
    setBusy(id);
    try {
      await approveStudentClaim(id, decision);
      toast.success(decision === "approved" ? "已批准" : "已驳回");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-lg font-semibold text-[var(--twin-ink)] mb-1">笼位申请审批</h1>
      <p className="text-xs text-[var(--twin-mute)] mb-5">
        组长审批本课题组学生的笼位申请（待审批 {list.length} 条）
      </p>

      {loading ? (
        <div className="text-sm text-[var(--twin-mute)] py-12 text-center">加载中…</div>
      ) : list.length === 0 ? (
        <div className="text-sm text-[var(--twin-mute)] py-12 text-center">暂无待审批申请</div>
      ) : (
        <div className="space-y-3">
          {list.map((claim) => (
            <div
              key={claim.id}
              className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-4"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold text-[var(--twin-ink)]">申请 #{claim.id}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    {STATUS_LABELS[claim.claimStatus] || claim.claimStatus}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busy === claim.id}
                    onClick={() => handle(claim.id, "rejected")}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    驳回
                  </button>
                  <button
                    type="button"
                    disabled={busy === claim.id}
                    onClick={() => handle(claim.id, "approved")}
                    className="rounded-lg bg-[var(--twin-primary)] px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
                  >
                    批准
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-[var(--twin-mute)]">申请人</div>
                  <div className="text-[var(--twin-body)] mt-0.5">{claim.claimantName || claim.claimantId}</div>
                </div>
                <div>
                  <div className="text-[var(--twin-mute)]">部门</div>
                  <div className="text-[var(--twin-body)] mt-0.5">{claim.claimantDept || "—"}</div>
                </div>
                <div>
                  <div className="text-[var(--twin-mute)]">笼位 ID</div>
                  <div className="text-[var(--twin-body)] mt-0.5">{claim.animalCageId}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
