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
import {
  analyticsChipActive,
  analyticsChipIdle,
  analyticsFilterShell,
  analyticsInput,
} from "@/features/analytics/analyticsUiTokens";

const PUDONG_CAMPUS = "浦东";

type Props = {
  reportKey?: string;
  filters: AnalyticsDraftFilter;
  onChange: (next: AnalyticsDraftFilter) => void;
  onClear: () => void;
  invalidateKeys?: string[][];
  /** 进出方向已在主配置区选择时隐藏 */
  hideActionType?: boolean;
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
        active ? analyticsChipActive : analyticsChipIdle
      )}
    >
      {label}
    </button>
  );
}

export function AnalyticsPipelineFilterBar({
  reportKey,
  filters,
  onChange,
  onClear,
  invalidateKeys,
  hideActionType = false,
}: Props) {
  const queryClient = useQueryClient();
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const isCageReport = reportKey === "cage_occupancy";

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
        className={cn("flex flex-nowrap items-center gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:thin]", analyticsFilterShell)}
      >
        {!isCageReport && !hideActionType ? (
          <>
            <select
              value={filters.actionType}
              onChange={(e) =>
                onChange({ ...filters, actionType: e.target.value as AnalyticsDraftFilter["actionType"] })
              }
              className={cn("shrink-0 px-2 py-1 text-[11px] font-bold outline-none", analyticsInput)}
            >
              <option value="">全部动作</option>
              <option value="1">进入</option>
              <option value="2">离开</option>
            </select>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--app-color-border-default)]" />
          </>
        ) : null}

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
          placeholder={isCageReport ? "房间名" : "房号尾数"}
          value={filters.roomName}
          onChange={(e) => onChange({ ...filters, roomName: e.target.value })}
          className={cn("w-[88px] shrink-0 px-2 py-1 text-[11px] font-semibold outline-none", analyticsInput)}
        />

        {!isCageReport ? (
          <>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--app-color-border-default)]" />
            <label className={cn("flex shrink-0 cursor-pointer items-center gap-1 rounded-md border px-2 py-1", analyticsChipIdle)}>
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-[var(--app-color-border-default)] text-[var(--app-color-accent)]"
                checked={filters.excludeBlacklist}
                onChange={(e) => onChange({ ...filters, excludeBlacklist: e.target.checked })}
              />
              <span className="text-[10px] font-semibold text-[var(--app-color-text-secondary)]">排除黑名单</span>
            </label>
            <button
              type="button"
              onClick={() => setBlacklistOpen(true)}
              className="shrink-0 rounded p-1 text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-accent)]"
              title="黑名单"
            >
              <Settings className="h-4 w-4" />
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={onClear}
          className="shrink-0 text-[10px] font-semibold text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-feedback-error)]"
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
