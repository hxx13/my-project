import { Fragment, useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Clock, Search, ArrowLeft, Bell, Settings, AlertTriangle, X, ExternalLink } from "lucide-react";
import { AdminPageShell, AdminFormCard } from "@/components/admin/AdminPageShell";
import toast from "react-hot-toast";
import {
  fetchCageEventLogs, fetchEventTimeline,
  fetchPersistedAlerts, fetchAlertConfig, saveAlertConfig, fetchSnapshotBatches,
  type CageEventLogEntry, type CageAlertConfig, type PersistedAlert, type SnapshotBatch,
  EVENT_TYPE_LABELS,
} from "@/api/domains/cageShelf.api";
import { SPECIAL_STATUS_LABELS } from "@/utils/cageSpecialStatusLabels";

const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS);

function eventColor(type: string): string {
  if (type === "BASELINE_ESTABLISHED") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (type.startsWith("BOX_")) return "bg-blue-100 text-blue-800 border-blue-300";
  if (type.startsWith("STATUS_")) return "bg-amber-100 text-amber-800 border-amber-300";
  if (type === "TYPE_CHANGED") return "bg-purple-100 text-purple-800 border-purple-300";
  if (type.endsWith("_CHANGED")) return "bg-slate-100 text-slate-700 border-slate-300";
  return "bg-gray-100 text-gray-700 border-gray-300";
}

function formatJson(json?: string): string {
  if (!json) return "-";
  try { return JSON.stringify(JSON.parse(json), null, 2); }
  catch { return json; }
}

const ALL_STATUS_OPTIONS = [
  { code: "NEED_DIVIDE", label: "请分笼/密度超标" },
  { code: "HEALTH_ABNORMAL", label: "动物健康异常" },
  { code: "ANIMAL_TRANSFER", label: "动物转移" },
  { code: "SPECIAL_FEEDING", label: "特殊饲养" },
  { code: "COHABITATION", label: "合笼/繁殖" },
];

type Tab = "events" | "config" | "alerts";

/* ================================================================== */
/*  Event Detail Panel (inline expand)                                  */
/* ================================================================== */

function EventDetailPanel({ event, onClose }: { event: CageEventLogEntry; onClose: () => void }) {
  const [showTimeline, setShowTimeline] = useState(false);
  const { data: timeline = [], isLoading: tlLoading } = useQuery({
    queryKey: ["cageEventTimeline", event.cageBoxQrCode],
    queryFn: () => fetchEventTimeline(event.cageBoxQrCode!, 50),
    enabled: showTimeline && !!event.cageBoxQrCode,
  });
  const prevJson = formatJson(event.prevValueJson);
  const currJson = formatJson(event.currValueJson);
  const hasDiff = event.prevValueJson || event.currValueJson;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--twin-ink)]">事件详情</span>
          <span className="text-[10px] text-[var(--twin-mute)] font-mono">#{event.id}</span>
          <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${eventColor(event.eventType)}`}>
            {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
          </span>
        </div>
        <button type="button" onClick={onClose} className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
        <div><span className="text-[var(--twin-mute)]">时间:</span> <span className="font-mono text-[10px]">{event.changedAt}</span></div>
        <div><span className="text-[var(--twin-mute)]">笼盒号:</span> {event.cageBoxQrCode || "-"}</div>
        <div><span className="text-[var(--twin-mute)]">批次:</span> <span className="font-mono text-[10px]">{event.scanBatchId}</span></div>
        <div><span className="text-[var(--twin-mute)]">PI:</span> {event.projectPiName || event.piName || "-"}</div>
        <div><span className="text-[var(--twin-mute)]">部门:</span> {event.departmentName || "-"}</div>
        <div>
          {event.cageBoxQrCode && (
            <button type="button" onClick={() => setShowTimeline(v => !v)}
              className="text-[10px] text-[var(--twin-link-deep)] hover:underline inline-flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />{showTimeline ? "收起时间线" : "查看完整时间线"}
            </button>
          )}
        </div>
      </div>
      {showTimeline && (
        <div className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] max-h-[200px] overflow-y-auto">
          {tlLoading ? <div className="p-3 text-xs text-[var(--twin-mute)]">加载中…</div>
          : timeline.length === 0 ? <div className="p-3 text-xs text-[var(--twin-mute)]">暂无时间线数据</div>
          : <table className="w-full text-[10px]"><thead className="bg-[var(--twin-canvas-soft)] sticky top-0"><tr><th className="px-2 py-1 text-left">时间</th><th className="px-2 py-1 text-left">类型</th><th className="px-2 py-1 text-left">摘要</th></tr></thead><tbody>
            {timeline.map((t: any) => (
              <tr key={t.id} className="border-t border-[var(--twin-hairline)]">
                <td className="px-2 py-1 font-mono text-[var(--twin-mute)]">{t.changedAt}</td>
                <td className="px-2 py-1"><span className={`inline-block rounded-full border px-1 py-0 text-[9px] font-medium ${eventColor(t.eventType)}`}>{EVENT_TYPE_LABELS[t.eventType] ?? t.eventType}</span></td>
                <td className="px-2 py-1 max-w-[300px] truncate">{t.detailSummary || "-"}</td>
              </tr>))}
          </tbody></table>}
        </div>
      )}
      {hasDiff && (
        <div>
          <div className="text-xs font-semibold text-[var(--twin-ink)] mb-1">变更详情</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-2"><div className="text-[10px] text-[var(--twin-mute)] mb-1">变更前</div><pre className="text-[10px] text-[var(--twin-ink)] whitespace-pre-wrap break-all font-mono leading-relaxed max-h-[160px] overflow-y-auto">{prevJson}</pre></div>
            <div className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-2"><div className="text-[10px] text-[var(--twin-mute)] mb-1">变更后</div><pre className="text-[10px] text-[var(--twin-ink)] whitespace-pre-wrap break-all font-mono leading-relaxed max-h-[160px] overflow-y-auto">{currJson}</pre></div>
          </div>
        </div>
      )}
      <div className="flex gap-4 text-[10px] text-[var(--twin-mute)]">
        <span>变更前: {event.prevCampusName && event.prevPosition ? `${event.prevCampusName}-${event.prevRoomName || ""}-${event.prevPosition}` : event.prevPosition || "-"}</span>
        <span>→</span>
        <span>变更后: {event.currCampusName && event.currPosition ? `${event.currCampusName}-${event.currRoomName || ""}-${event.currPosition}` : event.currPosition || "-"}</span>
      </div>
      <div className="text-[10px] text-[var(--twin-mute)]"><span className="font-medium text-[var(--twin-ink)]">摘要: </span>{event.detailSummary || "-"}</div>
    </div>
  );
}

/* ================================================================== */
/*  Main Page                                                            */
/* ================================================================== */

export default function AdminCageEventLogPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const pageLabel = useMemo(() => adminChromeTitle(location.pathname), [location.pathname]);

  const [activeTab, setActiveTab] = useState<Tab>("events");

  // ---- Event Log tab state ----
  const [eventType, setEventType] = useState("");
  const [campusName, setCampusName] = useState("");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const pageSize = 50;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["cageEventLogs", { eventType, campusName, searchText, page }],
    queryFn: () => fetchCageEventLogs({ eventType: eventType || undefined, campusName: campusName || undefined, searchText: searchText || undefined, offset: page * pageSize, limit: pageSize }),
    placeholderData: (prev) => prev,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ---- Snapshot batches (shared) ----
  const { data: batchList = [] } = useQuery({ queryKey: ["snapshotBatches"], queryFn: fetchSnapshotBatches, staleTime: 60_000 });

  // ---- Config mode ----
  const [configMode, setConfigMode] = useState<"auto" | "manual" | "off">(() => (localStorage.getItem("cageAlertConfigMode") as "auto"|"manual"|"off") || "auto");

  // ---- Comparison snapshot selectors ----
  const [baselineBatchId, setBaselineBatchId] = useState(() => localStorage.getItem("cageCompareBaseline") || "");
  const [currentBatchId, setCurrentBatchId] = useState(() => localStorage.getItem("cageCompareCurrent") || "");
  // Auto-fill latest two if unset
  useEffect(() => {
    if (batchList.length >= 2 && !localStorage.getItem("cageCompareBaseline")) {
      const b1 = batchList[1].scanBatchId; const b0 = batchList[0].scanBatchId;
      setBaselineBatchId(b1); setCurrentBatchId(b0);
      localStorage.setItem("cageCompareBaseline", b1); localStorage.setItem("cageCompareCurrent", b0);
    }
  }, [batchList]);
  const baselineBatch = batchList.find(b => b.scanBatchId === baselineBatchId);
  const currentBatch = batchList.find(b => b.scanBatchId === currentBatchId);

  // ---- Alert Config (per-mode) ----
  const { data: alertConfigs = [], isLoading: configLoading, refetch: refetchConfigs } = useQuery({
    queryKey: ["alertConfig", configMode],
    queryFn: () => fetchAlertConfig(configMode),
    enabled: activeTab === "config",
    staleTime: 30_000, refetchOnWindowFocus: false,
  });

  const configLoadedRef = useRef(false);
  const [localConfigs, setLocalConfigs] = useState<CageAlertConfig[]>([]);
  useEffect(() => {
    if (!configLoading && !configLoadedRef.current && alertConfigs.length > 0) {
      configLoadedRef.current = true;
      setLocalConfigs(alertConfigs.map(c => ({ ...c })));
    }
  }, [alertConfigs, configLoading]);
  useEffect(() => { if (activeTab !== "config") configLoadedRef.current = false; }, [activeTab]);
  // Reset when mode changes
  useEffect(() => { configLoadedRef.current = false; }, [configMode]);

  const saveMutation = useMutation({
    mutationFn: (cfgs: CageAlertConfig[]) => saveAlertConfig(cfgs, configMode),
    onSuccess: (_data, savedConfigs) => {
      toast.success("告警配置已保存");
      setLocalConfigs(savedConfigs.map(c => ({ ...c })));
      configLoadedRef.current = true;
      refetchConfigs();
    },
    onError: (e: any) => toast.error(e?.message || "保存失败"),
  });

  const handleSaveConfig = () => {
    const toSave = localConfigs.filter(c => c.statusCode && c.statusCode.trim() !== "");
    saveMutation.mutate(toSave);
  };

  const handleResetConfig = useCallback(() => {
    refetchConfigs().then((r) => { if (r.data) { setLocalConfigs(r.data.map(c => ({ ...c }))); configLoadedRef.current = true; } });
  }, [refetchConfigs]);

  // ---- Persisted Alerts (snapshot-based) ----
  const { data: alertData, isLoading: alertsLoading } = useQuery({
    queryKey: ["persistedAlerts", baselineBatchId, configMode],
    queryFn: () => fetchPersistedAlerts(baselineBatchId || undefined, configMode),
    enabled: activeTab === "alerts" || activeTab === "config",
  });
  const alerts = alertData?.alerts ?? [];
  const spanDays = alertData?.spanDays ?? 0;

  // ---- Render ----
  return (
    <AdminPageShell>
      <style>{`
        .log-scroll::-webkit-scrollbar{width:4px;height:4px}
        .log-scroll::-webkit-scrollbar-track{background:transparent}
        .log-scroll::-webkit-scrollbar-thumb{background:var(--twin-hairline);border-radius:4px}
      `}</style>
      <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
        <div className="shrink-0 mb-2">
          <button type="button" className="hover:bg-[var(--twin-canvas-soft)] rounded-twin-md p-1 -ml-1 transition" onClick={() => navigate(toAdminRoutePath("/admin/cage-shelves"))} title="返回笼架信息">
            <ArrowLeft className="h-5 w-5 text-[var(--twin-link-deep)]" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="shrink-0 mb-3 flex items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1 w-fit">
          {(["events","config","alerts"] as Tab[]).map(t => (
            <button key={t} type="button" onClick={() => setActiveTab(t)}
              className={`flex items-center gap-1 rounded-twin-md px-3 py-1.5 text-xs font-semibold transition ${activeTab === t ? "bg-[var(--twin-link-deep)] text-white shadow-sm" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
              {t === "events" && <Clock className="h-3.5 w-3.5" />}{t === "config" && <Settings className="h-3.5 w-3.5" />}{t === "alerts" && <Bell className="h-3.5 w-3.5" />}
              {t === "events" ? "事件日志" : t === "config" ? "告警配置" : "持续告警"}
              {t === "alerts" && alerts.length > 0 && <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">{alerts.length}</span>}
            </button>
          ))}
        </div>

        {/* ======== TAB: Event Log ======== */}
        {activeTab === "events" && (<>
          <AdminFormCard className="shrink-0 mb-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3"><h2 className="text-base font-bold text-[var(--app-color-text-primary)]">{pageLabel}</h2></div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-[var(--twin-mute)] flex items-center gap-1"><Clock className="h-3.5 w-3.5" />事件类型</span>
              <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-xs" value={eventType} onChange={(e) => { setEventType(e.target.value); setPage(0); }}>
                <option value="">全部事件</option>
                {EVENT_TYPES.map((t) => (<option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>))}
              </select>
              <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-xs" value={campusName} onChange={(e) => { setCampusName(e.target.value); setPage(0); }}>
                <option value="">全部校区</option><option value="浦东">浦东</option><option value="浦西">浦西</option>
              </select>
              <div className="relative flex-1 min-w-[180px]"><Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--twin-mute)]" /><input type="text" className="w-full rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] pl-7 pr-2 py-1 text-xs" placeholder="搜索笼盒号 / 位置 / 房间 / PI / 部门…" value={searchText} onChange={(e) => { setSearchText(e.target.value); setPage(0); }} /></div>
              <button type="button" className="text-xs text-[var(--twin-link-deep)] hover:underline" onClick={() => refetch()}>刷新</button>
            </div>
          </AdminFormCard>
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto log-scroll">
              <table className="w-full text-xs">
                <thead className="border-b-2 border-[var(--app-color-border-strong)]"><tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold"><th className="p-3 text-left w-[140px]">时间</th><th className="p-3 text-left w-[80px]">类型</th><th className="p-3 text-left w-[100px]">笼盒号</th><th className="p-3 text-left">摘要</th><th className="p-3 text-left w-[80px]">PI</th><th className="p-3 text-left">变更前位置</th><th className="p-3 text-left">变更后位置</th></tr></thead>
                <tbody>
                  {rows.map((row) => {
                    const expanded = expandedId === row.id;
                    return (<Fragment key={row.id}>
                      <tr onClick={() => setExpandedId(expanded ? null : row.id)} className={`border-t border-[var(--twin-hairline)] hover:bg-[var(--twin-canvas-soft)] cursor-pointer transition ${expanded ? "bg-[var(--twin-canvas-soft)]" : ""}`}>
                        <td className="px-3 py-1.5 text-[var(--twin-mute)] font-mono text-[10px]">{row.changedAt}</td>
                        <td className="px-3 py-1.5"><span className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${eventColor(row.eventType)}`}>{EVENT_TYPE_LABELS[row.eventType] ?? row.eventType}</span></td>
                        <td className="px-3 py-1.5 font-mono text-[10px]">{row.cageBoxQrCode || "-"}</td>
                        <td className="px-3 py-1.5 max-w-[360px] truncate">{row.detailSummary || "-"}</td>
                        <td className="px-3 py-1.5">{row.projectPiName || row.piName || "-"}</td>
                        <td className="px-3 py-1.5 text-[10px] text-[var(--twin-mute)]">{row.prevCampusName && row.prevPosition ? `${row.prevCampusName || ""}-${row.prevRoomName || ""}-${row.prevPosition}` : row.prevPosition || "-"}</td>
                        <td className="px-3 py-1.5 text-[10px]">{row.currCampusName && row.currPosition ? `${row.currCampusName || ""}-${row.currRoomName || ""}-${row.currPosition}` : row.currPosition || "-"}</td>
                      </tr>
                      {expanded && (<tr key={`${row.id}-detail`}><td colSpan={7} className="px-4 py-3 bg-[var(--twin-canvas-soft)] border-b border-[var(--twin-hairline)]"><EventDetailPanel event={row} onClose={() => setExpandedId(null)} /></td></tr>)}
                    </Fragment>);
                  })}
                </tbody>
              </table>
            </div>
            <div className="shrink-0 pt-2 flex items-center justify-between text-xs">
              <span className="text-[var(--twin-mute)]">第 {page + 1} / {totalPages} 页（共 {total} 条）</span>
              <div className="flex gap-1">
                <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-twin-md border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-30 hover:bg-[var(--twin-canvas-soft)]">上一页</button>
                <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="rounded-twin-md border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-30 hover:bg-[var(--twin-canvas-soft)]">下一页</button>
              </div>
            </div>
          </div>
        </>)}

        {/* ======== TAB: Alert Config ======== */}
        {activeTab === "config" && (
          <AdminFormCard className="shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
              <h2 className="text-base font-bold text-[var(--app-color-text-primary)]">告警配置</h2>
              {/* Mode toggle — 强视觉分段开关 */}
              <div className="flex items-stretch rounded-twin-lg border-2 border-[var(--twin-hairline)] overflow-hidden">
                <button type="button" onClick={() => setConfigMode("auto")}
                  className={`px-3 py-1.5 text-[11px] font-bold transition ${configMode === "auto" ? "bg-[var(--twin-link-deep)] text-white" : "bg-[var(--twin-canvas)] text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)]"}`}>
                  🔄 自动对比
                </button>
                <div className="w-px bg-[var(--twin-hairline)]" />
                <button type="button" onClick={() => setConfigMode("manual")}
                  className={`px-3 py-1.5 text-[11px] font-bold transition ${configMode === "manual" ? "bg-orange-500 text-white" : "bg-[var(--twin-canvas)] text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)]"}`}>
                  🎯 手动选择
                </button>
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
                    {baselineBatch && currentBatch && (
                      <span className="text-[10px] text-[var(--twin-mute)]">· 异常 {currentBatch.abnormalRows - baselineBatch.abnormalRows >= 0 ? "+" : ""}{currentBatch.abnormalRows - baselineBatch.abnormalRows}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-orange-700">🎯 对比基准:</span>
                    <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-xs" value={baselineBatchId}
                      onChange={(e) => { const v = e.target.value; setBaselineBatchId(v); localStorage.setItem("cageCompareBaseline", v); }}>
                      {batchList.map((b) => (<option key={b.scanBatchId} value={b.scanBatchId}>{b.scannedAt?.substring(0, 16)?.replace("T", " ")} · {b.abnormalRows}异常</option>))}
                    </select>
                    <span className="text-xs text-[var(--twin-mute)]">→</span>
                    <span className="text-xs font-medium text-[var(--twin-ink)]">当前:</span>
                    <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-xs" value={currentBatchId}
                      onChange={(e) => { const v = e.target.value; setCurrentBatchId(v); localStorage.setItem("cageCompareCurrent", v); }}>
                      <option value="">最新</option>
                      {batchList.map((b) => (<option key={b.scanBatchId} value={b.scanBatchId}>{b.scannedAt?.substring(0, 16)?.replace("T", " ")} · {b.abnormalRows}异常</option>))}
                    </select>
                    {baselineBatch && currentBatch && (
                      <span className="text-[10px] text-[var(--twin-mute)] ml-1">已存在 {spanDays ?? "?"} 天 · 异常 {currentBatch.abnormalRows - baselineBatch.abnormalRows >= 0 ? "+" : ""}{currentBatch.abnormalRows - baselineBatch.abnormalRows}</span>
                    )}
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
                      onChange={(e) => { const next = [...localConfigs]; next[idx] = { ...next[idx], statusCode: e.target.value, statusLabel: ALL_STATUS_OPTIONS.find(o => o.code === e.target.value)?.label || "" }; setLocalConfigs(next); }}>
                      <option value="">-- 选择状态 --</option>
                      {ALL_STATUS_OPTIONS.map(o => (<option key={o.code} value={o.code} disabled={localConfigs.some((c, i) => i !== idx && c.statusCode === o.code)}>{o.label}</option>))}
                    </select>
                    <span className="text-xs text-[var(--twin-mute)]">不超过</span>
                    <input type="number" min={0} max={365} className="w-16 rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1.5 text-xs text-center"
                      value={cfg.thresholdDays}
                      onChange={(e) => { const next = [...localConfigs]; next[idx] = { ...next[idx], thresholdDays: Math.max(0, parseInt(e.target.value) || 0) }; setLocalConfigs(next); }} />
                    <span className="text-xs text-[var(--twin-mute)]">天</span>
                    {configMode === "auto" && <span className="text-[10px] text-[var(--twin-mute)]">（已存在 {spanDays ?? "?"} 天）</span>}
                    <label className="flex items-center gap-1 text-xs cursor-pointer ml-2"><input type="checkbox" checked={cfg.enabled} onChange={(e) => { const next = [...localConfigs]; next[idx] = { ...next[idx], enabled: e.target.checked }; setLocalConfigs(next); }} />启用</label>
                    <button type="button" onClick={() => setLocalConfigs(localConfigs.filter((_, i) => i !== idx))} className="text-[10px] text-red-500 hover:text-red-700 ml-auto">删除</button>
                  </div>
                ))}
                {localConfigs.length === 0 && <div className="text-xs text-[var(--twin-mute)] py-4 text-center">暂无配置项，点击下方添加</div>}
                <button type="button" onClick={() => setLocalConfigs([...localConfigs, { statusCode: "", statusLabel: "", thresholdDays: 7, enabled: true }])}
                  className="text-xs text-[var(--twin-link-deep)] hover:underline inline-flex items-center gap-1">+ 添加监控项</button>
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-[var(--twin-hairline)] flex justify-end gap-2">
              <button type="button" onClick={handleResetConfig} className="rounded-twin-md border border-[var(--twin-hairline)] px-4 py-1.5 text-xs hover:bg-[var(--twin-canvas-soft)] transition">重置</button>
              <button type="button" onClick={handleSaveConfig} disabled={saveMutation.isPending}
                className="rounded-twin-md bg-[var(--twin-link-deep)] text-white px-4 py-1.5 text-xs font-semibold disabled:opacity-50 transition">
                {saveMutation.isPending ? "保存中..." : "保存配置"}
              </button>
            </div>
          </AdminFormCard>
        )}

        {/* ======== TAB: Persisted Alerts ======== */}
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
    </AdminPageShell>
  );
}
