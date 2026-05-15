import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWinccTelemetrySnapshot } from "@/api/telemetryApi";
import type {
  DtSceneWidget,
  DtWidgetAssetInteractionMode,
  DtWidgetBindingKind,
  DtWidgetBindingSemantic,
  DtWidgetBindingSlot,
  DtWidgetCommandWriteTemplate,
  DtWidgetEffectPresetId,
  DtWidgetStylePresetId,
  DtWidgetStackLayerRow,
} from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { effectiveWidgetStackLayerId } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import {
  MAX_WIDGET_GRAPHIC_DATA_URL_LEN,
  mimeFromGraphicFile,
} from "@/features/digital-twin-screen/layout/dtGraphicImport";
import { DT_WIDGET_PLATE_MIN } from "@/features/digital-twin-screen/layout/dtWidgetPlateLimits";
import {
  DT_GRAPHIC_LIBRARY_CHANGED_EVENT,
  dtGraphicLibraryList,
  dtGraphicLibraryPut,
  type DtGraphicLibraryListItem,
} from "@/features/digital-twin-screen/layout/dtGraphicLibraryIdb";

function clampWidgetPlateLayout(w: Pick<DtSceneWidget, "nx" | "ny" | "nw" | "nh">): Pick<DtSceneWidget, "nx" | "ny" | "nw" | "nh"> {
  let { nx, ny, nw, nh } = w;
  nw = Math.max(DT_WIDGET_PLATE_MIN, Math.min(1, nw));
  nh = Math.max(DT_WIDGET_PLATE_MIN, Math.min(1, nh));
  nx = Math.max(0, Math.min(1 - nw, nx));
  ny = Math.max(0, Math.min(1 - nh, ny));
  return { nx, ny, nw, nh };
}

function defaultUnitForSemantic(s: DtWidgetBindingSemantic): string {
  switch (s) {
    case "temperature":
      return "°C";
    case "humidity":
      return "%RH";
    case "pressure":
      return "hPa";
    default:
      return "";
  }
}

export function DtWidgetDetailsPanel({
  widget,
  widgetStackLayers,
  onChange,
  onTestFetch,
}: {
  widget: DtSceneWidget | null;
  /** 与场景文档一致；缺省不展示图层选择 */
  widgetStackLayers?: readonly DtWidgetStackLayerRow[];
  onChange: (next: DtSceneWidget) => void;
  onTestFetch?: () => void;
}) {
  const patch = useCallback(
    (partial: Partial<DtSceneWidget>) => {
      if (!widget) return;
      onChange({ ...widget, ...partial });
    },
    [onChange, widget]
  );

  const patchBinding = useCallback(
    (slotId: string, partial: Partial<DtWidgetBindingSlot>) => {
      if (!widget) return;
      onChange({
        ...widget,
        bindings: widget.bindings.map((b) => (b.id === slotId ? { ...b, ...partial } : b)),
      });
    },
    [onChange, widget]
  );

  const onTest = useCallback(async () => {
    onTestFetch?.();
    if (!widget) return;
    const names = widget.bindings.map((b) => b.variableName.trim()).filter(Boolean);
    if (names.length === 0) return;
    try {
      await fetchWinccTelemetrySnapshot({ sync: true, variableNames: names.join(",") });
    } catch {
      /* 错误由页面轮询 hook 展示 */
    }
  }, [onTestFetch, widget]);

  const graphicFileRef = useRef<HTMLInputElement>(null);
  const [libraryItems, setLibraryItems] = useState<DtGraphicLibraryListItem[]>([]);

  const refreshLibrary = useCallback(() => {
    void dtGraphicLibraryList()
      .then(setLibraryItems)
      .catch(() => setLibraryItems([]));
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    const onLib = () => refreshLibrary();
    window.addEventListener(DT_GRAPHIC_LIBRARY_CHANGED_EVENT, onLib);
    return () => window.removeEventListener(DT_GRAPHIC_LIBRARY_CHANGED_EVENT, onLib);
  }, [refreshLibrary]);

  /** 仅内联进场景；入库与分组在左侧「本地图片素材」 */
  const onGraphicFileChangeInline = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f || !widget) return;
      const mime = mimeFromGraphicFile(f);
      if (!mime) {
        window.alert("仅支持 SVG、PNG、JPEG、WebP、GIF");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (!dataUrl.startsWith("data:")) {
          window.alert("读取文件失败");
          return;
        }
        if (dataUrl.length > MAX_WIDGET_GRAPHIC_DATA_URL_LEN) {
          window.alert(
            `文件过大（>${MAX_WIDGET_GRAPHIC_DATA_URL_LEN} 字符）。请用左侧素材栏入库，或压缩后再内联。`
          );
          return;
        }
        onChange({
          ...widget,
          graphicHint: "customAsset",
          graphicLibraryAssetId: undefined,
          graphicAsset: { mime, dataUrl, name: f.name },
          assetInteractionMode: "decorative",
          showReadoutOverlay: false,
        });
      };
      reader.readAsDataURL(f);
    },
    [onChange, widget]
  );

  if (!widget) {
    return <p className="text-slate-500">选中画布上的显示框以编辑绑定与样式。</p>;
  }

  const patchLayout = (partial: Partial<Pick<DtSceneWidget, "nx" | "ny" | "nw" | "nh">>) => {
    if (!widget) return;
    const merged = { nx: widget.nx, ny: widget.ny, nw: widget.nw, nh: widget.nh, ...partial };
    patch(clampWidgetPlateLayout(merged));
  };

  return (
    <div className="dt-edit-shell-scroll max-h-[min(65vh,520px)] space-y-2 overflow-y-auto pr-0.5">
      {widgetStackLayers && widgetStackLayers.length > 0 ? (
        <div className="rounded border border-slate-700/50 bg-slate-900/40 p-1.5">
          <div className="mb-1 text-[9px] font-semibold text-slate-400">所属图形图层</div>
          <label className="flex flex-col gap-0.5 text-[9px] text-slate-500">
            <span>图层</span>
            <select
              className="mt-0.5 w-full rounded border border-slate-600 bg-slate-950 px-1 py-0.5 font-mono text-[10px] text-slate-100"
              value={effectiveWidgetStackLayerId(widget, widgetStackLayers)}
              onChange={(e) => patch({ stackLayerId: e.target.value })}
            >
              {widgetStackLayers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      <div className="rounded border border-slate-700/50 bg-slate-900/40 p-1.5">
        <div className="mb-1 text-[9px] font-semibold text-slate-400">画布矩形（plate 0〜1）</div>
        <p className="mb-1 text-[8px] leading-snug text-slate-500">左上原点；宽/高最小 {DT_WIDGET_PLATE_MIN}。改后若贴边会自动夹紧。</p>
        <div className="grid grid-cols-2 gap-1">
          <label className="text-[9px] text-slate-500">
            nx
            <input
              type="number"
              step={0.001}
              min={0}
              max={1}
              className="mt-0.5 w-full rounded border border-slate-600 bg-slate-950 px-1 py-0.5 font-mono text-[10px]"
              value={Number.isFinite(widget.nx) ? Math.round(widget.nx * 10000) / 10000 : 0}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                patchLayout({ nx: v });
              }}
            />
          </label>
          <label className="text-[9px] text-slate-500">
            ny
            <input
              type="number"
              step={0.001}
              min={0}
              max={1}
              className="mt-0.5 w-full rounded border border-slate-600 bg-slate-950 px-1 py-0.5 font-mono text-[10px]"
              value={Number.isFinite(widget.ny) ? Math.round(widget.ny * 10000) / 10000 : 0}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                patchLayout({ ny: v });
              }}
            />
          </label>
          <label className="text-[9px] text-slate-500">
            宽 nw
            <input
              type="number"
              step={0.001}
              min={DT_WIDGET_PLATE_MIN}
              max={1}
              className="mt-0.5 w-full rounded border border-slate-600 bg-slate-950 px-1 py-0.5 font-mono text-[10px]"
              value={Number.isFinite(widget.nw) ? Math.round(widget.nw * 10000) / 10000 : DT_WIDGET_PLATE_MIN}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                patchLayout({ nw: v });
              }}
            />
          </label>
          <label className="text-[9px] text-slate-500">
            高 nh
            <input
              type="number"
              step={0.001}
              min={DT_WIDGET_PLATE_MIN}
              max={1}
              className="mt-0.5 w-full rounded border border-slate-600 bg-slate-950 px-1 py-0.5 font-mono text-[10px]"
              value={Number.isFinite(widget.nh) ? Math.round(widget.nh * 10000) / 10000 : DT_WIDGET_PLATE_MIN}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                patchLayout({ nh: v });
              }}
            />
          </label>
        </div>
      </div>
      <div className="rounded border border-slate-700/50 bg-slate-900/40 p-1.5">
        <div className="mb-1 text-[9px] font-semibold text-slate-400">自定义图形</div>
        <p className="mb-1 text-[8px] leading-snug text-slate-500">
          入库、分组、文件夹批量导入请在左侧「本地图片素材」选择目标分组后操作。此处可将<strong>已入库</strong>素材绑定到当前图元，或选择文件<strong>仅内联</strong>进场景（约{" "}
          {MAX_WIDGET_GRAPHIC_DATA_URL_LEN} 字符上限）。
        </p>
        <input
          ref={graphicFileRef}
          type="file"
          accept=".svg,.png,.jpg,.jpeg,.webp,.gif,image/svg+xml,image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={onGraphicFileChangeInline}
        />
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="rounded border border-cyan-700/45 bg-cyan-950/35 px-1.5 py-0.5 text-[9px] text-cyan-100 hover:bg-cyan-900/45"
            onClick={() => graphicFileRef.current?.click()}
          >
            选择文件（仅内联）…
          </button>
          {widget.graphicAsset?.mime && (widget.graphicAsset?.dataUrl || widget.graphicLibraryAssetId) ? (
            <button
              type="button"
              className="rounded border border-slate-600/60 px-1.5 py-0.5 text-[9px] text-slate-300 hover:bg-slate-800/70"
              onClick={() =>
                patch({
                  graphicHint: undefined,
                  graphicAsset: undefined,
                  graphicLibraryAssetId: undefined,
                  assetInteractionMode: undefined,
                  showReadoutOverlay: undefined,
                })
              }
            >
              清除导入
            </button>
          ) : null}
        </div>
        <div className="mt-1.5 space-y-1 rounded border border-slate-700/40 bg-slate-950/35 p-1.5">
          <div className="text-[9px] font-semibold text-slate-400">引用本地素材库</div>
          <label className="block text-[9px] text-slate-500">
            从库选择绑定到当前图元
            <select
              className="mt-0.5 w-full rounded border border-slate-600 bg-slate-950 px-1 py-0.5 text-[10px]"
              value=""
              onChange={(e) => {
                const id = e.target.value;
                e.target.value = "";
                if (!id || !widget) return;
                const it = libraryItems.find((x) => x.id === id);
                if (!it) return;
                onChange({
                  ...widget,
                  graphicHint: "customAsset",
                  graphicLibraryAssetId: id,
                  graphicAsset: { mime: it.mime, name: it.name },
                  assetInteractionMode: "decorative",
                  showReadoutOverlay: false,
                });
              }}
            >
              <option value="">选择已存素材…</option>
              {libraryItems.map((it) => (
                <option key={it.id} value={it.id}>
                  {(it.name || it.id).slice(0, 28)}
                  {it.folderName ? ` · ${it.folderName}` : ""} · {Math.round(it.dataUrlLen / 1024)}KB
                </option>
              ))}
            </select>
          </label>
          {widget.graphicAsset?.dataUrl && !widget.graphicLibraryAssetId ? (
            <button
              type="button"
              className="w-full rounded border border-cyan-800/45 bg-cyan-950/30 py-0.5 text-[9px] text-cyan-100 hover:bg-cyan-900/40"
              onClick={() => {
                void (async () => {
                  if (!widget?.graphicAsset?.dataUrl) return;
                  const { mime, dataUrl, name } = widget.graphicAsset;
                  try {
                    const id = await dtGraphicLibraryPut({
                      mime,
                      name: name || widget.title || "graphic",
                      dataUrl,
                      folderId: null,
                    });
                    onChange({
                      ...widget,
                      graphicLibraryAssetId: id,
                      graphicAsset: { mime, name },
                    });
                    refreshLibrary();
                  } catch (err) {
                    window.alert(err instanceof Error ? err.message : String(err));
                  }
                })();
              }}
            >
              将当前内联图转存素材库（根目录）
            </button>
          ) : widget.graphicLibraryAssetId && !widget.graphicAsset?.dataUrl ? (
            <p className="mt-0.5 text-[8px] leading-snug text-slate-500">
              当前为素材库引用（无内联像素），「转存」仅在有内联图时出现；若需再入库可换用内联文件后再点转存。
            </p>
          ) : null}
        </div>
        {widget.graphicAsset?.name || widget.graphicLibraryAssetId ? (
          <div className="mt-0.5 truncate text-[8px] text-slate-500" title={widget.graphicLibraryAssetId}>
            {widget.graphicLibraryAssetId ? (
              <>
                素材库：<span className="font-mono text-cyan-200/80">{widget.graphicLibraryAssetId}</span>
                {widget.graphicAsset?.name ? ` · ${widget.graphicAsset.name}` : null}
              </>
            ) : (
              <>当前文件：{widget.graphicAsset?.name}</>
            )}
          </div>
        ) : null}
        {widget.graphicAsset?.mime && (widget.graphicAsset?.dataUrl || widget.graphicLibraryAssetId) ? (
          <div className="mt-1.5 space-y-1 rounded border border-slate-700/40 bg-slate-950/40 p-1.5">
            <div className="text-[9px] font-semibold text-slate-400">导入图浏览态</div>
            <label className="block text-[9px] text-slate-500">
              交互模式
              <select
                className="mt-0.5 w-full rounded border border-slate-600 bg-slate-950 px-1 py-0.5 text-[10px]"
                value={widget.assetInteractionMode ?? "decorative"}
                onChange={(e) => patch({ assetInteractionMode: e.target.value as DtWidgetAssetInteractionMode })}
              >
                <option value="decorative">纯装饰（不拦截指针）</option>
                <option value="readoutOverlay">浮层读数（主绑定槽）</option>
                <option value="commandSurface">整图点击写指令槽</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[9px] text-slate-500">
              <input
                type="checkbox"
                checked={widget.showReadoutOverlay === true}
                onChange={(e) => patch({ showReadoutOverlay: e.target.checked })}
              />
              叠加显示主绑定数值（可与装饰/写点同开）
            </label>
            {widget.assetInteractionMode === "commandSurface" && !widget.bindings.some((b) => b.bindingKind === "command") ? (
              <p className="text-[8px] leading-snug text-amber-400/95">需至少一个绑定槽设为「指令 / 写 WinCC」并填写变量名。</p>
            ) : null}
          </div>
        ) : null}
      </div>
      <label className="block">
        <span className="text-slate-400">标题</span>
        <input
          className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-1.5 py-1 text-[11px]"
          value={widget.title ?? ""}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-slate-400">样式预设</span>
        <select
          className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-1.5 py-1 text-[11px]"
          value={widget.stylePresetId}
          onChange={(e) => patch({ stylePresetId: e.target.value as DtWidgetStylePresetId })}
        >
          <option value="glassDark">暗色玻璃</option>
          <option value="highContrast">高对比</option>
          <option value="compact">紧凑</option>
        </select>
      </label>
      <label className="block">
        <span className="text-slate-400">动效</span>
        <select
          className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-1.5 py-1 text-[11px]"
          value={widget.effectPresetId}
          onChange={(e) => patch({ effectPresetId: e.target.value as DtWidgetEffectPresetId })}
        >
          <option value="none">无</option>
          <option value="pulseOnAlarm">告警脉冲（越限/质量）</option>
        </select>
      </label>
      <label className="block">
        <span className="text-slate-400">主绑定槽</span>
        <select
          className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-1.5 py-1 text-[11px]"
          value={widget.primaryBindingId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            patch({ primaryBindingId: v === "" ? undefined : v });
          }}
        >
          <option value="">自动（首槽）</option>
          {widget.bindings.map((b) => (
            <option key={b.id} value={b.id}>
              {(b.label || b.variableName || b.id).slice(0, 24)}
            </option>
          ))}
        </select>
      </label>
      {widget.bindings.some((b) => b.bindingKind === "command") ? (
        <label className="block">
          <span className="text-slate-400">指令写入模板</span>
          <select
            className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-1.5 py-1 text-[11px]"
            value={widget.commandWriteValueTemplate ?? "toggle01"}
            onChange={(e) => patch({ commandWriteValueTemplate: e.target.value as DtWidgetCommandWriteTemplate })}
          >
            <option value="toggle01">翻转 0/1（默认）</option>
            <option value="momentaryPress">脉冲写 1 后写 0</option>
            <option value="literal">固定值（见下栏）</option>
          </select>
        </label>
      ) : null}
      {widget.commandWriteValueTemplate === "literal" ? (
        <label className="block">
          <span className="text-slate-400">literal 写入值</span>
          <input
            className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-1.5 py-1 font-mono text-[11px]"
            value={widget.commandWriteLiteral ?? ""}
            onChange={(e) => patch({ commandWriteLiteral: e.target.value })}
            placeholder="如 1、0、true"
          />
        </label>
      ) : null}
      <div className="border-t border-slate-600/40 pt-1">
        <div className="mb-1 font-semibold text-slate-400">WinCC 绑定</div>
        <p className="mb-1 text-[9px] leading-snug text-slate-500">
          变量名与 WinCC 导入一致；测点类型用于默认单位与画布示意；指令槽在浏览态可点击下发（需后端写权限）。最多 32 个变量参与轮询。
        </p>
        {widget.bindings.map((b) => (
          <div key={b.id} className="mb-2 rounded border border-slate-700/50 bg-slate-900/40 p-1.5">
            <div className="text-[9px] text-slate-500">{b.label || "槽"}</div>
            <input
              className="mt-0.5 w-full rounded border border-slate-600 bg-slate-950 px-1 py-0.5 font-mono text-[10px]"
              placeholder="VariableName"
              value={b.variableName}
              onChange={(e) => patchBinding(b.id, { variableName: e.target.value })}
            />
            <div className="mt-1 grid grid-cols-2 gap-1">
              <label className="text-[9px] text-slate-500">
                单位
                <input
                  className="mt-0.5 w-full rounded border border-slate-600 bg-slate-950 px-1 py-0.5 text-[10px]"
                  value={b.unit ?? ""}
                  onChange={(e) => patchBinding(b.id, { unit: e.target.value })}
                />
              </label>
              <label className="text-[9px] text-slate-500">
                小数位
                <input
                  type="number"
                  min={0}
                  max={6}
                  className="mt-0.5 w-full rounded border border-slate-600 bg-slate-950 px-1 py-0.5 text-[10px]"
                  value={b.decimals ?? 1}
                  onChange={(e) => patchBinding(b.id, { decimals: Math.max(0, Math.min(6, Number(e.target.value) || 0)) })}
                />
              </label>
            </div>
            <label className="mt-1 block text-[9px] text-slate-500">
              格式
              <select
                className="mt-0.5 w-full rounded border border-slate-600 bg-slate-950 px-1 py-0.5 text-[10px]"
                value={b.format ?? "number"}
                onChange={(e) => patchBinding(b.id, { format: e.target.value === "text" ? "text" : "number" })}
              >
                <option value="number">数字</option>
                <option value="text">文本</option>
              </select>
            </label>
            <label className="mt-1 block text-[9px] text-slate-500">
              测点类型
              <select
                className="mt-0.5 w-full rounded border border-slate-600 bg-slate-950 px-1 py-0.5 text-[10px]"
                value={b.semantic ?? "generic"}
                onChange={(e) => {
                  const semantic = e.target.value as DtWidgetBindingSemantic;
                  const du = defaultUnitForSemantic(semantic);
                  const keep = (b.unit ?? "").trim().length > 0;
                  patchBinding(b.id, { semantic, unit: keep ? b.unit : du || undefined });
                }}
              >
                <option value="generic">通用</option>
                <option value="temperature">温度</option>
                <option value="humidity">湿度</option>
                <option value="pressure">压强 / 压差</option>
              </select>
            </label>
            <label className="mt-1 block text-[9px] text-slate-500">
              绑定角色
              <select
                className="mt-0.5 w-full rounded border border-slate-600 bg-slate-950 px-1 py-0.5 text-[10px]"
                value={b.bindingKind ?? "readout"}
                onChange={(e) => patchBinding(b.id, { bindingKind: e.target.value as DtWidgetBindingKind })}
              >
                <option value="readout">只读（显示）</option>
                <option value="command">指令 / 写 WinCC</option>
              </select>
            </label>
          </div>
        ))}
      </div>
      <button type="button" className="w-full rounded border border-cyan-700/50 bg-cyan-950/40 py-1 text-[10px] text-cyan-100 hover:bg-cyan-900/50" onClick={() => void onTest()}>
        测试拉取当前绑定
      </button>
    </div>
  );
}
