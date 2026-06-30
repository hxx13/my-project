import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import type {
  HeatmapCell,
  RoomUsageItem,
  StudentActivityResult,
  StudentActivitySummary,
} from "@/api/domains/analytics.api";
import { ActivityMemberTable } from "./ActivityMemberTable";
import type { SortKey } from "./ActivityMemberTable";
import { ActivityHeatmapChart } from "./ActivityHeatmapChart";
import { ActivityRoomChart } from "./ActivityRoomChart";
import { StudentCard } from "@/features/student/components/ui";
import { cn } from "@/lib/utils";
import {
  presetToRange,
  resolveActivityTimeLabel,
  STUDENT_ACTIVITY_PRESETS,
  type TimePreset,
} from "../utils/studentActivityTimePresets";
import { MOBILE_SCROLL_END_EXTRA_PAD } from "@/pages/mobile/mobileShellLayout";

const MOBILE_BRAND = "#ac1736";

export type StudentActivityFetchers = {
  fetchSummary: (params: {
    groupName: string;
    startTime: string;
    endTime: string;
    campus?: string;
  }) => Promise<StudentActivitySummary>;
  fetchMembers: (params: {
    groupName: string;
    startTime: string;
    endTime: string;
    sortBy?: string;
    order?: string;
    page?: number;
    size?: number;
  }) => Promise<StudentActivityResult>;
  fetchHeatmap: (params: {
    groupName: string;
    startTime: string;
    endTime: string;
  }) => Promise<HeatmapCell[]>;
  fetchRoomUsage: (params: {
    groupName: string;
    startTime: string;
    endTime: string;
  }) => Promise<RoomUsageItem[]>;
};

interface Props {
  groupName: string;
  queryKeyPrefix: string;
  fetchers: StudentActivityFetchers;
  variant?: "student" | "mobile";
  className?: string;
}

export function StudentActivityPanel({
  groupName,
  queryKeyPrefix,
  fetchers,
  variant = "student",
  className,
}: Props) {
  const isMobile = variant === "mobile";
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
  const [memberSize, setMemberSize] = useState(10);

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

  const timeLabel = useMemo(
    () => resolveActivityTimeLabel(startTime, endTime),
    [startTime, endTime],
  );

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(key);
      setOrder("desc");
    }
    setMemberPage(1);
  };

  const enabled = groupName.length > 0;

  const summaryQuery = useQuery({
    queryKey: [queryKeyPrefix, "summary", groupName, startTime, endTime, campus],
    queryFn: () =>
      fetchers.fetchSummary({ groupName, startTime, endTime, campus }),
    enabled,
  });
  const summary = summaryQuery.data;

  const membersQuery = useQuery({
    queryKey: [
      queryKeyPrefix,
      "members",
      groupName,
      startTime,
      endTime,
      sortBy,
      order,
      memberPage,
      memberSize,
    ],
    queryFn: () =>
      fetchers.fetchMembers({
        groupName,
        startTime,
        endTime,
        sortBy,
        order,
        page: memberPage,
        size: memberSize,
      }),
    enabled,
  });
  const members = membersQuery.data?.members ?? [];
  const memberTotal = membersQuery.data?.total ?? 0;

  const heatmapQuery = useQuery({
    queryKey: [queryKeyPrefix, "heatmap", groupName, startTime, endTime],
    queryFn: () => fetchers.fetchHeatmap({ groupName, startTime, endTime }),
    enabled,
  });

  const roomQuery = useQuery({
    queryKey: [queryKeyPrefix, "roomUsage", groupName, startTime, endTime],
    queryFn: () => fetchers.fetchRoomUsage({ groupName, startTime, endTime }),
    enabled,
  });

  const displayTimeLabel = summary?.timeLabel || timeLabel;

  const presetBtnClass = (active: boolean) =>
    isMobile
      ? cn(
          "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
          active ? "text-white" : "text-[#64748b]",
        )
      : cn(
          "rounded-[var(--student-radius-sm)] px-2.5 py-1 text-[11px] font-medium transition-colors",
          active
            ? "bg-[var(--student-primary)] text-white"
            : "bg-[var(--student-card-soft-bg)] text-[var(--student-mute)] hover:text-[var(--student-ink)]",
        );

  const presetBtnStyle = (active: boolean) =>
    isMobile && active
      ? { background: `linear-gradient(135deg, ${MOBILE_BRAND}, #8B1229)` }
      : undefined;

  const content = (
    <>
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 mb-4",
          isMobile && "flex-col items-stretch mb-3",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3
            className={cn(
              "font-semibold shrink-0",
              isMobile
                ? "text-[15px] text-[#1e293b]"
                : "text-[13px] text-[var(--student-foreground)]",
            )}
          >
            课题组活跃度
          </h3>
          <span
            className={cn(
              "truncate",
              isMobile ? "text-[12px] text-[#64748b]" : "text-[11px] text-[var(--student-mute)]",
            )}
          >
            {groupName}
          </span>
        </div>

        <div
          className={cn(
            "flex flex-wrap items-center gap-1.5",
            isMobile && "overflow-x-auto flex-nowrap pb-1 -mx-1 px-1",
          )}
        >
          {STUDENT_ACTIVITY_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key)}
              className={presetBtnClass(preset === p.key)}
              style={presetBtnStyle(preset === p.key)}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPreset("custom")}
            className={presetBtnClass(preset === "custom")}
            style={presetBtnStyle(preset === "custom")}
          >
            自定义
          </button>

          <select
            value={campus}
            onChange={(e) => {
              setCampus(e.target.value);
              setMemberPage(1);
            }}
            className={cn(
              "ml-1 rounded-[var(--student-radius-sm)] border px-2 py-1 text-[11px] outline-none shrink-0",
              isMobile
                ? "border-[rgba(30,55,90,0.12)] bg-white text-[#334155]"
                : "border-[var(--student-border)] bg-white text-[var(--student-ink)] focus:ring-1 focus:ring-[var(--student-primary)]",
            )}
          >
            <option value="all">全部校区</option>
            <option value="浦东">浦东</option>
            <option value="浦西">浦西</option>
          </select>
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2 w-full">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-[rgba(30,55,90,0.12)] bg-white px-2 py-1.5 text-[11px] text-[#334155] outline-none"
            />
            <span className="text-[11px] text-[#94a3b8]">—</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-[rgba(30,55,90,0.12)] bg-white px-2 py-1.5 text-[11px] text-[#334155] outline-none"
            />
            <button
              type="button"
              onClick={applyCustom}
              className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-white"
              style={{ background: MOBILE_BRAND }}
            >
              确定
            </button>
          </div>
        )}
      </div>

      {!enabled ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <Users className={cn("h-8 w-8", isMobile ? "text-[#94a3b8]" : "text-[var(--student-mute)]")} />
          <p className={cn("text-[12px]", isMobile ? "text-[#64748b]" : "text-[var(--student-mute)]")}>
            未分配课题组，暂无活跃度数据
          </p>
        </div>
      ) : summaryQuery.isLoading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-center">
          <Loader2
            className={cn(
              "h-6 w-6 animate-spin",
              isMobile ? "text-[#ac1736]" : "text-[var(--student-primary)]",
            )}
          />
          <p className={cn("text-[12px]", isMobile ? "text-[#64748b]" : "text-[var(--student-mute)]")}>
            正在加载课题组数据…
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 mb-4">
            <KpiCard
              variant={variant}
              title={`课题组人数（${displayTimeLabel}）`}
              value={summary?.memberCount}
              color="violet"
            />
            <KpiCard
              variant={variant}
              title={`总进出次数（${displayTimeLabel}）`}
              value={summary?.totalEntries}
              color="emerald"
            />
            <KpiCard
              variant={variant}
              title={`人均频次（${summary?.rateLabel || "本月"}）`}
              value={summary?.perCapitaWeeklyFreq}
              color="blue"
            />
            <KpiCard
              variant={variant}
              title={`活跃度占比（${summary?.rateLabel || "本月"}）`}
              value={summary?.activeSharePct != null ? `${summary.activeSharePct}%` : undefined}
              color="amber"
            />
          </div>

          <div className="mb-4">
            <SectionTitle variant={variant}>课题组成员</SectionTitle>
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

          <div className={cn("grid grid-cols-1 gap-4", !isMobile && "xl:grid-cols-2")}>
            <ChartSection variant={variant} title="进出时段热力图">
              <ActivityHeatmapChart
                data={heatmapQuery.data ?? []}
                loading={heatmapQuery.isLoading}
              />
            </ChartSection>
            <ChartSection variant={variant} title="喜好进出房间排行">
              <ActivityRoomChart data={roomQuery.data ?? []} loading={roomQuery.isLoading} />
            </ChartSection>
          </div>
        </>
      )}
    </>
  );

  if (isMobile) {
    return (
      <div
        className={cn("h-full overflow-y-auto px-3 py-3", className)}
        style={{ paddingBottom: MOBILE_SCROLL_END_EXTRA_PAD }}
      >
        {content}
      </div>
    );
  }

  return <StudentCard className={cn(className)}>{content}</StudentCard>;
}

function SectionTitle({
  variant,
  children,
}: {
  variant: "student" | "mobile";
  children: ReactNode;
}) {
  return (
    <h4
      className={cn(
        "mb-2 font-semibold",
        variant === "mobile"
          ? "text-[13px] text-[#334155]"
          : "text-[12px] text-[var(--student-ink)]",
      )}
    >
      {children}
    </h4>
  );
}

function ChartSection({
  variant,
  title,
  children,
}: {
  variant: "student" | "mobile";
  title: string;
  children: ReactNode;
}) {
  if (variant === "mobile") {
    return (
      <div className="min-w-0 rounded-2xl border border-[rgba(30,55,90,0.08)] bg-white/95 p-3 shadow-sm">
        <div className="mb-3 border-b border-[rgba(30,55,90,0.06)] pb-2">
          <h4 className="text-[13px] font-semibold text-[#334155]">{title}</h4>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-[var(--student-radius-md)] border border-[var(--student-border)] bg-[var(--student-canvas-soft)] p-4">
      <div className="mb-3 border-b border-[var(--student-border)] pb-2">
        <h4 className="text-[12px] font-semibold text-[var(--student-ink)]">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function KpiCard({
  title,
  value,
  color,
  variant,
}: {
  title: string;
  value: string | number | undefined;
  color: "violet" | "emerald" | "blue" | "amber";
  variant: "student" | "mobile";
}) {
  const colorMap = {
    violet: "text-violet-600",
    emerald: "text-emerald-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
  };

  if (variant === "mobile") {
    return (
      <div className="rounded-2xl border border-[rgba(30,55,90,0.08)] bg-white/95 px-3 py-2.5 shadow-sm">
        <p className="text-[10px] text-[#64748b] truncate">{title}</p>
        <p className={cn("text-lg font-extrabold tabular-nums", colorMap[color])}>
          {value != null ? value : "-"}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--student-radius-sm)] border border-[var(--student-border)] bg-[var(--student-canvas-soft)] px-3 py-2.5">
      <p className="text-[10px] text-[var(--student-mute)] truncate">{title}</p>
      <p className={cn("text-lg font-extrabold tabular-nums", colorMap[color])}>
        {value != null ? value : "-"}
      </p>
    </div>
  );
}
