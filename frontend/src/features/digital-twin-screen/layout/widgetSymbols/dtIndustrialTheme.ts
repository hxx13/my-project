/**
 * 工业组态风色板（Tailwind 类片段），与设备/面板描边统一，便于后续整库换肤。
 */
export const dtIndustrial = {
  panelBorder: "border-slate-500/65",
  panelBorderStrong: "border-slate-500/80",
  panelBg: "bg-gradient-to-b from-slate-700/92 to-slate-950/96",
  panelInner: "bg-slate-900/88",
  steel: "border-slate-600/75",
  run: "text-emerald-200",
  stop: "text-slate-400",
  alarm: "text-rose-200",
  cyanReadout: "text-cyan-100",
  accentRing: "ring-cyan-500/35",
  deviceRing: "border-cyan-600/40",
} as const;
