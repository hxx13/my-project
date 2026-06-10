import { useState, useMemo } from "react";
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
import CageSpecialStatusReportPanel from "@/features/analytics/components/CageSpecialStatusReportPanel";
import { cn } from "@/lib/utils";

const ISOLATION_REPORT_KEY = "isolation_usage";
const CAGE_REPORT_KEY = "cage_occupancy";
const STUDENT_ACTIVITY_KEY = "student_activity";
const CAGE_SPECIAL_STATUS_KEY = "cage_special_status";

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
      <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-violet-600" />
          统计与审计
        </span>
      }
    >
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex shrink-0 flex-row gap-2 overflow-x-auto lg:w-40 lg:flex-col lg:overflow-visible">
          <p className="hidden px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 lg:block">
            报表目录
          </p>
          {isLoading ? (
            <p className="text-sm text-neutral-500">加载中…</p>
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
            <p className="text-sm text-neutral-500">暂无可用报表</p>
          ) : null}
        </nav>

        <div className="min-w-0 flex-1">
          {active ? (
            <header className="mb-4 rounded-2xl border border-violet-200/60 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/50 px-5 py-4 ring-1 ring-violet-100/80">
              <div className="flex items-center gap-4">
                <div className="shrink-0 rounded-xl bg-violet-600 p-2.5 text-white shadow-sm">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold text-neutral-950">{active.title}</h3>
                  <p className="mt-1 text-sm text-neutral-600">{active.description}</p>
                  <span className="mt-2 inline-block rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200">
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
                    className="ml-auto shrink-0 self-center inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-base font-bold text-white shadow-lg ring-2 ring-violet-500/40 hover:from-violet-700 hover:to-indigo-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
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
          {!isAnalyticsReport ? (
            <p className="text-sm text-neutral-500">该报表模块即将上线。</p>
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
            ? "border-violet-400 bg-violet-600 text-white shadow-md"
            : "border-neutral-200 bg-white text-neutral-800 hover:border-violet-200 hover:bg-violet-50/50",
        )}
      >
        <span className="font-medium">{report.title}</span>
        {!report.available ? <span className="ml-1 text-xs opacity-70">（筹备中）</span> : null}
        {isFavorite && <Star className="absolute right-2 top-2.5 h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
        className={cn(
          "absolute right-1.5 top-1.5 p-0.5 rounded transition",
          isFavorite ? "text-amber-500 hover:text-amber-600" : "text-neutral-300 hover:text-amber-400 opacity-0 group-hover:opacity-100",
        )}
        title={isFavorite ? "取消收藏" : "收藏此报表"}
      >
        <Star className={cn("h-3.5 w-3.5", isFavorite ? "fill-amber-400" : "")} />
      </button>
    </div>
      </AdminFullWidthPage>
  );
}
