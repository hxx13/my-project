/** 数字孪生大屏：类型与配置契约（与 defaultDigitalTwinScreenConfig 对齐） */

export type AcZoneId = "left" | "right";

/** 由阈值推导的展示档位，供边框色与风管脉冲系数使用 */
export type RoomVisualBand = "normal" | "warn" | "critical";

export type RoomCellModel = {
  roomId: string;
  columnIndex: number;
  rowIndex: number;
  displayName: string;
  temperatureC: number;
  humidityPct: number;
  /** 可选：后端状态码，首版 Mock 可省略 */
  sourceStatus?: string;
};

export type DigitalTwinThresholds = {
  tempC: { warnHigh: number; criticalHigh: number; warnLow: number; criticalLow: number };
  humidityPct: { warnHigh: number; criticalHigh: number; warnLow: number; criticalLow: number };
};

export type DigitalTwinGridConfig = {
  columns: number;
  rows: number;
};

export type DigitalTwinThemeConfig = {
  background: string;
  panelBg: string;
  panelBorder: string;
  textPrimary: string;
  textMuted: string;
  accentCyan: string;
  accentGreen: string;
  accentAmber: string;
  accentRed: string;
  ductDim: string;
  ductBright: string;
};

export type DigitalTwinLayoutConfig = {
  /** 顶部空调条高度占场景比例上限（由 CSS 与 min/max 约束） */
  acStripMinPx: number;
  acStripMaxPx: number;
  roomGridGapPx: number;
  ductStrokePx: number;
  ductGlowPx: number;
  /** 风管截面半宽（像素），过大时按列宽比例收缩 */
  ductChannelHalfWidthPx: number;
  /** 房间伪 2.5D：顶面挤出高度、左墙宽度（像素级观感） */
  roomExtrudeTopPx: number;
  roomExtrudeSidePx: number;
  /** 管道顶点「伪高度」0–1 映射到平面上的像素抬升（等距错觉，非真 3D） */
  ductHeightVisualLiftPx: number;
  /** 布局编辑器：归一化网格吸附步长（0–1），如 0.015625≈1/64 */
  ductLayoutSnapGrid: number;
  /** 房间布局编辑器：归一化网格吸附步长（0–1）；可与 ductLayoutSnapGrid 一致 */
  roomLayoutSnapGrid: number;
  /** 遥测图元移动/缩放：plate 吸附步长（0–1），0 表示不吸附（与房间网格解耦，避免横拖时 ny 被独立吸到格点） */
  widgetLayoutSnapGrid: number;
  /** 房间旋转步进（度）；首版 UI 固定三态 0/±45，此项供后续扩展 */
  roomRotationSnapDeg: number;
  /** 房间扫描高光强度 0–1，映射到 CSS 变量 */
  roomScanIntensity: number;
};

export type DigitalTwinAnimationConfig = {
  ductDashCycleSec: number;
  scanLineCycleSec: number;
  noiseOpacity: number;
  /** 列间风管动画相位错开（秒） */
  phaseStaggerSec: number;
  mockDriftIntervalMs: number;
};

export type DigitalTwinMockConfig = {
  seed: number;
  tempCenter: number;
  tempSpread: number;
  humidityCenter: number;
  humiditySpread: number;
};

export type DigitalTwinScreenConfig = {
  title: string;
  grid: DigitalTwinGridConfig;
  theme: DigitalTwinThemeConfig;
  layout: DigitalTwinLayoutConfig;
  animation: DigitalTwinAnimationConfig;
  thresholds: DigitalTwinThresholds;
  mock: DigitalTwinMockConfig;
};

export type RoomVisualState = {
  band: RoomVisualBand;
  /** 0..1 风管脉冲速度系数 */
  ductPulseFactor: number;
  /** 用于 CSS 的强调色（已是具体颜色字符串） */
  accentColor: string;
  borderColor: string;
};

/** 风管一段：槽体外壳 + 中心脊线（流线光沿脊线走） */
export type DuctChannelModel = {
  id: string;
  zone: AcZoneId;
  columnIndex: number;
  /** 槽体截面四边形（闭合） */
  shellD: string;
  /** 中心线，用于 dash 流线 */
  spineD: string;
};
