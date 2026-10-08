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

/** 指标告警级。由后端判定并下发，前端只负责上色（阈值集中在后端 Thresholds）。 */
export type MetricLevel = "ok" | "warn" | "crit";

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
  /** 后端判定的分级，直接用于上色。前端不再自己比 60/80 —— 阈值只能有一处。 */
  cpuLevel: MetricLevel;
  sysMemTotalMB: number;
  /** 平台「空闲」内存（Linux 上不含 page cache，所以它小并不代表内存紧张）。 */
  sysMemFreeMB: number;
  /**
   * Linux 的「可用内存」= /proc/meminfo 的 MemAvailable（含可回收缓存）。
   * **判断内存够不够要看它，别看 sysMemFreeMB**；-1 = 该平台取不到（Windows）。
   */
  sysMemAvailableMB: number;
  sysMemUsedPercent: number;
  sysMemLevel: MetricLevel;
  /**
   * 进程 RSS（MB），来自 /proc/self/status 的 VmRSS。非 Linux 返回 -1。
   * ⚠ 以前这里填的是 `Runtime.totalMemory()`（已提交的堆），与「堆外占用」完全不是一回事 —— 别再用错。
   */
  jvmRssMB: number;
  heapLevel: MetricLevel;
  diskPath: string;
  diskTotalGB: number;
  diskUsedGB: number;
  diskUsedPercent: number;
  diskLevel: MetricLevel;
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

/** 一组延迟统计（全局与按端点同构）。单位毫秒；count 为样本总数。 */
export interface LatencyStats {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  max: number;
  /** 仅按端点时存在 */
  path?: string;
}

export interface SlowRequest {
  path: string;
  status: number;
  ms: number;
  /** epoch millis */
  ts: number;
}

export interface AnalyticsSnapshot {
  totalRequests: number;
  uniqueVisitors: number;
  statusDistribution: Record<string, number>;
  responseTimeBuckets: Record<string, number>;
  topUrls: Array<{ path: string; count: number }>;
  top404Urls: Array<{ path: string; count: number }>;
  topUserAgents: Array<{ ua: string; count: number }>;
  /**
   * 以下为 2026-09-29 新增（内存态，进程重启清零）。
   * 全部可选：后端未升级时前端仍能按老字段渲染。
   */
  /** 全局响应时间百分位；老后端不返回时按 undefined 处理 */
  latency?: LatencyStats;
  /** 按端点延迟，后端已按 p95 降序截断为 Top N */
  endpointLatency?: LatencyStats[];
  /** 超过 1s 的最近慢请求，最新在前 */
  slowRequests?: SlowRequest[];
  count4xx?: number;
  count5xx?: number;
  /** 4xx + 5xx */
  errorCount?: number;
  /** 错误率百分比数值（1.23 表示 1.23%），不是小数 */
  errorRatePercent?: number;
}

/** 健康度评分的一个扣分因子。level 由后端算好，前端不再判阈值。 */
export interface ScoreFactor {
  key: string;
  label: string;
  /** 已经格式化好的展示值，如 "90.1%" / "1 个任务失败" */
  value: string;
  level: MetricLevel;
  weight: number;
  deduction: number;
}

export interface HealthScore {
  score: number;
  level: MetricLevel;
  factors: ScoreFactor[];
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

/** 获取健康度评分（0-100，含扣分因子明细） */
export async function fetchMonitorScore(): Promise<HealthScore> {
  const res = await authHttp.get<{ data: HealthScore }>("/v1/monitor/score");
  return unwrap(res);
}

// Re-export from clientVersion.api for convenience
export type { ClientVersionStats, BroadcastReloadResult } from './clientVersion.api';
