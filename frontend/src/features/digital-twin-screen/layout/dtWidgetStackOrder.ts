import type { DtSceneWidget, DtWidgetStackLayerRow, DtWidgetStackLayerUi } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { defaultWidgetStackLayers, effectiveWidgetStackLayerId } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";

/** 文档中的图层顺序：索引 0 为最底层，末尾为最顶层（与 DOM 绘制顺序一致） */
export function normalizedStackLayers(layers: readonly DtWidgetStackLayerRow[] | undefined): DtWidgetStackLayerRow[] {
  return layers?.length ? [...layers] : defaultWidgetStackLayers();
}

/**
 * 图元 DOM 绘制顺序：自下而上（底层图层先画，同层内 zIndex 升序）。
 * 隐藏图层整层跳过。
 */
export function widgetsPaintOrder(
  widgets: readonly DtSceneWidget[],
  layers: readonly DtWidgetStackLayerRow[] | undefined,
  layerUi: Readonly<Record<string, DtWidgetStackLayerUi>> | undefined
): DtSceneWidget[] {
  const layerList = normalizedStackLayers(layers);
  const out: DtSceneWidget[] = [];
  for (const layer of layerList) {
    if (layerUi?.[layer.id]?.visible === false) continue;
    const ws = widgets
      .filter((w) => effectiveWidgetStackLayerId(w, layerList) === layer.id)
      .slice()
      .sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));
    out.push(...ws);
  }
  return out;
}

/**
 * 编辑交互用绘制顺序：排除锁定图层上的图元（仍由 {@link widgetsPaintOrder} 负责浏览态可见性）。
 */
export function widgetsEditablePaintOrder(
  widgets: readonly DtSceneWidget[],
  layers: readonly DtWidgetStackLayerRow[] | undefined,
  layerUi: Readonly<Record<string, DtWidgetStackLayerUi>> | undefined
): DtSceneWidget[] {
  const layerList = normalizedStackLayers(layers);
  const out: DtSceneWidget[] = [];
  for (const layer of layerList) {
    if (layerUi?.[layer.id]?.visible === false) continue;
    if (layerUi?.[layer.id]?.locked) continue;
    const ws = widgets
      .filter((w) => effectiveWidgetStackLayerId(w, layerList) === layer.id)
      .slice()
      .sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));
    out.push(...ws);
  }
  return out;
}

/**
 * Alt+穿透 / 命中栈：自屏幕最前向后排列（同层 zIndex 大者在前）。
 * `skipLockedLayers`：编辑态跳过锁定图层，与 Figma 等「锁层不可点」一致。
 */
export function widgetsAltPickProbeOrder(
  widgets: readonly DtSceneWidget[],
  layers: readonly DtWidgetStackLayerRow[] | undefined,
  layerUi: Readonly<Record<string, DtWidgetStackLayerUi>> | undefined,
  opts: { skipLockedLayers: boolean }
): DtSceneWidget[] {
  const layerList = normalizedStackLayers(layers);
  const out: DtSceneWidget[] = [];
  for (let i = layerList.length - 1; i >= 0; i--) {
    const layer = layerList[i]!;
    if (layerUi?.[layer.id]?.visible === false) continue;
    if (opts.skipLockedLayers && layerUi?.[layer.id]?.locked) continue;
    const ws = widgets
      .filter((w) => effectiveWidgetStackLayerId(w, layerList) === layer.id)
      .slice()
      .sort((a, b) => (b.zIndex ?? 1) - (a.zIndex ?? 1));
    out.push(...ws);
  }
  return out;
}
