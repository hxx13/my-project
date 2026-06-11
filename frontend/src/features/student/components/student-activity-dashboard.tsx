import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import {
  fetchStudentActivitySummary,
  fetchStudentActivityMembers,
  fetchStudentActivityHeatmap,
  fetchStudentActivityRoomUsage,
} from "@/api/domains/analytics.api";
import { ActivityMemberTable } from "@/features/analytics/components/ActivityMemberTable";
import type { SortKey } from "@/features/analytics/components/ActivityMemberTable";
import { ActivityHeatmapChart } from "@/features/analytics/components/ActivityHeatmapChart";
import { ActivityRoomChart } from "@/features/analytics/components/ActivityRoomChart";
import { StudentCard } from "./ui";
import { cn } from "@/lib/utils";

// ---- 时间范围预设（与 ActivityFilterBar 完全一致） ----

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
    const monday = new Date(now);
    const dayOfWeek = monday.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    monday.setDate(monday.getDate() - daysFromMonday);
    if (monday > yesterday) {
      start = yesterdayStr + " 00:00:00";
    } else {
      start = monday.toISOString().slice(0, 10) + " 00:00:00";
    }
  } else if (preset === "month") {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    start = firstDay.toISOString().slice(0, 10) + " 00:00:00";
  } else if (preset === "last_week") {
    const d = new Date(now);
    const dayOfWeek = d.getDay();
    const daysSinceLastMonday = dayOfWeek === 0 ? 7 : dayOfWeek;
    d.setDate(d.getDate() - daysSinceLastMonday - 6);
    start = d.toISOString().slice(0, 10) + " 00:00:00";
    d.setDate(d.getDate() + 6);
    return { start, end: d.toISOString().slice(0, 10) + " 23:59:59" };
  } else if (preset === "last_month") {
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    start = firstDay.toISOString().slice(0, 10) + " 00:00:00";
    return { start, end: lastDay.toISOString().slice(0, 10) + " 23:59:59" };
  }
  return { start, end };
}

const PRESETS: { key: TimePreset; label: string }[] = [
  { key: "yesterday", label: "昨日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "last_week", label: "上周" },
  { key: "last_month", label: "上月" },
];

interface Props {
  groupName: string;
  className?: string;
}

export function StudentActivityDashboard({ groupName, className }: Props) {
  const initialRange = presetToRange("month");
  const [startTime, setStartTime] = useState(initialRange.start);
  const [endTime, setEndTime] = useState(initialRange.end);
  const [preset, setPreset] = useState<TimePreset>("month");
  const [customStart, setCustomStart] = useState(initialRange.start.slice(0, 10));
  const [customEnd, setCustomEnd] = useState(initialRange.end.slice(0, 10));
  const [campus, setCampus] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("entries");
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const [memberPage, setMemberPage] = useState(1);
  const [memberSize, setMemberSize] = useState(20);

  const applyPreset = (p: TimePreset) => {
    setPreset(p);
    if (p !== "custom") {
      const { start, end } = presetToRange(p);
      setStartTime(start);
      setEndTime(end);
      setMemberPage(1);
    }
  };

  const applyCustom = () => {
    if (customStart && customEnd) {
      setStartTime(customStart + " 00:00:00");
      setEndTime(customEnd + " 23:59:59");
      setMemberPage(1);
    }
  };

  // client-side timeLabel
  const timeLabel = useMemo(() => {
    const s = startTime.slice(0, 10);
    const e = endTime.slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (s === yesterday && e === yesterday) return "昨日";
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(monday.getDate() - daysFromMonday);
    const mondayStr = monday.toISOString().slice(0, 10);
    if (s === mondayStr && e === yesterday) return "本周";
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    if (s === firstDay && e === yesterday) return "本月";
    return s.slice(5) + "-" + e.slice(5);
  }, [startTime, endTime]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) { setOrder((o) => (o === "desc" ? "asc" : "desc")); }
    else { setSortBy(key); setOrder("desc"); }
    setMemberPage(1);
  };

  const enabled = groupName.length > 0;

  // Summary KPI
  const summaryQuery = useQuery({
    queryKey: ["studentActivitySummary", groupName, startTime, endTime, campus],
    queryFn: () => fetchStudentActivitySummary({ groupName, startTime, endTime, campus }),
    enabled,
  });
  const summary = summaryQuery.data;

  // Members
  const membersQuery = useQuery({
    queryKey: ["studentActivityMembers", groupName, startTime, endTime, sortBy, order, memberPage, memberSize],
    queryFn: () => fetchStudentActivityMembers({ groupName, startTime, endTime, sortBy, order, page: memberPage, size: memberSize }),
    enabled,
  });
  const members = membersQuery.data?.members ?? [];
  const memberTotal = membersQuery.data?.total ?? 0;

  // Heatmap
  const heatmapQuery = useQuery({
    queryKey: ["studentActivityHeatmap", groupName, startTime, endTime],
    queryFn: () => fetchStudentActivityHeatmap({ groupName, startTime, endTime }),
    enabled,
  });

  // Room usage
  const roomQuery = useQuery({
    queryKey: ["studentActivityRoomUsage", groupName, startTime, endTime],
    queryFn: () => fetchStudentActivityRoomUsage({ groupName, startTime, endTime }),
    enabled,
  });

  const displayTimeLabel = summary?.timeLabel || timeLabel;

  return (
    <StudentCard className={cn(className)}>
      {/* Header: title + group name + time presets */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[13px] font-semibold text-[var(--student-foreground)] shrink-0">
            课题组活跃度
          </h3>
          <span className="text-[11px] text-[var(--student-mute)] truncate">
            {groupName}
          </span>
        </div>

        {/* Time presets + campus */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key)}
              className={cn(
                "rounded-[var(--student-radius-sm)] px-2.5 py-1 text-[11px] font-medium transition-colors",
                preset === p.key
                  ? "bg-[var(--student-primary)] text-white"
                  : "bg-[var(--student-card-soft-bg)] text-[var(--student-mute)] hover:text-[var(--student-ink)]"
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPreset("custom")}
            className={cn(
              "rounded-[var(--student-radius-sm)] px-2.5 py-1 text-[11px] font-medium transition-colors",
              preset === "custom"
                ? "bg-[var(--student-primary)] text-white"
                : "bg-[var(--student-card-soft-bg)] text-[var(--student-mute)] hover:text-[var(--student-ink)]"
            )}
          >
            自定义
          </button>

          {/* Campus toggle */}
          <select
            value={campus}
            onChange={(e) => { setCampus(e.target.value); setMemberPage(1); }}
            className="ml-1 rounded-[var(--student-radius-sm)] border border-[var(--student-border)] bg-white px-2 py-1 text-[11px] text-[var(--student-ink)] outline-none focus:ring-1 focus:ring-[var(--student-primary)]"
          >
            <option value="all">全部校区</option>
            <option value="浦东">浦东</option>
            <option value="浦西">浦西</option>
          </select>
        </div>

        {/* Custom date range */}
        {preset === "custom" && (
          <div className="flex items-center gap-1.5 mt-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-[var(--student-radius-sm)] border border-[var(--student-border)] bg-white px-2 py-1 text-[11px] text-[var(--student-ink)] outline-none"
            />
            <span className="text-[11px] text-[var(--student-mute)]">—</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-[var(--student-radius-sm)] border border-[var(--student-border)] bg-white px-2 py-1 text-[11px] text-[var(--student-ink)] outline-none"
            />
            <button
              type="button"
              onClick={applyCustom}
              className="rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] px-2.5 py-1 text-[11px] font-medium text-white"
            >
              确定
            </button>
          </div>
        )}
      </div>

      {!enabled ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <Users className="h-8 w-8 text-[var(--student-mute)]" />
          <p className="text-[12px] text-[var(--student-mute)]">未分配课题组，暂无活跃度数据</p>
        </div>
      ) : summaryQuery.isLoading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--student-primary)]" />
          <p className="text-[12px] text-[var(--student-mute)]">正在加载课题组数据…</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 mb-4">
            <KpiCard title={`课题组人数（${displayTimeLabel}）`} value={summary?.memberCount} color="violet" />
            <KpiCard title={`总进出次数（${displayTimeLabel}）`} value={summary?.totalEntries} color="emerald" />
            <KpiCard title={`人均频次（${summary?.rateLabel || "本月"}）`} value={summary?.perCapitaWeeklyFreq} color="blue" />
            <KpiCard
              title={`活跃度占比（${summary?.rateLabel || "本月"}）`}
              value={summary?.activeSharePct != null ? `${summary.activeSharePct}%` : undefined}
              color="amber"
            />
          </div>

          {/* Member table */}
          <div className="mb-4">
            <ActivityMemberTable
              members={members}
              sortBy={sortBy}
              order={order}
              onSort={handleSort}
              loading={membersQuery.isLoading}
              page={memberPage}
              total={memberTotal}
              size={memberSize}
              onPageChange={setMemberPage}
              onSizeChange={setMemberSize}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="min-w-0 rounded-[var(--student-radius-md)] border border-[var(--student-border)] bg-[var(--student-canvas-soft)] p-4">
              <div className="mb-3 border-b border-[var(--student-border)] pb-2">
                <h4 className="text-[12px] font-semibold text-[var(--student-ink)]">进出时段热力图</h4>
              </div>
              <ActivityHeatmapChart data={heatmapQuery.data ?? []} loading={heatmapQuery.isLoading} />
            </div>
            <div className="min-w-0 rounded-[var(--student-radius-md)] border border-[var(--student-border)] bg-[var(--student-canvas-soft)] p-4">
              <div className="mb-3 border-b border-[var(--student-border)] pb-2">
                <h4 className="text-[12px] font-semibold text-[var(--student-ink)]">喜好进出房间排行</h4>
              </div>
              <ActivityRoomChart data={roomQuery.data ?? []} loading={roomQuery.isLoading} />
            </div>
          </div>
        </>
      )}
    </StudentCard>
  );
}

function KpiCard({
  title,
  value,
  color,
}: {
  title: string;
  value: string | number | undefined;
  color: "violet" | "emerald" | "blue" | "amber";
}) {
  const colorMap = {
    violet: "text-violet-600",
    emerald: "text-emerald-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
  };
  return (
    <div className="rounded-[var(--student-radius-sm)] border border-[var(--student-border)] bg-[var(--student-canvas-soft)] px-3 py-2.5">
      <p className="text-[10px] text-[var(--student-mute)] truncate">{title}</p>
      <p className={cn("text-lg font-extrabold tabular-nums", colorMap[color])}>
        {value != null ? value : "-"}
      </p>
    </div>
  );
}
