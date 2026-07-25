import { useMemo, useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminFormCard, AdminPageShell, AdminFillScrollRegion } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { adminInputClass } from "@/features/admin/adminFormUi";
import { cn } from "@/lib/utils";
import { authHttp } from "@/api/core/authHttp";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";
import {
  TrendingUp, CheckCircle2, XCircle, Mail, MessageSquareText,
  RefreshCw, Activity, Search, RotateCw, ChevronLeft, ChevronRight,
  FileText, X, Clock, AlertCircle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PushDashboardOverview {
  totalSources: number;
  enabledSources: number;
  sent24h: number;
  success24h: number;
  failed24h: number;
  channelHealth: Array<{
    channelCode: string; channelName: string; enabled: boolean;
    status: string; failed10min: number;
  }>;
  digestEnabledSources?: number;
  nightModeSources?: number;
  pendingDigestUsers?: number;
  pendingDigestItems?: number;
}

interface PushLogEntry {
  id: number;
  notification_id: string;
  recipient_user_id: string;
  channel: string;
  template_key: string;
  status: string;
  source_code: string;
  source_name: string;
  channel_name: string;
  recipient_name: string;
  title: string;
  content: string;
  error_code: string;
  error_msg: string;
  provider_msg_id: string;
  retry_count: number;
  max_retries: number;
  create_time: string;
}

const CHANNEL_OPTIONS = [
  { value: "", label: "全部渠道" },
  { value: "EMAIL", label: "邮件" },
  { value: "SERVER_CHAN", label: "Server酱" },
];

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "SUCCESS", label: "成功" },
  { value: "FAILED", label: "失败" },
  { value: "SKIPPED_QUIET", label: "静默跳过" },
  { value: "SKIPPED_RATE_LIMIT", label: "限流跳过" },
];

const STATUS_STYLE: Record<string, string> = {
  SUCCESS: "bg-[var(--app-color-feedback-success)]/10 text-[var(--app-color-feedback-success)]",
  FAILED: "bg-[var(--app-color-feedback-error)]/10 text-[var(--app-color-feedback-error)]",
  SKIPPED_QUIET: "bg-yellow-500/10 text-yellow-600",
  SKIPPED_RATE_LIMIT: "bg-slate-500/10 text-slate-500",
  PENDING: "bg-blue-500/10 text-blue-500",
};

const STATUS_LABEL: Record<string, string> = {
  SUCCESS: "成功", FAILED: "失败", PENDING: "待发送",
  SKIPPED_QUIET: "静默", SKIPPED_RATE_LIMIT: "限流",
};

const channelIconMap: Record<string, React.ReactNode> = {
  EMAIL: <Mail className="h-4 w-4" aria-hidden />,
  SERVER_CHAN: <MessageSquareText className="h-4 w-4" aria-hidden />,
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminPushDashboardPage() {
  const location = useLocation();
  const pageLabel = useMemo(() => adminChromeTitle(location.pathname), [location.pathname]);
  const queryClient = useQueryClient();

  /* ---- overview ---- */
  const { data: overview, isLoading, error, refetch } = useQuery<PushDashboardOverview>({
    queryKey: ["push-dashboard-overview"],
    queryFn: () => authHttp.get("/admin/push-dashboard/overview").then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  /* ---- log filters ---- */
  const [logKeyword, setLogKeyword] = useState("");
  const [logSource, setLogSource] = useState("");
  const [logChannel, setLogChannel] = useState("");
  const [logStatus, setLogStatus] = useState("");
  const [logStartDate, setLogStartDate] = useState("");
  const [logEndDate, setLogEndDate] = useState("");
  const [logPage, setLogPage] = useState(1);
  const logSize = 20;

  const { data: logData, isLoading: logLoading } = useQuery({
    queryKey: ["push-log", logKeyword, logSource, logChannel, logStatus, logStartDate, logEndDate, logPage],
    queryFn: async () => {
      const r: any = await authHttp.get("/admin/push-log/list", {
        params: {
          keyword: logKeyword || undefined,
          sourceCode: logSource || undefined,
          channelCode: logChannel || undefined,
          status: logStatus || undefined,
          startDate: logStartDate || undefined,
          endDate: logEndDate || undefined,
          page: logPage,
          size: logSize,
        },
      });
      return r.data.data as { data: PushLogEntry[]; total: number };
    },
    refetchInterval: 30_000,
  });

  const [detailId, setDetailId] = useState<number | null>(null);

  /* ---- derived ---- */
  const successRate = overview && overview.sent24h > 0
    ? Math.round((overview.success24h / overview.sent24h) * 100) : null;
  const totalPages = logData ? Math.max(1, Math.ceil(logData.total / logSize)) : 1;

  const resetLogFilters = () => {
    setLogKeyword(""); setLogSource(""); setLogChannel(""); setLogStatus("");
    setLogStartDate(""); setLogEndDate(""); setLogPage(1);
  };

  return (
    <AdminPageShell>
      <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
        {/* ================================================================ */}
        {/*  Top bar                                                          */}
        {/* ================================================================ */}
        <AdminFormCard className="shrink-0 mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[var(--app-color-text-primary)] shrink-0">
              {pageLabel}
            </h2>
            <AdminButton type="button" tone="ghost" onClick={() => {
              refetch();
              queryClient.invalidateQueries({ queryKey: ["digest-pending"] });
              queryClient.invalidateQueries({ queryKey: ["push-log"] });
            }}>
              <RefreshCw className="h-4 w-4" aria-hidden /> 刷新
            </AdminButton>
          </div>
        </AdminFormCard>

        {/* ================================================================ */}
        {/*  Scrollable content                                              */}
        {/* ================================================================ */}
        <AdminFillScrollRegion>
          <div className="space-y-3">
            {isLoading ? (
              <div role="status" aria-busy="true" className="flex min-h-[200px] items-center justify-center rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-sm text-[var(--app-color-text-tertiary)]">
                加载中…
              </div>
            ) : error ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-[var(--app-color-feedback-error)]/30 bg-[var(--app-color-feedback-danger-soft)] p-6 text-center text-sm text-[var(--app-color-feedback-error)]">
                <p>{(error as Error)?.message ?? "加载失败"}</p>
                <button type="button" onClick={() => refetch()} className="rounded-lg border border-[var(--app-color-feedback-error)]/40 bg-[var(--app-color-surface-container)] px-3 py-1.5 text-xs font-medium text-[var(--app-color-feedback-error)] hover:bg-[var(--app-color-surface-hover)]">重试</button>
              </div>
            ) : !overview ? (
              <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-sm text-[var(--app-color-text-tertiary)]">
                暂无仪表盘数据
              </div>
            ) : (
              <>
                {/* Stat cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <StatCard icon={<TrendingUp className="h-4 w-4" />} label="24h 发送" value={overview.sent24h} tone="accent" />
                  <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="成功" value={overview.success24h} tone="success" sub={successRate !== null ? `成功率 ${successRate}%` : undefined} />
                  <StatCard icon={<XCircle className="h-4 w-4" />} label="失败" value={overview.failed24h} tone="error" />
                </div>

                {/* Channel health */}
                <AdminFormCard title="渠道健康">
                  <div className="mt-2 divide-y divide-[var(--app-color-border-default)]">
                    {(overview.channelHealth ?? []).map((ch) => {
                      const icon = channelIconMap[ch.channelCode] ?? <Activity className="h-4 w-4" />;
                      const statusLabel = ch.status === "healthy" ? "正常" : ch.status === "degraded" ? "降级" : "已暂停";
                      const statusColor = ch.status === "healthy" ? "text-[var(--app-color-feedback-success)]" : ch.status === "degraded" ? "text-yellow-500" : "text-[var(--app-color-text-tertiary)]";
                      return (
                        <div key={ch.channelCode} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                          <div className="flex items-center gap-3">
                            <span className={cn("flex items-center justify-center w-8 h-8 rounded-lg", ch.enabled ? "bg-[var(--app-color-feedback-success)]/10 text-[var(--app-color-feedback-success)]" : "bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)]")}>{icon}</span>
                            <div><p className="text-sm font-medium text-[var(--app-color-text-primary)]">{ch.channelName}</p></div>
                          </div>
                          <div className="flex items-center gap-3">
                            {ch.failed10min > 0 && <span className="text-[11px] text-[var(--app-color-text-tertiary)]">10min 失败 {ch.failed10min}</span>}
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", statusColor, ch.enabled ? "bg-current/10" : "bg-[var(--app-color-surface-hover)]")}>
                              <span className={cn("inline-block w-2 h-2 rounded-full", ch.status === "healthy" ? "bg-[var(--app-color-feedback-success)]" : ch.status === "degraded" ? "bg-yellow-500" : "bg-[var(--app-color-text-tertiary)]")} />
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AdminFormCard>

                {/* Pending digest items */}
                <DigestPendingSection />

                {/* ================================================ */}
                {/*  Push Log Section                                  */}
                {/* ================================================ */}
                <AdminFormCard title="推送日志">
                  {/* Filters */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <input type="text" className={cn(adminInputClass, "w-[140px] text-xs py-1.5")} placeholder="搜索标题/接收人/源…" value={logKeyword} onChange={(e) => { setLogKeyword(e.target.value); setLogPage(1); }} />
                    <select className={cn(adminInputClass, "w-auto min-w-[120px] text-xs py-1.5")} value={logChannel} onChange={(e) => { setLogChannel(e.target.value); setLogPage(1); }}>
                      {CHANNEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select className={cn(adminInputClass, "w-auto min-w-[120px] text-xs py-1.5")} value={logStatus} onChange={(e) => { setLogStatus(e.target.value); setLogPage(1); }}>
                      {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <input type="date" className={cn(adminInputClass, "w-auto text-xs py-1.5")} value={logStartDate} onChange={(e) => { setLogStartDate(e.target.value); setLogPage(1); }} placeholder="开始日期" />
                    <span className="text-xs text-[var(--app-color-text-tertiary)]">—</span>
                    <input type="date" className={cn(adminInputClass, "w-auto text-xs py-1.5")} value={logEndDate} onChange={(e) => { setLogEndDate(e.target.value); setLogPage(1); }} placeholder="结束日期" />
                    <AdminButton type="button" tone="ghost" size="sm" onClick={resetLogFilters}>
                      <RotateCw className="h-3.5 w-3.5" /> 重置
                    </AdminButton>
                    <span className="ml-auto text-[11px] text-[var(--app-color-text-tertiary)]">
                      共 {logData?.total ?? 0} 条
                    </span>
                  </div>

                  {/* Table */}
                  <div className="overflow-auto rounded-lg border border-[var(--app-color-border-default)]">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)]">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium whitespace-nowrap">时间</th>
                          <th className="text-left px-3 py-2 font-medium whitespace-nowrap">通知源</th>
                          <th className="text-left px-3 py-2 font-medium whitespace-nowrap">渠道</th>
                          <th className="text-left px-3 py-2 font-medium whitespace-nowrap">接收人</th>
                          <th className="text-left px-3 py-2 font-medium whitespace-nowrap">标题</th>
                          <th className="text-center px-3 py-2 font-medium whitespace-nowrap w-16">状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--app-color-border-default)]">
                        {logLoading && (!logData || !(logData as any).data || (logData as any).data.length === 0) ? (
                          <tr><td colSpan={6} className="text-center py-8 text-[var(--app-color-text-tertiary)]">加载中…</td></tr>
                        ) : !logData || !(logData as any).data || (logData as any).data.length === 0 ? (
                          <tr><td colSpan={6} className="text-center py-8 text-[var(--app-color-text-tertiary)]">暂无推送记录</td></tr>
                        ) : (
                          (logData as any).data.map((row: any) => (
                            <tr key={row.id} className="hover:bg-[var(--app-color-surface-hover)] cursor-pointer transition-colors" onClick={() => setDetailId(row.id)}>
                              <td className="px-3 py-2 text-[var(--app-color-text-tertiary)] whitespace-nowrap font-mono">{fmtTime(row.create_time)}</td>
                              <td className="px-3 py-2 text-[var(--app-color-text-primary)] max-w-[120px] truncate">
                                {row.source_name || row.source_code || "-"}
                                {(row.template_key || "").startsWith("DIGEST:") && (
                                  <span className="ml-1 inline-block rounded-full bg-[var(--app-color-accent)]/10 px-1.5 py-0.5 text-[9px] font-medium text-[var(--app-color-accent)]">聚合</span>
                                )}
                              </td>
                              <td className="px-3 py-2">{row.channel_name || row.channel || "-"}</td>
                              <td className="px-3 py-2 text-[var(--app-color-text-primary)] max-w-[100px] truncate">{row.recipient_name || row.recipient_user_id || "-"}</td>
                              <td className="px-3 py-2 text-[var(--app-color-text-primary)] max-w-[180px] truncate">{row.title || "-"}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_STYLE[row.status] || "bg-slate-100 text-slate-500")}>
                                  {STATUS_LABEL[row.status] || row.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[11px] text-[var(--app-color-text-tertiary)]">
                        第 {logPage} / {totalPages} 页
                      </span>
                      <div className="flex items-center gap-1">
                        <AdminButton type="button" tone="ghost" size="sm" disabled={logPage <= 1} onClick={() => setLogPage((p) => Math.max(1, p - 1))}>
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </AdminButton>
                        <AdminButton type="button" tone="ghost" size="sm" disabled={logPage >= totalPages} onClick={() => setLogPage((p) => Math.min(totalPages, p + 1))}>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </AdminButton>
                      </div>
                    </div>
                  )}
                </AdminFormCard>
              </>
            )}
          </div>
        </AdminFillScrollRegion>
      </div>

      {/* ================================================================ */}
      {/*  Detail modal                                                     */}
      {/* ================================================================ */}
      {detailId != null && <LogDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </AdminPageShell>
  );
}

/* ------------------------------------------------------------------ */
/*  StatCard                                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  DigestPendingSection                                                */
/* ------------------------------------------------------------------ */

interface DigestPendingItem {
  id: number; user_id: string; source_code: string; channel_code: string;
  title: string; content: string; create_time: string; user_name: string;
  schedule_times?: string; digest_mode?: string;
  hourly_interval?: number; minutely_interval?: number;
}

/** 绝对时钟计算下一次发送的倒计时秒数（与 DigestScheduler 逻辑一致） */
function computeNextSendSeconds(it: DigestPendingItem): number | null {
  const mode = it.digest_mode;
  if (!mode || mode === "INSTANT") return null;
  const now = new Date();
  const nowTotalSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  if (mode === "MINUTELY") {
    const interval = (it.minutely_interval || 5) * 60; // 转为秒
    if (interval <= 0) return null;
    const nextSlot = (Math.floor(nowTotalSeconds / interval) + 1) * interval;
    return nextSlot - nowTotalSeconds;
  }
  if (mode === "HOURLY") {
    const interval = (it.hourly_interval || 1) * 3600;
    const nextSlot = (Math.floor(nowTotalSeconds / interval) + 1) * interval;
    return nextSlot - nowTotalSeconds;
  }
  // SCHEDULED
  const times = (it.schedule_times || "").split(",").map(t => t.trim()).filter(Boolean);
  if (times.length === 0) return null;
  let minDiff = Infinity;
  for (const t of times) {
    const [h, m] = t.split(":").map(Number);
    const target = h * 3600 + m * 60;
    let diff = target - nowTotalSeconds;
    if (diff <= 0) diff += 86400;
    if (diff < minDiff) minDiff = diff;
  }
  return minDiff === Infinity ? null : minDiff;
}

function CountdownCell({ seconds }: { seconds: number | null }) {
  const [tick, setTick] = useState(seconds ?? 0);
  useEffect(() => {
    if (seconds == null) return;
    setTick(seconds);
    const id = setInterval(() => setTick((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds]);
  if (seconds == null) return <span className="text-right text-[var(--app-color-text-tertiary)]">—</span>;
  if (tick <= 0) return <span className="text-[var(--app-color-feedback-warning)] text-right font-medium">即将发送</span>;
  const m = Math.floor(tick / 60), s = tick % 60;
  const urgent = tick < 300;
  return <span className={cn("text-right whitespace-nowrap", urgent ? "text-[var(--app-color-feedback-warning)] font-medium" : "text-[var(--app-color-text-tertiary)]")}>{m > 0 ? `${m}分${s}秒` : `${s}秒`}</span>;
}

function DigestPendingSection() {
  const { data: items = [], isLoading } = useQuery<DigestPendingItem[]>({
    queryKey: ["digest-pending"],
    queryFn: () => authHttp.get("/admin/push-dashboard/digest-pending").then((r) => r.data.data),
    refetchInterval: 30000,
  });

  return (
    <AdminFormCard title={`聚合缓冲 · ${items.length} 条待发`}>
      <div className="max-h-[320px] overflow-auto mt-2">
        {isLoading ? (
          <p className="text-xs text-[var(--app-color-text-tertiary)] text-center py-4">加载中…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-[var(--app-color-text-tertiary)] text-center py-4">暂无待发缓冲</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--app-color-text-tertiary)] border-b border-[var(--app-color-border-default)]">
                <th className="py-1.5 pr-2 font-medium">信息源</th>
                <th className="py-1.5 pr-2 font-medium">接收人</th>
                <th className="py-1.5 pr-2 font-medium">标题</th>
                <th className="py-1.5 font-medium w-[80px] text-right">倒计时</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--app-color-border-default)]">
              {items.map((it) => (
                <tr key={it.id} className="hover:bg-[var(--app-color-surface-hover)]">
                  <td className="py-1.5 pr-2 text-[var(--app-color-accent)] font-medium max-w-[100px] truncate" title={it.source_code}>{it.source_code}</td>
                  <td className="py-1.5 pr-2 max-w-[70px] truncate" title={it.user_name}>{it.user_name}</td>
                  <td className="py-1.5 pr-2 max-w-[180px] truncate" title={it.title}>{it.title.replace(/<[^>]+>/g, "").trim()}</td>
                  <td className="py-1.5 text-right"><CountdownCell seconds={computeNextSendSeconds(it)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminFormCard>
  );
}

function StatCard({ icon, label, value, tone, sub }: {
  icon: React.ReactNode; label: string; value: number; tone: "accent" | "success" | "error"; sub?: string;
}) {
  const colorMap = {
    accent: { text: "text-[var(--app-color-accent)]", bg: "bg-[var(--app-color-accent-soft)]" },
    success: { text: "text-[var(--app-color-feedback-success)]", bg: "bg-[var(--app-color-feedback-success)]/10" },
    error: { text: "text-[var(--app-color-feedback-error)]", bg: "bg-[var(--app-color-feedback-error)]/10" },
  };
  const c = colorMap[tone];
  return (
    <AdminFormCard>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-[var(--app-color-text-tertiary)] mb-1 flex items-center gap-1">{icon}{label}</p>
          <p className={cn("text-2xl font-bold tabular-nums", tone === "error" ? "text-[var(--app-color-feedback-error)]" : tone === "success" ? "text-[var(--app-color-feedback-success)]" : "text-[var(--app-color-text-primary)]")}>{value.toLocaleString()}</p>
          {sub && <p className="text-[11px] text-[var(--app-color-text-tertiary)] mt-0.5">{sub}</p>}
        </div>
        <span className={cn("rounded-full p-2", c.bg)}>{icon && <span className={c.text}>{icon}</span>}</span>
      </div>
    </AdminFormCard>
  );
}

/* ------------------------------------------------------------------ */
/*  LogDetailModal                                                       */
/* ------------------------------------------------------------------ */

function LogDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isLoading } = useQuery<Record<string, unknown>>({
    queryKey: ["push-log-detail", id],
    queryFn: () => authHttp.get(`/admin/push-log/${id}`).then((r) => r.data.data),
  });

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[80vh] overflow-auto rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--app-color-text-primary)] flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--app-color-accent)]" /> 推送详情
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--app-color-surface-hover)]"><X className="h-4 w-4 text-[var(--app-color-text-tertiary)]" /></button>
        </div>
        {isLoading ? (
          <p className="text-xs text-[var(--app-color-text-tertiary)] text-center py-8">加载中…</p>
        ) : !data ? (
          <p className="text-xs text-[var(--app-color-text-tertiary)] text-center py-8">未找到记录</p>
        ) : (
          <dl className="space-y-2 text-xs">
            <DetailRow label="状态" value={<span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_STYLE[String(data.status ?? "")] || "")}>{STATUS_LABEL[String(data.status ?? "")] || String(data.status ?? "-")}</span>} />
            <DetailRow label="通知源" value={String(data.source_name ?? data.source_code ?? "-")} />
            <DetailRow label="渠道" value={String(data.channel_name ?? data.channel ?? "-")} />
            <DetailRow label="接收人" value={String(data.recipient_name ?? data.recipient_user_id ?? "-")} />
            <DetailRow label="标题" value={String(data.title ?? "-")} />
            <DetailRow label="内容" value={<pre className="whitespace-pre-wrap font-sans text-[var(--app-color-text-primary)] max-h-[200px] overflow-auto">{String(data.content ?? "-")}</pre>} />
            <DetailRow label="发送时间" value={fmtTime(String(data.create_time ?? ""))} />
            {(data as any).error_code && <DetailRow label="错误码" value={String((data as any).error_code)} />}
            {(data as any).error_msg && <DetailRow label="错误信息" value={<span className="text-[var(--app-color-feedback-error)]">{String((data as any).error_msg)}</span>} />}
            {(data as any).provider_msg_id && <DetailRow label="平台消息ID" value={<span className="font-mono text-[10px]">{String((data as any).provider_msg_id)}</span>} />}
            <DetailRow label="重试" value={`${data.retry_count ?? 0} / ${data.max_retries ?? 3}`} />
          </dl>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-[var(--app-color-text-tertiary)]">{label}</dt>
      <dd className="text-[var(--app-color-text-primary)] min-w-0 break-all">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Utils                                                              */
/* ------------------------------------------------------------------ */

function fmtTime(t: string | null | undefined): string {
  if (!t) return "-";
  try { return new Date(t).toLocaleString("zh-CN", { hour12: false }); } catch { return t; }
}
