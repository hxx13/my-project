import { useCallback } from "react";
import type { DtAcZoneDoc } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";

export function DtAcZoneDetailsPanel({
  zone,
  gridColumns,
  onChange,
}: {
  zone: DtAcZoneDoc | null;
  gridColumns: number;
  onChange: (next: DtAcZoneDoc) => void;
}) {
  const patch = useCallback(
    (partial: Partial<DtAcZoneDoc>) => {
      if (!zone) return;
      onChange({ ...zone, ...partial });
    },
    [onChange, zone]
  );

  if (!zone) {
    return <p className="text-slate-500">选中画布上的空调块以编辑列绑定与标签。</p>;
  }

  const colMax = Math.max(0, gridColumns - 1);

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold text-slate-300">空调区 · {zone.zone === "left" ? "左" : "右"}</div>
      <label className="block">
        <span className="text-slate-400">短标签</span>
        <input
          className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-1.5 py-1 text-[11px]"
          value={zone.labelShort ?? ""}
          onChange={(e) => patch({ labelShort: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-slate-400">列起（1–{gridColumns}）</span>
          <select
            className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-1 py-1 text-[11px]"
            value={zone.columnFrom}
            onChange={(e) => patch({ columnFrom: Math.min(colMax, Math.max(0, Number(e.target.value))) })}
          >
            {Array.from({ length: gridColumns }, (_, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-slate-400">列止（1–{gridColumns}）</span>
          <select
            className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-1 py-1 text-[11px]"
            value={zone.columnTo}
            onChange={(e) => patch({ columnTo: Math.min(colMax, Math.max(0, Number(e.target.value))) })}
          >
            {Array.from({ length: gridColumns }, (_, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[9px] leading-snug text-slate-500">列范围影响风管竖井与分区走向；保存后仅合并当前文档行。</p>
    </div>
  );
}
