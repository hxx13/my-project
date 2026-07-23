import { CheckCircle2, Database, Loader2, Route } from "lucide-react";
import type { IsolationUsageQueryResult } from "@/api/domains/analytics.api";
import { cn } from "@/lib/utils";

export type QueryProvenanceStep = {
  name?: string;
  layer?: string;
  table?: string;
  disposition?: string;
  directionFilter?: string;
  channelScope?: string;
  channelCount?: number;
  dataSource?: string;
  rawLogCount?: number;
  flowScope?: string;
  note?: string;
  startTime?: string;
  endTime?: string;
  queryMs?: number;
  rowsScanned?: number;
  includedEvents?: number;
  status?: string;
};

export type QueryProvenance = {
  startTime?: string;
  endTime?: string;
  totalMs?: number;
  steps?: QueryProvenanceStep[];
};

type Props = {
  title?: string;
  loading?: boolean;
  loadingLabel?: string;
  provenance?: QueryProvenance | null;
  result?: IsolationUsageQueryResult | null;
  className?: string;
};

function filterSnapshotLines(snap?: Record<string, unknown>): string[] {
  if (!snap || typeof snap !== "object") return [];
  const lines: string[] = [];
  const pkg = snap.packageFilter as Record<string, unknown> | undefined;
  const flow = snap.flowFilter as Record<string, unknown> | undefined;
  if (pkg) {
    const resolved = pkg.resolvedChannelCodes;
    const scopeLabel = typeof pkg.channelScopeLabel === "string" ? pkg.channelScopeLabel.trim() : "";
    const configured = pkg.channelCodes;
    const chLabel =
      scopeLabel ||
      (Array.isArray(resolved) && resolved.length > 0
        ? `实查 ${resolved.length} 个通道`
        : Array.isArray(configured) && configured.length > 0
          ? `配置 ${configured.length} 个通道`
          : "全部已启用清洗通道");
    lines.push(`主口径（清洗总库）：${chLabel} · 不按进出筛门禁`);
  } else if (Array.isArray(snap.channelCodes)) {
    const ch = snap.channelCodes as unknown[];
    lines.push(
      `主口径：${ch.length > 0 ? `${ch.length} 个通道` : "全部已启用清洗通道"}（历史快照格式）`
    );
  }
  if (flow) {
    const dir = flow.actionTypeLabel ?? "全部进出";
    const loc: string[] = [];
    const campuses = flow.campuses;
    if (Array.isArray(campuses) && campuses.length) loc.push(`校区 ${campuses.length}`);
    if (flow.roomName) loc.push(`房间 ${String(flow.roomName)}`);
    lines.push(`ARO 流水：进出 ${dir}${loc.length ? ` · ${loc.join(" · ")}` : ""}`);
  } else if (snap.actionType != null) {
    const a = snap.actionType;
    const dir = a === 1 || a === "1" ? "仅进入" : a === 2 || a === "2" ? "仅离开" : "全部进出";
    lines.push(`ARO 流水（历史）：进出 ${dir}`);
  }
  return lines;
}

export function IsolationQueryProvenancePanel({
  title = "数据调用与进度",
  loading,
  loadingLabel = "查询中…",
  provenance,
  result,
  className,
}: Props) {
  const steps = provenance?.steps ?? [];
  const summary = result?.summary;
  const mainTrace = summary?.queryTrace as QueryProvenanceStep | undefined;
  const snapLines = filterSnapshotLines(summary?.filterSnapshot);

  const hasContent =
    loading || steps.length > 0 || mainTrace || snapLines.length > 0 || result?.auxiliaryFlow;

  if (!hasContent) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-sky-200/90 bg-sky-50/40 px-3 py-2.5 text-[11px] text-sky-950",
        className
      )}
    >
      <div className="mb-2 flex items-center gap-2 font-semibold text-sky-900">
        <Route className="h-3.5 w-3.5 shrink-0" />
        {title}
        {provenance?.totalMs != null ? (
          <span className="font-normal text-sky-700/90">总耗时 {provenance.totalMs} ms</span>
        ) : null}
        {provenance?.startTime && provenance?.endTime ? (
          <span className="font-normal text-sky-700/80 truncate">
            {provenance.startTime} — {provenance.endTime}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sky-800">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{loadingLabel}</span>
          <span className="text-sky-600">① 清洗总库 → ② ARO 流水辅助</span>
        </div>
      ) : null}

      {snapLines.length > 0 ? (
        <ul className="mb-2 space-y-0.5 text-sky-800/95">
          {snapLines.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      ) : null}

      <ol className="space-y-2">
        {steps.length > 0
          ? steps.map((step, i) => (
              <li
                key={`${step.name ?? step.layer}-${i}`}
                className="flex gap-2 rounded-lg border border-sky-100 bg-white/80 px-2 py-1.5"
              >
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-semibold text-sky-900">{step.name ?? `步骤 ${i + 1}`}</p>
                  {step.table ? (
                    <p className="flex items-center gap-1 text-sky-800/90">
                      <Database className="h-3 w-3 shrink-0" />
                      {step.table}
                      {step.disposition ? ` · disposition=${step.disposition}` : ""}
                      {step.directionFilter ? ` · 进出=${step.directionFilter}` : ""}
                    </p>
                  ) : null}
                  {step.channelScope ? <p>通道：{step.channelScope}</p> : null}
                  {step.dataSource ? <p>数据源：{String(step.dataSource)}</p> : null}
                  {step.flowScope ? <p>流水范围：{step.flowScope}</p> : null}
                  {step.rawLogCount != null ? <p>原始流水条数：{step.rawLogCount}</p> : null}
                  {step.rowsScanned != null ? <p>扫描行数：{step.rowsScanned}</p> : null}
                  {step.includedEvents != null ? <p>纳入条数：{step.includedEvents}</p> : null}
                  {step.queryMs != null ? <p>查询耗时：{step.queryMs} ms</p> : null}
                  {step.note ? <p className="text-sky-700/85">{step.note}</p> : null}
                </div>
              </li>
            ))
          : mainTrace
            ? (
                <li className="flex gap-2 rounded-lg border border-sky-100 bg-white/80 px-2 py-1.5">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-semibold">清洗总库（主口径）</p>
                    <p>{mainTrace.table} · {mainTrace.directionFilter ?? "进出=无"}</p>
                    {mainTrace.queryMs != null ? <p>{mainTrace.queryMs} ms · 扫描 {mainTrace.rowsScanned}</p> : null}
                  </div>
                </li>
              )
            : null}
      </ol>

      {result?.auxiliaryFlow && steps.length === 0 ? (
        <p className="mt-1 text-sky-800/90">
          ARO 辅助：{result.auxiliaryFlow.dataSource ?? "—"}
          {result.auxiliaryFlow.flowScope ? ` · ${result.auxiliaryFlow.flowScope}` : ""}
          {result.auxiliaryFlow.rawLogCount != null ? ` · ${result.auxiliaryFlow.rawLogCount} 条` : ""}
        </p>
      ) : null}

      {summary?.metricNote ? (
        <p className="mt-2 border-t border-sky-100 pt-2 text-sky-700/90">{summary.metricNote}</p>
      ) : null}
    </div>
  );
}
