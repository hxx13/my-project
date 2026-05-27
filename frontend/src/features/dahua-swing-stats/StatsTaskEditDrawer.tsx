import { useMemo, useState } from "react";
import { Database, Play } from "lucide-react";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminRightDrawer } from "@/components/admin/AdminRightDrawer";
import { DAILY_PERIOD_OPTIONS, type StatsPeriodMode } from "@/features/dahua-swing-stats/statsTaskModel";
import {
  StatsTaskBackfillRange,
  StatsTaskDailyDataWindow,
  StatsTaskDahuaFilters,
  StatsTaskNameEnabled,
} from "@/features/dahua-swing-stats/StatsTaskFormBlocks";
import type { useDahuaSwingStatsTasks } from "@/features/dahua-swing-stats/useDahuaSwingStatsTasks";
import { StatsTaskCleanRuleProfileSelect } from "@/features/dahua-swing-stats/StatsTaskCleanRuleProfileSelect";
import { StatsTaskAutoCleanSettings } from "@/features/dahua-swing-stats/StatsTaskAutoCleanSettings";
import { runStatsTaskCleanIngestWithToast } from "@/features/dahua-swing-stats/statsTaskCleanIngest";
import type { DahuaSwingStatsPullTask } from "@/api/domains/dahuaSwingStats.api";

type Ed = ReturnType<typeof useDahuaSwingStatsTasks>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ed: Ed;
  mode: "daily" | "backfill";
};

export function StatsTaskEditDrawer({ open, onOpenChange, ed, mode }: Props) {
  const [overrideStart, setOverrideStart] = useState("");
  const [overrideEnd, setOverrideEnd] = useState("");
  const [cleaning, setCleaning] = useState(false);

  const periodHint = useMemo(
    () => DAILY_PERIOD_OPTIONS.find((o) => o.value === ed.form.periodMode)?.hint ?? "",
    [ed.form.periodMode]
  );

  const title = ed.form.id
    ? mode === "backfill"
      ? "编辑回溯任务"
      : "编辑日批拉取任务"
    : mode === "backfill"
      ? "新建回溯任务"
      : "新建日批拉取任务";

  return (
    <AdminRightDrawer
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={title}
      description={
        mode === "daily"
          ? "日批任务：配合「定时管理」中「审计门禁·每日到点」Job，每次拉取上一日（或上周/水位）在下方刷卡时刻段内的记录。"
          : "回溯任务：配置从某日到某日的长线补数范围，仅手动执行，不参与任何定时 Job。"
      }
      footer={
        <div className="flex gap-2 w-full">
          <AdminButton className="flex-1" onClick={() => void ed.save().then(() => onOpenChange(false))}>
            保存任务
          </AdminButton>
          <AdminButton tone="secondary" onClick={() => ed.newForm()}>
            清空
          </AdminButton>
        </div>
      }
    >
      <div className="space-y-3 text-xs">
        <StatsTaskNameEnabled
          form={ed.form}
          setForm={ed.setForm}
          hideEnabled={mode === "backfill"}
          enabledHint="启用（参与定时管理中的每日审计拉取 Job）"
        />

        {mode === "daily" ? (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
            <div className="text-[11px] font-semibold text-indigo-900">日批数据策略</div>
            <label className="flex flex-col gap-1">
              模式
              <select
                className="h-9 rounded border px-2 bg-white"
                value={ed.form.periodMode}
                onChange={(e) => ed.setForm({ ...ed.form, periodMode: e.target.value as StatsPeriodMode })}
              >
                {DAILY_PERIOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[10px] text-slate-600 leading-relaxed">{periodHint}</p>
            {(ed.form.periodMode === "PREVIOUS_DAY" ||
              ed.form.periodMode === "PREVIOUS_WEEK" ||
              ed.form.periodMode === "SINCE_LAST") && <StatsTaskDailyDataWindow form={ed.form} setForm={ed.setForm} />}
          </div>
        ) : (
          <StatsTaskBackfillRange form={ed.form} setForm={ed.setForm} />
        )}

        <StatsTaskDahuaFilters ed={ed} deptRadioName={`stats-dept-${mode}`} />

        <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
          <StatsTaskCleanRuleProfileSelect
            value={ed.form.cleanRuleProfileId}
            onChange={(id) => ed.setForm({ ...ed.form, cleanRuleProfileId: id })}
          />
        </div>

        {ed.form.id ? <StatsTaskAutoCleanSettings statsTaskId={ed.form.id} /> : null}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-700">手动执行</div>
          {ed.form.id ? (
            <>
              <button
                type="button"
                className="w-full rounded bg-slate-800 text-white h-9 inline-flex items-center justify-center gap-1 disabled:opacity-50"
                disabled={ed.runningId === ed.form.id || cleaning}
                onClick={() => void (mode === "backfill" ? ed.runForceOverwrite(ed.form.id!) : ed.runByStrategy(ed.form.id!))}
              >
                <Play className="h-3.5 w-3.5" />
                {mode === "daily" ? "按日批策略执行一次" : "强制全量拉取（覆盖全范围）"}
              </button>
              {mode === "backfill" ? (
                <button
                  type="button"
                  className="w-full rounded border border-slate-300 bg-white h-9 text-xs disabled:opacity-50"
                  disabled={ed.runningId === ed.form.id || cleaning}
                  onClick={() => void ed.runBackfillNextSegment(ed.form.id!)}
                >
                  按游标执行下一段（自动连续）
                </button>
              ) : null}
              <button
                type="button"
                className="w-full rounded border border-emerald-400 bg-emerald-50 text-emerald-900 h-9 inline-flex items-center justify-center gap-1 disabled:opacity-50 hover:bg-emerald-100"
                disabled={ed.runningId === ed.form.id || cleaning}
                onClick={() => {
                  const row = ed.rows.find((r) => r.id === ed.form.id) as DahuaSwingStatsPullTask | undefined;
                  if (!row) {
                    return;
                  }
                  setCleaning(true);
                  void runStatsTaskCleanIngestWithToast(row).finally(() => setCleaning(false));
                }}
              >
                <Database className="h-3.5 w-3.5" />
                {cleaning ? "清洗入库中…" : mode === "backfill" ? "手动清洗入库（回溯全范围）" : "手动清洗入库"}
              </button>
            </>
          ) : (
            <p className="text-[10px] text-slate-500">请先保存任务</p>
          )}
          {mode === "daily" ? (
            <details className="text-[10px]">
              <summary className="cursor-pointer text-slate-600">高级：临时指定刷卡时间窗</summary>
              <div className="mt-2 space-y-2">
                <input
                  type="datetime-local"
                  className="h-9 w-full rounded border px-2 bg-white"
                  value={overrideStart}
                  onChange={(e) => setOverrideStart(e.target.value)}
                />
                <input
                  type="datetime-local"
                  className="h-9 w-full rounded border px-2 bg-white"
                  value={overrideEnd}
                  onChange={(e) => setOverrideEnd(e.target.value)}
                />
                {ed.form.id ? (
                  <button
                    type="button"
                    className="w-full rounded border h-9"
                    disabled={ed.runningId === ed.form.id}
                    onClick={() => void ed.runWithManualOverride(ed.form.id!, overrideStart, overrideEnd)}
                  >
                    按临时时间窗执行
                  </button>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </AdminRightDrawer>
  );
}
