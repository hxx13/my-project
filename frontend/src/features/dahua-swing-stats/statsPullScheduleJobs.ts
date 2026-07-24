import type { StatsPeriodMode } from "@/features/dahua-swing-stats/statsTaskModel";

/** 与后端 JobExecutionRegistry 一致：按数据策略独立到点，回溯无对应 Job */
export const STATS_PULL_SCHEDULE_JOB = {
  PREVIOUS_DAY: "DAHUA_SWING_STATS_PULL_PREVIOUS_DAY",
  PREVIOUS_WEEK: "DAHUA_SWING_STATS_PULL_PREVIOUS_WEEK",
  SINCE_LAST: "DAHUA_SWING_STATS_PULL_SINCE_LAST",
} as const;

export type StatsPullScheduleJobKey =
  (typeof STATS_PULL_SCHEDULE_JOB)[keyof typeof STATS_PULL_SCHEDULE_JOB];

export const STATS_PULL_SCHEDULE_SECTIONS: {
  periodMode: StatsPeriodMode;
  jobKey: StatsPullScheduleJobKey;
  title: string;
  scheduleHint: string;
}[] = [
  {
    periodMode: "PREVIOUS_DAY",
    jobKey: STATS_PULL_SCHEDULE_JOB.PREVIOUS_DAY,
    title: "昨日日批",
    scheduleHint: "下方 B 区可单独配置到点时刻；结束后联动增量入库与隔离服/笼架订阅统计",
  },
];
