import type { ReactNode } from "react";
import type { AccessSwingRecordViewRow } from "@/api/domains/accessAudit.api";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import { labelMappingHit, labelOpenResult, labelOpenType } from "@/features/dahua-swing-records/swingRecordDisplay";

const TAG_LABEL: Record<string, string> = {
  MISSING_ENTER_EXIT: "缺进出",
  NO_MAPPING: "未映射",
  STUDENT: "学生",
  STAFF: "工作人员",
  OPEN_FAILED: "开门失败",
};

const PULL_TYPE_LABEL: Record<string, string> = {
  REALTIME: "实时",
  STATS: "审计",
};

/** 不含记录ID、通道编码（筛选仍可用通道名称） */
const COL_COUNT = 15;

type Props = {
  rows: AccessSwingRecordViewRow[];
  loading?: boolean;
  emptyHint?: string;
};

function OpenResultBadge({ result, label }: { result?: number; label?: string }) {
  const text = labelOpenResult(result, label);
  if (text === "-") return <span className="text-slate-400">-</span>;
  const ok = result === 1 || text === "成功";
  return (
    <span
      className={
        ok
          ? "rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800"
          : "rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-800"
      }
    >
      {text}
    </span>
  );
}

function Cell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <td className="px-2 py-1.5 max-w-[140px] truncate" title={title}>
      {children}
    </td>
  );
}

export function AccessSwingRecordTable({ rows, loading, emptyHint = "暂无记录" }: Props) {
  return (
    <AdminDataTableWrap scrollable>
      <table className="w-full min-w-[1320px] text-xs">
        <thead className="bg-slate-50 text-slate-600 sticky top-0 z-[1]">
          <tr>
            <th className="px-2 py-2 text-left whitespace-nowrap">刷卡时间</th>
            <th className="px-2 py-2 text-left">拉取</th>
            <th className="px-2 py-2 text-left">任务</th>
            <th className="px-2 py-2 text-left">通道名称</th>
            <th className="px-2 py-2 text-left">卡号</th>
            <th className="px-2 py-2 text-left">工号</th>
            <th className="px-2 py-2 text-left">姓名</th>
            <th className="px-2 py-2 text-left">部门ID</th>
            <th className="px-2 py-2 text-left">部门名称</th>
            <th className="px-2 py-2 text-left">开门类型</th>
            <th className="px-2 py-2 text-left">刷卡成功</th>
            <th className="px-2 py-2 text-left">进出</th>
            <th className="px-2 py-2 text-left">受众</th>
            <th className="px-2 py-2 text-left">映射</th>
            <th className="px-2 py-2 text-left">标签</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={COL_COUNT} className="px-3 py-8 text-center text-slate-400">
                加载中…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={COL_COUNT} className="px-3 py-8 text-center text-slate-400">
                {emptyHint}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={`${r.taskId}-${r.recordId}`} className="border-t hover:bg-slate-50/80">
                <td className="px-2 py-1.5 whitespace-nowrap">{r.swingTime || "-"}</td>
                <td className="px-2 py-1.5">
                  {r.pullTaskType ? PULL_TYPE_LABEL[r.pullTaskType] || r.pullTaskType : "-"}
                </td>
                <td className="px-2 py-1.5">{r.taskId ?? "-"}</td>
                <Cell title={r.channelName || r.channelCode}>{r.channelName || r.channelCode || "-"}</Cell>
                <Cell title={r.cardNumber}>{r.cardNumber || "-"}</Cell>
                <Cell title={r.personCode}>{r.personCode || "-"}</Cell>
                <Cell title={r.personName}>{r.personName || "-"}</Cell>
                <Cell title={r.departmentId}>{r.departmentId || "-"}</Cell>
                <Cell title={r.departmentName}>{r.departmentName || "-"}</Cell>
                <Cell title={labelOpenType(r.openType)}>
                  {r.openTypeLabel || labelOpenType(r.openType)}
                </Cell>
                <td className="px-2 py-1.5">
                  <OpenResultBadge result={r.openResult} label={r.openResultLabel} />
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.enterOrExitLabel || "-"}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.audienceLabel || r.audienceType || "-"}</td>
                <Cell title={r.mappingUserId}>
                  {r.mappingHitLabel || labelMappingHit(r.mappingHit, r.mappingUserId)}
                </Cell>
                <td className="px-2 py-1.5 min-w-[100px]">
                  <div className="flex flex-wrap gap-0.5">
                    {(r.tags || []).length === 0 ? (
                      <span className="text-slate-400">-</span>
                    ) : (
                      (r.tags || []).map((t) => (
                        <span key={t} className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600">
                          {TAG_LABEL[t] || t}
                        </span>
                      ))
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </AdminDataTableWrap>
  );
}
