/**
 * 系统监控 Zustand Store
 *
 * 管理监控面板全部状态：健康检查、资源指标、任务快照、调度日志、连接状态、会话列表。
 * 遵循项目现有模式：create<Type>((set, get) => ({}))
 */

import { create } from "zustand";
import type {
  HealthItem,
  ResourceSnapshot,
  JobSnapshot,
  MonitorLogEntry,
  TimerSnapshot,
  TimerHistoryEntry,
  SessionSnapshot,
} from "@/api/domains/monitor.api";
import {
  fetchMonitorHealth,
  fetchMonitorResources,
  fetchMonitorJobs,
  fetchMonitorRecentLogs,
  fetchTimers as fetchTimersApi,
  fetchTimerHistory as fetchTimerHistoryApi,
  fetchMonitorSessions,
  triggerMonitorJob,
} from "@/api/domains/monitor.api";

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

interface MonitorState {
  // ── 连接状态 ──
  socketConnected: boolean;
  lastEventAt: string | null;

  // ── 健康检查 (HTTP 30s 轮询) ──
  healthItems: HealthItem[];
  healthLoading: boolean;
  healthError: string | null;

  // ── 资源指标 (HTTP 30s 轮询) ──
  resources: ResourceSnapshot | null;
  resourcesLoading: boolean;

  // ── 任务快照 (HTTP 初始 + Socket.IO 增量) ──
  jobs: JobSnapshot[];
  jobsLoading: boolean;
  jobsError: string | null;

  // ── 调度日志 (Socket.IO 推送，上限 50) ──
  recentLogs: MonitorLogEntry[];

  // ── 活跃计时器 (HTTP 10s 轮询) ──
  timers: TimerSnapshot | null;
  timersLoading: boolean;

  // ── 计时器事件历史 (HTTP 10s 轮询) ──
  timerHistory: TimerHistoryEntry[];
  timerHistoryLoading: boolean;

  // ── Socket.IO 会话列表 (HTTP 轮询) ──
  sessions: SessionSnapshot | null;
  sessionsLoading: boolean;

  // ── Actions ──
  setSocketConnected: (connected: boolean) => void;
  updateJob: (jobKey: string, patch: Partial<JobSnapshot>) => void;
  addRecentLog: (log: MonitorLogEntry) => void;
  fetchAll: () => Promise<void>;
  fetchTimers: () => Promise<void>;
  fetchTimerHistory: () => Promise<void>;
  fetchSessions: () => Promise<void>;
  runJobNow: (jobKey: string) => Promise<{ ok: boolean; message: string }>;
}

// ═══════════════════════════════════════════
// Store
// ═══════════════════════════════════════════

export const useMonitorStore = create<MonitorState>((set, get) => ({
  socketConnected: false,
  lastEventAt: null,

  healthItems: [],
  healthLoading: true,
  healthError: null,

  resources: null,
  resourcesLoading: true,

  jobs: [],
  jobsLoading: true,
  jobsError: null,

  recentLogs: [],

  timers: null,
  timersLoading: true,

  timerHistory: [],
  timerHistoryLoading: true,

  sessions: null,
  sessionsLoading: true,

  // ── Actions ──

  setSocketConnected: (connected) => {
    set({ socketConnected: connected });
  },

  updateJob: (jobKey, patch) => {
    set((s) => ({
      jobs: s.jobs.map((j) => (j.jobKey === jobKey ? { ...j, ...patch } : j)),
      lastEventAt: new Date().toISOString(),
    }));
  },

  addRecentLog: (log) => {
    set((s) => ({
      recentLogs: [log, ...s.recentLogs].slice(0, 50),
      lastEventAt: new Date().toISOString(),
    }));
  },

  fetchAll: async () => {
    const state = get();

    // 并行请求
    const healthPromise = fetchMonitorHealth().then(
      (data) => set({ healthItems: data, healthLoading: false, healthError: null }),
      (err) => set({ healthLoading: false, healthError: String(err) }),
    );

    const resourcesPromise = fetchMonitorResources().then(
      (data) => set({ resources: data, resourcesLoading: false }),
      () => set({ resourcesLoading: false }),
    );

    const jobsPromise = state.jobs.length === 0
      ? fetchMonitorJobs().then(
          (data) => set({ jobs: data, jobsLoading: false, jobsError: null }),
          (err) => set({ jobsLoading: false, jobsError: String(err) }),
        )
      : Promise.resolve();

    const logsPromise = state.recentLogs.length === 0
      ? fetchMonitorRecentLogs(20).then(
          (data) => set({ recentLogs: data }),
          () => {},
        )
      : Promise.resolve();

    const sessionsPromise = fetchMonitorSessions().then(
      (data) => set({ sessions: data, sessionsLoading: false }),
      () => set({ sessionsLoading: false }),
    );

    await Promise.all([healthPromise, resourcesPromise, jobsPromise, logsPromise, sessionsPromise]);
  },

  fetchTimers: async () => {
    try {
      const data = await fetchTimersApi();
      set({ timers: data, timersLoading: false });
    } catch {
      set({ timersLoading: false });
    }
  },

  fetchTimerHistory: async () => {
    try {
      const data = await fetchTimerHistoryApi();
      set({ timerHistory: data, timerHistoryLoading: false });
    } catch {
      set({ timerHistoryLoading: false });
    }
  },

  fetchSessions: async () => {
    try {
      const data = await fetchMonitorSessions();
      set({ sessions: data, sessionsLoading: false });
    } catch {
      set({ sessionsLoading: false });
    }
  },

  runJobNow: async (jobKey) => {
    const result = await triggerMonitorJob(jobKey);
    // 立即标记为运行中（乐观更新）
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.jobKey === jobKey ? { ...j, running: true, status: "RUNNING" as const } : j,
      ),
    }));
    return result;
  },
}));
