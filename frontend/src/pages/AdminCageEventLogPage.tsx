import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { useQuery } from "@tanstack/react-query";
import { Clock, Search, ArrowLeft } from "lucide-react";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import {
  fetchCageEventLogs,
  type CageEventLogEntry,
  EVENT_TYPE_LABELS,
} from "@/api/domains/cageShelf.api";

const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS);

function eventColor(type: string): string {
  if (type === "BASELINE_ESTABLISHED") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (type.startsWith("BOX_")) return "bg-blue-100 text-blue-800 border-blue-300";
  if (type.startsWith("STATUS_")) return "bg-amber-100 text-amber-800 border-amber-300";
  if (type === "TYPE_CHANGED") return "bg-purple-100 text-purple-800 border-purple-300";
  if (type.endsWith("_CHANGED")) return "bg-slate-100 text-slate-700 border-slate-300";
  return "bg-gray-100 text-gray-700 border-gray-300";
}

export default function AdminCageEventLogPage() {
  const navigate = useNavigate();
  const [eventType, setEventType] = useState("");
  const [campusName, setCampusName] = useState("");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["cageEventLogs", { eventType, campusName, searchText, page }],
    queryFn: () =>
      fetchCageEventLogs({
        eventType: eventType || undefined,
        campusName: campusName || undefined,
        searchText: searchText || undefined,
        offset: page * pageSize,
        limit: pageSize,
      }),
    placeholderData: (prev) => prev,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminPageShell>
      {/* Toolbar: back + title */}
      <div className="flex items-center gap-2 mb-4">
        <button type="button" className="hover:bg-[var(--twin-canvas-soft)] rounded-twin-md p-1 -ml-1 transition" onClick={() => navigate(toAdminRoutePath("/admin/cage-shelves"))} title="返回笼架信息">
          <ArrowLeft className="h-5 w-5 text-[var(--twin-link-deep)]" />
        </button>
        <h3 className="text-lg font-semibold text-[var(--app-color-text-primary)] inline-flex items-center gap-2">
          <Clock className="h-5 w-5 shrink-0 text-[var(--twin-link-deep)]" />
          笼位事件日志
        </h3>
      </div>

      {/* Scroll container */}
      <div className="max-h-[calc(100dvh-var(--admin-chrome-offset)-48px)] min-h-[200px] overflow-y-auto">
        <div className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-4 py-2.5">
          <span className="text-xs font-medium text-[var(--twin-mute)] flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> 事件类型
          </span>
          <select
            className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-xs"
            value={eventType}
            onChange={(e) => { setEventType(e.target.value); setPage(0); }}
          >
            <option value="">全部事件</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <select
            className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-xs"
            value={campusName}
            onChange={(e) => { setCampusName(e.target.value); setPage(0); }}
          >
            <option value="">全部校区</option>
            <option value="浦东">浦东</option>
            <option value="浦西">浦西</option>
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--twin-mute)]" />
            <input
              type="text"
              className="w-full rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] pl-7 pr-2 py-1 text-xs"
              placeholder="搜索笼盒号 / 位置 / 房间 / PI / 部门…"
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); setPage(0); }}
            />
          </div>
          <button
            type="button"
            className="text-xs text-[var(--twin-link-deep)] hover:underline"
            onClick={() => refetch()}
          >
            刷新
          </button>
          <span className="text-[10px] text-[var(--twin-mute)] ml-auto">
            共 {total} 条
          </span>
        </div>

        {/* Table */}
        {isLoading && (
          <div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] py-12 text-center text-sm text-[var(--twin-mute)]">
            加载事件日志中…
          </div>
        )}
        {error && (
          <div className="rounded-twin-xl border border-red-200 bg-red-50/60 py-12 text-center text-sm text-red-700">
            {error instanceof Error ? error.message : "加载失败"}
            <button type="button" className="ml-2 underline" onClick={() => refetch()}>重试</button>
          </div>
        )}
        {!isLoading && !error && rows.length === 0 && (
          <div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] py-12 text-center text-sm text-[var(--twin-mute)]">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
            暂无事件日志
            <br />
            <span className="text-[11px]">首次同步建立基线，第二次及之后自动 diff 生成变更事件</span>
          </div>
        )}

        {!isLoading && !error && rows.length > 0 && (
          <>
            <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] overflow-hidden">
              <div className="overflow-auto max-h-[65vh]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--twin-canvas-soft)] text-[var(--twin-body)] sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left w-[140px]">时间</th>
                      <th className="px-3 py-2 text-left w-[80px]">类型</th>
                      <th className="px-3 py-2 text-left w-[100px]">笼盒号</th>
                      <th className="px-3 py-2 text-left">摘要</th>
                      <th className="px-3 py-2 text-left w-[80px]">PI</th>
                      <th className="px-3 py-2 text-left">变更前位置</th>
                      <th className="px-3 py-2 text-left">变更后位置</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-[var(--twin-hairline)] hover:bg-[var(--twin-canvas-soft)]">
                        <td className="px-3 py-1.5 text-[var(--twin-mute)] font-mono text-[10px]">{row.changedAt}</td>
                        <td className="px-3 py-1.5">
                          <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${eventColor(row.eventType)}`}>
                            {EVENT_TYPE_LABELS[row.eventType] ?? row.eventType}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[10px]">{row.cageBoxQrCode || "-"}</td>
                        <td className="px-3 py-1.5 max-w-[360px] truncate">{row.detailSummary || "-"}</td>
                        <td className="px-3 py-1.5">{row.projectPiName || row.piName || "-"}</td>
                        <td className="px-3 py-1.5 text-[10px] text-[var(--twin-mute)]">
                          {row.prevCampusName && row.prevPosition
                            ? `${row.prevCampusName || ""}-${row.prevRoomName || ""}-${row.prevPosition}`
                            : row.prevPosition || "-"}
                        </td>
                        <td className="px-3 py-1.5 text-[10px]">
                          {row.currCampusName && row.currPosition
                            ? `${row.currCampusName || ""}-${row.currRoomName || ""}-${row.currPosition}`
                            : row.currPosition || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--twin-mute)]">第 {page + 1} / {totalPages} 页</span>
              <div className="flex gap-1">
                <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="rounded-twin-md border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-30 hover:bg-[var(--twin-canvas-soft)]">
                  上一页
                </button>
                <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}
                  className="rounded-twin-md border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-30 hover:bg-[var(--twin-canvas-soft)]">
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
        </div>
      </div>
    </AdminPageShell>
  );
}
