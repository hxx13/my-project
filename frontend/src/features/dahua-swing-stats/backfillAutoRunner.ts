import toast from "react-hot-toast";
import {
  executeDahuaSwingStatsTask,
  listDahuaSwingStatsTasks,
  type DahuaSwingStatsPullTask,
} from "@/api/domains/dahuaSwingStats.api";
import {
  estimateBackfillTotalSegments,
  formatBackfillProgressPct,
  fromPayload,
  isBackfillRangeComplete,
} from "./statsTaskModel";

import { appConfirm } from "@/lib/appDialog";
export type BackfillAutoProgress = {
  taskId: number;
  taskName: string;
  running: boolean;
  segmentDone: number;
  segmentTotal: number;
  totalSaved: number;
  lastSegmentSaved: number;
  lastWindow: string;
  statusText: string;
};

const MAX_AUTO_BACKFILL_SEGMENTS = 400;
const SEGMENT_PAUSE_MS = 400;

let progress: BackfillAutoProgress | null = null;
let cancelFlag = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function subscribeBackfillAuto(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBackfillAutoSnapshot(): BackfillAutoProgress | null {
  return progress;
}

export function getBackfillProgressPct(): number {
  if (!progress || progress.segmentTotal <= 0) return 0;
  return formatBackfillProgressPct(progress.segmentDone, progress.segmentTotal);
}

export function isBackfillAutoRunning(): boolean {
  return progress?.running === true;
}

export function stopBackfillAuto() {
  cancelFlag = true;
  if (progress) {
    progress = { ...progress, running: false, statusText: "已请求停止，等待当前段结束…" };
    emit();
  }
}

async function refreshTaskRow(id: number): Promise<DahuaSwingStatsPullTask | undefined> {
  const list = await listDahuaSwingStatsTasks();
  return list.find((x) => x.id === id);
}

export async function startBackfillAuto(taskId: number, taskName = "") {
  if (progress?.running) {
    toast.error("已有自动回溯在进行中");
    return;
  }
  cancelFlag = false;

  const initialRow = await refreshTaskRow(taskId);
  if (!initialRow) {
    toast.error("任务不存在");
    return;
  }
  const initialForm = fromPayload(initialRow);
  if (isBackfillRangeComplete(initialForm)) {
    if (
      !await appConfirm(
        "该任务已标记「回溯完成」，按游标将无法继续。是否改为按回溯总范围强制全量重拉（覆盖）？选「取消」则中止。"
      )
    ) {
      return;
    }
    try {
      const res = await executeDahuaSwingStatsTask(taskId, { forceOverwrite: true });
      toast.success(
        `强制全量重拉完成：入库 ${res.saved ?? 0} 条（${res.pulledStartTime ?? ""} ~ ${res.pulledEndTime ?? ""}）`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "强制拉取失败");
    }
    return;
  }

  const segmentTotal = estimateBackfillTotalSegments(initialForm);
  const name = taskName || initialRow.name || `任务#${taskId}`;

  progress = {
    taskId,
    taskName: name,
    running: true,
    segmentDone: 0,
    segmentTotal,
    totalSaved: initialForm.backfillTotalSaved,
    lastSegmentSaved: 0,
    lastWindow: "",
    statusText: "正在启动自动回溯…",
  };
  emit();

  let segmentDone = 0;
  let totalSaved = initialForm.backfillTotalSaved;

  try {
    while (!cancelFlag && segmentDone < MAX_AUTO_BACKFILL_SEGMENTS) {
      const row = await refreshTaskRow(taskId);
      if (!row) break;
      const ui = fromPayload(row);
      if (isBackfillRangeComplete(ui)) break;

      segmentDone += 1;
      progress = {
        ...progress!,
        segmentDone,
        totalSaved,
        statusText: `正在执行第 ${segmentDone}/${segmentTotal} 段…`,
      };
      emit();

      const res = await executeDahuaSwingStatsTask(taskId);
      const saved = res.saved ?? 0;
      totalSaved += saved;
      const windowText = `${res.pulledStartTime ?? ""} ~ ${res.pulledEndTime ?? ""}`;

      const rowAfter = await refreshTaskRow(taskId);
      const cumulative =
        rowAfter != null ? fromPayload(rowAfter).backfillTotalSaved : totalSaved;

      progress = {
        ...progress!,
        totalSaved: cumulative > 0 ? cumulative : totalSaved,
        lastSegmentSaved: saved,
        lastWindow: windowText,
        statusText:
          saved > 0
            ? `第 ${segmentDone} 段完成，本段 ${saved} 条，累计 ${cumulative > 0 ? cumulative : totalSaved} 条`
            : `第 ${segmentDone} 段无新数据（进度未推进）`,
      };
      emit();

      if (res.backfillComplete || (rowAfter && isBackfillRangeComplete(fromPayload(rowAfter)))) {
        progress = {
          ...progress!,
          running: false,
          segmentDone: segmentTotal,
          statusText: `全部回溯已完成，累计入库 ${cumulative > 0 ? cumulative : totalSaved} 条`,
        };
        emit();
        toast.success(`自动回溯完成：${name}，共 ${segmentDone} 段`);
        break;
      }

      if (saved === 0) {
        const hint = res.backfillHint || "本段无数据且进度未推进，已自动停止";
        progress = { ...progress!, running: false, statusText: hint };
        emit();
        toast.error(hint);
        break;
      }

      await sleep(SEGMENT_PAUSE_MS);
    }

    if (segmentDone >= MAX_AUTO_BACKFILL_SEGMENTS && !cancelFlag) {
      progress = {
        ...progress!,
        running: false,
        statusText: `已达单轮上限 ${MAX_AUTO_BACKFILL_SEGMENTS} 段`,
      };
      emit();
      toast.error(`已达单轮上限 ${MAX_AUTO_BACKFILL_SEGMENTS} 段，可再次启动继续`);
    }
    if (cancelFlag && progress) {
      progress = {
        ...progress,
        running: false,
        statusText: `已停止，已完成 ${segmentDone} 段，累计入库 ${totalSaved} 条`,
      };
      emit();
      toast.success(`已停止自动回溯（${name}）`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "自动回溯失败";
    if (progress) {
      progress = { ...progress, running: false, statusText: msg };
      emit();
    }
    toast.error(msg);
  } finally {
    if (progress?.running) {
      progress = { ...progress, running: false };
      emit();
    }
    cancelFlag = false;
  }
}
