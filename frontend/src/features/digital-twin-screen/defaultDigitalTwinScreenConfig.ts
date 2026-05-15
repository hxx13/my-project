import type { DigitalTwinScreenConfig } from "@/features/digital-twin-screen/types";

/** 默认配置中心：运行时可 merge 覆盖，禁止在组件内写死魔法数 */
export const defaultDigitalTwinScreenConfig: DigitalTwinScreenConfig = {
  title: "数字孪生大屏",
  grid: { columns: 4, rows: 8 },
  theme: {
    background: "#0b0e14",
    panelBg: "rgba(18, 24, 38, 0.72)",
    panelBorder: "rgba(56, 189, 248, 0.35)",
    textPrimary: "rgba(226, 232, 240, 0.95)",
    textMuted: "rgba(148, 163, 184, 0.85)",
    accentCyan: "#22d3ee",
    accentGreen: "#4ade80",
    accentAmber: "#fbbf24",
    accentRed: "#f87171",
    ductDim: "rgba(56, 189, 248, 0.22)",
    ductBright: "rgba(34, 211, 238, 0.92)",
  },
  layout: {
    acStripMinPx: 72,
    acStripMaxPx: 120,
    roomGridGapPx: 8,
    ductStrokePx: 2,
    ductGlowPx: 6,
    ductChannelHalfWidthPx: 7,
    roomExtrudeTopPx: 7,
    roomExtrudeSidePx: 9,
    ductHeightVisualLiftPx: 36,
    ductLayoutSnapGrid: 0.015625,
    roomLayoutSnapGrid: 0.015625,
    /** 0：图元拖拽跟手；若需与风管对齐可设为与 ductLayoutSnapGrid 相同 */
    widgetLayoutSnapGrid: 0,
    roomRotationSnapDeg: 45,
    roomScanIntensity: 0.38,
  },
  animation: {
    ductDashCycleSec: 2.8,
    scanLineCycleSec: 6,
    noiseOpacity: 0.04,
    phaseStaggerSec: 0.35,
    mockDriftIntervalMs: 1600,
  },
  thresholds: {
    tempC: {
      warnHigh: 26,
      criticalHigh: 28,
      warnLow: 19,
      criticalLow: 17,
    },
    humidityPct: {
      warnHigh: 72,
      criticalHigh: 80,
      warnLow: 38,
      criticalLow: 32,
    },
  },
  mock: {
    seed: 42,
    tempCenter: 23.5,
    tempSpread: 2.2,
    humidityCenter: 55,
    humiditySpread: 12,
  },
};
