import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useSearchParams, useNavigate, useLocation, Link } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { usePendingMaterialRequests, useFinishedMaterialRequests, useApproveMaterialRequest, useRejectMaterialRequest, useRevokeMaterialRequest, useDeleteMaterialRequest } from "@/api/hooks/useMaterial";
import { fetchAllMaterialDemands, resolveMaterialDemand, exportMaterialAuditTrail, type MaterialDemand } from "@/api/domains/material.api";
import {
  fetchPendingScanDelayRequests,
  fetchScanDelayHistory,
  reviewScanDelayRequest,
  deleteScanDelayRequest,
  type ScanDelayPendingRequest,
  type ScanDelayHistoryRequest,
} from "@/api/domains/scanDelay.api";
import { fetchAdminMaterialItems, type MaterialItem } from "@/api/domains/material.api";
import { fetchPendingTrainingSessions, auditTrainee, scoreTrainee, type PendingTrainingSession, type Trainee } from "@/api/domains/aro-training.api";
import { ScanDelayAutoApprovePanel } from "@/features/scan-delay-auto-approve/ScanDelayAutoApprovePanel";
import { MaterialAutoApprovePanel } from "@/features/material-auto-approve/MaterialAutoApprovePanel";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import type { MaterialRequest, MaterialRequestLine } from "@/api/domains/material.api";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";
import DataSkeleton from "@/components/ui/DataSkeleton";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { materialQueryKeys } from "@/api/hooks/queryKeys";
import { authHttp } from "@/api/core/authHttp";
import toast from "react-hot-toast";
import { formatBeijingDateTimeFull, parseToDate, sameCalendarDayBeijing } from "@/utils/beijingTime";
import { studentReviewPendingQueryOptions } from "@/features/student-review/studentReviewPoll";
import { MATERIAL_REVIEW_FINISHED_PAGE } from "@/features/student-review/materialReviewCache";
import {
  ADMIN_NOTIFICATION_SSE_PUSH_EVENT,
  ADMIN_PENDING_BADGES_REFRESH_EVENT,
  ARO_TRAINING_PENDING_SSE_EVENT,
} from "@/features/admin/adminPendingBadgesEvents";
import {
  groupScanDelayByOption,
  scanDelayOptionDisplayLabel,
  scanDelayOptionWebColor,
  type ScanDelayOptionGroup,
} from "@/utils/scanDelayReviewDisplay";

type TabKey = "material" | "scanDelay" | "demands" | "aroTraining";

function parseReviewTab(raw: string | null): TabKey {
  if (raw === "scanDelay" || raw === "demands" || raw === "aroTraining") return raw;
  return "material";
}

function statusLabel(s: string) {
  const m: Record<string, string> = { DRAFT: "草稿", PENDING: "待审核", FIRST_OK: "初审通过", APPROVED: "已通过", REJECTED: "已拒绝", FULFILLED: "已出库", RECEIVED: "已完成" };
  return m[s] || s;
}
function isToday(dateStr?: string): boolean {
  const d = parseToDate(dateStr);
  if (!d) return false;
  return sameCalendarDayBeijing(d, new Date());
}

function isMaterialPendingStatus(status: string): boolean {
  return status === "PENDING" || status === "FIRST_OK";
}

function statusBadge(s: string): string {
  if (s === "PENDING" || s === "FIRST_OK") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "APPROVED") return "bg-green-50 text-green-700 border-green-200";
  if (s === "REJECTED") return "bg-red-50 text-red-700 border-red-200";
  if (s === "FULFILLED") return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "RECEIVED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}
/** 卡片纯色背景：通过 twin token 切换明/暗色，不依赖 Tailwind dark: 变体。无彩色边框。 */
function cardStatusTint(s: string): string {
  if (s === "PENDING" || s === "FIRST_OK") return "bg-[var(--twin-card-pending)]";
  if (s === "APPROVED" || s === "FULFILLED" || s === "RECEIVED") return "bg-[var(--twin-card-approved)]";
  if (s === "REJECTED") return "bg-[var(--twin-card-rejected)]";
  return "bg-[var(--twin-canvas)]";
}
function primaryItemName(req: MaterialRequest): string {
  return req.lines?.[0]?.snapshotName || "未命名物品";
}
function groupByItem(reqs: MaterialRequest[]): Map<string, MaterialRequest[]> {
  const map = new Map<string, MaterialRequest[]>();
  for (const r of reqs) {
    const k = primaryItemName(r);
    const list = map.get(k) || [];
    list.push(r);
    map.set(k, list);
  }
  return map;
}
function downloadBlob(blob: Blob, name: string) { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); }

/** 与后端 MaterialService.canonicalUserId / isInReviewerList 对齐：兼容 reviewer 配置存 userId 或 username */
function reviewerIdentityKeys(): string[] {
  const info = authStorage.getUserInfo();
  const keys: string[] = [];
  const id = info?.id?.trim() || authStorage.getUserIdFromToken()?.trim();
  const username = info?.username?.trim();
  if (id) keys.push(id);
  if (username) keys.push(username);
  return keys;
}

function matchesReviewerIds(configured: string[] | undefined): boolean {
  const keys = reviewerIdentityKeys();
  if (!keys.length || !configured?.length) return false;
  return configured.some((rid) => keys.includes(String(rid).trim()));
}

function formatSpecLabel(specJson: string | undefined | null): string {
  if (!specJson) return '';
  try {
    const obj = JSON.parse(specJson);
    return Object.values(obj).join('·');
  } catch { return ''; }
}

export default function MaterialReviewPage() {
  const role = authStorage.getRole() || "MEMBER";
  const canDelete = hasMinRole(role, "SUPER_ADMIN");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  /** 与 URL ?tab= 单一同步；避免 hash 跳转到无 tab 时仍停留在 scanDelay */
  const tab = parseReviewTab(searchParams.get("tab"));
  const [autoApproveOpen, setAutoApproveOpen] = useState(false);
  const [materialAutoApproveOpen, setMaterialAutoApproveOpen] = useState(false);
  const highlightRequestId = searchParams.get("requestId");
  /** 一键通过：hover 下拉 + 已选集合 */
  const [batchDropdownOpen, setBatchDropdownOpen] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());

  const { data: pendingData, isLoading: pendingLoading } = usePendingMaterialRequests();
  const { data: finishedData, isLoading: finishedLoading } = useFinishedMaterialRequests({ page: 1, size: 200 });
  const approve = useApproveMaterialRequest();
  const reject = useRejectMaterialRequest();
  const revoke = useRevokeMaterialRequest();
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

  // ── 培训审批 ──
  const { data: pendingSessions = [], isLoading: trainingLoading } = useQuery({
    queryKey: ["aro-training", "sessions", "pending"],
    queryFn: fetchPendingTrainingSessions,
    enabled: tab === "aroTraining",
    ...studentReviewPendingQueryOptions,
  });

  const trainingAuditMutation = useMutation({
    mutationFn: ({ examSignId, state }: { examSignId: string; state: 1 | 2 }) => auditTrainee(examSignId, state),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["aro-training", "sessions", "pending"] }); },
  });

  const trainingScoreMutation = useMutation({
    mutationFn: ({ examSignId, state }: { examSignId: string; state: 1 | 2 }) => scoreTrainee(examSignId, state),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["aro-training", "sessions", "pending"] }); },
  });

  // 培训审批：按时间分组
  const trainingGroups = useMemo(() => {
    const today: PendingTrainingSession[] = [];
    const historyPending: PendingTrainingSession[] = [];
    const historyDone: PendingTrainingSession[] = [];
    for (const sess of pendingSessions) {
      // 按 session 中的 trainees 判定：若全部 trainee 已审核（testYn !== 0）且已评分（testFraction !== 0），归为"历史"
      const allDone = sess.trainees.every((t) => t.testYn !== 0 && t.testFraction !== 0);
      if (allDone) {
        historyDone.push(sess);
        continue;
      }
      // 按场次开始时间判定今天/历史待审（trainee 无有效 createdAt）
      const sessionTime = sess.session.startTime;
      if (sessionTime && isToday(sessionTime)) {
        today.push(sess);
      } else {
        historyPending.push(sess);
      }
    }
    return { today, historyPending, historyDone };
  }, [pendingSessions]);

  const trainingTotalPending = useMemo(
    () => pendingSessions.reduce((sum, s) => sum + s.trainees.filter((t) => t.testYn === 0 || t.testFraction === 0).length, 0),
    [pendingSessions],
  );

  const { data: allItems = [] } = useQuery<MaterialItem[]>({
    queryKey: ["material", "admin", "items"],
    queryFn: () => fetchAdminMaterialItems(),
    staleTime: 60_000,
  });

  const { data: reviewerList = [] } = useQuery<{ id: string; username?: string; displayNickname?: string }[]>({
    queryKey: ["material", "admin", "eligible-reviewers"],
    queryFn: async () => {
      const res = await authHttp.get<{ success: boolean; data: { id: string; username?: string; displayNickname?: string }[] }>("/material/admin/eligible-reviewers");
      return res.data?.data ?? [];
    },
    staleTime: 120_000,
  });

  const reviewerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reviewerList) {
      map.set(r.id, r.displayNickname || r.username || r.id);
    }
    return map;
  }, [reviewerList]);

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

  const isMyItem = useCallback(
    (itemId: number) => matchesReviewerIds(itemReviewerMap.get(itemId)),
    [itemReviewerMap],
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
    const refreshTraining = () => {
      void qc.invalidateQueries({ queryKey: ["aro-training", "sessions", "pending"] });
    };
    window.addEventListener(ADMIN_PENDING_BADGES_REFRESH_EVENT, refreshPending);
    window.addEventListener(ADMIN_NOTIFICATION_SSE_PUSH_EVENT, refreshPending);
    window.addEventListener(ARO_TRAINING_PENDING_SSE_EVENT, refreshTraining);
    return () => {
      window.removeEventListener(ADMIN_PENDING_BADGES_REFRESH_EVENT, refreshPending);
      window.removeEventListener(ADMIN_NOTIFICATION_SSE_PUSH_EVENT, refreshPending);
      window.removeEventListener(ARO_TRAINING_PENDING_SSE_EVENT, refreshTraining);
    };
  }, [qc, tab]);

  // 待审列表已由后端按审核人过滤；已审结历史按「我负责的物品」筛选；合并时 pending 优先，避免缓存重叠重复展示
  const filteredMaterialRequests = useMemo(() => {
    const pending = pendingData ?? [];
    const pendingIds = new Set(pending.map((r) => r.id));
    const finished = (finishedData?.data ?? []).filter(
      (req) => !pendingIds.has(req.id) && (req.lines ?? []).some((line) => isMyItem(line.itemId)),
    );
    return [...pending, ...finished].sort(
      (a, b) => (parseToDate(b.createdAt)?.getTime() ?? 0) - (parseToDate(a.createdAt)?.getTime() ?? 0),
    );
  }, [pendingData, finishedData, isMyItem]);

  const filteredMaterialPendingCount = useMemo(
    () => (pendingData ?? []).filter((r) => isMaterialPendingStatus(r.status)).length,
    [pendingData],
  );

  const materialToday = useMemo(() => filteredMaterialRequests.filter(r => isToday(r.createdAt)), [filteredMaterialRequests]);
  const materialHistory = useMemo(() => filteredMaterialRequests.filter(r => !isToday(r.createdAt)), [filteredMaterialRequests]);
  // 历史中的待审项独立分组，避免混入已审结列表被遗漏
  const materialHistoryPending = useMemo(() => materialHistory.filter(r => isMaterialPendingStatus(r.status)), [materialHistory]);
  const materialHistoryDone = useMemo(() => materialHistory.filter(r => !isMaterialPendingStatus(r.status)), [materialHistory]);
  // 今天也拆分待审/已审：待审展开、已审默认折叠（对齐小程序 studentReviewHub 的 splitMaterialSubGroupsByStatus）
  const materialTodayPending = useMemo(() => materialToday.filter(r => isMaterialPendingStatus(r.status)), [materialToday]);
  const materialTodayDone = useMemo(() => materialToday.filter(r => !isMaterialPendingStatus(r.status)), [materialToday]);

  /** 友好课题组：当前审核人历史上审批通过 + 已出库 + 已完成的课题组集合 */
  const friendlyGroups = useMemo(() => {
    const groups = new Set<string>();
    const finished = finishedData?.data ?? [];
    for (const req of finished) {
      const g = (req as any).applicantGroup as string | undefined;
      if (g && (req.status === "APPROVED" || req.status === "FULFILLED" || req.status === "RECEIVED")) {
        groups.add(g);
      }
    }
    return groups;
  }, [finishedData]);

  /** 所有待审核项（用于一键通过下拉：友好在前、默认选中，非友好可手动勾选） */
  const allPendingForBatch = useMemo(() => {
    const pending = pendingData ?? [];
    type Augmented = MaterialRequest & { _friendly: boolean };
    return (pending
      .filter(r => isMaterialPendingStatus(r.status))
      .map(r => {
        const g = (r as any).applicantGroup as string | undefined;
        return { ...r, _friendly: !!(g && friendlyGroups.has(g)) } as Augmented;
      }) as Augmented[])
      .sort((a, b) => {
        if (a._friendly !== b._friendly) return a._friendly ? -1 : 1;
        return (parseToDate(b.createdAt)?.getTime() ?? 0) - (parseToDate(a.createdAt)?.getTime() ?? 0);
      });
  }, [pendingData, friendlyGroups]);

  // 一键通过默认只选中友好课题组（仅列表实际变化时重置，避免无限循环）
  const materialBatchKey = allPendingForBatch.map(r => `${r.id}:${(r as any)._friendly}`).join(',');
  const prevMaterialKey = useRef(materialBatchKey);
  useEffect(() => {
    if (prevMaterialKey.current === materialBatchKey) return;
    prevMaterialKey.current = materialBatchKey;
    setBatchSelectedIds(new Set(allPendingForBatch.filter(r => r._friendly).map(r => String(r.id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialBatchKey]);

  /** scanDelay 友好申请人：历史上审批通过过的申请人集合（按 subjectUserId） */
  const friendlyScanDelayApplicants = useMemo(() => {
    const applicants = new Set<string>();
    for (const r of scanDelayHistory) {
      if (r.subjectUserId && r.status === "APPROVED") {
        applicants.add(r.subjectUserId);
      }
    }
    return applicants;
  }, [scanDelayHistory]);

  /** scanDelay 所有待审核项（友好在前、默认选中，非友好可手动勾选） */
  const allScanDelayPendingForBatch = useMemo(() => {
    type Augmented = ScanDelayPendingRequest & { _friendly: boolean };
    return (scanDelayPending
      .map(r => {
        const isFriendly = r.subjectUserId ? friendlyScanDelayApplicants.has(r.subjectUserId) : false;
        return { ...r, _friendly: isFriendly } as Augmented;
      }) as Augmented[])
      .sort((a, b) => {
        if (a._friendly !== b._friendly) return a._friendly ? -1 : 1;
        return (parseToDate(b.createdAt)?.getTime() ?? 0) - (parseToDate(a.createdAt)?.getTime() ?? 0);
      });
  }, [scanDelayPending, friendlyScanDelayApplicants]);

  // scanDelay 一键通过默认只选中友好申请人（仅列表实际变化时重置，避免无限循环）
  const [scanDelayBatchDropdownOpen, setScanDelayBatchDropdownOpen] = useState(false);
  const [scanDelayBatchSelectedIds, setScanDelayBatchSelectedIds] = useState<Set<number>>(new Set());
  const scanDelayBatchKey = allScanDelayPendingForBatch.map(r => `${r.id}:${(r as any)._friendly}`).join(',');
  const prevScanDelayKey = useRef(scanDelayBatchKey);
  useEffect(() => {
    if (prevScanDelayKey.current === scanDelayBatchKey) return;
    prevScanDelayKey.current = scanDelayBatchKey;
    setScanDelayBatchSelectedIds(new Set(allScanDelayPendingForBatch.filter(r => r._friendly).map(r => r.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanDelayBatchKey]);

  const handleScanDelayBatchApprove = async () => {
    const ids = Array.from(scanDelayBatchSelectedIds);
    if (ids.length === 0) { toast.error("未选中任何申请"); return; }
    let ok = 0; let fail = 0;
    for (const id of ids) {
      try { await reviewScanDelayRequest(id, true); ok++; }
      catch { fail++; }
    }
    if (fail === 0) toast.success(`一键通过 ${ok} 条免冻结申请`);
    else toast.success(`通过 ${ok} 条，${fail} 条失败`);
    setScanDelayBatchDropdownOpen(false);
    void qc.invalidateQueries({ queryKey: ["scan-delay", "pending"] });
    void qc.invalidateQueries({ queryKey: ["scan-delay", "history"] });
  };

  /** 待审已由后端按审核人过滤；历史接口为全员可见，勿再用 optionReviewerMap 二次过滤 */
  const filteredScanDelayPending = scanDelayPending;

  const filteredScanDelayHistory = useMemo(
    () => scanDelayHistory.filter((r) => !!r.reviewedBy),
    [scanDelayHistory],
  );

  const allScanDelay = useMemo(() => [
    ...filteredScanDelayPending.map(r => ({ ...r, _kind: "pending" as const })),
    ...filteredScanDelayHistory.map(r => ({ ...r, _kind: "history" as const })),
  ].sort(
    (a, b) => (parseToDate(b.createdAt)?.getTime() ?? 0) - (parseToDate(a.createdAt)?.getTime() ?? 0),
  ), [filteredScanDelayPending, filteredScanDelayHistory]);

  // 按选项分组（与小程序 studentReviewHub 对齐：每组内 pending 在前，history 在后）
  const scanDelayGrouped = useMemo(() => groupScanDelayByOption(allScanDelay), [allScanDelay]);

  // 自动折叠：无待审项的选项组自动收起
  const [scanDelayCollapse, setScanDelayCollapse] = useState<Record<string, boolean>>({});
  const toggleScanDelayGroup = (groupKey: string) => {
    setScanDelayCollapse(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  // Loading state
  const loading = tab === "material"
    ? pendingLoading || finishedLoading
    : tab === "demands"
      ? demandLoading
      : tab === "aroTraining"
        ? trainingLoading
        : scanDelayLoading || scanDelayHistoryLoading;

  const handleExportPersonal = async (reqId: string) => {
    try { const blob = await exportMaterialAuditTrail({}); downloadBlob(blob, `material-request-${reqId}.xlsx`); toast.success("已导出"); }
    catch { toast.error("导出失败"); }
  };

  const handleBatchApprove = async () => {
    const ids = Array.from(batchSelectedIds);
    if (ids.length === 0) { toast.error("未选中任何申领"); return; }
    let ok = 0; let fail = 0;
    for (const id of ids) {
      try { await approve.mutateAsync(id); ok++; }
      catch { fail++; }
    }
    if (fail === 0) toast.success(`一键通过 ${ok} 条申领`);
    else toast.success(`通过 ${ok} 条，${fail} 条失败`);
    setBatchDropdownOpen(false);
    // 刷新待审列表
    void qc.invalidateQueries({ queryKey: materialQueryKeys.pendingRequests() });
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

  const handleScanDelayDelete = async (req: { id: number; status: string }) => {
    if (!window.confirm(`确定删除该申请（#${req.id}）？删除后不再参与防重复判定。`)) return;
    try {
      await deleteScanDelayRequest(req.id);
      if (req.status === "PENDING") {
        qc.setQueryData<ScanDelayPendingRequest[]>(["scan-delay", "pending"], (prev) =>
          (prev ?? []).filter((r) => r.id !== req.id)
        );
      }
      void qc.invalidateQueries({ queryKey: ["scan-delay", "history"] });
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <div className="space-y-6">
      <AdminSubPageHeader
        title={<span>学生审核{tab === "material" && <button type="button" onClick={() => navigate(`${toAdminRoutePath("/admin/material/audit-export")}`, { state: { returnTo: `${location.pathname}${location.search}` } })} className="ml-2 text-xs font-normal text-sky-600 hover:text-sky-700 hover:underline align-middle">申领审计导出 →</button>}</span>}
        fallbackTo="/admin"
        description="审核学生物资申领、延迟免冻结申请与需求建议。"
      />
      <div className="flex flex-wrap items-center justify-between gap-1">
        <div className="flex flex-wrap gap-1">
          {([
            ["material", `物资审核${filteredMaterialPendingCount > 0 ? ` (${filteredMaterialPendingCount})` : ""}`],
            ["scanDelay", `延迟免冻结${filteredScanDelayPending.length > 0 ? ` (${filteredScanDelayPending.length})` : ""}`],
            ["aroTraining", `培训审批${trainingTotalPending > 0 ? ` (${trainingTotalPending})` : ""}`],
            ["demands", (() => {
              const open = demands.filter((d: MaterialDemand) => d.status === 0).length;
              return `需求建议${open > 0 ? ` (${open})` : ""}`;
            })()],
          ] as [TabKey, string][]).map(([k, v]) => (
            <button key={k} onClick={() => switchTab(k)} className={`rounded-twin-sm px-4 py-1.5 text-sm font-medium transition-colors ${tab === k ? "bg-[var(--twin-primary)] text-[var(--twin-on-primary)]" : "border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"}`}>{v}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {tab === "material" && (
            <div className="relative"
              onMouseEnter={() => setBatchDropdownOpen(true)}
              onMouseLeave={() => setBatchDropdownOpen(false)}
            >
              <button type="button"
                className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 py-1 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] transition-colors flex items-center gap-1.5"
              >
                <span className="inline-block size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                一键通过 {batchSelectedIds.size}/{allPendingForBatch.length}
              </button>
            {batchDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-[var(--z-dropdown)] w-80 max-h-72 overflow-y-auto rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-2 p-2 space-y-1">
                {allPendingForBatch.length === 0 ? (
                  <div className="py-3 text-center">
                    <p className="text-xs text-[var(--twin-mute)]">暂无待审核申领</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between pb-1.5 border-b border-[var(--twin-hairline)] mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-[var(--twin-body)]">待审核</span>
                        <span className="text-[10px] text-[var(--twin-mute)]">{allPendingForBatch.length} 条</span>
                      </div>
                      <button type="button"
                        onClick={() => {
                          if (batchSelectedIds.size === allPendingForBatch.length) {
                            setBatchSelectedIds(new Set());
                          } else {
                            setBatchSelectedIds(new Set(allPendingForBatch.map(r => String(r.id))));
                          }
                        }}
                        className="text-[10px] text-[var(--twin-mute)] hover:text-[var(--twin-body)] transition-colors"
                      >
                        {batchSelectedIds.size === allPendingForBatch.length ? "取消全选" : "全选"}
                      </button>
                    </div>
                    {(() => {
                      // 按物品名称分组
                      const groups = new Map<string, typeof allPendingForBatch>();
                      for (const req of allPendingForBatch) {
                        const name = ((req as any).lines || [])[0]?.snapshotName || "未命名物品";
                        if (!groups.has(name)) groups.set(name, []);
                        groups.get(name)!.push(req);
                      }
                      return Array.from(groups.entries()).map(([itemName, reqs]) => (
                        <div key={itemName} className="space-y-1">
                          <div className="flex items-center gap-1.5 pt-1 pb-0.5">
                            <span className="w-1 h-1 rounded-full bg-[var(--twin-mute)]/50 shrink-0" />
                            <span className="text-[10px] font-medium text-[var(--twin-mute)]">{itemName}</span>
                            <span className="text-[10px] text-[var(--twin-mute)]/70">{reqs.length} 条</span>
                          </div>
                          {reqs.map(req => {
                            const rid = String(req.id);
                            const checked = batchSelectedIds.has(rid);
                            const isFriendly = (req as any)._friendly as boolean;
                            const lines: any[] = (req as any).lines || [];
                            const totalQty = lines.reduce((s: number, l: any) => s + (l.qty || 0), 0);
                            const groupName = (req as any).applicantGroup || "";
                            const applicant = (req as any).applicantName || (req as any).userId || "";
                            return (
                              <label key={rid}
                                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-twin-sm cursor-pointer hover:bg-[var(--twin-canvas-soft)] transition-colors ${checked ? "bg-emerald-50/40" : ""}`}
                              >
                                <input type="checkbox" checked={checked}
                                  onChange={() => {
                                    const next = new Set(batchSelectedIds);
                                    if (checked) next.delete(rid); else next.add(rid);
                                    setBatchSelectedIds(next);
                                  }}
                                  className="shrink-0 accent-emerald-600"
                                />
                                <span className={`inline-block size-2 rounded-full shrink-0 ${isFriendly ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]" : "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]"}`} />
                                <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
                                  <span className="text-xs font-medium text-[var(--twin-body)] truncate">{applicant}{groupName ? ` (${groupName})` : ""}</span>
                                  {totalQty > 0 && <span className="text-[10px] text-[var(--twin-mute)] shrink-0">×{totalQty}</span>}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      ));
                    })()}
                    <div className="pt-1.5 border-t border-[var(--twin-hairline)]">
                      <button type="button"
                        onClick={handleBatchApprove}
                        disabled={batchSelectedIds.size === 0}
                        className="w-full rounded-twin-sm bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                      >
                        确认一键通过 ({batchSelectedIds.size} 条)
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {tab === "scanDelay" && (
          <div className="relative"
            onMouseEnter={() => setScanDelayBatchDropdownOpen(true)}
            onMouseLeave={() => setScanDelayBatchDropdownOpen(false)}
          >
            <button type="button"
              className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 py-1 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] transition-colors flex items-center gap-1.5"
            >
              <span className="inline-block size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
              一键通过 {scanDelayBatchSelectedIds.size}/{allScanDelayPendingForBatch.length}
            </button>
            {scanDelayBatchDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-[var(--z-dropdown)] w-80 max-h-72 overflow-y-auto rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-2 p-2 space-y-1">
                {allScanDelayPendingForBatch.length === 0 ? (
                  <div className="py-3 text-center">
                    <p className="text-xs text-[var(--twin-mute)]">暂无待审核免冻结申请</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between pb-1.5 border-b border-[var(--twin-hairline)] mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-[var(--twin-body)]">待审核</span>
                        <span className="text-[10px] text-[var(--twin-mute)]">{allScanDelayPendingForBatch.length} 条</span>
                      </div>
                      <button type="button"
                        onClick={() => {
                          if (scanDelayBatchSelectedIds.size === allScanDelayPendingForBatch.length) {
                            setScanDelayBatchSelectedIds(new Set());
                          } else {
                            setScanDelayBatchSelectedIds(new Set(allScanDelayPendingForBatch.map(r => r.id)));
                          }
                        }}
                        className="text-[10px] text-[var(--twin-mute)] hover:text-[var(--twin-body)] transition-colors"
                      >
                        {scanDelayBatchSelectedIds.size === allScanDelayPendingForBatch.length ? "取消全选" : "全选"}
                      </button>
                    </div>
                    {(() => {
                      // 按延迟选项分组
                      const groups = new Map<string, typeof allScanDelayPendingForBatch>();
                      for (const req of allScanDelayPendingForBatch) {
                        const label = scanDelayOptionDisplayLabel(req);
                        if (!groups.has(label)) groups.set(label, []);
                        groups.get(label)!.push(req);
                      }
                      return Array.from(groups.entries()).map(([optLabel, reqs]) => (
                        <div key={optLabel} className="space-y-1">
                          <div className="flex items-center gap-1.5 pt-1 pb-0.5">
                            <span className="w-1 h-1 rounded-full bg-[var(--twin-mute)]/50 shrink-0" />
                            <span className="text-[10px] font-medium text-[var(--twin-mute)]">{optLabel}</span>
                            <span className="text-[10px] text-[var(--twin-mute)]/70">{reqs.length} 条</span>
                          </div>
                          {reqs.map(req => {
                            const rid = req.id;
                            const checked = scanDelayBatchSelectedIds.has(rid);
                            const isFriendly = (req as any)._friendly as boolean;
                            const name = req.subjectDisplayName || req.subjectUserId || "";
                            const group = req.subjectGroupName || "";
                            return (
                              <label key={rid}
                                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-twin-sm cursor-pointer hover:bg-[var(--twin-canvas-soft)] transition-colors ${checked ? "bg-emerald-50/40" : ""}`}
                              >
                                <input type="checkbox" checked={checked}
                                  onChange={() => {
                                    const next = new Set(scanDelayBatchSelectedIds);
                                    if (checked) next.delete(rid); else next.add(rid);
                                    setScanDelayBatchSelectedIds(next);
                                  }}
                                  className="shrink-0 accent-emerald-600"
                                />
                                <span className={`inline-block size-2 rounded-full shrink-0 ${isFriendly ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]" : "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]"}`} />
                                <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
                                  <span className="text-xs font-medium text-[var(--twin-body)] truncate">{name}{group ? ` (${group})` : ""}</span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      ));
                    })()}
                    <div className="pt-1.5 border-t border-[var(--twin-hairline)]">
                      <button type="button"
                        onClick={handleScanDelayBatchApprove}
                        disabled={scanDelayBatchSelectedIds.size === 0}
                        className="w-full rounded-twin-sm bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                      >
                        确认一键通过 ({scanDelayBatchSelectedIds.size} 条)
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {(tab === "material" || tab === "scanDelay") && (
          <button type="button" onClick={() => tab === "material" ? setMaterialAutoApproveOpen(true) : setAutoApproveOpen(true)} className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 py-1 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]">自动审批</button>
        )}
        </div>
      </div>

      {tab === "scanDelay" ? (
        <div className="space-y-3">
          {scanDelayLoading || scanDelayHistoryLoading ? <DataSkeleton variant="card" rows={4} /> : null}
          {allScanDelay.length === 0 && !scanDelayLoading && !scanDelayHistoryLoading ? (
            <p className="text-center text-sm text-[var(--twin-mute)] py-12">暂无延迟免冻结记录</p>
          ) : (
            <div className="space-y-4">
              {[...scanDelayGrouped].sort((a, b) => {
                const aP = a.items.some(i => i._kind === "pending") ? 1 : 0;
                const bP = b.items.some(i => i._kind === "pending") ? 1 : 0;
                return bP - aP; // 有 pending 的置顶
              }).map((group) => {
                const pendingItems = group.items.filter(i => i._kind === "pending");
                const historyItems = group.items.filter(i => i._kind === "history");
                const hasPending = pendingItems.length > 0;
                const isCollapsed = scanDelayCollapse[group.groupKey] ?? (!hasPending);
                return (
                  <div key={group.groupKey} className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleScanDelayGroup(group.groupKey)}
                      className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[var(--twin-canvas-soft)] transition-colors text-left"
                    >
                      <span className="text-xs transition-transform duration-200" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                      <span className="text-sm font-semibold text-[var(--twin-body)]">{group.optionLabel}</span>
                      {hasPending && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{pendingItems.length} 待审</span>
                      )}
                      <span className="text-[11px] text-[var(--twin-mute)] ml-auto">{group.count} 条</span>
                    </button>
                    {!isCollapsed && (
                      <div className="px-4 pb-4 space-y-3 border-t border-[var(--twin-hairline)] pt-3">
                        {hasPending && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-amber-700">待审核</span>
                              <span className="text-[11px] text-[var(--twin-mute)]">{pendingItems.length} 条</span>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                              {pendingItems.map((item) => (
                                <ScanDelayPendingCard
                                  key={`p-${item.id}`}
                                  req={item}
                                  highlightRequestId={highlightRequestId}
                                  onReview={handleScanDelayReview}
                                  onDelete={handleScanDelayDelete}
                                  isFriendly={item.subjectUserId ? friendlyScanDelayApplicants.has(item.subjectUserId) : undefined}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                        {historyItems.length > 0 && (
                          <ScanDelayHistorySection
                            items={historyItems}
                            reviewerNameMap={reviewerNameMap}
                            onDelete={handleScanDelayDelete}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
      ) : tab === "aroTraining" ? (
        <div className="space-y-6">
          {trainingLoading ? <DataSkeleton variant="card" rows={5} /> : null}
          {pendingSessions.length === 0 && !trainingLoading ? (
            <p className="text-center text-sm text-[var(--twin-mute)] py-12">暂无待审批培训</p>
          ) : (
            <>
              {/* 今天 */}
              {trainingGroups.today.length > 0 && (
                <TimeGroup label="今天" count={trainingGroups.today.reduce((s, sess) => s + sess.trainees.length, 0)} defaultOpen={true}>
                  <div className="space-y-4">
                    {trainingGroups.today.map((sess) => (
                      <TrainingSessionGroup
                        key={sess.session.id}
                        session={sess.session}
                        trainees={sess.trainees}
                        onAudit={(examSignId, state) => trainingAuditMutation.mutate({ examSignId, state })}
                        onScore={(examSignId, state) => trainingScoreMutation.mutate({ examSignId, state })}
                      />
                    ))}
                  </div>
                </TimeGroup>
              )}
              {/* 待审核（历史） */}
              {trainingGroups.historyPending.length > 0 && (
                <TimeGroup label="待审核（历史）" count={trainingGroups.historyPending.reduce((s, sess) => s + sess.trainees.length, 0)} defaultOpen={true}>
                  <div className="space-y-4">
                    {trainingGroups.historyPending.map((sess) => (
                      <TrainingSessionGroup
                        key={sess.session.id}
                        session={sess.session}
                        trainees={sess.trainees}
                        onAudit={(examSignId, state) => trainingAuditMutation.mutate({ examSignId, state })}
                        onScore={(examSignId, state) => trainingScoreMutation.mutate({ examSignId, state })}
                      />
                    ))}
                  </div>
                </TimeGroup>
              )}
              {/* 历史 */}
              {trainingGroups.historyDone.length > 0 && (
                <TimeGroup label="历史" count={trainingGroups.historyDone.reduce((s, sess) => s + sess.trainees.length, 0)} defaultOpen={false}>
                  <div className="space-y-4">
                    {trainingGroups.historyDone.map((sess) => (
                      <TrainingSessionGroup
                        key={sess.session.id}
                        session={sess.session}
                        trainees={sess.trainees}
                        onAudit={(examSignId, state) => trainingAuditMutation.mutate({ examSignId, state })}
                        onScore={(examSignId, state) => trainingScoreMutation.mutate({ examSignId, state })}
                      />
                    ))}
                  </div>
                </TimeGroup>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {loading ? <DataSkeleton variant="card" rows={5} /> : null}
          {filteredMaterialRequests.length === 0 && !loading ? (
            <p className="text-center text-sm text-[var(--twin-mute)] py-12">暂无你负责审核的物资申领</p>
          ) : (
            <div className="space-y-6">
              {materialToday.length > 0 && (
                <TimeGroup label="今天" count={materialToday.length}>
                  <div className="space-y-4">
                    {/* 待审核（今天）— 始终展开 */}
                    {materialTodayPending.length > 0 && (
                      <MaterialRequestGroup
                        items={materialTodayPending}
                        dotColor="bg-[var(--twin-primary)]"
                        canDelete={canDelete}
                        approve={approve}
                        reject={reject}
                        revoke={revoke}
                        deleteReq={deleteReq}
                        handleExportPersonal={handleExportPersonal}
                        friendlyGroups={friendlyGroups}
                      />
                    )}
                    {/* 已审核（今天）— 默认折叠，对齐小程序 studentReviewHub */}
                    {materialTodayDone.length > 0 && (
                      <MaterialResolvedSection
                        items={materialTodayDone}
                        canDelete={canDelete}
                        approve={approve}
                        reject={reject}
                        revoke={revoke}
                        deleteReq={deleteReq}
                        handleExportPersonal={handleExportPersonal}
                        friendlyGroups={friendlyGroups}
                      />
                    )}
                  </div>
                </TimeGroup>
              )}
              {/* 历史中的待审项独立分组，避免混入已审结列表被遗漏 */}
              {materialHistoryPending.length > 0 && (
                <TimeGroup
                  label="待审核（历史）"
                  count={materialHistoryPending.length}
                  defaultOpen={true}
                >
                  <MaterialRequestGroup
                    items={materialHistoryPending}
                    dotColor="bg-amber-400"
                    canDelete={canDelete}
                    approve={approve}
                    reject={reject}
                    revoke={revoke}
                    deleteReq={deleteReq}
                    handleExportPersonal={handleExportPersonal}
                    friendlyGroups={friendlyGroups}
                  />
                </TimeGroup>
              )}
              {materialHistoryDone.length > 0 && (
                <TimeGroup
                  label="历史"
                  count={materialHistoryDone.length}
                  defaultOpen={false}
                >
                  <MaterialRequestGroup
                    items={materialHistoryDone}
                    dotColor="bg-[var(--twin-mute)]"
                    canDelete={canDelete}
                    approve={approve}
                    reject={reject}
                    revoke={revoke}
                    deleteReq={deleteReq}
                    handleExportPersonal={handleExportPersonal}
                    friendlyGroups={friendlyGroups}
                  />
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

function TimeGroup({ label, count, children, defaultOpen = true, className }: { label: string; count: number; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-medium text-[var(--twin-ink)]">
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {label} ({count})
      </button>
      {open && <div className={className || ""}>{children}</div>}
    </div>
  );
}

/** 按物品分组 + 按规格分子组，渲染请求卡片列表。物品名和规格均可折叠收纳。 */
function MaterialRequestGroup({ items, dotColor, canDelete, approve, reject, revoke, deleteReq, handleExportPersonal, friendlyGroups }: { items: MaterialRequest[]; dotColor: string; canDelete: boolean; approve: ReturnType<typeof useApproveMaterialRequest>; reject: ReturnType<typeof useRejectMaterialRequest>; revoke: ReturnType<typeof useRevokeMaterialRequest>; deleteReq: ReturnType<typeof useDeleteMaterialRequest>; handleExportPersonal: (reqId: string) => void; friendlyGroups?: Set<string> }) {
  const hasFriendly = friendlyGroups && friendlyGroups.size > 0;

  // ── 初始折叠状态：待处理物品→展开物品层/折叠规格层；已处理→全折叠 ──
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(() => {
    const collapsed = new Set<string>();
    for (const [itemName, reqs] of groupByItem(items)) {
      const hasPending = reqs.some(r => r.status === "PENDING" || r.status === "FIRST_OK");
      if (!hasPending) collapsed.add(itemName);
    }
    return collapsed;
  });
  const [collapsedSpecs, setCollapsedSpecs] = useState<Set<string>>(() => {
    // 所有规格默认折叠；单品规物品无需折叠（item 展开即直接看到卡片）
    const collapsed = new Set<string>();
    for (const [itemName, reqs] of groupByItem(items)) {
      const specs = new Set(reqs.map(r => r.lines?.[0]?.specSnapshot || '__no_spec__'));
      if (specs.size <= 1) continue; // 单品规不折叠
      for (const specKey of specs) collapsed.add(`${itemName}::${specKey}`);
    }
    return collapsed;
  });

  const toggleItem = (name: string) => setCollapsedItems(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const toggleSpec = (key: string) => setCollapsedSpecs(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  return (
    <div className="space-y-3">
      {Array.from(groupByItem(items)).map(([itemName, reqs]) => {
        const specGroups = new Map<string, MaterialRequest[]>();
        for (const req of reqs) {
          const firstLine = req.lines?.[0];
          const key = firstLine?.specSnapshot || '__no_spec__';
          if (!specGroups.has(key)) specGroups.set(key, []);
          specGroups.get(key)!.push(req);
        }
        const isItemOpen = !collapsedItems.has(itemName);
        const hasSingleSpec = specGroups.size <= 1;
        return (
          <div key={itemName} className="space-y-1.5">
            {/* ── 物品名行（可折叠） ── */}
            <button
              type="button"
              onClick={() => toggleItem(itemName)}
              className="flex items-center gap-2 pl-1 cursor-pointer hover:text-[var(--app-color-text-primary)] transition-colors text-left w-full"
            >
              <span className={`text-[10px] transition-transform shrink-0 ${isItemOpen ? "rotate-90" : ""}`}>▶</span>
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />
              <span className="text-xs font-medium text-[var(--twin-body)] truncate">{itemName}</span>
              <span className="text-[11px] text-[var(--twin-mute)] shrink-0">{reqs.length} 条</span>
            </button>
            {isItemOpen && (
              <div className={hasSingleSpec ? "space-y-0" : "space-y-1.5"}>
                {Array.from(specGroups.entries()).map(([specKey, specReqs]) => {
                  const specCollapseKey = `${itemName}::${specKey}`;
                  const isSpecOpen = !collapsedSpecs.has(specCollapseKey);
                  const showSpecToggle = !hasSingleSpec && specKey !== '__no_spec__';
                  return (
                    <div key={specKey}>
                      {/* ── 规格行（多规格时可折叠） ── */}
                      {specKey !== '__no_spec__' && (
                        <button
                          type="button"
                          onClick={() => toggleSpec(specCollapseKey)}
                          className="flex items-center gap-1.5 px-4 py-0.5 w-full text-left cursor-pointer hover:text-[var(--app-color-text-primary)] transition-colors"
                        >
                          {showSpecToggle && (
                            <span className={`text-[9px] transition-transform shrink-0 text-[var(--twin-mute)] ${isSpecOpen ? "rotate-90" : ""}`}>▶</span>
                          )}
                          {!showSpecToggle && <span className="w-2.5 shrink-0" />}
                          <span className="text-xs font-medium text-[var(--twin-mute)]">
                            {formatSpecLabel(specKey)}
                          </span>
                          {showSpecToggle && <span className="text-[10px] text-[var(--twin-mute)] shrink-0">{specReqs.length} 条</span>}
                        </button>
                      )}
                      {(specKey === '__no_spec__' || isSpecOpen) && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {specReqs.map(req => {
                            const g = (req as any).applicantGroup as string | undefined;
                            const isFriendly = hasFriendly && g ? friendlyGroups.has(g) : undefined;
                            return (
                              <MaterialRequestCard key={req.id} req={req} canDelete={canDelete} approve={approve} reject={reject} revoke={revoke} deleteReq={deleteReq} handleExportPersonal={handleExportPersonal} isFriendly={isFriendly} />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 已审核物资区：可折叠，默认收起（对齐小程序 studentReviewHub 的 _resolvedCollapsed） */
function MaterialResolvedSection({ items, canDelete, approve, reject, revoke, deleteReq, handleExportPersonal, friendlyGroups }: { items: MaterialRequest[]; canDelete: boolean; approve: ReturnType<typeof useApproveMaterialRequest>; reject: ReturnType<typeof useRejectMaterialRequest>; revoke: ReturnType<typeof useRevokeMaterialRequest>; deleteReq: ReturnType<typeof useDeleteMaterialRequest>; handleExportPersonal: (reqId: string) => void; friendlyGroups?: Set<string> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs text-[var(--twin-mute)] hover:text-[var(--twin-body)] transition-colors"
      >
        <span className="transition-transform duration-200" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
        <span>已审核</span>
        <span className="text-[11px]">{items.length} 条</span>
      </button>
      {open && (
        <MaterialRequestGroup
          items={items}
          dotColor="bg-[var(--twin-mute)]"
          canDelete={canDelete}
          approve={approve}
          reject={reject}
          revoke={revoke}
          deleteReq={deleteReq}
          handleExportPersonal={handleExportPersonal}
          friendlyGroups={friendlyGroups}
        />
      )}
    </div>
  );
}

function MaterialRequestCard({ req, canDelete, approve, reject, revoke, deleteReq, handleExportPersonal, isFriendly }: { req: MaterialRequest; canDelete: boolean; approve: ReturnType<typeof useApproveMaterialRequest>; reject: ReturnType<typeof useRejectMaterialRequest>; revoke: ReturnType<typeof useRevokeMaterialRequest>; deleteReq: ReturnType<typeof useDeleteMaterialRequest>; handleExportPersonal: (reqId: string) => void; isFriendly?: boolean }) {
  const isPending = req.status === "PENDING" || req.status === "FIRST_OK";
  const canRevoke = req.status === "APPROVED" || req.status === "FULFILLED";
  const groupName = (req as any).applicantGroup as string | undefined;
  const showGroupTag = isPending && groupName; // 仅在待审核时展示标记
  return (
    <div className={`rounded-twin-lg border p-3 shadow-twin-level-1 flex flex-col gap-2 relative overflow-hidden ${cardStatusTint(req.status)}`}
      style={showGroupTag && isFriendly !== undefined ? {
        borderLeftWidth: '4px',
        borderLeftColor: isFriendly ? '#10b981' : '#f59e0b',
        borderTopColor: 'var(--twin-hairline)',
        borderRightColor: 'var(--twin-hairline)',
        borderBottomColor: 'var(--twin-hairline)',
        borderTopWidth: '1px',
        borderRightWidth: '1px',
        borderBottomWidth: '1px',
      } : undefined}
    >
      {/* 顶栏：ID + 指示灯 + 状态 + 操作 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] text-[var(--twin-mute)] font-mono shrink-0">{req.id}</span>
          {showGroupTag && isFriendly !== undefined && (
            <span className="shrink-0"
              title={isFriendly ? "熟识课题组 · 历史有通过记录" : "新课题组 · 首次出现"}>
              <span className={`inline-block size-2.5 rounded-full ring-1 ring-offset-1 ${isFriendly ? "bg-emerald-400 ring-emerald-300 ring-offset-[var(--twin-canvas)] shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-amber-400 ring-amber-300 ring-offset-[var(--twin-canvas)] shadow-[0_0_8px_rgba(245,158,11,0.4)]"}`} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusBadge(req.status)}`}>{statusLabel(req.status)}</span>
          <button onClick={() => handleExportPersonal(req.id)} className="text-[10px] text-blue-600 hover:underline shrink-0">导出</button>
          {canRevoke && <button onClick={() => { if (!window.confirm("撤销此审核？申领将回到待审状态，库存将回退。")) return; revoke.mutate(req.id, { onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "撤销失败") }); }} className="text-[10px] text-amber-600 hover:underline shrink-0 font-medium">撤销</button>}
          {canDelete && <button onClick={() => { if (!window.confirm("删除此申领？")) return; deleteReq.mutate(req.id); }} className="text-[10px] text-red-500 hover:underline shrink-0">删除</button>}
        </div>
      </div>
      {/* 主体：横向双栏 — 左：人员+物品 | 右：时间+操作 */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sm text-[var(--twin-primary)]">{req.applicantName || req.userId}</span>
            {req.applicantGroup && <span className="text-[11px] text-[var(--twin-mute)]">({req.applicantGroup})</span>}
          </div>
          <div className="space-y-0.5">{req.lines?.map((l: MaterialRequestLine, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-[var(--twin-body)] truncate">{l.snapshotName}</span>
              <span className="text-[var(--twin-mute)] shrink-0">×{l.qty}</span>
              {l.fulfilledQty > 0 && <span className="text-[10px] text-green-600 shrink-0">已出库 {l.fulfilledQty}</span>}
            </div>
          ))}</div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5 min-w-[120px]">
          <span className="text-[11px] text-[var(--twin-mute)] text-right">{req.createdAt ? formatBeijingDateTimeFull(req.createdAt) : "—"}</span>
          {isPending && (
            <div className="flex gap-1.5">
              <button onClick={() => approve.mutate(req.id, { onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "审核失败") })} className="rounded-twin-sm bg-green-600 px-3 py-1 text-[11px] font-medium text-white whitespace-nowrap">
                {req.status === "FIRST_OK" ? "复审通过" : req.workflowType === "DUAL_REVIEW" ? "初审通过" : "通过"}
              </button>
              <button onClick={() => reject.mutate(req.id, { onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "操作失败") })} className="rounded-twin-sm bg-red-500 px-3 py-1 text-[11px] font-medium text-white whitespace-nowrap">拒绝</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ScanDelayListItem = (ScanDelayPendingRequest | ScanDelayHistoryRequest) & { _kind: "pending" | "history" };

function ScanDelayOptionAccentText({ label, color }: { label: string; color: string }) {
  return (
    <span className="text-sm font-medium leading-tight" style={{ color }}>
      {label}
    </span>
  );
}

/** 已审核历史区：可折叠，默认收起 */
function ScanDelayHistorySection({
  items,
  reviewerNameMap,
  onDelete,
}: {
  items: ScanDelayListItem[];
  reviewerNameMap: Map<string, string>;
  onDelete: (req: { id: number; status: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs text-[var(--twin-mute)] hover:text-[var(--twin-body)] transition-colors"
      >
        <span className="transition-transform duration-200" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
        <span>已审核</span>
        <span className="text-[11px]">{items.length} 条</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {items.map((item) => (
            <ScanDelayHistoryCard key={`h-${item.id}`} req={item} reviewerNameMap={reviewerNameMap} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScanDelayPendingCard({ req, highlightRequestId, onReview, onDelete, isFriendly }: { req: ScanDelayPendingRequest; highlightRequestId: string | null; onReview: (req: ScanDelayPendingRequest, approve: boolean) => Promise<void>; onDelete: (req: { id: number; status: string }) => void; isFriendly?: boolean }) {
  const optionLabel = scanDelayOptionDisplayLabel(req);
  const optionColor = scanDelayOptionWebColor(req);
  const hasGroupTag = !!(req.subjectGroupName);
  const highlighted = highlightRequestId && String(req.id) === highlightRequestId;
  return (
    <div className={`rounded-twin-lg border shadow-twin-level-1 flex flex-col overflow-hidden ${highlighted ? "border-[var(--twin-primary)] ring-2 ring-[var(--twin-primary)]/30" : "border-[var(--twin-hairline)]"} bg-[var(--twin-card-pending)]`}
      style={hasGroupTag && isFriendly !== undefined ? {
        borderLeftWidth: '4px',
        borderLeftColor: isFriendly ? '#10b981' : '#f59e0b',
        borderTopColor: highlighted ? 'var(--twin-primary)' : 'var(--twin-hairline)',
        borderRightColor: highlighted ? 'var(--twin-primary)' : 'var(--twin-hairline)',
        borderBottomColor: highlighted ? 'var(--twin-primary)' : 'var(--twin-hairline)',
        borderTopWidth: '1px',
        borderRightWidth: '1px',
        borderBottomWidth: '1px',
      } : undefined}
    >
      {/* 选项类型色条 + 顶栏 */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-2" style={{ backgroundColor: `${optionColor}0D` }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-mono text-[var(--twin-mute)] shrink-0">#{req.id}</span>
          {hasGroupTag && isFriendly !== undefined && (
            <span className="shrink-0"
              title={isFriendly ? "熟识申请人 · 历史有通过记录" : "新申请人 · 首次出现"}>
              <span className={`inline-block size-2.5 rounded-full ring-1 ring-offset-1 ${isFriendly ? "bg-emerald-400 ring-emerald-300 ring-offset-white shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-amber-400 ring-amber-300 ring-offset-white shadow-[0_0_8px_rgba(245,158,11,0.4)]"}`} />
            </span>
          )}
          <span className="text-xs font-semibold truncate" style={{ color: optionColor }}>{optionLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 shrink-0">待审核</span>
          <button type="button" onClick={() => onDelete({ id: req.id, status: req.status })} className="text-[10px] px-1.5 py-0.5 rounded text-[var(--twin-mute)] hover:text-red-600 hover:bg-red-50 transition-colors" title="删除">删除</button>
        </div>
      </div>
      {/* 主体内容 */}
      <div className="flex items-start gap-3 px-3 pb-3 pt-2">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sm text-[var(--twin-primary)]">{req.subjectDisplayName || req.subjectUserId}</span>
            {req.subjectGroupName && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)]">{req.subjectGroupName}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[var(--twin-mute)]">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-1 rounded-full bg-[var(--twin-mute)]/50" />
              {req.roomName || req.roomId}
            </span>
            <span>·</span>
            <span>通过 {req.approvedCount ?? 0} 次</span>
            {(req.referenceSeq ?? 0) > 0 && <span>· 第 {req.referenceSeq} 次</span>}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2 min-w-[130px]">
          {req.createdAt && <span className="text-[11px] text-[var(--twin-mute)] text-right">{formatBeijingDateTimeFull(req.createdAt)}</span>}
          <div className="flex gap-1.5">
            <button type="button" onClick={() => void onReview(req, true)} className="rounded-twin-sm bg-green-600 px-3 py-1 text-[11px] font-medium text-white whitespace-nowrap hover:bg-green-700 transition-colors">通过</button>
            <button type="button" onClick={() => void onReview(req, false)} className="rounded-twin-sm bg-red-500 px-3 py-1 text-[11px] font-medium text-white whitespace-nowrap hover:bg-red-600 transition-colors">拒绝</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScanDelayHistoryCard({ req, reviewerNameMap, onDelete }: { req: ScanDelayHistoryRequest; reviewerNameMap: Map<string, string>; onDelete: (req: { id: number; status: string }) => void }) {
  const reviewerDisplay = req.reviewedBy ? (reviewerNameMap.get(req.reviewedBy) || req.reviewedBy) : null;
  const optionLabel = scanDelayOptionDisplayLabel(req);
  const optionColor = scanDelayOptionWebColor(req);
  const statusApproved = req.status === "APPROVED";
  const statusExpired = req.status === "EXPIRED";
  return (
    <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] shadow-twin-level-1 flex flex-col overflow-hidden">
      {/* 选项类型色条 + 顶栏 */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-2" style={{ backgroundColor: `${optionColor}0D` }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-mono text-[var(--twin-mute)] shrink-0">#{req.id}</span>
          <span className="text-xs font-semibold truncate" style={{ color: optionColor }}>{optionLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusApproved ? "bg-green-50 text-green-700 border-green-200" : statusExpired ? "bg-gray-50 text-gray-500 border-gray-200" : "bg-red-50 text-red-700 border-red-200"}`}>{statusApproved ? "已通过" : statusExpired ? "已过期" : "已拒绝"}</span>
          <button type="button" onClick={() => onDelete({ id: req.id, status: req.status })} className="text-[10px] px-1.5 py-0.5 rounded text-[var(--twin-mute)] hover:text-red-600 hover:bg-red-50 transition-colors" title="删除">删除</button>
        </div>
      </div>
      {/* 主体 */}
      <div className="flex items-start gap-3 px-3 pb-3 pt-2">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sm text-[var(--twin-primary)]">{req.subjectDisplayName || req.subjectUserId}</span>
            {req.subjectGroupName && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)]">{req.subjectGroupName}</span>
            )}
          </div>
          <p className="text-[11px] text-[var(--twin-mute)]">{req.roomName || req.roomId}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1 min-w-[140px]">
          {req.createdAt && <span className="text-[11px] text-[var(--twin-mute)] text-right">申请 {formatBeijingDateTimeFull(req.createdAt)}</span>}
          {req.reviewedAt && (
            <span className="text-[11px] text-[var(--twin-mute)] text-right">
              处理 {formatBeijingDateTimeFull(req.reviewedAt)}
              {reviewerDisplay && <span className="text-[var(--twin-ink)]"> · {reviewerDisplay}</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 培训审批卡片组件 ──

function traineeAuditStatusLabel(yn: number): string {
  if (yn === 1) return "已通过";
  if (yn === 2) return "已拒绝";
  return "待审核";
}

function traineeScoreLabel(fraction: number): string {
  if (fraction === 1) return "合格";
  if (fraction === 2) return "不合格";
  return "待评分";
}

function traineeAuditBadge(yn: number): string {
  if (yn === 1) return "bg-[var(--app-color-feedback-success-soft)] text-[var(--app-color-feedback-success)] border-[var(--app-color-feedback-success)]/20";
  if (yn === 2) return "bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger)] border-[var(--app-color-feedback-danger)]/20";
  return "bg-[var(--app-color-feedback-warning-soft)] text-[var(--app-color-feedback-warning)] border-[var(--app-color-feedback-warning)]/20";
}

function traineeScoreBadge(fraction: number): string {
  if (fraction === 1) return "bg-[var(--app-color-feedback-success-soft)] text-[var(--app-color-feedback-success)] border-[var(--app-color-feedback-success)]/20";
  if (fraction === 2) return "bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger)] border-[var(--app-color-feedback-danger)]/20";
  return "bg-[var(--app-color-surface-hover)] text-[var(--twin-mute)] border-[var(--twin-hairline)]";
}

function traineeCardTint(t: Trainee): string {
  if (t.testYn === 2) return "bg-[var(--twin-card-rejected)]";
  if (t.testYn === 1 && t.testFraction !== 0) return "bg-[var(--twin-card-approved)]";
  return "bg-[var(--twin-card-pending)]";
}

/** 按培训场次分组，可折叠 */
function TrainingSessionGroup({
  session,
  trainees,
  onAudit,
  onScore,
}: {
  session: import("@/api/domains/aro-training.api").TrainingSession;
  trainees: Trainee[];
  onAudit: (examSignId: string, state: 1 | 2) => void;
  onScore: (examSignId: string, state: 1 | 2) => void;
}) {
  const [open, setOpen] = useState(true);
  const pendingCount = trainees.filter((t) => t.testYn === 0 || t.testFraction === 0).length;
  return (
    <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[var(--twin-canvas-soft)] transition-colors text-left"
      >
        <span className="text-xs transition-transform duration-200" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
        <span className="text-sm font-semibold text-[var(--twin-body)]">{session.title}</span>
        <span className="text-[11px] text-[var(--twin-mute)]">{session.address}</span>
        <span className="text-[11px] text-[var(--twin-mute)]">{session.startTime}</span>
        {pendingCount > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--app-color-feedback-warning-soft)] text-[var(--app-color-feedback-warning)] font-medium">{pendingCount} 待处理</span>
        )}
        <span className="text-[11px] text-[var(--twin-mute)] ml-auto">{trainees.length} 人</span>
        <Link
          to="/console/admin/aro-binding"
          className="text-[10px] text-[var(--twin-link)] hover:underline shrink-0 ml-2"
          onClick={(e) => e.stopPropagation()}
        >
          点击前往授权
        </Link>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-[var(--twin-hairline)] pt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {trainees.map((t) => (
              <TrainingTraineeCard
                key={t.examSignId || t.userId}
                trainee={t}
                onAudit={onAudit}
                onScore={onScore}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 单个学员审批卡片 */
function TrainingTraineeCard({
  trainee,
  onAudit,
  onScore,
}: {
  trainee: Trainee;
  onAudit: (examSignId: string, state: 1 | 2) => void;
  onScore: (examSignId: string, state: 1 | 2) => void;
}) {
  const isPendingAudit = trainee.testYn === 0;
  const isPendingScore = trainee.testFraction === 0;
  const hasAnyAction = isPendingAudit || isPendingScore;
  const tint = traineeCardTint(trainee);
  const [auditMore, setAuditMore] = useState(false);
  const [scoreMore, setScoreMore] = useState(false);
  return (
    <div className={`rounded-twin-lg border border-[var(--twin-hairline)] p-3 shadow-twin-level-1 flex flex-col gap-2 ${tint}`}>
      {/* 顶行: 姓名 + 课题组 + 状态标签 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-bold text-sm text-[var(--twin-primary)]">{trainee.name}</span>
          {trainee.projectGroupName && (
            <span className="text-[11px] text-[var(--twin-mute)]">({trainee.projectGroupName})</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${traineeAuditBadge(trainee.testYn)}`}>
            {traineeAuditStatusLabel(trainee.testYn)}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${traineeScoreBadge(trainee.testFraction)}`}>
            {traineeScoreLabel(trainee.testFraction)}
          </span>
        </div>
      </div>
      {/* 中行: 工号 + 电话 */}
      <div className="flex items-center gap-3 text-[11px] text-[var(--twin-mute)]">
        <span>工号: {trainee.jobNumber || "—"}</span>
        <span>电话: {trainee.mobilePhone || "—"}</span>
      </div>
      {/* 底行: 审批 + 评分各自独立状态，待处理=split button，已完成=状态标记 */}
      <div className="flex items-center gap-1.5">
        {/* 审批 */}
        {isPendingAudit ? (
          <div className="relative inline-flex rounded-twin-sm overflow-visible">
            <button type="button" onClick={() => onAudit(trainee.examSignId, 1)}
              className="bg-[var(--app-color-accent)] px-2.5 py-1 text-[11px] font-medium text-white hover:brightness-90 rounded-l-twin-sm transition-colors">
              通过
            </button>
            <button type="button" onClick={() => setAuditMore(!auditMore)}
              className="bg-[var(--app-color-accent)] px-1.5 py-1 text-[10px] text-white hover:brightness-90 border-l border-white/30 rounded-r-twin-sm transition-colors">
              ▼
            </button>
            {auditMore && (
              <div className="absolute top-full left-0 mt-1 z-[var(--z-dropdown)] bg-[var(--app-color-surface-elevated)] border border-[var(--twin-hairline)] rounded-twin-md p-1 shadow-twin-level-2">
                <button type="button" onClick={() => { onAudit(trainee.examSignId, 2); setAuditMore(false); }}
                  className="rounded-twin-sm bg-[var(--app-color-feedback-danger)] px-2.5 py-1 text-[10px] font-medium text-white hover:opacity-90 whitespace-nowrap transition-colors">
                  拒绝
                </button>
              </div>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-[var(--twin-mute)]">
            {trainee.testYn === 1 ? '已通过' : trainee.testYn === 2 ? '已拒绝' : ''}
          </span>
        )}
        {/* 评分 */}
        {isPendingScore ? (
          <div className="relative inline-flex rounded-twin-sm overflow-visible">
            <button type="button" onClick={() => onScore(trainee.examSignId, 1)}
              className="bg-[var(--app-color-accent)] px-2.5 py-1 text-[11px] font-medium text-white hover:brightness-90 rounded-l-twin-sm transition-colors">
              合格
            </button>
            <button type="button" onClick={() => setScoreMore(!scoreMore)}
              className="bg-[var(--app-color-accent)] px-1.5 py-1 text-[10px] text-white hover:brightness-90 border-l border-white/30 rounded-r-twin-sm transition-colors">
              ▼
            </button>
            {scoreMore && (
              <div className="absolute top-full left-0 mt-1 z-[var(--z-dropdown)] bg-[var(--app-color-surface-elevated)] border border-[var(--twin-hairline)] rounded-twin-md p-1 shadow-twin-level-2">
                <button type="button" onClick={() => { onScore(trainee.examSignId, 2); setScoreMore(false); }}
                  className="rounded-twin-sm bg-[var(--app-color-feedback-danger)] px-2.5 py-1 text-[10px] font-medium text-white hover:opacity-90 whitespace-nowrap transition-colors">
                  不合格
                </button>
              </div>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-[var(--twin-mute)]">
            {trainee.testFraction === 1 ? '已评分：合格' : trainee.testFraction === 2 ? '已评分：不合格' : ''}
          </span>
        )}
        {!hasAnyAction && (
          <span className="text-[10px] text-[var(--twin-mute)]">
            {trainee.reviewedAt ? formatBeijingDateTimeFull(trainee.reviewedAt) : ''}
          </span>
        )}
        <Link to="/console/admin/aro-binding"
          className="text-[10px] text-[var(--twin-link)] hover:underline ml-auto">
          点击前往授权
        </Link>
      </div>
    </div>
  );
}
