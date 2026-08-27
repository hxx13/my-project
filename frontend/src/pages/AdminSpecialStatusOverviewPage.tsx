import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Archive, ArrowLeft, Bell, Settings, AlertTriangle, X, Eye, Trash2 } from "lucide-react";
import { Portal } from "@/components/Portal";
import { AdminPageShell, AdminFormCard } from "@/components/admin/AdminPageShell";
import toast from "react-hot-toast";
import {
  fetchSpecialStatusOverview,
  fetchSnapshotBatches,
  fetchPersistedAlerts, fetchAlertConfig, saveAlertConfig,
  deleteSnapshotBatch,
  type SpecialStatusCage,
  type SpecialStatusGroup,
  type CageAlertConfig, type PersistedAlert, type SnapshotBatch,
} from "@/api/domains/cageShelf.api";
import { STATUS_COLOR, STATUS_ABBR } from "@/features/cage-shelf/components/CageCellOverlays";

import { appConfirm } from "@/lib/appDialog";
/* ================================================================== */
/*  Constants & Helpers                                                 */
/* ================================================================== */

const STATUS_LABEL_MAP: Record<string, string> = {
  COHABITATION: "合笼/繁殖", SPECIAL_FEEDING: "特殊饲养",
  NEED_DIVIDE: "请分笼/密度超标", HEALTH_ABNORMAL: "动物健康异常", ANIMAL_TRANSFER: "动物转移",
};

const ALL_STATUS_OPTIONS = [
  { code: "NEED_DIVIDE", label: "请分笼/密度超标" },
  { code: "HEALTH_ABNORMAL", label: "动物健康异常" },
  { code: "ANIMAL_TRANSFER", label: "动物转移" },
  { code: "SPECIAL_FEEDING", label: "特殊饲养" },
  { code: "COHABITATION", label: "合笼/繁殖" },
];

type Tab = "overview" | "snapshots" | "config" | "alerts";
const TAB_OPTIONS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "特殊状态总览", icon: <Eye className="h-3.5 w-3.5" /> },
  { key: "snapshots", label: "快照管理", icon: <Archive className="h-3.5 w-3.5" /> },
  { key: "config", label: "告警配置", icon: <Settings className="h-3.5 w-3.5" /> },
  { key: "alerts", label: "持续告警", icon: <Bell className="h-3.5 w-3.5" /> },
];

function cageTypeLabel(t: number) {
  return t === 1 ? "(等待分配)" : t === 2 ? "(空笼位)" : t === 3 ? "(饲养中)" : t === 4 ? "(异常)" : "未知";
}

/* ================================================================== */
/*  Overview Tab: MergedCage Types                                     */
/* ================================================================== */

interface MergedCage {
  key: string;
  shelveId: string; campusName: string; roomName: string;
  position: string; positionX: number; positionY: number;
  piName: string; departmentName: string; projectPiName: string;
  cageBoxQrCode: string; animalCageType: number;
  statuses: { code: string; label: string; detailName: string; detailDescription: string }[];
}

function mergeCages(cages: SpecialStatusCage[], group: SpecialStatusGroup): MergedCage[] {
  const map = new Map<string, MergedCage>();
  for (const c of cages) {
    const key = `${c.shelveId}-${c.positionX}-${c.positionY}`;
    const existing = map.get(key);
    if (existing) {
      existing.statuses.push({ code: group.statusCode, label: group.statusLabel, detailName: c.detailName || "", detailDescription: c.detailDescription || "" });
    } else {
      map.set(key, {
        key, shelveId: c.shelveId, campusName: c.campusName || "", roomName: c.roomName,
        position: c.position, positionX: c.positionX, positionY: c.positionY,
        piName: c.piName || "", departmentName: c.departmentName || "", projectPiName: c.projectPiName || "",
        cageBoxQrCode: c.cageBoxQrCode || "", animalCageType: c.animalCageType || 0,
        statuses: [{ code: group.statusCode, label: group.statusLabel, detailName: c.detailName || "", detailDescription: c.detailDescription || "" }],
      });
    }
  }
  return Array.from(map.values());
}

function deduplicateCages(allCages: MergedCage[]): MergedCage[] {
  const map = new Map<string, MergedCage>();
  for (const c of allCages) {
    const existing = map.get(c.key);
    if (existing) {
      for (const s of c.statuses) { if (!existing.statuses.some(es => es.code === s.code)) existing.statuses.push(s); }
    } else {
      map.set(c.key, { ...c, statuses: [...c.statuses] });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.roomName.localeCompare(b.roomName) || a.positionY - b.positionY || a.positionX - b.positionX);
}

/* ---- Overview Detail Popup ---- */

function CageDetailPopup({ cage, onClose }: { cage: MergedCage; onClose: () => void }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
        <div className="w-full max-w-2xl rounded-twin-xl bg-[var(--twin-canvas)] shadow-twin-level-3 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--twin-hairline)] shrink-0">
            <div className="text-sm font-semibold text-[var(--twin-ink)]">笼位详情 · {cage.position}</div>
            <button type="button" className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={onClose}><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
            <div className="flex flex-wrap gap-1.5">
              {cage.statuses.map(s => {
                const colorClass = STATUS_COLOR[s.code] ?? "bg-gray-400 ring-gray-200";
                const abbr = STATUS_ABBR[s.code] ?? "?";
                return <span key={s.code} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white ${colorClass}`}><span className="w-3.5 h-3.5 rounded-full bg-white/30 flex items-center justify-center text-[7px] font-bold">{abbr}</span>{s.label}</span>;
              })}
            </div>
            <DetailRow label="位置" value={cage.position} /><DetailRow label="校区" value={cage.campusName} />
            <DetailRow label="房间" value={cage.roomName} /><DetailRow label="PI" value={cage.projectPiName || cage.piName} />
            <DetailRow label="部门" value={cage.departmentName} /><DetailRow label="笼盒卡号" value={cage.cageBoxQrCode} mono />
            <DetailRow label="笼位类型" value={cageTypeLabel(cage.animalCageType)} />
            {cage.statuses.some(s => s.detailName || s.detailDescription) && (
              <>
                <div className="text-xs font-medium text-[var(--twin-ink)] pt-1 border-t border-[var(--twin-hairline)]">特殊饲养详情</div>
                {cage.statuses.filter(s => s.detailName || s.detailDescription).map((s, i) => (
                  <div key={i} className="rounded-twin-sm border border-[var(--twin-hairline)] p-2 text-xs">
                    {s.detailName && <DetailRow label="名称" value={s.detailName} />}
                    {s.detailDescription && <DetailRow label="说明" value={s.detailDescription} />}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value || value === "-") return null;
  return <div className="flex gap-2 items-start"><span className="text-[var(--twin-mute)] w-20 shrink-0 text-xs pt-0.5">{label}</span><span className={`text-[var(--twin-ink)] break-all whitespace-pre-wrap min-w-0 flex-1 ${mono ? "font-mono text-xs" : ""}`}>{value || "-"}</span></div>;
}

/* ================================================================== */
/*  Main Page                                                          */
/* ================================================================== */

export default function AdminSpecialStatusOverviewPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") || "overview";
  // 兼容旧 URL ?tab=events → snapshots
  const activeTab: Tab = rawTab === "events" ? "snapshots" : (rawTab as Tab) || "overview";

  const setTab = (t: Tab) => { const p = new URLSearchParams(searchParams); p.set("tab", t); setSearchParams(p, { replace: true }); };

  /* ---- Shared state ---- */
  const { data: batchList = [] } = useQuery({ queryKey: ["snapshotBatches"], queryFn: fetchSnapshotBatches, staleTime: 60_000 });

  const [configMode, setConfigMode] = useState<"auto" | "manual" | "off">(() => (localStorage.getItem("cageAlertConfigMode") as "auto" | "manual" | "off") || "auto");
  // 手动模式的基准/当前选择（持久化到 localStorage）
  const [manualBaseline, setManualBaseline] = useState(() => localStorage.getItem("cageCompareBaseline") || "");
  const [manualCurrent, setManualCurrent] = useState(() => localStorage.getItem("cageCompareCurrent") || "");

  // 根据模式决定实际使用的基准/当前
  const baselineBatchId = useMemo(() => {
    if (configMode === "auto") return batchList.length >= 2 ? batchList[1].scanBatchId : (batchList[0]?.scanBatchId || "");
    return manualBaseline || (batchList.length >= 2 ? batchList[1].scanBatchId : (batchList[0]?.scanBatchId || ""));
  }, [configMode, batchList, manualBaseline]);

  const currentBatchId = useMemo(() => {
    if (configMode === "auto") return batchList[0]?.scanBatchId || "";
    return manualCurrent || (batchList[0]?.scanBatchId || "");
  }, [configMode, batchList, manualCurrent]);

  const setManualBaselineAndSave = (v: string) => { setManualBaseline(v); localStorage.setItem("cageCompareBaseline", v); };
  const setManualCurrentAndSave = (v: string) => { setManualCurrent(v); localStorage.setItem("cageCompareCurrent", v); };

  // 首次加载时，如果手动模式尚未设置，用最新两个批次初始化
  useEffect(() => {
    if (batchList.length >= 2 && !manualBaseline && configMode === "manual") {
      setManualBaselineAndSave(batchList[1].scanBatchId);
      setManualCurrentAndSave(batchList[0].scanBatchId);
    }
  }, [batchList, manualBaseline, configMode]);

  const baselineBatch = batchList.find(b => b.scanBatchId === baselineBatchId);
  const currentBatch = batchList.find(b => b.scanBatchId === currentBatchId);

  // Persisted alerts (shared between config & alerts tabs)
  const { data: alertData, isLoading: alertsLoading } = useQuery({
    queryKey: ["persistedAlerts", baselineBatchId, currentBatchId, configMode],
    queryFn: () => fetchPersistedAlerts(baselineBatchId || undefined, currentBatchId || undefined, configMode),
    enabled: configMode !== "off" && (activeTab === "alerts" || activeTab === "config" || activeTab === "snapshots"),
  });
  const alerts = alertData?.alerts ?? [];
  const spanDays = alertData?.spanDays ?? 0;

  /* ---- Overview tab state ---- */
  const [overviewBatchId, setOverviewBatchId] = useState<string>("");
  const [detailCage, setDetailCage] = useState<MergedCage | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => { if (!overviewBatchId && batchList.length > 0) setOverviewBatchId(batchList[0].scanBatchId); }, [batchList, overviewBatchId]);

  const { data: overviewData, isLoading: overviewLoading, error: overviewError } = useQuery({
    queryKey: ["specialStatusOverview", overviewBatchId],
    queryFn: () => fetchSpecialStatusOverview(overviewBatchId || undefined),
    enabled: activeTab === "overview" && !!overviewBatchId,
  });

  const allMerged = useMemo(() => {
    if (!overviewData?.groups) return [];
    const all: MergedCage[] = [];
    for (const g of overviewData.groups) all.push(...mergeCages(g.cages, g));
    return deduplicateCages(all);
  }, [overviewData]);

  const groupedByStatus = useMemo(() => {
    if (!overviewData?.groups) return [];
    return overviewData.groups.map(g => ({ ...g, merged: mergeCages(g.cages, g) }));
  }, [overviewData]);

  const toggleExpand = (code: string) => setExpanded(prev => { const next = new Set(prev); next.has(code) ? next.delete(code) : next.add(code); return next; });

  /* ---- Config tab state ---- */
  const { data: alertConfigs = [], isLoading: configLoading, refetch: refetchConfigs } = useQuery({
    queryKey: ["alertConfig", configMode],
    queryFn: () => fetchAlertConfig(configMode),
    enabled: configMode !== "off" && activeTab === "config",
    staleTime: 30_000, refetchOnWindowFocus: false,
  });

  const configLoadedRef = useRef(false);
  const [localConfigs, setLocalConfigs] = useState<CageAlertConfig[]>([]);
  useEffect(() => {
    if (!configLoading && !configLoadedRef.current && alertConfigs.length > 0) { configLoadedRef.current = true; setLocalConfigs(alertConfigs.map(c => ({ ...c }))); }
  }, [alertConfigs, configLoading]);
  useEffect(() => { if (activeTab !== "config") configLoadedRef.current = false; }, [activeTab]);
  useEffect(() => { configLoadedRef.current = false; }, [configMode]);

  const saveMutation = useMutation({
    mutationFn: (cfgs: CageAlertConfig[]) => saveAlertConfig(cfgs, configMode),
    onSuccess: (_data, savedConfigs) => { toast.success("告警配置已保存"); setLocalConfigs(savedConfigs.map(c => ({ ...c }))); configLoadedRef.current = true; refetchConfigs(); },
    onError: (e: any) => toast.error(e?.message || "保存失败"),
  });

  const handleSaveConfig = () => { const toSave = localConfigs.filter(c => c.statusCode && c.statusCode.trim() !== ""); saveMutation.mutate(toSave); };
  const handleResetConfig = useCallback(() => { refetchConfigs().then(r => { if (r.data) { setLocalConfigs(r.data.map(c => ({ ...c }))); configLoadedRef.current = true; } }); }, [refetchConfigs]);

  /* ---- Snapshot delete ---- */
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);
  const handleDeleteBatch = async (batchId: string) => {
    if (!await appConfirm(`确定删除快照批次 ${batchId.substring(0, 8)}…？该操作同时清除关联事件日志且不可恢复。`)) return;
    setDeletingBatch(batchId);
    try {
      const r = await deleteSnapshotBatch(batchId);
      toast.success(`已删除快照批次，清理 ${r.eventsDeleted} 条事件日志、${r.snapshotsDeleted} 条快照记录`);
      // Reset selections if deleted batch was selected
      if (baselineBatchId === batchId) { setManualBaselineAndSave(""); }
      if (currentBatchId === batchId) { setManualCurrentAndSave(""); }
      if (overviewBatchId === batchId) setOverviewBatchId("");
      // React Query cache invalidation will auto-refetch snapshotBatches
    } catch (e: any) { toast.error(e?.message || "删除失败"); }
    finally { setDeletingBatch(null); }
  };

  /* ---- Render ---- */
  return (
    <AdminPageShell>
      <style>{`.log-scroll::-webkit-scrollbar{width:4px;height:4px}.log-scroll::-webkit-scrollbar-track{background:transparent}.log-scroll::-webkit-scrollbar-thumb{background:var(--twin-hairline);border-radius:4px}`}</style>
      <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
        {/* Back button */}
        <div className="shrink-0 mb-2">
          <button type="button" className="hover:bg-[var(--twin-canvas-soft)] rounded-twin-md p-1 -ml-1 transition" onClick={() => navigate(toAdminRoutePath("/admin/cage-shelves"))} title="返回笼架信息">
            <ArrowLeft className="h-5 w-5 text-[var(--twin-link-deep)]" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="shrink-0 mb-3 flex items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1 w-fit">
          {TAB_OPTIONS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`flex items-center gap-1 rounded-twin-md px-3 py-1.5 text-xs font-semibold transition ${activeTab === t.key ? "bg-[var(--twin-link-deep)] text-white shadow-sm" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
              {t.icon}{t.label}
              {t.key === "alerts" && alerts.length > 0 && <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">{alerts.length}</span>}
            </button>
          ))}
        </div>

        {/* ======== TAB: Overview ======== */}
        {activeTab === "overview" && (
          <div className="space-y-4 flex-1 min-h-0 overflow-y-auto log-scroll">
            {overviewData && (
              <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-4 py-3 text-sm flex flex-wrap items-center gap-3">
                <span className="text-[var(--twin-body)]">
                  上次扫描: <span className="font-semibold text-[var(--twin-ink)]">{overviewData.scannedAt || "未知"}</span>
                  <span className="mx-2">·</span>特殊状态标记合计: <span className="font-semibold text-[var(--twin-ink)]">{overviewData.totalAbnormal}</span>
                  <span className="mx-2">·</span>去重后笼位: <span className="font-semibold text-[var(--twin-ink)]">{allMerged.length}</span>
                </span>
                {batchList.length > 0 && (
                  <select className="rounded-twin-md border px-2 py-1 text-[11px] font-semibold transition ml-auto bg-amber-100 border-amber-400 text-amber-900" value={overviewBatchId} onChange={e => setOverviewBatchId(e.target.value)}>
                    {batchList.map(b => <option key={b.scanBatchId} value={b.scanBatchId}>{b.scannedAt?.substring(0, 16)?.replace("T", " ")} · {b.abnormalRows}异常/{b.shelfCount}架</option>)}
                  </select>
                )}
              </div>
            )}
            {overviewLoading && <div className="text-center text-sm text-[var(--twin-mute)] py-12">加载中…</div>}
            {overviewError && <div className="text-center text-sm text-red-600 py-12">{overviewError instanceof Error ? overviewError.message : "加载失败"}</div>}
            {!overviewLoading && !overviewError && overviewData && allMerged.length === 0 && (
              <div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] py-12 text-center text-sm text-[var(--twin-mute)]">暂无特殊状态笼位数据。请先通过「定时管理」执行「全量笼位数据同步」。</div>
            )}
            {groupedByStatus.map(group => {
              const code = group.statusCode;
              const colorClass = STATUS_COLOR[code] ?? "bg-gray-400 ring-gray-200";
              const abbr = STATUS_ABBR[code] ?? "?";
              const label = STATUS_LABEL_MAP[code] ?? group.statusLabel;
              const isOpen = expanded.has(code);
              return (
                <div key={code} className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] overflow-hidden">
                  <button type="button" className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--twin-canvas-soft)] transition" onClick={() => toggleExpand(code)}>
                    <div className={`w-6 h-6 rounded-full ${colorClass} ring-2 flex items-center justify-center shadow-sm shrink-0`}><span className="text-white text-[10px] font-bold leading-none">{abbr}</span></div>
                    <span className="text-base font-semibold text-[var(--twin-ink)]">{label}</span>
                    <span className="rounded-full bg-[var(--twin-canvas-soft)] px-2.5 py-0.5 text-sm text-[var(--twin-body)] font-medium">{group.merged.length} 个笼位</span>
                    <span className="ml-auto text-xs text-[var(--twin-mute)]">{isOpen ? "收起 ▲" : "展开 ▼"}</span>
                  </button>
                  {isOpen && group.merged.length > 0 && (
                    <div className="border-t border-[var(--twin-hairline)] overflow-auto max-h-[50vh]">
                      <table className="w-full text-sm"><thead className="bg-[var(--twin-canvas-soft)] text-[var(--twin-body)] sticky top-0"><tr><th className="px-3 py-2 text-left w-[80px]">位置</th><th className="px-3 py-2 text-left">校区</th><th className="px-3 py-2 text-left">房间</th><th className="px-3 py-2 text-left">PI</th><th className="px-3 py-2 text-left">部门</th><th className="px-3 py-2 text-left w-[80px]">操作</th></tr></thead>
                        <tbody>{group.merged.map(cage => (
                          <tr key={cage.key} className="border-t border-[var(--twin-hairline)] hover:bg-[var(--twin-canvas-soft)]">
                            <td className="px-3 py-1.5 font-mono">{cage.position}</td><td className="px-3 py-1.5">{cage.campusName || "-"}</td><td className="px-3 py-1.5">{cage.roomName || "-"}</td><td className="px-3 py-1.5">{cage.projectPiName || cage.piName || "-"}</td><td className="px-3 py-1.5 max-w-[200px] truncate">{cage.departmentName || "-"}</td>
                            <td className="px-3 py-1.5"><button type="button" className="text-[var(--twin-link-deep)] hover:underline text-xs" onClick={() => setDetailCage(cage)}>详情</button></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ======== TAB: Snapshots ======== */}
        {activeTab === "snapshots" && (
          <div className="flex-1 min-h-0 flex flex-col space-y-4 log-scroll overflow-y-auto">
            <AdminFormCard className="shrink-0">
              <div className="flex items-center justify-between border-b border-[var(--app-color-border-default)] pb-3 mb-3">
                <h2 className="text-base font-bold text-[var(--app-color-text-primary)]">快照批次管理</h2>
                <span className="text-[11px] text-[var(--twin-mute)]">{batchList.length} 个批次</span>
              </div>
              {batchList.length === 0 ? (
                <div className="text-xs text-[var(--twin-mute)] py-8 text-center">暂无快照数据。请先通过「定时管理」执行「全量笼位数据同步」。</div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto log-scroll">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold">
                      <tr>
                        <th className="px-3 py-2 text-left w-[160px]">扫描时间</th>
                        <th className="px-3 py-2 text-left w-[100px]">异常行数</th>
                        <th className="px-3 py-2 text-left w-[80px]">覆盖笼架</th>
                        <th className="px-3 py-2 text-left w-[80px]">总行数</th>
                        <th className="px-3 py-2 text-left w-[80px]">角色</th>
                        <th className="px-3 py-2 text-left w-[60px]">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchList.map(b => {
                        const isBaseline = b.scanBatchId === baselineBatchId;
                        const isCurrent = b.scanBatchId === currentBatchId;
                        const isInUse = isBaseline || isCurrent;
                        return (
                          <tr key={b.scanBatchId} className={`border-t border-[var(--twin-hairline)] ${isBaseline ? "bg-blue-50/50" : isCurrent ? "bg-green-50/50" : ""}`}>
                            <td className="px-3 py-1.5 font-mono text-[10px] text-[var(--twin-ink)]">{b.scannedAt?.substring(0, 16)?.replace("T", " ")}</td>
                            <td className="px-3 py-1.5"><span className="font-semibold text-amber-600">{b.abnormalRows}</span></td>
                            <td className="px-3 py-1.5">{b.shelfCount}</td>
                            <td className="px-3 py-1.5 text-[var(--twin-mute)]">{b.totalRows}</td>
                            <td className="px-3 py-1.5">
                              {isBaseline ? <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">对比基准</span>
                              : isCurrent ? <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">当前</span>
                              : <span className="text-[10px] text-[var(--twin-mute)]">-</span>}
                            </td>
                            <td className="px-3 py-1.5">
                              <button type="button" disabled={isInUse || deletingBatch === b.scanBatchId}
                                onClick={() => handleDeleteBatch(b.scanBatchId)}
                                className="text-[var(--twin-mute)] hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                title={isInUse ? "无法删除正在对比使用的批次" : "删除此快照批次"}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="text-[10px] text-[var(--twin-mute)] mt-2 pt-2 border-t border-[var(--twin-hairline)]">
                提示：快照批次由「全量笼位数据同步」自动生成。删除快照将同时清除关联的事件日志记录。蓝色标记为对比基准，绿色标记为当前批次。
              </div>
            </AdminFormCard>
          </div>
        )}

        {/* ======== TAB: Config ======== */}
        {activeTab === "config" && (
          <AdminFormCard className="shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
              <h2 className="text-base font-bold text-[var(--app-color-text-primary)]">告警配置</h2>
              <div className="flex items-stretch rounded-twin-lg border-2 border-[var(--twin-hairline)] overflow-hidden">
                <button type="button" onClick={() => setConfigMode("auto")} className={`px-3 py-1.5 text-[11px] font-bold transition ${configMode === "auto" ? "bg-[var(--twin-link-deep)] text-white" : "bg-[var(--twin-canvas)] text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)]"}`}>🔄 自动对比</button>
                <div className="w-px bg-[var(--twin-hairline)]" />
                <button type="button" onClick={() => setConfigMode("manual")} className={`px-3 py-1.5 text-[11px] font-bold transition ${configMode === "manual" ? "bg-orange-500 text-white" : "bg-[var(--twin-canvas)] text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)]"}`}>🎯 手动选择</button>
              </div>
            </div>

            {/* Comparison info */}
            {batchList.length > 0 && (
              <div className={`rounded-twin-md border px-3 py-2 mb-3 ${configMode === "auto" ? "bg-blue-50/60 border-blue-200" : "bg-[var(--twin-canvas-soft)] border-[var(--twin-hairline)]"}`}>
                {configMode === "auto" ? (
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-medium text-blue-800">🔄 自动对比:</span>
                    <span className="text-[var(--twin-mute)]">{baselineBatch?.scannedAt?.substring(0, 16)?.replace("T", " ") || "—"}</span>
                    <span className="text-[var(--twin-mute)]">→</span>
                    <span>{currentBatch?.scannedAt?.substring(0, 16)?.replace("T", " ") || "最新"}</span>
                    <span className="text-[10px] text-[var(--twin-mute)]">已存在 {spanDays ?? "?"} 天</span>
                    {baselineBatch && currentBatch && <span className="text-[10px] text-[var(--twin-mute)]">· 异常 {currentBatch.abnormalRows - baselineBatch.abnormalRows >= 0 ? "+" : ""}{currentBatch.abnormalRows - baselineBatch.abnormalRows}</span>}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-orange-700">🎯 对比基准:</span>
                    <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-xs" value={manualBaseline}
                      onChange={e => setManualBaselineAndSave(e.target.value)}>
                      {batchList.map(b => <option key={b.scanBatchId} value={b.scanBatchId}>{b.scannedAt?.substring(0, 16)?.replace("T", " ")} · {b.abnormalRows}异常</option>)}
                    </select>
                    <span className="text-xs text-[var(--twin-mute)]">→</span>
                    <span className="text-xs font-medium text-[var(--twin-ink)]">当前:</span>
                    <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-xs" value={manualCurrent}
                      onChange={e => setManualCurrentAndSave(e.target.value)}>
                      <option value="">最新</option>
                      {batchList.map(b => <option key={b.scanBatchId} value={b.scanBatchId}>{b.scannedAt?.substring(0, 16)?.replace("T", " ")} · {b.abnormalRows}异常</option>)}
                    </select>
                    {baselineBatch && currentBatch && <span className="text-[10px] text-[var(--twin-mute)] ml-1">已存在 {spanDays ?? "?"} 天 · 异常 {currentBatch.abnormalRows - baselineBatch.abnormalRows >= 0 ? "+" : ""}{currentBatch.abnormalRows - baselineBatch.abnormalRows}</span>}
                  </div>
                )}
              </div>
            )}

            {/* Config rows */}
            {configLoading ? <div className="text-xs text-[var(--twin-mute)] py-4 text-center">加载中…</div> : (
              <div className="space-y-2">
                {localConfigs.map((cfg, idx) => (
                  <div key={idx} className="flex items-center gap-3 py-1.5">
                    <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1.5 text-xs w-44"
                      value={cfg.statusCode}
                      onChange={e => { const next = [...localConfigs]; next[idx] = { ...next[idx], statusCode: e.target.value, statusLabel: ALL_STATUS_OPTIONS.find(o => o.code === e.target.value)?.label || "" }; setLocalConfigs(next); }}>
                      <option value="">-- 选择状态 --</option>
                      {ALL_STATUS_OPTIONS.map(o => <option key={o.code} value={o.code} disabled={localConfigs.some((c, i) => i !== idx && c.statusCode === o.code)}>{o.label}</option>)}
                    </select>
                    <span className="text-xs text-[var(--twin-mute)]">不超过</span>
                    <input type="number" min={0} max={365} className="w-16 rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1.5 text-xs text-center"
                      value={cfg.thresholdDays}
                      onChange={e => { const next = [...localConfigs]; next[idx] = { ...next[idx], thresholdDays: Math.max(0, parseInt(e.target.value) || 0) }; setLocalConfigs(next); }} />
                    <span className="text-xs text-[var(--twin-mute)]">天</span>
                    {configMode === "auto" && <span className="text-[10px] text-[var(--twin-mute)]">（已存在 {spanDays ?? "?"} 天）</span>}
                    <label className="flex items-center gap-1 text-xs cursor-pointer ml-2"><input type="checkbox" checked={cfg.enabled} onChange={e => { const next = [...localConfigs]; next[idx] = { ...next[idx], enabled: e.target.checked }; setLocalConfigs(next); }} />启用</label>
                    <button type="button" onClick={() => setLocalConfigs(localConfigs.filter((_, i) => i !== idx))} className="text-[10px] text-red-500 hover:text-red-700 ml-auto">删除</button>
                  </div>
                ))}
                {localConfigs.length === 0 && <div className="text-xs text-[var(--twin-mute)] py-4 text-center">暂无配置项，点击下方添加</div>}
                <button type="button" onClick={() => setLocalConfigs([...localConfigs, { statusCode: "", statusLabel: "", thresholdDays: 7, enabled: true }])} className="text-xs text-[var(--twin-link-deep)] hover:underline inline-flex items-center gap-1">+ 添加监控项</button>
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-[var(--twin-hairline)] flex justify-end gap-2">
              <button type="button" onClick={handleResetConfig} className="rounded-twin-md border border-[var(--twin-hairline)] px-4 py-1.5 text-xs hover:bg-[var(--twin-canvas-soft)] transition">重置</button>
              <button type="button" onClick={handleSaveConfig} disabled={saveMutation.isPending} className="rounded-twin-md bg-[var(--twin-link-deep)] text-white px-4 py-1.5 text-xs font-semibold disabled:opacity-50 transition">{saveMutation.isPending ? "保存中..." : "保存配置"}</button>
            </div>
          </AdminFormCard>
        )}

        {/* ======== TAB: Alerts ======== */}
        {activeTab === "alerts" && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 mb-2 flex items-center justify-between text-xs">
              <span className="text-[var(--twin-mute)]">
                {alertsLoading ? "加载中…" : `共 ${alerts.length} 个笼位 · 已存在 ${spanDays} 天`}
                {alertData?.generatedAt && <span className="ml-2 text-[10px]">@{alertData.generatedAt?.substring(0, 19)}</span>}
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto log-scroll rounded-twin-lg border border-[var(--twin-hairline)]">
              {alertsLoading ? <div className="text-xs text-[var(--twin-mute)] py-12 text-center">加载中…</div>
              : alerts.length === 0 ? <div className="text-xs text-[var(--twin-mute)] py-12 text-center"><AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-20" />{spanDays > 0 ? "没有笼位存在天数超过设定" : "请先选择一个对比基准快照"}</div>
              : <table className="w-full text-xs"><thead className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold"><tr><th className="px-3 py-2 text-left">状态</th><th className="px-3 py-2 text-left w-[60px]">位置</th><th className="px-3 py-2 text-left">校区</th><th className="px-3 py-2 text-left">房间</th><th className="px-3 py-2 text-left">PI</th><th className="px-3 py-2 text-left w-[80px]">已存在</th><th className="px-3 py-2 text-left w-[60px]">不超过</th></tr></thead><tbody>
                {alerts.map((a, i) => (
                  <tr key={`${a.shelveId}-${a.position}-${i}`} onClick={() => navigate(toAdminRoutePath("/admin/cage-shelves"))} className="border-t border-[var(--twin-hairline)] hover:bg-[var(--twin-canvas-soft)] cursor-pointer transition">
                    <td className="px-3 py-1.5"><span className="inline-flex items-center gap-1"><span className={`w-2 h-2 rounded-full shrink-0 ${({NEED_DIVIDE:"bg-amber-500",HEALTH_ABNORMAL:"bg-purple-500",ANIMAL_TRANSFER:"bg-cyan-500",SPECIAL_FEEDING:"bg-red-500",COHABITATION:"bg-emerald-500"} as Record<string,string>)[a.statusCode]||"bg-red-500"}`} />{a.statusLabel}</span></td>
                    <td className="px-3 py-1.5 font-mono font-semibold">{a.position}</td>
                    <td className="px-3 py-1.5">{a.campusName || "-"}</td>
                    <td className="px-3 py-1.5">{a.roomName || "-"}</td>
                    <td className="px-3 py-1.5">{a.projectPiName || "-"}</td>
                    <td className="px-3 py-1.5"><span className={`font-semibold ${a.persistedDays >= a.thresholdDays * 2 ? "text-red-600" : "text-amber-600"}`}>{a.persistedDays} 天</span></td>
                    <td className="px-3 py-1.5 text-[var(--twin-mute)]">{a.thresholdDays} 天</td>
                  </tr>))}
              </tbody></table>}
            </div>
          </div>
        )}
      </div>

      {detailCage && <CageDetailPopup cage={detailCage} onClose={() => setDetailCage(null)} />}
    </AdminPageShell>
  );
}
