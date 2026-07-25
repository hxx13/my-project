import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AdminFormCard, AdminPageShell, AdminFillScrollRegion } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { cn } from "@/lib/utils";
import { authHttp } from "@/api/core/authHttp";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";
import {
  TrendingUp,
  CheckCircle2,
  XCircle,
  Mail,
  MessageSquareText,
  RefreshCw,
  Activity,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PushDashboardOverview {
  sent24h: number;
  success24h: number;
  failed24h: number;
  channelHealth: Array<{ channelCode: string; channelName: string; enabled: boolean }>;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminPushDashboardPage() {
  const location = useLocation();
  const pageLabel = useMemo(() => adminChromeTitle(location.pathname), [location.pathname]);

  const {
    data: overview,
    isLoading,
    error,
    refetch,
  } = useQuery<PushDashboardOverview>({
    queryKey: ["push-dashboard-overview"],
    queryFn: () => authHttp.get("/admin/push-dashboard/overview").then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  const channelIconMap: Record<string, React.ReactNode> = {
    EMAIL: <Mail className="h-4 w-4" aria-hidden />,
    SERVER_CHAN: <MessageSquareText className="h-4 w-4" aria-hidden />,
  };

  /* ---- Derived ---- */
  const successRate = overview && overview.sent24h > 0
    ? Math.round((overview.success24h / overview.sent24h) * 100)
    : null;

  return (
    <AdminPageShell>
      <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
        {/* ================================================================ */}
        {/*  Top bar: title                                                  */}
        {/* ================================================================ */}
        <AdminFormCard className="shrink-0 mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[var(--app-color-text-primary)] shrink-0">
              {pageLabel}
            </h2>
            <AdminButton
              type="button"
              tone="ghost"
              onClick={() => refetch()}
            >
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
              <div
                role="status"
                aria-busy="true"
                className="flex min-h-[200px] items-center justify-center rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-sm text-[var(--app-color-text-tertiary)]"
              >
                加载中…
              </div>
            ) : error ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-[var(--app-color-feedback-error)]/30 bg-[var(--app-color-feedback-danger-soft)] p-6 text-center text-sm text-[var(--app-color-feedback-error)]">
                <p>{(error as Error)?.message ?? "加载失败"}</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="rounded-lg border border-[var(--app-color-feedback-error)]/40 bg-[var(--app-color-surface-container)] px-3 py-1.5 text-xs font-medium text-[var(--app-color-feedback-error)] hover:bg-[var(--app-color-surface-hover)]"
                >
                  重试
                </button>
              </div>
            ) : !overview ? (
              <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-sm text-[var(--app-color-text-tertiary)]">
                暂无仪表盘数据
              </div>
            ) : (
              <>
                {/* ================================================ */}
                {/*  Stat cards                                       */}
                {/* ================================================ */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Sent */}
                  <AdminFormCard>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-medium text-[var(--app-color-text-tertiary)] mb-1 flex items-center gap-1">
                          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                          今日发送
                        </p>
                        <p className="text-2xl font-bold text-[var(--app-color-text-primary)] tabular-nums">
                          {overview.sent24h.toLocaleString()}
                        </p>
                      </div>
                      <span className="rounded-full bg-[var(--app-color-accent-soft)] p-2">
                        <TrendingUp className="h-4 w-4 text-[var(--app-color-accent)]" />
                      </span>
                    </div>
                  </AdminFormCard>

                  {/* Success */}
                  <AdminFormCard>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-medium text-[var(--app-color-text-tertiary)] mb-1 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          成功
                        </p>
                        <p className="text-2xl font-bold text-[var(--app-color-feedback-success)] tabular-nums">
                          {overview.success24h.toLocaleString()}
                        </p>
                        {successRate !== null && (
                          <p className="text-[11px] text-[var(--app-color-text-tertiary)] mt-0.5">
                            成功率 {successRate}%
                          </p>
                        )}
                      </div>
                      <span className="rounded-full bg-[var(--app-color-feedback-success)]/10 p-2">
                        <CheckCircle2 className="h-4 w-4 text-[var(--app-color-feedback-success)]" />
                      </span>
                    </div>
                  </AdminFormCard>

                  {/* Failed */}
                  <AdminFormCard>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-medium text-[var(--app-color-text-tertiary)] mb-1 flex items-center gap-1">
                          <XCircle className="h-3.5 w-3.5" aria-hidden />
                          失败
                        </p>
                        <p className="text-2xl font-bold text-[var(--app-color-feedback-error)] tabular-nums">
                          {overview.failed24h.toLocaleString()}
                        </p>
                        {successRate !== null && overview.failed24h > 0 && (
                          <p className="text-[11px] text-[var(--app-color-text-tertiary)] mt-0.5">
                            失败率 {100 - successRate}%
                          </p>
                        )}
                      </div>
                      <span className="rounded-full bg-[var(--app-color-feedback-error)]/10 p-2">
                        <XCircle className="h-4 w-4 text-[var(--app-color-feedback-error)]" />
                      </span>
                    </div>
                  </AdminFormCard>
                </div>

                {/* ================================================ */}
                {/*  Channel health                                   */}
                {/* ================================================ */}
                <AdminFormCard
                  title="渠道健康"
                  className="space-y-0"
                >
                  <div className="mt-2 divide-y divide-[var(--app-color-border-default)]">
                    {(overview.channelHealth ?? []).length === 0 ? (
                      <p className="py-4 text-center text-xs text-[var(--app-color-text-tertiary)]">
                        暂无渠道健康数据
                      </p>
                    ) : (
                      (overview.channelHealth ?? []).map((ch) => {
                        const icon = channelIconMap[ch.channelCode] ?? (
                          <Activity className="h-4 w-4" />
                        );
                        return (
                          <div
                            key={ch.channelCode}
                            className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={cn(
                                  "flex items-center justify-center w-8 h-8 rounded-lg",
                                  ch.enabled
                                    ? "bg-[var(--app-color-feedback-success)]/10 text-[var(--app-color-feedback-success)]"
                                    : "bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)]",
                                )}
                              >
                                {icon}
                              </span>
                              <div>
                                <p className="text-sm font-medium text-[var(--app-color-text-primary)]">
                                  {ch.channelName}
                                </p>
                                <p className="text-[11px] text-[var(--app-color-text-tertiary)]">
                                  {ch.channelCode}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                                  ch.enabled
                                    ? "bg-[var(--app-color-feedback-success)]/10 text-[var(--app-color-feedback-success)]"
                                    : "bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)]",
                                )}
                              >
                                <span
                                  className={cn(
                                    "inline-block w-2 h-2 rounded-full",
                                    ch.enabled
                                      ? "bg-[var(--app-color-feedback-success)]"
                                      : "bg-[var(--app-color-text-tertiary)]",
                                  )}
                                />
                                {ch.enabled ? "正常" : "已暂停"}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </AdminFormCard>
              </>
            )}
          </div>
        </AdminFillScrollRegion>
      </div>
    </AdminPageShell>
  );
}
