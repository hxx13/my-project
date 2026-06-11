import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Users } from "lucide-react";
import {
  fetchStudentActivityGroups,
  fetchStudentActivityMembers,
  fetchStudentActivityHeatmap,
  fetchStudentActivityRoomUsage,
  fetchStudentActivitySummary,
  recalculateStudentActivitySnapshots,
} from "@/api/domains/analytics.api";
import toast from "react-hot-toast";
import { ActivityFilterBar } from "./ActivityFilterBar";
import { ActivityMemberTable } from "./ActivityMemberTable";
import type { SortKey } from "./ActivityMemberTable";
import { ActivityHeatmapChart } from "./ActivityHeatmapChart";
import { ActivityRoomChart } from "./ActivityRoomChart";
import { AdminFormCard } from "@/components/admin/AdminPageShell";

function defaultMonthRange(): { start: string; end: string } {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const end = yesterday.toISOString().slice(0, 10) + " 23:59:59";
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10) + " 00:00:00";
  return { start, end };
}

/** 客户端推导 timeLabel，无需等后端返回 */
function deriveTimeLabel(start: string, end: string): string {
  const s = start.slice(0, 10);
  const e = end.slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (s === yesterday && e === yesterday) return "昨日";

  // Check if it's this week (Monday to yesterday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - daysFromMonday);
  const mondayStr = monday.toISOString().slice(0, 10);
  if (s === mondayStr && e === yesterday) return "本周";

  // Check if it's this month
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  if (s === firstDay && e === yesterday) return "本月";

  return s.slice(5) + "-" + e.slice(5);
}

export function StudentActivityReportPanel() {
  const queryClient = useQueryClient();
  const initialRange = defaultMonthRange();
  const [groupName, setGroupName] = useState("");
  const [groupPage, setGroupPage] = useState(1);
  const [startTime, setStartTime] = useState(initialRange.start);
  const [endTime, setEndTime] = useState(initialRange.end);
  const [sortBy, setSortBy] = useState<SortKey>("entries");
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const [memberPage, setMemberPage] = useState(1);
  const [memberSize, setMemberSize] = useState(20);
  const [campus, setCampus] = useState("all");
  const [recalculating, setRecalculating] = useState(false);

  const handleSort = useCallback((key: SortKey) => {
    if (sortBy === key) { setOrder((o) => (o === "desc" ? "asc" : "desc")); }
    else { setSortBy(key); setOrder("desc"); }
    setMemberPage(1);
  }, [sortBy]);

  // Groups list (paginated, 1 per page) — always fetch on mount
  const groupsQuery = useQuery({
    queryKey: ["studentActivityGroups", groupPage, startTime, endTime, campus],
    queryFn: () => fetchStudentActivityGroups({ startTime, endTime, page: groupPage, size: 1, campus }),
    staleTime: 30_000,
  });
  const groupList = groupsQuery.data?.groups ?? [];
  const groupTotal = groupsQuery.data?.total ?? 0;
  const isGroupsLoading = groupsQuery.isLoading;

  // Auto-select first group on initial load or when groupPage changes
  useEffect(() => {
    if (groupList.length > 0 && groupList[0].name !== groupName) {
      setGroupName(groupList[0].name);
    }
  }, [groupList]);

  // Client-side timeLabel fallback (always in sync with selected time range)
  const timeLabel = useMemo(() => deriveTimeLabel(startTime, endTime), [startTime, endTime]);

  // Summary (server timeLabel used as override when available)
  const summaryQuery = useQuery({
    queryKey: ["studentActivitySummary", groupName, startTime, endTime, campus],
    queryFn: () => fetchStudentActivitySummary({ groupName, startTime, endTime, campus }),
    enabled: groupName.length > 0,
  });
  const summary = summaryQuery.data;
  const displayTimeLabel = summary?.timeLabel || timeLabel;

  // Members
  const membersQuery = useQuery({
    queryKey: ["studentActivityMembers", groupName, startTime, endTime, sortBy, order, memberPage, memberSize],
    queryFn: () => fetchStudentActivityMembers({ groupName, startTime, endTime, sortBy, order, page: memberPage, size: memberSize }),
    enabled: groupName.length > 0,
  });
  const members = membersQuery.data?.members ?? [];
  const memberTotal = membersQuery.data?.total ?? 0;

  // Heatmap
  const heatmapQuery = useQuery({
    queryKey: ["studentActivityHeatmap", groupName, startTime, endTime],
    queryFn: () => fetchStudentActivityHeatmap({ groupName, startTime, endTime }),
    enabled: groupName.length > 0,
  });

  // Room usage (replaces daily trend)
  const roomQuery = useQuery({
    queryKey: ["studentActivityRoomUsage", groupName, startTime, endTime],
    queryFn: () => fetchStudentActivityRoomUsage({ groupName, startTime, endTime }),
    enabled: groupName.length > 0,
  });

  const exportCSV = useCallback(() => {
    if (members.length === 0) return;
    const header = "userId,userName,experienceLevel,entryCount,totalDurationMinutes,weeklyAvgFreq,lastActiveDate";
    const rows = members.map((m) =>
      [m.userId, m.userName, m.experienceLevel, m.entryCount, m.totalDurationMinutes, m.weeklyAvgFreq, m.lastActiveDate ?? ""].join(",")
    );
    const csv = "﻿" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `学生活跃度_${groupName}_${startTime.slice(0, 10)}_${endTime.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [members, groupName, startTime, endTime]);

  const handleRecalculate = useCallback(async () => {
    if (recalculating) return;
    setRecalculating(true);
    try {
      const res = await recalculateStudentActivitySnapshots(30);
      toast.success(`快照重算完成：${res.from} ~ ${res.to}`);
      // 刷新所有相关查询
      queryClient.invalidateQueries({ queryKey: ["studentActivityGroups"] });
      queryClient.invalidateQueries({ queryKey: ["studentActivitySummary"] });
    } catch (e: any) {
      toast.error(e?.message || "重算失败");
    } finally {
      setRecalculating(false);
    }
  }, [recalculating, queryClient]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <ActivityFilterBar
            groupName={groupName}
            groupPage={groupPage}
            groupTotal={groupTotal}
            onGroupChange={(name) => { setGroupName(name); }}
            onGroupPageChange={(p) => { setGroupPage(p); setMemberPage(1); }}
            startTime={startTime}
            endTime={endTime}
            onTimeChange={(s, e) => { setStartTime(s); setEndTime(e); setGroupPage(1); setMemberPage(1); }}
            onExportCSV={exportCSV}
            campus={campus}
            onCampusChange={(c) => setCampus(c)}
          />
        </div>
        <button
          type="button"
          onClick={handleRecalculate}
          disabled={recalculating}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-40 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${recalculating ? "animate-spin" : ""}`} />
          强制重算
        </button>
      </div>

      {isGroupsLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-white py-16 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
          <p className="text-sm text-neutral-500">正在加载课题组数据…</p>
        </div>
      ) : groupName ? (
        <>
          {/* KPI Cards with time range labels */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AdminFormCard title={`课题组人数（${displayTimeLabel}）`}>
              <p className="text-2xl font-extrabold text-violet-600">{summary?.memberCount ?? "-"}</p>
            </AdminFormCard>
            <AdminFormCard title={`总进出次数（${displayTimeLabel}）`}>
              <p className="text-2xl font-extrabold text-emerald-600">{summary?.totalEntries ?? "-"}</p>
            </AdminFormCard>
            <AdminFormCard title={`人均频次（${summary?.rateLabel || "本月"}）`}>
              <p className="text-2xl font-extrabold text-blue-600">{summary?.perCapitaWeeklyFreq ?? "-"}</p>
            </AdminFormCard>
            <AdminFormCard title={`近期活跃度占比（${summary?.rateLabel || "本月"}）`}>
              <p className="text-2xl font-extrabold text-amber-600">{summary?.activeSharePct != null ? `${summary.activeSharePct}%` : "-"}</p>
            </AdminFormCard>
          </div>

          {/* Member table */}
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

          {/* Charts: heatmap + room preference */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <AdminFormCard title="进出时段热力图" className="min-w-0">
              <ActivityHeatmapChart data={heatmapQuery.data ?? []} loading={heatmapQuery.isLoading} />
            </AdminFormCard>
            <AdminFormCard title="该课题组喜好进出房间" className="min-w-0">
              <ActivityRoomChart data={roomQuery.data ?? []} loading={roomQuery.isLoading} />
            </AdminFormCard>
          </div>
        </>
      ) : groupTotal === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-white py-16 text-center">
          <Users className="h-10 w-10 text-neutral-300" />
          <p className="text-sm text-neutral-500">当前时间范围内无课题组活跃数据</p>
        </div>
      ) : null}
    </div>
  );
}
