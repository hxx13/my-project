import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsLlmInsightResult, LlmChartSuggestion } from "@/api/domains/analytics.api";
import { MeasuredChartBox } from "@/features/analytics/components/MeasuredChartBox";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";

export function AnalyticsInsightDisplay({
  insight,
  periodLabel,
  compact,
}: {
  insight: AnalyticsLlmInsightResult;
  periodLabel?: string;
  compact?: boolean;
}) {
  const charts = insight.chartSuggestions ?? [];

  return (
    <div className={cn(compact ? "space-y-3" : "space-y-5")}>
      {insight.headline ? (
        <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white px-3 py-2.5 sm:px-4 sm:py-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-violet-600">一句话结论</p>
          <p className="mt-1 text-sm font-semibold text-neutral-900 sm:text-base">{insight.headline}</p>
          {periodLabel ? <p className="mt-1 text-[11px] text-neutral-500">{periodLabel}</p> : null}
        </div>
      ) : null}

      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "gap-4 lg:grid-cols-2")}>
        <BulletCard title="管理层要点" items={insight.executiveSummary} tint="violet" />
        <BulletCard title="会上可直接说" items={insight.meetingTalkingPoints} tint="sky" />
      </div>

      {insight.periodComparison?.narrative || (insight.periodComparison?.highlights?.length ?? 0) > 0 ? (
        <Section title="周期对比">
          {insight.periodComparison?.narrative ? (
            <p className="text-sm leading-relaxed text-neutral-700">{insight.periodComparison.narrative}</p>
          ) : null}
          <BulletList items={insight.periodComparison?.highlights} className="mt-2" />
        </Section>
      ) : null}

      {(insight.topDrivers?.length ?? 0) > 0 ? (
        <Section title="主要驱动因素">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-1 pr-2">课题组/因素</th>
                  <th className="py-1 pr-2 text-right">人次</th>
                  <th className="py-1 pr-2 text-right">占比%</th>
                  <th className="py-1">说明</th>
                </tr>
              </thead>
              <tbody>
                {insight.topDrivers!.map((row, i) => (
                  <tr key={`${row.name}-${i}`} className="border-b border-neutral-100">
                    <td className="py-1.5 pr-2">{row.name}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{row.personTimes ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {row.sharePct != null ? row.sharePct.toFixed(1) : "—"}
                    </td>
                    <td className="py-1.5 text-neutral-600">{row.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {charts.length > 0 && !compact ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {charts.map((c, i) => (
            <ChartCard key={`${c.title}-${i}`} chart={c} />
          ))}
        </div>
      ) : null}

      {(insight.risksOrAnomalies?.length ?? 0) > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-800">关注与异常</p>
          <BulletList items={insight.risksOrAnomalies} className="mt-2 text-amber-900" />
        </div>
      ) : null}

      {(insight.regionInsights?.length ?? 0) > 0 ? (
        <Section title="区域/楼层洞察">
          <ul className="space-y-2 text-sm text-neutral-700">
            {insight.regionInsights!.map((r, i) => (
              <li key={`${r.region}-${i}`} className="rounded-lg border border-neutral-100 bg-neutral-50/80 px-3 py-2">
                <span className="font-medium">{r.region}</span>
                {r.personTimes != null ? (
                  <span className="ml-2 text-neutral-500">（{r.personTimes} 人次）</span>
                ) : null}
                {r.note ? <p className="mt-1 text-neutral-600">{r.note}</p> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {insight.model ? (
        <p className="text-[10px] text-neutral-400">
          模型 {insight.model}
          {insight.promptTokens != null
            ? ` · 输入 ${insight.promptTokens} / 输出 ${insight.completionTokens ?? 0} tokens`
            : ""}
        </p>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-100 bg-white/80 px-3 py-2.5">
      <p className="text-xs font-semibold text-neutral-700">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function BulletCard({
  title,
  items,
  tint,
}: {
  title: string;
  items?: string[];
  tint: "violet" | "sky";
}) {
  if (!items?.length) return null;
  const border = tint === "violet" ? "border-violet-200 bg-violet-50/50" : "border-sky-200 bg-sky-50/50";
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", border)}>
      <p className="text-xs font-semibold text-neutral-700">{title}</p>
      <BulletList items={items} className="mt-2" />
    </div>
  );
}

function BulletList({ items, className }: { items?: string[]; className?: string }) {
  if (!items?.length) return null;
  return (
    <ul className={cn("list-disc space-y-1 pl-4 text-sm text-neutral-800", className)}>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function ChartCard({ chart }: { chart: LlmChartSuggestion }) {
  const data = (chart.labels ?? []).map((label, i) => ({
    name: label.length > 12 ? `${label.slice(0, 12)}…` : label,
    fullName: label,
    value: chart.values?.[i] ?? 0,
  }));
  if (data.length === 0) return null;
  const height = Math.max(160, data.length * 28);

  return (
    <AdminFormCard title={chart.title || "建议图表"} description="">
      <MeasuredChartBox height={height}>
          <BarChart layout="vertical" data={data} margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
            <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 10 }} />
            <Tooltip
              formatter={(v) => [Number(v ?? 0), "数值"]}
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as { fullName?: string } | undefined;
                return p?.fullName ?? "";
              }}
            />
            <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={14} />
          </BarChart>
      </MeasuredChartBox>
    </AdminFormCard>
  );
}
