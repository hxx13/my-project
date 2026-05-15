import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ClipboardCheck, Download, RefreshCw } from "lucide-react";
import {
  deleteDailyInspectionSheetApi,
  exportDailyInspectionSheetExcelApi,
  fetchDailyInspectionSheetSummaries,
  fetchFmTemplates,
  fetchOrCreateDailyInspectionSheet,
  getFmTemplate,
  patchDailyInspectionSheetApi,
  submitDailyInspectionSheetApi,
  type FmDailyInspectionSheetSummary,
  type FmTemplate,
  type FmTemplateItem,
} from "@/api/domains/facilityMaintenance.api";
import { formatDateTimeAsiaShanghai } from "@/lib/formatDateTimeAsiaShanghai";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function todayStr() {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** 兼容网关/旧后端：JSON 字段名大小写或 snake_case 与前端不一致 */
function pickCi(o: Record<string, unknown> | null | undefined, logical: string): unknown {
  if (!o) return undefined;
  const t = logical.toLowerCase();
  for (const [k, v] of Object.entries(o)) {
    if (k.toLowerCase() === t) return v;
  }
  return undefined;
}

function sheetRowId(sheet: Record<string, unknown> | null | undefined): string {
  if (!sheet) return "";
  const v = pickCi(sheet, "id") ?? sheet.id;
  return v == null ? "" : String(v);
}

function normalizeTemplateItemRow(it: unknown): FmTemplateItem | null {
  if (!it || typeof it !== "object") return null;
  const o = it as Record<string, unknown>;
  const id = String(pickCi(o, "id") ?? o.id ?? "");
  const label = String(pickCi(o, "label") ?? o.label ?? "").trim();
  const fieldType = String(
    pickCi(o, "fieldType") ?? o.fieldType ?? pickCi(o, "field_type") ?? o.field_type ?? "TEXT"
  )
    .trim()
    .toUpperCase() || "TEXT";
  const optionSetId = pickCi(o, "optionSetId") ?? o.optionSetId ?? pickCi(o, "option_set_id");
  const optionItemsRaw = pickCi(o, "optionItems") ?? o.optionItems ?? pickCi(o, "option_items");
  type OptionRow = NonNullable<FmTemplateItem["optionItems"]>[number];
  let optionItems: FmTemplateItem["optionItems"] = undefined;
  if (Array.isArray(optionItemsRaw)) {
    const out: OptionRow[] = [];
    for (const x of optionItemsRaw as unknown[]) {
      if (!x || typeof x !== "object") continue;
      const ox = x as Record<string, unknown>;
      const oidRaw = pickCi(ox, "id") ?? ox.id;
      const lab = String(pickCi(ox, "label") ?? ox.label ?? "").trim();
      if (!lab && oidRaw == null) continue;
      const row: OptionRow = { label: lab || String(oidRaw) };
      if (oidRaw != null) row.id = String(oidRaw);
      const so = pickCi(ox, "sortOrder") ?? ox.sortOrder;
      if (typeof so === "number" && !Number.isNaN(so)) row.sortOrder = so;
      else if (so != null && String(so).trim() !== "") {
        const n = Number(so);
        if (!Number.isNaN(n)) row.sortOrder = n;
      }
      out.push(row);
    }
    if (out.length > 0) optionItems = out;
  }
  if (!label && !id) return null;
  return {
    id: id || undefined,
    label: label || id || "项",
    fieldType,
    optionSetId: optionSetId == null ? undefined : String(optionSetId),
    optionItems,
  };
}

/** 兼容嵌套 template 被序列化为字符串、或 items 键名差异；逐项规范化字段名 */
function resolveDailySheetTemplateItems(sheet: Record<string, unknown> | null | undefined): FmTemplateItem[] {
  if (!sheet) return [];
  let tpl: unknown = pickCi(sheet, "template") ?? sheet.template;
  if (tpl == null) return [];
  if (typeof tpl === "string") {
    try {
      tpl = JSON.parse(tpl) as Record<string, unknown>;
    } catch {
      return [];
    }
  }
  if (typeof tpl !== "object" || tpl === null) return [];
  const o = tpl as Record<string, unknown>;
  const raw = pickCi(o, "items") ?? o.items ?? o.Items;
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map(normalizeTemplateItemRow).filter((x): x is FmTemplateItem => x != null);
}

function normalizeSites(raw: unknown): { id: string; name: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const o = s as Record<string, unknown>;
      const id = String(pickCi(o, "id") ?? o.id ?? "");
      const name = String(pickCi(o, "name") ?? o.name ?? id);
      if (!id) return null;
      return { id, name };
    })
    .filter((x): x is { id: string; name: string } => x != null);
}

function normalizeCells(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = v == null ? "" : String(v);
  }
  return out;
}

/** 将协作表 DTO 规范为稳定 camelCase，便于渲染与保存 */
function normalizeDailyInspectionSheet(raw: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const id = pickCi(raw, "id") ?? raw.id;
  const templateId = pickCi(raw, "templateId") ?? raw.template_id;
  const version = pickCi(raw, "version") ?? raw.version;
  const status = pickCi(raw, "status") ?? raw.status;
  const sheetDate = pickCi(raw, "sheetDate") ?? raw.sheet_date;
  const submittedAt = pickCi(raw, "submittedAt") ?? raw.submitted_at;
  const submittedByName = pickCi(raw, "submittedByName") ?? raw.submitted_by_name;
  let tpl: unknown = pickCi(raw, "template") ?? raw.template;
  if (typeof tpl === "string") {
    try {
      tpl = JSON.parse(tpl) as Record<string, unknown>;
    } catch {
      tpl = {};
    }
  }
  const templateObj =
    tpl && typeof tpl === "object" && tpl !== null ? ({ ...(tpl as Record<string, unknown>) } as Record<string, unknown>) : {};
  const itemsRaw = pickCi(templateObj, "items") ?? templateObj.items ?? templateObj.Items;
  const arr = Array.isArray(itemsRaw) ? itemsRaw : [];
  templateObj.items = arr.map(normalizeTemplateItemRow).filter((x): x is FmTemplateItem => x != null);
  const sites = normalizeSites(pickCi(raw, "sites") ?? raw.sites);
  const cells = normalizeCells(pickCi(raw, "cells") ?? raw.cells);
  return {
    ...raw,
    id: id == null ? undefined : id,
    templateId: templateId == null ? undefined : String(templateId),
    version: typeof version === "number" ? version : Number(version ?? 0),
    status: status == null ? "" : String(status),
    sheetDate: sheetDate == null ? undefined : String(sheetDate),
    submittedAt: submittedAt ?? null,
    submittedByName: submittedByName == null ? undefined : String(submittedByName),
    template: templateObj,
    sites,
    cells,
  };
}

/** 嵌套 template.items 为空时，用单模板 GET 补全列定义（避免网关截断/旧序列化导致无法填表） */
async function ensureSheetWithTemplateItems(data: Record<string, unknown> | null): Promise<Record<string, unknown> | null> {
  const base = normalizeDailyInspectionSheet(data);
  if (!base || !sheetRowId(base)) return base;
  const tid = String(pickCi(base, "templateId") ?? base.templateId ?? "").trim();
  if (!tid) return base;
  let items = resolveDailySheetTemplateItems(base);
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

export default function DailyInspectionPanel() {
  const [sheetDate, setSheetDate] = useState(todayStr());
  const [pickTpl, setPickTpl] = useState("");
  const [templates, setTemplates] = useState<FmTemplate[]>([]);
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
      const d = await fetchDailyInspectionSheetSummaries(page, 20);
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

  const onCellChange = (cellKey: string, value: string) => {
    pendingCells.current[cellKey] = value;
    scheduleSave();
  };

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
      !confirm(
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
  const cells = normalizeCells(sheet?.cells);
  const status = String(pickCi(sheet ?? undefined, "status") ?? sheet?.status ?? "");
  const version = Number(pickCi(sheet ?? undefined, "version") ?? sheet?.version ?? 0);
  const hasSheet = Boolean(sheetRowId(sheet));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">历史按日巡查表</h3>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            onClick={() => void loadSummaries(sumPage)}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${sumLoading ? "animate-spin" : ""}`} />
            刷新目录
          </button>
        </div>
        <p className="mb-2 text-xs text-slate-500">
          与小程序「历史巡查」同源；点击「打开」可切换到该日期并加载矩阵。若换模板后无表：当日格子全空时会自动换绑模板；否则请「删除当日巡查表」后重开。
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-2 py-2">业务日</th>
                <th className="px-2 py-2">模板</th>
                <th className="px-2 py-2">状态</th>
                <th className="px-2 py-2">版本</th>
                <th className="px-2 py-2">登记</th>
                <th className="px-2 py-2 whitespace-nowrap">登记时间</th>
                <th className="px-2 py-2 w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {(sumRows || []).map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-2 py-1.5 font-mono text-xs">{r.sheetDate}</td>
                  <td className="px-2 py-1.5">{r.templateName || r.templateId}</td>
                  <td className="px-2 py-1.5">{r.status === "SUBMITTED" ? "已登记" : "填写中"}</td>
                  <td className="px-2 py-1.5">v{r.version}</td>
                  <td className="px-2 py-1.5 text-xs text-slate-600 whitespace-normal break-words">
                    {r.submittedByName ? `${r.submittedByName}` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-slate-600 whitespace-normal break-words">
                    {formatDateTimeAsiaShanghai(r.submittedAt)}
                  </td>
                  <td className="px-2 py-1.5">
                    <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => void openHistoryRow(r)}>
                      打开
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            共 {sumTotal} 条 · 第 {sumPage} 页
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-40"
              disabled={sumPage <= 1 || sumLoading}
              onClick={() => void loadSummaries(sumPage - 1)}
            >
              上一页
            </button>
            <button
              type="button"
              className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-40"
              disabled={sumLoading || sumPage * 20 >= sumTotal}
              onClick={() => void loadSummaries(sumPage + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div>
          <label className="block text-xs text-slate-500">巡查日期</label>
          <input
            type="date"
            className="mt-1 rounded border border-slate-200 px-2 py-1.5 text-sm"
            value={sheetDate}
            onChange={(e) => {
              setSheetDate(e.target.value);
              setSheet(null);
            }}
          />
        </div>
        <div className="min-w-[200px]">
          <label className="block text-xs text-slate-500">巡查模板（首次创建必填）</label>
          <select
            className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
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
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          onClick={() => void openSheet()}
        >
          打开当日巡查表
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          onClick={() => void loadSheet(sheetDate)}
        >
          <RefreshCw className="h-4 w-4" /> 刷新
        </button>
        <button
          type="button"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 hover:bg-rose-100"
          onClick={() => void deleteTodaySheet()}
        >
          删除当日巡查表
        </button>
      </div>

      {hasSheet && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
            状态：{status === "SUBMITTED" ? "已登记" : "填写中"} · v{version}
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white"
            onClick={() => void onExportThis()}
          >
            <Download className="h-4 w-4" /> 导出本表 Excel
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white"
            onClick={() => void onSubmitRegister()}
          >
            <ClipboardCheck className="h-4 w-4" /> 上传登记
          </button>
          <span className="text-xs text-slate-500">多人可同时填写，自动保存；约每 5 秒同步他人修改</span>
        </div>
      )}

      {hasSheet && items.length > 0 && sites.length > 0 && (
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700">
                  机房
                </th>
                {items.map((it, hi) => (
                  <th key={String(it.id || `h-${hi}`)} className="min-w-[120px] px-2 py-2 text-left font-medium text-slate-700">
                    {it.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.id} className="border-b border-slate-100">
                  <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-2 font-medium text-slate-800">
                    {site.name}
                  </td>
                  {items.map((it, ci) => {
                    const iid = String(it.id || "");
                    const key = `${site.id}|${iid}`;
                    const val = cells[key] ?? "";
                    const ft = String(it.fieldType || "").toUpperCase();
                    const opts = it.optionItems ?? [];
                    if (ft === "SELECT" && opts.length > 0) {
                      return (
                        <td key={`${site.id}-${it.id || ci}`} className="px-1 py-1 align-top">
                          <select
                            className="w-full min-w-[100px] rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                            value={val}
                            onChange={(e) => onCellChange(key, e.target.value)}
                          >
                            <option value=""></option>
                            {opts.map((o) => (
                              <option key={String(o.id ?? o.label)} value={o.label}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    }
                    return (
                      <td key={`${site.id}-${it.id || ci}`} className="px-1 py-1 align-top">
                        <input
                          className="w-full min-w-[100px] rounded border border-slate-200 px-2 py-1.5 text-sm"
                          value={val}
                          onChange={(e) => onCellChange(key, e.target.value)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasSheet && items.length === 0 && (
        <p className="text-sm text-amber-700">
          当前模板无巡查项，请在设置中编辑模板；若模板已有项仍如此，请点「刷新」或检查接口返回的 template.items。
        </p>
      )}

      {hasSheet && items.length > 0 && sites.length === 0 && (
        <p className="text-sm text-amber-700">
          当前模板下没有可填写的机房行（可能全部停用，或模板未绑定启用机房）。请在「设置」中检查机房状态或模板的适用机房。
        </p>
      )}

      {!hasSheet && (
        <p className="text-sm text-slate-600">选择日期与模板后点击「打开当日巡查表」。若该日已有表，将直接加载协作内容。</p>
      )}
    </div>
  );
}
