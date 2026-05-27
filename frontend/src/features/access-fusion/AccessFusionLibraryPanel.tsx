import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  queryAccessCleanLibrary,
  patchAccessCleanLibraryItem,
  getGlobalCleanLibrarySummary,
  type AccessCleanPackageItemRow,
} from "@/api/domains/accessFusion.api";

const toApiDt = (v: string) => (v ? `${v.replace("T", " ")}:00` : "");

type Props = {
  statsPullTaskId?: number;
  channelCodes: string[];
  startTime: string;
  endTime: string;
  libraryActionType: "" | "1" | "2";
  libraryDisposition: string;
  libraryAudience: string;
  libraryPersonName: string;
  selectedLogId: number | null;
  onClearLogFilter: () => void;
};

export function AccessFusionLibraryPanel({
  statsPullTaskId,
  channelCodes,
  startTime,
  endTime,
  libraryActionType,
  libraryDisposition,
  libraryAudience,
  libraryPersonName,
  selectedLogId,
  onClearLogFilter,
}: Props) {
  const [items, setItems] = useState<AccessCleanPackageItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const pageSize = 50;

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getGlobalCleanLibrarySummary());
    } catch {
      setSummary(null);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await queryAccessCleanLibrary({
        statsPullTaskId: statsPullTaskId && statsPullTaskId > 0 ? statsPullTaskId : undefined,
        channelCodes: channelCodes.length ? channelCodes : undefined,
        startTime: toApiDt(startTime),
        endTime: toApiDt(endTime),
        disposition: libraryDisposition || undefined,
        audienceType: libraryAudience || undefined,
        actionType: libraryActionType ? Number(libraryActionType) : undefined,
        personName: libraryPersonName.trim() || undefined,
        lastRunId: selectedLogId ?? undefined,
        page,
        pageSize,
      });
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载总库失败");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    statsPullTaskId,
    channelCodes,
    startTime,
    endTime,
    libraryDisposition,
    libraryAudience,
    libraryActionType,
    libraryPersonName,
    selectedLogId,
    page,
    pageSize,
  ]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    setPage(1);
  }, [
    statsPullTaskId,
    channelCodes,
    startTime,
    endTime,
    libraryDisposition,
    libraryAudience,
    libraryActionType,
    libraryPersonName,
    selectedLogId,
  ]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const saveRow = async (row: AccessCleanPackageItemRow) => {
    if (!row.id) return;
    try {
      const updated = await patchAccessCleanLibraryItem(row.id, {
        disposition: row.disposition,
        directionOverride: row.directionOverride,
        audienceType: row.audienceType,
      });
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      setItems((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      toast.success("已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  return (
    <div className="space-y-3">
      {summary ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          清洗总库：纳入 <strong>{String(summary.includedCount ?? 0)}</strong> 条 · 已配置通道{" "}
          <strong>{String(summary.channelCount ?? 0)}</strong> 个
          {statsPullTaskId ? (
            <>
              {" "}
              · 按统计任务 #{statsPullTaskId} 隔离查看
              {channelCodes.length > 0 ? (
                <>
                  {" "}
                  · <strong>{channelCodes.length}</strong> 个通道
                </>
              ) : null}
            </>
          ) : channelCodes.length > 0 ? (
            <>
              {" "}
              · 当前筛选 <strong>{channelCodes.length}</strong> 个通道（未选任务，全库浏览）
            </>
          ) : (
            " · 请选择统计任务以按任务维度查看（全库按通道合并存储）"
          )}
        </p>
      ) : null}

      {selectedLogId ? (
        <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 flex flex-wrap items-center gap-2">
          正在按执行日志 #{selectedLogId} 筛选总库行
          <button type="button" className="underline font-medium" onClick={onClearLogFilter}>
            清除
          </button>
        </p>
      ) : null}

      <div className="overflow-auto rounded-xl border bg-white shadow-sm">
        {loading ? (
          <p className="p-4 text-sm text-neutral-500">加载中…</p>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">
            {statsPullTaskId
              ? "暂无记录。请先在「定时审计拉取」执行拉取或手动清洗入库，并确认已配置通道漏斗。"
              : "请选择统计任务后查询；总库按通道合并，多任务同通道时需按任务筛选。"}
          </p>
        ) : (
          <table className="w-full min-w-[800px] text-left text-xs">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-2 py-2">时间</th>
                <th className="px-2 py-2">通道</th>
                <th className="px-2 py-2">人员</th>
                <th className="px-2 py-2">进出</th>
                <th className="px-2 py-2">纳入</th>
                <th className="px-2 py-2">受众</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <LibraryRow
                  key={row.id}
                  row={row}
                  onSave={() => void saveRow(row)}
                  onChange={(patch) =>
                    setItems((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)))
                  }
                />
              ))}
            </tbody>
          </table>
        )}
        <p className="border-t px-3 py-2 text-xs text-neutral-500">
          共 {total} 条 · 第 {page} 页
          <button
            type="button"
            className="ml-2 text-violet-600"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <button
            type="button"
            className="ml-1 text-violet-600"
            disabled={page * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </p>
      </div>
    </div>
  );
}

function LibraryRow({
  row,
  onChange,
  onSave,
}: {
  row: AccessCleanPackageItemRow;
  onChange: (patch: Partial<AccessCleanPackageItemRow>) => void;
  onSave: () => void;
}) {
  const dir = row.directionOverride || row.direction || "";
  return (
    <tr className="border-t border-neutral-100">
      <td className="px-2 py-1 whitespace-nowrap">{String(row.swingTime ?? "").slice(0, 19)}</td>
      <td className="px-2 py-1">{row.channelName ?? row.channelCode}</td>
      <td className="px-2 py-1">{row.personName}</td>
      <td className="px-2 py-1">
        <select
          className="rounded border px-1 py-0.5"
          value={dir}
          onChange={(e) => onChange({ directionOverride: e.target.value })}
        >
          <option value="ENTER">进入</option>
          <option value="EXIT">离开</option>
        </select>
      </td>
      <td className="px-2 py-1">
        <select
          className="rounded border px-1 py-0.5"
          value={row.disposition ?? "INCLUDED"}
          onChange={(e) => onChange({ disposition: e.target.value })}
        >
          <option value="INCLUDED">纳入</option>
          <option value="EXCLUDED">排除</option>
        </select>
      </td>
      <td className="px-2 py-1">
        <select
          className="rounded border px-1 py-0.5"
          value={row.audienceType ?? ""}
          onChange={(e) => onChange({ audienceType: e.target.value })}
        >
          <option value="STUDENT">学生</option>
          <option value="STAFF">工作人员</option>
        </select>
      </td>
      <td className="px-2 py-1">
        <button type="button" className="text-violet-600 font-medium" onClick={onSave}>
          保存
        </button>
      </td>
    </tr>
  );
}
