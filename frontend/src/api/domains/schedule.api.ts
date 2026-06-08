import { authHttp } from "@/api/core/authHttp";
import type { AxiosResponse } from "axios";

export type ScheduleType = "DAILY" | "WEEKLY";

export interface JobRunOutcome {
  jobKey: string;
  summary: string;
  metrics?: Record<string, unknown>;
  noop?: boolean;
}

export interface ScheduleJobRow {
  jobKey: string;
  jobName: string;
  enabled: number;
  scheduleType: ScheduleType;
  scheduleTime: string;
  scheduleStartTime?: string;
  scheduleEndTime?: string;
  weekDays?: string;
  /** TELEMETRY_WINCC_UI / TELEMETRY_WINCC_LIMITS_UI：WinCC 轮询间隔（秒） */
  pollIntervalSeconds?: number;
  /** 仅 DAILY_EXEMPT_RESET：回收后对今日曾豁免且流水仍在馆者自动签离 */
  revokeAutoSignoutEnabled?: number;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastStatus?: string;
  lastError?: string;
}

type SpringResult<T> = {
  code?: number;
  success?: boolean;
  message?: string;
  data?: T;
};

function unwrapResult<T>(res: AxiosResponse<SpringResult<T>>): T {
  return res.data?.data as T;
}

export const fetchScheduleJobs = async (): Promise<ScheduleJobRow[]> => {
  const res = await authHttp.get<SpringResult<ScheduleJobRow[]>>("/v1/twin/schedules");
  const data = unwrapResult(res);
  return Array.isArray(data) ? data : [];
};

export const updateScheduleJob = async (
  jobKey: string,
  payload: {
    enabled: boolean;
    scheduleType?: ScheduleType;
    scheduleTime?: string;
    scheduleStartTime?: string;
    scheduleEndTime?: string;
    weekDays?: string;
    pollIntervalSeconds?: number;
    revokeAutoSignoutEnabled?: boolean;
  }
): Promise<ScheduleJobRow> => {
  const res = await authHttp.put<SpringResult<ScheduleJobRow>>(`/v1/twin/schedules/${jobKey}`, payload);
  const saved = unwrapResult(res);
  if (!saved || typeof saved !== "object" || !("jobKey" in saved)) {
    throw new Error("保存失败：服务端未返回配置");
  }
  return saved;
};

export const runScheduleJobNow = async (jobKey: string): Promise<JobRunOutcome> => {
  const res = await authHttp.post<SpringResult<JobRunOutcome>>(`/v1/twin/schedules/${jobKey}/run`);
  const outcome = unwrapResult(res);
  if (!outcome || typeof outcome !== "object" || !("summary" in outcome)) {
    throw new Error("执行失败：服务端未返回执行结果");
  }
  return outcome;
};
