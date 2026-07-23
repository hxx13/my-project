import type { EChartsOption } from "echarts";
import type { CockpitBarMetricAlarm, CockpitRoomBarRow } from "./buildCockpitFloorBlocks";

const COL_TEMP = "#fb923c";
const COL_HUM = "#22d3ee";
const COL_PRESSURE = "#c084fc";

const axisLabelColor = "#94a3b8";
const axisLineColor = "rgba(56, 189, 248, 0.22)";
const splitLineColor = "rgba(148, 163, 184, 0.1)";

/** 由驾驶舱右侧分区列容器 ResizeObserver 传入 */
export type CockpitBarLayout = {
  chartAreaHeight: number;
  columnWidth: number;
};

function baseTextStyle(): EChartsOption["textStyle"] {
  return { color: "#e2e8f0", fontFamily: "system-ui, sans-serif" };
}

function axisFont(layout: CockpitBarLayout): number {
  if (layout.columnWidth < 110) return 8;
  if (layout.columnWidth < 150) return 9;
  return 10;
}

function metricLabel(metric: "temp" | "hum" | "pressure"): string {
  return metric === "temp" ? "温度 (℃)" : metric === "hum" ? "湿度 (%)" : "压差 (Pa)";
}

function metricColor(metric: "temp" | "hum" | "pressure"): string {
  return metric === "temp" ? COL_TEMP : metric === "hum" ? COL_HUM : COL_PRESSURE;
}

function pickValue(r: CockpitRoomBarRow, metric: "temp" | "hum" | "pressure"): number | null {
  return metric === "temp" ? r.temp : metric === "hum" ? r.hum : r.pressure;
}

function pickAlarm(r: CockpitRoomBarRow, metric: "temp" | "hum" | "pressure"): CockpitBarMetricAlarm | null {
  const a = metric === "temp" ? r.tempAlarm : metric === "hum" ? r.humAlarm : r.pressureAlarm;
  return a ?? null;
}

export function metricHasAnyDataIn(
  rooms: CockpitRoomBarRow[],
  metric: "temp" | "hum" | "pressure"
): boolean {
  return rooms.some((r) => pickValue(r, metric) != null);
}

/** B1F 合并等：横轴类目取展示名按分隔符切分后的最后一段（仅一段则保留原样） */
export function cockpitCategoryAxisLastSegmentTitle(fullTitle: string): string {
  const t = (fullTitle || "").trim();
  if (!t) return t;
  const parts = t.split(/[-_/·\s，,、]+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1]! : t;
}

/** 中日韩及常见全角符号，用于从房间标题中剥离中文等非英数编号 */
const COCKPIT_TITLE_STRIP_CJK_RE =
  /[\u4e00-\u9fff\u3000-\u303f\u3040-\u30ff\u31f0-\u31ff\u3300-\u4dbf\u4dc0-\u9fff\uf900-\ufaff\uff01-\uff60]/g;

/** 横轴类目在布局估算中的「宽度单位」：全角/CJK 等占 2，ASCII 数字等占 1 */
function cockpitAxisTickLabelLayoutUnits(label: string): number {
  let u = 0;
  for (const ch of label) {
    if (/[\u2e80-\u9fff\uf900-\ufadf\uff00-\uffef\u3040-\u30ff]/.test(ch)) u += 2;
    else u += 1;
  }
  return Math.max(1, u);
}

/** 轴类目是否均为短 ASCII（≤4 字）；分区列现用固定 5 格竖排，本函数保留供其它路径或旧逻辑兼容 */
function cockpitAxisLabelsAllUltraShortAscii(labels: readonly string[]): boolean {
  if (!labels.length) return true;
  for (const s of labels) {
    const t = (s || "").trim();
    if (t.length === 0) continue;
    if (t.length > 4) return false;
    if (!/^[A-Za-z0-9]+$/.test(t)) return false;
  }
  return true;
}

/**
 * 从房间标题中仅提取「字母数字房号」（须含数字等规则）；提取不到则返回空串（不返回 ?）。
 */
function cockpitExtractAsciiRoomCode(rawInput: string): string {
  const raw = (rawInput || "").trim();
  if (!raw) return "";

  const deCjk = raw.replace(COCKPIT_TITLE_STRIP_CJK_RE, " ").replace(/\s+/g, " ").trim();

  const flatTokens: string[] = [];
  for (const m of deCjk.match(/[A-Za-z0-9]+(?:[-_/][A-Za-z0-9]+)*/g) ?? []) {
    for (const part of m.split(/[-_/]/)) {
      const s = part.replace(/[^A-Za-z0-9]/g, "");
      if (s.length > 0) flatTokens.push(s);
    }
  }

  const hasDigit = (s: string) => /\d/.test(s);
  const looksLikeRoomCode = (s: string) => {
    if (!hasDigit(s) || s.length > 14) return false;
    return (
      /^[A-Za-z]{0,6}\d[A-Za-z0-9]*$/.test(s) ||
      /^\d{2,}[A-Za-z0-9]*$/.test(s) ||
      /^\d+[A-Za-z][A-Za-z0-9]*$/.test(s)
    );
  };

  let best = "";
  for (const t of flatTokens) {
    if (!looksLikeRoomCode(t)) continue;
    if (t.length >= best.length) best = t;
  }
  if (best) return best;

  const asciiRun = deCjk.replace(/[^A-Za-z0-9]+/g, "");
  if (asciiRun.length >= 2 && hasDigit(asciiRun)) return asciiRun.slice(0, 14);

  const tail = cockpitCategoryAxisLastSegmentTitle(raw)
    .replace(COCKPIT_TITLE_STRIP_CJK_RE, "")
    .replace(/[^A-Za-z0-9]+/g, "");
  if (tail.length >= 1 && hasDigit(tail)) return tail.slice(0, 14);

  return "";
}

/** 无编号时轴上展示的末段/全名最大字符数（按 Unicode 标量），略截断以控宽 */
const COCKPIT_AXIS_NAME_FALLBACK_MAX_CHARS = 10;

/**
 * 驾驶舱横轴类目：优先「字母数字房号」；无编号时退回房间展示名的末段（必要时截断 + …），
 * 不再使用 ? 占位。布局估算须基于本函数返回值（见 pickCockpitXAxisLabelLayout 传入的类目串数组）。
 */
export function cockpitCategoryAxisRoomCodeTitle(fullTitle: string): string {
  const raw = (fullTitle || "").trim();
  if (!raw) return "";
  const code = cockpitExtractAsciiRoomCode(raw);
  if (code) return code;
  let fb = cockpitCategoryAxisLastSegmentTitle(raw).trim() || raw;
  const g = [...fb];
  if (g.length > COCKPIT_AXIS_NAME_FALLBACK_MAX_CHARS) {
    return g.slice(0, COCKPIT_AXIS_NAME_FALLBACK_MAX_CHARS - 1).join("") + "…";
  }
  return fb;
}

/** 驾驶舱横轴展示用：房号优先，否则完整末段/原名（不截断到 10 字），与动态底边距 + 旋转配合单行全显 */
export function cockpitCategoryAxisRoomLabelForAxis(fullTitle: string): string {
  const raw = (fullTitle || "").trim();
  if (!raw) return "";
  const code = cockpitExtractAsciiRoomCode(raw);
  if (code) return code;
  const seg = cockpitCategoryAxisLastSegmentTitle(raw).trim();
  return seg || raw;
}

/** 分区列统一横轴：类目固定为「5 个英数字符宽」，不足用 NBSP 垫满，超出截断（与 90° 竖排 + 固定 width 对齐） */
export const COCKPIT_UNIFIED_AXIS_ALNUM_LEN = 5;

const COCKPIT_AXIS_LABEL_PAD = "\u00a0";

/**
 * 驾驶舱分区列横轴类目：统一 5 格英数字宽度；仅保留 [A-Za-z0-9]，便于竖排占位稳定、释放横向重叠。
 */
export function cockpitCategoryAxisRoomLabelFixedFiveAlnum(fullTitle: string): string {
  const raw = (fullTitle || "").trim();
  if (!raw) return COCKPIT_AXIS_LABEL_PAD.repeat(COCKPIT_UNIFIED_AXIS_ALNUM_LEN);
  let alnum = cockpitCategoryAxisRoomLabelForAxis(raw).replace(/[^A-Za-z0-9]/g, "");
  if (!alnum.length) {
    alnum = cockpitExtractAsciiRoomCode(raw).replace(/[^A-Za-z0-9]/g, "");
  }
  if (!alnum.length) {
    alnum = cockpitCategoryAxisRoomCodeTitle(raw).replace(/[^A-Za-z0-9]/g, "");
  }
  const core =
    alnum.length <= COCKPIT_UNIFIED_AXIS_ALNUM_LEN
      ? alnum
      : alnum.slice(0, COCKPIT_UNIFIED_AXIS_ALNUM_LEN);
  return core + COCKPIT_AXIS_LABEL_PAD.repeat(COCKPIT_UNIFIED_AXIS_ALNUM_LEN - core.length);
}

/** 分区列内三图统一的 grid.bottom / grid.left / grid.top + 共用横轴 label 样式（底边距 = 各行需求上取整，固定 90° 竖排） */
export type CockpitPartitionUnifiedXAxis = {
  bottom: number;
  gridLeft: number;
  gridTop: number;
  /** 同列三图横轴刻度共用：固定 90° + 5 格英数字宽；底边距按该占位估算 */
  sharedAxisLabel: Record<string, unknown>;
};

/** 驾驶舱竖直柱图可选配置（保留兼容；横轴短名与 tooltip 行为已内置） */
export type CockpitVerticalBarExtraOptions = {
  shortenCategoryToLastSegment?: boolean;
  /**
   * 分区列内叠放顺序：0=温度 1=湿度 2=压差。用于收紧与上一行之间的留白（温度略收 grid.bottom、湿度压低 grid.top）。
   */
  cockpitStackRowIndex?: 0 | 1 | 2;
  /**
   * 同列温/湿/压共用 grid + 横轴 label 样式；横轴固定 90°、类目 5 格英数字宽，底边距按该占位三行取 max。
   */
  cockpitUnifiedXAxis?: CockpitPartitionUnifiedXAxis;
};

/** 分区列固定 90° 竖排类目时，刻度带/密度项可收紧（不再为横向拥挤叠字预留大块底边） */
type CockpitGridBottomIdealMode = "default" | "partitionUnified";

/** 横轴类目标签区理想底边距 = 轴刻度带 + 与旋转角相关的标签占位（矮图收紧，减轻横轴下大块留白） */
function gridBottomPxIdeal(
  catCount: number,
  layout: CockpitBarLayout,
  labelBottomReserve: number,
  mode: CockpitGridBottomIdealMode = "default"
): number {
  const shortChart = layout.chartAreaHeight <= 96;
  if (mode === "partitionUnified") {
    const tickBand = shortChart ? 5 : 11;
    const density = shortChart
      ? catCount > 14
        ? 2
        : catCount > 10
          ? 1
          : 0
      : catCount > 14
        ? 6
        : catCount > 10
          ? 4
          : 2;
    return tickBand + labelBottomReserve + density;
  }
  const tickBand = shortChart ? 8 : layout.columnWidth < 130 ? 18 : 16;
  const density = shortChart
    ? Math.min(4, catCount > 10 ? 4 : catCount > 6 ? 3 : 2)
    : catCount > 12
      ? 12
      : catCount > 8
        ? 8
        : catCount > 5
          ? 5
          : 2;
  return tickBand + labelBottomReserve + density;
}

/**
 * 三行温湿压时每格高度很小，若 grid.bottom 仍按「理想值」会大于容器，绘图区塌成 0。
 * 按 chartAreaHeight 钳制底边距，保证坐标系有最小可绘高度。
 */
function cockpitClampedGridBottomPx(
  catCount: number,
  layout: CockpitBarLayout,
  labelBottomReserve: number,
  mode: CockpitGridBottomIdealMode = "default"
): number {
  const ideal = gridBottomPxIdeal(catCount, layout, labelBottomReserve, mode);
  const H = Math.max(1, layout.chartAreaHeight);
  const shortChart = H <= 96;
  const topReserve = shortChart
    ? Math.min(16, Math.max(6, Math.round(H * 0.12)))
    : Math.min(30, Math.max(12, Math.round(H * 0.24)));
  /** 标签区需要较大底边距时，略让出绘图区下限，优先保证类目文字在轴下方不压线 */
  let minDrawable = shortChart ? Math.max(14, Math.round(H * 0.2)) : Math.max(26, Math.round(H * 0.3));
  if (labelBottomReserve >= 52) {
    minDrawable = Math.max(22, Math.round(H * 0.26));
  } else if (labelBottomReserve >= 38) {
    minDrawable = Math.max(24, Math.round(H * 0.28));
  }
  const cap = Math.max(14, H - topReserve - minDrawable);
  return Math.min(ideal, cap);
}

/**
 * 横轴标签在坐标轴外侧（inside:false）；按每格宽度与**最终类目串**的布局宽度估算占位，在 0°～90° 间选最小可用旋转角。
 * 无统一换行布局时的回退路径（非驾驶舱分区列三图联动场景）。
 */
function pickCockpitXAxisLabelLayout(
  layout: CockpitBarLayout,
  catCount: number,
  categoryAxisLabels: readonly string[],
  axisFontPx: number
): {
  rotate: number;
  labelBottomReserve: number;
  gridLeftBoost: number;
  axisLabel: Record<string, unknown>;
} {
  const n = Math.max(1, catCount);
  const slotW = layout.columnWidth / n;
  const fs = Math.max(7, axisFontPx - 1);
  const charW = Math.max(5.1, fs * 0.52);
  const shortChart = layout.chartAreaHeight <= 96;
  const labelDownShiftPx = Math.ceil(charW);
  const maxLayoutUnits = categoryAxisLabels.length
    ? categoryAxisLabels.reduce((m, c) => Math.max(m, cockpitAxisTickLabelLayoutUnits(c || "")), 1)
    : 1;
  const textW = maxLayoutUnits * charW + 10;
  /** 单刻度可用宽度与全局上限，与 axisLabel.width 对齐；长类目只影响省略号，不再撑高 grid */
  const slotCapW = Math.max(16, Math.floor(slotW * 0.95));
  const absMaxLabelPx = shortChart ? 44 : 76;
  const labelBoxW = Math.min(textW, slotCapW, absMaxLabelPx);

  const footprint = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return labelBoxW * Math.abs(Math.cos(rad)) + fs * Math.abs(Math.sin(rad)) + (shortChart ? 4 : 6);
  };

  /** 标签在绘图区下方占用的垂直高度（近似），用于 grid.bottom；按标签盒宽度算，避免长文竖向投影顶满 */
  const verticalReserve = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    const down = labelBoxW * Math.abs(Math.sin(rad)) + fs * Math.abs(Math.cos(rad));
    const axisGap = shortChart ? (deg <= 2 ? 6 : 5) : deg <= 2 ? 14 : 11;
    const catBump = shortChart ? (n > 10 ? 3 : n > 6 ? 2 : 0) : n > 10 ? 8 : n > 6 ? 5 : 0;
    /** 与轴线间隙外的少量竖向余量 */
    const tailPad = shortChart ? 2 : 3;
    const raw = Math.round(down + axisGap + catBump + tailPad + labelDownShiftPx);
    const lo = shortChart ? 12 : 22;
    const hi = shortChart ? 48 : 108;
    return Math.min(hi, Math.max(lo, raw));
  };

  const tryAngles = [0, 30, 38, 45, 52, 60, 68, 75, 90] as const;

  let chosen: (typeof tryAngles)[number] = 90;
  for (const deg of tryAngles) {
    if (footprint(deg) <= slotW * 0.96) {
      chosen = deg;
      break;
    }
  }

  const labelBottomReserve = verticalReserve(chosen);
  /** 斜向时首刻度文字会向左外伸，略加大 grid.left，避免与 Y 轴区叠 */
  const gridLeftBoost = chosen <= 2 ? 0 : chosen >= 88 ? 0 : Math.min(14, Math.round(4 + (chosen / 90) * 10));

  const inside = false;
  if (chosen <= 2) {
    const w = Math.max(16, Math.min(Math.floor(slotW - 6), Math.floor(labelBoxW)));
    return {
      rotate: 0,
      labelBottomReserve,
      gridLeftBoost,
      axisLabel: {
        rotate: 0,
        interval: 0,
        margin: (shortChart ? 6 : 11) + labelDownShiftPx,
        fontSize: fs,
        inside,
        hideOverlap: false,
        align: "center" as const,
        verticalAlign: "top" as const,
        width: w,
        overflow: "truncate" as const,
        lineHeight: fs + 2,
      },
    };
  }

  return {
    rotate: chosen,
    labelBottomReserve,
    gridLeftBoost,
    axisLabel: {
      rotate: chosen,
      interval: 0,
      margin: (shortChart ? (chosen >= 85 ? 10 : 8) : chosen >= 85 ? 16 : 12) + labelDownShiftPx,
      fontSize: fs,
      inside,
      hideOverlap: chosen >= 68,
      /** 锚点在刻度处：center + middle 使文字框中心落在类目中心，旋转绕字心，避免以边角为轴偏离柱条 */
      align: "center" as const,
      verticalAlign: "middle" as const,
      alignMinLabel: "center" as const,
      alignMaxLabel: "center" as const,
      verticalAlignMinLabel: "middle" as const,
      verticalAlignMaxLabel: "middle" as const,
      width: Math.floor(labelBoxW),
      overflow: "truncate" as const,
      lineHeight: fs + 2,
    },
  };
}

/** 与横轴类目字号对应的单列英数字近似像素宽；用于「下移一字」与底边距加项 */
function cockpitAxisAlphanumericCharWidthPx(axisFontPx: number): number {
  const fs = Math.max(7, axisFontPx - 1);
  return Math.max(5.1, fs * 0.52);
}

/** 竖向投影：标签水平宽度 textW、字号 fs，旋转 deg 时在轴线下方占用的竖向像素（与 ECharts 几何一致） */
function cockpitXAxisLabelVerticalExtentDeg(deg: number, textW: number, fs: number): number {
  const rad = (deg * Math.PI) / 180;
  return textW * Math.abs(Math.sin(rad)) + fs * Math.abs(Math.cos(rad));
}

/** 分区列统一横轴：固定 90°，类目盒宽按 5 格英数字估算；grid.left 不加斜向补偿 */
function cockpitPartitionUnifiedSharedAxisLabelFixed90(layout: CockpitBarLayout): {
  rotate: number;
  gridLeftBoost: number;
  axisLabel: Record<string, unknown>;
} {
  const af = axisFont(layout);
  const fs = Math.max(7, af - 1);
  const shortChart = layout.chartAreaHeight <= 96;
  const charW = Math.max(5.1, fs * 0.52);
  const labelBoxW = Math.floor(COCKPIT_UNIFIED_AXIS_ALNUM_LEN * charW + 8);
  const downShift = Math.ceil(cockpitAxisAlphanumericCharWidthPx(af));
  const marginBelow = (shortChart ? 6 : 10) + downShift;
  return {
    rotate: 90,
    gridLeftBoost: 0,
    axisLabel: {
      rotate: 90,
      interval: 0,
      fontSize: fs,
      inside: false,
      hideOverlap: false,
      overflow: "none" as const,
      align: "center" as const,
      verticalAlign: "middle" as const,
      alignMinLabel: "center" as const,
      alignMaxLabel: "center" as const,
      verticalAlignMinLabel: "middle" as const,
      verticalAlignMaxLabel: "middle" as const,
      lineHeight: fs + 2,
      margin: marginBelow,
      width: labelBoxW,
    },
  };
}

/** 与 `cockpitPartitionUnifiedSharedAxisLabelFixed90` 一致：90° + 5 格宽，供 grid.bottom 中间项 */
function cockpitUnifiedFixedFiveGridBottomCoreReservePx(axisFontPx: number, shortChart: boolean): number {
  const fs = Math.max(7, axisFontPx - 1);
  const charW = Math.max(5.1, fs * 0.52);
  const textW = COCKPIT_UNIFIED_AXIS_ALNUM_LEN * charW + 8;
  const ve = cockpitXAxisLabelVerticalExtentDeg(90, textW, fs);
  const downShift = Math.ceil(cockpitAxisAlphanumericCharWidthPx(axisFontPx));
  const margin = (shortChart ? 6 : 10) + downShift;
  return Math.ceil(ve + margin);
}

type NamedValue = { name: string; v: number; alarm: CockpitBarMetricAlarm | null };

/**
 * 驾驶舱纵轴固定范围（刻度取整由 axisLabel.formatter 负责）。
 * 压差：本图数据含负值时下限 -30，否则 0；上限 60。
 */
function cockpitMetricYAxisExtent(metric: "temp" | "hum" | "pressure", vals: number[]): { min: number; max: number } {
  if (metric === "temp") return { min: 15, max: 25 };
  if (metric === "hum") return { min: 30, max: 70 };
  const hasNeg = vals.some((v) => v < 0);
  return { min: hasNeg ? -30 : 0, max: 60 };
}

const BAR_CORNER_PX = 6;

/** 竖直柱：正值圆顶 [tl,tr,br,bl]；负值圆底（向下延伸的一侧） */
function barBorderRadiusForValue(v: number): [number, number, number, number] {
  if (v >= 0) return [BAR_CORNER_PX, BAR_CORNER_PX, 0, 0];
  return [0, 0, BAR_CORNER_PX, BAR_CORNER_PX];
}

/** 与 AnimalRoomTelemetryPage.cnTelemetryAlarmBand 判定对齐：高超 / 低超 / 仅越限无 band */
function cockpitBarAlarmState(
  v: number,
  alarm: CockpitBarMetricAlarm | null | undefined
): "high" | "low" | "out" | null {
  if (!alarm) return null;
  const band = (alarm.band || "").trim().toUpperCase();
  if (band === "HIGH") return "high";
  if (band === "LOW") return "low";
  if (alarm.max != null && Number.isFinite(alarm.max) && v > alarm.max) return "high";
  if (alarm.min != null && Number.isFinite(alarm.min) && v < alarm.min) return "low";
  if (alarm.alarmOutOfRange === true) return "out";
  return null;
}

/** 本图内各点报警下限若均有值且一致，则返回该值（用于水平参考线）；上限同理 */
function uniformAlarmLineValue(rows: NamedValue[], key: "min" | "max"): number | null {
  const raw = rows.map((r) => r.alarm?.[key]).filter((x): x is number => x != null && Number.isFinite(x));
  if (!raw.length) return null;
  const first = raw[0]!;
  return raw.every((x) => x === first) ? first : null;
}

function cockpitBarSeriesData(vals: number[], baseColor: string, alarms: (CockpitBarMetricAlarm | null)[]) {
  return vals.map((v, i) => {
    const br = barBorderRadiusForValue(v);
    const st = cockpitBarAlarmState(v, alarms[i] ?? null);
    if (st === "high") {
      return {
        value: v,
        itemStyle: {
          color: "#dc2626",
          borderColor: "#fecaca",
          borderWidth: 2,
          borderRadius: br,
          shadowBlur: 10,
          shadowColor: "rgba(248, 113, 113, 0.45)",
        },
      };
    }
    if (st === "low") {
      return {
        value: v,
        itemStyle: {
          color: "#2563eb",
          borderColor: "#bfdbfe",
          borderWidth: 2,
          borderRadius: br,
          shadowBlur: 10,
          shadowColor: "rgba(59, 130, 246, 0.45)",
        },
      };
    }
    if (st === "out") {
      return {
        value: v,
        itemStyle: {
          color: baseColor,
          borderColor: "#fbbf24",
          borderWidth: 2,
          borderRadius: br,
          shadowBlur: 8,
          shadowColor: "rgba(251, 191, 36, 0.35)",
        },
      };
    }
    return { value: v, itemStyle: { color: baseColor, borderRadius: br } };
  });
}

/** 水平线标签在柱区右端；数值略收敛减少视觉抖动 */
function fmtMarkLineNum(n: number): string {
  const abs = Math.abs(n);
  const d = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return n.toFixed(d);
}

/** 标签在水平线右端；offset 为像素偏移，用于多条线 Y 接近时错开防叠 */
function markLineLabelAtLineEnd(
  text: string,
  textColor: string,
  lineRgb: string,
  offset: [number, number] = [0, 0]
) {
  return {
    formatter: text,
    color: textColor,
    position: "end" as const,
    distance: 6,
    align: "right" as const,
    verticalAlign: "middle" as const,
    fontSize: 9,
    offset,
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    borderColor: lineRgb,
    borderWidth: 1,
    borderRadius: 3,
    padding: [2, 5] as [number, number],
    shadowBlur: 4,
    shadowColor: "rgba(0, 0, 0, 0.35)",
  };
}

type MarkLineBuild = {
  y: number;
  name: string;
  text: string;
  textColor: string;
  lineRgb: string;
  lineStyle: { color: string; width: number; type: "solid" | "dashed" | "dotted" };
};

/** 在数据 Y 轴上，若两条线数值过近则标签纵向错开（像素 offset） */
function assignMarkLineLabelOffsets(builds: MarkLineBuild[], yExtent: { min: number; max: number }): [number, number][] {
  const span = Math.max(1e-6, yExtent.max - yExtent.min);
  const eps = Math.max(span * 0.042, 0.35);
  const n = builds.length;
  const offsets: [number, number][] = builds.map(() => [0, 0]);
  for (let i = 0; i < n; i++) {
    let stack = 0;
    for (let j = 0; j < i; j++) {
      if (Math.abs(builds[i]!.y - builds[j]!.y) < eps) {
        stack++;
      }
    }
    const dx = stack > 0 && stack % 2 === 1 ? -28 : 0;
    const dy = -stack * 13;
    offsets[i] = [dx, dy];
  }
  return offsets;
}

function cockpitBarMarkLineData(
  vals: number[],
  uniformMin: number | null,
  uniformMax: number | null,
  yExtent: { min: number; max: number }
) {
  const vmin = Math.min(...vals);
  const vmax = Math.max(...vals);
  const builds: MarkLineBuild[] = [
    {
      y: vmax,
      name: "peakMax",
      text: `高 ${fmtMarkLineNum(vmax)}`,
      textColor: "#fef08a",
      lineRgb: "rgba(250, 204, 21, 0.95)",
      lineStyle: { color: "rgba(250, 204, 21, 0.9)", width: 1, type: "dashed" as const },
    },
  ];
  if (vmin !== vmax) {
    builds.push({
      y: vmin,
      name: "peakMin",
      text: `低 ${fmtMarkLineNum(vmin)}`,
      textColor: "#c7d2fe",
      lineRgb: "rgba(129, 140, 248, 0.95)",
      lineStyle: { color: "rgba(129, 140, 248, 0.9)", width: 1, type: "dashed" as const },
    });
  }
  if (uniformMin != null) {
    builds.push({
      y: uniformMin,
      name: "alarmMin",
      text: `下限 ${fmtMarkLineNum(uniformMin)}`,
      textColor: "#7dd3fc",
      lineRgb: "rgba(56, 189, 248, 0.95)",
      lineStyle: { color: "rgba(56, 189, 248, 0.95)", width: 1, type: "solid" as const },
    });
  }
  if (uniformMax != null) {
    builds.push({
      y: uniformMax,
      name: "alarmMax",
      text: `上限 ${fmtMarkLineNum(uniformMax)}`,
      textColor: "#fecaca",
      lineRgb: "rgba(248, 113, 113, 0.95)",
      lineStyle: { color: "rgba(248, 113, 113, 0.95)", width: 1, type: "solid" as const },
    });
  }

  builds.sort((a, b) => a.y - b.y);
  const offs = assignMarkLineLabelOffsets(builds, yExtent);

  type MarkLineDatum = {
    yAxis: number;
    name?: string;
    label?: Record<string, unknown>;
    lineStyle?: { color: string; width: number; type: "solid" | "dashed" | "dotted" };
  };
  return builds.map((b, i) => ({
    yAxis: b.y,
    name: b.name,
    label: markLineLabelAtLineEnd(b.text, b.textColor, b.lineRgb, offs[i]),
    lineStyle: b.lineStyle,
  })) as MarkLineDatum[];
}

function barSeriesMarkLine(
  vals: number[],
  uniformMin: number | null,
  uniformMax: number | null,
  yExtent: { min: number; max: number }
) {
  return {
    silent: true,
    symbol: "none",
    precision: 2,
    animation: true,
    animationDuration: 380,
    animationDurationUpdate: 520,
    animationEasing: "cubicOut" as const,
    animationEasingUpdate: "cubicOut" as const,
    label: { show: true },
    data: cockpitBarMarkLineData(vals, uniformMin, uniformMax, yExtent),
  };
}

function cockpitValueYAxis(
  af: number,
  metric: "temp" | "hum" | "pressure",
  vals: number[],
  opts?: {
    gridIndex?: number;
    axisName?: string;
    /** 驾驶舱三行矮图：收紧纵轴名与刻度区，减少行与行之间视觉留白 */
    splitMetricCompact?: boolean;
    /** 压差量程收窄后：进一步收紧纵轴标题与刻度占用，降低「纵轴条」视觉高度 */
    pressureVisualTight?: boolean;
  }
): NonNullable<EChartsOption["yAxis"]> & Record<string, unknown> {
  const ext = cockpitMetricYAxisExtent(metric, vals);
  const gridIndex = opts?.gridIndex;
  const axisName = (opts?.axisName ?? "").trim();
  const compact = !!opts?.splitMetricCompact;
  const pressureTight = !!opts?.pressureVisualTight;
  const nameTight = compact || pressureTight;
  const labelTight = compact || pressureTight;
  return {
    ...(gridIndex !== undefined ? { gridIndex } : {}),
    type: "value",
    min: ext.min,
    max: ext.max,
    minInterval: 1,
    ...(axisName
      ? {
          /** 名称贴在纵轴最大值端（图上方近 Y 轴），横向不占左侧整列 */
          name: axisName,
          nameLocation: "end" as const,
          nameRotate: 0,
          nameGap: Math.max(
            pressureTight ? 2 : nameTight ? 3 : 6,
            Math.round(af * (pressureTight ? 0.26 : nameTight ? 0.32 : 0.55))
          ),
          nameTextStyle: {
            color: axisLabelColor,
            fontSize: Math.max(9, pressureTight ? af - 1 : af),
            fontWeight: 600,
            align: "left" as const,
          },
        }
      : {}),
    axisLabel: {
      color: axisLabelColor,
      fontSize: af - 1,
      margin: labelTight ? (pressureTight ? 1 : 2) : 4,
      formatter: (val: string | number) => String(Math.round(Number(val))),
    },
    splitLine: { lineStyle: { color: splitLineColor } },
    axisLine: { show: true, lineStyle: { color: axisLineColor } },
  };
}

function barSeriesPartial(layout: CockpitBarLayout, catCount: number, color: string, label: string) {
  return {
    name: label,
    type: "bar" as const,
    itemStyle: {
      color,
    },
    emphasis: {
      itemStyle: {
        shadowBlur: 10,
        shadowColor: "rgba(56, 189, 248, 0.35)",
      },
    },
    barMaxWidth: Math.min(10, Math.max(5, Math.floor(layout.columnWidth / Math.max(catCount * 1.2, 4)))),
    barCategoryGap: "38%",
    barGap: "12%",
    /** 略大于 0 的读数在纵轴留白后仍保证有可见柱宽（像素级下限） */
    barMinHeight: 4,
    label: { show: false },
  };
}

type TooltipParam = {
  name?: string;
  value?: number;
  marker?: string;
  dataIndex?: number;
  seriesIndex?: number;
};

function cockpitAlarmTooltipHint(v: number, alarm: CockpitBarMetricAlarm | null): string {
  if (!alarm) return "";
  const bits: string[] = [];
  if (alarm.min != null || alarm.max != null) {
    bits.push(`限 ${alarm.min ?? "—"} ~ ${alarm.max ?? "—"}`);
  }
  const st = cockpitBarAlarmState(v, alarm);
  if (st === "high") bits.push("高超");
  else if (st === "low") bits.push("低超");
  else if (st === "out") bits.push("越限");
  else if ((alarm.band || "").trim().toUpperCase() === "OK") bits.push("正常段");
  return bits.join(" · ");
}

function tooltipFormatter(
  label: string,
  resolveRoomTitle?: (dataIndex: number, seriesIndex: number) => string | undefined,
  resolveAlarmHint?: (dataIndex: number, seriesIndex: number) => string | undefined
) {
  return (params: unknown) => {
    const arr = Array.isArray(params) ? params : [params];
    const p = arr[0] as TooltipParam | undefined;
    if (!p) return "";
    const idx = Number(p.dataIndex ?? 0);
    const si = Number(p.seriesIndex ?? 0);
    const resolved = resolveRoomTitle?.(idx, si);
    const roomTitle = resolved != null && resolved.length > 0 ? resolved : (p.name ?? "");
    const v = p.value;
    const shown = v == null || !Number.isFinite(Number(v)) ? "—" : String(v);
    const hint = resolveAlarmHint?.(idx, si)?.trim();
    const tail = hint ? `<br/><span style="opacity:.92;font-size:10px">${hint}</span>` : "";
    return `${p.marker ?? ""} <b>${roomTitle}</b><br/>${label}：${shown}${tail}`;
  };
}

/**
 * 分指标 · 竖直柱状图（单图，无副图拆分）：类目在横轴；Y 轴按指标固定量程。
 * 水平虚线：本图数据最高/最低；各点报警限全图一致时实线标上下限。
 * 驾驶舱分区列传入 `cockpitUnifiedXAxis` 时：同列三图共用 grid.bottom/left/top 与横轴 label 样式；
 * grid.bottom 为各行在固定 90°、5 格英数字宽占位下估算的 max（见 `computeCockpitPartitionUnifiedAxis`）。
 */
export function cockpitSplitMetricVerticalBarOption(
  rooms: CockpitRoomBarRow[],
  metric: "temp" | "hum" | "pressure",
  layout: CockpitBarLayout,
  chartTitle: string,
  extra?: CockpitVerticalBarExtraOptions
): EChartsOption | null {
  const label = metricLabel(metric);
  const color = metricColor(metric);
  const rows: NamedValue[] = rooms
    .map((r) => {
      const v = pickValue(r, metric);
      if (v == null || !Number.isFinite(v)) return null;
      return { name: r.displayTitle, v, alarm: pickAlarm(r, metric) };
    })
    .filter((x): x is NamedValue => x != null);
  if (!rows.length) return null;

  const uxa = extra?.cockpitUnifiedXAxis;
  const useUnified = !!uxa?.sharedAxisLabel;

  /** 分区列统一：横轴固定 5 格英数字 + 90°；否则短码轴名 */
  const axisCat = useUnified ? cockpitCategoryAxisRoomLabelFixedFiveAlnum : cockpitCategoryAxisRoomCodeTitle;

  const af = axisFont(layout);
  const fullNames = rows.map((x) => x.name);
  const cats = rows.map((x) => axisCat(x.name));
  const vals = rows.map((x) => x.v);
  const alarms = rows.map((x) => x.alarm);
  const uMin = uniformAlarmLineValue(rows, "min");
  const uMax = uniformAlarmLineValue(rows, "max");

  const xLabel = useUnified
    ? {
        rotate: 0,
        labelBottomReserve: uxa!.bottom,
        gridLeftBoost: 0,
        axisLabel: uxa!.sharedAxisLabel,
      }
    : pickCockpitXAxisLabelLayout(layout, cats.length, cats, af);
  const stackIdx = extra?.cockpitStackRowIndex;

  let bottom = useUnified ? uxa!.bottom : cockpitClampedGridBottomPx(cats.length, layout, xLabel.labelBottomReserve);
  if (!useUnified && stackIdx === 0) {
    bottom = Math.max(8, Math.round(bottom * 0.8));
  }

  let gridLeft = useUnified ? uxa!.gridLeft : Math.min(34, Math.max(12, Math.round(layout.columnWidth * 0.035 + af * 1.5)) + xLabel.gridLeftBoost);

  const yExtent = cockpitMetricYAxisExtent(metric, vals);
  const H = Math.max(1, layout.chartAreaHeight);
  const hasAxisTitle = (chartTitle || "").trim().length > 0;
  const splitMetricCompact = H <= 96;

  let gridTopPx: number;
  if (useUnified) {
    gridTopPx = uxa!.gridTop;
  } else {
    gridTopPx = splitMetricCompact
      ? Math.max(
          3,
          Math.min(12, Math.round(H * 0.038 + af * 0.22)) + (hasAxisTitle ? Math.round(af * 0.75) : 0)
        )
      : Math.max(10, Math.min(26, Math.round(H * 0.08 + af * 0.4)) + (hasAxisTitle ? Math.round(af + 5) : 0));
    if (stackIdx === 1) {
      gridTopPx = Math.max(2, Math.round(gridTopPx * 0.48));
    }
    if (metric === "pressure") {
      gridTopPx = Math.max(3, Math.round(gridTopPx * 0.72));
    }
  }

  return {
    backgroundColor: "transparent",
    textStyle: baseTextStyle(),
    animationDuration: 280,
    animationDurationUpdate: 520,
    animationEasingUpdate: "cubicOut",
    title: { show: false },
    grid: {
      left: gridLeft,
      /** 略留右内边，避免 markLine 标签贴容器裁切 */
      right: layout.columnWidth < 96 ? "2%" : "3%",
      top: gridTopPx,
      bottom,
      containLabel: false,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "rgba(15, 23, 42, 0.92)",
      borderColor: "rgba(56, 189, 248, 0.35)",
      textStyle: { color: "#e2e8f0", fontSize: 10 },
      formatter: tooltipFormatter(
        label,
        (idx) => fullNames[idx],
        (idx) => cockpitAlarmTooltipHint(rows[idx]!.v, rows[idx]!.alarm)
      ),
    },
    xAxis: {
      type: "category",
      data: cats,
      axisLabel: {
        color: axisLabelColor,
        ...xLabel.axisLabel,
      },
      axisLine: { lineStyle: { color: axisLineColor } },
      axisTick: { alignWithLabel: true },
    },
    yAxis: cockpitValueYAxis(af, metric, vals, {
      axisName: chartTitle,
      splitMetricCompact,
      pressureVisualTight: metric === "pressure",
    }),
    series: [
      {
        ...barSeriesPartial(layout, cats.length, color, label),
        data: cockpitBarSeriesData(vals, color, alarms),
        markLine: barSeriesMarkLine(vals, uMin, uMax, yExtent),
      },
    ],
  };
}

function cockpitRowsForMetricUnified(rooms: CockpitRoomBarRow[], metric: "temp" | "hum" | "pressure"): NamedValue[] {
  return rooms
    .map((r) => {
      const v = pickValue(r, metric);
      if (v == null || !Number.isFinite(v)) return null;
      return { name: r.displayTitle, v, alarm: pickAlarm(r, metric) };
    })
    .filter((x): x is NamedValue => x != null);
}

function cockpitComputePartitionGridTopPx(
  metric: "temp" | "hum" | "pressure",
  stackIdx: number,
  layout: CockpitBarLayout,
  chartTitle: string,
  af: number
): number {
  const H = Math.max(1, layout.chartAreaHeight);
  const hasAxisTitle = chartTitle.trim().length > 0;
  const splitMetricCompact = H <= 96;
  let gridTopPx = splitMetricCompact
    ? Math.max(
        3,
        Math.min(12, Math.round(H * 0.038 + af * 0.22)) + (hasAxisTitle ? Math.round(af * 0.75) : 0)
      )
    : Math.max(10, Math.min(26, Math.round(H * 0.08 + af * 0.4)) + (hasAxisTitle ? Math.round(af + 5) : 0));
  if (stackIdx === 1) {
    gridTopPx = Math.max(2, Math.round(gridTopPx * 0.48));
  }
  if (metric === "pressure") {
    gridTopPx = Math.max(3, Math.round(gridTopPx * 0.72));
  }
  return gridTopPx;
}

function cockpitComputePartitionGridLeftPx(layout: CockpitBarLayout, af: number, gridLeftBoost: number): number {
  return Math.min(34, Math.max(12, Math.round(layout.columnWidth * 0.035 + af * 1.5)) + gridLeftBoost);
}

/**
 * 同列三图：横轴类目固定 90°、5 格英数字宽；grid.bottom = 各行按该占位估算取 max（再 floor）；
 * grid.left / grid.top 仍取各行上界。
 */
export function computeCockpitPartitionUnifiedAxis(
  rooms: CockpitRoomBarRow[],
  columnWidth: number,
  rowHeights: Record<"temp" | "hum" | "pressure", number>,
  stackDefs: readonly { metric: "temp" | "hum" | "pressure"; title: string }[]
): CockpitPartitionUnifiedXAxis | null {
  const activeHs: number[] = [];

  for (let i = 0; i < stackDefs.length; i++) {
    const def = stackDefs[i]!;
    if (!metricHasAnyDataIn(rooms, def.metric)) continue;
    const rows = cockpitRowsForMetricUnified(rooms, def.metric);
    if (!rows.length) continue;
    const H = rowHeights[def.metric];
    if (!(H > 0)) continue;
    activeHs.push(H);
  }

  if (!activeHs.length) return null;

  const minH = Math.min(...activeHs);
  const layoutPick: CockpitBarLayout = { columnWidth, chartAreaHeight: minH };
  const afPick = axisFont(layoutPick);
  const rotPick = cockpitPartitionUnifiedSharedAxisLabelFixed90(layoutPick);

  const BOTTOM_FLOOR = 12;
  let unifiedBottom = BOTTOM_FLOOR;

  for (let i = 0; i < stackDefs.length; i++) {
    const def = stackDefs[i]!;
    if (!metricHasAnyDataIn(rooms, def.metric)) continue;
    const rows = cockpitRowsForMetricUnified(rooms, def.metric);
    if (!rows.length) continue;
    const H = rowHeights[def.metric];
    if (!(H > 0)) continue;
    const layout: CockpitBarLayout = { columnWidth, chartAreaHeight: H };
    const af = axisFont(layout);
    const core = cockpitUnifiedFixedFiveGridBottomCoreReservePx(af, H <= 96);
    const rowBottom = cockpitClampedGridBottomPx(rows.length, layout, core, "partitionUnified");
    unifiedBottom = Math.max(unifiedBottom, rowBottom);
  }

  let unifiedGridLeft = cockpitComputePartitionGridLeftPx(layoutPick, afPick, rotPick.gridLeftBoost);
  let unifiedGridTop = 0;

  for (let i = 0; i < stackDefs.length; i++) {
    const def = stackDefs[i]!;
    if (!metricHasAnyDataIn(rooms, def.metric)) continue;
    const rows = cockpitRowsForMetricUnified(rooms, def.metric);
    if (!rows.length) continue;
    const H = rowHeights[def.metric];
    if (!(H > 0)) continue;
    const layout: CockpitBarLayout = { columnWidth, chartAreaHeight: H };
    const af = axisFont(layout);
    unifiedGridLeft = Math.max(
      unifiedGridLeft,
      cockpitComputePartitionGridLeftPx(layout, af, rotPick.gridLeftBoost)
    );
    unifiedGridTop = Math.max(
      unifiedGridTop,
      cockpitComputePartitionGridTopPx(def.metric, i, layout, def.title, af)
    );
  }

  return {
    bottom: unifiedBottom,
    gridLeft: unifiedGridLeft,
    gridTop: unifiedGridTop,
    sharedAxisLabel: rotPick.axisLabel,
  };
}
