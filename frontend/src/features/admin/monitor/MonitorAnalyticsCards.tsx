import { useMonitorStore } from "@/store/useMonitorStore";
import MonitorAnalyticsSkeleton from "./MonitorAnalyticsSkeleton";

export default function MonitorAnalyticsCards() {
  const analytics = useMonitorStore((s) => s.analytics);
  const loading = useMonitorStore((s) => s.analyticsLoading);
  const error = useMonitorStore((s) => s.analyticsError);

  // State: Loading (first load only)
  if (loading && !analytics) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-[var(--app-color-text-primary)] mb-3">访问分析</h3>
        <MonitorAnalyticsSkeleton />
      </section>
    );
  }

  // Build a shared indicator bar for non-blocking loading/error
  const indicatorBar = (
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-sm font-semibold text-[var(--app-color-text-primary)]">访问分析</h3>
      {loading && (
        <span className="text-xs text-[var(--app-color-text-tertiary)] animate-pulse">
          刷新中...
        </span>
      )}
      {error && !loading && (
        <span className="text-xs text-[var(--app-color-feedback-danger)]">
          刷新失败: {error}
        </span>
      )}
    </div>
  );

  // State: Error on first load (no stale data to show)
  if (error && !analytics) {
    return (
      <section>
        {indicatorBar}
        <div className="rounded-xl border border-[var(--app-color-feedback-danger)]/30 bg-[var(--app-color-feedback-danger-soft)] p-5 text-sm text-[var(--app-color-feedback-danger)]">
          分析数据加载失败: {error}
        </div>
      </section>
    );
  }

  // State: Empty
  if (!analytics || analytics.totalRequests === 0) {
    return (
      <section>
        {indicatorBar}
        <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-8 text-center text-sm text-[var(--app-color-text-tertiary)]">
          拦截器已就绪，等待首个业务请求后开始统计
          （监控端点自身已被排除，需访问业务 API 触发计数）
        </div>
      </section>
    );
  }

  // State: Normal or Stale-with-refresh — always show data, with non-blocking indicator
  return (
    <section>
      {indicatorBar}
      <div className="flex flex-col gap-[var(--app-space-section-gap)]">
        <StatCards analytics={analytics} />
        <DistributionRow analytics={analytics} />
        <RankingLists analytics={analytics} />
      </div>
    </section>
  );
}

function StatCards({ analytics }: { analytics: NonNullable<ReturnType<typeof useMonitorStore.getState>["analytics"]> }) {
  const total = analytics.totalRequests;
  const statusDist = analytics.statusDistribution;
  const okCount = Number(statusDist["200"] ?? 0);
  const err500 = Number(statusDist["500"] ?? 0);
  const okRate = total > 0 ? (okCount / total * 100).toFixed(1) : "0.0";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--app-space-element-gap)]">
      <InfoCard label="总请求数" value={total.toLocaleString('zh-CN')} />
      <InfoCard label="独立访客" value={analytics.uniqueVisitors.toLocaleString('zh-CN')} detail="今日" />
      <InfoCard label="200 率" value={`${okRate}%`} detail={okRate === "100.0" ? "全部正常" : `${err500} 个错误`} />
      <InfoCard
        label="500 错误"
        value={String(err500)}
        detail={err500 === 0 ? "无错误" : undefined}
      />
    </div>
  );
}

function InfoCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-sm">
      <div className="text-xs text-[var(--app-color-text-tertiary)] mb-1">{label}</div>
      <div className="text-2xl font-mono tabular-nums font-semibold text-[var(--app-color-text-primary)]">{value}</div>
      {detail && <div className="text-xs text-[var(--app-color-text-tertiary)] mt-1">{detail}</div>}
    </div>
  );
}

function DistributionRow({ analytics }: { analytics: NonNullable<ReturnType<typeof useMonitorStore.getState>["analytics"]> }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--app-space-element-gap)]">
      <DistributionCard title="响应时间分布">
        <ResponseTimeHistogram buckets={analytics.responseTimeBuckets} />
      </DistributionCard>
      <DistributionCard title="状态码分布">
        <StatusBar distribution={analytics.statusDistribution} />
      </DistributionCard>
    </div>
  );
}

function DistributionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-sm">
      <div className="text-sm font-medium text-[var(--app-color-text-primary)] mb-4">{title}</div>
      {children}
    </div>
  );
}

function ResponseTimeHistogram({ buckets }: { buckets: Record<string, number> }) {
  const bucketOrder = ["0-10", "10-50", "50-100", "100-200", "200-500", "500-1000", "1000-3000", "3000+"];
  const maxVal = Math.max(1, ...bucketOrder.map((k) => buckets[k] ?? 0));

  return (
    <div role="img" aria-label={`响应时间分布: ${bucketOrder.map(k => `${k}ms: ${buckets[k] ?? 0}次`).join(", ")}`}>
      {bucketOrder.map((key) => {
        const count = buckets[key] ?? 0;
        const pct = (count / maxVal) * 100;
        return (
          <div key={key} className="flex items-center gap-2 mb-2">
            <span className="w-20 text-xs text-[var(--app-color-text-tertiary)] text-right">{key}ms</span>
            <div className="flex-1 h-5 rounded-[var(--app-radius-element)] bg-[var(--app-color-surface-hover)] overflow-hidden">
              <div
                className="h-full rounded-[var(--app-radius-element)] bg-[var(--app-color-feedback-success)] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-16 text-xs font-mono text-[var(--app-color-text-secondary)]">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatusBar({ distribution }: { distribution: Record<string, number> }) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  const colors: Record<string, string> = {
    "200": "var(--app-color-feedback-success)",
    "201": "var(--app-color-feedback-success)",
    "204": "var(--app-color-feedback-success)",
    "301": "var(--app-color-feedback-success)",
    "302": "var(--app-color-feedback-success)",
    "304": "var(--app-color-feedback-success)",
    "400": "var(--app-color-feedback-warning)",
    "401": "var(--app-color-feedback-warning)",
    "403": "var(--app-color-feedback-warning)",
    "404": "var(--app-color-feedback-warning)",
    "500": "var(--app-color-feedback-danger)",
    "502": "var(--app-color-feedback-danger)",
    "503": "var(--app-color-feedback-danger)",
  };

  const ariaText = Object.entries(distribution)
    .map(([k, v]) => `${k} 响应占 ${total > 0 ? ((v / total) * 100).toFixed(1) : "0"}%`)
    .join("，");

  return (
    <div
      role="img"
      aria-label={ariaText}
    >
      <div className="flex h-6 rounded-[var(--app-radius-element)] overflow-hidden">
        {Object.entries(distribution).map(([status, count]) => (
          <div
            key={status}
            className="h-full transition-all"
            style={{
              width: `${total > 0 ? (count / total) * 100 : 0}%`,
              backgroundColor: colors[status] ?? "var(--app-color-feedback-success)",
            }}
            title={`${status}: ${count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-3">
        {Object.entries(distribution).map(([status, count]) => (
          <div key={status} className="flex items-center gap-1.5 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: colors[status] ?? "var(--app-color-feedback-success)" }}
            />
            <span className="text-[var(--app-color-text-secondary)]">{status}</span>
            <span className="font-mono text-[var(--app-color-text-primary)]">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankingLists({ analytics }: { analytics: NonNullable<ReturnType<typeof useMonitorStore.getState>["analytics"]> }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--app-space-element-gap)]">
      <RankingCard title="Top 5 URLs" items={analytics.topUrls} keyField="path" />
      <RankingCard title="Top 5 404 URLs" items={analytics.top404Urls} keyField="path" />
      <RankingCard title="Top 5 User-Agent" items={analytics.topUserAgents} keyField="ua" />
    </div>
  );
}

function RankingCard({
  title,
  items,
  keyField,
}: {
  title: string;
  items: Array<Record<string, any>>;
  keyField: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-sm">
        <div className="text-sm font-medium text-[var(--app-color-text-primary)] mb-4">{title}</div>
        <div className="text-xs text-[var(--app-color-text-tertiary)] py-4 text-center">
          {title === "Top 5 404 URLs"
            ? "暂无 404 请求，系统运行正常"
            : title === "Top 5 User-Agent"
              ? "暂无足够数据，等待更多客户端访问"
              : "暂无足够数据生成排名"}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-sm">
      <div className="text-sm font-medium text-[var(--app-color-text-primary)] mb-4">{title}</div>
      <ol className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex justify-between items-center text-sm">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-5 text-xs font-mono text-[var(--app-color-text-tertiary)] flex-shrink-0">
                {i + 1}.
              </span>
              <span className="text-[var(--app-color-text-primary)] truncate" title={String(item[keyField])}>
                {String(item[keyField]).length > 60
                  ? String(item[keyField]).substring(0, 60) + "..."
                  : String(item[keyField])}
              </span>
            </span>
            <span className="font-mono text-xs text-[var(--app-color-text-secondary)] ml-3 flex-shrink-0">
              {item.count}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
