import type { DtWidgetPalettePresetId } from "@/features/digital-twin-screen/layout/dtWidgetPresets";

export function DtWidgetPalette({ onPick }: { onPick: (preset: DtWidgetPalettePresetId) => void }) {
  return (
    <div className="rounded border border-slate-600/35 bg-slate-900/50 p-1.5">
      <div className="mb-1 font-semibold text-slate-400">显示框</div>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          className="rounded border border-cyan-700/40 bg-cyan-950/40 px-2 py-1 text-left text-[10px] text-cyan-100 hover:bg-cyan-900/50"
          onClick={() => onPick("telemetryDual")}
        >
          温湿双行
        </button>
        <button
          type="button"
          className="rounded border border-slate-600/50 bg-slate-900/60 px-2 py-1 text-left text-[10px] text-slate-100 hover:bg-slate-800/70"
          onClick={() => onPick("telemetrySingle")}
        >
          单行大号
        </button>
        <button
          type="button"
          className="rounded border border-slate-600/50 bg-slate-900/60 px-2 py-1 text-left text-[10px] text-slate-100 hover:bg-slate-800/70"
          onClick={() => onPick("telemetryCompact")}
        >
          极简文本
        </button>
        <button
          type="button"
          className="rounded border border-sky-700/40 bg-sky-950/35 px-2 py-1 text-left text-[10px] text-sky-100 hover:bg-sky-900/45"
          onClick={() => onPick("hvacUnitCassette")}
        >
          空调单元（卧式）
        </button>
        <button
          type="button"
          className="rounded border border-sky-700/40 bg-sky-950/35 px-2 py-1 text-left text-[10px] text-sky-100 hover:bg-sky-900/45"
          onClick={() => onPick("hvacUnitTower")}
        >
          空调单元（立式）
        </button>
      </div>
    </div>
  );
}
