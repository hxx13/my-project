import { Fragment, useMemo } from "react";
import type {
  DtSceneWidget,
  DtWidgetGraphicHint,
  DtWidgetStackLayerRow,
  DtWidgetStackLayerUi,
} from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { widgetsPaintOrder } from "@/features/digital-twin-screen/layout/dtWidgetStackOrder";
import { bareShellClass } from "@/features/digital-twin-screen/layout/dtEditorWidgetVisuals";
import { DtWidgetPlateSelectionOverlay } from "@/features/digital-twin-screen/layout/DtWidgetPlateSelectionOverlay";
import { useResolvedGraphicDataUrl } from "@/features/digital-twin-screen/layout/useResolvedGraphicDataUrl";
import { plateNormRectToScenePercentStyle } from "@/features/digital-twin-screen/layout/viewportPlaneTransform";
import { widgetPlatePointerAutoBrowse } from "@/features/digital-twin-screen/layout/widgetSymbols/dtWidgetBrowseInteraction";
import { WidgetEffectWrap } from "@/features/digital-twin-screen/layout/widgetSymbols/WidgetEffectWrap";
import { WidgetSymbolInner } from "@/features/digital-twin-screen/layout/widgetSymbols/WidgetSymbolInner";
import {
  effectiveGraphicHint,
  formatBindingValue,
  lampStateFromBinding,
  resolvePrimaryBindingSlot,
} from "@/features/digital-twin-screen/layout/widgetSymbols/widgetBindingUtils";
import type { TelemetryTagItem } from "@/telemetry-view/types";

function DtCustomGraphicImg({ w }: { w: DtSceneWidget }) {
  const src = useResolvedGraphicDataUrl(w);
  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center px-1 text-center text-[8px] leading-tight text-slate-500">
        素材未找到
        <br />
        <span className="font-mono text-[7px] opacity-80">{(w.graphicLibraryAssetId || "").slice(0, 18)}…</span>
      </div>
    );
  }
  return <img src={src} alt="" className="pointer-events-none h-full w-full object-contain" draggable={false} />;
}

export function DtSceneWidgetLayer({
  widgets,
  widgetStackLayers,
  widgetStackLayerUi,
  valueByName,
  selectedWidgetId,
  highlightWidgetIds,
  winccHint,
  suppressSelectionRing,
  sceneMetrics,
  browseInteractive,
  onBrowseWidgetCommand,
  writeBusyWidgetId,
}: {
  widgets: DtSceneWidget[];
  /** 缺省与单文档层一致：仅按 zIndex 排序 */
  widgetStackLayers?: readonly DtWidgetStackLayerRow[];
  widgetStackLayerUi?: Readonly<Record<string, DtWidgetStackLayerUi>>;
  valueByName: Map<string, TelemetryTagItem>;
  selectedWidgetId: string | null;
  highlightWidgetIds?: ReadonlySet<string> | null;
  winccHint?: string | null;
  suppressSelectionRing?: boolean;
  sceneMetrics?: { width: number; height: number; grid: { x: number; y: number; w: number; h: number } } | null;
  browseInteractive?: boolean;
  onBrowseWidgetCommand?: (widget: DtSceneWidget) => void;
  writeBusyWidgetId?: string | null;
}) {
  const orderedWidgets = useMemo(() => {
    if (widgetStackLayers && widgetStackLayers.length > 0) {
      return widgetsPaintOrder(widgets, widgetStackLayers, widgetStackLayerUi);
    }
    return widgets
      .map((w, i) => ({ w, i }))
      .sort((a, b) => {
        const za = a.w.zIndex ?? 1;
        const zb = b.w.zIndex ?? 1;
        if (za !== zb) return za - zb;
        return a.i - b.i;
      })
      .map((x) => x.w);
  }, [widgets, widgetStackLayers, widgetStackLayerUi]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[4] overflow-visible">
      {orderedWidgets.map((w) => {
        const sel =
          highlightWidgetIds != null && highlightWidgetIds.size > 0
            ? highlightWidgetIds.has(w.id)
            : w.id === selectedWidgetId;
        const hint = effectiveGraphicHint(w);
        const primary = resolvePrimaryBindingSlot(w);
        const itemPrimary = primary ? valueByName.get((primary.variableName || "").trim()) : undefined;
        const lampState = lampStateFromBinding(primary, itemPrimary);
        const labPrimary = primary ? primary.label || primary.variableName || "未绑定" : "未绑定";
        const valPrimary = primary ? formatBindingValue(primary, itemPrimary) : "—";
        const tipPrimary = `${labPrimary}: ${valPrimary}${primary?.unit ? ` ${primary.unit}` : ""}`;
        const shell = (selected: boolean) => bareShellClass(selected, { suppressRing: !!suppressSelectionRing });
        const clipContent = !(suppressSelectionRing && sel);
        const showSelectionChrome = sel && !suppressSelectionRing;

        const pos = sceneMetrics
          ? plateNormRectToScenePercentStyle(w.nx, w.ny, w.nw, w.nh, sceneMetrics.grid, sceneMetrics.width, sceneMetrics.height)
          : {
              left: `${w.nx * 100}%`,
              top: `${w.ny * 100}%`,
              width: `${w.nw * 100}%`,
              height: `${w.nh * 100}%`,
            };

        const editChrome = suppressSelectionRing && sel ? <DtWidgetPlateSelectionOverlay /> : null;

        const canBrowseWrite =
          !!browseInteractive && !suppressSelectionRing && !writeBusyWidgetId && !!onBrowseWidgetCommand;
        const pointerBuiltIn = canBrowseWrite && widgetPlatePointerAutoBrowse(w);
        const mode = w.assetInteractionMode ?? "decorative";
        const pointerCustomCmd =
          canBrowseWrite && hint === "customAsset" && mode === "commandSurface";

        const browseActivateProps =
          pointerBuiltIn || pointerCustomCmd
            ? {
                className: "cursor-pointer",
                role: "button" as const,
                tabIndex: 0,
                onClick: (e: React.MouseEvent<HTMLDivElement>) => {
                  e.stopPropagation();
                  onBrowseWidgetCommand(w);
                },
                onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onBrowseWidgetCommand(w);
                  }
                },
              }
            : undefined;

        const hasCustomGraphic = !!(w.graphicAsset?.mime && (w.graphicAsset?.dataUrl || w.graphicLibraryAssetId));
        if (hint === "customAsset" && hasCustomGraphic) {
          const a = w.graphicAsset!;
          const overlayOn = !!primary && (w.showReadoutOverlay === true || mode === "readoutOverlay");
          const ob = primary;
          const oItem = itemPrimary;
          const oVal = ob ? formatBindingValue(ob, oItem) : "—";
          const oTip = `${ob ? ob.label || ob.variableName || "—" : "—"}: ${oVal}`;
          const busy = writeBusyWidgetId === w.id;
          const plateCls =
            pointerCustomCmd
              ? `${shell(sel)} pointer-events-auto cursor-pointer`
              : `${shell(sel)} pointer-events-none`;
          return (
            <div
              key={w.id}
              data-dt-widget-id={w.id}
              role={pointerCustomCmd ? "button" : undefined}
              tabIndex={pointerCustomCmd ? 0 : undefined}
              onClick={pointerCustomCmd ? browseActivateProps?.onClick : undefined}
              onKeyDown={pointerCustomCmd ? browseActivateProps?.onKeyDown : undefined}
              className={`absolute flex min-h-0 min-w-0 items-center justify-center rounded-sm ${plateCls} ${
                clipContent ? "overflow-hidden" : "overflow-visible"
              } ${busy ? "opacity-70" : ""}`}
              style={pos}
              title={a.name || w.title?.trim() || oTip}
            >
              <WidgetEffectWrap widget={w} alarmItem={itemPrimary}>
                <div className="@container relative flex h-full w-full items-center justify-center">
                  <DtCustomGraphicImg w={w} />
                  {overlayOn && ob ? (
                    <div className="pointer-events-none absolute bottom-0.5 left-1/2 max-w-[94%] -translate-x-1/2 truncate rounded bg-slate-950/85 px-1 py-px text-[clamp(6px,2.8cqmin,9px)] font-mono text-cyan-100 ring-1 ring-cyan-700/40">
                      {oVal}
                      {ob.unit ? <span className="text-slate-400"> {ob.unit}</span> : null}
                    </div>
                  ) : null}
                  {winccHint && w.bindings.some((b) => (b.variableName || "").trim()) ? (
                    <span className="pointer-events-none absolute left-0.5 top-0.5 max-w-[95%] truncate text-[7px] text-rose-300/95">
                      {winccHint}
                    </span>
                  ) : null}
                </div>
              </WidgetEffectWrap>
              {editChrome}
            </div>
          );
        }

        /** customAsset 且无图元像素时走内置 card 符号，避免把 customAsset 传给 WidgetSymbolInner */
        const symbolHint: Exclude<DtWidgetGraphicHint, "customAsset"> =
          hint === "customAsset" ? "card" : hint;

        return (
          <Fragment key={w.id}>
            <WidgetEffectWrap widget={w} alarmItem={itemPrimary}>
              <WidgetSymbolInner
                w={w}
                hint={symbolHint}
                valueByName={valueByName}
                winccHint={winccHint}
                primary={primary}
                itemPrimary={itemPrimary}
                lampState={lampState}
                tipPrimary={tipPrimary}
                labPrimary={labPrimary}
                valPrimary={valPrimary}
                shell={shell}
                clipContent={clipContent}
                sel={sel}
                showSelectionChrome={showSelectionChrome}
                pos={pos}
                editChrome={editChrome}
                browseActivateProps={browseActivateProps}
              />
            </WidgetEffectWrap>
          </Fragment>
        );
      })}
    </div>
  );
}
