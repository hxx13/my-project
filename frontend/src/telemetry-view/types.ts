/** 与后端 {@code TelemetryTagItemDto} 对齐 */
export type TelemetryTagItem = {
  variableName?: string | null;
  displayLabel?: string | null;
  bundleCode?: string | null;
  bundleDisplayName?: string | null;
  floorCode?: string | null;
  roomCanonical?: string | null;
  metricKindCode?: string | null;
  metricKindLabel?: string | null;
  /** METRIC | LIMIT_MIN | LIMIT_MAX | SWITCH */
  kindRole?: string | null;
  alarmMinValue?: string | null;
  alarmMaxValue?: string | null;
  alarmMinVariableName?: string | null;
  alarmMaxVariableName?: string | null;
  alarmOutOfRange?: boolean | null;
  /** HIGH | LOW | OK */
  alarmBand?: string | null;
  /** UP | DOWN；平缓或无趋势为 null（旧 FLAT 亦不在前端画箭头） */
  valueTrend?: string | null;
  watchlistTagId?: number | null;
  alarmOverrideMin?: string | null;
  alarmOverrideMax?: string | null;
  value?: string | null;
  timestamp?: string | null;
  qualityCode?: string | null;
  dataType?: number | null;
  errorCode?: number | null;
  error?: string | null;
};

/** 与后端 {@code TelemetrySnapshotDto} 对齐 */
export type TelemetrySnapshot = {
  winccEnabled: boolean;
  fetchedAt?: string | null;
  items: TelemetryTagItem[];
  lastError?: string | null;
  winccReachable: boolean;
};

/** 与后端 {@code TelemetryWinccDockPollConfigDto} 对齐 */
export type TelemetryWinccDockPollConfig = {
  scheduleEnabled: boolean;
  pollIntervalSeconds: number;
  scheduleStartTime: string;
  scheduleEndTime: string;
  weekDays: string;
  scheduleType: string;
};

/** 结构化快照：单指标格（温/湿/压差/自定义） */
export type TelemetryStructuredMetricSlot = {
  metricKindCode: string;
  metricKindLabel?: string | null;
  item: TelemetryTagItem;
};

/** 单间卡片 */
export type TelemetryStructuredRoomCard = {
  tabKey: string;
  floorCode: string;
  bundleCode: string;
  bundleTitle: string;
  roomCanonical: string;
  sortKey: string;
  displayTitle: string;
  metrics: TelemetryStructuredMetricSlot[];
};

/** 套间 */
export type TelemetryStructuredSuiteGroup = {
  tabKey: string;
  floorCode: string;
  bundleCode: string;
  bundleTitle: string;
  suiteNorm: string;
  suiteTitle: string;
  sortKey: string;
  rooms: TelemetryStructuredRoomCard[];
};

/** 楼层一级标签（同层多 CSV 合并为一页；地下室层内再按 E 区排序） */
export type TelemetryStructuredFloorTab = {
  tabKey: string;
  title: string;
  floorCode: string;
  bundleCode: string;
  bundleTitle: string;
  suiteGroups: TelemetryStructuredSuiteGroup[];
};
