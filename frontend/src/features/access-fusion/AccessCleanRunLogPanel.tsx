import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, RotateCcw, Trash2 } from "lucide-react";
import type { AccessSwingCleanRunRow, CleanConfigSummary } from "@/api/domains/accessFusion.api";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";

import { appConfirm } from "@/lib/appDialog";
function triggerLabel(t: string) {
  if (t === "SCHEDULED") return "定时";
  if (t === "RERUN") return "重跑";
  return "手动";
}

function statusBadge(status: string) {
  if (status === "SUPERSEDED") return { text: "已覆盖", className: "bg-amber-100 text-amber-800" };
  if (status === "DONE") return { text: "完成", className: "bg-emerald-100 text-emerald-800" };
  if (status === "FAILED") return { text: "失败", className: "bg-rose-100 text-rose-800" };
  return { text: status, className: "bg-slate-100 text-slate-600" };
}

type Props = {
  runs: AccessSwingCleanRunRow[];
  loading: boolean;
  selectedRunId: number | null;
  configSummary: CleanConfigSummary | null;
  rerunningId: number | null;
  deletingId: number | null;
  onSelectRun: (runId: number) => void;
  onRerun?: (runId: number) => void;
  onDelete?: (runId: number) => void;
};

export function AccessCleanRunLogPanel({
  runs,
  loading,
  selectedRunId,
  configSummary,
  rerunningId,
  deletingId,
  onSelectRun,
  onRerun,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(true);
  const latest = runs[0];
  const latestBadge = latest ? statusBadge(latest.status) : null;

  return (
    <div className="rounded-lg border bg-slate-50/80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/60 rounded-lg transition"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-indigo-600" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        )}
        <span className="text-sm font-semibold text-slate-800">清洗运行日志</span>
        {!open && latest ? (
          <span className="text-[11px] text-slate-500 truncate">
            最近 #{latest.id} · {triggerLabel(latest.triggerType)} · 纳入 {latest.includedCount ?? 0}
            {selectedRunId === latest.id ? " · 已选中" : ""}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">{open ? "点击收起" : `共 ${runs.length} 条`}</span>
        )}
        {!open && latestBadge ? (
          <span className={cn("ml-auto text-[10px] rounded px-1.5 py-0.5 shrink-0", latestBadge.className)}>
            {latestBadge.text}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="border-t border-slate-200 px-3 pb-3 pt-2 space-y-3">
          <p className="text-[11px] text-slate-500">点击行查看该批次明细；删除将移除本批次日志及仅由本批次写入的总库行。</p>

          {loading ? (
            <p className="text-xs text-slate-400 py-3 text-center flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载运行记录…
            </p>
          ) : runs.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center rounded border border-dashed bg-white">
              暂无运行记录，试算后点击「入库总库」将产生第一条日志
            </p>
          ) : (
            <AdminDataTableWrap scrollable className="max-h-56">
              <table className="w-full text-xs">
                <thead className="bg-white text-slate-600 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">批次</th>
                    <th className="px-2 py-1.5 text-left font-medium">开始时间</th>
                    <th className="px-2 py-1.5 text-left font-medium">触发</th>
                    <th className="px-2 py-1.5 text-right font-medium">纳入</th>
                    <th className="px-2 py-1.5 text-right font-medium">排除</th>
                    <th className="px-2 py-1.5 text-left font-medium">状态</th>
                    <th className="px-2 py-1.5 text-right font-medium w-[140px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const selected = selectedRunId === run.id;
                    const badge = statusBadge(run.status);
                    const busy = deletingId === run.id || rerunningId === run.id;
                    return (
                      <tr
                        key={run.id}
                        className={cn(
                          "border-t cursor-pointer transition",
                          selected ? "bg-indigo-50" : "bg-white hover:bg-slate-50"
                        )}
                        onClick={() => onSelectRun(run.id)}
                      >
                        <td className="px-2 py-2 font-semibold text-slate-800">#{run.id}</td>
                        <td className="px-2 py-2 text-slate-600 whitespace-nowrap">
                          {run.startedAt?.replace("T", " ").slice(0, 19) ?? "-"}
                        </td>
                        <td className="px-2 py-2 text-slate-600">{triggerLabel(run.triggerType)}</td>
                        <td className="px-2 py-2 text-right text-emerald-700">{run.includedCount ?? 0}</td>
                        <td className="px-2 py-2 text-right text-slate-500">{run.excludedCount ?? 0}</td>
                        <td className="px-2 py-2">
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px]", badge.className)}>{badge.text}</span>
                        </td>
                        <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1">
                            {onRerun ? (
                              <button
                                type="button"
                                disabled={busy}
                                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] hover:bg-slate-50 disabled:opacity-50"
                                onClick={() => onRerun(run.id)}
                              >
                                {rerunningId === run.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin inline" />
                                ) : (
                                  <RotateCcw className="h-3 w-3 inline" />
                                )}
                              </button>
                            ) : null}
                            {onDelete ? (
                              <button
                                type="button"
                                disabled={busy}
                                className="rounded border border-rose-200 bg-white px-1.5 py-0.5 text-[10px] text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                title="删除本批次"
                                onClick={async () => {
                                  if (!await appConfirm(`确定删除运行 #${run.id} 吗？将同时删除仅由本批次写入的总库行。`)) {
                                    return;
                                  }
                                  onDelete(run.id);
                                }}
                              >
                                {deletingId === run.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin inline" />
                                ) : (
                                  <Trash2 className="h-3 w-3 inline" />
                                )}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </AdminDataTableWrap>
          )}

          {selectedRunId && configSummary ? (
            <div className="rounded-md border border-indigo-100 bg-indigo-50/40 px-3 py-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-indigo-900">运行 #{selectedRunId} 当时配置</span>
                {onRerun ? (
                  <button
                    type="button"
                    disabled={rerunningId === selectedRunId}
                    className="ml-auto inline-flex items-center gap-1 rounded border border-indigo-200 bg-white px-2 py-0.5 text-[11px] text-indigo-800 disabled:opacity-50"
                    onClick={() => onRerun(selectedRunId)}
                  >
                    {rerunningId === selectedRunId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    按当前筛选重跑
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip label={configSummary.requireMappingLabel} />
                <Chip label={configSummary.openSuccessOnlyLabel} />
                <Chip label={configSummary.incrementalOnlyLabel} />
                {configSummary.swingDirectionFilterLabel ? (
                  <Chip label={configSummary.swingDirectionFilterLabel} />
                ) : null}
                {configSummary.debounceLabel ? <Chip label={configSummary.debounceLabel} /> : null}
                {configSummary.incrementalAfterTime ? (
                  <Chip label={`游标自 ${configSummary.incrementalAfterTime.replace("T", " ")}`} />
                ) : null}
                {configSummary.statsTaskId ? (
                  <Chip label={`任务 #${configSummary.statsTaskId}`} />
                ) : null}
                {configSummary.queryEffectiveStart || configSummary.queryEffectiveEnd ? (
                  <Chip
                    label={`查询窗 ${(configSummary.queryEffectiveStart || configSummary.dataWindowStart || "…").replace("T", " ")} ~ ${(configSummary.queryEffectiveEnd || configSummary.dataWindowEnd || "…").replace("T", " ")}`}
                  />
                ) : configSummary.dataWindowStart || configSummary.dataWindowEnd ? (
                  <Chip
                    label={`数据窗 ${(configSummary.dataWindowStart || "…").replace("T", " ")} ~ ${(configSummary.dataWindowEnd || "…").replace("T", " ")}`}
                  />
                ) : configSummary.startTime || configSummary.endTime ? (
                  <Chip label={`时间 ${configSummary.startTime || "…"} ~ ${configSummary.endTime || "…"}`} />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[10px] text-slate-700">
      {label}
    </span>
  );
}
