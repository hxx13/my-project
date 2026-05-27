import toast from "react-hot-toast";
import { executeAccessClean, listAccessChannelScope } from "@/api/domains/accessFusion.api";
import type { DahuaSwingStatsPullTask } from "@/api/domains/dahuaSwingStats.api";
import {
  fromApiDateTime,
  isHistoricalTask,
  parseBackfillFromTask,
  resolveCleanDataWindow,
  toApiDateTime,
} from "@/features/dahua-swing-stats/statsTaskModel";

export type DailyCleanLedgerEntry = {
  coverageDay?: string;
  channelCode?: string;
  windowStart?: string;
  windowEnd?: string;
  totalScanned?: number;
  includedCount?: number;
  excludedCount?: number;
  truncated?: boolean;
  executionLogId?: number;
  status?: string;
  error?: string;
};

export type StatsTaskCleanIngestResult = {
  channelCount: number;
  dayCount: number;
  includedTotal: number;
  scannedTotal: number;
  windowLabel: string;
  dailyLedger: DailyCleanLedgerEntry[];
  batchSummaryLogId?: number;
  truncatedSegments: number;
};

/** 任务通道漏斗已启用通道；回溯任务可回退表单内配置的通道列表（不回退全局通道） */
export async function resolveEnabledChannelsForStatsTask(
  taskId: number,
  task?: DahuaSwingStatsPullTask
): Promise<string[]> {
  const codes: string[] = [];
  try {
    const scope = await listAccessChannelScope(taskId);
    for (const c of scope) {
      if (c.enabled !== 0 && c.channelCode?.trim()) {
        codes.push(c.channelCode.trim());
      }
    }
  } catch {
    /* ignore */
  }
  if (codes.length > 0) {
    return [...new Set(codes)];
  }
  const form = task ? parseBackfillFromTask(task) : null;
  if (form?.channelCodes?.length) {
    return [...new Set(form.channelCodes.map((c) => c.trim()).filter(Boolean))];
  }
  return [];
}

function resolveCleanWindow(task: DahuaSwingStatsPullTask): { start: string; end: string; label: string } {
  let { startTime, endTime } = resolveCleanDataWindow(task);
  if (!startTime && task.lastPulledStart) {
    startTime = fromApiDateTime(task.lastPulledStart);
  }
  if (!endTime && task.lastPulledEnd) {
    endTime = fromApiDateTime(task.lastPulledEnd);
  }
  const start = toApiDateTime(startTime);
  const end = toApiDateTime(endTime);
  const label =
    isHistoricalTask(task) && startTime && endTime
      ? `${startTime.replace("T", " ")} ~ ${endTime.replace("T", " ")}`
      : task.lastPulledStart && task.lastPulledEnd
        ? `${task.lastPulledStart} ~ ${task.lastPulledEnd}`
        : "";
  return { start, end, label };
}

/**
 * 按自然日×通道清洗入库（后端拆分，逐日写执行日志，同任务+通道+覆盖日 upsert 防重复）。
 */
export async function runStatsTaskCleanIngest(
  task: DahuaSwingStatsPullTask,
  onProgress?: (done: number, total: number, label?: string) => void
): Promise<StatsTaskCleanIngestResult> {
  const taskId = task.id;
  if (!taskId) {
    throw new Error("请先保存任务");
  }
  const { start, end, label } = resolveCleanWindow(task);
  if (!start || !end) {
    throw new Error("无法确定清洗时间窗：请配置回溯起止日期时刻或先执行至少一段拉取");
  }
  const channels = await resolveEnabledChannelsForStatsTask(taskId, task);
  if (channels.length === 0) {
    throw new Error("未配置已启用清洗通道，请在任务中配置通道漏斗或在门禁数据工作台 · 统计清洗启用通道");
  }

  const profileId = parseBackfillFromTask(task).cleanRuleProfileId;
  onProgress?.(0, channels.length, `按 ${channels.length} 个通道 × 逐日入库…`);

  const batch = (await executeAccessClean({
    statsTaskId: taskId,
    scopeMode: "SELECTED_TASK",
    startTime: start,
    endTime: end,
    cleanRuleProfileId: profileId > 0 ? profileId : undefined,
    splitByDay: true,
  })) as unknown as {
    dayCount?: number;
    channelCount?: number;
    includedTotal?: number;
    scannedTotal?: number;
    truncatedSegments?: number;
    dailyLedger?: DailyCleanLedgerEntry[];
    batchSummaryLog?: { id?: number };
  };

  onProgress?.(channels.length, channels.length);
  return {
    channelCount: batch.channelCount ?? channels.length,
    dayCount: batch.dayCount ?? 0,
    includedTotal: batch.includedTotal ?? 0,
    scannedTotal: batch.scannedTotal ?? 0,
    windowLabel: label,
    dailyLedger: batch.dailyLedger ?? [],
    batchSummaryLogId: batch.batchSummaryLog?.id,
    truncatedSegments: batch.truncatedSegments ?? 0,
  };
}

export async function runStatsTaskCleanIngestWithToast(task: DahuaSwingStatsPullTask): Promise<boolean> {
  const taskId = task.id;
  if (!taskId) {
    toast.error("请先保存任务");
    return false;
  }
  const toastId = toast.loading(`按日清洗入库中（任务 #${taskId}）…`);
  try {
    const res = await runStatsTaskCleanIngest(task, (done, total, label) => {
      toast.loading(`${label ?? "处理中"}（${done}/${total}）`, { id: toastId });
    });
    const failN = res.dailyLedger.filter((e) => e.status === "FAILED").length;
    toast.success(
      `入库完成：${res.dayCount} 个自然日 × ${res.channelCount} 通道 · 纳入 ${res.includedTotal} 条${failN ? ` · ${failN} 段失败` : ""}${res.truncatedSegments ? ` · ${res.truncatedSegments} 段可能截断` : ""}`,
      { id: toastId, duration: 10000 }
    );
    return true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "清洗入库失败", { id: toastId });
    return false;
  }
}
