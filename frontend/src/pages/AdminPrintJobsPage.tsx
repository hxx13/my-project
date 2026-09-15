import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import {
  cancelPrintJob,
  fetchPrintHistory,
  fetchPrintQueue,
  fetchPrintStations,
  retryPrintJob,
  type AdminPrintStation,
  type PrintJob,
  type PrintJobStatus,
} from "@/api/domains/print.api";
import { appConfirm } from "@/lib/appDialog";

import { printStatusOf } from "@/features/print-station/printStatus";

type Tab = "queue" | "history";

const HISTORY_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部状态" },
  { value: "PENDING,SENT", label: "未完成" },
  { value: "PRINTED", label: "已打印" },
  { value: "FAILED", label: "失败" },
  { value: "CANCELLED", label: "已撤回" },
];

const selectCls =
  "rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1.5 text-[13px] text-[var(--app-color-text-primary)]";

function fmtTime(v: string | null | undefined) {
  if (!v) return "—";
  return v.length > 19 ? v.slice(0, 19) : v;
}

export default function AdminPrintJobsPage() {
  const [tab, setTab] = useState<Tab>("queue");
  const [rows, setRows] = useState<PrintJob[]>([]);
  const [stations, setStations] = useState<AdminPrintStation[]>([]);
  const [stationFilter, setStationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stationName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stations) m.set(s.id, s.name);
    return m;
  }, [stations]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list =
        tab === "queue"
          ? await fetchPrintQueue(stationFilter || undefined)
          : await fetchPrintHistory(stationFilter || undefined, statusFilter || undefined);
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [tab, stationFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // 工位名单独拉一次：任务里只有 stationId，表格上摆个 id 没人看得懂
  useEffect(() => {
    void fetchPrintStations().then(setStations).catch(() => setStations([]));
  }, []);

  const onCancel = async (j: PrintJob) => {
    if (!(await appConfirm(`撤回「${j.fileName}」？撤回后不会再打。`))) return;
    try {
      await cancelPrintJob(j.id);
      toast.success("已撤回");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "撤回失败");
    }
  };

  const onRetry = async (j: PrintJob) => {
    try {
      await retryPrintJob(j.id);
      toast.success("已重新排队");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重推失败");
    }
  };

  return (
    <AdminPageShell>
      {/* 工具栏固定、表格区独立滚动 —— 整页不下滚（UI 规范 §高度链） */}
      <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[320px] flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="review-tabs shrink-0">
            <button type="button" className="review-tab" data-active={tab === "queue"} onClick={() => setTab("queue")}>
              队列
            </button>
            <button type="button" className="review-tab" data-active={tab === "history"} onClick={() => setTab("history")}>
              历史
            </button>
          </div>

          <select className={selectCls} value={stationFilter} onChange={(e) => setStationFilter(e.target.value)}>
            <option value="">全部工位</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {tab === "history" ? (
            <select className={selectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {HISTORY_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : null}

          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--app-color-border-default)] px-3 py-1.5 text-[13px] text-[var(--app-color-text-primary)]"
            onClick={() => void load()}
          >
            <RefreshCw className="size-3.5" />
            刷新
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <AdminTableShell
            loading={loading}
            error={error}
            onRetry={() => void load()}
            empty={rows.length === 0}
            emptyMessage={tab === "queue" ? "队列是空的" : "还没有打印记录"}
          >
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--app-color-surface-container)] text-xs text-[var(--app-color-text-secondary)]">
                <tr>
                  <th className="px-3 py-2">文件</th>
                  <th className="px-3 py-2">工位</th>
                  <th className="px-3 py-2">份数</th>
                  <th className="px-3 py-2">备注</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">{tab === "history" ? "完成时间" : "派发时间"}</th>
                  {tab === "queue" ? <th className="px-3 py-2 text-right">操作</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((j) => {
                  const meta = printStatusOf(j.status);
                  return (
                    <tr key={j.id} className="border-t border-[var(--app-color-border-default)]">
                      <td className="max-w-[18rem] px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          {j.priority > 0 ? (
                            <span className="shrink-0 rounded bg-[color-mix(in_srgb,var(--app-color-feedback-warning)_18%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-color-feedback-warning)]">
                              加急
                            </span>
                          ) : null}
                          <span className="truncate text-[var(--app-color-text-primary)]" title={j.fileName}>
                            {j.fileName}
                          </span>
                        </span>
                        {j.lastError ? (
                          <div className="mt-0.5 truncate text-[11px] text-[var(--app-color-feedback-error)]" title={j.lastError}>
                            {j.lastError}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-[var(--app-color-text-secondary)]">
                        {stationName.get(j.stationId) ?? j.stationId}
                      </td>
                      <td className="px-3 py-2 text-[var(--app-color-text-secondary)]">{j.copies}</td>
                      <td
                        className="max-w-[16rem] truncate px-3 py-2 text-[var(--app-color-text-secondary)]"
                        title={j.note ?? ""}
                      >
                        {j.note || <span className="text-[var(--app-color-text-tertiary)]">—</span>}
                      </td>
                      <td className="px-3 py-2" title={meta.hint}>
                        <span className="review-status" data-tone={meta.tone}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--app-color-text-tertiary)]">
                        {fmtTime(j.printedAt ?? j.sentAt ?? j.createdAt)}
                      </td>
                      {tab === "queue" ? (
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap justify-end gap-3">
                            {/* 撤回只对排队中的有效。已经派给工位的撤不回来 —— 活在那台机器上了 */}
                            {j.status === "PENDING" ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--app-color-feedback-error)]"
                                onClick={() => void onCancel(j)}
                              >
                                <XCircle className="size-3.5" />
                                撤回
                              </button>
                            ) : null}
                            {j.status === "FAILED" ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--app-color-text-primary)]"
                                onClick={() => void onRetry(j)}
                              >
                                <RotateCcw className="size-3.5" />
                                重新排队
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </AdminTableShell>
        </div>
      </div>
    </AdminPageShell>
  );
}
