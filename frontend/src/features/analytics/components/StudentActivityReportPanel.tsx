import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Users } from "lucide-react";
import {
  fetchStudentActivityMembers,
  fetchStudentActivityHeatmap,
  fetchStudentActivityDailyTrend,
} from "@/api/domains/analytics.api";
import { ActivityFilterBar } from "./ActivityFilterBar";
import { ActivityMemberTable } from "./ActivityMemberTable";
import type { SortKey } from "./ActivityMemberTable";
import { ActivityHeatmapChart } from "./ActivityHeatmapChart";
import { ActivityTrendChart } from "./ActivityTrendChart";
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
  const [startTime, setStartTime] = useState(initialRange.start);
  const [endTime, setEndTime] = useState(initialRange.end);
  const [sortBy, setSortBy] = useState<SortKey>("entries");
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);

  const handleSort = useCallback((key: SortKey) => {
    if (sortBy === key) {
      setOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(key);
      setOrder("desc");
    }
    setPage(1);
  }, [sortBy]);

  const membersQuery = useQuery({
    queryKey: ["studentActivityMembers", groupName, startTime, endTime, sortBy, order, page, size],
    queryFn: () => fetchStudentActivityMembers({ groupName, startTime, endTime, sortBy, order, page, size }),
    enabled: groupName.length > 0,
  });

  const heatmapQuery = useQuery({
    queryKey: ["studentActivityHeatmap", groupName, startTime, endTime],
    queryFn: () => fetchStudentActivityHeatmap({ groupName, startTime, endTime }),
    enabled: groupName.length > 0,
  });

  const trendQuery = useQuery({
    queryKey: ["studentActivityDailyTrend", groupName, startTime, endTime],
    queryFn: () => fetchStudentActivityDailyTrend({ groupName, startTime, endTime }),
    enabled: groupName.length > 0,
  });

  const summary = membersQuery.data?.summary;
  const members = membersQuery.data?.members ?? [];
  const total = membersQuery.data?.total ?? 0;

  const exportCSV = useCallback(() => {
    if (members.length === 0) return;
    const header = "userId,userName,entryCount,totalDurationMinutes,dailyAvgFreq,lastActiveDate";
    const rows = members.map((m) =>
      [m.userId, m.userName, m.entryCount, m.totalDurationMinutes, m.dailyAvgFreq, m.lastActiveDate ?? ""].join(",")
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
        onGroupChange={(name) => { setGroupName(name); setPage(1); }}
        startTime={startTime}
        endTime={endTime}
        onTimeChange={(start, end) => { setStartTime(start); setEndTime(end); setPage(1); }}
      />

      {groupName ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AdminFormCard title="课题组人数">
              <p className="text-2xl font-extrabold text-violet-600">{summary?.memberCount ?? "-"}</p>
            </AdminFormCard>
            <AdminFormCard title="总进出次数">
              <p className="text-2xl font-extrabold text-emerald-600">{summary?.totalEntries ?? "-"}</p>
            </AdminFormCard>
            <AdminFormCard title="人均日频次">
              <p className="text-2xl font-extrabold text-blue-600">{summary?.avgDailyFreq ?? "-"}</p>
            </AdminFormCard>
            <AdminFormCard title="近期活跃率">
              <p className="text-2xl font-extrabold text-amber-600">{summary?.activeRate != null ? `${summary.activeRate}%` : "-"}</p>
            </AdminFormCard>
          </div>

          {/* Export button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={exportCSV}
              disabled={members.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              导出 CSV
            </button>
          </div>

          {/* Member ranking table */}
          <ActivityMemberTable
            members={members}
            sortBy={sortBy}
            order={order}
            onSort={handleSort}
            loading={membersQuery.isLoading}
            page={page}
            total={total}
            size={size}
            onPageChange={setPage}
            onSizeChange={setSize}
          />

          {/* Dual charts */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <AdminFormCard title="进出时段热力图">
              <ActivityHeatmapChart data={heatmapQuery.data ?? []} loading={heatmapQuery.isLoading} />
            </AdminFormCard>
            <AdminFormCard title="每日进出趋势">
              <ActivityTrendChart data={trendQuery.data ?? []} loading={trendQuery.isLoading} />
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
