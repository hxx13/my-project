/**
 * 遥测图元纯视觉配置（与 DtSceneWidgetLayer 解耦，便于按图元扩展或日后接独立配置文件）。
 * 指示灯 / 条形图不使用「卡片」容器，仅引用此处 token。
 */
import type { DtSceneWidget } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";

export type WidgetGraphicVisualKind = "card" | "lamp" | "bar";

/** 卡片模式：沿用 stylePreset 的壳体（唯一保留「卡片」语义的模式） */
export function cardPresetClass(id: DtSceneWidget["stylePresetId"]): string {
  switch (id) {
    case "highContrast":
      return "border border-amber-400/60 bg-slate-950/90 text-amber-50";
    case "compact":
      return "border border-slate-500/40 bg-black/60 text-slate-100 text-[10px]";
    case "glassDark":
    default:
      return "border border-cyan-500/35 bg-slate-950/75 text-slate-100 backdrop-blur-sm";
  }
}

/** 非卡片外壳：无底色大块面板；ring 与 DtSceneWidgetLayer 内编辑选框二选一（编辑态宜 suppressRing） */
export function bareShellClass(selected: boolean, opts?: { suppressRing?: boolean }): string {
  if (opts?.suppressRing) return "bg-transparent shadow-none";
  const ring = selected ? "ring-2 ring-cyan-400/90 ring-offset-2 ring-offset-[var(--dt-bg,#0b0e14)]" : "";
  return `bg-transparent shadow-none ${ring}`;
}

/** 指示灯灯体（圆形实体 + 外发光），非嵌在卡片内 */
export function lampLensClass(state: "on" | "off" | "unknown"): string {
  switch (state) {
    case "on":
      return "border border-emerald-400/90 bg-emerald-500 shadow-[0_0_18px_rgba(52,211,153,0.55),inset_0_1px_0_rgba(255,255,255,0.25)]";
    case "off":
      return "border border-slate-600/80 bg-slate-800/95 shadow-[inset_0_2px_8px_rgba(0,0,0,0.45)]";
    default:
      return "border border-slate-500/70 bg-slate-700/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]";
  }
}

export function barTrackClass(): string {
  return "h-2 w-full overflow-hidden rounded-full bg-slate-900/80 ring-1 ring-slate-600/40";
}

export function barFillClass(): string {
  return "h-full rounded-full bg-gradient-to-r from-cyan-600/90 to-cyan-400/95";
}
