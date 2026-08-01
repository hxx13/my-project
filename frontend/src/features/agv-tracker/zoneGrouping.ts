/**
 * AGV 区域分组 — 按站点前缀将空间元素划分到 zone1 / zone2
 *
 * 规则：
 *   LM1xxx / AP1xxx / CP1xxx  → zone1（AGV-1, AGV-2）
 *   LM2xxx / AP2xxx / CP2xxx  → zone2（AGV-3, AGV-4）
 *   无匹配 → 坐标回退：x < -5 → zone1, 否则 zone2
 *
 * 后续如需增加 zone3/zone4 或按楼层/地图名细分，只需：
 *   1. 扩展 ZoneGroup 类型
 *   2. 添加匹配规则
 *   3. 更新 AGV_ZONE_MAP 映射
 */

export type ZoneGroup = "zone1" | "zone2";

/** AGV IP → 所属区域组 */
export const AGV_ZONE_MAP: Record<string, ZoneGroup> = {
  "172.22.159.16": "zone1",
  "172.22.159.18": "zone1",
  "172.22.159.20": "zone2",
  "172.22.159.22": "zone2",
};

/**
 * 根据站点编号前缀判定区域组。
 * - 站点模式如 "LM1201" → zone1, "AP2005" → zone2
 * - 无匹配则用多边形坐标回退
 */
export function resolveZoneGroup(
  polygonJson: string,
  stationPattern?: string | null,
): ZoneGroup {
  // 1. 站点前缀精确匹配
  if (stationPattern) {
    const m = stationPattern.match(/^(?:LM|AP|CP)(\d)/);
    if (m) return m[1] === "1" ? "zone1" : "zone2";
  }

  // 2. 多边形首个顶点坐标回退
  try {
    const poly: number[][] = JSON.parse(polygonJson);
    if (poly.length > 0) return poly[0][0] < -5 ? "zone1" : "zone2";
  } catch {
    /* ignore parse errors */
  }

  // 3. 默认 zone2
  return "zone2";
}

/**
 * 获取给定 AGV IP 的配对（同区域组的另一台车）
 */
export function getPairIp(ip: string): string | undefined {
  const group = AGV_ZONE_MAP[ip];
  if (!group) return undefined;
  return Object.entries(AGV_ZONE_MAP)
    .find(([k, v]) => k !== ip && v === group)?.[0];
}

/**
 * 批量获取某区域组的所有 AGV IP
 */
export function getZoneGroupIps(group: ZoneGroup): string[] {
  return Object.entries(AGV_ZONE_MAP)
    .filter(([, v]) => v === group)
    .map(([k]) => k);
}
