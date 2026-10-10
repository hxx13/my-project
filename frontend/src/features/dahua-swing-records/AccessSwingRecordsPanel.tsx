import { useCallback, useEffect, useState, type ReactNode } from "react";

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

import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { appConfirm } from "@/lib/appDialog";
const toApiDateTime = (v: string) => (v ? `${v.replace("T", " ")}:00` : "");

const todayRange = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return { start: `${y}-${m}-${d}T00:00`, end: `${y}-${m}-${d}T23:59` };
};

const filterLabelClass = "flex flex-col gap-1 text-[11px] text-[var(--app-color-text-secondary)]";

const filterInputClass =
  "h-8 w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 text-xs text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:outline-none";

/** 筛选字段的统一「小标签在上、控件在下」外壳 */
function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={filterLabelClass}>
      {label}
      {children}
    </label>
  );
}

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
  const [filters, setFilters] = useState<SwingRecordFilters>(() => {
    const base = emptyFilters(today, initialTaskId, initialChannel);
    // 地址里能带进来的筛选条件 —— 智能助手「帮我看一下失败的那些并截图」靠它把条件说进 URL。
    // **只认这五个**（都是页面自己下拉里有的），不开放任意键：不然地址就成了一个注入面。
    // 时间不给就沿用页面默认的「今天」，所以「今天失败」这条只需要 openResult。
    const pick = (k: string) => searchParams.get(k) || "";
    const openResult = pick("openResult");
    const enterOrExit = pick("enterOrExit");
    const openType = pick("openType");
    const startTime = pick("startTime");
    const endTime = pick("endTime");
    return {
      ...base,
      ...(openResult ? { openResult } : {}),
      ...(enterOrExit ? { enterOrExit } : {}),
      ...(openType ? { openType } : {}),
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
    };
  });

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
      <AdminFormCard className="shrink-0 p-3">
        {/* 第一行：数据源 + 质量摘要 + 操作按钮 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-xs font-semibold text-[var(--app-color-text-secondary)]">数据源</span>
          <div className="inline-flex items-center gap-1 rounded-lg bg-[var(--twin-canvas-soft-2)] p-0.5">
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
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  recordSource === k
                    ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-sm"
                    : "text-[var(--twin-mute)] hover:text-[var(--twin-body)]"
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
          </div>
          {quality ? (
            <span className="text-xs text-[var(--app-color-text-tertiary)]">
              共 <strong className="text-[var(--app-color-text-primary)]">{quality.total}</strong> 条 · 缺进出{" "}
              <strong className="text-amber-700">{quality.missingEnterExit}</strong> 条
            </span>
          ) : null}
          <span className="flex-1" />
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton
              type="button"
              tone="primary"
              size="sm"
              onClick={() => {
                setPage(1);
                void load();
              }}
            >
              查询
            </AdminButton>
            <AdminButton
              type="button"
              tone="ghost"
              size="sm"
              onClick={() => {
                setFilters(emptyFilters(todayRange(), "", ""));
                setPage(1);
              }}
            >
              重置筛选
            </AdminButton>
            <AdminButton
              type="button"
              tone="secondary"
              size="sm"
              loading={enriching}
              onClick={() => void handleEnrich()}
            >
              补全字段
            </AdminButton>
            <AdminButton
              type="button"
              tone="destructive"
              size="sm"
              loading={recalculatingAudience}
              onClick={() => void handleRecalculateAudience()}
            >
              重算受众
            </AdminButton>
          </div>
        </div>

        {/* 第二行：筛选字段（等宽网格，12 个字段按屏宽 6/4/2 列铺满整行） */}
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <FilterField label="通道名称">
            <input
              className={filterInputClass}
              placeholder="模糊匹配名称或编码"
              value={filters.channelName}
              onChange={(e) => setFilters((p) => ({ ...p, channelName: e.target.value }))}
            />
          </FilterField>
          <FilterField label="工号">
            <input
              className={filterInputClass}
              value={filters.personCode}
              onChange={(e) => setFilters((p) => ({ ...p, personCode: e.target.value }))}
            />
          </FilterField>
          <FilterField label="姓名">
            <input
              className={filterInputClass}
              value={filters.personName}
              onChange={(e) => setFilters((p) => ({ ...p, personName: e.target.value }))}
            />
          </FilterField>
          <FilterField label="卡号">
            <input
              className={filterInputClass}
              value={filters.cardNumber}
              onChange={(e) => setFilters((p) => ({ ...p, cardNumber: e.target.value }))}
            />
          </FilterField>
          <FilterField label="部门">
            <input
              className={filterInputClass}
              placeholder="名称或部门ID"
              value={filters.departmentName}
              onChange={(e) => setFilters((p) => ({ ...p, departmentName: e.target.value }))}
            />
          </FilterField>
          <FilterField label="开门类型">
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
          </FilterField>
          <FilterField label="刷卡成功">
            <select
              className={filterInputClass}
              value={filters.openResult}
              onChange={(e) => setFilters((p) => ({ ...p, openResult: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="1">成功</option>
              <option value="0">失败</option>
            </select>
          </FilterField>
          <FilterField label="进出">
            <select
              className={filterInputClass}
              value={filters.enterOrExit}
              onChange={(e) => setFilters((p) => ({ ...p, enterOrExit: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="1">进入</option>
              <option value="2">离开</option>
            </select>
          </FilterField>
          <FilterField label="受众">
            <select
              className={filterInputClass}
              value={filters.audienceType}
              onChange={(e) => setFilters((p) => ({ ...p, audienceType: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="STUDENT">学生</option>
              <option value="STAFF">工作人员</option>
            </select>
          </FilterField>
          <FilterField label="映射">
            <select
              className={filterInputClass}
              value={filters.mappingHit}
              onChange={(e) => setFilters((p) => ({ ...p, mappingHit: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="1">已映射</option>
              <option value="0">未映射</option>
            </select>
          </FilterField>
          <FilterField label="开始时间">
            <input
              type="datetime-local"
              className={filterInputClass}
              value={filters.startTime}
              onChange={(e) => setFilters((p) => ({ ...p, startTime: e.target.value }))}
            />
          </FilterField>
          <FilterField label="结束时间">
            <input
              type="datetime-local"
              className={filterInputClass}
              value={filters.endTime}
              onChange={(e) => setFilters((p) => ({ ...p, endTime: e.target.value }))}
            />
          </FilterField>
        </div>
      </AdminFormCard>

      <div className="min-h-0 flex-1">
        <AccessSwingRecordTable rows={rows} loading={loading} />
      </div>

      <div className="flex shrink-0 items-center justify-between text-xs text-[var(--app-color-text-tertiary)]">
        <span>共 {total} 条</span>
        <div className="flex items-center gap-2">
          <AdminButton
            type="button"
            tone="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </AdminButton>
          <span>
            {page}/{totalPages}
          </span>
          <AdminButton
            type="button"
            tone="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
