import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings, ShieldAlert, Trash2, X } from "lucide-react";
import { addToBlacklist, fetchBlacklist, removeFromBlacklist } from "@/api/twinApi";
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
  const [newBlacklist, setNewBlacklist] = useState({ userId: "", name: "", reason: "" });

  const { data: blacklistData = [], refetch: refetchBlacklist } = useQuery({
    queryKey: ["twinBlacklist"],
    queryFn: fetchBlacklist,
    enabled: blacklistOpen,
  });

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

      {blacklistOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="flex w-[600px] flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b bg-slate-50 px-6 py-4">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <ShieldAlert className="h-5 w-5 text-rose-500" />
                黑名单
              </h2>
              <button type="button" onClick={() => setBlacklistOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex gap-2 border-b p-4">
              <input
                placeholder="学工号"
                value={newBlacklist.userId}
                onChange={(e) => setNewBlacklist((n) => ({ ...n, userId: e.target.value }))}
                className="flex-1 rounded-lg border px-3 py-2 text-sm"
              />
              <input
                placeholder="姓名"
                value={newBlacklist.name}
                onChange={(e) => setNewBlacklist((n) => ({ ...n, name: e.target.value }))}
                className="w-[100px] rounded-lg border px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!newBlacklist.userId || !newBlacklist.name) return;
                  await addToBlacklist(newBlacklist);
                  setNewBlacklist({ userId: "", name: "", reason: "" });
                  await refetchBlacklist();
                  invalidateRelated();
                }}
                className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white"
              >
                <Plus className="inline h-4 w-4" /> 添加
              </button>
            </div>
            <div className="max-h-[280px] overflow-y-auto p-4">
              {blacklistData.map((item: { userId: string; name: string }) => (
                <div key={item.userId} className="mb-2 flex items-center justify-between rounded-lg border p-2 text-sm">
                  <span>
                    {item.name} <span className="font-mono text-xs text-neutral-400">{item.userId}</span>
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await removeFromBlacklist(item.userId);
                      await refetchBlacklist();
                      invalidateRelated();
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-rose-400" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
