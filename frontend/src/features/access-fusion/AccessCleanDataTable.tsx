import type { CleanPreviewRow, ManualCleanItem } from "@/api/domains/accessFusion.api";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";
import { cleanRowClass, effectiveInclude } from "./accessCleanTableUtils";

type Props = {
  rows: CleanPreviewRow[];
  emptyHint: string;
  readOnly?: boolean;
  manual?: Record<string, ManualCleanItem>;
  onPatchManual?: (recordId: string, patch: Partial<ManualCleanItem>) => void;
};

export function AccessCleanDataTable({ rows, emptyHint, readOnly, manual, onPatchManual }: Props) {
  return (
    <AdminDataTableWrap scrollable>
      <table className="w-full min-w-[1000px] text-xs">
        <thead className="bg-slate-50 text-slate-600 sticky top-0">
          <tr>
            <th className="px-2 py-2 text-left">时间</th>
            <th className="px-2 py-2 text-left">通道</th>
            <th className="px-2 py-2 text-left">人员</th>
            <th className="px-2 py-2 text-left">部门</th>
            <th className="px-2 py-2 text-left">分类</th>
            <th className="px-2 py-2 text-left">进出</th>
            <th className="px-2 py-2 text-left">状态</th>
            <th className="px-2 py-2 text-left">原因</th>
            <th className="px-2 py-2 text-left">方向</th>
            {!readOnly ? <th className="px-2 py-2 text-left">人工</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={readOnly ? 9 : 10} className="py-10 text-center text-slate-400">
                {emptyHint}
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const m = manual?.[r.recordId];
              const incl = effectiveInclude(r, m?.manualOverride);
              return (
                <tr key={r.recordId} className={cn("border-t", cleanRowClass(r))}>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {String(r.swingTime ?? "").replace("T", " ")}
                  </td>
                  <td className="px-2 py-1.5">{r.channelName || r.channelCode}</td>
                  <td className="px-2 py-1.5">{r.personName || r.personCode || "-"}</td>
                  <td className="px-2 py-1.5 max-w-[120px] truncate" title={r.departmentName}>
                    {r.departmentName || r.departmentId || "-"}
                  </td>
                  <td className="px-2 py-1.5">
                    {r.audienceType === "STUDENT" ? "学生" : r.audienceType === "STAFF" ? "工作人员" : "-"}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {r.enterOrExitLabel ||
                      (r.enterOrExit === 1 ? "进入" : r.enterOrExit === 2 ? "离开" : "-")}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium",
                        incl ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                      )}
                    >
                      {incl ? "纳入" : "排除"}
                    </span>
                    {r.manualOverride === "FORCE_INCLUDE" || r.manualOverride === "FORCE_EXCLUDE" ? (
                      <span className="ml-1 text-[10px] text-indigo-600">人工</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 max-w-[200px] truncate" title={r.autoReason}>
                    {r.autoReason || "-"}
                  </td>
                  <td className="px-2 py-1.5">
                    {m?.directionOverride ||
                      r.directionOverride ||
                      r.enterOrExitLabel ||
                      (r.enterOrExit === 1 ? "进入" : r.enterOrExit === 2 ? "离开" : null) ||
                      r.direction ||
                      "-"}
                  </td>
                  {!readOnly && onPatchManual ? (
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        className="underline text-emerald-800 mr-1"
                        onClick={() => onPatchManual(r.recordId, { manualOverride: "FORCE_INCLUDE" })}
                      >
                        纳入
                      </button>
                      <button
                        type="button"
                        className="underline text-slate-600 mr-1"
                        onClick={() => onPatchManual(r.recordId, { manualOverride: "FORCE_EXCLUDE" })}
                      >
                        排除
                      </button>
                      <button
                        type="button"
                        className="underline text-indigo-700"
                        onClick={() => onPatchManual(r.recordId, { manualVerdict: "CONFIRMED" })}
                      >
                        确认
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </AdminDataTableWrap>
  );
}
