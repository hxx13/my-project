import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import { BlacklistManageModal } from "@/components/admin/BlacklistManageModal";
import {
  CAMPUS_OPTIONS,
  PUDONG_FLOOR_OPTIONS,
  toggleInList,
  type AnalyticsDraftFilter,
} from "@/features/analytics/analyticsPipelineFilter";
import { cn } from "@/lib/utils";

const PUDONG_CAMPUS = "浦东";

type Props = {
  filters: AnalyticsDraftFilter;
  onChange: (next: AnalyticsDraftFilter) => void;
  onClear: () => void;
  invalidateKeys?: string[][];
};

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold transition",
        active
          ? "border-violet-400 bg-violet-100 text-violet-900"
          : "border-neutral-200 bg-white text-neutral-600 hover:border-violet-200"
      )}
    >
      {label}
    </button>
  );
}

export function AnalyticsPipelineFilterBar({ filters, onChange, onClear, invalidateKeys }: Props) {
  const queryClient = useQueryClient();
  const [blacklistOpen, setBlacklistOpen] = useState(false);

  const showPudongFloors = filters.campuses.includes(PUDONG_CAMPUS);

  const invalidateRelated = () => {
    for (const key of invalidateKeys ?? []) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  return (
    <>
      <div
        data-analytics-scope-filters
        className="flex flex-nowrap items-center gap-1.5 overflow-x-auto rounded-xl border border-neutral-200/90 bg-white px-3 py-2 shadow-sm [scrollbar-width:thin]"
      >
        <select
          value={filters.actionType}
          onChange={(e) =>
            onChange({ ...filters, actionType: e.target.value as AnalyticsDraftFilter["actionType"] })
          }
          className="shrink-0 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-bold text-neutral-700 outline-none"
        >
          <option value="">全部动作</option>
          <option value="1">进入</option>
          <option value="2">离开</option>
        </select>

        <span className="mx-0.5 h-5 w-px shrink-0 bg-neutral-200" />

        {CAMPUS_OPTIONS.map((c) => (
          <Chip
            key={c.value}
            label={c.label}
            active={filters.campuses.includes(c.value)}
            onClick={() => {
              const campuses = toggleInList(filters.campuses, c.value);
              const floors =
                c.value === PUDONG_CAMPUS && !campuses.includes(PUDONG_CAMPUS)
                  ? filters.floors.filter((f) => !PUDONG_FLOOR_OPTIONS.some((o) => o.value === f))
                  : filters.floors;
              onChange({ ...filters, campuses, floors });
            }}
          />
        ))}

        {showPudongFloors
          ? PUDONG_FLOOR_OPTIONS.map((f) => (
              <Chip
                key={f.value}
                label={f.label}
                active={filters.floors.includes(f.value)}
                onClick={() => onChange({ ...filters, floors: toggleInList(filters.floors, f.value) })}
              />
            ))
          : null}

        <input
          type="text"
          placeholder="房号尾数"
          value={filters.roomName}
          onChange={(e) => onChange({ ...filters, roomName: e.target.value })}
          className="w-[88px] shrink-0 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-semibold outline-none focus:border-violet-400"
        />

        <span className="mx-0.5 h-5 w-px shrink-0 bg-neutral-200" />

        <label className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-neutral-300 text-violet-600"
            checked={filters.excludeBlacklist}
            onChange={(e) => onChange({ ...filters, excludeBlacklist: e.target.checked })}
          />
          <span className="text-[10px] font-semibold text-neutral-600">排除黑名单</span>
        </label>

        <button
          type="button"
          onClick={() => setBlacklistOpen(true)}
          className="shrink-0 rounded p-1 text-neutral-400 hover:bg-violet-50 hover:text-violet-600"
          title="黑名单"
        >
          <Settings className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onClear}
          className="shrink-0 text-[10px] font-semibold text-neutral-400 hover:text-rose-500"
        >
          清除
        </button>
      </div>

      <BlacklistManageModal
        open={blacklistOpen}
        onClose={() => setBlacklistOpen(false)}
        onChanged={invalidateRelated}
      />
    </>
  );
}
