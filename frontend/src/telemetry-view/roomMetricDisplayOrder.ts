/**
 * 房间卡片内测点展示顺序：温度 → 湿度 → 压差 → 其它（同档内按变量名稳定排序，不随读数变化）。
 * 与 Java {@code FacilityLayoutRulebook#roomMetricDisplayRank} 一致。
 */

/** 排序只读 metricKind* 与 item.variableName；设施折叠等场景 item 还含 roomCanonical */
export type SlotLike = {
  metricKindCode?: string | null;
  metricKindLabel?: string | null;
  item?: { variableName?: string | null; roomCanonical?: string | null } | null;
};

/** 0 温度 1 湿度 2 压差/压力 3 其它 */
export function metricSlotRoomDisplayRank(s: SlotLike): number {
  const code = (s.metricKindCode || "").trim().toUpperCase();
  const lb = (s.metricKindLabel || "").trim();
  if (code === "TEMP" || code.startsWith("TEMP") || lb.includes("温度") || lb.includes("气温")) return 0;
  if (code === "HUM" || code === "RH" || code.startsWith("HUM") || lb.includes("湿度") || lb.includes("相对湿度")) {
    return 1;
  }
  if (
    code === "PRESSURE" ||
    code.startsWith("PRESSURE") ||
    lb.includes("压差") ||
    lb.includes("压力") ||
    lb.includes("压强")
  ) {
    return 2;
  }
  return 3;
}

export function compareMetricsInRoomRowOrder(a: SlotLike, b: SlotLike): number {
  const ra = metricSlotRoomDisplayRank(a);
  const rb = metricSlotRoomDisplayRank(b);
  if (ra !== rb) return ra - rb;
  return (a.item?.variableName || "").localeCompare(b.item?.variableName || "", "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
}
