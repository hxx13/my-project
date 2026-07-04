import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchScheduleJobs,
  runScheduleJobNow,
  updateScheduleJob,
} from "@/api/domains/schedule.api";
import type { JobRunOutcome, ScheduleJobRow } from "@/api/domains/schedule.api";
import {
  executeDahuaSwingTask,
  listDahuaSwingTasks,
  updateDahuaSwingTask,
  type DahuaSwingTask,
} from "@/api/domains/dahuaSwing.api";
import {
  executeDahuaSwingStatsTask,
  listDahuaSwingStatsTasks,
  updateDahuaSwingStatsTask,
  type DahuaSwingStatsPullTask,
} from "@/api/domains/dahuaSwingStats.api";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import DataSkeleton from "@/components/ui/DataSkeleton";
import {
  STATS_PULL_SCHEDULE_JOB,
  STATS_PULL_SCHEDULE_SECTIONS,
} from "@/features/dahua-swing-stats/statsPullScheduleJobs";
import { isHistoricalTask, PERIOD_MODE_LABEL, parsePeriodMode } from "@/features/dahua-swing-stats/statsTaskModel";
import type { StatsPeriodMode } from "@/features/dahua-swing-stats/statsTaskModel";

const weekOptions = [
  { id: 1, label: "周一" },
  { id: 2, label: "周二" },
  { id: 3, label: "周三" },
  { id: 4, label: "周四" },
  { id: 5, label: "周五" },
  { id: 6, label: "周六" },
  { id: 7, label: "周日" },
];

type EditState = Record<string, ScheduleJobRow>;
type DahuaEditState = Record<number, { enabled: number; pollIntervalSeconds: number; weekDays: string; startTime: string; endTime: string }>;
type StatsEditState = Record<number, { enabled: number }>;

const TELEMETRY_WINCC_UI_KEY = "TELEMETRY_WINCC_UI";
const TELEMETRY_WINCC_POLL_KEYS = new Set([TELEMETRY_WINCC_UI_KEY, "TELEMETRY_WINCC_LIMITS_UI"]);

const DEPRECATED_JOB_KEYS = new Set([
  "ACCESS_RAW_BACKFILL",
  "ACCESS_EVENT_CLEAN_DAILY",
  "ACCESS_EVENT_CLEAN_INCREMENTAL",
  "DAHUA_SWING_STATS_PULL",
]);

const PLATFORM_POLL_KEYS = new Set(["ARO_PENETRATION_POLL"]);
const RANKING_POLL_KEYS = new Set(["DASHBOARD_RANKING_ACTIVITY", "DASHBOARD_RANKING_ANIMAL"]);
const ALL_POLL_KEYS = new Set([...PLATFORM_POLL_KEYS, ...RANKING_POLL_KEYS]);
const FREEZE_KEYS = new Set(["RUN_REAPER", "RUN_REAPER_SECOND", "DAILY_EXEMPT_RESET", "STRANDED_VIOLATION_CHECK", "STRANDED_SIGNOUT_CHECK"]);
const DAILY_EXEMPT_RESET_KEY = "DAILY_EXEMPT_RESET";
const SINGLE_KEYS = new Set([
  "ORDER_SYNC",
  "ORDER_SYNC_FULL",
  "PERSONNEL_SYNC_ALL",
  "GROUP_RECALC",
  "MODEL_RECALC",
  "ROOM_MAPPING_REFRESH",
  "DAHUA_GROUP_REFRESH",
  "DAHUA_CHANNEL_REFRESH",
  "DAHUA_DEPT_REFRESH",
  "ACCESS_CLEAN_PACKAGE_DAILY",
  STATS_PULL_SCHEDULE_JOB.PREVIOUS_DAY,
  STATS_PULL_SCHEDULE_JOB.PREVIOUS_WEEK,
  STATS_PULL_SCHEDULE_JOB.SINCE_LAST,
  ...Array.from(FREEZE_KEYS),
  "CAGE_SPECIAL_STATUS_SCAN",
  "EXP_RECONCILE",
]);

const WINCC_POLL_KEYS = TELEMETRY_WINCC_POLL_KEYS;
const SCHEDULE_JOBS_KEY = ["scheduleJobs"] as const;
const DAHUA_TASKS_KEY = ["dahuaSwingTasks"] as const;
const STATS_TASKS_KEY = ["dahuaSwingStatsTasks"] as const;

export default function AdminScheduleManagerPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<EditState>({});
  const [dahuaDraft, setDahuaDraft] = useState<DahuaEditState>({});
  const [statsDraft, setStatsDraft] = useState<StatsEditState>({});
  const [savingKey, setSavingKey] = useState<string>("");
  const dahuaInit = useRef(false);
  const statsInit = useRef(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: SCHEDULE_JOBS_KEY,
    queryFn: async () => {
      const list = await fetchScheduleJobs();
      return list.map(normalizeScheduleRow).filter((r) => !DEPRECATED_JOB_KEYS.has(r.jobKey));
    },
    placeholderData: (prev) => prev,
  });

  const { data: dahuaRows = [] } = useQuery({
    queryKey: DAHUA_TASKS_KEY,
    queryFn: listDahuaSwingTasks,
  });

  const { data: statsRows = [] } = useQuery({
    queryKey: STATS_TASKS_KEY,
    queryFn: async () => {
      const tasks = await listDahuaSwingStatsTasks();
      return tasks.filter((t) => !isHistoricalTask(t));
    },
  });

  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const list = await fetchScheduleJobs();
        const normalized = list.map(normalizeScheduleRow).filter((r) => !DEPRECATED_JOB_KEYS.has(r.jobKey));
        qc.setQueryData(SCHEDULE_JOBS_KEY, normalized);
      } catch {
        /* silent polling */
      }
    }, 15000);
    return () => window.clearInterval(id);
  }, [qc]);

  useEffect(() => {
    setDraft((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        const cur = next[r.jobKey];
        if (!cur) {
          next[r.jobKey] = r;
        } else {
          next[r.jobKey] = mergeScheduleStatus(cur, r);
        }
      }
      return next;
    });
  }, [rows]);

  useEffect(() => {
    if (dahuaRows.length === 0 || dahuaInit.current) return;
    const ds: DahuaEditState = {};
    for (const t of dahuaRows) {
      if (!t.id) continue;
      const query = parseTaskQuery(t.queryJson);
      ds[t.id] = {
        enabled: t.enabled ?? 0,
        pollIntervalSeconds: Number(t.pollIntervalSeconds || 60),
        weekDays: normalizeWeekDays(query.execWeekDays),
        startTime: normalizeTime(query.execStartTime, "07:00"),
        endTime: normalizeTime(query.execEndTime, "22:00"),
      };
    }
    setDahuaDraft(ds);
    dahuaInit.current = true;
  }, [dahuaRows]);

  useEffect(() => {
    if (statsRows.length === 0 || statsInit.current) return;
    const ss: StatsEditState = {};
    for (const t of statsRows) {
      if (!t.id) continue;
      ss[t.id] = { enabled: t.enabled ?? 0 };
    }
    setStatsDraft(ss);
    statsInit.current = true;
  }, [statsRows]);

  const exceptions = useMemo(
    () => ["流水线页面中的强制同步ARO流水", "房卡调度页面中的强制同步流水（独立定时，不在此处配置）"],
    []
  );
  const singleRows = useMemo(() => rows.filter((r) => SINGLE_KEYS.has(r.jobKey)), [rows]);
  const rangeRows = useMemo(() => rows.filter((r) => !SINGLE_KEYS.has(r.jobKey)), [rows]);
  const freezeRows = useMemo(() => singleRows.filter((r) => FREEZE_KEYS.has(r.jobKey)), [singleRows]);
  const singleGroups = useMemo(
    () => [
      {
        title: "门禁统计（每日到点）",
        keys: new Set([
          "ACCESS_CLEAN_PACKAGE_DAILY",
          STATS_PULL_SCHEDULE_JOB.PREVIOUS_DAY,
          STATS_PULL_SCHEDULE_JOB.PREVIOUS_WEEK,
          STATS_PULL_SCHEDULE_JOB.SINCE_LAST,
        ]),
      },
      {
        title: "孪生·经验值与空间",
        keys: new Set(["EXP_RECONCILE", "GROUP_RECALC", "MODEL_RECALC"]),
      },
      {
        title: "同步与落库",
        keys: new Set(["ORDER_SYNC", "ORDER_SYNC_FULL", "PERSONNEL_SYNC_ALL", "ROOM_MAPPING_REFRESH"]),
      },
      {
        title: "大华缓存",
        keys: new Set(["DAHUA_GROUP_REFRESH", "DAHUA_CHANNEL_REFRESH", "DAHUA_DEPT_REFRESH"]),
      },
      {
        title: "笼架管理",
        keys: new Set(["CAGE_SPECIAL_STATUS_SCAN"]),
      },
    ],
    []
  );
  const accessPipelineSchedule = useMemo(() => {
    const rowOf = (key: string) => draft[key] ?? rows.find((r) => r.jobKey === key);
    const clean = rowOf("ACCESS_CLEAN_PACKAGE_DAILY");
    const pulls = STATS_PULL_SCHEDULE_SECTIONS.map((s) => {
      const row = rowOf(s.jobKey);
      return {
        ...s,
        scheduleTime: row?.scheduleTime ?? "02:00",
        enabled: (row?.enabled ?? 0) === 1,
      };
    });
    return {
      pulls,
      cleanTime: clean?.scheduleTime ?? "03:00",
      cleanEnabled: (clean?.enabled ?? 0) === 1,
    };
  }, [draft, rows]);

  const statsRowsByPeriod = useMemo(() => {
    const map = new Map<StatsPeriodMode, DahuaSwingStatsPullTask[]>();
    for (const s of STATS_PULL_SCHEDULE_SECTIONS) {
      map.set(s.periodMode, []);
    }
    for (const r of statsRows) {
      const mode = parsePeriodMode(r.periodMode);
      if (mode === "HISTORICAL_RANGE") continue;
      const list = map.get(mode);
      if (list) list.push(r);
    }
    return map;
  }, [statsRows]);

  const singleGroupedRows = useMemo(
    () =>
      singleGroups
        .map((g) => ({ title: g.title, rows: singleRows.filter((r) => g.keys.has(r.jobKey)) }))
        .filter((g) => g.rows.length > 0),
    [singleGroups, singleRows]
  );
  const rangeGroupedRows = useMemo(
    () =>
      [
        {
          title: "动物房 WinCC（窗口 + 轮询秒）",
          rows: rangeRows.filter((r) => WINCC_POLL_KEYS.has(r.jobKey)),
        },
        {
          title: "ARO 渗透（窗口 + 轮询秒）",
          rows: rangeRows.filter((r) => PLATFORM_POLL_KEYS.has(r.jobKey)),
        },
        {
          title: "大屏排行榜刷新（窗口 + 轮询秒）",
          rows: rangeRows.filter((r) => RANKING_POLL_KEYS.has(r.jobKey)),
        },
      ].filter((g) => g.rows.length > 0),
    [rangeRows]
  );

  const updateDraft = (jobKey: string, patch: Partial<ScheduleJobRow>) => {
    setDraft((prev) => ({ ...prev, [jobKey]: { ...prev[jobKey], ...patch } }));
  };

  const toggleWeek = (jobKey: string, day: number) => {
    const cur = draft[jobKey];
    const selected = new Set((cur.weekDays || "").split(",").filter(Boolean).map((x) => Number(x)));
    if (selected.has(day)) selected.delete(day);
    else selected.add(day);
    updateDraft(jobKey, { weekDays: Array.from(selected).sort((a, b) => a - b).join(",") });
  };

  const save = async (jobKey: string) => {
    const row = draft[jobKey];
    if (!row) return;
    setSavingKey(jobKey);
    try {
      const saved = await updateScheduleJob(jobKey, {
        enabled: row.enabled === 1,
        scheduleType: row.scheduleType,
        scheduleTime: row.scheduleTime || "02:00",
        scheduleStartTime: row.scheduleStartTime || "07:00",
        scheduleEndTime: row.scheduleEndTime || "22:00",
        weekDays: row.weekDays || "",
        ...(TELEMETRY_WINCC_POLL_KEYS.has(jobKey) || ALL_POLL_KEYS.has(jobKey)
          ? {
              pollIntervalSeconds: Math.max(
                10,
                Math.min(
                  ALL_POLL_KEYS.has(jobKey) ? 86400 : 3600,
                  Number(row.pollIntervalSeconds ?? 60)
                )
              ),
            }
          : {}),
        ...(jobKey === DAILY_EXEMPT_RESET_KEY
          ? { revokeAutoSignoutEnabled: (row.revokeAutoSignoutEnabled ?? 0) === 1 }
          : {}),
      });
      const merged = normalizeScheduleRow({ ...row, ...saved });
      qc.setQueryData(SCHEDULE_JOBS_KEY, (prev: ScheduleJobRow[] | undefined) =>
        (prev || []).map((x) => (x.jobKey === jobKey ? { ...x, ...merged } : x))
      );
      setDraft((prev) => ({ ...prev, [jobKey]: merged }));
      toast.success("保存成功");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingKey("");
    }
  };

  const updateDahuaDraft = (id: number, patch: Partial<DahuaEditState[number]>) => {
    setDahuaDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const toggleDahuaWeek = (id: number, day: number) => {
    const cur = dahuaDraft[id];
    const selected = new Set((cur.weekDays || "").split(",").filter(Boolean).map((x) => Number(x)));
    if (selected.has(day)) selected.delete(day);
    else selected.add(day);
    updateDahuaDraft(id, { weekDays: Array.from(selected).sort((a, b) => a - b).join(",") });
  };

  const saveDahua = async (task: DahuaSwingTask) => {
    if (!task.id) return;
    const d = dahuaDraft[task.id];
    if (!d) return;
    setSavingKey(`dahua-${task.id}`);
    try {
      const q = parseTaskQuery(task.queryJson);
      q.execWeekDays = d.weekDays.split(",").map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 1 && x <= 7);
      q.execStartTime = d.startTime || "07:00";
      q.execEndTime = d.endTime || "22:00";
      const queryJson = JSON.stringify(q);
      await updateDahuaSwingTask(task.id, {
        ...task,
        enabled: d.enabled,
        pollIntervalSeconds: Math.max(10, Number(d.pollIntervalSeconds || 60)),
        queryJson,
      });
      qc.setQueryData(DAHUA_TASKS_KEY, (prev: DahuaSwingTask[] | undefined) =>
        (prev || []).map((r) =>
          r.id === task.id
            ? { ...r, enabled: d.enabled, pollIntervalSeconds: Math.max(10, Number(d.pollIntervalSeconds || 60)), queryJson }
            : r
        )
      );
      toast.success("大华任务计划已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingKey("");
    }
  };

  const updateStatsDraft = (id: number, patch: Partial<StatsEditState[number]>) => {
    setStatsDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const saveStats = async (task: DahuaSwingStatsPullTask) => {
    if (!task.id) return;
    const d = statsDraft[task.id];
    if (!d) return;
    setSavingKey(`stats-${task.id}`);
    try {
      await updateDahuaSwingStatsTask(task.id, { ...task, enabled: d.enabled });
      toast.success("日批任务开关已保存");
      qc.setQueryData(STATS_TASKS_KEY, (prev: DahuaSwingStatsPullTask[] | undefined) =>
        (prev || []).map((r) => (r.id === task.id ? { ...r, enabled: d.enabled } : r))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingKey("");
    }
  };

  const runStatsNow = async (taskId?: number) => {
    if (!taskId) return;
    setSavingKey(`stats-${taskId}`);
    try {
      await executeDahuaSwingStatsTask(taskId);
      toast.success("已触发统计拉取");
      const list = await listDahuaSwingStatsTasks();
      const row = list.find((x) => x.id === taskId);
      if (row) {
        qc.setQueryData(STATS_TASKS_KEY, (prev: DahuaSwingStatsPullTask[] | undefined) =>
          (prev || []).map((r) => (r.id === taskId ? row : r))
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "执行失败");
    } finally {
      setSavingKey("");
    }
  };

  const runDahuaNow = async (taskId?: number) => {
    if (!taskId) return;
    setSavingKey(`dahua-${taskId}`);
    try {
      const result = await executeDahuaSwingTask(taskId);
      toast.success(`已触发执行，本次入库 ${result?.saved ?? 0} 条`);
      const tasks = await listDahuaSwingTasks();
      qc.setQueryData(DAHUA_TASKS_KEY, tasks);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "执行失败");
    } finally {
      setSavingKey("");
    }
  };

  const runNow = async (jobKey: string) => {
    if (savingKey === jobKey) return;
    setSavingKey(jobKey);
    try {
      const outcome: JobRunOutcome = await runScheduleJobNow(jobKey);
      let detail = outcome.summary || "已触发执行";
      const m = outcome.metrics;
      if (
        (jobKey === STATS_PULL_SCHEDULE_JOB.PREVIOUS_DAY ||
          jobKey === STATS_PULL_SCHEDULE_JOB.PREVIOUS_WEEK ||
          jobKey === STATS_PULL_SCHEDULE_JOB.SINCE_LAST) &&
        m
      ) {
        const acOk = m.autoCleanOk ?? 0;
        const acSkip = m.autoCleanSkipped ?? 0;
        const acFail = m.autoCleanFail ?? 0;
        detail += ` · 自动清洗 成功${acOk} 跳过${acSkip} 失败${acFail}`;
      }
      if (jobKey === "ACCESS_CLEAN_PACKAGE_DAILY" && m) {
        detail += ` · 通道${m.channels ?? 0} 成功${m.ok ?? 0} 跳过${m.skipNoAuto ?? 0}`;
      }
      toast.success(detail, { duration: outcome.noop ? 8000 : 5000 });
      const list = await fetchScheduleJobs();
      const normalized = list.map(normalizeScheduleRow).filter((r) => !DEPRECATED_JOB_KEYS.has(r.jobKey));
      qc.setQueryData(SCHEDULE_JOBS_KEY, normalized);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "执行失败");
    } finally {
      setSavingKey("");
    }
  };

  const btnClass = "rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1";
  const inputClass = "rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1";
  const weekBtnClass = "rounded-twin-sm border border-[var(--twin-hairline)] px-1.5 py-0.5 text-xs";
  const weekBtnActiveClass = "bg-[var(--twin-primary)] text-[var(--twin-on-primary)]";

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--twin-ink)]">定时管理</h2>
      <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 text-sm text-[var(--twin-body)]">
        <div>说明：除以下任务外，其余手动触发任务统一在本页配置。</div>
        <ul className="list-disc pl-6 mt-2">
          {exceptions.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      {isLoading ? (
        <DataSkeleton variant="card" rows={8} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3">
            <div className="mb-2 text-base font-semibold text-[var(--twin-ink)]">A. 窗口轮询任务</div>
            <div className="mb-3 text-xs text-[var(--twin-mute)]">
              仅在<strong>执行窗口</strong>内按<strong>轮询间隔(秒)</strong>重复检查。WinCC 两行由专用调度读取（不参与统一定时 tick）。
              审计门禁批量拉取在下方 B 区按<strong>昨日 / 上周 / 水位</strong>拆成三个独立到点 Job（回溯无定时，仅工作台手动）。
            </div>
            {rangeGroupedRows.map((group) => (
              <div key={group.title} className="mb-4">
                <div className="mb-2 text-sm font-semibold text-[var(--twin-body)]">{group.title}</div>
                <AdminDataTableWrap scrollable className="rounded-none border-0 bg-transparent shadow-none ring-0">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[var(--twin-canvas-soft)]">
                      <tr>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">任务</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">开关</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">计划</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">窗口开始</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">窗口结束</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">轮询(秒)</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">每周</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">上次执行</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">上次成功</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">状态</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((r) => {
                        const d = draft[r.jobKey] || r;
                        return (
                          <tr key={r.jobKey}>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.jobName}</td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">
                              <AdminSwitchScaled size="3.5" checked={d.enabled === 1} onChange={(checked) => updateDraft(r.jobKey, { enabled: checked ? 1 : 0 })} />
                            </td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">
                              <select className={inputClass} value={d.scheduleType || "DAILY"} onChange={(e) => updateDraft(r.jobKey, { scheduleType: e.target.value as "DAILY" | "WEEKLY" })}>
                                <option value="DAILY">每天</option>
                                <option value="WEEKLY">每周</option>
                              </select>
                            </td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">
                              <input type="time" className={inputClass} value={d.scheduleStartTime || "07:00"} onChange={(e) => updateDraft(r.jobKey, { scheduleStartTime: e.target.value })} />
                            </td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">
                              <input type="time" className={inputClass} value={d.scheduleEndTime || "22:00"} onChange={(e) => updateDraft(r.jobKey, { scheduleEndTime: e.target.value })} />
                            </td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">
                              {TELEMETRY_WINCC_POLL_KEYS.has(r.jobKey) || ALL_POLL_KEYS.has(r.jobKey) ? (
                                <input
                                  type="number"
                                  className="w-24 rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1"
                                  min={10}
                                  max={ALL_POLL_KEYS.has(r.jobKey) ? 86400 : 3600}
                                  value={d.pollIntervalSeconds ?? 60}
                                  onChange={(e) =>
                                    updateDraft(r.jobKey, {
                                      pollIntervalSeconds: Math.max(
                                        10,
                                        Math.min(ALL_POLL_KEYS.has(r.jobKey) ? 86400 : 3600, Number(e.target.value || 60))
                                      ),
                                    })
                                  }
                                />
                              ) : (
                                <span className="text-[var(--twin-mute)]">-</span>
                              )}
                            </td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">
                              {d.scheduleType === "WEEKLY" ? (
                                <div className="flex flex-wrap gap-1">
                                  {weekOptions.map((w) => {
                                    const selected = (d.weekDays || "").split(",").includes(String(w.id));
                                    return (
                                      <button key={w.id} onClick={() => toggleWeek(r.jobKey, w.id)} className={`${weekBtnClass} ${selected ? weekBtnActiveClass : ""}`}>
                                        {w.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-[var(--twin-mute)]">-</span>
                              )}
                            </td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.lastRunAt || "-"}</td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.lastSuccessAt || "-"}</td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.lastStatus || "-"}</td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">
                              <div className="flex gap-2">
                                <button className={btnClass} disabled={savingKey === r.jobKey} onClick={() => void save(r.jobKey)}>保存</button>
                                <button className={btnClass} disabled={savingKey === r.jobKey} onClick={() => void runNow(r.jobKey)}>立即执行</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </AdminDataTableWrap>
              </div>
            ))}

            <div className="mt-4">
              <div className="mb-2 text-sm font-semibold text-[var(--twin-body)]">即时门禁拉取（轮询+时间段，孪生联动）</div>
              <AdminDataTableWrap scrollable className="rounded-none border-0 bg-transparent shadow-none ring-0">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--twin-canvas-soft)]">
                    <tr>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">任务</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">开关</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">轮询频率(秒)</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">窗口开始</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">窗口结束</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">每周</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">上次执行</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">状态</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dahuaRows.map((r) => {
                      if (!r.id) return null;
                      const d = dahuaDraft[r.id];
                      if (!d) return null;
                      return (
                        <tr key={r.id}>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.name || `任务#${r.id}`}</td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2"><AdminSwitchScaled size="3.5" checked={d.enabled === 1} onChange={(checked) => updateDahuaDraft(r.id!, { enabled: checked ? 1 : 0 })} /></td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2"><input type="number" className="w-24 rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1" min={10} value={d.pollIntervalSeconds} onChange={(e) => updateDahuaDraft(r.id!, { pollIntervalSeconds: Number(e.target.value || 60) })} /></td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2"><input type="time" className={inputClass} value={d.startTime} onChange={(e) => updateDahuaDraft(r.id!, { startTime: e.target.value })} /></td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2"><input type="time" className={inputClass} value={d.endTime} onChange={(e) => updateDahuaDraft(r.id!, { endTime: e.target.value })} /></td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2">
                            <div className="flex flex-wrap gap-1">
                              {weekOptions.map((w) => {
                                const selected = (d.weekDays || "").split(",").includes(String(w.id));
                                return (
                                  <button key={w.id} onClick={() => toggleDahuaWeek(r.id!, w.id)} className={`${weekBtnClass} ${selected ? "bg-[var(--twin-primary)] text-[var(--twin-on-primary)]" : ""}`}>
                                    {w.label}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.lastRunAt || "-"}</td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.lastStatus || "-"}</td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2">
                            <div className="flex gap-2">
                              <button className={btnClass} disabled={savingKey === `dahua-${r.id}`} onClick={() => void saveDahua(r)}>保存</button>
                              <button className={btnClass} disabled={savingKey === `dahua-${r.id}`} onClick={() => void runDahuaNow(r.id)}>立即执行</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </AdminDataTableWrap>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-1 text-sm font-semibold text-[var(--twin-body)]">审计拉取任务（按策略参与对应定时 Job）</div>
                <p className="mb-2 text-xs text-[var(--twin-mute)]">
                  <strong>回溯</strong>不在此配置，仅在{" "}
                  <a href="#/admin/dahua-swing-tasks?tab=audit" className="text-[var(--twin-link-deep)] underline">
                    门禁数据工作台 · 审计拉取
                  </a>{" "}
                  手动执行。
                </p>
              </div>
              {STATS_PULL_SCHEDULE_SECTIONS.map((section) => {
                const sectionRows = statsRowsByPeriod.get(section.periodMode) ?? [];
                return (
                  <div key={section.periodMode}>
                    <div className="mb-1 text-xs font-semibold text-[var(--twin-body)]">
                      {section.title} · 对应 Job <code className="text-[10px]">{section.jobKey}</code>
                    </div>
                    <AdminDataTableWrap scrollable className="rounded-none border-0 bg-transparent shadow-none ring-0">
                      <table className="min-w-full text-sm">
                        <thead className="bg-[var(--twin-canvas-soft)]">
                          <tr>
                            <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">任务</th>
                            <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">参与本策略定时</th>
                            <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">上次数据窗</th>
                            <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">状态</th>
                            <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectionRows.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="border border-[var(--twin-hairline)] px-2 py-4 text-center text-xs text-[var(--twin-mute)]">
                                暂无 {section.title} 任务
                              </td>
                            </tr>
                          ) : (
                            sectionRows.map((r) => {
                              if (!r.id) return null;
                              const d = statsDraft[r.id];
                              if (!d) return null;
                              return (
                                <tr key={r.id}>
                                  <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.name || `任务#${r.id}`}</td>
                                  <td className="border border-[var(--twin-hairline)] px-2 py-2">
                                    <AdminSwitchScaled
                                      size="3.5"
                                      checked={d.enabled === 1}
                                      onChange={(checked) =>
                                        updateStatsDraft(r.id!, { enabled: checked ? 1 : 0 })
                                      }
                                    />
                                  </td>
                                  <td className="border border-[var(--twin-hairline)] px-2 py-2 text-xs">
                                    {r.lastPulledStart && r.lastPulledEnd ? (
                                      <>
                                        {r.lastPulledStart}
                                        <br />
                                        {r.lastPulledEnd}
                                      </>
                                    ) : (
                                      "-"
                                    )}
                                  </td>
                                  <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.lastStatus || "-"}</td>
                                  <td className="border border-[var(--twin-hairline)] px-2 py-2">
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        className={btnClass}
                                        disabled={savingKey === `stats-${r.id}`}
                                        onClick={() => void saveStats(r)}
                                      >
                                        保存
                                      </button>
                                      <button
                                        type="button"
                                        className={btnClass}
                                        disabled={savingKey === `stats-${r.id}`}
                                        onClick={() => void runStatsNow(r.id)}
                                      >
                                        立即执行
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </AdminDataTableWrap>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3">
            <div className="mb-2 text-base font-semibold text-[var(--twin-ink)]">B. 每日定时（到点执行一次）</div>
            <div className="mb-3 text-xs text-[var(--twin-mute)]">
              仅需配置<strong>执行时刻</strong>与周计划，无需时间段与轮询间隔。支持重启补跑（错过计划点会在重启自检时补齐）。
              <strong>审计门禁·每日到点</strong>：拉取昨日窗后，各任务若开启「拉取后自动清洗」则写入总库（开关在{" "}
              <a href="#/admin/dahua-swing-tasks?tab=audit" className="text-[var(--twin-link-deep)] underline">
                定时审计拉取
              </a>
              ）。<strong>门禁统计·自动入库</strong>：独立增量任务，仍看各任务同一开关。
            </div>

            <div className="mb-4">
              <div className="mb-2 text-sm font-semibold text-[var(--twin-body)]">冻结联动任务</div>
              <p className="mb-2 text-xs text-amber-800/90 bg-amber-50 border border-amber-200/80 rounded-twin-sm px-2 py-1.5">
                「每日豁免权回收」在本页单独配置开关与执行时间，不再随冻结总开关绑定。可勾选「回收后自动签离」：仅对<strong>今日曾豁免且流水仍判定在馆</strong>者签离；时效到期收回、未申请豁免的滞留者不签离（与 AI 雷达口径一致，跨日后不计入当日雷达）。
                <strong className="ml-1">滞留检测</strong>分两道独立定时：<strong>一道</strong>创建违规公告（行为在「新建违规」页配置），<strong>二道</strong>仅签退（开关在同页第二卡片）。
              </p>
              <AdminDataTableWrap scrollable className="rounded-none border-0 bg-transparent shadow-none ring-0">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--twin-canvas-soft)]">
                    <tr>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">任务</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">开关</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">计划</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">执行时间</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">每周</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">回收后签离</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">上次执行</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">上次成功</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">状态</th>
                      <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {freezeRows.map((r) => {
                      const d = draft[r.jobKey] || r;
                      return (
                        <tr key={r.jobKey}>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.jobName}</td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2"><AdminSwitchScaled size="3.5" checked={d.enabled === 1} onChange={(checked) => updateDraft(r.jobKey, { enabled: checked ? 1 : 0 })} /></td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2">
                            <select className={inputClass} value={d.scheduleType || "DAILY"} onChange={(e) => updateDraft(r.jobKey, { scheduleType: e.target.value as "DAILY" | "WEEKLY" })}>
                              <option value="DAILY">每天</option>
                              <option value="WEEKLY">每周</option>
                            </select>
                          </td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2"><input type="time" className={inputClass} value={d.scheduleTime || "03:00"} onChange={(e) => updateDraft(r.jobKey, { scheduleTime: e.target.value })} /></td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2">
                            {d.scheduleType === "WEEKLY" ? (
                              <div className="flex flex-wrap gap-1">
                                {weekOptions.map((w) => {
                                  const selected = (d.weekDays || "").split(",").includes(String(w.id));
                                  return (
                                    <button key={w.id} onClick={() => toggleWeek(r.jobKey, w.id)} className={`${weekBtnClass} ${selected ? weekBtnActiveClass : ""}`}>
                                      {w.label}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-[var(--twin-mute)]">-</span>
                            )}
                          </td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2">
                            {r.jobKey === DAILY_EXEMPT_RESET_KEY ? (
                              <label className="flex items-center gap-1 text-xs cursor-pointer">
                                <AdminSwitchScaled
                                  size="3.5"
                                  checked={(d.revokeAutoSignoutEnabled ?? 0) === 1}
                                  onChange={(checked) =>
                                    updateDraft(r.jobKey, { revokeAutoSignoutEnabled: checked ? 1 : 0 })
                                  }
                                />
                                今日曾豁免且仍在馆
                              </label>
                            ) : (
                              <span className="text-[var(--twin-mute)]">-</span>
                            )}
                          </td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.lastRunAt || "-"}</td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.lastSuccessAt || "-"}</td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.lastStatus || "-"}</td>
                          <td className="border border-[var(--twin-hairline)] px-2 py-2">
                            <div className="flex gap-2">
                              <button className={btnClass} disabled={savingKey === r.jobKey} onClick={() => void save(r.jobKey)}>保存</button>
                              <button className={btnClass} disabled={savingKey === r.jobKey} onClick={() => void runNow(r.jobKey)}>立即执行</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </AdminDataTableWrap>
            </div>

            {singleGroupedRows.map((group) => (
              <div key={group.title} className="mb-4">
                <div className="mb-2 text-sm font-semibold text-[var(--twin-body)]">{group.title}</div>
                {group.title === "门禁统计（每日到点）" ? (
                  <p className="mb-2 text-xs text-[var(--twin-mute)]">
                    三个审计拉取 Job 互不合并：<strong>昨日日批</strong>、<strong>上周周批</strong>、<strong>水位增量</strong>各配独立到点时刻，仅执行对应 periodMode 且已勾选参与定时的任务；<strong>历史回溯无定时</strong>。
                    「昨日日批」到点后还会跑全局增量入库并刷新隔离服/笼架订阅；周批/水位仅拉取+任务级自动清洗。
                    <strong className="ml-1">门禁统计·自动入库</strong>（
                    <code className="text-[10px]">ACCESS_CLEAN_PACKAGE_DAILY</code>）建议时刻晚于昨日日批。
                  </p>
                ) : null}
                <AdminDataTableWrap scrollable className="rounded-none border-0 bg-transparent shadow-none ring-0">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[var(--twin-canvas-soft)]">
                      <tr>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">任务</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">开关</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">计划</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">执行时间</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">每周</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">上次执行</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">上次成功</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">状态</th>
                        <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((r) => {
                        const d = draft[r.jobKey] || r;
                        return (
                          <tr key={r.jobKey}>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.jobName}</td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2"><AdminSwitchScaled size="3.5" checked={d.enabled === 1} onChange={(checked) => updateDraft(r.jobKey, { enabled: checked ? 1 : 0 })} /></td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">
                              <select className={inputClass} value={d.scheduleType || "DAILY"} onChange={(e) => updateDraft(r.jobKey, { scheduleType: e.target.value as "DAILY" | "WEEKLY" })}>
                                <option value="DAILY">每天</option>
                                <option value="WEEKLY">每周</option>
                              </select>
                            </td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2"><input type="time" className={inputClass} value={d.scheduleTime || "03:00"} onChange={(e) => updateDraft(r.jobKey, { scheduleTime: e.target.value })} /></td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">
                              {d.scheduleType === "WEEKLY" ? (
                                <div className="flex flex-wrap gap-1">
                                  {weekOptions.map((w) => {
                                    const selected = (d.weekDays || "").split(",").includes(String(w.id));
                                    return (
                                      <button key={w.id} onClick={() => toggleWeek(r.jobKey, w.id)} className={`${weekBtnClass} ${selected ? weekBtnActiveClass : ""}`}>
                                        {w.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-[var(--twin-mute)]">-</span>
                              )}
                            </td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.lastRunAt || "-"}</td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.lastSuccessAt || "-"}</td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.lastStatus || "-"}</td>
                            <td className="border border-[var(--twin-hairline)] px-2 py-2">
                              <div className="flex gap-2">
                                <button className={btnClass} disabled={savingKey === r.jobKey} onClick={() => void save(r.jobKey)}>保存</button>
                                <button className={btnClass} disabled={savingKey === r.jobKey} onClick={() => void runNow(r.jobKey)}>立即执行</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </AdminDataTableWrap>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function parseTaskQuery(queryJson: string | undefined): Record<string, any> {
  try {
    const parsed = queryJson ? JSON.parse(queryJson) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeWeekDays(input: unknown): string {
  if (!Array.isArray(input)) return "1,2,3,4,5,6,7";
  const vals = input
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x >= 1 && x <= 7)
    .sort((a, b) => a - b);
  return vals.length ? vals.join(",") : "1,2,3,4,5,6,7";
}

function normalizeTime(input: unknown, def: string): string {
  if (typeof input !== "string" || input.trim().length < 4) return def;
  const s = input.trim();
  return s.length >= 5 ? s.slice(0, 5) : def;
}

function normalizeScheduleRow(r: ScheduleJobRow): ScheduleJobRow {
  const rawEnabled = (r as { enabled?: number | boolean }).enabled;
  return {
    ...r,
    enabled: rawEnabled === 1 || rawEnabled === true ? 1 : 0,
    scheduleTime: normalizeTime(r.scheduleTime, "02:00"),
    scheduleStartTime: normalizeTime(r.scheduleStartTime, "07:00"),
    scheduleEndTime: normalizeTime(r.scheduleEndTime, "22:00"),
    pollIntervalSeconds:
      TELEMETRY_WINCC_POLL_KEYS.has(r.jobKey) || ALL_POLL_KEYS.has(r.jobKey)
        ? Math.max(10, Math.min(ALL_POLL_KEYS.has(r.jobKey) ? 86400 : 3600, Number(r.pollIntervalSeconds ?? 60)))
        : r.pollIntervalSeconds,
  };
}

function mergeScheduleStatus(cur: ScheduleJobRow, fromServer: ScheduleJobRow): ScheduleJobRow {
  return {
    ...cur,
    lastRunAt: fromServer.lastRunAt,
    lastSuccessAt: fromServer.lastSuccessAt,
    lastStatus: fromServer.lastStatus,
    lastError: fromServer.lastError,
  };
}
