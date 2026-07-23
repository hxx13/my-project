import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react";
import type { DtSceneWidget, DtWidgetBindingSlot, DtWidgetGraphicHint } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import {
  barFillClass,
  barTrackClass,
  cardPresetClass,
  lampLensClass,
} from "@/features/digital-twin-screen/layout/dtEditorWidgetVisuals";
import { dtIndustrial } from "@/features/digital-twin-screen/layout/widgetSymbols/dtIndustrialTheme";
import {
  bindingRunActive,
  deviceSpinClass,
  formatBindingValue,
  semanticTag,
} from "@/features/digital-twin-screen/layout/widgetSymbols/widgetBindingUtils";
import type { TelemetryTagItem } from "@/telemetry-view/types";

export type WidgetSymbolInnerProps = {
  w: DtSceneWidget;
  hint: Exclude<DtWidgetGraphicHint, "customAsset">;
  valueByName: Map<string, TelemetryTagItem>;
  winccHint?: string | null;
  primary: DtWidgetBindingSlot | undefined;
  itemPrimary: TelemetryTagItem | undefined;
  lampState: "on" | "off" | "unknown";
  tipPrimary: string;
  labPrimary: string;
  valPrimary: string;
  shell: (selected: boolean) => string;
  clipContent: boolean;
  sel: boolean;
  /** 浏览态选中描边（编辑态由 SceneEditSurface 外壳承担） */
  showSelectionChrome: boolean;
  pos: CSSProperties;
  editChrome: ReactNode;
  /** 浏览态写点：合并到各图元根 div（与 absolute+pos 同盒） */
  browseActivateProps?: {
    className?: string;
    onClick?: (e: MouseEvent<HTMLDivElement>) => void;
    onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
    role?: "button";
    tabIndex?: number;
  };
};

export function WidgetSymbolInner(p: WidgetSymbolInnerProps) {
  const {
    w,
    hint,
    valueByName,
    winccHint,
    primary,
    itemPrimary,
    lampState,
    tipPrimary,
    labPrimary,
    valPrimary,
    shell,
    clipContent,
    sel,
    showSelectionChrome,
    pos,
    editChrome,
    browseActivateProps,
  } = p;

  const ba = browseActivateProps;
  const bx = (cls: string) => [cls, ba?.className].filter(Boolean).join(" ");
  const baEvents =
    ba && (ba.onClick || ba.onKeyDown)
      ? { onClick: ba.onClick, onKeyDown: ba.onKeyDown, role: ba.role, tabIndex: ba.tabIndex }
      : {};

  if (hint === "roomPanel") {
    return (
      <div
        key={w.id}
        data-dt-widget-id={w.id}
        className={bx(`absolute flex min-h-0 min-w-0 flex-col rounded-lg ${shell(sel)} ${clipContent ? "overflow-hidden" : "overflow-visible"}`)}
        style={pos}
        title={w.title?.trim() || "房间区示意"}
        {...baEvents}
      >
        <div className="@container relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-end bg-gradient-to-b from-slate-600/85 via-slate-800/90 to-slate-950/95 px-1 pb-0.5 pt-1">
            <div
              className="mb-0.5 w-[78%] rounded-sm border border-white/12 bg-slate-900/70 shadow-inner"
              style={{ height: "32%", minHeight: "4px" }}
            />
            <div className="h-1 w-[88%] rounded-full bg-slate-500/35" />
          </div>
          <div className="shrink-0 space-y-0.5 border-t border-white/10 px-1 py-0.5 text-[clamp(5px,2.5cqmin,8px)]">
            {w.bindings.map((b) => {
              const item = valueByName.get((b.variableName || "").trim());
              const val = formatBindingValue(b, item);
              const lab = b.label || b.variableName || "未绑定";
              const tip = `${lab}: ${val}${b.unit ? ` ${b.unit}` : ""}`;
              return (
                <div key={b.id} className="flex items-baseline justify-between gap-0.5" title={tip}>
                  <span className="shrink-0 text-slate-400">{semanticTag(b)}</span>
                  <span className="min-w-0 truncate text-right font-mono text-cyan-100">
                    {val}
                    {b.unit ? <span className="text-slate-500"> {b.unit}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        {editChrome}
      </div>
    );
  }

  if (hint === "envThp" || hint === "envThpRow") {
    const row = hint === "envThpRow";
    return (
      <div
        key={w.id}
        data-dt-widget-id={w.id}
        className={bx(
          `absolute flex min-h-0 min-w-0 flex-col rounded-md ${shell(sel)} ${clipContent ? "overflow-hidden" : "overflow-visible"}`
        )}
        style={pos}
        title={w.title?.trim() || "环境"}
        {...baEvents}
      >
        <div className="@container relative flex min-h-0 min-w-0 flex-1 flex-col">
          {w.title ? (
            <div className="shrink-0 truncate border-b border-white/10 px-1 py-0.5 text-[clamp(6px,3cqmin,9px)] font-semibold text-slate-200">
              {w.title}
            </div>
          ) : null}
          <div
            className={`min-h-0 flex-1 px-0.5 text-[clamp(5px,2.5cqmin,8px)] ${
              row ? "flex flex-row divide-x divide-white/10" : "flex flex-col gap-0.5 py-0.5"
            }`}
          >
            {w.bindings.map((b) => {
              const item = valueByName.get((b.variableName || "").trim());
              const val = formatBindingValue(b, item);
              const lab = b.label || b.variableName || "未绑定";
              const tip = `${lab}: ${val}${b.unit ? ` ${b.unit}` : ""}`;
              return (
                <div key={b.id} className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5 px-0.5 py-0.5" title={tip}>
                  <div className="flex items-center justify-between gap-0.5 text-slate-400">
                    <span className="shrink-0 rounded bg-slate-800/80 px-0.5 font-medium text-cyan-200/90">{semanticTag(b)}</span>
                    {!row ? <span className="min-w-0 truncate text-[8px] text-slate-500">{lab}</span> : null}
                  </div>
                  <div className={`truncate font-mono text-cyan-50 ${row ? "text-center text-[clamp(5px,2.5cqmin,8px)]" : "text-right"}`}>
                    {val}
                    {b.unit ? <span className="text-slate-500"> {b.unit}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {editChrome}
      </div>
    );
  }

  if (hint === "dashButton") {
    const slot0 = w.bindings[0];
    const secondary = w.bindings[1];
    const itemP = slot0 ? valueByName.get((slot0.variableName || "").trim()) : undefined;
    const itemS = secondary ? valueByName.get((secondary.variableName || "").trim()) : undefined;
    const valP = slot0 ? formatBindingValue(slot0, itemP) : "—";
    const valS = secondary ? formatBindingValue(secondary, itemS) : "";
    const isCmd = slot0?.bindingKind === "command";
    return (
      <div
        key={w.id}
        data-dt-widget-id={w.id}
        className={bx(
          `absolute flex min-h-0 min-w-0 flex-col items-center justify-center rounded-lg border ${dtIndustrial.panelBorderStrong} ${dtIndustrial.panelBg} px-1 py-0.5 shadow-inner ${shell(sel)}`
        )}
        style={pos}
        title={slot0 ? `${slot0.label || ""}: ${valP}` : "按钮"}
        {...baEvents}
      >
        <div className="@container relative flex min-h-0 min-w-0 flex-col items-center justify-center">
          <div className="truncate text-center text-[clamp(6px,3cqmin,9px)] font-semibold text-slate-50">
            {slot0?.label || (isCmd ? "指令" : "状态")}
          </div>
          <div className="mt-0.5 truncate text-center font-mono text-[clamp(6px,2.8cqmin,9px)] text-cyan-100">
            {isCmd ? valP || "—" : valP}
          </div>
          {secondary ? (
            <div className="mt-0.5 truncate text-center text-[8px] text-slate-400">
              {secondary.label}: <span className="font-mono text-cyan-200/90">{valS}</span>
            </div>
          ) : null}
        </div>
        {editChrome}
      </div>
    );
  }

  if (hint === "switchToggle") {
    const on = lampState === "on";
    const off = lampState === "off";
    return (
      <div
        key={w.id}
        data-dt-widget-id={w.id}
        className={bx(`absolute flex items-center justify-center p-px ${shell(sel)}`)}
        style={pos}
        title={tipPrimary}
        {...baEvents}
      >
        <div className="@container relative flex h-full w-full items-center justify-center">
          <div
            className={`relative h-[20%] min-h-[4px] w-[40%] max-w-[min(64cqmin,92%)] rounded-full border ${dtIndustrial.steel} bg-gradient-to-b from-slate-800/95 to-slate-950 shadow-inner ${
              on ? `ring-1 ${dtIndustrial.accentRing}` : off ? "" : "ring-1 ring-amber-500/25"
            }`}
          >
            <div
              className={`absolute top-1/2 aspect-square h-[76%] -translate-y-1/2 rounded-full border border-white/15 shadow-sm ${
                on ? "right-px bg-emerald-400" : off ? "left-px bg-slate-500" : "left-1/2 -translate-x-1/2 bg-amber-400/85"
              }`}
            />
          </div>
          <span className="sr-only">{tipPrimary}</span>
        </div>
        {editChrome}
      </div>
    );
  }

  if (hint === "switchRocker") {
    const tilt = lampState === "on" ? "rotate-[12deg]" : lampState === "off" ? "-rotate-[12deg]" : "rotate-0";
    return (
      <div
        key={w.id}
        data-dt-widget-id={w.id}
        className={bx(`absolute flex items-center justify-center p-px ${shell(sel)}`)}
        style={pos}
        title={tipPrimary}
        {...baEvents}
      >
        <div className="@container relative flex h-full w-full items-center justify-center">
          <div
            className={`relative flex h-[48%] w-[34%] max-w-[min(56cqmin,88%)] items-center justify-center rounded border ${dtIndustrial.steel} ${dtIndustrial.panelInner} p-px shadow-inner`}
          >
            <div
              className={`h-full w-[82%] rounded-sm bg-gradient-to-b from-slate-500/85 to-slate-700/90 shadow transition-transform duration-150 ${tilt}`}
            >
              <div className="h-full w-full rounded-sm border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.1)_0%,transparent_42%)]" />
            </div>
          </div>
          <span className="sr-only">{tipPrimary}</span>
        </div>
        {editChrome}
      </div>
    );
  }

  if (hint === "switchEstop") {
    const pressed = lampState === "off";
    return (
      <div
        key={w.id}
        data-dt-widget-id={w.id}
        className={bx(`absolute flex flex-col items-center justify-end pb-px ${shell(sel)}`)}
        style={pos}
        title={tipPrimary}
        {...baEvents}
      >
        <div className="@container relative flex h-full w-full flex-col items-center justify-end">
          <div className={`relative flex w-[40%] max-w-[min(48cqmin,85%)] flex-col items-center ${pressed ? "translate-y-px" : ""}`}>
            <div
              className={`aspect-square w-full max-w-[min(36cqmin,80%)] rounded-full border-[2.5px] shadow-md ${
                pressed
                  ? "border-rose-900/85 bg-rose-600 shadow-[0_0_8px_rgba(225,29,72,0.4)]"
                  : "border-rose-950/75 bg-rose-500 shadow-[inset_0_-3px_0_rgba(0,0,0,0.2)]"
              }`}
            />
            <div className="h-[26%] min-h-[2px] w-[32%] rounded-b-sm bg-gradient-to-b from-slate-500 to-slate-700 ring-1 ring-slate-900/55" />
          </div>
          <span className="sr-only">{tipPrimary}</span>
        </div>
        {editChrome}
      </div>
    );
  }

  if (hint === "switchDual") {
    const b1 = w.bindings[1];
    const item1 = b1 ? valueByName.get((b1.variableName || "").trim()) : undefined;
    const a0 = bindingRunActive(primary, itemPrimary);
    const a1 = bindingRunActive(b1, item1);
    const l0 = primary?.label || "位1";
    const l1 = b1?.label || "位2";
    return (
      <div
        key={w.id}
        data-dt-widget-id={w.id}
        className={bx(`absolute flex min-h-0 min-w-0 flex-col justify-center gap-px p-px ${shell(sel)}`)}
        style={pos}
        title={tipPrimary}
        {...baEvents}
      >
        <div className="@container relative flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-px">
          <div
            className={`flex min-h-0 flex-1 items-center justify-center rounded px-px text-[clamp(4px,2.2cqmin,7px)] font-semibold leading-none ${
              a0 ? "border border-emerald-500/50 bg-emerald-950/30 text-emerald-100" : "border border-slate-700/50 bg-slate-900/55 text-slate-500"
            }`}
          >
            {l0}
          </div>
          {b1 ? (
            <div
              className={`flex min-h-0 flex-1 items-center justify-center rounded px-px text-[clamp(4px,2.2cqmin,7px)] font-semibold leading-none ${
                a1 ? "border border-sky-500/50 bg-sky-950/30 text-sky-100" : "border border-slate-700/50 bg-slate-900/55 text-slate-500"
              }`}
            >
              {l1}
            </div>
          ) : null}
          <span className="sr-only">{tipPrimary}</span>
        </div>
        {editChrome}
      </div>
    );
  }

  if (hint === "ahuPlenum") {
    const run = bindingRunActive(primary, itemPrimary);
    return (
      <div
        key={w.id}
        data-dt-widget-id={w.id}
        className={bx(`absolute flex min-h-0 min-w-0 ${shell(sel)}`)}
        style={pos}
        title={w.title?.trim() || tipPrimary}
        {...baEvents}
      >
        <div className="@container relative flex min-h-0 min-w-0 flex-1">
          <div
            className={`relative flex min-h-0 min-w-0 flex-1 flex-row items-stretch rounded-md border ${dtIndustrial.panelBorder} ${dtIndustrial.panelBg} p-0.5 shadow-inner`}
          >
            <div className="w-[8%] shrink-0 rounded-l-sm bg-slate-600/70 ring-1 ring-slate-500/40" title="进风段" />
            <div className="relative min-h-0 min-w-0 flex-1 rounded-sm bg-[repeating-linear-gradient(90deg,rgba(51,65,85,0.35)_0_3px,transparent_3px_6px)] ring-1 ring-slate-600/30">
              <div className="absolute left-[42%] top-1/2 flex h-[30%] w-[14%] min-w-[4px] -translate-x-1/2 -translate-y-1/2 items-center justify-center">
                <div
                  className={`h-full w-full rounded-full border ${dtIndustrial.deviceRing} bg-[conic-gradient(from_0deg,rgba(34,211,238,0.28)_0deg_26deg,transparent_26deg_60deg)] shadow-inner ${deviceSpinClass(run)}`}
                  style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
                />
              </div>
            </div>
            <div className="w-[8%] shrink-0 rounded-r-sm bg-slate-600/70 ring-1 ring-slate-500/40" title="出风段" />
          </div>
        </div>
        {editChrome}
      </div>
    );
  }

  if (hint === "deviceFan") {
    const run = bindingRunActive(primary, itemPrimary);
    return (
      <div
        key={w.id}
        data-dt-widget-id={w.id}
        className={bx(`absolute flex items-center justify-center ${shell(sel)}`)}
        style={pos}
        title={tipPrimary}
        {...baEvents}
      >
        <div className="@container relative flex h-full w-full items-center justify-center">
          <div className={`relative flex h-[88%] w-[88%] items-center justify-center rounded-full border-2 ${dtIndustrial.steel} ${dtIndustrial.panelInner} shadow-inner`}>
            <div
              className={`aspect-square w-[72%] rounded-full bg-[conic-gradient(from_0deg,rgba(148,163,184,0.9)_0deg_34deg,transparent_34deg_62deg)] shadow-sm ${deviceSpinClass(run)}`}
              style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
            />
            <div className="pointer-events-none absolute inset-0 m-auto aspect-square w-[18%] rounded-full bg-slate-800 ring-1 ring-slate-500/50" />
          </div>
          <span className="sr-only">{tipPrimary}</span>
        </div>
        {editChrome}
      </div>
    );
  }

  if (hint === "devicePump") {
    const run = bindingRunActive(primary, itemPrimary);
    return (
      <div
        key={w.id}
        data-dt-widget-id={w.id}
        className={bx(`absolute flex items-center justify-center ${shell(sel)}`)}
        style={pos}
        title={tipPrimary}
        {...baEvents}
      >
        <div className="@container relative flex h-full w-full items-center justify-center">
          <div className={`relative flex h-[88%] w-[72%] items-center justify-center rounded-md border ${dtIndustrial.steel} ${dtIndustrial.panelInner} shadow-inner`}>
            <div
              className={`flex h-[70%] w-[70%] items-center justify-center rounded-full border ${dtIndustrial.deviceRing} bg-slate-800 ${deviceSpinClass(run)}`}
              style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
            >
              <div className="h-[58%] w-[58%] rounded-full border-2 border-dashed border-slate-400/80" />
            </div>
          </div>
          <span className="sr-only">{tipPrimary}</span>
        </div>
        {editChrome}
      </div>
    );
  }

  if (hint === "deviceCompressor") {
    const run = bindingRunActive(primary, itemPrimary);
    return (
      <div
        key={w.id}
        data-dt-widget-id={w.id}
        className={bx(`absolute flex items-center justify-center ${shell(sel)}`)}
        style={pos}
        title={tipPrimary}
        {...baEvents}
      >
        <div className="@container relative flex h-full w-full items-center justify-center">
          <div
            className={`relative flex h-[82%] w-[88%] flex-col items-center justify-center rounded-md border ${dtIndustrial.panelBorder} bg-gradient-to-b from-slate-800/95 to-slate-950/95 px-1 shadow-inner`}
          >
            <div className="h-[18%] w-[70%] shrink-0 rounded-t-sm bg-slate-600/80 ring-1 ring-slate-500/40" />
            <div className="relative flex min-h-0 w-full flex-1 items-center justify-center py-0.5">
              <div
                className={`aspect-square w-[min(52cqmin,55%)] rounded-full border-2 border-dashed border-amber-500/50 bg-slate-900/60 ${deviceSpinClass(run)}`}
                style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
              />
            </div>
            <div className="h-[12%] w-[85%] shrink-0 rounded-b-sm bg-slate-700/90 ring-1 ring-slate-600/40" />
          </div>
          <span className="sr-only">{tipPrimary}</span>
        </div>
        {editChrome}
      </div>
    );
  }

  if (hint === "lamp" && primary) {
    return (
      <div
        key={w.id}
        data-dt-widget-id={w.id}
        className={bx(`absolute flex items-center justify-center ${shell(sel)} rounded-full`)}
        style={pos}
        {...baEvents}
      >
        <div className="@container relative flex h-full w-full items-center justify-center">
          <div className={`aspect-square w-[min(88cqmin,92%)] max-h-[92%] shrink-0 rounded-full ${lampLensClass(lampState)}`} title={tipPrimary} />
          <span className="sr-only">{tipPrimary}</span>
          {winccHint && (primary.variableName || "").trim() ? (
            <span className="pointer-events-none absolute bottom-0.5 left-1/2 max-w-[95%] -translate-x-1/2 truncate text-[8px] text-rose-300/95">
              {winccHint}
            </span>
          ) : null}
        </div>
        {editChrome}
      </div>
    );
  }

  if (hint === "acUnit") {
    const isWide = w.nw >= w.nh;
    return (
      <div
        key={w.id}
        data-dt-widget-id={w.id}
        className={bx(`absolute flex min-h-0 min-w-0 items-stretch justify-stretch rounded-md ${shell(sel)}`)}
        style={pos}
        title={w.title?.trim() || "空调单元（示意）"}
        {...baEvents}
      >
        <div className="@container relative flex min-h-0 min-w-0 flex-1">
          <div
            className={`flex min-h-0 min-w-0 flex-1 gap-0.5 rounded-md border ${dtIndustrial.panelBorder} ${dtIndustrial.panelBg} p-1 shadow-inner ${
              isWide ? "flex-col" : "flex-row"
            }`}
          >
            <div className="shrink-0 rounded-sm bg-slate-600/90 ring-1 ring-slate-500/40" style={isWide ? { height: "18%" } : { width: "18%" }} />
            <div
              className={`min-h-0 min-w-0 flex-1 rounded-sm ring-1 ring-slate-600/35 ${
                isWide
                  ? "bg-[repeating-linear-gradient(180deg,rgba(148,163,184,0.22)_0_2px,transparent_2px_5px)]"
                  : "bg-[repeating-linear-gradient(90deg,rgba(148,163,184,0.22)_0_2px,transparent_2px_5px)]"
              }`}
            />
            <div className="shrink-0 rounded-sm bg-slate-700/90 ring-1 ring-slate-500/40" style={isWide ? { height: "14%" } : { width: "14%" }} />
          </div>
        </div>
        {editChrome}
      </div>
    );
  }

  if (hint === "bar") {
    return (
      <div
        key={w.id}
        data-dt-widget-id={w.id}
        className={bx(`absolute flex min-h-0 min-w-0 flex-col justify-center gap-1 px-0.5 py-0.5 ${shell(sel)} rounded-md`)}
        style={pos}
        title={w.title?.trim() || undefined}
        {...baEvents}
      >
        <div className="@container relative flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-1">
          {w.bindings.map((b) => {
            const item = valueByName.get((b.variableName || "").trim());
            const val = formatBindingValue(b, item);
            const raw = item?.value != null && item.value !== "" ? String(item.value).trim() : "";
            const n = b.format === "number" && raw ? Number(raw.replace(",", ".")) : NaN;
            const r = Number.isFinite(n) ? Math.max(0, Math.min(1, Math.abs(n) / (Math.abs(n) > 1 ? 100 : 1))) : 0.2;
            const lab = b.label || b.variableName || "未绑定";
            const tip = `${lab}: ${val}${b.unit ? ` ${b.unit}` : ""}`;
            return (
              <div key={b.id} className="min-h-0 min-w-0" title={tip}>
                <span className="sr-only">{tip}</span>
                <div className={barTrackClass()}>
                  <div className={barFillClass()} style={{ width: `${r * 100}%` }} />
                </div>
              </div>
            );
          })}
          {winccHint && w.bindings.some((b) => (b.variableName || "").trim()) ? (
            <div className="truncate text-center text-[8px] text-rose-300/90">{winccHint}</div>
          ) : null}
        </div>
        {editChrome}
      </div>
    );
  }

  return (
    <div
      key={w.id}
      data-dt-widget-id={w.id}
      className={bx(
        `absolute flex min-h-0 min-w-0 flex-col rounded-md shadow-md ${cardPresetClass(w.stylePresetId)} ${
          showSelectionChrome ? "ring-2 ring-cyan-400/90" : ""
        } ${clipContent ? "overflow-hidden" : "overflow-visible"}`
      )}
      style={pos}
      {...baEvents}
    >
      <div className="@container relative flex min-h-0 min-w-0 flex-1 flex-col">
        {w.title ? (
          <div className="shrink-0 truncate border-b border-white/10 px-1 py-0.5 text-[clamp(6px,3cqmin,9px)] font-semibold">
            {w.title}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 space-y-0.5 overflow-hidden px-1 py-0.5 text-[clamp(5px,2.5cqmin,8px)]">
          {w.bindings.map((b) => {
            const item = valueByName.get((b.variableName || "").trim());
            const val = formatBindingValue(b, item);
            const lab = b.label || b.variableName || "未绑定";
            return (
              <div key={b.id} className="flex min-h-0 min-w-0 items-baseline justify-between gap-1" title={`${lab}: ${val}${b.unit ? ` ${b.unit}` : ""}`}>
                <span className="line-clamp-2 min-w-0 shrink text-slate-400">{lab}</span>
                <span className="min-w-0 max-w-[55%] truncate text-right font-mono text-cyan-100">
                  {val}
                  {b.unit ? <span className="text-slate-500"> {b.unit}</span> : null}
                </span>
              </div>
            );
          })}
        </div>
        {winccHint && w.bindings.some((b) => (b.variableName || "").trim()) ? (
          <div className="truncate px-1 pb-0.5 text-[9px] text-rose-300/90">{winccHint}</div>
        ) : null}
      </div>
      {editChrome}
    </div>
  );
}
