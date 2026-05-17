import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Layers } from "lucide-react";
import { fetchAnalyticsReports, type AnalyticsReportDescriptor } from "@/api/domains/analytics.api";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { IsolationUsageReportPanel } from "@/features/analytics/components/IsolationUsageReportPanel";
import { cn } from "@/lib/utils";

export default function AdminAnalyticsPage() {
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["analytics", "reports"],
    queryFn: fetchAnalyticsReports,
  });

  const [activeKey, setActiveKey] = useState<string>("isolation_usage");

  const active = reports.find((r) => r.key === activeKey) ?? reports[0];

  return (
    <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-violet-600" />
          统计与审计
        </span>
      }
    >
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex shrink-0 flex-row gap-2 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible">
          <p className="hidden px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 lg:block">
            报表目录
          </p>
          {isLoading ? (
            <p className="text-sm text-neutral-500">加载中…</p>
          ) : (
            reports.map((r) => (
              <ReportNavCard key={r.key} report={r} active={activeKey === r.key} onSelect={() => setActiveKey(r.key)} />
            ))
          )}
          {reports.length === 0 && !isLoading ? (
            <p className="text-sm text-neutral-500">暂无可用报表</p>
          ) : null}
        </nav>

        <div className="min-w-0 flex-1">
          {active ? (
            <header className="mb-4 rounded-2xl border border-violet-200/60 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/50 px-5 py-4 ring-1 ring-violet-100/80">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-violet-600 p-2 text-white shadow-sm">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-neutral-950">{active.title}</h3>
                  <p className="mt-1 text-sm text-neutral-600">{active.description}</p>
                  <span className="mt-2 inline-block rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200">
                    {active.category}
                  </span>
                </div>
              </div>
            </header>
          ) : null}

          {activeKey === "isolation_usage" ? <IsolationUsageReportPanel /> : (
            <p className="text-sm text-neutral-500">该报表模块即将上线。</p>
          )}
        </div>
      </div>
    </AdminPageShell>
  );
}

function ReportNavCard({
  report,
  active,
  onSelect,
}: {
  report: AnalyticsReportDescriptor;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!report.available}
      onClick={onSelect}
      className={cn(
        "shrink-0 rounded-xl border px-3 py-2.5 text-left text-sm transition lg:w-full",
        active
          ? "border-violet-400 bg-violet-600 text-white shadow-md"
          : "border-neutral-200 bg-white text-neutral-800 hover:border-violet-200 hover:bg-violet-50/50",
        !report.available && "cursor-not-allowed opacity-50"
      )}
    >
      <span className="font-medium">{report.title}</span>
      {!report.available ? <span className="ml-1 text-xs opacity-70">（筹备中）</span> : null}
    </button>
  );
}
