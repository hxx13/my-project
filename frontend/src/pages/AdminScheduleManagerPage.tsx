import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  fetchScheduleJobs,
  runScheduleJobNow,
  updateScheduleJob,
} from "@/api/domains/schedule.api";
import type { ScheduleJobRow } from "@/api/domains/schedule.api";
import {
  executeDahuaSwingTask,
  listDahuaSwingTasks,
  updateDahuaSwingTask,
  type DahuaSwingTask,
} from "@/api/domains/dahuaSwing.api";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";

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

/** 动物房 WinCC 测量值高频轮询：与程序坞页 GET /telemetry/wincc/dock-poll-config 对应 */
const TELEMETRY_WINCC_UI_KEY = "TELEMETRY_WINCC_UI";
const TELEMETRY_WINCC_POLL_KEYS = new Set([TELEMETRY_WINCC_UI_KEY, "TELEMETRY_WINCC_LIMITS_UI"]);

const FREEZE_KEYS = new Set(["RUN_REAPER", "RUN_REAPER_SECOND", "DAILY_EXEMPT_RESET"]);
const SINGLE_KEYS = new Set([
  "RPG_RECALC_ALL",
  "ORDER_SYNC",
  "ORDER_SYNC_FULL",
  "PERSONNEL_SYNC_ALL",
  "GROUP_RECALC",
  "MODEL_RECALC",
  "ROOM_MAPPING_REFRESH",
  "DAHUA_GROUP_REFRESH",
  "DAHUA_CHANNEL_REFRESH",
  "DAHUA_DEPT_REFRESH",
  ...Array.from(FREEZE_KEYS),
]);

export default function AdminScheduleManagerPage() {
  const [rows, setRows] = useState<ScheduleJobRow[]>([]);
  const [draft, setDraft] = useState<EditState>({});
  const [loading, setLoading] = useState(false);
  const [dahuaRows, setDahuaRows] = useState<DahuaSwingTask[]>([]);
  const [dahuaDraft, setDahuaDraft] = useState<DahuaEditState>({});
  const [savingKey, setSavingKey] = useState<string>("");

  const load = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? true;
    if (showLoading) setLoading(true);
    try {
      const list = await fetchScheduleJobs();
      setRows(list);
      const state: EditState = {};
      for (const r of list) {
        state[r.jobKey] = {
          ...r,
          pollIntervalSeconds: TELEMETRY_WINCC_POLL_KEYS.has(r.jobKey)
            ? Math.max(10, Math.min(3600, Number(r.pollIntervalSeconds ?? 60)))
            : r.pollIntervalSeconds,
        };
      }
      setDraft(state);
      const tasks = await listDahuaSwingTasks();
      setDahuaRows(tasks);
      const ds: DahuaEditState = {};
      for (const t of tasks) {
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load({ showLoading: true });
  }, [load]);

  /** 静默刷新执行状态列，避免编辑草稿时被整表覆盖 */
  useEffect(() => {
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const list = await fetchScheduleJobs();
          setRows(list);
          setDraft((prev) => {
            const next = { ...prev };
            for (const r of list) {
              const cur = next[r.jobKey];
              if (!cur) {
                next[r.jobKey] = {
                  ...r,
                  pollIntervalSeconds: TELEMETRY_WINCC_POLL_KEYS.has(r.jobKey)
                    ? Math.max(10, Math.min(3600, Number(r.pollIntervalSeconds ?? 60)))
                    : r.pollIntervalSeconds,
                };
                continue;
              }
              next[r.jobKey] = {
                ...cur,
                lastRunAt: r.lastRunAt,
                lastSuccessAt: r.lastSuccessAt,
                lastStatus: r.lastStatus,
                lastError: r.lastError,
              };
            }
            return next;
          });
        } catch {
          /* 定时静默失败忽略 */
        }
      })();
    }, 15000);
    return () => window.clearInterval(id);
  }, []);

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
        title: "模型与空间重算",
        keys: new Set(["RPG_RECALC_ALL", "GROUP_RECALC", "MODEL_RECALC"]),
      },
      {
        title: "同步与落库任务",
        keys: new Set(["ORDER_SYNC", "ORDER_SYNC_FULL", "PERSONNEL_SYNC_ALL", "ROOM_MAPPING_REFRESH"]),
      },
      {
        title: "大华缓存刷新任务",
        keys: new Set(["DAHUA_GROUP_REFRESH", "DAHUA_CHANNEL_REFRESH", "DAHUA_DEPT_REFRESH"]),
      },
    ],
    []
  );
  const singleGroupedRows = useMemo(
    () =>
      singleGroups
        .map((g) => ({ title: g.title, rows: singleRows.filter((r) => g.keys.has(r.jobKey)) }))
        .filter((g) => g.rows.length > 0),
    [singleGroups, singleRows]
  );
  const rangeGroupedRows = useMemo(
    () => [
      {
        title: "平台轮询与窗口任务",
        rows: rangeRows,
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
        ...(TELEMETRY_WINCC_POLL_KEYS.has(jobKey)
          ? {
              pollIntervalSeconds: Math.max(
                10,
                Math.min(3600, Number(row.pollIntervalSeconds ?? 60))
              ),
            }
          : {}),
      });
      toast.success("保存成功");
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      if (saved && typeof saved === "object" && "jobKey" in saved) {
        const merged: ScheduleJobRow = { ...row, ...saved };
        setRows((prev) => prev.map((x) => (x.jobKey === jobKey ? { ...x, ...merged } : x)));
        setDraft((prev) => ({ ...prev, [jobKey]: { ...prev[jobKey], ...merged } }));
      } else {
        await load({ showLoading: false });
      }
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
      await updateDahuaSwingTask(task.id, {
        ...task,
        enabled: d.enabled,
        pollIntervalSeconds: Math.max(10, Number(d.pollIntervalSeconds || 60)),
        queryJson: JSON.stringify(q),
      });
      toast.success("大华任务计划已保存");
      await load({ showLoading: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingKey("");
    }
  };

  const runDahuaNow = async (taskId?: number) => {
    if (!taskId) return;
    setSavingKey(`dahua-${taskId}`);
    try {
      await executeDahuaSwingTask(taskId);
      toast.success("已触发执行");
      await load({ showLoading: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "执行失败");
    } finally {
      setSavingKey("");
    }
  };

  const runNow = async (jobKey: string) => {
    setSavingKey(jobKey);
    try {
      await runScheduleJobNow(jobKey);
      toast.success("已触发执行");
      await load({ showLoading: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "执行失败");
    } finally {
      setSavingKey("");
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">定时管理</h2>
      <div className="rounded border bg-white p-4 text-sm text-slate-600">
        <div>说明：除以下任务外，其余手动触发任务统一在本页配置。</div>
        <ul className="list-disc pl-6 mt-2">
          {exceptions.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      {loading ? (
        <div className="text-sm text-slate-500">加载中...</div>
      ) : (
        <div className="space-y-4">
          <div className="rounded border bg-white p-3">
            <div className="mb-2 text-base font-semibold text-slate-800">A. 时间段任务（持续轮询/窗口执行）</div>
            <div className="mb-3 text-xs text-slate-500">
              此类任务依赖执行窗口（开始~结束）+ 计划类型（每天/每周）。例如 ARO 穿甲弹与门禁拉取轮询任务。
              <strong>动物房 WinCC 测量值</strong>与<strong> WinCC 限值低频（TELEMETRY_WINCC_LIMITS_UI）</strong>两行：均由<strong>开关+窗口+周计划+轮询(秒)</strong>约束；服务端专用调度器读取配置（不参与统一 tick）。测量值任务更新内存快照；限值任务已不再访问 WinCC（动物房报警限改为「WinCC 变量」页顶部全局配置）。
            </div>
            {rangeGroupedRows.map((group) => (
              <div key={group.title} className="mb-4">
                <div className="mb-2 text-sm font-semibold text-slate-700">{group.title}</div>
                <AdminDataTableWrap scrollable className="rounded-none border-0 bg-transparent shadow-none ring-0">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="border px-2 py-2 text-left">任务</th>
                        <th className="border px-2 py-2 text-left">开关</th>
                        <th className="border px-2 py-2 text-left">计划</th>
                        <th className="border px-2 py-2 text-left">窗口开始</th>
                        <th className="border px-2 py-2 text-left">窗口结束</th>
                        <th className="border px-2 py-2 text-left">轮询(秒)</th>
                        <th className="border px-2 py-2 text-left">每周</th>
                        <th className="border px-2 py-2 text-left">上次执行</th>
                        <th className="border px-2 py-2 text-left">上次成功</th>
                        <th className="border px-2 py-2 text-left">状态</th>
                        <th className="border px-2 py-2 text-left">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((r) => {
                        const d = draft[r.jobKey] || r;
                        return (
                          <tr key={r.jobKey}>
                            <td className="border px-2 py-2">{r.jobName}</td>
                            <td className="border px-2 py-2">
                              <input type="checkbox" checked={d.enabled === 1} onChange={(e) => updateDraft(r.jobKey, { enabled: e.target.checked ? 1 : 0 })} />
                            </td>
                            <td className="border px-2 py-2">
                              <select className="rounded border px-2 py-1" value={d.scheduleType || "DAILY"} onChange={(e) => updateDraft(r.jobKey, { scheduleType: e.target.value as "DAILY" | "WEEKLY" })}>
                                <option value="DAILY">每天</option>
                                <option value="WEEKLY">每周</option>
                              </select>
                            </td>
                            <td className="border px-2 py-2">
                              <input type="time" className="rounded border px-2 py-1" value={d.scheduleStartTime || "07:00"} onChange={(e) => updateDraft(r.jobKey, { scheduleStartTime: e.target.value })} />
                            </td>
                            <td className="border px-2 py-2">
                              <input type="time" className="rounded border px-2 py-1" value={d.scheduleEndTime || "22:00"} onChange={(e) => updateDraft(r.jobKey, { scheduleEndTime: e.target.value })} />
                            </td>
                            <td className="border px-2 py-2">
                              {TELEMETRY_WINCC_POLL_KEYS.has(r.jobKey) ? (
                                <input
                                  type="number"
                                  className="w-24 rounded border px-2 py-1"
                                  min={10}
                                  max={3600}
                                  value={d.pollIntervalSeconds ?? 60}
                                  onChange={(e) =>
                                    updateDraft(r.jobKey, {
                                      pollIntervalSeconds: Math.max(
                                        10,
                                        Math.min(3600, Number(e.target.value || 60))
                                      ),
                                    })
                                  }
                                />
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="border px-2 py-2">
                              {d.scheduleType === "WEEKLY" ? (
                                <div className="flex flex-wrap gap-1">
                                  {weekOptions.map((w) => {
                                    const selected = (d.weekDays || "").split(",").includes(String(w.id));
                                    return (
                                      <button key={w.id} onClick={() => toggleWeek(r.jobKey, w.id)} className={`rounded border px-1.5 py-0.5 text-xs ${selected ? "bg-blue-600 text-white" : ""}`}>
                                        {w.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="border px-2 py-2">{r.lastRunAt || "-"}</td>
                            <td className="border px-2 py-2">{r.lastSuccessAt || "-"}</td>
                            <td className="border px-2 py-2">{r.lastStatus || "-"}</td>
                            <td className="border px-2 py-2">
                              <div className="flex gap-2">
                                <button className="rounded border px-2 py-1" disabled={savingKey === r.jobKey} onClick={() => void save(r.jobKey)}>保存</button>
                                <button className="rounded border px-2 py-1" disabled={savingKey === r.jobKey} onClick={() => void runNow(r.jobKey)}>立即执行</button>
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
              <div className="mb-2 text-sm font-semibold text-slate-700">门禁拉取任务（时间段）</div>
              <AdminDataTableWrap scrollable className="rounded-none border-0 bg-transparent shadow-none ring-0">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="border px-2 py-2 text-left">任务</th>
                      <th className="border px-2 py-2 text-left">开关</th>
                      <th className="border px-2 py-2 text-left">轮询频率(秒)</th>
                      <th className="border px-2 py-2 text-left">窗口开始</th>
                      <th className="border px-2 py-2 text-left">窗口结束</th>
                      <th className="border px-2 py-2 text-left">每周</th>
                      <th className="border px-2 py-2 text-left">上次执行</th>
                      <th className="border px-2 py-2 text-left">状态</th>
                      <th className="border px-2 py-2 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dahuaRows.map((r) => {
                      if (!r.id) return null;
                      const d = dahuaDraft[r.id];
                      if (!d) return null;
                      return (
                        <tr key={r.id}>
                          <td className="border px-2 py-2">{r.name || `任务#${r.id}`}</td>
                          <td className="border px-2 py-2"><input type="checkbox" checked={d.enabled === 1} onChange={(e) => updateDahuaDraft(r.id!, { enabled: e.target.checked ? 1 : 0 })} /></td>
                          <td className="border px-2 py-2"><input type="number" className="w-24 rounded border px-2 py-1" min={10} value={d.pollIntervalSeconds} onChange={(e) => updateDahuaDraft(r.id!, { pollIntervalSeconds: Number(e.target.value || 60) })} /></td>
                          <td className="border px-2 py-2"><input type="time" className="rounded border px-2 py-1" value={d.startTime} onChange={(e) => updateDahuaDraft(r.id!, { startTime: e.target.value })} /></td>
                          <td className="border px-2 py-2"><input type="time" className="rounded border px-2 py-1" value={d.endTime} onChange={(e) => updateDahuaDraft(r.id!, { endTime: e.target.value })} /></td>
                          <td className="border px-2 py-2">
                            <div className="flex flex-wrap gap-1">
                              {weekOptions.map((w) => {
                                const selected = (d.weekDays || "").split(",").includes(String(w.id));
                                return (
                                  <button key={w.id} onClick={() => toggleDahuaWeek(r.id!, w.id)} className={`rounded border px-1.5 py-0.5 text-xs ${selected ? "bg-indigo-600 text-white" : ""}`}>
                                    {w.label}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="border px-2 py-2">{r.lastRunAt || "-"}</td>
                          <td className="border px-2 py-2">{r.lastStatus || "-"}</td>
                          <td className="border px-2 py-2">
                            <div className="flex gap-2">
                              <button className="rounded border px-2 py-1" disabled={savingKey === `dahua-${r.id}`} onClick={() => void saveDahua(r)}>保存</button>
                              <button className="rounded border px-2 py-1" disabled={savingKey === `dahua-${r.id}`} onClick={() => void runDahuaNow(r.id)}>立即执行</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </AdminDataTableWrap>
            </div>
          </div>

          <div className="rounded border bg-white p-3">
            <div className="mb-2 text-base font-semibold text-slate-800">B. 单次时间任务（到点执行一次）</div>
            <div className="mb-3 text-xs text-slate-500">
              此类任务按“单个执行时间”触发，并支持重启补跑（错过计划点会在重启自检时补齐；已执行或已被新配置覆盖的旧计划点不会重复补跑）。
            </div>

            <div className="mb-4">
              <div className="mb-2 text-sm font-semibold text-slate-700">冻结联动任务</div>
              <AdminDataTableWrap scrollable className="rounded-none border-0 bg-transparent shadow-none ring-0">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="border px-2 py-2 text-left">任务</th>
                      <th className="border px-2 py-2 text-left">开关</th>
                      <th className="border px-2 py-2 text-left">计划</th>
                      <th className="border px-2 py-2 text-left">执行时间</th>
                      <th className="border px-2 py-2 text-left">每周</th>
                      <th className="border px-2 py-2 text-left">上次执行</th>
                      <th className="border px-2 py-2 text-left">上次成功</th>
                      <th className="border px-2 py-2 text-left">状态</th>
                      <th className="border px-2 py-2 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {freezeRows.map((r) => {
                      const d = draft[r.jobKey] || r;
                      return (
                        <tr key={r.jobKey}>
                          <td className="border px-2 py-2">{r.jobName}</td>
                          <td className="border px-2 py-2"><input type="checkbox" checked={d.enabled === 1} onChange={(e) => updateDraft(r.jobKey, { enabled: e.target.checked ? 1 : 0 })} /></td>
                          <td className="border px-2 py-2">
                            <select className="rounded border px-2 py-1" value={d.scheduleType || "DAILY"} onChange={(e) => updateDraft(r.jobKey, { scheduleType: e.target.value as "DAILY" | "WEEKLY" })}>
                              <option value="DAILY">每天</option>
                              <option value="WEEKLY">每周</option>
                            </select>
                          </td>
                          <td className="border px-2 py-2"><input type="time" className="rounded border px-2 py-1" value={d.scheduleTime || "03:00"} onChange={(e) => updateDraft(r.jobKey, { scheduleTime: e.target.value })} /></td>
                          <td className="border px-2 py-2">
                            {d.scheduleType === "WEEKLY" ? (
                              <div className="flex flex-wrap gap-1">
                                {weekOptions.map((w) => {
                                  const selected = (d.weekDays || "").split(",").includes(String(w.id));
                                  return (
                                    <button key={w.id} onClick={() => toggleWeek(r.jobKey, w.id)} className={`rounded border px-1.5 py-0.5 text-xs ${selected ? "bg-blue-600 text-white" : ""}`}>
                                      {w.label}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="border px-2 py-2">{r.lastRunAt || "-"}</td>
                          <td className="border px-2 py-2">{r.lastSuccessAt || "-"}</td>
                          <td className="border px-2 py-2">{r.lastStatus || "-"}</td>
                          <td className="border px-2 py-2">
                            <div className="flex gap-2">
                              <button className="rounded border px-2 py-1" disabled={savingKey === r.jobKey} onClick={() => void save(r.jobKey)}>保存</button>
                              <button className="rounded border px-2 py-1" disabled={savingKey === r.jobKey} onClick={() => void runNow(r.jobKey)}>立即执行</button>
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
                <div className="mb-2 text-sm font-semibold text-slate-700">{group.title}</div>
                <AdminDataTableWrap scrollable className="rounded-none border-0 bg-transparent shadow-none ring-0">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="border px-2 py-2 text-left">任务</th>
                        <th className="border px-2 py-2 text-left">开关</th>
                        <th className="border px-2 py-2 text-left">计划</th>
                        <th className="border px-2 py-2 text-left">执行时间</th>
                        <th className="border px-2 py-2 text-left">每周</th>
                        <th className="border px-2 py-2 text-left">上次执行</th>
                        <th className="border px-2 py-2 text-left">上次成功</th>
                        <th className="border px-2 py-2 text-left">状态</th>
                        <th className="border px-2 py-2 text-left">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((r) => {
                        const d = draft[r.jobKey] || r;
                        return (
                          <tr key={r.jobKey}>
                            <td className="border px-2 py-2">{r.jobName}</td>
                            <td className="border px-2 py-2"><input type="checkbox" checked={d.enabled === 1} onChange={(e) => updateDraft(r.jobKey, { enabled: e.target.checked ? 1 : 0 })} /></td>
                            <td className="border px-2 py-2">
                              <select className="rounded border px-2 py-1" value={d.scheduleType || "DAILY"} onChange={(e) => updateDraft(r.jobKey, { scheduleType: e.target.value as "DAILY" | "WEEKLY" })}>
                                <option value="DAILY">每天</option>
                                <option value="WEEKLY">每周</option>
                              </select>
                            </td>
                            <td className="border px-2 py-2"><input type="time" className="rounded border px-2 py-1" value={d.scheduleTime || "03:00"} onChange={(e) => updateDraft(r.jobKey, { scheduleTime: e.target.value })} /></td>
                            <td className="border px-2 py-2">
                              {d.scheduleType === "WEEKLY" ? (
                                <div className="flex flex-wrap gap-1">
                                  {weekOptions.map((w) => {
                                    const selected = (d.weekDays || "").split(",").includes(String(w.id));
                                    return (
                                      <button key={w.id} onClick={() => toggleWeek(r.jobKey, w.id)} className={`rounded border px-1.5 py-0.5 text-xs ${selected ? "bg-blue-600 text-white" : ""}`}>
                                        {w.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="border px-2 py-2">{r.lastRunAt || "-"}</td>
                            <td className="border px-2 py-2">{r.lastSuccessAt || "-"}</td>
                            <td className="border px-2 py-2">{r.lastStatus || "-"}</td>
                            <td className="border px-2 py-2">
                              <div className="flex gap-2">
                                <button className="rounded border px-2 py-1" disabled={savingKey === r.jobKey} onClick={() => void save(r.jobKey)}>保存</button>
                                <button className="rounded border px-2 py-1" disabled={savingKey === r.jobKey} onClick={() => void runNow(r.jobKey)}>立即执行</button>
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
