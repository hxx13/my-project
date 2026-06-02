import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import {
  fetchStudentActivityGroups,
  fetchStudentActivityMembers,
  fetchStudentActivityHeatmap,
  fetchStudentActivityRoomUsage,
  fetchStudentActivitySummary,
} from "@/api/domains/analytics.api";
import { ActivityFilterBar } from "./ActivityFilterBar";
import { ActivityMemberTable } from "./ActivityMemberTable";
import type { SortKey } from "./ActivityMemberTable";
import { ActivityHeatmapChart } from "./ActivityHeatmapChart";
import { ActivityRoomChart } from "./ActivityRoomChart";
import { AdminFormCard } from "@/components/admin/AdminPageShell";

function defaultLastMonth(): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10) + " 23:59:59";
  const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    .toISOString().slice(0, 10) + " 00:00:00";
  return { start, end };
}

export function StudentActivityReportPanel() {
  const initialRange = defaultLastMonth();
  const [groupName, setGroupName] = useState("");
  const [groupPage, setGroupPage] = useState(1);
  const [startTime, setStartTime] = useState(initialRange.start);
  const [endTime, setEndTime] = useState(initialRange.end);
  const [sortBy, setSortBy] = useState<SortKey>("entries");
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const [memberPage, setMemberPage] = useState(1);
  const [memberSize, setMemberSize] = useState(20);

  const handleSort = useCallback((key: SortKey) => {
    if (sortBy === key) { setOrder((o) => (o === "desc" ? "asc" : "desc")); }
    else { setSortBy(key); setOrder("desc"); }
    setMemberPage(1);
  }, [sortBy]);

  // Groups list (paginated, 1 per page)
  const groupsQuery = useQuery({
    queryKey: ["studentActivityGroups", groupPage, startTime, endTime],
    queryFn: () => fetchStudentActivityGroups({ startTime, endTime, page: groupPage, size: 1 }),
  });
  const groupList = groupsQuery.data?.groups ?? [];
  const groupTotal = groupsQuery.data?.total ?? 0;

  // Auto-select first group on initial load or when groupPage changes
  useEffect(() => {
    if (groupList.length > 0 && groupList[0].name !== groupName) {
      setGroupName(groupList[0].name);
    }
  }, [groupList]);

  // Summary
  const summaryQuery = useQuery({
    queryKey: ["studentActivitySummary", groupName, startTime, endTime],
    queryFn: () => fetchStudentActivitySummary({ groupName, startTime, endTime }),
    enabled: groupName.length > 0,
  });
  const summary = summaryQuery.data;
  const timeLabel = summary?.timeLabel ?? "";

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

  return (
    <div className="space-y-4">
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
      />

      {groupName ? (
        <>
          {/* KPI Cards with time range labels */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AdminFormCard title={`课题组人数（${timeLabel}）`}>
              <p className="text-2xl font-extrabold text-violet-600">{summary?.memberCount ?? "-"}</p>
            </AdminFormCard>
            <AdminFormCard title={`总进出次数（${timeLabel}）`}>
              <p className="text-2xl font-extrabold text-emerald-600">{summary?.totalEntries ?? "-"}</p>
            </AdminFormCard>
            <AdminFormCard title={`人均周频次（${timeLabel}）`}>
              <p className="text-2xl font-extrabold text-blue-600">{summary?.perCapitaWeeklyFreq ?? "-"}</p>
            </AdminFormCard>
            <AdminFormCard title={`近期活跃度占比（${timeLabel}）`}>
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
            <AdminFormCard title="进出时段热力图">
              <ActivityHeatmapChart data={heatmapQuery.data ?? []} loading={heatmapQuery.isLoading} />
            </AdminFormCard>
            <AdminFormCard title="该课题组喜好进出房间">
              <ActivityRoomChart data={roomQuery.data ?? []} loading={roomQuery.isLoading} />
            </AdminFormCard>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-white py-16 text-center">
          <Users className="h-10 w-10 text-neutral-300" />
          <p className="text-sm text-neutral-500">请在上方搜索并选择一个课题组以查看活跃度数据</p>
        </div>
      )}
    </div>
  );
}
