import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminFullWidthPage } from "@/components/ui/AdminFullWidthPage";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Bot, Layers, Star } from "lucide-react";
import {
  fetchAnalyticsReports,
  fetchAnalyticsViews,
  type AnalyticsReportDescriptor,
} from "@/api/domains/analytics.api";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AnalyticsCopilotDialog } from "@/features/analytics/components/AnalyticsCopilotDialog";
import { CageOccupancyReportPanel } from "@/features/analytics/components/CageOccupancyReportPanel";
import { IsolationUsageReportPanel } from "@/features/analytics/components/IsolationUsageReportPanel";
import { StudentActivityReportPanel } from "@/features/analytics/components/StudentActivityReportPanel";
import { MaterialStatsReportPanel } from "@/features/analytics/components/MaterialStatsReportPanel";
import CageSpecialStatusReportPanel from "@/features/analytics/components/CageSpecialStatusReportPanel";
import { cn } from "@/lib/utils";

const ISOLATION_REPORT_KEY = "isolation_usage";
const CAGE_REPORT_KEY = "cage_occupancy";
const STUDENT_ACTIVITY_KEY = "student_activity";
const CAGE_SPECIAL_STATUS_KEY = "cage_special_status";
const MATERIAL_STATS_KEY = "material_stats";

const ANALYTICS_REPORT_KEYS = [ISOLATION_REPORT_KEY, CAGE_REPORT_KEY, STUDENT_ACTIVITY_KEY, CAGE_SPECIAL_STATUS_KEY] as const;

/* ---- analytics favorites (per-user, localStorage) ---- */

const FAV_LS_KEY = "analyticsFavoriteReportKey";

function loadFavoriteKey(): string | null {
  try { return localStorage.getItem(FAV_LS_KEY); } catch { return null; }
}
function saveFavoriteKey(key: string | null) {
  try { if (key) localStorage.setItem(FAV_LS_KEY, key); else localStorage.removeItem(FAV_LS_KEY); } catch { /* noop */ }
}

export default function AdminAnalyticsPage() {
  const [searchParams] = useSearchParams();
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["analytics", "reports"],
    queryFn: fetchAnalyticsReports,
  });

  const savedFav = loadFavoriteKey();
  const [activeKey, setActiveKey] = useState<string>(() => {
    // If saved favorite exists and is in the current reports list, use it
    if (savedFav) return savedFav;
    return ISOLATION_REPORT_KEY;
  });
  const [favoriteKey, setFavoriteKey] = useState<string | null>(savedFav);
  const [copilotOpen, setCopilotOpen] = useState(false);

  // If reports loaded and saved fav no longer exists, fall back
  const active = reports.find((r) => r.key === activeKey) ?? reports[0];
  const isAnalyticsReport = ANALYTICS_REPORT_KEYS.includes(activeKey as (typeof ANALYTICS_REPORT_KEYS)[number]);
  const isMaterialStats = activeKey === MATERIAL_STATS_KEY;

  useEffect(() => {
    const report = searchParams.get("report")?.trim();
    if (report) setActiveKey(report);
  }, [searchParams]);

  const { data: activeViews = [] } = useQuery({
    queryKey: ["analytics", "views", activeKey],
    queryFn: () => fetchAnalyticsViews(activeKey),
    enabled: isAnalyticsReport,
  });

  // Split reports: favorited first, then rest
  const orderedReports = useMemo(() => {
    if (!favoriteKey) return reports;
    const fav = reports.find((r) => r.key === favoriteKey);
    const rest = reports.filter((r) => r.key !== favoriteKey);
    return fav ? [fav, ...rest] : reports;
  }, [reports, favoriteKey]);

  const toggleFav = (key: string) => {
    if (favoriteKey === key) {
      setFavoriteKey(null);
      saveFavoriteKey(null);
    } else {
      setFavoriteKey(key);
      saveFavoriteKey(key);
      setActiveKey(key);
    }
  };

  return (
    <AdminFullWidthPage>
      <AdminPageShell>
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex shrink-0 flex-col lg:w-40 max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
          <h3 className="shrink-0 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--app-color-text-tertiary)] mb-2">
            <BarChart3 className="mr-1 inline h-3.5 w-3.5 text-[var(--app-color-accent)]" />
            统计与审计
          </h3>
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-row gap-2 lg:flex-col lg:overflow-visible">
          {isLoading ? (
            <p className="text-sm text-[var(--app-color-text-tertiary)]">加载中…</p>
          ) : (
            orderedReports.map((r) => (
              <ReportNavCard
                key={r.key}
                report={r}
                active={activeKey === r.key}
                isFavorite={favoriteKey === r.key}
                onSelect={() => setActiveKey(r.key)}
                onToggleFav={() => toggleFav(r.key)}
              />
            ))
          )}
          {reports.length === 0 && !isLoading ? (
            <p className="text-sm text-[var(--app-color-text-tertiary)]">暂无可用报表</p>
          ) : null}
          </div>
        </nav>

        <div className="min-w-0 flex-1 max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px] overflow-y-auto">
          {active ? (
            <header className="mb-4 rounded-2xl border border-[var(--app-color-border-default)] bg-[color-mix(in_srgb,var(--app-color-accent-soft)_55%,var(--app-color-surface-container))] px-5 py-4 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="shrink-0 rounded-xl bg-[var(--app-color-accent)] p-2.5 text-[var(--app-color-text-inverse)] shadow-sm">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold text-[var(--app-color-text-primary)]">{active.title}</h3>
                  <p className="mt-1 text-sm text-[var(--app-color-text-secondary)]">{active.description}</p>
                  <span className="mt-2 inline-block rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-color-accent-secondary)]">
                    {active.category}
                  </span>
                </div>
                {isAnalyticsReport ? (
                  <button
                    type="button"
                    disabled={activeViews.length === 0}
                    onClick={() => setCopilotOpen(true)}
                    title={
                      activeViews.length > 0
                        ? `基于全部 ${activeViews.length} 条统计配置及其清算数据综合分析`
                        : "请先在下方保存至少一条统计配置"
                    }
                    className="ml-auto shrink-0 self-center inline-flex items-center gap-2.5 rounded-xl bg-[linear-gradient(90deg,var(--app-color-accent),var(--app-color-accent-secondary))] px-6 py-3 text-base font-bold text-[var(--app-color-text-inverse)] shadow-lg ring-2 ring-[color-mix(in_srgb,var(--app-color-accent)_35%,transparent)] hover:opacity-95 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Bot className="h-5 w-5 shrink-0" aria-hidden />
                    AI 综合分析
                  </button>
                ) : null}
              </div>
            </header>
          ) : null}

          {activeKey === ISOLATION_REPORT_KEY ? <IsolationUsageReportPanel /> : null}
          {activeKey === CAGE_REPORT_KEY ? <CageOccupancyReportPanel /> : null}
          {activeKey === STUDENT_ACTIVITY_KEY ? <StudentActivityReportPanel /> : null}
          {activeKey === CAGE_SPECIAL_STATUS_KEY ? <CageSpecialStatusReportPanel /> : null}
          {isMaterialStats ? <MaterialStatsReportPanel /> : null}
          {!isAnalyticsReport && !isMaterialStats ? (
            <p className="text-sm text-[var(--app-color-text-tertiary)]">该报表模块即将上线。</p>
          ) : null}

          {isAnalyticsReport ? (
            <AnalyticsCopilotDialog
              open={copilotOpen}
              onClose={() => setCopilotOpen(false)}
              reportKey={activeKey as typeof ISOLATION_REPORT_KEY | typeof CAGE_REPORT_KEY | typeof STUDENT_ACTIVITY_KEY}
              configCount={activeViews.length}
            />
          ) : null}
        </div>
      </div>
    </AdminPageShell>
      </AdminFullWidthPage>
  );
}

function ReportNavCard({
  report,
  active,
  isFavorite,
  onSelect,
  onToggleFav,
}: {
  report: AnalyticsReportDescriptor;
  active: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFav: () => void;
}) {
  return (
    <div className={cn("shrink-0 relative group", !report.available && "cursor-not-allowed opacity-50")}>
      <button
        type="button"
        disabled={!report.available}
        onClick={onSelect}
        className={cn(
          "w-full rounded-xl border px-3 py-2.5 text-left text-sm transition lg:w-full pr-8",
          active
            ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent)] text-[var(--app-color-text-inverse)] shadow-md"
            : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] hover:border-[var(--app-color-accent-secondary)] hover:bg-[var(--app-color-surface-hover)]",
        )}
      >
        <span className="font-medium">{report.title}</span>
        {!report.available ? <span className="ml-1 text-xs opacity-70">（筹备中）</span> : null}
        {isFavorite && <Star className="absolute right-2 top-2.5 h-3.5 w-3.5 fill-[var(--app-color-feedback-warning)] text-[var(--app-color-feedback-warning)]" />}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
        className={cn(
          "absolute right-1.5 top-1.5 p-0.5 rounded transition",
          isFavorite ? "text-[var(--app-color-feedback-warning)] hover:opacity-90" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-feedback-warning)] opacity-0 group-hover:opacity-100",
        )}
        title={isFavorite ? "取消收藏" : "收藏此报表"}
      >
        <Star className={cn("h-3.5 w-3.5", isFavorite ? "fill-[var(--app-color-feedback-warning)]" : "")} />
      </button>
    </div>
  );
}
