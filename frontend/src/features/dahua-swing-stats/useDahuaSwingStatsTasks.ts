import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import toast from "react-hot-toast";
import {
  createDahuaSwingStatsTask,
  deleteDahuaSwingStatsTask,
  executeDahuaSwingStatsTask,
  listDahuaSwingStatsTasks,
  updateDahuaSwingStatsTask,
  type DahuaSwingStatsPullTask,
} from "@/api/domains/dahuaSwingStats.api";
import { replaceAccessChannelScope } from "@/api/domains/accessFusion.api";
import { fetchDahuaDepartments, fetchDahuaDeviceChannels, type DahuaDepartmentRow, type DahuaDeviceChannelRow } from "@/api/twinApi";
import { labelForChannelRow, normalizeChannelCode, useHydrateChannelNameMap } from "@/utils/dahuaChannelUtils";
import {
  fromPayload,
  isDailyTask,
  isHistoricalTask,
  mergeTaskRow,
  parsePeriodMode,
  PERIOD_MODE_LABEL,
  toApiDateTime,
  toPayload,
  type StatsPeriodMode,
  type StatsUiForm,
} from "./statsTaskModel";
import {
  getBackfillAutoSnapshot,
  getBackfillProgressPct,
  startBackfillAuto,
  stopBackfillAuto,
  subscribeBackfillAuto,
  type BackfillAutoProgress,
} from "./backfillAutoRunner";

export type { BackfillAutoProgress };

export type StatsTaskPageKind = "daily" | "backfill";

export function useDahuaSwingStatsTasks(kind: StatsTaskPageKind, defaultForm: () => StatsUiForm) {
  const loadToastShown = useRef(false);
  const [loading, setLoading] = useState(false);
  const [allRows, setAllRows] = useState<DahuaSwingStatsPullTask[]>([]);
  const [form, setForm] = useState<StatsUiForm>(defaultForm);
  const [channelKeyword, setChannelKeyword] = useState("");
  const [channelOptions, setChannelOptions] = useState<DahuaDeviceChannelRow[]>([]);
  const [channelLabelExtra, setChannelLabelExtra] = useState<Record<string, string>>({});
  const [channelLoaded, setChannelLoaded] = useState(false);
  const [deptKeyword, setDeptKeyword] = useState("");
  const [deptOptions, setDeptOptions] = useState<DahuaDepartmentRow[]>([]);
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
  const [expandedDeptIds, setExpandedDeptIds] = useState<Set<number>>(new Set());
  const [runningId, setRunningId] = useState<number | null>(null);
  const autoProgress = useSyncExternalStore(subscribeBackfillAuto, getBackfillAutoSnapshot, () => null);
  const backfillProgressPct = useSyncExternalStore(subscribeBackfillAuto, getBackfillProgressPct, () => 0);

  const rows = useMemo(() => {
    return allRows.filter((r) => (kind === "backfill" ? isHistoricalTask(r) : isDailyTask(r)));
  }, [allRows, kind]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAllRows(await listDahuaSwingStatsTasks());
    } catch (e) {
      if (!loadToastShown.current) {
        loadToastShown.current = true;
        toast.error(e instanceof Error ? e.message : "加载任务列表失败");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 自动回溯在后台跑时定期刷新列表（切页后仍更新进度列）
  useEffect(() => {
    if (kind !== "backfill" || !autoProgress?.running) return;
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [kind, autoProgress?.running, load]);

  const loadChannels = async (keyword: string) => {
    try {
      const res = await fetchDahuaDeviceChannels({ page: 1, pageSize: 200, keyword: keyword.trim() });
      setChannelOptions(res.list || []);
      setChannelLoaded(true);
    } catch {
      setChannelOptions([]);
    }
  };

  const loadDepartments = async (keyword: string) => {
    try {
      const res = await fetchDahuaDepartments(1, 500, keyword.trim());
      setDeptOptions(res.list || []);
      const rootIds = new Set<number>();
      for (const d of res.list || []) {
        if (typeof d.id === "number") rootIds.add(d.id);
      }
      setExpandedDeptIds(rootIds);
    } catch {
      setDeptOptions([]);
    }
  };

  useEffect(() => {
    if (!channelLoaded) return;
    const timer = window.setTimeout(() => void loadChannels(channelKeyword), 250);
    return () => window.clearTimeout(timer);
  }, [channelKeyword, channelLoaded]);

  useEffect(() => {
    if (!deptDropdownOpen) return;
    const timer = window.setTimeout(() => void loadDepartments(deptKeyword), 250);
    return () => window.clearTimeout(timer);
  }, [deptKeyword, deptDropdownOpen]);

  const channelLabelByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const ch of channelOptions) {
      const code = normalizeChannelCode(ch.channelCode);
      if (code) m.set(code, labelForChannelRow(ch));
    }
    for (const [code, label] of Object.entries(channelLabelExtra)) {
      if (code && !m.has(code)) m.set(code, label);
    }
    return m;
  }, [channelOptions, channelLabelExtra]);

  const channelNameMap = useMemo(() => Object.fromEntries(channelLabelByCode), [channelLabelByCode]);

  useHydrateChannelNameMap(form.channelCodes, channelNameMap, setChannelLabelExtra, fetchDahuaDeviceChannels, true);

  const hydrateDeptKeyword = async (deptId: string) => {
    const id = (deptId || "").trim();
    if (!id) {
      setDeptKeyword("");
      return;
    }
    try {
      const res = await fetchDahuaDepartments(1, 100, id);
      const hit = (res.list || []).find((d) => String(d.id) === id);
      const name = (hit?.name || hit?.deptName || "").trim();
      setDeptKeyword(name ? `${name} / ${id}` : id);
    } catch {
      setDeptKeyword(id);
    }
  };

  const applyRowToForm = (row: DahuaSwingStatsPullTask) => {
    const next = fromPayload(row);
    setForm(next);
    setChannelLabelExtra({});
    void hydrateDeptKeyword(next.deptIds);
    if (next.channelCodes.length > 0 && !channelLoaded) {
      void loadChannels("");
    }
  };

  const forcePeriod: StatsPeriodMode | undefined = kind === "backfill" ? "HISTORICAL_RANGE" : undefined;

  const save = async () => {
    if (!form.name.trim()) return toast.error("任务名不能为空");
    if (
      form.channelCodes.length === 0 &&
      !form.deptIds.trim() &&
      !form.personCode.trim() &&
      !form.personName.trim() &&
      form.openType === "" &&
      form.enterOrExit === "" &&
      form.openResult === ""
    ) {
      return toast.error("至少配置一个大华筛选条件");
    }
    if (kind === "backfill") {
      if (!form.historyStart || !form.historyEnd) {
        return toast.error("请填写回溯总范围的开始与结束时间");
      }
    }
    try {
      const body = toPayload(form, forcePeriod);
      let taskId = form.id ?? null;
      if (form.id != null) {
        taskId = form.id;
        await updateDahuaSwingStatsTask(taskId, body);
        toast.success("已更新");
        setAllRows((prev) => prev.map((r) => (r.id === taskId ? mergeTaskRow(r, body, taskId) : r)));
        if (kind === "backfill") setForm((f) => ({ ...f, enabled: 0 }));
      } else {
        const created = await createDahuaSwingStatsTask(body);
        taskId = created.id ?? null;
        toast.success("已创建");
        setAllRows((prev) => [created, ...prev]);
        setForm(fromPayload(created));
      }
      if (taskId && form.channelCodes.length > 0) {
        await replaceAccessChannelScope(
          taskId,
          form.channelCodes.map((code) => ({ channelCode: code }))
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const refreshTaskRow = async (id: number) => {
    const list = await listDahuaSwingStatsTasks();
    setAllRows(list);
    const row = list.find((x) => x.id === id);
    if (row && form.id === id) applyRowToForm(row);
    return row;
  };

  const runTask = async (
    id: number,
    opts?: { startTime?: string; endTime?: string; silent?: boolean; forceOverwrite?: boolean }
  ) => {
    setRunningId(id);
    try {
      const res = await executeDahuaSwingStatsTask(id, {
        startTime: opts?.startTime,
        endTime: opts?.endTime,
        forceOverwrite: opts?.forceOverwrite,
      });
      const modeLabel =
        res.effectivePeriodMode === "FORCE_OVERWRITE"
          ? "强制全量覆盖"
          : res.effectivePeriodMode === "MANUAL"
            ? "自定义一次性"
            : PERIOD_MODE_LABEL[parsePeriodMode(res.periodMode)] || res.periodMode || "—";
      let msg = `[${modeLabel}] 已入库 ${res.saved} 条（${res.pulledStartTime} ~ ${res.pulledEndTime}）`;
      if (res.forceSegments != null && res.forceSegments > 0) {
        msg += `；共 ${res.forceSegments} 段`;
        if (res.forceSegmentsNoData) {
          msg += `（其中 ${res.forceSegmentsNoData} 段大华无数据）`;
        }
      }
      if (res.forceNote) {
        msg += `；${res.forceNote}`;
      }
      if (res.apiStartSwingTime && res.apiEndSwingTime) {
        msg += `；大华刷卡窗 ${res.apiStartSwingTime} ~ ${res.apiEndSwingTime}`;
      }
      if (res.autoCleanTriggered === true) {
        msg += `；自动清洗入库 ${res.cleanIncludedTotal ?? 0} 条（${res.cleanChannelCount ?? "?"} 通道）`;
      } else if (res.autoCleanSkippedReason) {
        const reason =
          res.autoCleanSkippedReason === "NO_ENABLED_CHANNELS"
            ? "未解析到清洗通道（请保存任务并勾选通道或先执行拉取）"
            : res.autoCleanSkippedReason === "AUTO_CLEAN_DISABLED"
              ? "任务未开启拉取后自动清洗"
              : String(res.autoCleanSkippedReason);
        msg += `；自动清洗未执行：${reason}`;
      } else if (res.autoCleanError) {
        msg += `；自动清洗失败：${res.autoCleanError}`;
      }
      if (res.manualOverrideNote) {
        msg += `；${res.manualOverrideNote}`;
      } else if (res.backfillComplete) {
        msg += "；历史回溯已全部完成";
      } else if (res.backfillHint) {
        msg += `；${res.backfillHint}`;
      } else if (res.backfillCursor && res.periodMode === "HISTORICAL_RANGE") {
        msg += `；下一段从 ${res.backfillCursor} 继续`;
      }
      if (!opts?.silent) toast.success(msg);
      await refreshTaskRow(id);
      return res;
    } catch (e) {
      if (!opts?.silent) toast.error(e instanceof Error ? e.message : "执行失败");
      throw e;
    } finally {
      setRunningId(null);
    }
  };

  /** 回溯：按 historyStart~historyEnd 全范围强制分段重拉（忽略游标/已完成标记） */
  const runForceOverwrite = async (id: number) => {
    const row = allRows.find((r) => r.id === id);
    const ui = row ? fromPayload(row) : null;
    if (ui && (!ui.historyStart || !ui.historyEnd)) {
      return toast.error("请先保存回溯总范围（开始/结束时间）");
    }
    if (
      !window.confirm(
        "将按任务配置的回溯总时间范围，分段从大华强制重拉并 upsert 覆盖已有记录（不推进游标）。范围较大时可能耗时数分钟，是否继续？"
      )
    ) {
      return;
    }
    await runTask(id, { forceOverwrite: true });
  };

  const runByStrategy = async (id: number) => {
    if (kind === "backfill") {
      await runForceOverwrite(id);
      return;
    }
    await runTask(id);
  };

  /** 回溯：仅执行下一段（按 backfillCursor 推进，与旧「自动连续」相同） */
  const runBackfillNextSegment = async (id: number) => {
    const row = allRows.find((r) => r.id === id);
    void startBackfillAuto(id, row?.name || "");
  };

  const runBackfillAuto = (id: number) => {
    const row = allRows.find((r) => r.id === id);
    void startBackfillAuto(id, row?.name || "");
  };

  const runWithManualOverride = async (id: number, overrideStart: string, overrideEnd: string) => {
    const start = toApiDateTime(overrideStart);
    const end = toApiDateTime(overrideEnd);
    if (!start || !end) return toast.error("请填写自定义拉取起止时间");
    const s = new Date(start.replace(" ", "T"));
    const e = new Date(end.replace(" ", "T"));
    const days = Math.ceil((e.getTime() - s.getTime()) / 86400000);
    if (days > 31) {
      return toast.error(`自定义跨度约 ${days} 天，超过 31 天上限`);
    }
    await runTask(id, { startTime: start, endTime: end });
  };

  const remove = async (id: number) => {
    if (!confirm("删除该任务？")) return;
    try {
      await deleteDahuaSwingStatsTask(id);
      setAllRows((prev) => prev.filter((r) => r.id !== id));
      if (form.id === id) setForm(defaultForm());
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const resetBackfillCursor = () => {
    if (!confirm("将回溯进度重置为历史开始时间，下次从第一段重新拉取。确认？")) return;
    setForm((p) => ({ ...p, backfillCursor: "", backfillTotalSaved: 0 }));
    toast.success("已清除进度，保存任务后生效");
  };

  const newForm = () => {
    setForm(defaultForm());
    setChannelLabelExtra({});
    setDeptKeyword("");
  };

  return {
    loading,
    rows,
    form,
    setForm,
    channelKeyword,
    setChannelKeyword,
    channelOptions,
    channelLabelByCode,
    setChannelLabelExtra,
    channelLoaded,
    setChannelLoaded: () => {
      void loadChannels("");
    },
    loadChannels,
    deptKeyword,
    setDeptKeyword,
    deptOptions,
    deptDropdownOpen,
    setDeptDropdownOpen,
    expandedDeptIds,
    setExpandedDeptIds,
    runningId,
    autoProgress,
    backfillProgressPct,
    applyRowToForm,
    save,
    runByStrategy,
    runForceOverwrite,
    runBackfillNextSegment,
    runBackfillAuto,
    stopBackfillAuto: stopBackfillAuto,
    runWithManualOverride,
    remove,
    resetBackfillCursor,
    newForm,
    loadDepartments,
  };
}
