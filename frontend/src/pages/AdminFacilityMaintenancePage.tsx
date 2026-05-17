import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Activity, ArrowDown, ArrowUp, Download, Plus, RefreshCw, Settings, Trash2, Upload } from "lucide-react";
import DailyInspectionPanel from "@/components/facility-maintenance/DailyInspectionPanel";
import { AdminToolbar, AdminToolbarActions } from "@/components/admin/AdminToolbar";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { adminLabelClass } from "@/features/admin/adminFormUi";
import {
  createFmConsumableLine,
  createFmConsumableCatalog,
  createFmOptionSet,
  createFmReplacementFilterPreset,
  createFmReplacementRecord,
  createFmSite,
  createFmTemplate,
  deleteFmConsumableCatalog,
  deleteFmConsumableLine,
  deleteFmOptionSet,
  deleteFmReplacementFilterPreset,
  deleteFmReplacementRecord,
  deleteFmSitePermanent,
  deleteFmTemplate,
  exportFmExcel,
  fetchFmConsumableCatalog,
  fetchFmConsumableLines,
  fetchFmOptionSets,
  fetchFmReplacementFilterPresets,
  fetchFmReplacementRecords,
  fetchFmSites,
  fetchFmTemplates,
  importFmExcel,
  type FmExcelScope,
  patchFmConsumableCatalog,
  patchFmOptionSet,
  patchFmReplacementFilterPreset,
  patchFmSite,
  patchFmTemplate,
  type FmConsumableCatalog,
  type FmOptionSet,
  type FmReplacementFilterPreset,
  type FmSite,
  type FmTemplate,
} from "@/api/domains/facilityMaintenance.api";
import { formatDateTimeAsiaShanghai } from "@/lib/formatDateTimeAsiaShanghai";

type TabKey = "inspection" | "consumables" | "replacements";

type SettingsTabKey = "sites" | "options" | "templates" | "catalog" | "presets";

const LEDGER_TABS: { key: TabKey; label: string }[] = [
  { key: "inspection", label: "当日巡查表" },
  { key: "consumables", label: "耗材" },
  { key: "replacements", label: "更换" },
];

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** 当前浏览器本地时间 → `yyyy-MM-ddTHH:mm:ss`，与后端 `LocalDateTime` 墙上时间一致，避免 `toISOString()` 转 UTC 差 8 小时 */
function toLocalWallClockFromDate(d: Date): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

/** `<input type="datetime-local">` 的 `yyyy-MM-ddTHH:mm` → 后端可解析的本地时间串 */
function toDatetimeLocalString(d = new Date()): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

function datetimeLocalValueToBackendPayload(v: string): string {
  const t = v.trim();
  if (t.length === 16) return `${t}:00`;
  return t;
}

function rowPick(row: Record<string, unknown>, camel: string, snake: string): unknown {
  const v = row[camel];
  if (v != null) return v;
  return row[snake];
}

const FM_FIELD_TYPES = ["TEXT", "NUMBER", "BOOLEAN", "SELECT", "DATETIME"] as const;

type TplItemDraft = {
  label: string;
  fieldType: string;
  optionSetId: string;
  required: boolean;
};

function moveArr<T>(arr: T[], index: number, delta: -1 | 1): T[] {
  const next = index + delta;
  if (next < 0 || next >= arr.length) return arr;
  const copy = [...arr];
  const t = copy[index];
  copy[index] = copy[next];
  copy[next] = t;
  return copy;
}

function resolveFmTemplateSiteIds(t: FmTemplate): string[] {
  if (t.siteIds && t.siteIds.length > 0) return [...t.siteIds];
  if (t.siteId) return [t.siteId];
  return [];
}

function fmTemplateSiteColumnLabel(t: FmTemplate, sitesList: FmSite[]): string {
  const ids = resolveFmTemplateSiteIds(t);
  if (ids.length === 0) return "全局";
  return ids.map((id) => sitesList.find((x) => x.id === id)?.name || id).join("、");
}

export default function AdminFacilityMaintenancePage() {
  const [tab, setTab] = useState<TabKey>("inspection");
  const [loading, setLoading] = useState(false);
  const [sites, setSites] = useState<FmSite[]>([]);
  const [optionSets, setOptionSets] = useState<FmOptionSet[]>([]);
  const [templates, setTemplates] = useState<FmTemplate[]>([]);
  const [filterSiteId, setFilterSiteId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabKey>("sites");
  const [consumableCatalog, setConsumableCatalog] = useState<FmConsumableCatalog[]>([]);
  const [replacementPresets, setReplacementPresets] = useState<FmReplacementFilterPreset[]>([]);
  const replacementFilterDisplay = useCallback(
    (raw: unknown) => {
      const ft = raw == null ? "" : String(raw).trim();
      if (!ft) return "";
      const byId = replacementPresets.find((x) => x.id === ft);
      if (byId?.label) return byId.label;
      return ft;
    },
    [replacementPresets]
  );
  const [newCatalogName, setNewCatalogName] = useState("");
  const [newCatalogUnit, setNewCatalogUnit] = useState("件");
  const [newPresetLabel, setNewPresetLabel] = useState("");

  const [consPage, setConsPage] = useState(1);
  const [consData, setConsData] = useState<{ rows: Record<string, unknown>[]; total: number } | null>(null);
  const [repPage, setRepPage] = useState(1);
  const [repData, setRepData] = useState<{ rows: Record<string, unknown>[]; total: number } | null>(null);

  const loadSites = useCallback(async () => {
    const list = await fetchFmSites(true);
    setSites(list || []);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await loadSites();
      if (tab === "consumables") {
        setConsData(
          await fetchFmConsumableLines({
            siteId: filterSiteId || undefined,
            page: consPage,
            size: 20,
          })
        );
      }
      if (tab === "replacements") {
        setRepData(
          await fetchFmReplacementRecords({
            siteId: filterSiteId || undefined,
            page: repPage,
            size: 20,
          })
        );
      }
    } catch (e) {
      toast.error((e as Error).message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [tab, filterSiteId, consPage, repPage, loadSites]);

  const loadSettingsData = useCallback(async () => {
    try {
      await loadSites();
      setOptionSets((await fetchFmOptionSets()) || []);
      setTemplates((await fetchFmTemplates(undefined)) || []);
      setConsumableCatalog((await fetchFmConsumableCatalog(true)) || []);
      setReplacementPresets((await fetchFmReplacementFilterPresets(true)) || []);
    } catch {
      toast.error("加载设置数据失败");
    }
  }, [loadSites]);

  useEffect(() => {
    if (settingsOpen) void loadSettingsData();
  }, [settingsOpen, loadSettingsData]);

  useEffect(() => {
    if (tab === "consumables") {
      void (async () => {
        try {
          setConsumableCatalog((await fetchFmConsumableCatalog(false)) || []);
        } catch {
          /* ignore */
        }
      })();
    }
    if (tab === "replacements") {
      void (async () => {
        try {
          setReplacementPresets((await fetchFmReplacementFilterPresets(false)) || []);
        } catch {
          /* ignore */
        }
      })();
    }
  }, [tab]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const siteOptions = useMemo(
    () =>
      (sites || [])
        .filter((s) => !s.disabled)
        .map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        )),
    [sites]
  );

  // --- Site modal ---
  const [siteOpen, setSiteOpen] = useState(false);
  const [siteEdit, setSiteEdit] = useState<FmSite | null>(null);
  const [siteName, setSiteName] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [siteOrder, setSiteOrder] = useState(0);

  const openNewSite = () => {
    setSiteEdit(null);
    setSiteName("");
    setSiteCode("");
    setSiteOrder(0);
    setSiteOpen(true);
  };
  const openEditSite = (s: FmSite) => {
    setSiteEdit(s);
    setSiteName(s.name);
    setSiteCode(s.code || "");
    setSiteOrder(Number(s.sortOrder ?? s.sort_order ?? 0));
    setSiteOpen(true);
  };
  const saveSite = async () => {
    try {
      if (!siteName.trim()) {
        toast.error("请填写名称");
        return;
      }
      if (siteEdit) {
        await patchFmSite(siteEdit.id, { name: siteName.trim(), code: siteCode.trim() || null, sortOrder: siteOrder });
        toast.success("已保存");
        const id = siteEdit.id;
        setSiteOpen(false);
        // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
        setSites((prev) =>
          prev.map((s) =>
            s.id === id
              ? { ...s, name: siteName.trim(), code: siteCode.trim() || undefined, sortOrder: siteOrder }
              : s
          )
        );
      } else {
        const created = await createFmSite({ name: siteName.trim(), code: siteCode.trim() || undefined, sortOrder: siteOrder });
        toast.success("已创建");
        setSiteOpen(false);
        // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
        setSites((prev) => [
          ...prev,
          { id: created.id, name: siteName.trim(), code: siteCode.trim() || undefined, sortOrder: siteOrder },
        ]);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // --- Option set modal ---
  const [optOpen, setOptOpen] = useState(false);
  const [optEdit, setOptEdit] = useState<FmOptionSet | null>(null);
  const [optName, setOptName] = useState("");
  const [optLines, setOptLines] = useState("");

  const openNewOpt = () => {
    setOptEdit(null);
    setOptName("");
    setOptLines("");
    setOptOpen(true);
  };
  const openEditOpt = (o: FmOptionSet) => {
    setOptEdit(o);
    setOptName(o.name);
    setOptLines((o.items || []).map((x) => x.label).join("\n"));
    setOptOpen(true);
  };
  const saveOpt = async () => {
    const items = optLines
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((label, i) => ({ label, sortOrder: i }));
    try {
      if (optEdit) {
        await patchFmOptionSet(optEdit.id, { name: optName.trim(), items });
      } else {
        await createFmOptionSet({ name: optName.trim(), items });
      }
      toast.success("已保存");
      setOptOpen(false);
      setOptionSets((await fetchFmOptionSets()) || []);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // --- Template modal（可视化编辑项；禁止手写 JSON）---
  const [tplOpen, setTplOpen] = useState(false);
  const [tplEdit, setTplEdit] = useState<FmTemplate | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplSiteIds, setTplSiteIds] = useState<string[]>([]);
  const [tplItemRows, setTplItemRows] = useState<TplItemDraft[]>([
    { label: "", fieldType: "TEXT", optionSetId: "", required: false },
  ]);
  const [tplOptSets, setTplOptSets] = useState<FmOptionSet[]>([]);

  const openNewTpl = async () => {
    setTplEdit(null);
    setTplName("");
    setTplSiteIds([]);
    setTplItemRows([{ label: "", fieldType: "TEXT", optionSetId: "", required: false }]);
    try {
      setTplOptSets((await fetchFmOptionSets()) || []);
    } catch {
      setTplOptSets([]);
    }
    setTplOpen(true);
  };

  const openEditTpl = async (t: FmTemplate) => {
    setTplEdit(t);
    setTplName(t.name);
    setTplSiteIds(resolveFmTemplateSiteIds(t));
    const rows = (t.items || []).map((it) => ({
      label: it.label,
      fieldType: (it.fieldType || "TEXT").toUpperCase(),
      optionSetId: it.optionSetId || "",
      required: !!(it.required ?? it.requiredFlag === 1),
    }));
    setTplItemRows(rows.length > 0 ? rows : [{ label: "", fieldType: "TEXT", optionSetId: "", required: false }]);
    try {
      setTplOptSets((await fetchFmOptionSets()) || []);
    } catch {
      setTplOptSets([]);
    }
    setTplOpen(true);
  };

  const saveTpl = async () => {
    const items = tplItemRows
      .map((row, i) => ({
        label: row.label.trim(),
        fieldType: row.fieldType,
        optionSetId: row.fieldType === "SELECT" ? row.optionSetId.trim() || null : null,
        required: row.required,
        sortOrder: i,
      }))
      .filter((x) => x.label.length > 0);
    if (!tplName.trim()) {
      toast.error("请填写模板名称");
      return;
    }
    if (items.length === 0) {
      toast.error("请至少添加一项有效的巡查字段（填写标签）");
      return;
    }
    if (items.some((x) => x.fieldType === "SELECT" && !x.optionSetId)) {
      toast.error("下拉型字段需选择选项集");
      return;
    }
    try {
      if (tplEdit) {
        await patchFmTemplate(tplEdit.id, {
          siteIds: tplSiteIds,
          name: tplName.trim(),
          items,
        });
      } else {
        await createFmTemplate({
          siteIds: tplSiteIds,
          name: tplName.trim(),
          items,
        });
      }
      toast.success("已保存");
      setTplOpen(false);
      // 保存后仅同步模板列表，禁止整表 load — post-save-no-full-refresh.mdc
      setTemplates((await fetchFmTemplates(undefined)) || []);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // --- Consumable modal ---
  const [cOpen, setCOpen] = useState(false);
  const [cSite, setCSite] = useState("");
  const [cName, setCName] = useState("");
  const [cQty, setCQty] = useState("1");
  const [cUnit, setCUnit] = useState("件");
  const [cNote, setCNote] = useState("");
  const saveCons = async () => {
    try {
      const created = await createFmConsumableLine({
        siteId: cSite,
        consumableName: cName,
        qty: Number(cQty),
        unit: cUnit,
        occurredAt: toLocalWallClockFromDate(new Date()),
        note: cNote || undefined,
      });
      toast.success("已添加");
      setCOpen(false);
      const siteMeta = sites.find((s) => s.id === cSite);
      const newRow: Record<string, unknown> = {
        id: created.id,
        occurredAt: toLocalWallClockFromDate(new Date()),
        siteName: siteMeta?.name ?? "",
        consumableName: cName,
        qty: Number(cQty),
        unit: cUnit,
        createdByName: "",
        note: cNote || undefined,
      };
      // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
      setConsData((prev) => (prev ? { ...prev, rows: [newRow, ...prev.rows], total: prev.total + 1 } : prev));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // --- Replacement modal ---
  const [rOpen, setROpen] = useState(false);
  const [rSite, setRSite] = useState("");
  const [rType, setRType] = useState("初效");
  const [rAt, setRAt] = useState(() => toDatetimeLocalString());
  const [rNote, setRNote] = useState("");
  const saveRep = async () => {
    try {
      const created = await createFmReplacementRecord({
        siteId: rSite,
        filterType: rType,
        replacedAt: datetimeLocalValueToBackendPayload(rAt),
        note: rNote || undefined,
      });
      toast.success("已添加");
      setROpen(false);
      const siteMeta = sites.find((s) => s.id === rSite);
      const newRow: Record<string, unknown> = {
        id: created.id,
        replacedAt: datetimeLocalValueToBackendPayload(rAt),
        siteName: siteMeta?.name ?? "",
        filterType: rType,
        daysSincePrevious: null,
        createdByName: "",
        note: rNote || undefined,
      };
      // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
      setRepData((prev) => (prev ? { ...prev, rows: [newRow, ...prev.rows], total: prev.total + 1 } : prev));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doLedgerExport = async (scope: Extract<FmExcelScope, "consumables" | "replacements">) => {
    try {
      const blob = await exportFmExcel(scope);
      const prefix = scope === "consumables" ? "facility-maintenance-consumables" : "facility-maintenance-replacements";
      downloadBlob(blob, `${prefix}-${Date.now()}.xlsx`);
      toast.success("已导出");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onLedgerImport = async (f: File | null, scope: "inspection" | "consumables" | "replacements") => {
    if (!f) return;
    try {
      const r = await importFmExcel(f, scope);
      const msg =
        scope === "inspection"
          ? `已导入巡查记录 ${r.inspectionRecords} 条`
          : scope === "consumables"
            ? `已导入耗材 ${r.consumables} 条`
            : `已导入更换 ${r.replacements} 条`;
      toast.success(msg);
      // 导入后仅刷新当前台账分页，禁止整表 load — post-save-no-full-refresh.mdc
      if (scope === "inspection") {
        /* 当日巡查表在独立面板中维护；导入后请在该页切换日期或点击刷新 */
      } else if (scope === "consumables") {
        setConsData(
          await fetchFmConsumableLines({
            siteId: filterSiteId || undefined,
            page: consPage,
            size: 20,
          })
        );
      } else {
        setRepData(
          await fetchFmReplacementRecords({
            siteId: filterSiteId || undefined,
            page: repPage,
            size: 20,
          })
        );
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <Activity className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
          检查维护
        </span>
      }
      description="巡查表、耗材与更换台账；站点与模板在「设置」中维护。"
      actions={
        <>
          <AdminButton
            type="button"
            tone="secondary"
            className="inline-flex items-center gap-2"
            title="机房 / 模板 / 耗材名目 / 更换类型等"
            onClick={() => {
              setSettingsTab("sites");
              setSettingsOpen(true);
            }}
          >
            <Settings className="h-4 w-4" aria-hidden /> 设置
          </AdminButton>
          <AdminButton type="button" tone="secondary" className="inline-flex items-center gap-2" onClick={() => void refresh()}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            刷新
          </AdminButton>
        </>
      }
    >
    <div className="mx-auto max-w-[1400px] space-y-4">
        <AdminFormCard title="台账类型" description="在巡查表、耗材登记与更换记录之间切换。">
        <div className="flex flex-wrap gap-2">
          {LEDGER_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                tab === t.key ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        </AdminFormCard>

        {(tab === "consumables" || tab === "replacements") && (
          <AdminFormCard title="筛选" description="按机房缩小当前台账列表。">
            <label className="flex max-w-xs flex-col gap-1">
              <span className={adminLabelClass}>机房</span>
              <AdminSelect value={filterSiteId} onChange={(e) => setFilterSiteId(e.target.value)}>
                <option value="">全部</option>
                {siteOptions}
              </AdminSelect>
            </label>
          </AdminFormCard>
        )}

        {settingsOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setSettingsOpen(false)}
          >
            <div className="my-6 w-full max-w-5xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">系统设置</h2>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => setSettingsOpen(false)}
                >
                  关闭
                </button>
              </div>
              <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
                {(
                  [
                    ["sites", "机房"],
                    ["options", "下拉选项"],
                    ["templates", "巡查模板"],
                    ["catalog", "耗材名目"],
                    ["presets", "更换类型"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSettingsTab(k)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      settingsTab === k ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {settingsTab === "sites" && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="font-medium text-slate-800">机房地点</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                onClick={openNewSite}
              >
                <Plus className="h-4 w-4" /> 新增
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2">名称</th>
                    <th className="px-4 py-2">编码</th>
                    <th className="px-4 py-2">排序</th>
                    <th className="px-4 py-2">状态</th>
                    <th className="px-4 py-2 min-w-[220px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(sites || []).map((s) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="px-4 py-2">{s.name}</td>
                      <td className="px-4 py-2">{s.code || "-"}</td>
                      <td className="px-4 py-2">{s.sortOrder ?? s.sort_order ?? 0}</td>
                      <td className="px-4 py-2">{s.disabled ? "停用" : "正常"}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          <button type="button" className="text-blue-600 hover:underline" onClick={() => openEditSite(s)}>
                            编辑
                          </button>
                          {!s.disabled ? (
                            <button
                              type="button"
                              className="text-amber-700 hover:underline"
                              onClick={async () => {
                                if (!confirm("确定停用该机房？停用后下拉框中不再出现，可在设置中重新启用。")) return;
                                try {
                                  await patchFmSite(s.id, { disabled: 1 });
                                  toast.success("已停用");
                                  // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
                                  setSites((prev) => prev.map((x) => (x.id === s.id ? { ...x, disabled: 1 } : x)));
                                } catch (e) {
                                  toast.error((e as Error).message);
                                }
                              }}
                            >
                              停用
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="text-emerald-700 hover:underline"
                              onClick={async () => {
                                try {
                                  await patchFmSite(s.id, { disabled: 0 });
                                  toast.success("已启用");
                                  // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
                                  setSites((prev) => prev.map((x) => (x.id === s.id ? { ...x, disabled: 0 } : x)));
                                } catch (e) {
                                  toast.error((e as Error).message);
                                }
                              }}
                            >
                              启用
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-rose-600 hover:underline"
                            onClick={async () => {
                              if (
                                !confirm(
                                  "确定永久删除该机房？数据库中将删除该行；历史台账若引用该机房 ID 可能残留孤儿数据。此操作不可恢复。"
                                )
                              )
                                return;
                              try {
                                await deleteFmSitePermanent(s.id);
                                toast.success("已删除");
                                // 删除后仅从列表移除该行，禁止整表 load（post-save-no-full-refresh.mdc）
                                setSites((prev) => prev.filter((x) => x.id !== s.id));
                              } catch (e) {
                                toast.error((e as Error).message);
                              }
                            }}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
              )}

              {settingsTab === "options" && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="font-medium text-slate-800">下拉选项集</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white"
                onClick={openNewOpt}
              >
                <Plus className="h-4 w-4" /> 新增
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {(optionSets || []).map((o) => (
                <div key={o.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                  <div>
                    <div className="font-medium">{o.name}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {(o.items || []).map((i) => i.label).join("、") || "（无选项）"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="text-blue-600 text-sm" onClick={() => openEditOpt(o)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      className="text-rose-600 text-sm"
                      onClick={async () => {
                        if (!confirm("删除该选项集？")) return;
                        try {
                          await deleteFmOptionSet(o.id);
                          toast.success("已删除");
                          setOptionSets((await fetchFmOptionSets()) || []);
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
              )}

              {settingsTab === "templates" && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="font-medium text-slate-800">巡查模板</span>
              <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={openNewTpl}>
                <Plus className="h-4 w-4" /> 新增模板
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2">名称</th>
                    <th className="px-4 py-2">机房</th>
                    <th className="px-4 py-2">项数</th>
                    <th className="px-4 py-2 w-44">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(templates || []).map((t) => (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="px-4 py-2">{t.name}</td>
                      <td className="px-4 py-2">{fmTemplateSiteColumnLabel(t, sites)}</td>
                      <td className="px-4 py-2">{(t.items || []).length}</td>
                      <td className="px-4 py-2 space-x-2">
                        <button type="button" className="text-blue-600 hover:underline" onClick={() => void openEditTpl(t)}>
                          编辑
                        </button>
                        <button
                          type="button"
                          className="text-rose-600 hover:underline"
                          onClick={async () => {
                            if (!confirm("删除模板？")) return;
                            try {
                              await deleteFmTemplate(t.id);
                              toast.success("已删除");
                              setTemplates((await fetchFmTemplates(undefined)) || []);
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
              )}

              {settingsTab === "catalog" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <div className="min-w-[140px] flex-1">
                      <label className="mb-1 block text-xs text-slate-500">名称</label>
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                        value={newCatalogName}
                        onChange={(e) => setNewCatalogName(e.target.value)}
                        placeholder="如：手套"
                      />
                    </div>
                    <div className="w-28">
                      <label className="mb-1 block text-xs text-slate-500">默认单位</label>
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                        value={newCatalogUnit}
                        onChange={(e) => setNewCatalogUnit(e.target.value)}
                        placeholder="件"
                      />
                    </div>
                    <button
                      type="button"
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
                      onClick={async () => {
                        if (!newCatalogName.trim()) {
                          toast.error("请填写名称");
                          return;
                        }
                        try {
                          await createFmConsumableCatalog({
                            name: newCatalogName.trim(),
                            unit: newCatalogUnit.trim() || undefined,
                            sortOrder: consumableCatalog?.length ?? 0,
                          });
                          toast.success("已添加");
                          setNewCatalogName("");
                          setNewCatalogUnit("件");
                          await loadSettingsData();
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      新增
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-2">名称</th>
                          <th className="px-3 py-2">单位</th>
                          <th className="px-3 py-2">排序</th>
                          <th className="px-3 py-2">状态</th>
                          <th className="px-3 py-2 w-44">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(consumableCatalog || []).map((c) => (
                          <tr key={c.id} className="border-t border-slate-100">
                            <td className="px-3 py-2">{c.name}</td>
                            <td className="px-3 py-2">{c.unit || "-"}</td>
                            <td className="px-3 py-2">{c.sortOrder ?? 0}</td>
                            <td className="px-3 py-2">{c.disabled ? "停用" : "正常"}</td>
                            <td className="px-3 py-2 space-x-2">
                              <button
                                type="button"
                                className="text-blue-600 text-sm hover:underline"
                                onClick={async () => {
                                  const u = prompt("单位", c.unit || "");
                                  if (u === null) return;
                                  try {
                                    await patchFmConsumableCatalog(c.id, { unit: u.trim() || null });
                                    toast.success("已更新");
                                    await loadSettingsData();
                                  } catch (e) {
                                    toast.error((e as Error).message);
                                  }
                                }}
                              >
                                单位
                              </button>
                              <button
                                type="button"
                                className="text-blue-600 text-sm hover:underline"
                                onClick={async () => {
                                  try {
                                    await patchFmConsumableCatalog(c.id, { disabled: c.disabled ? 0 : 1 });
                                    toast.success("已更新");
                                    await loadSettingsData();
                                  } catch (e) {
                                    toast.error((e as Error).message);
                                  }
                                }}
                              >
                                {c.disabled ? "启用" : "停用"}
                              </button>
                              <button
                                type="button"
                                className="text-rose-600 text-sm hover:underline"
                                onClick={async () => {
                                  if (!confirm("删除该耗材名目？")) return;
                                  try {
                                    await deleteFmConsumableCatalog(c.id);
                                    toast.success("已删除");
                                    await loadSettingsData();
                                  } catch (e) {
                                    toast.error((e as Error).message);
                                  }
                                }}
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {settingsTab === "presets" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <div className="min-w-[200px] flex-1">
                      <label className="mb-1 block text-xs text-slate-500">类型名称（如初效/中效/高效）</label>
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                        value={newPresetLabel}
                        onChange={(e) => setNewPresetLabel(e.target.value)}
                        placeholder="初效"
                      />
                    </div>
                    <button
                      type="button"
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
                      onClick={async () => {
                        if (!newPresetLabel.trim()) {
                          toast.error("请填写名称");
                          return;
                        }
                        try {
                          await createFmReplacementFilterPreset({
                            label: newPresetLabel.trim(),
                            sortOrder: replacementPresets?.length ?? 0,
                          });
                          toast.success("已添加");
                          setNewPresetLabel("");
                          await loadSettingsData();
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      新增
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-2">名称</th>
                          <th className="px-3 py-2">排序</th>
                          <th className="px-3 py-2">状态</th>
                          <th className="px-3 py-2 w-40">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(replacementPresets || []).map((p) => (
                          <tr key={p.id} className="border-t border-slate-100">
                            <td className="px-3 py-2">{p.label}</td>
                            <td className="px-3 py-2">{p.sortOrder ?? 0}</td>
                            <td className="px-3 py-2">{p.disabled ? "停用" : "正常"}</td>
                            <td className="px-3 py-2 space-x-2">
                              <button
                                type="button"
                                className="text-blue-600 text-sm hover:underline"
                                onClick={async () => {
                                  const n = prompt("名称", p.label);
                                  if (n === null || !n.trim()) return;
                                  try {
                                    await patchFmReplacementFilterPreset(p.id, { label: n.trim() });
                                    toast.success("已更新");
                                    await loadSettingsData();
                                  } catch (e) {
                                    toast.error((e as Error).message);
                                  }
                                }}
                              >
                                改名
                              </button>
                              <button
                                type="button"
                                className="text-blue-600 text-sm hover:underline"
                                onClick={async () => {
                                  try {
                                    await patchFmReplacementFilterPreset(p.id, { disabled: p.disabled ? 0 : 1 });
                                    toast.success("已更新");
                                    await loadSettingsData();
                                  } catch (e) {
                                    toast.error((e as Error).message);
                                  }
                                }}
                              >
                                {p.disabled ? "启用" : "停用"}
                              </button>
                              <button
                                type="button"
                                className="text-rose-600 text-sm hover:underline"
                                onClick={async () => {
                                  if (!confirm("删除该类型？")) return;
                                  try {
                                    await deleteFmReplacementFilterPreset(p.id);
                                    toast.success("已删除");
                                    await loadSettingsData();
                                  } catch (e) {
                                    toast.error((e as Error).message);
                                  }
                                }}
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "inspection" && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <DailyInspectionPanel />
          </div>
        )}

        {tab === "consumables" && consData && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <span className="font-medium">耗材登记</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => void doLedgerExport("consumables")}
                >
                  <Download className="h-4 w-4" /> 导出 Excel
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  <Upload className="h-4 w-4" /> 导入
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => void onLedgerImport(e.target.files?.[0] ?? null, "consumables")}
                  />
                </label>
                <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => setCOpen(true)}>
                  新增
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-auto border-collapse border border-slate-200 text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium whitespace-nowrap">时间</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium whitespace-nowrap">机房</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">耗材</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium whitespace-nowrap">数量</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium whitespace-nowrap">登记人</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {consData.rows.map((row) => (
                  <tr key={String(row.id)} className="border-t border-slate-100">
                    <td className="max-w-[11rem] whitespace-normal break-words px-3 py-2 align-top">
                      {formatDateTimeAsiaShanghai(rowPick(row as Record<string, unknown>, "occurredAt", "occurred_at"))}
                    </td>
                    <td className="max-w-[10rem] whitespace-normal break-words px-3 py-2 align-top">
                      {String(rowPick(row as Record<string, unknown>, "siteName", "site_name") ?? "")}
                    </td>
                    <td className="min-w-[8rem] whitespace-normal break-words px-3 py-2 align-top">
                      {String(rowPick(row as Record<string, unknown>, "consumableName", "consumable_name") ?? "")}
                    </td>
                    <td className="whitespace-normal break-words px-3 py-2 align-top">
                      {String(rowPick(row as Record<string, unknown>, "qty", "qty") ?? "")}{" "}
                      {String(rowPick(row as Record<string, unknown>, "unit", "unit") ?? "")}
                    </td>
                    <td className="max-w-[10rem] whitespace-normal break-words px-3 py-2 align-top">
                      {String(rowPick(row as Record<string, unknown>, "createdByName", "created_by_name") ?? "")}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        className="text-rose-600"
                        onClick={async () => {
                          if (!confirm("删除？")) return;
                          try {
                            await deleteFmConsumableLine(String(row.id));
                            toast.success("已删除");
                            // 删除后仅从列表移除该行，禁止整表 load（post-save-no-full-refresh.mdc）
                            setConsData((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    rows: prev.rows.filter((x) => String(x.id) !== String(row.id)),
                                    total: Math.max(0, prev.total - 1),
                                  }
                                : prev
                            );
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {tab === "replacements" && repData && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <span className="font-medium">更换记录</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => void doLedgerExport("replacements")}
                >
                  <Download className="h-4 w-4" /> 导出 Excel
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  <Upload className="h-4 w-4" /> 导入
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => void onLedgerImport(e.target.files?.[0] ?? null, "replacements")}
                  />
                </label>
                <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => setROpen(true)}>
                  新增
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] table-auto border-collapse border border-slate-200 text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium whitespace-nowrap">更换时间</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium whitespace-nowrap">机房</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">类型</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium whitespace-nowrap">距上次(天)</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium whitespace-nowrap">登记人</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {repData.rows.map((row) => (
                  <tr key={String(row.id)} className="border-t border-slate-100">
                    <td className="max-w-[11rem] whitespace-normal break-words px-3 py-2 align-top">
                      {formatDateTimeAsiaShanghai(rowPick(row as Record<string, unknown>, "replacedAt", "replaced_at"))}
                    </td>
                    <td className="max-w-[10rem] whitespace-normal break-words px-3 py-2 align-top">
                      {String(rowPick(row as Record<string, unknown>, "siteName", "site_name") ?? "")}
                    </td>
                    <td className="min-w-[8rem] whitespace-normal break-words px-3 py-2 align-top">
                      {replacementFilterDisplay(rowPick(row as Record<string, unknown>, "filterType", "filter_type"))}
                    </td>
                    <td className="whitespace-normal px-3 py-2 align-top">
                      {rowPick(row as Record<string, unknown>, "daysSincePrevious", "days_since_previous") != null
                        ? String(rowPick(row as Record<string, unknown>, "daysSincePrevious", "days_since_previous"))
                        : "-"}
                    </td>
                    <td className="max-w-[10rem] whitespace-normal break-words px-3 py-2 align-top">
                      {String(rowPick(row as Record<string, unknown>, "createdByName", "created_by_name") ?? "")}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        className="text-rose-600"
                        onClick={async () => {
                          if (!confirm("删除？")) return;
                          try {
                            await deleteFmReplacementRecord(String(row.id));
                            toast.success("已删除");
                            // 删除后仅从列表移除该行，禁止整表 load（post-save-no-full-refresh.mdc）
                            setRepData((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    rows: prev.rows.filter((x) => String(x.id) !== String(row.id)),
                                    total: Math.max(0, prev.total - 1),
                                  }
                                : prev
                            );
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

      </div>

      {/* Modals — simple fixed overlay */}
      {siteOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="mb-3 font-semibold">{siteEdit ? "编辑机房" : "新增机房"}</h3>
            <div className="space-y-2">
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="名称" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder={siteEdit ? "编码（可清空后保存为不填）" : "编码留空则自动生成"}
                value={siteCode}
                onChange={(e) => setSiteCode(e.target.value)}
              />
              <input
                type="number"
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="排序"
                value={siteOrder}
                onChange={(e) => setSiteOrder(Number(e.target.value))}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setSiteOpen(false)}>
                取消
              </button>
              <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => void saveSite()}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {optOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h3 className="mb-3 font-semibold">{optEdit ? "编辑选项集" : "新增选项集"}</h3>
            <input className="mb-2 w-full rounded border px-3 py-2 text-sm" placeholder="名称" value={optName} onChange={(e) => setOptName(e.target.value)} />
            <textarea
              className="h-40 w-full rounded border px-3 py-2 text-sm font-mono"
              placeholder="每行一个选项"
              value={optLines}
              onChange={(e) => setOptLines(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setOptOpen(false)}>
                取消
              </button>
              <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => void saveOpt()}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {tplOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="my-8 w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl">
            <h3 className="mb-3 font-semibold">{tplEdit ? "编辑模板" : "新增模板"}</h3>
            <input className="mb-2 w-full rounded border px-3 py-2 text-sm" placeholder="模板名称" value={tplName} onChange={(e) => setTplName(e.target.value)} />
            <div className="mb-4 space-y-2">
              <p className="text-xs text-slate-500">适用机房（不勾选表示全局模板）</p>
              <div className="flex max-h-36 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-3">
                {sites
                  .filter((s) => Number(s.disabled) !== 1)
                  .map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={tplSiteIds.includes(s.id)}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setTplSiteIds((prev) => {
                            if (on) return prev.includes(s.id) ? prev : [...prev, s.id];
                            return prev.filter((x) => x !== s.id);
                          });
                        }}
                      />
                      {s.name}
                    </label>
                  ))}
              </div>
            </div>
            <p className="mb-2 text-xs text-slate-500">巡查项（可视化配置；下拉型需先在「下拉选项」中维护选项集）</p>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {tplItemRows.map((row, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2">
                  <input
                    className="min-w-[100px] flex-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                    placeholder="字段标签"
                    value={row.label}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTplItemRows((r) => r.map((x, i) => (i === idx ? { ...x, label: v } : x)));
                    }}
                  />
                  <select
                    className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                    value={row.fieldType}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTplItemRows((r) =>
                        r.map((x, i) => (i === idx ? { ...x, fieldType: v, optionSetId: v === "SELECT" ? x.optionSetId : "" } : x))
                      );
                    }}
                  >
                    {FM_FIELD_TYPES.map((ft) => (
                      <option key={ft} value={ft}>
                        {ft}
                      </option>
                    ))}
                  </select>
                  {row.fieldType === "SELECT" && (
                    <select
                      className="min-w-[160px] rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                      value={row.optionSetId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTplItemRows((r) => r.map((x, i) => (i === idx ? { ...x, optionSetId: v } : x)));
                      }}
                    >
                      <option value="">选择选项集</option>
                      {tplOptSets.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={row.required}
                      onChange={(e) =>
                        setTplItemRows((r) => r.map((x, i) => (i === idx ? { ...x, required: e.target.checked } : x)))
                      }
                    />
                    必填
                  </label>
                  <div className="ml-auto flex gap-1">
                    <button
                      type="button"
                      title="上移"
                      className="rounded border border-slate-200 bg-white p-1.5 disabled:opacity-30"
                      disabled={idx === 0}
                      onClick={() => setTplItemRows((r) => moveArr(r, idx, -1))}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="下移"
                      className="rounded border border-slate-200 bg-white p-1.5 disabled:opacity-30"
                      disabled={idx === tplItemRows.length - 1}
                      onClick={() => setTplItemRows((r) => moveArr(r, idx, 1))}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="删除此行"
                      className="rounded border border-slate-200 bg-white p-1.5 text-rose-600"
                      onClick={() => setTplItemRows((r) => r.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-3 text-sm font-medium text-blue-600 hover:underline"
              onClick={() =>
                setTplItemRows((r) => [...r, { label: "", fieldType: "TEXT", optionSetId: "", required: false }])
              }
            >
              + 添加一行
            </button>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setTplOpen(false)}>
                取消
              </button>
              <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => void saveTpl()}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {cOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl space-y-2">
            <h3 className="font-semibold">耗材登记</h3>
            <select className="w-full rounded border px-3 py-2 text-sm" value={cSite} onChange={(e) => setCSite(e.target.value)}>
              <option value="">机房</option>
              {siteOptions}
            </select>
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="耗材名称（可选预设或手输）"
              list="fm-cons-catalog"
              value={cName}
              onChange={(e) => {
                const v = e.target.value;
                setCName(v);
                const hit = consumableCatalog.find((c) => !c.disabled && c.name === v);
                if (hit?.unit) setCUnit(hit.unit);
              }}
            />
            <datalist id="fm-cons-catalog">
              {consumableCatalog
                .filter((c) => !c.disabled)
                .map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.unit ? `${c.unit}` : ""}
                  </option>
                ))}
            </datalist>
            <input className="w-full rounded border px-3 py-2 text-sm" placeholder="数量" value={cQty} onChange={(e) => setCQty(e.target.value)} />
            <input className="w-full rounded border px-3 py-2 text-sm" placeholder="单位" value={cUnit} onChange={(e) => setCUnit(e.target.value)} />
            <input className="w-full rounded border px-3 py-2 text-sm" placeholder="备注" value={cNote} onChange={(e) => setCNote(e.target.value)} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setCOpen(false)}>
                取消
              </button>
              <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => void saveCons()}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {rOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl space-y-2">
            <h3 className="font-semibold">更换记录</h3>
            <select className="w-full rounded border px-3 py-2 text-sm" value={rSite} onChange={(e) => setRSite(e.target.value)}>
              <option value="">机房</option>
              {siteOptions}
            </select>
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="过滤器类型（可选预设或手输）"
              list="fm-rep-presets"
              value={rType}
              onChange={(e) => setRType(e.target.value)}
            />
            <datalist id="fm-rep-presets">
              {replacementPresets
                .filter((p) => !p.disabled)
                .map((p) => (
                  <option key={p.id} value={p.label} />
                ))}
            </datalist>
            <input type="datetime-local" className="w-full rounded border px-3 py-2 text-sm" value={rAt} onChange={(e) => setRAt(e.target.value)} />
            <input className="w-full rounded border px-3 py-2 text-sm" placeholder="备注" value={rNote} onChange={(e) => setRNote(e.target.value)} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setROpen(false)}>
                取消
              </button>
              <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => void saveRep()}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
