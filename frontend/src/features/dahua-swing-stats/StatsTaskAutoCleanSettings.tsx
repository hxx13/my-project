import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  getAccessCleanTaskSettings,
  listAccessExecutionLogs,
  saveAccessCleanTaskSettings,
  type AccessCleanExecutionLog,
} from "@/api/domains/accessFusion.api";

type Props = {
  statsTaskId: number;
  compact?: boolean;
  onSaved?: () => void;
};

export function StatsTaskAutoCleanSettings({ statsTaskId, compact, onSaved }: Props) {
  const [autoClean, setAutoClean] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastLog, setLastLog] = useState<AccessCleanExecutionLog | null>(null);

  const load = useCallback(async () => {
    if (!statsTaskId) return;
    setLoading(true);
    try {
      const settings = await getAccessCleanTaskSettings(statsTaskId);
      setAutoClean(settings.autoCleanPackage !== 0);
      const logs = await listAccessExecutionLogs({
        statsPullTaskId: statsTaskId,
        page: 1,
        pageSize: 1,
      });
      setLastLog(logs.items?.[0] ?? null);
    } catch {
      setLastLog(null);
    } finally {
      setLoading(false);
    }
  }, [statsTaskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (next: boolean) => {
    if (!statsTaskId) return;
    setSaving(true);
    try {
      const cur = await getAccessCleanTaskSettings(statsTaskId);
      await saveAccessCleanTaskSettings(
        statsTaskId,
        cur.debounceSeconds ?? 45,
        next ? 1 : 0,
        cur.swingDirectionFilter
      );
      setAutoClean(next);
      // 保存后仅更新本地开关，禁止整表 load — post-save-no-full-refresh.mdc
      onSaved?.();
      toast.success(next ? "已开启拉取后自动清洗入库" : "已关闭拉取后自动清洗入库");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (compact) {
    return (
      <label
        className="inline-flex items-center gap-1 text-[10px] text-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={autoClean}
          disabled={loading || saving || !statsTaskId}
          onChange={(e) => void toggle(e.target.checked)}
        />
        拉取后自动清洗
      </label>
    );
  }

  return (
    <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-3 space-y-2">
      <div className="text-[11px] font-semibold text-violet-900">清洗入库控制</div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={autoClean}
          disabled={loading || saving || !statsTaskId}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span>拉取成功后自动清洗并写入总库（任务级开关，与清洗规则方案无关）</span>
      </label>
      {lastLog ? (
        <p className="text-[10px] text-slate-600">
          最近清洗：{String(lastLog.createdAt ?? "").slice(0, 19)} · 纳入{" "}
          <strong>{lastLog.includedCount ?? 0}</strong> 条
          {lastLog.status === "FAILED" ? (
            <span className="text-rose-600"> · 失败</span>
          ) : null}
        </p>
      ) : (
        <p className="text-[10px] text-slate-500">暂无清洗执行记录</p>
      )}
    </div>
  );
}

/** 列表行展示最近清洗摘要 */
export function StatsTaskLastCleanHint({ statsTaskId }: { statsTaskId: number }) {
  const [hint, setHint] = useState<string>("—");

  useEffect(() => {
    if (!statsTaskId) return;
    void (async () => {
      try {
        const logs = await listAccessExecutionLogs({
          statsPullTaskId: statsTaskId,
          page: 1,
          pageSize: 1,
        });
        const log = logs.items?.[0];
        if (!log) {
          setHint("未清洗");
          return;
        }
        setHint(
          `${String(log.createdAt ?? "").slice(0, 10)} 纳入${log.includedCount ?? 0}${log.status === "FAILED" ? " 失败" : ""}`
        );
      } catch {
        setHint("—");
      }
    })();
  }, [statsTaskId]);

  return <span className="text-[10px] text-slate-500">{hint}</span>;
}
