import type { DuctPlanPolyline } from "@/features/digital-twin-screen/layout/ductLayoutTypes";

export function DuctEditToolbar({
  ducts,
  selectedPolyId,
  selectedPointIndex,
  onAddPolyline,
  onDeletePolyline,
  onDeleteVertex,
  onChangeColumn,
  onChangeSelectedH,
}: {
  ducts: DuctPlanPolyline[];
  selectedPolyId: string | null;
  selectedPointIndex: number | null;
  onAddPolyline: () => void;
  onDeletePolyline: () => void;
  onDeleteVertex: () => void;
  onChangeColumn: (polyId: string, columnIndex: number) => void;
  onChangeSelectedH: (h01: number) => void;
}) {
  const selectedPoly = ducts.find((p) => p.id === selectedPolyId) || null;
  const selectedH = selectedPoly && selectedPointIndex !== null ? selectedPoly.points[selectedPointIndex]?.h ?? 0 : 0;

  return (
    <div className="pointer-events-auto mb-1 flex flex-wrap items-center gap-1 rounded-md border border-cyan-500/30 bg-black/55 px-2 py-1 text-[10px] text-cyan-100 shadow-lg backdrop-blur-sm sm:text-[11px]">
      <span className="font-semibold text-cyan-300/90">管道布局</span>
      <button
        type="button"
        className="rounded border border-cyan-600/50 bg-cyan-950/60 px-1.5 py-0.5 hover:bg-cyan-900/70"
        onClick={onAddPolyline}
      >
        新建管道
      </button>
      <button
        type="button"
        className="rounded border border-rose-600/40 bg-rose-950/40 px-1.5 py-0.5 text-rose-100 hover:bg-rose-900/50 disabled:opacity-40"
        disabled={!selectedPolyId}
        onClick={onDeletePolyline}
      >
        删管道
      </button>
      <button
        type="button"
        className="rounded border border-slate-600/50 bg-slate-900/60 px-1.5 py-0.5 hover:bg-slate-800/70 disabled:opacity-40"
        disabled={selectedPointIndex === null}
        onClick={onDeleteVertex}
      >
        删拐点
      </button>
      {selectedPoly && selectedPointIndex !== null ? (
        <label className="ml-1 inline-flex items-center gap-1 text-slate-200">
          伪高
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(selectedH * 100)}
            onChange={(ev) => onChangeSelectedH(Number(ev.target.value) / 100)}
            className="h-1 w-20 accent-cyan-400"
          />
        </label>
      ) : null}
      {selectedPoly ? (
        <label className="inline-flex items-center gap-1 text-slate-200">
          列
          <select
            className="max-w-[4rem] rounded border border-slate-600 bg-slate-950 px-1 py-0.5 text-[10px]"
            value={selectedPoly.columnIndex}
            onChange={(ev) => {
              const v = Number(ev.target.value);
              onChangeColumn(selectedPoly.id, Math.max(0, Math.min(3, v)));
            }}
          >
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
      ) : null}
      <span className="text-slate-500">双击管段加拐点 · 拖拽移动</span>
    </div>
  );
}
