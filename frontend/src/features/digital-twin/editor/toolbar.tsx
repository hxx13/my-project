// 顶部工具栏：返回、楼层切换、连线开关、重新排布、撤销/重做、编辑/展示切换。
// 中性色统一走项目的 --twin-* 变量（随浅色/深色自动切换）。

import { DEFAULT_FLOORS } from "@/features/digital-twin/schema/defaults";
import {
  DIGITAL_TWIN_SCREEN_RETURN_TO_KEY,
  useTwinFullscreenReturn,
} from "@/features/admin/adminTelemetryNav";
import { useDigitalTwinStore } from "./store";

/** 统一按钮基础类。 */
const BTN =
  "rounded-md border border-[var(--twin-hairline)] px-3 py-1 text-sm text-[var(--twin-ink)] transition-colors hover:bg-[var(--twin-canvas-soft-2)]";

export function Toolbar() {
  const activeFloor = useDigitalTwinStore((s) => s.activeFloor);
  const mode = useDigitalTwinStore((s) => s.mode);
  const connectMode = useDigitalTwinStore((s) => s.connectMode);
  const canUndo = useDigitalTwinStore((s) => s.past.length > 0);
  const canRedo = useDigitalTwinStore((s) => s.future.length > 0);

  const { handleReturn } = useTwinFullscreenReturn(DIGITAL_TWIN_SCREEN_RETURN_TO_KEY);
  const isEdit = mode === "edit";

  return (
    <div className="flex h-full w-full items-center gap-3 border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2">
      {/* 返回 */}
      <button type="button" onClick={handleReturn} className={BTN} title="返回">
        ← 返回
      </button>

      <div className="h-6 w-px bg-[var(--twin-hairline)]" />

      {/* 楼层切换 */}
      <div className="flex items-center gap-1 rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft-2)] p-1">
        {DEFAULT_FLOORS.map((floor) => (
          <button
            key={floor}
            type="button"
            onClick={() => useDigitalTwinStore.getState().switchFloor(floor)}
            className={`rounded-md px-3 py-1 text-sm transition-colors ${
              floor === activeFloor
                ? "bg-[var(--twin-canvas)] font-medium text-[var(--twin-link)]"
                : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
            }`}
          >
            {floor}
          </button>
        ))}
      </div>

      <div className="h-6 w-px bg-[var(--twin-hairline)]" />

      {/* 连线开关 */}
      <button
        type="button"
        onClick={() => useDigitalTwinStore.getState().setConnectMode(!connectMode)}
        className={`rounded-md border px-3 py-1 text-sm transition-colors ${
          connectMode
            ? "border-[var(--twin-link)] bg-[color-mix(in_srgb,var(--twin-link)_10%,transparent)] text-[var(--twin-link)]"
            : "border-[var(--twin-hairline)] text-[var(--twin-ink)] hover:bg-[var(--twin-canvas-soft-2)]"
        }`}
      >
        连线
      </button>

      {/* 重新排布 */}
      <button
        type="button"
        onClick={() => useDigitalTwinStore.getState().relayout()}
        className={BTN}
      >
        重新排布
      </button>

      <div className="flex-1" />

      {/* 撤销 / 重做（仅编辑态显示） */}
      {isEdit ? (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => useDigitalTwinStore.getState().undo()} disabled={!canUndo} className={`${BTN} disabled:cursor-not-allowed disabled:opacity-40`}>
            撤销
          </button>
          <button type="button" onClick={() => useDigitalTwinStore.getState().redo()} disabled={!canRedo} className={`${BTN} disabled:cursor-not-allowed disabled:opacity-40`}>
            重做
          </button>
        </div>
      ) : null}

      {/* 编辑 / 展示切换 */}
      <button
        type="button"
        onClick={() => useDigitalTwinStore.getState().setMode(isEdit ? "display" : "edit")}
        className={`rounded-md border px-3 py-1 text-sm transition-colors ${
          isEdit ? BTN : "border-[var(--twin-link)] bg-[color-mix(in_srgb,var(--twin-link)_12%,transparent)] text-[var(--twin-link)]"
        }`}
      >
        {isEdit ? "展示" : "编辑"}
      </button>
    </div>
  );
}
