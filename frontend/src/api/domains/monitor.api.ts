/**
 * 系统监控 API 层
 *
 * 基路径: /api/v1/monitor (authHttp)
 * 角色要求: ADMIN+
 */

import { authHttp } from "@/api/core/authHttp";

// ═══════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════

export interface SocketClientInfo {
  ip: string;
  userId: string;
  channel: string;
}

export interface HealthItem {
  label: string;          // "Spring Boot" | "MySQL" | "Socket.IO" | "CosyVoice" | "Nginx"
  status: "UP" | "DOWN" | "DEGRADED" | "UNKNOWN";
  responseMs: number;
  detail: string;         // "8/20 连接" | "端口 50000" | "3 客户端"
  error?: string;
  /** Socket.IO enriched fields (present only on Socket.IO card) */
  totalClients?: number;
  webClients?: number;
  mobileClients?: number;
  studentClients?: number;
  clients?: SocketClientInfo[];
}

export interface ResourceSnapshot {
  heapUsedMB: number;
  heapMaxMB: number;
  heapUsedPercent: number;
  nonHeapUsedMB: number;
  nonHeapMaxMB: number;
  gcYoungCount: number;
  gcFullCount: number;
  gcTotalPauseMs: number;
  threadLive: number;
  threadPeak: number;
  threadDaemon: number;
  threadBlocked: number;
  cpuProcessPercent: number;
  cpuSystemPercent: number;
  sysMemTotalMB: number;
  sysMemFreeMB: number;
  sysMemUsedPercent: number;
  jvmRssMB: number;
  diskPath: string;
  diskTotalGB: number;
  diskUsedGB: number;
  diskUsedPercent: number;
  hikariActive: number;
  hikariIdle: number;
  hikariPending: number;
  hikariMax: number;
}

export interface JobSnapshot {
  jobKey: string;              // "TELEMETRY_WINCC_UI"
  jobName: string;             // "WinCC 遥测拉取"
  enabled: boolean;
  running: boolean;
  status: "RUNNING" | "SUCCESS" | "FAILED" | "IDLE" | "DISABLED" | "OVERDUE";
  lastRunAt: string | null;    // ISO datetime
  lastSuccessAt: string | null;
  lastStatus: string | null;   // "SUCCESS" | "FAILED"
  lastError: string | null;
  lastDurationMs: number | null;
  scheduleDescription: string; // "每 5 分钟" | "每天 08:00"
  nextExpectedAt: string | null;
  todayCount: number;
  todaySuccessRate: number;
  scheduleType: string;        // "CRON" | "INTERVAL" | "DAILY" | "WEEKLY"
}

export interface MonitorLogEntry {
  ts: string;          // ISO datetime
  jobKey: string;
  jobName: string;
  success: boolean;
  detail: string;
}

export interface PendingTimer {
  userId: string;
  userName?: string;
  state: string;               // PENDING_ACTIVATION | AUTO_EXIT_SCHEDULED
  channelCode: string;
  scheduledExitAt: string;     // ISO — 到期时间
  activatedAt: string | null;
}

export interface TimerSnapshot {
  pendingTimers: PendingTimer[];
  lastPullTick: string | null;      // ISO — 门禁即时拉取最近执行
  lastDueTick: string | null;       // ISO — 规则引擎到期处理最近执行
  swingPullIntervalMs: number;      // 门禁拉取 tick 间隔（15s 硬编码或配置）
  dueProcessIntervalMs: number;     // 到期处理 tick 间隔（app.dahua-swing.due-process-ms）
  winccRefreshIntervalMs: number;   // WinCC 刷新 tick 间隔（app.wincc.scheduler-tick-ms）
}

export interface TimerHistoryEntry {
  eventTime: string | null;  // ISO datetime
  stageLabel: string;        // 中文阶段标签
  userId: string;
  userName: string;
  detail: string;            // 标准化简洁详情
}

export interface SessionClient {
  ip: string;
  userId: string;
  userName?: string;
  channel: string;
}

export interface SessionSnapshot {
  socketClients: SessionClient[];
  totalClients: number;
  webCount: number;
  mobileCount: number;
  studentCount: number;
}

export interface AnalyticsSnapshot {
  totalRequests: number;
  uniqueVisitors: number;
  statusDistribution: Record<string, number>;
  responseTimeBuckets: Record<string, number>;
  topUrls: Array<{ path: string; count: number }>;
  top404Urls: Array<{ path: string; count: number }>;
  topUserAgents: Array<{ ua: string; count: number }>;
}

// ═══════════════════════════════════════════
// 工具
// ═══════════════════════════════════════════

/** Result<T> 包装解包（对齐 schedule.api.ts 的 unwrapResult 模式） */
function unwrap<T>(res: { data: { data: T } }): T {
  return res.data.data;
}

// ═══════════════════════════════════════════
// API 函数
// ═══════════════════════════════════════════

/** 获取服务健康状态 */
export async function fetchMonitorHealth(): Promise<HealthItem[]> {
  const res = await authHttp.get<{ data: HealthItem[] }>("/v1/monitor/health");
  return unwrap(res);
}

/** 获取 JVM / 系统资源指标 */
export async function fetchMonitorResources(): Promise<ResourceSnapshot> {
  const res = await authHttp.get<{ data: ResourceSnapshot }>("/v1/monitor/resources");
  return unwrap(res);
}

/** 获取全部定时任务实时状态 */
export async function fetchMonitorJobs(): Promise<JobSnapshot[]> {
  const res = await authHttp.get<{ data: JobSnapshot[] }>("/v1/monitor/jobs");
  return unwrap(res);
}

/** 获取最近调度日志 */
export async function fetchMonitorRecentLogs(limit = 20): Promise<MonitorLogEntry[]> {
  const res = await authHttp.get<{ data: MonitorLogEntry[] }>("/v1/monitor/recent-logs", {
    params: { limit },
  });
  return unwrap(res);
}

/** 手动触发一次任务执行 */
export async function triggerMonitorJob(jobKey: string): Promise<{ ok: boolean; message: string }> {
  const res = await authHttp.post<{ data: { ok: boolean; message: string } }>(
    `/v1/monitor/jobs/${encodeURIComponent(jobKey)}/run`,
  );
  return unwrap(res);
}

/** 获取活跃计时器状态 */
export async function fetchTimers(): Promise<TimerSnapshot> {
  const res = await authHttp.get<{ data: TimerSnapshot }>("/v1/monitor/timers");
  return unwrap(res);
}

/** 获取最近 50 条通行联动事件（计时器历史） */
export async function fetchTimerHistory(): Promise<TimerHistoryEntry[]> {
  const res = await authHttp.get<{ data: TimerHistoryEntry[] }>("/v1/monitor/timer-history");
  return unwrap(res);
}

/** 获取当前 Socket.IO 客户端会话列表 */
export async function fetchMonitorSessions(): Promise<SessionSnapshot> {
  const res = await authHttp.get<{ data: SessionSnapshot }>("/v1/monitor/sessions");
  return unwrap(res);
}

/** 获取访问分析快照 */
export async function fetchMonitorAnalytics(): Promise<AnalyticsSnapshot> {
  const res = await authHttp.get<{ data: AnalyticsSnapshot }>("/v1/monitor/analytics");
  return unwrap(res);
}

// Re-export from clientVersion.api for convenience
export type { ClientVersionStats, BroadcastReloadResult } from './clientVersion.api';
