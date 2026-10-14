import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { listPlans, listPlayLogs } from "@/api/domains/broadcast.api";
import { blockBodyClass, blockHeadClass, blockTitleClass, tdClass, thClass } from "./ui";

const SOURCE_TEXT: Record<string, string> = {
  SCHEDULE: "定时",
  CATCHUP: "补播",
  MANUAL: "手动",
};

const ACTION_TEXT: Record<string, string> = {
  PLAY: "播放",
  STOP: "停止",
};

/**
 * 播放记录 —— 「今天到底响没响」看这里。
 * 平台自己的日志要翻它服务器上的文件，而且分不清「没触发」和「触发了但下发失败」。
 */
export default function PlayLogPanel() {
  const [planId, setPlanId] = useState<number | "">("");
  const plansQ = useQuery({ queryKey: ["broadcast", "plans"], queryFn: listPlans });
  const logsQ = useQuery({
    queryKey: ["broadcast", "playLogs", planId],
    queryFn: () => listPlayLogs(planId === "" ? null : planId, 80),
    refetchInterval: 30000,
  });

  const logs = logsQ.data ?? [];
  const plans = plansQ.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={blockHeadClass}>
        <span className={blockTitleClass}>播放记录</span>
        <AdminSelect
          className="h-7 max-w-[190px] text-xs"
          value={planId}
          onChange={(e) => setPlanId(e.target.value === "" ? "" : Number(e.target.value))}
        >
          <option value="">全部方案</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.planName}
            </option>
          ))}
        </AdminSelect>
      </div>

      <div className={blockBodyClass}>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className={thClass}>时间</th>
              <th className={thClass}>方案</th>
              <th className={thClass}>来源</th>
              <th className={thClass}>动作</th>
              <th className={thClass}>结果</th>
              <th className={thClass}>说明</th>
            </tr>
          </thead>
          <tbody>
            {logsQ.isLoading ? (
              <tr>
                <td className={tdClass} colSpan={6}>
                  <span className="text-sm text-[var(--app-color-text-tertiary)]">加载中…</span>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={6}>
                  <span className="text-sm text-[var(--app-color-text-tertiary)]">还没有播放记录</span>
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id} className="hover:bg-[var(--app-color-surface-hover)]">
                  <td className={`${tdClass} whitespace-nowrap tabular-nums text-xs`}>
                    {String(l.firedAt).replace("T", " ").slice(5, 16)}
                  </td>
                  <td className={`${tdClass} max-w-[160px] truncate text-xs`} title={l.planName ?? ""}>
                    {l.planName ?? "（手动）"}
                  </td>
                  <td className={`${tdClass} text-xs`}>{SOURCE_TEXT[l.source] ?? l.source}</td>
                  <td className={`${tdClass} text-xs`}>{ACTION_TEXT[l.action] ?? l.action}</td>
                  <td className={`${tdClass} text-xs`}>
                    <span
                      style={{
                        color: l.success
                          ? "var(--app-color-feedback-success)"
                          : "var(--app-color-feedback-danger)",
                      }}
                    >
                      {l.success ? "成功" : "失败"}
                    </span>
                  </td>
                  <td className={`${tdClass} max-w-[280px] truncate text-xs`} title={l.message ?? ""}>
                    {l.message ?? ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
