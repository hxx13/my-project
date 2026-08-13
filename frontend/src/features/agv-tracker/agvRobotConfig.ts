/**
 * AGV 小车单点配置 —— 全局唯一数据源。
 *
 * 此前 IP / 标签 / 颜色 / jobKey 散落在 15 个文件里硬编码，
 * 新增一台车要改十几处。现在统一在这里，各文件只从这里 import。
 *
 * 新增小车只需：
 *   1. 在 AGV_ROBOTS 里加一行
 *   2. 后端 JobExecutionRegistry + AgvCollectorService 同步加
 *   3. DB 加对应 twin_job_schedule_config 行
 */
export type ZoneGroup = "zone1" | "zone2";

export interface AgvRobot {
  /** 完整 IP，如 172.22.159.113 */
  ip: string;
  /** 显示标签，如 AGV-5 */
  label: string;
  /** 主题色 hex */
  color: string;
  /** 所属区域组 */
  zone: ZoneGroup;
  /** 后端定时任务 jobKey，如 AGV_ROBOT_113 */
  robotKey: string;
  /** IP 尾号短标签，如 .113 */
  short: string;
}

export const AGV_ROBOTS: AgvRobot[] = [
  { ip: "172.22.159.16",  label: "AGV-1", color: "#3b82f6", zone: "zone1", robotKey: "AGV_ROBOT_16",  short: ".16" },
  { ip: "172.22.159.18",  label: "AGV-2", color: "#22c55e", zone: "zone1", robotKey: "AGV_ROBOT_18",  short: ".18" },
  { ip: "172.22.159.20",  label: "AGV-3", color: "#f59e0b", zone: "zone2", robotKey: "AGV_ROBOT_20",  short: ".20" },
  { ip: "172.22.159.22",  label: "AGV-4", color: "#8b5cf6", zone: "zone2", robotKey: "AGV_ROBOT_22",  short: ".22" },
  { ip: "172.22.159.113", label: "AGV-5", color: "#ec4899", zone: "zone1", robotKey: "AGV_ROBOT_113", short: ".113" },
  { ip: "172.22.159.115", label: "AGV-6", color: "#06b6d4", zone: "zone1", robotKey: "AGV_ROBOT_115", short: ".115" },
];

/** IP → 区域组映射（供 zoneGrouping / zone 过滤使用） */
export const AGV_ZONE_MAP: Record<string, ZoneGroup> = Object.fromEntries(
  AGV_ROBOTS.map((r) => [r.ip, r.zone]),
) as Record<string, ZoneGroup>;

/** jobKey 列表 */
export const AGV_ROBOT_KEYS: string[] = AGV_ROBOTS.map((r) => r.robotKey);

/** IP 尾号短标签列表 */
export const AGV_ROBOT_SHORTS: string[] = AGV_ROBOTS.map((r) => r.short);

/** 显示名列表 */
export const AGV_ROBOT_LABELS: string[] = AGV_ROBOTS.map((r) => r.label);

/** 按 IP 查车 */
export function getAgvRobot(ip: string): AgvRobot | undefined {
  return AGV_ROBOTS.find((r) => r.ip === ip);
}

/** 按 IP 查显示名（无则返回 IP） */
export function getAgvLabel(ip: string): string {
  return AGV_ROBOTS.find((r) => r.ip === ip)?.label ?? ip;
}

/** 按区域组查车 */
export function getAgvRobotsByZone(zone: ZoneGroup): AgvRobot[] {
  return AGV_ROBOTS.filter((r) => r.zone === zone);
}
