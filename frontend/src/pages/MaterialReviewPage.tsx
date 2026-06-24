import { useEffect, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { usePendingMaterialRequests, useFinishedMaterialRequests, useApproveMaterialRequest, useRejectMaterialRequest, useDeleteMaterialRequest } from "@/api/hooks/useMaterial";
import { fetchAllMaterialDemands, resolveMaterialDemand, exportMaterialAuditTrail, type MaterialDemand } from "@/api/domains/material.api";
import {
  fetchPendingScanDelayRequests,
  fetchScanDelayHistory,
  reviewScanDelayRequest,
  type ScanDelayPendingRequest,
  type ScanDelayHistoryRequest,
} from "@/api/domains/scanDelay.api";
import { fetchAdminMaterialItems, type MaterialItem } from "@/api/domains/material.api";
import { fetchScanDelayOptions, type ScanDelayOption } from "@/api/domains/scanDelay.api";
import { ScanDelayAutoApprovePanel } from "@/features/scan-delay-auto-approve/ScanDelayAutoApprovePanel";
import { MaterialAutoApprovePanel } from "@/features/material-auto-approve/MaterialAutoApprovePanel";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import type { MaterialRequest, MaterialRequestLine } from "@/api/domains/material.api";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";
import DataSkeleton from "@/components/ui/DataSkeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { materialQueryKeys } from "@/api/hooks/queryKeys";
import { authHttp } from "@/api/core/authHttp";
import toast from "react-hot-toast";
import { formatBeijingDateTimeFull } from "@/utils/beijingTime";
import { studentReviewPendingQueryOptions } from "@/features/student-review/studentReviewPoll";
import {
  ADMIN_NOTIFICATION_SSE_PUSH_EVENT,
  ADMIN_PENDING_BADGES_REFRESH_EVENT,
} from "@/features/admin/adminPendingBadgesEvents";

type TabKey = "material" | "scanDelay" | "demands";

function parseReviewTab(raw: string | null): TabKey {
  if (raw === "scanDelay" || raw === "demands") return raw;
  return "material";
}

function statusLabel(s: string) {
  const m: Record<string, string> = { DRAFT: "草稿", PENDING: "待审核", FIRST_OK: "初审通过", APPROVED: "已通过", REJECTED: "已拒绝", FULFILLED: "已出库", RECEIVED: "已完成" };
  return m[s] || s;
}
function isToday(dateStr?: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
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
  /** 与 URL ?tab= 单一同步；避免 hash 跳转到无 tab 时仍停留在 scanDelay */
  const tab = parseReviewTab(searchParams.get("tab"));
  const [autoApproveOpen, setAutoApproveOpen] = useState(false);
  const [materialAutoApproveOpen, setMaterialAutoApproveOpen] = useState(false);
  const highlightRequestId = searchParams.get("requestId");

  const { data: pendingData, isLoading: pendingLoading } = usePendingMaterialRequests();
  const { data: finishedData, isLoading: finishedLoading } = useFinishedMaterialRequests({ page: 1, size: 50 });
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
    ...studentReviewPendingQueryOptions,
  });
  const { data: scanDelayHistory = [], isLoading: scanDelayHistoryLoading } = useQuery({
    queryKey: ["scan-delay", "history"],
    queryFn: () => fetchScanDelayHistory(100),
    enabled: tab === "scanDelay",
    staleTime: 0,
    refetchInterval: tab === "scanDelay" ? studentReviewPendingQueryOptions.refetchInterval : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const { data: allItems = [] } = useQuery<MaterialItem[]>({
    queryKey: ["material", "admin", "items"],
    queryFn: () => fetchAdminMaterialItems(),
    staleTime: 60_000,
  });

  const { data: scanDelayOptions = [] } = useQuery<ScanDelayOption[]>({
    queryKey: ["scan-delay", "options"],
    queryFn: fetchScanDelayOptions,
    staleTime: 60_000,
  });

  const demands = demandData?.data ?? [];

  const itemReviewerMap = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const item of allItems) {
      const ids: string[] = [];
      try { if (item.reviewerIds) ids.push(...JSON.parse(item.reviewerIds)); } catch {}
      try { if (item.secondReviewerIds) ids.push(...JSON.parse(item.secondReviewerIds)); } catch {}
      map.set(item.id, ids);
    }
    return map;
  }, [allItems]);

  const optionReviewerMap = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const opt of scanDelayOptions) {
      map.set(opt.id, opt.reviewerUserIds ?? []);
    }
    return map;
  }, [scanDelayOptions]);

  const currentUserId = authStorage.getUserInfo()?.id?.trim() || authStorage.getUserIdFromToken()?.trim() || "";

  const isMyItem = useCallback(
    (itemId: number) => {
      if (!currentUserId) return false;
      return (itemReviewerMap.get(itemId) ?? []).includes(currentUserId);
    },
    [currentUserId, itemReviewerMap]
  );

  const isMyOption = useCallback(
    (optionId: number) => {
      if (!currentUserId) return false;
      return (optionReviewerMap.get(optionId) ?? []).includes(currentUserId);
    },
    [currentUserId, optionReviewerMap]
  );

  const switchTab = (k: TabKey) => {
    if (k === "material") {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ tab: k }, { replace: true });
  };

  const [demandVisible, setDemandVisible] = useState(true);
  const [toggleLoading, setToggleLoading] = useState(false);
  useEffect(() => {
    authHttp.get<{ success: boolean; data: { visible: boolean } }>("/material/admin/config/demand-entry-visible")
      .then(r => { if (r.data?.success) setDemandVisible(r.data.data.visible); }).catch(() => {});
  }, []);
  const toggleDemand = async () => { setToggleLoading(true); try { const r = await authHttp.post<{ success: boolean; data: { visible: boolean } }>("/material/admin/config/toggle-demand-entry"); if (r.data?.success) setDemandVisible(r.data.data.visible); } finally { setToggleLoading(false); } };

  /** SSE / 角标刷新时立即拉取待审，避免必须手动刷新页面 */
  useEffect(() => {
    const refreshPending = () => {
      void qc.invalidateQueries({ queryKey: materialQueryKeys.pendingRequests() });
      void qc.invalidateQueries({ queryKey: ["scan-delay", "pending"] });
      void qc.invalidateQueries({ queryKey: ["scan-delay", "pending", "alert-sync"] });
      if (tab === "scanDelay") {
        void qc.invalidateQueries({ queryKey: ["scan-delay", "history"] });
      }
    };
    window.addEventListener(ADMIN_PENDING_BADGES_REFRESH_EVENT, refreshPending);
    window.addEventListener(ADMIN_NOTIFICATION_SSE_PUSH_EVENT, refreshPending);
    return () => {
      window.removeEventListener(ADMIN_PENDING_BADGES_REFRESH_EVENT, refreshPending);
      window.removeEventListener(ADMIN_NOTIFICATION_SSE_PUSH_EVENT, refreshPending);
    };
  }, [qc, tab]);

  // Filtered material list (merged pending + finished)
  const filteredMaterialRequests = useMemo(() => {
    const pending = (pendingData ?? []).filter((req) =>
      (req.lines ?? []).some((line) => isMyItem(line.itemId))
    );
    const finished = (finishedData?.data ?? []).filter((req) =>
      (req.lines ?? []).some((line) => isMyItem(line.itemId))
    );
    return [...pending, ...finished].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [pendingData, finishedData, isMyItem]);

  const materialToday = useMemo(() => filteredMaterialRequests.filter(r => isToday(r.createdAt)), [filteredMaterialRequests]);
  const materialHistory = useMemo(() => filteredMaterialRequests.filter(r => !isToday(r.createdAt)), [filteredMaterialRequests]);

  // Filtered scan delay lists
  const filteredScanDelayPending = useMemo(
    () => scanDelayPending.filter(r => isMyOption(r.optionId)),
    [scanDelayPending, isMyOption]
  );

  const filteredScanDelayHistory = useMemo(
    () => scanDelayHistory.filter(r => isMyOption(r.optionId) && !!r.reviewedBy),
    [scanDelayHistory, isMyOption]
  );

  const allScanDelay = useMemo(() => [
    ...filteredScanDelayPending.map(r => ({ ...r, _kind: "pending" as const })),
    ...filteredScanDelayHistory.map(r => ({ ...r, _kind: "history" as const })),
  ].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()), [filteredScanDelayPending, filteredScanDelayHistory]);

  const scanDelayToday = useMemo(() => allScanDelay.filter(r => isToday(r.createdAt)), [allScanDelay]);
  const scanDelayHistoryFiltered = useMemo(() => allScanDelay.filter(r => !isToday(r.createdAt)), [allScanDelay]);

  // Loading state
  const loading = tab === "material"
    ? pendingLoading || finishedLoading
    : tab === "demands"
      ? demandLoading
      : scanDelayLoading || scanDelayHistoryLoading;

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
      void qc.invalidateQueries({ queryKey: ["scan-delay", "history"] });
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
          ["material", `物资审核${(pendingData ?? []).length + (finishedData?.data ?? []).length > 0 ? ` (${(pendingData ?? []).length + (finishedData?.data ?? []).length})` : ""}`],
          ["scanDelay", `延迟免冻结${scanDelayPending.length ? ` (${scanDelayPending.length})` : ""}`],
          ["demands", `需求建议${demands.length ? ` (${demands.filter((d: MaterialDemand) => d.status === 0).length})` : ""}`],
        ] as [TabKey, string][]).map(([k, v]) => (
          <button key={k} onClick={() => switchTab(k)} className={`rounded-twin-sm px-4 py-1.5 text-sm font-medium transition-colors ${tab === k ? "bg-[var(--twin-primary)] text-[var(--twin-on-primary)]" : "border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"}`}>{v}</button>
        ))}
      </div>

      {tab === "scanDelay" ? (
        <div className="space-y-3">
          {!scanDelayLoading && filteredScanDelayPending.length > 0 ? (
            <div className="rounded-twin-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
              <p className="font-semibold">您有 {filteredScanDelayPending.length} 条延迟免冻结待审核</p>
              <p className="mt-1 text-xs text-amber-800/90">请核对姓名、课题组与历史通过次数后审批；新申请到达时页面顶部也会出现强提醒横幅。</p>
            </div>
          ) : null}
          <div className="flex justify-end">
            <button type="button" onClick={() => setAutoApproveOpen(true)} className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-sm text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]">自动审批</button>
          </div>
          {scanDelayLoading && scanDelayHistoryLoading ? <DataSkeleton variant="card" rows={4} /> : null}
          {allScanDelay.length === 0 && !scanDelayLoading && !scanDelayHistoryLoading ? (
            <p className="text-center text-sm text-[var(--twin-mute)] py-12">暂无你负责审核的延迟免冻结记录</p>
          ) : (
            <div className="space-y-6">
              {scanDelayToday.length > 0 && (
                <TimeGroup label="今天" count={scanDelayToday.length}>
                  {scanDelayToday.map(item => item._kind === "pending" ? (
                    <ScanDelayPendingCard key={`p-${item.id}`} req={item} highlightRequestId={highlightRequestId} onReview={handleScanDelayReview} />
                  ) : (
                    <ScanDelayHistoryCard key={`h-${item.id}`} req={item} />
                  ))}
                </TimeGroup>
              )}
              {scanDelayHistoryFiltered.length > 0 && (
                <TimeGroup label="历史" count={scanDelayHistoryFiltered.length} defaultOpen={false}>
                  {scanDelayHistoryFiltered.map(item => item._kind === "pending" ? (
                    <ScanDelayPendingCard key={`p-${item.id}`} req={item} highlightRequestId={highlightRequestId} onReview={handleScanDelayReview} />
                  ) : (
                    <ScanDelayHistoryCard key={`h-${item.id}`} req={item} />
                  ))}
                </TimeGroup>
              )}
            </div>
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
                  <p className="text-xs text-[var(--twin-mute)] mt-1">{d.createdAt ? formatBeijingDateTimeFull(d.createdAt) : "—"}</p>
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
          <div className="flex justify-end">
            <button type="button" onClick={() => setMaterialAutoApproveOpen(true)} className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-sm text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]">自动审批</button>
          </div>
          {loading ? <DataSkeleton variant="card" rows={5} /> : null}
          {filteredMaterialRequests.length === 0 && !loading ? (
            <p className="text-center text-sm text-[var(--twin-mute)] py-12">暂无你负责审核的物资申领</p>
          ) : (
            <div className="space-y-6">
              {materialToday.length > 0 && (
                <TimeGroup label="今天" count={materialToday.length}>
                  {materialToday.map(req => (
                    <MaterialRequestCard key={req.id} req={req} canDelete={canDelete} approve={approve} reject={reject} deleteReq={deleteReq} handleExportPersonal={handleExportPersonal} />
                  ))}
                </TimeGroup>
              )}
              {materialHistory.length > 0 && (
                <TimeGroup label="历史" count={materialHistory.length} defaultOpen={false}>
                  {materialHistory.map(req => (
                    <MaterialRequestCard key={req.id} req={req} canDelete={canDelete} approve={approve} reject={reject} deleteReq={deleteReq} handleExportPersonal={handleExportPersonal} />
                  ))}
                </TimeGroup>
              )}
            </div>
          )}
        </>
      )}
      <ScanDelayAutoApprovePanel open={autoApproveOpen} onClose={() => setAutoApproveOpen(false)} />
      <MaterialAutoApprovePanel open={materialAutoApproveOpen} onClose={() => setMaterialAutoApproveOpen(false)} />
    </div>
  );
}

function TimeGroup({ label, count, children, defaultOpen = true }: { label: string; count: number; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-medium text-[var(--twin-ink)]">
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {label} ({count})
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  );
}

function MaterialRequestCard({ req, canDelete, approve, reject, deleteReq, handleExportPersonal }: { req: MaterialRequest; canDelete: boolean; approve: ReturnType<typeof useApproveMaterialRequest>; reject: ReturnType<typeof useRejectMaterialRequest>; deleteReq: ReturnType<typeof useDeleteMaterialRequest>; handleExportPersonal: (reqId: string) => void }) {
  return (
    <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1 space-y-3">
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
      <div className="text-xs text-[var(--twin-mute)]">{req.createdAt ? formatBeijingDateTimeFull(req.createdAt) : "—"}</div>
      {(req.status === "PENDING" || req.status === "FIRST_OK") && (
        <div className="flex gap-2 pt-1 border-t border-[var(--twin-hairline)]">
          <button onClick={() => approve.mutate(req.id, { onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "审核失败") })} className="rounded-twin-sm bg-green-600 px-4 py-1.5 text-sm font-medium text-white">
            {req.status === "FIRST_OK" ? "复审通过并出库" : req.workflowType === "DUAL_REVIEW" ? "初审通过" : "通过并出库"}
          </button>
          <button onClick={() => reject.mutate(req.id, { onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "操作失败") })} className="rounded-twin-sm bg-red-500 px-4 py-1.5 text-sm font-medium text-white">拒绝</button>
        </div>
      )}
    </div>
  );
}

function ScanDelayPendingCard({ req, highlightRequestId, onReview }: { req: ScanDelayPendingRequest; highlightRequestId: string | null; onReview: (req: ScanDelayPendingRequest, approve: boolean) => Promise<void> }) {
  return (
    <div className={`rounded-twin-lg border bg-[var(--twin-canvas)] p-4 shadow-twin-level-1 space-y-2 ${highlightRequestId && String(req.id) === highlightRequestId ? "border-[var(--twin-primary)] ring-2 ring-[var(--twin-primary)]/30" : "border-[var(--twin-hairline)]"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-[var(--twin-mute)]">#{req.id}</span>
        <span className="text-[11px] px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">待审核</span>
      </div>
      <p className="text-sm text-[var(--twin-ink)]"><span className="font-medium">{req.roomName || req.roomId}</span><span className="text-[var(--twin-mute)]"> · {req.optionLabel || "延迟免冻结"}</span></p>
      <p className="text-sm font-medium text-[var(--twin-ink)]">
        {req.subjectDisplayName || req.subjectUserId}
        <span className="font-normal text-[var(--twin-mute)]"> · {req.subjectGroupName || "未标注课题组"} · 历史已通过 {req.approvedCount ?? 0} 次{(req.referenceSeq ?? 0) > 0 ? `（本次为第 ${req.referenceSeq} 次）` : ""}</span>
      </p>
      {req.createdAt ? (<p className="text-xs text-[var(--twin-mute)]">申请于 {formatBeijingDateTimeFull(req.createdAt)}</p>) : null}
      <div className="flex gap-2 pt-2 border-t border-[var(--twin-hairline)]">
        <button type="button" onClick={() => void onReview(req, true)} className="rounded-twin-sm bg-green-600 px-4 py-1.5 text-sm font-medium text-white">通过并授予免冻结</button>
        <button type="button" onClick={() => void onReview(req, false)} className="rounded-twin-sm bg-red-500 px-4 py-1.5 text-sm font-medium text-white">拒绝</button>
      </div>
    </div>
  );
}

function ScanDelayHistoryCard({ req }: { req: ScanDelayHistoryRequest }) {
  return (
    <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-[var(--twin-mute)]">#{req.id}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${req.status === "APPROVED" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>{req.status === "APPROVED" ? "已通过" : "已拒绝"}</span>
      </div>
      <p className="text-sm text-[var(--twin-ink)]"><span className="font-medium">{req.roomName || req.roomId}</span><span className="text-[var(--twin-mute)]"> · {req.optionLabel || "延迟免冻结"}</span></p>
      <p className="text-sm font-medium text-[var(--twin-ink)]">{req.subjectDisplayName || req.subjectUserId}<span className="font-normal text-[var(--twin-mute)]"> · {req.subjectGroupName || "未标注课题组"}</span></p>
      {req.createdAt ? (<p className="text-xs text-[var(--twin-mute)]">申请于 {formatBeijingDateTimeFull(req.createdAt)}</p>) : null}
      {req.reviewedAt ? (<p className="text-xs text-[var(--twin-mute)]">处理于 {formatBeijingDateTimeFull(req.reviewedAt)}{req.reviewedBy ? <span> · 审核人 {req.reviewedBy}</span> : null}</p>) : null}
    </div>
  );
}
