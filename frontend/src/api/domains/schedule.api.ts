import { authHttp } from "@/api/core/authHttp";

export type ScheduleType = "DAILY" | "WEEKLY";

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
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastStatus?: string;
  lastError?: string;
}

export const fetchScheduleJobs = async (): Promise<ScheduleJobRow[]> => {
  const res = await authHttp.get("/v1/twin/schedules");
  return res.data?.data || [];
};

export const updateScheduleJob = async (
  jobKey: string,
  payload: {
    enabled: boolean;
    scheduleType: ScheduleType;
    scheduleTime: string;
    scheduleStartTime?: string;
    scheduleEndTime?: string;
    weekDays?: string;
    pollIntervalSeconds?: number;
  }
): Promise<ScheduleJobRow | undefined> => {
  const res = await authHttp.put(`/v1/twin/schedules/${jobKey}`, payload);
  return res.data?.data;
};

export const runScheduleJobNow = async (jobKey: string) => {
  const res = await authHttp.post(`/v1/twin/schedules/${jobKey}/run`);
  return res.data?.data;
};
