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

const ACCENT = "#ac1736";

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
  /** 塞在标题栏右侧控件组末尾（如「弹窗展开」按钮），避免调用方在卡片外面另起一行 */
  headerExtra?: ReactNode;
  /**
   * 只渲染指定分区：图表（热力图+房间榜）与成员表分开成两张卡，避免挤在一起把图表压扁。
   * all=都渲染（默认）；charts=只图表；members=只成员表。
   */
  sections?: "all" | "charts" | "members";
  /** 标题，默认「课题组活跃度」 */
  title?: string;
  /** 嵌入外部合并板块：不出自己的 StudentCard、不出标题（外层已有 tab 标题） */
  embedded?: boolean;
  /** 嵌入时塞在标题行最前面的内容（如外层的主 tab 按钮），与控件同处一行 */
  headerPrefix?: ReactNode;
}

export function StudentActivityPanel({
  groupName,
  queryKeyPrefix,
  fetchers,
  variant = "student",
  className,
  headerExtra,
  sections = "all",
  title = "课题组活跃度",
  embedded = false,
  headerPrefix,
}: Props) {
  const isMobile = variant === "mobile";
  const showCharts = sections !== "members";
  const showMembers = sections !== "charts";
  const standalone = sections !== "all";
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
  /** 活跃度两张图（热力图/房间榜）拆成 tab，一次只显示一张 */
  const [chartTab, setChartTab] = useState<"heatmap" | "room">("heatmap");

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
          "rounded-[var(--student-radius-sm)] px-1.5 py-0.5 text-[10px] font-medium transition-colors",
          active
            ? "bg-[var(--student-primary)] text-white"
            : "bg-[var(--student-card-soft-bg)] text-[var(--student-mute)] hover:text-[var(--student-ink)]",
        );

  const presetBtnStyle = (active: boolean) =>
    isMobile && active
      ? { background: `linear-gradient(135deg, ${ACCENT}, #8B1229)` }
      : undefined;

  // 只出成员表：表格自带边框容器，直接就是板块（不再套外层卡片和「课题组成员」标题），自然撑满
  if (!isMobile && sections === "members") {
    return (
      <div className={cn("h-full min-h-0", className)}>
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
    );
  }

  const content = (
    <>
      <div
        className={cn(
          // 标题 + 时间范围 + 图表 tab 全部压在同一行（不换行、不两端撑开）
          "flex shrink-0 flex-nowrap items-center gap-2 mb-3",
          isMobile && "flex-col items-stretch mb-3",
        )}
      >
        {headerPrefix}
        {!embedded && (
          <div className="flex min-w-0 shrink items-center gap-1.5">
            <h3
              className={cn(
                "shrink-0 font-semibold",
                isMobile
                  ? "text-[15px] text-[#1e293b]"
                  : "text-[15px] text-[var(--student-foreground)]",
              )}
              title={groupName}
            >
              {title}
            </h3>
          </div>
        )}

        {sections !== "members" && (
        <>
        <div
          className={cn(
            "flex shrink-0 items-center gap-1 ml-auto",
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
              "ml-0.5 rounded-[var(--student-radius-sm)] border px-1.5 py-0.5 text-[10px] outline-none shrink-0",
              isMobile
                ? "border-[rgba(30,55,90,0.12)] bg-white text-[#334155]"
                : "border-[var(--student-border)] bg-white text-[var(--student-ink)] focus:ring-1 focus:ring-[var(--student-primary)]",
            )}
          >
            <option value="all">全部校区</option>
            <option value="浦东">浦东</option>
            <option value="浦西">浦西</option>
          </select>
          {/* 图表切换 tab：与时间范围/校区并入同一行，不再单独占一行 */}
          {showCharts && (
            <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-[var(--student-hairline)] pl-2">
              {([
                { key: "heatmap", label: "时段热力图" },
                { key: "room", label: "房间排行" },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setChartTab(t.key)}
                  className={presetBtnClass(chartTab === t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {headerExtra}
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
              style={{ background: ACCENT }}
            >
              确定
            </button>
          </div>
        )}
        </>
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
          {/* 学生端不展示 4 张 KPI 卡（课题组人数/总进出次数/人均频次/活跃度占比）：
              这些是课题组口径的汇总数字，对学生本人价值低且独占一行高度，用户 2026-10-14 口径移除。 */}
          {isMobile && sections === "all" && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 mb-3">
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
          )}

          {/* 成员表：单独成卡时按内容自然高度（不压缩）；与图表同卡时占剩余高度内部滚动 */}
          {showMembers && (
            <div className={cn(isMobile ? "mb-4" : standalone ? "flex-1 min-h-0 overflow-y-auto" : "mb-3 min-h-[120px] max-h-[200px] overflow-y-auto")}>
              {sections === "all" && <SectionTitle variant={variant}>课题组成员</SectionTitle>}
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
          )}

          {showCharts && (
            <div className={cn("flex min-h-0 flex-1 flex-col", !isMobile && !standalone && "shrink-0")}>
              {/* 图表容器：切换 tab 已并入标题栏那一行 */}
              <div className="min-h-0 flex-1 overflow-y-auto rounded-[var(--student-radius-md)] border border-[var(--student-border)] bg-[var(--student-canvas-soft)] p-3">
                {chartTab === "heatmap" ? (
                  <ActivityHeatmapChart data={heatmapQuery.data ?? []} loading={heatmapQuery.isLoading} />
                ) : (
                  <ActivityRoomChart data={roomQuery.data ?? []} loading={roomQuery.isLoading} />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );

  // 学生端（非移动）：卡片本身作为定高容器，内容铺满；成员表吃满剩余高度并内部滚动。
  // 不用 absolute（弹窗里卡片无定高会塌成 0），改用 h-full + flex-1：有定高时撑满，无定高时按内容自然排列。
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

  // 嵌入外部合并板块：不出 StudentCard，直接给内容
  if (embedded) {
    return <div className={cn("flex h-full min-h-0 flex-col", className)}>{content}</div>;
  }

  return (
    <StudentCard className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{content}</div>
    </StudentCard>
  );
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
