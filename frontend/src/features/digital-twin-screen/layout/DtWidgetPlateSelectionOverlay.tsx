const HANDLE =
  "pointer-events-none absolute box-border h-2 w-2 rounded-[2px] border border-cyan-300/90 bg-slate-950/95 shadow-sm";

/**
 * 编辑态：画在单个图元 plate 容器内部（与 DtSceneWidgetLayer 同一 DOM 盒）。
 * 手柄完全收在盒内（不外翻），避免根节点 overflow-hidden 裁切；与 SceneEditSurface 命中仍按 plate 几何角点。
 */
export function DtWidgetPlateSelectionOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[8]">
      <div className="pointer-events-none absolute inset-0 ring-2 ring-cyan-400/90 ring-inset" aria-hidden />
      <div className={`${HANDLE} left-0.5 top-0.5`} aria-hidden />
      <div className={`${HANDLE} left-1/2 top-0.5 -translate-x-1/2`} aria-hidden />
      <div className={`${HANDLE} right-0.5 top-0.5`} aria-hidden />
      <div className={`${HANDLE} right-0.5 top-1/2 -translate-y-1/2`} aria-hidden />
      <div className={`${HANDLE} right-0.5 bottom-0.5`} aria-hidden />
      <div className={`${HANDLE} left-1/2 bottom-0.5 -translate-x-1/2`} aria-hidden />
      <div className={`${HANDLE} left-0.5 bottom-0.5`} aria-hidden />
      <div className={`${HANDLE} left-0.5 top-1/2 -translate-y-1/2`} aria-hidden />
    </div>
  );
}
