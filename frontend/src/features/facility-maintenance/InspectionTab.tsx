import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ClipboardCheck, Download, RefreshCw } from "lucide-react";
import {
  deleteDailyInspectionSheetApi,
  exportDailyInspectionSheetExcelApi,
  fetchDailyInspectionSheetSummaries,
  fetchFmSites,
  fetchFmTemplates,
  fetchOrCreateDailyInspectionSheet,
  getFmTemplate,
  patchDailyInspectionSheetApi,
  submitDailyInspectionSheetApi,
  type FmDailyInspectionSheetSummary,
  type FmTemplate,
} from "@/api/domains/facilityMaintenance.api";
import { SplitSidebarScrollLayout } from "@/components/layout/ScrollFillLayout";
import { appConfirm } from "@/lib/appDialog";
import { FmStatusTag } from "@/features/facility-maintenance/shared/FmStatusTag";
import {
  normalizeDailyInspectionSheet,
  normalizeSites,
  pickCi,
  resolveDailySheetTemplateItems,
  sheetRowId,
  todayStr,
} from "@/features/facility-maintenance/inspectionPayload";
import InspectionMatrix from "@/features/facility-maintenance/InspectionMatrix";
import { InspectionHistoryList } from "@/features/facility-maintenance/InspectionHistoryList";
import InspectionRecordsPanel from "@/features/facility-maintenance/InspectionRecordsPanel";
import { FmToolbar, type FmTabItem } from "@/features/facility-maintenance/shared/FmToolbar";

/** 历史巡查表分页大小（与后端 summaries 接口默认一致） */
const SHEET_PAGE_SIZE = 20;

/** 左栏视图：按日巡查表 / 单笔记录 */
type LeftView = "sheets" | "records";

const LEFT_VIEW_OPTIONS: { value: LeftView; label: string }[] = [
  { value: "sheets", label: "按日巡查表" },
  { value: "records", label: "单笔记录" },
];

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** 嵌套 template.items 为空时，用单模板 GET 补全列定义（避免网关截断/旧序列化导致无法填表） */
async function ensureSheetWithTemplateItems(data: Record<string, unknown> | null): Promise<Record<string, unknown> | null> {
  const base = normalizeDailyInspectionSheet(data);
  if (!base || !sheetRowId(base)) return base;
  const tid = String(pickCi(base, "templateId") ?? base.templateId ?? "").trim();
  if (!tid) return base;
  const items = resolveDailySheetTemplateItems(base);
  if (items.length > 0) return base;
  try {
    const full = await getFmTemplate(tid);
    const mergedTpl = {
      ...(typeof base.template === "object" && base.template ? (base.template as object) : {}),
      ...full,
      items: full.items ?? [],
    };
    return { ...base, template: mergedTpl };
  } catch {
    return base;
  }
}

/**
 * 巡查 tab：左栏历史按日巡查表 + 右栏当日矩阵。
 * 保存算法（600ms 防抖 / version 乐观锁 / 保存后只合并响应体 / 5s 轮询 / 出错重载）原样保留。
 */
type InspectionTabProps = {
  tabs: FmTabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
};

export default function InspectionTab({ tabs, activeTab, onTabChange }: InspectionTabProps) {
  const [sheetDate, setSheetDate] = useState(todayStr());
  const [pickTpl, setPickTpl] = useState("");
  const [templates, setTemplates] = useState<FmTemplate[]>([]);
  const [leftView, setLeftView] = useState<LeftView>("sheets");
  /** 单笔记录面板用的启用中机房清单（与 sheet 解耦，未开表时也可用）。
   *  与页面壳共用同一 queryKey，命中缓存、不额外发请求。 */
  const sitesQuery = useQuery({ queryKey: ["fmSites"] as const, queryFn: () => fetchFmSites(true) });
  const fmSites = useMemo(
    () =>
      (sitesQuery.data ?? [])
        .filter((s) => Number(s.disabled) !== 1)
        .map((s) => ({ id: s.id, name: s.name })),
    [sitesQuery.data]
  );
  const [sheet, setSheet] = useState<Record<string, unknown> | null>(null);
  const sheetRef = useRef<Record<string, unknown> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingCells = useRef<Record<string, string>>({});

  const [sumRows, setSumRows] = useState<FmDailyInspectionSheetSummary[]>([]);
  const [sumTotal, setSumTotal] = useState(0);
  const [sumPage, setSumPage] = useState(1);
  const [sumLoading, setSumLoading] = useState(false);

  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

  const loadTemplates = useCallback(async () => {
    try {
      setTemplates((await fetchFmTemplates(undefined)) || []);
    } catch {
      setTemplates([]);
    }
  }, []);

  const loadSummaries = useCallback(async (page: number) => {
    setSumLoading(true);
    try {
      const d = await fetchDailyInspectionSheetSummaries(page, SHEET_PAGE_SIZE);
      setSumRows((d?.rows as FmDailyInspectionSheetSummary[]) || []);
      setSumTotal(Number(d?.total ?? 0));
      setSumPage(Number(d?.page ?? page));
    } catch {
      setSumRows([]);
      setSumTotal(0);
    } finally {
      setSumLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
    void loadSummaries(1);
  }, [loadTemplates, loadSummaries]);

  const applySheetDto = useCallback(async (data: Record<string, unknown> | null) => {
    const enriched = await ensureSheetWithTemplateItems(data);
    setSheet(enriched);
    const tid = enriched ? String(pickCi(enriched, "templateId") ?? enriched.templateId ?? "").trim() : "";
    if (tid) setPickTpl(tid);
  }, []);

  const loadSheet = useCallback(
    async (date: string, templateId?: string) => {
      try {
        const data = await fetchOrCreateDailyInspectionSheet(date, templateId);
        await applySheetDto((data || null) as Record<string, unknown> | null);
      } catch (e) {
        toast.error((e as Error).message || "加载巡查表失败");
        // 保留已有 sheet，避免换模板等业务报错时整页被清空 — post-save-no-full-refresh.mdc 思路
      }
    },
    [applySheetDto]
  );

  useEffect(() => {
    if (!sheetRowId(sheet)) return;
    const iv = setInterval(() => {
      void loadSheet(sheetDate);
    }, 5000);
    return () => clearInterval(iv);
  }, [sheet, sheetDate, loadSheet]);

  const flushSave = useCallback(async () => {
    const pending = pendingCells.current;
    pendingCells.current = {};
    const keys = Object.keys(pending);
    if (keys.length === 0) return;
    const s = sheetRef.current;
    const sid = sheetRowId(s);
    if (!sid) return;
    const cells: Record<string, string> = {};
    for (const k of keys) cells[k] = pending[k];
    try {
      const ver = Number(pickCi(s!, "version") ?? s!.version ?? 0);
      const merged = await patchDailyInspectionSheetApi(sid, { cells, version: ver });
      await applySheetDto((merged || null) as Record<string, unknown> | null);
    } catch (e) {
      toast.error((e as Error).message || "保存失败");
      await loadSheet(sheetDate);
    }
  }, [applySheetDto, loadSheet, sheetDate]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushSave(), 600);
  }, [flushSave]);

  /** 矩阵单元格编辑：只把单格键值排进待保存队列，立即调度防抖保存；不触发 setState，靠轮询/保存回包更新 sheet */
  const onCellChange = useCallback(
    (key: string, value: string) => {
      pendingCells.current[key] = value;
      scheduleSave();
    },
    [scheduleSave]
  );

  const openSheet = async () => {
    if (!pickTpl) {
      toast.error("请先选择巡查模板");
      return;
    }
    await loadSheet(sheetDate, pickTpl);
    toast.success("已打开当日巡查表");
  };

  const deleteTodaySheet = async () => {
    const sid = sheetRowId(sheet);
    if (!sid) {
      toast.error("当前没有已打开的巡查表");
      return;
    }
    if (
      !await appConfirm(
        "确定删除「当日巡查表」？删除后该业务日可重新选模板打开；若格子中已有内容将一并清除。（多人协作时请谨慎）"
      )
    ) {
      return;
    }
    try {
      await deleteDailyInspectionSheetApi(sid);
      toast.success("已删除，可重新选模板后打开");
      setSheet(null);
      void loadSummaries(sumPage);
    } catch (e) {
      toast.error((e as Error).message || "删除失败");
    }
  };

  const openHistoryRow = async (row: FmDailyInspectionSheetSummary) => {
    const ds = (row.sheetDate || "").slice(0, 10);
    if (!ds) {
      toast.error("无效日期");
      return;
    }
    setSheetDate(ds);
    if (row.templateId) setPickTpl(String(row.templateId));
    await loadSheet(ds);
    toast.success(`已打开 ${ds} 的巡查表`);
    void loadSummaries(sumPage);
  };

  const onSubmitRegister = async () => {
    const sid = sheetRowId(sheet);
    if (!sid) return;
    try {
      await submitDailyInspectionSheetApi(sid);
      toast.success("已登记（仍可继续编辑）");
      await loadSheet(sheetDate);
      void loadSummaries(sumPage);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onExportThis = async () => {
    const sid = sheetRowId(sheet);
    if (!sid) return;
    try {
      const blob = await exportDailyInspectionSheetExcelApi(sid);
      downloadBlob(blob, `daily-inspection-${sheetDate}.xlsx`);
      toast.success("已导出");
    } catch (e) {
      toast.error((e as Error).message || "导出失败");
    }
  };

  const items = resolveDailySheetTemplateItems(sheet);
  const sites = normalizeSites(sheet?.sites);
  const status = String(pickCi(sheet ?? undefined, "status") ?? sheet?.status ?? "");
  const version = Number(pickCi(sheet ?? undefined, "version") ?? sheet?.version ?? 0);
  const hasSheet = Boolean(sheetRowId(sheet));
  /** 只读状态行的模板名（跟随当前选中的模板 id） */
  const pickTplName = templates.find((t) => t.id === pickTpl)?.name || "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 工具栏：页面 tab + 巡查表级操作（同一行，固定区） */}
      <FmToolbar tabs={tabs} activeTab={activeTab} onTabChange={onTabChange}>
        <div>
          <label className="block text-[10px] text-[var(--app-color-text-tertiary)]">巡查日期</label>
          <input
            type="date"
            className="mt-1 h-8 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--twin-canvas)] px-2 text-xs text-[var(--twin-ink)]"
            value={sheetDate}
            onChange={(e) => {
              setSheetDate(e.target.value);
              setSheet(null);
            }}
          />
        </div>
        <div className="min-w-[200px]">
          <label className="block text-[10px] text-[var(--app-color-text-tertiary)]">巡查模板（首次创建必填）</label>
          <select
            className="mt-1 h-8 w-full rounded-lg border border-[var(--app-color-border-default)] bg-[var(--twin-canvas)] px-2 text-xs text-[var(--twin-ink)]"
            value={pickTpl}
            onChange={(e) => setPickTpl(e.target.value)}
          >
            <option value=""></option>
            {(templates || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="rounded-lg bg-[var(--app-color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--app-color-accent)]/90"
          onClick={() => void openSheet()}
        >
          打开当日巡查表
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
          onClick={() => void loadSheet(sheetDate)}
        >
          <RefreshCw className="h-4 w-4" /> 刷新
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--app-color-feedback-danger)] px-3 py-1.5 text-xs text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-feedback-danger-soft)]"
          onClick={() => void deleteTodaySheet()}
        >
          删除当日巡查表
        </button>
        {hasSheet && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
            onClick={() => void onExportThis()}
          >
            <Download className="h-4 w-4" /> 导出本表 Excel
          </button>
        )}
        {hasSheet && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg bg-[var(--app-color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--app-color-accent)]/90"
            onClick={() => void onSubmitRegister()}
          >
            <ClipboardCheck className="h-4 w-4" /> 上传登记
          </button>
        )}
      </FmToolbar>

      <SplitSidebarScrollLayout
        className="min-h-0 flex-1"
        sidebarClassName="w-[360px] max-w-[45%] border-r border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft-2)]"
        contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
        sidebar={
          <div className="flex h-full min-h-0 flex-col gap-2 p-3">
            <div className="review-tabs shrink-0">
              {LEFT_VIEW_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={leftView === o.value}
                  className="review-tab"
                  data-active={leftView === o.value}
                  onClick={() => setLeftView(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {leftView === "sheets" ? (
                <InspectionHistoryList
                  rows={sumRows}
                  total={sumTotal}
                  page={sumPage}
                  size={SHEET_PAGE_SIZE}
                  loading={sumLoading}
                  selectedDate={sheetDate}
                  onPageChange={(p) => void loadSummaries(p)}
                  onSelect={(row) => void openHistoryRow(row)}
                  onRefresh={() => void loadSummaries(sumPage)}
                />
              ) : (
                <InspectionRecordsPanel sites={fmSites} templates={templates} />
              )}
            </div>
          </div>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
          {/* 只读状态行：日期 + 模板名 + 状态 + 版本（操作按钮已上移到工具栏） */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-xs text-[var(--twin-mute)]">
            <span>巡查日期 {sheetDate}</span>
            <span>{pickTplName ? `模板 ${pickTplName}` : "未选模板"}</span>
            {hasSheet && <FmStatusTag status={status} />}
            {hasSheet && <span>v{version}</span>}
            <span className="ml-auto">多人可同时填写，自动保存；约每 5 秒同步他人修改</span>
          </div>

          <InspectionMatrix
            sheet={sheet}
            onCellChange={onCellChange}
            templateItems={items}
            sites={sites}
          />

        </div>
      </SplitSidebarScrollLayout>
    </div>
  );
}
