import { cn } from "@/lib/utils";
import type { StudentActivityMember } from "@/api/domains/analytics.api";

export type SortKey = "entries" | "totalDurationMinutes" | "weeklyAvgFreq" | "lastActiveDate";

type Props = {
  members: StudentActivityMember[];
  sortBy: SortKey;
  order: "desc" | "asc";
  onSort: (key: SortKey) => void;
  loading?: boolean;
  page: number;
  total: number;
  size: number;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

function formatLastActive(dateStr: string | null, daysSince: number): { text: string; color: string } {
  if (!dateStr) return { text: "无记录", color: "text-neutral-400" };
  if (daysSince === 0) return { text: "今天", color: "text-emerald-600" };
  if (daysSince === 1) return { text: "昨天", color: "text-emerald-600" };
  if (daysSince <= 3) return { text: `${daysSince}天前`, color: "text-amber-600" };
  if (daysSince <= 7) return { text: `${daysSince}天前`, color: "text-orange-600" };
  return { text: `${daysSince}天前`, color: "text-red-500" };
}

export function ActivityMemberTable({
  members, sortBy, order, onSort, loading, page, total, size, onPageChange, onSizeChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / size));

  const SortArrow = ({ col }: { col: SortKey }) => {
    if (sortBy !== col) return <span className="ml-1 text-neutral-300">↕</span>;
    return <span className="ml-1 text-violet-600">{order === "desc" ? "↓" : "↑"}</span>;
  };

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-neutral-50 text-[11px] font-semibold text-neutral-600">
            <tr>
              <th className="px-3 py-3 text-left whitespace-nowrap">#</th>
              <th className="px-3 py-3 text-left whitespace-nowrap min-w-[4.5rem]">姓名</th>
              <th className="px-3 py-3 text-left whitespace-nowrap">经验等级</th>
              <th className="px-3 py-3 text-left cursor-pointer select-none hover:text-violet-700" onClick={() => onSort("entries")}>
                进出次数 <SortArrow col="entries" />
              </th>
              <th className="px-3 py-3 text-left cursor-pointer select-none hover:text-violet-700" onClick={() => onSort("totalDurationMinutes")}>
                总时长 <SortArrow col="totalDurationMinutes" />
              </th>
              <th className="px-3 py-3 text-left cursor-pointer select-none hover:text-violet-700" onClick={() => onSort("weeklyAvgFreq")}>
                周均频次 <SortArrow col="weeklyAvgFreq" />
              </th>
              <th className="px-3 py-3 text-left cursor-pointer select-none hover:text-violet-700" onClick={() => onSort("lastActiveDate")}>
                最近活跃 <SortArrow col="lastActiveDate" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-neutral-400">加载中…</td></tr>
            ) : members.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-neutral-400">暂未选择课题组或无数据</td></tr>
            ) : (
              members.map((m, i) => {
                const lastActive = formatLastActive(m.lastActiveDate, m.daysSinceLastActive);
                return (
                  <tr key={m.userId} className={cn("hover:bg-violet-50/50 transition", i % 2 === 0 && "bg-white", i % 2 === 1 && "bg-neutral-50/30")}>
                    <td className="px-3 py-2.5 font-mono text-neutral-400 whitespace-nowrap">{(page - 1) * size + i + 1}</td>
                    <td className="px-3 py-2.5 font-medium text-neutral-900 whitespace-nowrap">
                      {m.userName}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-violet-600 whitespace-nowrap">{m.experienceLevel}</td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-violet-700">{m.entryCount}</td>
                    <td className="px-3 py-2.5 font-mono text-neutral-700">{formatDuration(m.totalDurationMinutes)}</td>
                    <td className="px-3 py-2.5 font-mono text-neutral-700">{m.weeklyAvgFreq}</td>
                    <td className={cn("px-3 py-2.5 font-medium", lastActive.color)}>{lastActive.text}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/50 px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          共 {total} 人
          <select
            value={size}
            onChange={(e) => { onSizeChange(Number(e.target.value)); onPageChange(1); }}
            className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-xs"
          >
            {[10, 20, 30, 50].map((s) => <option key={s} value={s}>{s}/页</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded border border-neutral-200 bg-white px-2 py-1 disabled:opacity-30 hover:bg-neutral-100"
          >
            上一页
          </button>
          <span className="font-medium text-neutral-600">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="rounded border border-neutral-200 bg-white px-2 py-1 disabled:opacity-30 hover:bg-neutral-100"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
