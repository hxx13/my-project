import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Play, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { AdminRightDrawer } from "@/components/admin/AdminRightDrawer";
import { AdminButton } from "@/components/admin/AdminButton";
import {
  deleteAccessExecutionLog,
  executeAccessClean,
  fetchAccessExecutionLogDetail,
  listAccessCleanRuleProfiles,
  listAccessExecutionLogs,
  updateAccessExecutionLogMeta,
  type AccessCleanExecutionLog,
  type AccessCleanRuleProfile,
  type DailyCleanLedgerEntry,
} from "@/api/domains/accessFusion.api";
import { listDahuaSwingStatsTasks, type DahuaSwingStatsPullTask } from "@/api/domains/dahuaSwingStats.api";

const toApiDt = (v: string) => (v ? `${v.replace("T", " ")}:00` : "");

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statsTaskId: number;
  channelCodes: string[];
  startTime: string;
  endTime: string;
  selectedLogId: number | null;
  onSelectLogId: (id: number | null) => void;
  onLogDeleted?: () => void;
};

function DailyLedgerTable({ rows }: { rows: DailyCleanLedgerEntry[] }) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => {
    const d = (a.coverageDay ?? "").localeCompare(b.coverageDay ?? "");
    if (d !== 0) return d;
    return (a.channelCode ?? "").localeCompare(b.channelCode ?? "");
  });
  return (
    <div className="overflow-auto rounded border border-slate-200">
      <table className="w-full min-w-[520px] text-[10px]">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-2 py-1 text-left">覆盖日</th>
            <th className="px-2 py-1 text-left">通道</th>
            <th className="px-2 py-1 text-right">扫描</th>
            <th className="px-2 py-1 text-right">纳入</th>
            <th className="px-2 py-1 text-right">排除</th>
            <th className="px-2 py-1 text-left">状态</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={`${r.coverageDay}-${r.channelCode}-${i}`} className="border-t">
              <td className="px-2 py-1 font-medium">{r.coverageDay ?? "—"}</td>
              <td className="px-2 py-1 max-w-[140px] truncate" title={r.channelCode}>
                {r.channelCode ?? "—"}
              </td>
              <td className="px-2 py-1 text-right tabular-nums">{r.totalScanned ?? 0}</td>
              <td className="px-2 py-1 text-right tabular-nums font-semibold text-emerald-800">
                {r.includedCount ?? 0}
              </td>
              <td className="px-2 py-1 text-right tabular-nums">{r.excludedCount ?? 0}</td>
              <td className="px-2 py-1">
                {r.status === "FAILED" ? (
                  <span className="text-rose-600" title={r.error}>
                    失败
                  </span>
                ) : r.truncated ? (
                  <span className="text-amber-700">截断</span>
                ) : (
                  <span className="text-emerald-700">成功</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AccessFusionExecutionLogDrawer({
  open,
  onOpenChange,
  statsTaskId,
  channelCodes,
  startTime,
  endTime,
  selectedLogId,
  onSelectLogId,
  onLogDeleted,
}: Props) {
  const [profiles, setProfiles] = useState<AccessCleanRuleProfile[]>([]);
  const [tasks, setTasks] = useState<DahuaSwingStatsPullTask[]>([]);
  const [logs, setLogs] = useState<AccessCleanExecutionLog[]>([]);
  const [filterTaskId, setFilterTaskId] = useState(0);
  const [profileId, setProfileId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AccessCleanExecutionLog | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const [metaSaving, setMetaSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAccessExecutionLogs({
        statsPullTaskId: filterTaskId > 0 ? filterTaskId : undefined,
        cleanRuleProfileId: profileId > 0 ? profileId : undefined,
        page: 1,
        pageSize: 80,
      });
      setLogs(res.items ?? []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filterTaskId, profileId]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const [p, t] = await Promise.all([listAccessCleanRuleProfiles(), listDahuaSwingStatsTasks()]);
        setProfiles(p);
        setTasks(t);
      } catch {
        setProfiles([]);
        setTasks([]);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (open) void loadLogs();
  }, [open, loadLogs]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      setNoteDraft("");
      setStatusDraft("");
      return;
    }
    setDetailLoading(true);
    void fetchAccessExecutionLogDetail(detailId)
      .then((d) => {
        setDetail(d);
        setNoteDraft(d.noteText ?? "");
        setStatusDraft(d.status ?? "");
      })
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [detailId]);

  const handleSaveMeta = async () => {
    if (!detail?.id) return;
    setMetaSaving(true);
    try {
      const updated = await updateAccessExecutionLogMeta(detail.id, {
        noteText: noteDraft,
        status: statusDraft || undefined,
      });
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      setDetail(updated);
      setLogs((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      toast.success("已保存备注");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setMetaSaving(false);
    }
  };

  const handleDeleteLog = async () => {
    if (!detail?.id) return;
    if (!window.confirm("确定删除该条入库执行日志？不可恢复。")) return;
    setDeleting(true);
    try {
      await deleteAccessExecutionLog(detail.id);
      setLogs((prev) => prev.filter((r) => r.id !== detail.id));
      if (selectedLogId === detail.id) onLogDeleted?.();
      setDetailId(null);
      setDetail(null);
      toast.success("已删除日志");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const ledgerFromDetail = useMemo(() => {
    if (!detail) return [];
    if (detail.logType === "BATCH_SUMMARY" && detail.dailyLedger?.length) {
      return detail.dailyLedger;
    }
    if (detail.coverageDay && detail.channelCode) {
      return [
        {
          coverageDay: detail.coverageDay,
          channelCode: detail.channelCode,
          windowStart: detail.windowStart,
          windowEnd: detail.windowEnd,
          totalScanned: detail.totalScanned,
          includedCount: detail.includedCount,
          excludedCount: detail.excludedCount,
          status: detail.status,
          executionLogId: detail.id,
        },
      ];
    }
    return [];
  }, [detail]);

  const handleRerun = async () => {
    const ch = channelCodes.length === 1 ? channelCodes[0] : channelCodes[0];
    if (!ch) {
      toast.error("请先在上方筛选栏选择至少一个通道");
      return;
    }
    if (!startTime || !endTime) {
      toast.error("请先应用有效的时间窗");
      return;
    }
    setRerunning(true);
    try {
      await executeAccessClean({
        statsTaskId: statsTaskId || undefined,
        scopeMode: statsTaskId ? "SELECTED_TASK" : "ALL_LINKED",
        channelCode: ch,
        startTime: toApiDt(startTime),
        endTime: toApiDt(endTime),
        cleanRuleProfileId: profileId || undefined,
        splitByDay: true,
      });
      toast.success("已按日补跑清洗并写入总库，请查看批次汇总日志");
      void loadLogs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "补跑失败");
    } finally {
      setRerunning(false);
    }
  };

  return (
    <AdminRightDrawer
      open={open}
      onOpenChange={onOpenChange}
      wide
      title="入库执行日志"
      description="按自然日×通道分段入库；同任务+通道+覆盖日重复执行会覆盖原日志（防重复）。批次汇总行含逐日确认表。"
      footer={
        <div className="flex flex-col gap-2 w-full">
          <AdminButton tone="secondary" className="w-full" disabled={rerunning} onClick={() => void handleRerun()}>
            <Play className="h-4 w-4" />
            {rerunning ? "按日补跑中…" : "对当前筛选按日补跑（首通道）"}
          </AdminButton>
        </div>
      }
    >
      <div className="space-y-3 text-xs">
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-0.5">
            任务
            <select
              className="h-8 rounded border px-2 bg-white"
              value={filterTaskId}
              onChange={(e) => setFilterTaskId(Number(e.target.value))}
            >
              <option value={0}>全部</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            方案
            <select
              className="h-8 rounded border px-2 bg-white"
              value={profileId}
              onChange={(e) => setProfileId(Number(e.target.value))}
            >
              <option value={0}>全部</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="self-end h-8 rounded border px-3" onClick={() => void loadLogs()}>
            刷新
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="min-h-[200px]">
            {loading ? (
              <p className="text-slate-400 py-8 text-center">加载中…</p>
            ) : logs.length === 0 ? (
              <p className="text-slate-400 py-8 text-center">暂无执行日志</p>
            ) : (
              <ul className="space-y-1 max-h-[50vh] overflow-auto">
                {logs.map((log) => (
                  <li key={log.id}>
                    <button
                      type="button"
                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                        detailId === log.id
                          ? "border-violet-400 bg-violet-50"
                          : selectedLogId === log.id
                            ? "border-emerald-400 bg-emerald-50"
                            : "border-slate-200 bg-white hover:border-violet-200"
                      }`}
                      onClick={() => setDetailId(log.id ?? null)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">
                          {log.logType === "BATCH_SUMMARY" ? "批次汇总" : log.coverageDay ?? log.executionDate}
                        </span>
                        <span
                          className={`rounded px-1 text-[9px] ${
                            log.status === "SUCCESS"
                              ? "bg-emerald-100 text-emerald-800"
                              : log.status === "PARTIAL"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100"
                          }`}
                        >
                          {log.status}
                        </span>
                      </div>
                      {log.channelCode ? (
                        <div className="text-[10px] text-slate-500 truncate">{log.channelCode}</div>
                      ) : null}
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {log.ruleProfileName ? `方案「${log.ruleProfileName}」 · ` : ""}
                        纳入 {log.includedCount ?? 0}
                        {log.logType === "BATCH_SUMMARY" && log.ledgerEntryCount
                          ? ` · ${log.ledgerEntryCount} 段`
                          : ""}
                      </div>
                      {log.ruleSummary ? (
                        <div className="text-[10px] text-violet-700/90">{log.ruleSummary}</div>
                      ) : null}
                      {log.noteText ? <div className="text-[10px] text-slate-400 mt-0.5">{log.noteText}</div> : null}
                      <button
                        type="button"
                        className="mt-1 text-[10px] text-violet-700 underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectLogId(selectedLogId === log.id ? null : (log.id ?? null));
                          onOpenChange(false);
                        }}
                      >
                        用此日志筛选总库
                      </button>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 min-h-[200px]">
            <p className="text-[11px] font-semibold text-slate-800 mb-2">逐日确认明细</p>
            {detailLoading ? (
              <p className="text-slate-400">加载明细…</p>
            ) : !detail ? (
              <p className="text-slate-400">点击左侧一条日志查看规则与按日条数</p>
            ) : (
              <div className="space-y-2">
                {detail.ruleProfileName ? (
                  <p className="text-[10px]">
                    <strong>清洗方案：</strong>
                    {detail.ruleProfileName}
                    {detail.ruleSummary ? `（${detail.ruleSummary}）` : ""}
                  </p>
                ) : null}
                {detail.windowStart && detail.windowEnd ? (
                  <p className="text-[10px] text-slate-600">
                    时间窗：{String(detail.windowStart).slice(0, 19)} ~ {String(detail.windowEnd).slice(0, 19)}
                  </p>
                ) : null}
                <DailyLedgerTable rows={ledgerFromDetail} />
                {detail.logType === "BATCH_SUMMARY" ? (
                  <p className="text-[10px] text-amber-800/90">
                    上表为本次批次各自然日×通道纳入条数；缺日或重复覆盖请对照回溯范围与通道漏斗。
                  </p>
                ) : null}
                <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                  <p className="text-[10px] font-semibold text-slate-700">备注与状态</p>
                  <textarea
                    className="w-full rounded border px-2 py-1 text-[10px] bg-white"
                    rows={2}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="运维备注，如误跑、需重洗说明"
                  />
                  <select
                    className="h-8 w-full rounded border px-2 bg-white text-[10px]"
                    value={statusDraft}
                    onChange={(e) => setStatusDraft(e.target.value)}
                  >
                    <option value="SUCCESS">SUCCESS</option>
                    <option value="PARTIAL">PARTIAL</option>
                    <option value="FAILED">FAILED</option>
                    <option value="SKIPPED">SKIPPED</option>
                  </select>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] text-violet-900"
                      disabled={metaSaving}
                      onClick={() => void handleSaveMeta()}
                    >
                      {metaSaving ? "保存中…" : "保存备注/状态"}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-[10px] text-rose-800 hover:bg-rose-50"
                      disabled={deleting}
                      onClick={() => void handleDeleteLog()}
                    >
                      <Trash2 className="h-3 w-3" />
                      删除此日志
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminRightDrawer>
  );
}

/** 打开入库执行日志抽屉的入口按钮 */
export function AccessFusionExecutionLogTrigger({
  onClick,
  logCount,
}: {
  onClick: () => void;
  logCount?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 shrink-0 inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2.5 text-xs text-violet-900 hover:bg-violet-100"
    >
      <ClipboardList className="h-3.5 w-3.5" />
      入库执行日志
      {logCount != null && logCount > 0 ? (
        <span className="rounded-full bg-violet-600 px-1.5 text-[10px] text-white">{logCount}</span>
      ) : null}
    </button>
  );
}
