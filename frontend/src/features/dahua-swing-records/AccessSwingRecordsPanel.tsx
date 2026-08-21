import { useCallback, useEffect, useState } from "react";

import toast from "react-hot-toast";

import {
  enrichSwingRecords,
  fetchSwingRecordQualitySummary,
  previewSwingForAudit,
  recalculateSwingRecordAudience,
  type AccessSwingRecordViewRow,
} from "@/api/domains/accessAudit.api";

import { OPEN_TYPE_OPTIONS } from "@/features/access-audit/AccessRecordFilterBar";

import { AccessSwingRecordTable } from "@/features/dahua-swing-records/AccessSwingRecordTable";

import {
  toAuditFilterQuery,
  type SwingRecordFilters,
} from "@/features/dahua-swing-records/swingRecordFilterState";

import { useSearchParams } from "react-router-dom";

import { appConfirm } from "@/lib/appDialog";
const toApiDateTime = (v: string) => (v ? `${v.replace("T", " ")}:00` : "");

const todayRange = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return { start: `${y}-${m}-${d}T00:00`, end: `${y}-${m}-${d}T23:59` };
};

const filterLabelClass = "flex flex-col gap-1 text-[11px] text-slate-600";

const filterInputClass = "h-8 rounded border border-slate-200 px-2 text-xs bg-white";

function emptyFilters(today: { start: string; end: string }, taskId: string, channelName: string): SwingRecordFilters {
  return {
    taskId,
    channelName,
    personCode: "",
    personName: "",
    cardNumber: "",
    departmentName: "",
    openType: "",
    enterOrExit: "",
    openResult: "",
    audienceType: "",
    mappingHit: "",
    requireMapping: false,
    openSuccessOnly: false,
    startTime: today.start,
    endTime: today.end,
  };
}

export function AccessSwingRecordsPanel() {
  const today = todayRange();
  const [searchParams] = useSearchParams();
  const initialTaskId = searchParams.get("taskId") || "";
  const initialChannel = searchParams.get("channelCode") || searchParams.get("channelName") || "";

  const [rows, setRows] = useState<AccessSwingRecordViewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [recalculatingAudience, setRecalculatingAudience] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 100;
  const [quality, setQuality] = useState<{ total: number; missingEnterExit: number } | null>(null);
  const [recordSource, setRecordSource] = useState<"" | "REALTIME" | "STATS">("");
  const [filters, setFilters] = useState<SwingRecordFilters>(() =>
    emptyFilters(today, initialTaskId, initialChannel)
  );

  const queryParams = useCallback(
    () => toAuditFilterQuery(filters, toApiDateTime),
    [filters]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await previewSwingForAudit({ ...queryParams(), page, pageSize });
      let data = res.data || [];
      if (recordSource) {
        data = data.filter((r) => r.pullTaskType === recordSource);
      }
      setRows(data);
      setTotal(res.total || 0);
      const q = await fetchSwingRecordQualitySummary(queryParams());
      setQuality(q);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [queryParams, page, recordSource]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRecalculateAudience = async () => {
    if (
      !await appConfirm(
        "将按当前筛选重算受众：部门 ID 或大华部门映射名称含「学生」→ 学生，其余 → 工作人员。已写入清洗总库的数据需清空后重新入库。是否继续？"
      )
    ) {
      return;
    }
    setRecalculatingAudience(true);
    try {
      const res = await recalculateSwingRecordAudience(queryParams());
      toast.success(
        `已扫描 ${res.scanned} 条，更新 ${res.updated} 条（学生 ${res.studentCount} / 工作人员 ${res.staffCount}）${
          res.truncated ? "；已达单次上限，请再次执行以覆盖剩余记录" : ""
        }`
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重算受众失败");
    } finally {
      setRecalculatingAudience(false);
    }
  };

  const handleEnrich = async () => {
    setEnriching(true);
    try {
      const res = await enrichSwingRecords(queryParams());
      toast.success(`已扫描 ${res.scanned} 条，更新 ${res.updated} 条${res.truncated ? "（已达单次上限，可再次执行）" : ""}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "补全失败");
    } finally {
      setEnriching(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        {/* 第一行：数据源 + 质量摘要 + 操作按钮 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-xs font-semibold text-slate-600">数据源</span>
          {(
            [
              ["", "全部"],
              ["REALTIME", "实时"],
              ["STATS", "审计"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k || "all"}
              type="button"
              className={`rounded-full px-2.5 py-0.5 text-xs border ${
                recordSource === k ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200"
              }`}
              onClick={() => {
                setRecordSource(k);
                setPage(1);
                setFilters((p) => ({ ...p, taskId: "" }));
              }}
            >
              {label}
            </button>
          ))}
          {quality ? (
            <span className="text-xs text-slate-500">
              共 <strong className="text-slate-700">{quality.total}</strong> 条 · 缺进出{" "}
              <strong className="text-amber-700">{quality.missingEnterExit}</strong> 条
            </span>
          ) : null}
          <span className="flex-1" />
          <button
            type="button"
            className="h-8 rounded bg-slate-900 px-3 text-xs text-white"
            onClick={() => {
              setPage(1);
              void load();
            }}
          >
            查询
          </button>
          <button
            type="button"
            className="h-8 rounded border border-slate-200 px-3 text-xs text-slate-600"
            onClick={() => {
              setFilters(emptyFilters(todayRange(), "", ""));
              setPage(1);
            }}
          >
            重置筛选
          </button>
          <button
            type="button"
            className="h-8 rounded border border-indigo-200 px-3 text-xs text-indigo-700 disabled:opacity-50"
            disabled={enriching}
            onClick={() => void handleEnrich()}
          >
            {enriching ? "补全中…" : "补全字段"}
          </button>
          <button
            type="button"
            className="h-8 rounded border border-violet-300 bg-violet-50 px-3 text-xs text-violet-900 disabled:opacity-50"
            disabled={recalculatingAudience}
            onClick={() => void handleRecalculateAudience()}
          >
            {recalculatingAudience ? "重算中…" : "重算受众"}
          </button>
        </div>

        {/* 第二行：筛选字段 */}
        <div className="flex flex-wrap items-end gap-x-2 gap-y-2 border-t border-slate-100 pt-2">
          <label className={`${filterLabelClass} min-w-[180px] flex-1`}>
            通道名称
            <input
              className={filterInputClass}
              placeholder="模糊匹配名称或编码"
              value={filters.channelName}
              onChange={(e) => setFilters((p) => ({ ...p, channelName: e.target.value }))}
            />
          </label>
          <label className={`${filterLabelClass} min-w-[80px]`}>
            工号
            <input
              className={filterInputClass}
              value={filters.personCode}
              onChange={(e) => setFilters((p) => ({ ...p, personCode: e.target.value }))}
            />
          </label>
          <label className={`${filterLabelClass} min-w-[140px] flex-1`}>
            姓名
            <input
              className={filterInputClass}
              value={filters.personName}
              onChange={(e) => setFilters((p) => ({ ...p, personName: e.target.value }))}
            />
          </label>
          <label className={`${filterLabelClass} min-w-[80px]`}>
            卡号
            <input
              className={filterInputClass}
              value={filters.cardNumber}
              onChange={(e) => setFilters((p) => ({ ...p, cardNumber: e.target.value }))}
            />
          </label>
          <label className={`${filterLabelClass} min-w-[90px]`}>
            部门
            <input
              className={filterInputClass}
              placeholder="名称或部门ID"
              value={filters.departmentName}
              onChange={(e) => setFilters((p) => ({ ...p, departmentName: e.target.value }))}
            />
          </label>
          <label className={filterLabelClass}>
            开门类型
            <select
              className={filterInputClass}
              value={filters.openType}
              onChange={(e) => setFilters((p) => ({ ...p, openType: e.target.value }))}
            >
              <option value="">全部</option>
              {OPEN_TYPE_OPTIONS.map((o) => (
                <option key={o.code} value={String(o.code)}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className={filterLabelClass}>
            刷卡成功
            <select
              className={filterInputClass}
              value={filters.openResult}
              onChange={(e) => setFilters((p) => ({ ...p, openResult: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="1">成功</option>
              <option value="0">失败</option>
            </select>
          </label>
          <label className={filterLabelClass}>
            进出
            <select
              className={filterInputClass}
              value={filters.enterOrExit}
              onChange={(e) => setFilters((p) => ({ ...p, enterOrExit: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="1">进入</option>
              <option value="2">离开</option>
            </select>
          </label>
          <label className={filterLabelClass}>
            受众
            <select
              className={filterInputClass}
              value={filters.audienceType}
              onChange={(e) => setFilters((p) => ({ ...p, audienceType: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="STUDENT">学生</option>
              <option value="STAFF">工作人员</option>
            </select>
          </label>
          <label className={filterLabelClass}>
            映射
            <select
              className={filterInputClass}
              value={filters.mappingHit}
              onChange={(e) => setFilters((p) => ({ ...p, mappingHit: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="1">已映射</option>
              <option value="0">未映射</option>
            </select>
          </label>
          <label className={`${filterLabelClass} min-w-[150px]`}>
            开始时间
            <input
              type="datetime-local"
              className={filterInputClass}
              value={filters.startTime}
              onChange={(e) => setFilters((p) => ({ ...p, startTime: e.target.value }))}
            />
          </label>
          <label className={`${filterLabelClass} min-w-[150px]`}>
            结束时间
            <input
              type="datetime-local"
              className={filterInputClass}
              value={filters.endTime}
              onChange={(e) => setFilters((p) => ({ ...p, endTime: e.target.value }))}
            />
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <AccessSwingRecordTable rows={rows} loading={loading} />
      </div>

      <div className="flex shrink-0 items-center justify-between text-xs text-slate-500">
        <span>共 {total} 条</span>
        <div className="flex gap-2">
          <button type="button" className="underline disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <span>
            {page}/{totalPages}
          </span>
          <button
            type="button"
            className="underline disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
