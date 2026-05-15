import type { CSSProperties } from "react";
import type { DigitalTwinScreenConfig } from "@/features/digital-twin-screen/types";

/** 将配置注入根节点 CSS 变量，组件内仅用 var(--dt-*) 与主题解耦 */
export function digitalTwinThemeStyleVars(config: DigitalTwinScreenConfig): CSSProperties {
  const { theme, layout, animation } = config;
  return {
    ["--dt-bg" as string]: theme.background,
    ["--dt-panel-bg" as string]: theme.panelBg,
    ["--dt-panel-border" as string]: theme.panelBorder,
    ["--dt-text" as string]: theme.textPrimary,
    ["--dt-text-muted" as string]: theme.textMuted,
    ["--dt-cyan" as string]: theme.accentCyan,
    ["--dt-green" as string]: theme.accentGreen,
    ["--dt-amber" as string]: theme.accentAmber,
    ["--dt-red" as string]: theme.accentRed,
    ["--dt-duct-dim" as string]: theme.ductDim,
    ["--dt-duct-bright" as string]: theme.ductBright,
    ["--dt-room-gap" as string]: `${layout.roomGridGapPx}px`,
    ["--dt-duct-stroke" as string]: `${layout.ductStrokePx}px`,
    ["--dt-duct-glow" as string]: `${layout.ductGlowPx}px`,
    ["--dt-duct-cycle" as string]: `${animation.ductDashCycleSec}s`,
    ["--dt-scan-cycle" as string]: `${animation.scanLineCycleSec}s`,
    ["--dt-noise-opacity" as string]: String(animation.noiseOpacity),
    ["--dt-phase-stagger" as string]: `${animation.phaseStaggerSec}s`,
    ["--dt-room-ex-top" as string]: `${layout.roomExtrudeTopPx}px`,
    ["--dt-room-ex-side" as string]: `${layout.roomExtrudeSidePx}px`,
    ["--dt-duct-height-lift" as string]: `${layout.ductHeightVisualLiftPx}px`,
    ["--dt-room-scan-intensity" as string]: String(layout.roomScanIntensity),
  };
}
