import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { fetchStudentActivityGroups } from "@/api/domains/analytics.api";
import { cn } from "@/lib/utils";
import { GroupPaginator } from "./GroupPaginator";

type TimePreset = "yesterday" | "week" | "month" | "last_week" | "last_month" | "custom";

function presetToRange(preset: TimePreset): { start: string; end: string } {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const end = yesterdayStr + " 23:59:59";
  let start = yesterdayStr + " 00:00:00";

  if (preset === "yesterday") {
    // start = yesterday, end = yesterday
  } else if (preset === "week") {
    // 本周一 ~ 昨天
    const monday = new Date(now);
    const dayOfWeek = monday.getDay(); // 0=Sun
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    monday.setDate(monday.getDate() - daysFromMonday);
    if (monday > yesterday) {
      // Today is Monday → just show yesterday
      start = yesterdayStr + " 00:00:00";
    } else {
      start = monday.toISOString().slice(0, 10) + " 00:00:00";
    }
  } else if (preset === "month") {
    // 本月1号 ~ 昨天
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    start = firstDay.toISOString().slice(0, 10) + " 00:00:00";
  } else if (preset === "last_week") {
    // 上周一 ~ 上周日
    const d = new Date(now);
    const dayOfWeek = d.getDay();
    const daysSinceLastMonday = dayOfWeek === 0 ? 7 : dayOfWeek;
    d.setDate(d.getDate() - daysSinceLastMonday - 6);
    start = d.toISOString().slice(0, 10) + " 00:00:00";
    d.setDate(d.getDate() + 6);
    const endDate = d.toISOString().slice(0, 10);
    return { start, end: endDate + " 23:59:59" };
  } else if (preset === "last_month") {
    // 上月1号 ~ 上月最后一天
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    start = firstDay.toISOString().slice(0, 10) + " 00:00:00";
    return { start, end: lastDay.toISOString().slice(0, 10) + " 23:59:59" };
  }
  return { start, end };
}

type Props = {
  groupName: string;
  groupPage: number;
  groupTotal: number;
  onGroupChange: (name: string) => void;
  onGroupPageChange: (page: number) => void;
  startTime: string;
  endTime: string;
  onTimeChange: (start: string, end: string) => void;
  onExportCSV: () => void;
  campus: string;
  onCampusChange: (campus: string) => void;
  disabled?: boolean;
};

const PRESETS: { key: TimePreset; label: string }[] = [
  { key: "yesterday", label: "昨日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "last_week", label: "上周" },
  { key: "last_month", label: "上月" },
];

export function ActivityFilterBar({ groupName, groupPage, groupTotal, onGroupChange, onGroupPageChange, startTime, endTime, onTimeChange, onExportCSV, campus, onCampusChange, disabled }: Props) {
  const [keyword, setKeyword] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [preset, setPreset] = useState<TimePreset>("month");
  const [customStart, setCustomStart] = useState(startTime.slice(0, 10));
  const [customEnd, setCustomEnd] = useState(endTime.slice(0, 10));

  const { data: groupsResult } = useQuery({
    queryKey: ["studentActivityGroups", keyword, startTime, endTime],
    queryFn: () => fetchStudentActivityGroups({ keyword: keyword || undefined, startTime, endTime }),
    enabled: showDropdown,
    staleTime: 60_000,
  });
  const groups = groupsResult?.groups ?? [];

  const applyPreset = useCallback((p: TimePreset) => {
    setPreset(p);
    if (p !== "custom") {
      const { start, end } = presetToRange(p);
      onTimeChange(start, end);
    }
  }, [onTimeChange]);

  const applyCustom = useCallback(() => {
    if (customStart && customEnd) {
      onTimeChange(customStart + " 00:00:00", customEnd + " 23:59:59");
    }
  }, [customStart, customEnd, onTimeChange]);

  useEffect(() => {
    if (preset !== "custom") {
      const { start, end } = presetToRange(preset);
      if (start !== startTime || end !== endTime) {
        applyPreset(preset);
      }
    }
  }, []); // initial load only

  return (
    <>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-violet-200/60 bg-gradient-to-r from-violet-50/40 to-white p-4">
      {/* Research group search */}
      <div className="relative min-w-[200px]">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">课题组</label>
        <input
          type="text"
          value={keyword}
          onChange={(e) => {
            const v = e.target.value;
            setKeyword(v);
            setShowDropdown(true);
            if (!v.trim()) onGroupChange("");
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder="搜索课题组名称…"
          disabled={disabled}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
        />
        {showDropdown && groups.length > 0 ? (
          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
            {groups.map((g) => (
              <li key={g.name}>
                <button
                  type="button"
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-violet-50",
                    groupName === g.name && "bg-violet-100 font-semibold text-violet-900"
                  )}
                  onMouseDown={() => {
                    onGroupChange(g.name);
                    setKeyword(g.name);
                    setShowDropdown(false);
                  }}
                >
                  {g.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Campus filter */}
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">校区</label>
        <select
          value={campus}
          onChange={(e) => onCampusChange(e.target.value)}
          disabled={disabled}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700"
        >
          <option value="all">全部校区</option>
          <option value="浦东">浦东</option>
          <option value="浦西">浦西</option>
        </select>
      </div>

      {/* Time presets */}
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">时间范围</label>
        <div className="flex items-center gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={disabled}
              onClick={() => applyPreset(p.key)}
              className={cn(
                "rounded-lg px-3 py-2 text-xs font-medium transition",
                preset === p.key
                  ? "bg-violet-600 text-white shadow-sm"
                  : "border border-neutral-200 bg-white text-neutral-600 hover:bg-violet-50"
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPreset("custom")}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-medium transition",
              preset === "custom"
                ? "bg-violet-600 text-white shadow-sm"
                : "border border-neutral-200 bg-white text-neutral-600 hover:bg-violet-50"
            )}
          >
            自定义
          </button>
        </div>
      </div>

      {/* Custom date range */}
      {preset === "custom" ? (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            disabled={disabled}
            className="rounded-lg border border-neutral-200 px-2 py-2 text-xs"
          />
          <span className="text-xs text-neutral-400">—</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            disabled={disabled}
            className="rounded-lg border border-neutral-200 px-2 py-2 text-xs"
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={disabled}
            className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            确定
          </button>
        </div>
      ) : null}

      {/* Right side buttons */}
      <div style={{ flex: 1 }} />
      <button
        type="button"
        onClick={onExportCSV}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
      >
        <Download className="h-3.5 w-3.5" />
        导出 CSV
      </button>
    </div>

    <GroupPaginator
      groupName={groupName}
      page={groupPage}
      total={groupTotal}
      onPageChange={onGroupPageChange}
    />
  </>
  );
}
