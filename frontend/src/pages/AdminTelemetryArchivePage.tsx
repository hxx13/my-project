import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Link, useLocation } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";
import { adminHttp } from "@/api/core/adminHttp";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import {
  fetchTelemetryArchivePurgeConfig,
  fetchTelemetryArchivePurgeProgress,
  fetchTelemetryArchiveStorageStats,
  purgeTelemetryArchiveNow,
  saveTelemetryArchivePurgeConfig,
  type TelemetryArchivePurgeConfig,
} from "@/api/domains/telemetryArchive.api";
import { Archive, Database, Trash2 } from "lucide-react";
import { motion } from "framer-motion";

type ArchiveRow = {
  id: number;
  sampleAt: string;
  variableName: string;
  numericValue: number | null;
  rawValue: string | null;
  metricKindCode: string | null;
  roomCanonical: string | null;
  bundleCode: string | null;
};

type ArchivePage = {
  total: number;
  page: number;
  size: number;
  items: ArchiveRow[];
};

type ApiResult<T> = { success?: boolean; message?: string; data?: T };

const defaultPurgeConfig = (): TelemetryArchivePurgeConfig => ({
  purgeEnabled: true,
  retentionDays: 14,
  batchDeleteSize: 5000,
  optimizeAfterPurge: true,
  archiveWriteEnabled: true,
  scheduleJobKey: "TELEMETRY_ARCHIVE_PURGE",
  scheduleJobName: "温湿度·WinCC归档自动清理",
});

export default function AdminTelemetryArchivePage() {
  const queryClient = useQueryClient();
  const [variableName, setVariableName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [purgeForm, setPurgeForm] = useState<TelemetryArchivePurgeConfig>(defaultPurgeConfig);

  const location = useLocation();
  const pageLabel = useMemo(() => adminChromeTitle(location.pathname), [location.pathname]);

  const statsQ = useQuery({
    queryKey: ["admin", "telemetry-archive", "stats"],
    queryFn: fetchTelemetryArchiveStorageStats,
    refetchInterval: 60_000,
  });

  const configQ = useQuery({
    queryKey: ["admin", "telemetry-archive", "purge-config"],
    queryFn: async () => {
      const cfg = await fetchTelemetryArchivePurgeConfig();
      setPurgeForm(cfg);
      return cfg;
    },
  });

  const queryKey = useMemo(
    () => ["admin", "telemetry-archive", page, variableName, from, to] as const,
    [page, variableName, from, to]
  );

  const listQ = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await adminHttp.get<ApiResult<ArchivePage>>("telemetry/archive/query", {
        params: {
          page,
          size: 50,
          ...(variableName.trim() ? { variableName: variableName.trim() } : {}),
          ...(from.trim() ? { from: from.trim() } : {}),
          ...(to.trim() ? { to: to.trim() } : {}),
        },
      });
      const body = res.data;
      if (!body?.success || body.data == null) {
        throw new Error(body?.message || "加载失败");
      }
      return body.data;
    },
  });

  const saveConfigM = useMutation({
    mutationFn: () => saveTelemetryArchivePurgeConfig(purgeForm),
    onSuccess: (data) => {
      setPurgeForm(data);
      toast.success("清理策略已保存");
      void queryClient.invalidateQueries({ queryKey: ["admin", "telemetry-archive"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const purgeProgressQ = useQuery({
    queryKey: ["admin", "telemetry-archive", "purge-progress"],
    queryFn: fetchTelemetryArchivePurgeProgress,
    refetchInterval: (q) => (q.state.data?.inProgress ? 2000 : false),
    refetchIntervalInBackground: true,
  });

  const wasPurgeRunning = useRef(false);
  useEffect(() => {
    const p = purgeProgressQ.data;
    if (p?.inProgress) {
      wasPurgeRunning.current = true;
      return;
    }
    if (wasPurgeRunning.current && p && !p.inProgress) {
      wasPurgeRunning.current = false;
      if (p.status === "COMPLETED") {
        toast.success(p.message || "清理已结束");
      } else if (p.status === "FAILED") {
        toast.error(p.error || p.message || "清理失败");
      }
      void queryClient.invalidateQueries({ queryKey: ["admin", "telemetry-archive", "stats"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "telemetry-archive", "purge-config"] });
    }
  }, [purgeProgressQ.data, queryClient]);

  const purgeNowM = useMutation({
    mutationFn: purgeTelemetryArchiveNow,
    onSuccess: (r) => {
      toast.success(r.message || (r.accepted ? "后台清理已启动" : "清理已在运行"));
      void queryClient.invalidateQueries({ queryKey: ["admin", "telemetry-archive", "purge-progress"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = statsQ.data;
  const purgeProgress = purgeProgressQ.data;
  const purgeRunning = purgeProgress?.inProgress === true;
  const showPurgeProgress = purgeProgress != null && purgeProgress.status !== "IDLE";

  return (
    <AdminPageShell>
      {/* Description */}
      <p className="max-w-3xl text-sm text-[var(--app-color-text-secondary)]">
        WinCC 刷新写入{" "}
        <code className="rounded bg-[var(--app-color-surface-elevated)] px-1">telemetry_value_archive</code>。
        表过大可能拖慢 MySQL；可配置保留天数并自动清理。执行时刻在{" "}
        <Link to={toAdminRoutePath("/admin/schedule")} className="text-[var(--twin-link-deep)] underline">
          定时任务管理
        </Link>{" "}
        中调整任务「温湿度·WinCC归档自动清理」。
      </p>

      {/* Stats + Purge config cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Database className="h-4 w-4 text-sky-600" />
            表占用（实时）
          </div>
          {statsQ.isPending ? (
            <p className="text-sm text-slate-500">统计加载中…</p>
          ) : statsQ.isError ? (
            <p className="text-sm text-rose-600">{(statsQ.error as Error).message}</p>
          ) : stats ? (
            <ul className="space-y-1 text-sm text-slate-700">
              <li>
                总行数（约）：
                <strong>{stats.totalRows.toLocaleString()}</strong>
                {stats.approximate ? " · information_schema 估算" : ""}
                {stats.tableSizeMb != null ? ` · 约 ${stats.tableSizeMb} MB` : ""}
              </li>
              <li>
                超过保留期（{stats.effectiveRetentionDays} 天）待删：
                <strong className="text-amber-700">
                  {" "}
                  {stats.rowsOlderThanRetention < 0
                    ? "未知（表过大，请点「立即清理」并查看进度条）"
                    : stats.rowsOlderThanRetention.toLocaleString()}
                </strong>{" "}
                行
              </li>
              <li className="font-mono text-xs text-slate-500">
                最早 {stats.oldestSampleAt ?? "—"} · 最新 {stats.newestSampleAt ?? "—"}
              </li>
            </ul>
          ) : null}
          <div className="mt-3">
            <AdminButton tone="secondary" size="sm" onClick={() => void statsQ.refetch()}>
              刷新统计
            </AdminButton>
          </div>
        </div>

        <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Trash2 className="h-4 w-4 text-amber-700" />
            自动清理策略
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <AdminSwitchScaled
                size="sm"
                checked={purgeForm.purgeEnabled}
                onChange={(checked) => setPurgeForm((f) => ({ ...f, purgeEnabled: checked }))}
              />
              启用清理
            </label>
            <label className="flex items-center gap-2 text-sm">
              <AdminSwitchScaled
                size="sm"
                checked={purgeForm.archiveWriteEnabled}
                onChange={(checked) => setPurgeForm((f) => ({ ...f, archiveWriteEnabled: checked }))}
              />
              继续写入归档
            </label>
            <label className="text-xs text-slate-600">
              保留天数
              <input
                type="number"
                min={1}
                max={365}
                value={purgeForm.retentionDays}
                onChange={(e) =>
                  setPurgeForm((f) => ({ ...f, retentionDays: Number(e.target.value) || 14 }))
                }
                className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-slate-600">
              每批删除行数（建议 2000～5000，过大易锁表）
              <input
                type="number"
                min={500}
                max={20000}
                step={500}
                value={purgeForm.batchDeleteSize}
                onChange={(e) =>
                  setPurgeForm((f) => ({ ...f, batchDeleteSize: Number(e.target.value) || 5000 }))
                }
                className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <AdminSwitchScaled
                size="sm"
                checked={purgeForm.optimizeAfterPurge}
                onChange={(checked) => setPurgeForm((f) => ({ ...f, optimizeAfterPurge: checked }))}
              />
              清理后执行 OPTIMIZE TABLE（释放磁盘，大表可能较慢）
            </label>
          </div>
          {purgeForm.lastPurgeAt ? (
            <p className="mt-2 font-mono text-xs text-slate-500">
              上次清理：{purgeForm.lastPurgeAt}，删除 {purgeForm.lastPurgeDeletedRows ?? 0} 行，耗时{" "}
              {purgeForm.lastPurgeDurationMs ?? 0} ms
            </p>
          ) : null}
          {showPurgeProgress ? (
            <motion.div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
              <motion.div className="mb-2 flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium text-slate-800">
                  {purgeRunning ? "清理进行中…" : purgeProgress?.status === "FAILED" ? "清理失败" : "清理结果"}
                </span>
                <span>{purgeProgress?.percentComplete ?? 0}%</span>
              </motion.div>
              <motion.div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                <motion.div
                  className={`h-full rounded-full transition-all duration-500 ${purgeProgress?.status === "FAILED" ? "bg-rose-500" : "bg-sky-600"}`}
                  style={{ width: `${Math.min(100, purgeProgress?.percentComplete ?? 0)}%` }}
                />
              </motion.div>
              <p className="mt-2 text-xs text-slate-700">{purgeProgress?.message ?? "—"}</p>
              <p className="mt-1 font-mono text-xs text-slate-500">
                本次已删 {purgeProgress?.deletedThisSession?.toLocaleString() ?? 0} 行 · 第{" "}
                {purgeProgress?.batchRounds ?? 0} 批 · 表内剩余约{" "}
                {purgeProgress?.remainingRowsApprox?.toLocaleString() ?? "—"} 行
              </p>
              {purgeProgress?.error ? (
                <p className="mt-1 text-xs text-rose-600">{purgeProgress.error}</p>
              ) : null}
            </motion.div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <AdminButton
              tone="primary"
              size="sm"
              loading={saveConfigM.isPending}
              onClick={() => saveConfigM.mutate()}
            >
              保存策略
            </AdminButton>
            <AdminButton
              tone="destructive"
              size="sm"
              loading={purgeNowM.isPending}
              disabled={!purgeForm.purgeEnabled || purgeRunning}
              onClick={() => {
                const pending =
                  stats?.rowsOlderThanRetention != null && stats.rowsOlderThanRetention >= 0
                    ? stats.rowsOlderThanRetention.toLocaleString()
                    : "大量";
                if (
                  !window.confirm(
                    `将在后台持续删除过期数据（保留 ${purgeForm.retentionDays} 天，每批 ${purgeForm.batchDeleteSize} 行），` +
                      `待删约 ${pending} 行。进度条会自动更新，无需反复点击。继续？`
                  )
                ) {
                  return;
                }
                purgeNowM.mutate();
              }}
            >
              立即清理
            </AdminButton>
          </div>
          {configQ.isError ? (
            <p className="mt-2 text-xs text-rose-600">{(configQ.error as Error).message}</p>
          ) : null}
        </div>
      </div>

      {/* Filter + Table scroll pattern */}
      <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
        <AdminFormCard className="shrink-0 mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
            <h2 className="text-base font-bold text-[var(--app-color-text-primary)] shrink-0">{pageLabel}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <AdminButton tone="secondary" size="sm" onClick={() => void listQ.refetch()}>
                刷新列表
              </AdminButton>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-600">
              变量名包含
              <input
                value={variableName}
                onChange={(e) => {
                  setVariableName(e.target.value);
                  setPage(1);
                }}
                className="mt-1 block w-56 rounded border border-slate-200 px-2 py-1.5 text-sm"
                placeholder="可选"
              />
            </label>
            <label className="text-xs text-slate-600">
              起始时间 (ISO)
              <input
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
                className="mt-1 block w-56 rounded border border-slate-200 px-2 py-1.5 font-mono text-xs"
                placeholder="可选"
              />
            </label>
            <label className="text-xs text-slate-600">
              结束时间 (ISO)
              <input
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
                className="mt-1 block w-56 rounded border border-slate-200 px-2 py-1.5 font-mono text-xs"
                placeholder="可选"
              />
            </label>
          </div>
        </AdminFormCard>

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div>
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="border-b-2 border-[var(--app-color-border-strong)]">
                  <tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold shadow-[var(--app-elevation-card)]">
                    <th className="p-3">时间</th>
                    <th className="p-3">变量名</th>
                    <th className="p-3">数值</th>
                    <th className="p-3">原始值</th>
                    <th className="p-3">房间</th>
                    <th className="p-3">分区</th>
                  </tr>
                </thead>
                <tbody>
                  {(listQ.data?.items ?? []).map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-700">{r.sampleAt}</td>
                      <td className="max-w-xs truncate px-3 py-2 font-mono text-xs text-slate-800">{r.variableName}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.numericValue ?? "—"}</td>
                      <td className="max-w-xs truncate px-3 py-2 font-mono text-xs text-slate-600">{r.rawValue ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">{r.roomCanonical ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">{r.bundleCode ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="shrink-0 pt-2 flex items-center justify-between text-sm">
            <span className="text-[var(--app-color-text-tertiary)]">
              第 {listQ.data?.page ?? page} /{" "}
              {Math.max(1, Math.ceil((listQ.data?.total ?? 0) / (listQ.data?.size ?? 50)))} 页
            </span>
            <div className="flex gap-2">
              <AdminButton tone="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                上一页
              </AdminButton>
              <AdminButton
                tone="secondary"
                size="sm"
                disabled={listQ.data != null && page * (listQ.data.size ?? 50) >= (listQ.data.total ?? 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </AdminButton>
            </div>
          </div>
        </div>
      </div>
    </AdminPageShell>
  );
}
