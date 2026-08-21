import toast from "react-hot-toast";
import { useSaveAnimalOrderTimePolicyAdmin, useAnimalOrderTimePolicy } from "@/api/hooks/useAnimalOrderTime";
import type { AnimalOrderTimePolicyAdmin } from "@/api/domains/animalOrderTime.api";

interface EtaPolicyEditorProps {
  draft: AnimalOrderTimePolicyAdmin;
  onChange: (next: AnimalOrderTimePolicyAdmin) => void;
}

const ISO_WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 7, label: "周日" },
];

function weekdayLabel(value: number | null | undefined): string {
  return ISO_WEEKDAY_OPTIONS.find((o) => o.value === value)?.label ?? "未配置";
}

export default function EtaPolicyEditor({ draft, onChange }: EtaPolicyEditorProps) {
  const saveMut = useSaveAnimalOrderTimePolicyAdmin();
  const { data: summary } = useAnimalOrderTimePolicy();

  const isRelative = draft.etaMode === "RELATIVE";
  const isFixed = draft.etaMode === "FIXED";

  function handleSave() {
    if (isFixed && (draft.etaWeekday == null || draft.etaWeekday < 1 || draft.etaWeekday > 7)) {
      toast.error("固定送达星期未配置");
      return;
    }
    saveMut.mutate(
      {
        ...draft,
        etaWeekday: isFixed ? draft.etaWeekday : null,
      },
      {
        onError: (e: Error) => toast.error(e.message || "保存失败"),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
        <div className="mb-2 text-xs font-semibold text-[var(--twin-ink)]">预计送达策略</div>
        <div className="mb-3 flex flex-wrap gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="etaMode"
              checked={isRelative}
              onChange={() => onChange({ ...draft, etaMode: "RELATIVE" })}
            />
            <span>相对工作日 (RELATIVE)</span>
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="etaMode"
              checked={isFixed}
              onChange={() => onChange({ ...draft, etaMode: "FIXED" })}
            />
            <span>固定星期 (FIXED)</span>
          </label>
        </div>

        {isRelative && (
          <label className="flex max-w-xs flex-col gap-1">
            <span className="text-[10px] text-[var(--twin-mute)]">锚点后第 N 个工作日（0 = 锚点当日或下一工作日）</span>
            <input
              type="number"
              min={0}
              value={draft.etaWorkdayOffset ?? 0}
              onChange={(e) =>
                onChange({
                  ...draft,
                  etaWorkdayOffset: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
        )}

        {isFixed && (
          <label className="flex max-w-xs flex-col gap-1">
            <span className="text-[10px] text-[var(--twin-mute)]">
              每周固定送达日（锚点后严格大于锚点日的下一该星期几；同星期则顺延一周；非工作日再顺延）
            </span>
            <select
              value={draft.etaWeekday ?? ""}
              disabled={!isFixed}
              onChange={(e) =>
                onChange({
                  ...draft,
                  etaWeekday: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
            >
              <option value="">请选择星期</option>
              {ISO_WEEKDAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2">
        <div className="text-[10px] font-semibold text-[var(--twin-mute)]">若现在下单 → 预计送达</div>
        {summary?.estimatedDeliveryDate ? (
          <div className="mt-1 text-sm font-medium text-[var(--twin-ink)]">
            {summary.estimatedDeliveryDate}
            <span className="ml-2 text-[10px] font-normal text-[var(--twin-mute)]">
              （已保存策略 ·{" "}
              {summary.etaMode === "FIXED"
                ? `固定 ${weekdayLabel(summary.etaWeekday)}`
                : `相对 +${summary.etaWorkdayOffset} 工作日`}
              ）
            </span>
          </div>
        ) : (
          <div className="mt-1 text-xs text-[var(--twin-mute)]">暂无预览（保存策略后更新）</div>
        )}
        {!summary?.canOrderNow && summary?.closedReason && (
          <div className="mt-2 text-[10px] text-amber-700">当前不可购：{summary.closedReason}</div>
        )}
      </div>

      <div className="flex justify-end border-t border-[var(--twin-hairline)] pt-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveMut.isPending}
          className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {saveMut.isPending ? "保存中…" : "保存预计送达策略"}
        </button>
      </div>
    </div>
  );
}
