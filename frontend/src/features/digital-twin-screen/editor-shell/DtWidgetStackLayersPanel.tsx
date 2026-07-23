import { useCallback, useMemo } from "react";
import type { DtSceneWidget, DtWidgetStackLayerRow, DtWidgetStackLayerUi } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { effectiveWidgetStackLayerId, newWidgetStackLayerId } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { normalizedStackLayers } from "@/features/digital-twin-screen/layout/dtWidgetStackOrder";

function defaultLayerUiRow(): DtWidgetStackLayerUi {
  return { visible: true, locked: false };
}

function ensureLayerUi(
  prev: Record<string, DtWidgetStackLayerUi> | undefined,
  layerIds: readonly string[]
): Record<string, DtWidgetStackLayerUi> {
  const base = prev ? { ...prev } : {};
  for (const id of layerIds) {
    if (!base[id]) base[id] = defaultLayerUiRow();
  }
  return base;
}

type Props = {
  layers: readonly DtWidgetStackLayerRow[];
  layerUi: Record<string, DtWidgetStackLayerUi> | undefined;
  widgets: readonly DtSceneWidget[];
  activeLayerId: string;
  selectedWidgetId: string | null;
  onActiveLayerChange: (id: string) => void;
  /** 每次结构或显隐锁变更前由父级调用 pushUndoDiscrete */
  onDocPatch: (patch: {
    widgetStackLayers?: DtWidgetStackLayerRow[];
    widgetStackLayerUi?: Record<string, DtWidgetStackLayerUi>;
    widgets?: DtSceneWidget[];
  }) => void;
};

/**
 * 图形子图层：与 Figma/Photoshop 接近的列表（顶行 = 最前层）、显隐/锁定、拖拽排序、新建与删除。
 */
export function DtWidgetStackLayersPanel({
  layers,
  layerUi,
  widgets,
  activeLayerId,
  selectedWidgetId,
  onActiveLayerChange,
  onDocPatch,
}: Props) {
  const layerList = useMemo(() => normalizedStackLayers(layers), [layers]);
  const ui = useMemo(() => ensureLayerUi(layerUi, layerList.map((l) => l.id)), [layerList, layerUi]);

  /** UI 自上而下 = 画布由前到后 → 对应文档数组从尾到头 */
  const visualRows = useMemo(() => layerList.map((l, docIndex) => ({ layer: l, docIndex })).reverse(), [layerList]);

  const widgetCountByLayer = useCallback(
    (layerId: string) => widgets.filter((w) => effectiveWidgetStackLayerId(w, layerList) === layerId).length,
    [widgets, layerList]
  );

  const onToggleVisible = (id: string) => {
    const cur = ui[id] ?? defaultLayerUiRow();
    onDocPatch({
      widgetStackLayerUi: { ...ui, [id]: { ...cur, visible: cur.visible === false } },
    });
  };

  const onToggleLock = (id: string) => {
    const cur = ui[id] ?? defaultLayerUiRow();
    const nextLocked = !cur.locked;
    onDocPatch({
      widgetStackLayerUi: { ...ui, [id]: { ...cur, locked: nextLocked } },
    });
  };

  const onRename = (id: string, name: string) => {
    const next = layerList.map((l) => (l.id === id ? { ...l, name: name.slice(0, 80) } : l));
    onDocPatch({ widgetStackLayers: next });
  };

  const onAddLayer = () => {
    const id = newWidgetStackLayerId();
    const nextLayers = [...layerList, { id, name: `图层 ${layerList.length + 1}` }];
    const nextUi = { ...ui, [id]: defaultLayerUiRow() };
    onDocPatch({ widgetStackLayers: nextLayers, widgetStackLayerUi: nextUi });
    onActiveLayerChange(id);
  };

  const onDeleteLayer = (id: string) => {
    if (layerList.length <= 1) return;
    const ix = layerList.findIndex((l) => l.id === id);
    if (ix < 0) return;
    const fallback = ix > 0 ? layerList[ix - 1]!.id : layerList[1]!.id;
    const nextLayers = layerList.filter((l) => l.id !== id);
    const nextUi = { ...ui };
    delete nextUi[id];
    const nextWidgets = widgets.map((w) =>
      effectiveWidgetStackLayerId(w, layerList) === id ? { ...w, stackLayerId: fallback } : w
    );
    onDocPatch({ widgetStackLayers: nextLayers, widgetStackLayerUi: nextUi, widgets: nextWidgets });
    if (activeLayerId === id) onActiveLayerChange(fallback);
  };

  const onReorderDoc = (fromDoc: number, toDoc: number) => {
    if (fromDoc === toDoc || fromDoc < 0 || toDoc < 0 || fromDoc >= layerList.length || toDoc >= layerList.length) {
      return;
    }
    const next = layerList.slice();
    const [m] = next.splice(fromDoc, 1);
    if (!m) return;
    next.splice(toDoc, 0, m);
    onDocPatch({ widgetStackLayers: next });
  };

  const moveSelectionToLayer = (targetLayerId: string) => {
    if (!selectedWidgetId) return;
    const next = widgets.map((w) => (w.id === selectedWidgetId ? { ...w, stackLayerId: targetLayerId } : w));
    onDocPatch({ widgets: next });
  };

  return (
    <div className="pointer-events-auto flex flex-col gap-1 rounded-md border border-slate-600/40 bg-slate-950/55 px-2 py-1.5 text-[10px] text-slate-200 shadow-md sm:text-[11px]">
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold text-slate-300">图形图层</span>
        <button
          type="button"
          className="rounded border border-cyan-800/50 bg-cyan-950/40 px-1.5 py-0.5 text-[9px] text-cyan-100 hover:bg-cyan-900/50"
          onClick={onAddLayer}
          title="在最前新增空图层"
        >
          新建图层
        </button>
      </div>
      <p className="text-[9px] leading-tight text-slate-500">
        列表自上而下为「由前到后」。↑前/↓后 调整叠放。新建图元与侧边栏导入默认落在当前激活层。锁定层不可点选编辑；隐藏层整层不绘制。
      </p>
      {selectedWidgetId ? (
        <button
          type="button"
          className="rounded border border-slate-600/60 px-1.5 py-0.5 text-left text-[9px] text-slate-200 hover:bg-slate-800/75"
          onClick={() => moveSelectionToLayer(activeLayerId)}
        >
          将选中图元移入「当前图层」
        </button>
      ) : null}
      <ul className="max-h-[min(40vh,320px)] space-y-0.5 overflow-y-auto pr-0.5">
        {visualRows.map(({ layer, docIndex }) => {
          const rowUi = ui[layer.id] ?? defaultLayerUiRow();
          const active = layer.id === activeLayerId;
          const cnt = widgetCountByLayer(layer.id);
          return (
            <li
              key={layer.id}
              className={`flex flex-col gap-0.5 rounded border px-1 py-0.5 ${
                active ? "border-cyan-600/55 bg-cyan-950/25" : "border-slate-700/45 bg-slate-900/35"
              }`}
            >
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  title="设为当前图层（新图元落此层）"
                  className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-mono ${active ? "bg-cyan-800/60 text-white" : "bg-slate-800/60 text-slate-400"}`}
                  onClick={() => onActiveLayerChange(layer.id)}
                >
                  {active ? "当前" : "激活"}
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded px-1 py-0.5 text-[9px] text-slate-300 hover:bg-slate-800/70"
                  title={rowUi.visible ? "隐藏" : "显示"}
                  onClick={() => onToggleVisible(layer.id)}
                >
                  {rowUi.visible ? "显" : "隐"}
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded px-1 py-0.5 text-[9px] text-slate-300 hover:bg-slate-800/70"
                  title={rowUi.locked ? "解锁" : "锁定"}
                  onClick={() => onToggleLock(layer.id)}
                >
                  {rowUi.locked ? "锁" : "开"}
                </button>
                <span className="shrink-0 text-[8px] text-slate-500" title="图元数量">
                  {cnt}
                </span>
                <input
                  className="min-w-0 flex-1 rounded border border-slate-600/60 bg-slate-950 px-1 py-0.5 font-mono text-[9px] text-slate-100"
                  value={layer.name}
                  onChange={(e) => onRename(layer.id, e.target.value)}
                  maxLength={80}
                />
                <button
                  type="button"
                  className="shrink-0 rounded px-1 py-0.5 text-[8px] text-rose-200/90 hover:bg-rose-950/40 disabled:opacity-30"
                  disabled={layerList.length <= 1}
                  title="删除图层（图元并入相邻底层）"
                  onClick={() => onDeleteLayer(layer.id)}
                >
                  删
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded border border-slate-600/50 px-0.5 py-0.5 text-[8px] text-slate-300 hover:bg-slate-800/70 disabled:opacity-30"
                  disabled={docIndex >= layerList.length - 1}
                  title="向屏幕更前移动（叠在更上层）"
                  onClick={() => onReorderDoc(docIndex, docIndex + 1)}
                >
                  ↑前
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded border border-slate-600/50 px-0.5 py-0.5 text-[8px] text-slate-300 hover:bg-slate-800/70 disabled:opacity-30"
                  disabled={docIndex <= 0}
                  title="向屏幕更后移动"
                  onClick={() => onReorderDoc(docIndex, docIndex - 1)}
                >
                  ↓后
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
