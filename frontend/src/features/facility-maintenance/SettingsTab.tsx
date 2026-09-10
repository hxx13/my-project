import { useState } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import {
  createFmConsumableCatalog,
  createFmOptionSet,
  createFmReplacementFilterPreset,
  createFmSite,
  createFmTemplate,
  deleteFmConsumableCatalog,
  deleteFmOptionSet,
  deleteFmReplacementFilterPreset,
  deleteFmSitePermanent,
  deleteFmTemplate,
  fetchFmConsumableCatalog,
  fetchFmOptionSets,
  fetchFmReplacementFilterPresets,
  fetchFmSites,
  fetchFmTemplates,
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
import { AdminCenteredPanelShell } from "@/components/admin/AdminCenteredPanelShell";
import {
  AdminFormField,
  AdminFormGrid,
  AdminFormInput,
  AdminFormSelect,
  AdminFormToggleRow,
} from "@/components/admin/AdminFormPrimitives";
import { AdminFillScrollRegion, AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import DataSkeleton from "@/components/ui/DataSkeleton";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import { FmToolbar, type FmTabItem } from "@/features/facility-maintenance/shared/FmToolbar";

/* ================================================================== */
/*  SettingsTab — 设施检查维护「设置」tab                                 */
/*  5 个子表：机房 / 下拉选项集 / 巡查模板 / 耗材名目 / 更换类型。          */
/*  自持数据（React Query）：query key 与页面壳及台账 tab 共用，命中缓存。   */
/* ================================================================== */

type SettingsTabKey = "sites" | "optionSets" | "templates" | "catalog" | "presets";

const SETTINGS_TABS: { value: SettingsTabKey; label: string }[] = [
  { value: "sites", label: "机房" },
  { value: "optionSets", label: "下拉选项" },
  { value: "templates", label: "巡查模板" },
  { value: "catalog", label: "耗材名目" },
  { value: "presets", label: "更换类型" },
];

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

const toolbarBtn =
  "rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50";
const toolbarBtnPrimary =
  "rounded-lg bg-[var(--app-color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50";
const rowBtn =
  "rounded-md border border-[var(--app-color-border-default)] px-2.5 py-1 text-xs hover:bg-[var(--app-color-surface-hover)]";
const rowDangerBtn =
  "rounded-md border border-[color-mix(in_srgb,var(--app-color-feedback-danger)_30%,transparent)] px-2.5 py-1 text-xs text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-feedback-danger-soft)]";
const textareaClass =
  "w-full rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] outline-none focus:border-[var(--app-color-accent)]";
const iconBtn =
  "rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1.5 disabled:opacity-30";
const iconDangerBtn =
  "rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1.5 text-[var(--app-color-feedback-danger)]";

type SettingsTabProps = {
  tabs: FmTabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
};

export default function SettingsTab({ tabs, activeTab, onTabChange }: SettingsTabProps) {
  const qc = useQueryClient();
  const [settingsTab, setSettingsTab] = useState<SettingsTabKey>("sites");

  // 与页面壳/台账 tab 共用 query key，命中缓存、不重复发请求
  const {
    data: sites = [],
    isLoading: sitesLoading,
    error: sitesError,
    refetch: refetchSites,
  } = useQuery({
    queryKey: ["fmSites"] as const,
    queryFn: () => fetchFmSites(true),
    staleTime: 5 * 60 * 1000,
  });
  const {
    data: optionSets = [],
    isLoading: optLoading,
    error: optError,
    refetch: refetchOpt,
  } = useQuery({
    queryKey: ["fmOptionSets"] as const,
    queryFn: fetchFmOptionSets,
    staleTime: 5 * 60 * 1000,
  });
  const {
    data: templates = [],
    isLoading: tplLoading,
    error: tplError,
    refetch: refetchTpl,
  } = useQuery({
    queryKey: ["fmTemplates"] as const,
    queryFn: () => fetchFmTemplates(undefined),
    staleTime: 5 * 60 * 1000,
  });
  const {
    data: consumableCatalog = [],
    isLoading: catalogLoading,
    error: catalogError,
    refetch: refetchCatalog,
  } = useQuery({
    queryKey: ["fmConsumableCatalog"] as const,
    queryFn: () => fetchFmConsumableCatalog(true),
    staleTime: 5 * 60 * 1000,
  });
  const {
    data: replacementPresets = [],
    isLoading: presetLoading,
    error: presetError,
    refetch: refetchPreset,
  } = useQuery({
    queryKey: ["fmReplacementPresets"] as const,
    queryFn: () => fetchFmReplacementFilterPresets(true),
    staleTime: 5 * 60 * 1000,
  });

  const enabledSites = sites.filter((s) => Number(s.disabled) !== 1);

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
        qc.setQueryData(["fmSites"], (prev: FmSite[] | undefined) =>
          (prev || []).map((s) =>
            s.id === id
              ? { ...s, name: siteName.trim(), code: siteCode.trim() || undefined, sortOrder: siteOrder }
              : s
          )
        );
      } else {
        const created = await createFmSite({ name: siteName.trim(), code: siteCode.trim() || undefined, sortOrder: siteOrder });
        toast.success("已创建");
        setSiteOpen(false);
        qc.setQueryData(["fmSites"], (prev: FmSite[] | undefined) => [
          ...(prev || []),
          { id: created.id, name: siteName.trim(), code: siteCode.trim() || undefined, sortOrder: siteOrder },
        ]);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /** 停用 / 启用机房（软改 disabled，沿用原实现） */
  const toggleSiteDisabled = async (s: FmSite, disabled: 0 | 1) => {
    try {
      await patchFmSite(s.id, { disabled });
      toast.success(disabled ? "已停用" : "已启用");
      qc.setQueryData(["fmSites"], (prev: FmSite[] | undefined) =>
        (prev || []).map((x) => (x.id === s.id ? { ...x, disabled } : x))
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /** 永久删除机房（不可恢复，二次确认） */
  const removeSitePermanent = async (s: FmSite) => {
    if (
      !await appConfirm(
        "确定永久删除该机房？数据库中将删除该行；历史台账若引用该机房 ID 可能残留孤儿数据。此操作不可恢复。"
      )
    )
      return;
    try {
      await deleteFmSitePermanent(s.id);
      toast.success("已删除");
      qc.setQueryData(["fmSites"], (prev: FmSite[] | undefined) => (prev || []).filter((x) => x.id !== s.id));
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
      qc.invalidateQueries({ queryKey: ["fmOptionSets"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const removeOpt = async (o: FmOptionSet) => {
    if (!await appConfirm("删除该选项集？")) return;
    try {
      await deleteFmOptionSet(o.id);
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["fmOptionSets"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // --- Template modal ---
  const [tplOpen, setTplOpen] = useState(false);
  const [tplEdit, setTplEdit] = useState<FmTemplate | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplSiteIds, setTplSiteIds] = useState<string[]>([]);
  const [tplItemRows, setTplItemRows] = useState<TplItemDraft[]>([
    { label: "", fieldType: "TEXT", optionSetId: "", required: false },
  ]);

  const openNewTpl = () => {
    setTplEdit(null);
    setTplName("");
    setTplSiteIds([]);
    setTplItemRows([{ label: "", fieldType: "TEXT", optionSetId: "", required: false }]);
    setTplOpen(true);
  };

  const openEditTpl = (t: FmTemplate) => {
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
        await patchFmTemplate(tplEdit.id, { siteIds: tplSiteIds, name: tplName.trim(), items });
      } else {
        await createFmTemplate({ siteIds: tplSiteIds, name: tplName.trim(), items });
      }
      toast.success("已保存");
      setTplOpen(false);
      qc.invalidateQueries({ queryKey: ["fmTemplates"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const removeTpl = async (t: FmTemplate) => {
    if (!await appConfirm("删除模板？")) return;
    try {
      await deleteFmTemplate(t.id);
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["fmTemplates"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // --- Consumable catalog ---
  const [newCatalogName, setNewCatalogName] = useState("");
  const [newCatalogUnit, setNewCatalogUnit] = useState("件");

  const addCatalog = async () => {
    if (!newCatalogName.trim()) {
      toast.error("请填写名称");
      return;
    }
    try {
      await createFmConsumableCatalog({
        name: newCatalogName.trim(),
        unit: newCatalogUnit.trim() || undefined,
        sortOrder: consumableCatalog.length,
      });
      toast.success("已添加");
      setNewCatalogName("");
      setNewCatalogUnit("件");
      qc.invalidateQueries({ queryKey: ["fmConsumableCatalog"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const editCatalogUnit = async (c: FmConsumableCatalog) => {
    const u = await appPrompt("单位", c.unit || "");
    if (u === null) return;
    try {
      await patchFmConsumableCatalog(c.id, { unit: u.trim() || null });
      toast.success("已更新");
      qc.invalidateQueries({ queryKey: ["fmConsumableCatalog"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const toggleCatalogDisabled = async (c: FmConsumableCatalog) => {
    try {
      await patchFmConsumableCatalog(c.id, { disabled: c.disabled ? 0 : 1 });
      toast.success("已更新");
      qc.invalidateQueries({ queryKey: ["fmConsumableCatalog"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const removeCatalog = async (c: FmConsumableCatalog) => {
    if (!await appConfirm("删除该耗材名目？")) return;
    try {
      await deleteFmConsumableCatalog(c.id);
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["fmConsumableCatalog"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // --- Replacement presets ---
  const [newPresetLabel, setNewPresetLabel] = useState("");

  const addPreset = async () => {
    if (!newPresetLabel.trim()) {
      toast.error("请填写名称");
      return;
    }
    try {
      await createFmReplacementFilterPreset({
        label: newPresetLabel.trim(),
        sortOrder: replacementPresets.length,
      });
      toast.success("已添加");
      setNewPresetLabel("");
      qc.invalidateQueries({ queryKey: ["fmReplacementPresets"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const renamePreset = async (p: FmReplacementFilterPreset) => {
    const n = await appPrompt("名称", p.label);
    if (n === null || !n.trim()) return;
    try {
      await patchFmReplacementFilterPreset(p.id, { label: n.trim() });
      toast.success("已更新");
      qc.invalidateQueries({ queryKey: ["fmReplacementPresets"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const togglePresetDisabled = async (p: FmReplacementFilterPreset) => {
    try {
      await patchFmReplacementFilterPreset(p.id, { disabled: p.disabled ? 0 : 1 });
      toast.success("已更新");
      qc.invalidateQueries({ queryKey: ["fmReplacementPresets"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const removePreset = async (p: FmReplacementFilterPreset) => {
    if (!await appConfirm("删除该类型？")) return;
    try {
      await deleteFmReplacementFilterPreset(p.id);
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["fmReplacementPresets"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 工具栏：页面 tab + 设置子 tab + 新增入口（同一行，固定区） */}
      <FmToolbar tabs={tabs} activeTab={activeTab} onTabChange={onTabChange}>
        <div className="review-tabs shrink-0" role="tablist" aria-label="设置分区">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={settingsTab === t.value}
              className="review-tab"
              data-active={settingsTab === t.value}
              onClick={() => setSettingsTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mx-1 h-4 w-px shrink-0 bg-[var(--app-color-border-default)]" />
        <div className="min-w-0 flex-1" />
        {settingsTab === "sites" && (
          <button type="button" className={toolbarBtnPrimary} onClick={openNewSite}>
            <span className="inline-flex items-center gap-1">
              <Plus className="h-4 w-4" /> 新增
            </span>
          </button>
        )}
        {settingsTab === "optionSets" && (
          <button type="button" className={toolbarBtnPrimary} onClick={openNewOpt}>
            <span className="inline-flex items-center gap-1">
              <Plus className="h-4 w-4" /> 新增
            </span>
          </button>
        )}
        {settingsTab === "templates" && (
          <button type="button" className={toolbarBtnPrimary} onClick={openNewTpl}>
            <span className="inline-flex items-center gap-1">
              <Plus className="h-4 w-4" /> 新增模板
            </span>
          </button>
        )}
      </FmToolbar>

      {/* 子表内容：唯一滚动区 */}
      <AdminFillScrollRegion className="px-3 py-3">
        {/* ---------------- 机房 ---------------- */}
        {settingsTab === "sites" &&
          (sitesLoading ? (
            <DataSkeleton variant="table" rows={6} />
          ) : (
            <AdminTableShell
              error={sitesError ? (sitesError as Error).message || "加载机房失败" : null}
              onRetry={() => void refetchSites()}
              empty={!sitesError && sites.length === 0}
              emptyMessage="暂无机房，点击「新增」创建。"
            >
              <table className="twin-table w-full min-w-[640px]">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>编码</th>
                    <th>排序</th>
                    <th>状态</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s) => (
                    <tr key={s.id}>
                      <td className="min-w-[8rem] whitespace-normal break-words px-3 py-2">{s.name}</td>
                      <td className="whitespace-nowrap px-3 py-2">{s.code || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{s.sortOrder ?? s.sort_order ?? 0}</td>
                      <td className="whitespace-nowrap px-3 py-2">{s.disabled ? "停用" : "正常"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <button type="button" className={rowBtn} onClick={() => openEditSite(s)}>
                            编辑
                          </button>
                          {!s.disabled ? (
                            <button
                              type="button"
                              className={rowBtn}
                              onClick={async () => {
                                if (!await appConfirm("确定停用该机房？停用后下拉框中不再出现，可在设置中重新启用。")) return;
                                await toggleSiteDisabled(s, 1);
                              }}
                            >
                              停用
                            </button>
                          ) : (
                            <button type="button" className={rowBtn} onClick={() => void toggleSiteDisabled(s, 0)}>
                              启用
                            </button>
                          )}
                          <button type="button" className={rowDangerBtn} onClick={() => void removeSitePermanent(s)}>
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableShell>
          ))}

        {/* ---------------- 下拉选项集 ---------------- */}
        {settingsTab === "optionSets" &&
          (optLoading ? (
            <DataSkeleton variant="table" rows={6} />
          ) : (
            <AdminTableShell
              error={optError ? (optError as Error).message || "加载选项集失败" : null}
              onRetry={() => void refetchOpt()}
              empty={!optError && optionSets.length === 0}
              emptyMessage="暂无选项集，点击「新增」创建。"
            >
              <table className="twin-table w-full min-w-[560px]">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>选项</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {optionSets.map((o) => (
                    <tr key={o.id}>
                      <td className="min-w-[8rem] whitespace-normal break-words px-3 py-2">{o.name}</td>
                      <td className="min-w-[12rem] whitespace-normal break-words px-3 py-2 text-[var(--twin-body)]">
                        {(o.items || []).map((i) => i.label).join("、") || "（无选项）"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button type="button" className={rowBtn} onClick={() => openEditOpt(o)}>
                            编辑
                          </button>
                          <button type="button" className={rowDangerBtn} onClick={() => void removeOpt(o)}>
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableShell>
          ))}

        {/* ---------------- 巡查模板 ---------------- */}
        {settingsTab === "templates" &&
          (tplLoading ? (
            <DataSkeleton variant="table" rows={6} />
          ) : (
            <AdminTableShell
              error={tplError ? (tplError as Error).message || "加载模板失败" : null}
              onRetry={() => void refetchTpl()}
              empty={!tplError && templates.length === 0}
              emptyMessage="暂无巡查模板，点击「新增模板」创建。"
            >
              <table className="twin-table w-full min-w-[640px]">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>机房</th>
                    <th>项数</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id}>
                      <td className="min-w-[10rem] whitespace-normal break-words px-3 py-2">{t.name}</td>
                      <td className="min-w-[10rem] whitespace-normal break-words px-3 py-2">
                        {fmTemplateSiteColumnLabel(t, sites)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{(t.items || []).length}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button type="button" className={rowBtn} onClick={() => openEditTpl(t)}>
                            编辑
                          </button>
                          <button type="button" className={rowDangerBtn} onClick={() => void removeTpl(t)}>
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableShell>
          ))}

        {/* ---------------- 耗材名目 ---------------- */}
        {settingsTab === "catalog" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
              <AdminFormField label="名称" className="min-w-[140px] flex-1">
                <AdminFormInput
                  value={newCatalogName}
                  onChange={(e) => setNewCatalogName(e.target.value)}
                  placeholder="如：手套"
                />
              </AdminFormField>
              <AdminFormField label="默认单位" className="w-28">
                <AdminFormInput
                  value={newCatalogUnit}
                  onChange={(e) => setNewCatalogUnit(e.target.value)}
                  placeholder="件"
                />
              </AdminFormField>
              <button type="button" className={toolbarBtnPrimary} onClick={() => void addCatalog()}>
                新增
              </button>
            </div>
            {catalogLoading ? (
              <DataSkeleton variant="table" rows={6} />
            ) : (
              <AdminTableShell
                error={catalogError ? (catalogError as Error).message || "加载耗材名目失败" : null}
                onRetry={() => void refetchCatalog()}
                empty={!catalogError && consumableCatalog.length === 0}
                emptyMessage="暂无耗材名目，填写名称后点击「新增」。"
              >
                <table className="twin-table w-full min-w-[560px]">
                  <thead>
                    <tr>
                      <th>名称</th>
                      <th>单位</th>
                      <th>排序</th>
                      <th>状态</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consumableCatalog.map((c) => (
                      <tr key={c.id}>
                        <td className="min-w-[8rem] whitespace-normal break-words px-3 py-2">{c.name}</td>
                        <td className="whitespace-nowrap px-3 py-2">{c.unit || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{c.sortOrder ?? 0}</td>
                        <td className="whitespace-nowrap px-3 py-2">{c.disabled ? "停用" : "正常"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            <button type="button" className={rowBtn} onClick={() => void editCatalogUnit(c)}>
                              单位
                            </button>
                            <button type="button" className={rowBtn} onClick={() => void toggleCatalogDisabled(c)}>
                              {c.disabled ? "启用" : "停用"}
                            </button>
                            <button type="button" className={rowDangerBtn} onClick={() => void removeCatalog(c)}>
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableShell>
            )}
          </div>
        )}

        {/* ---------------- 更换类型 ---------------- */}
        {settingsTab === "presets" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
              <AdminFormField label="类型名称（如初效/中效/高效）" className="min-w-[200px] flex-1">
                <AdminFormInput
                  value={newPresetLabel}
                  onChange={(e) => setNewPresetLabel(e.target.value)}
                  placeholder="初效"
                />
              </AdminFormField>
              <button type="button" className={toolbarBtnPrimary} onClick={() => void addPreset()}>
                新增
              </button>
            </div>
            {presetLoading ? (
              <DataSkeleton variant="table" rows={6} />
            ) : (
              <AdminTableShell
                error={presetError ? (presetError as Error).message || "加载更换类型失败" : null}
                onRetry={() => void refetchPreset()}
                empty={!presetError && replacementPresets.length === 0}
                emptyMessage="暂无更换类型，填写名称后点击「新增」。"
              >
                <table className="twin-table w-full min-w-[520px]">
                  <thead>
                    <tr>
                      <th>名称</th>
                      <th>排序</th>
                      <th>状态</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {replacementPresets.map((p) => (
                      <tr key={p.id}>
                        <td className="min-w-[8rem] whitespace-normal break-words px-3 py-2">{p.label}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{p.sortOrder ?? 0}</td>
                        <td className="whitespace-nowrap px-3 py-2">{p.disabled ? "停用" : "正常"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            <button type="button" className={rowBtn} onClick={() => void renamePreset(p)}>
                              改名
                            </button>
                            <button type="button" className={rowBtn} onClick={() => void togglePresetDisabled(p)}>
                              {p.disabled ? "启用" : "停用"}
                            </button>
                            <button type="button" className={rowDangerBtn} onClick={() => void removePreset(p)}>
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableShell>
            )}
          </div>
        )}
      </AdminFillScrollRegion>

      {/* 新增 / 编辑机房 */}
      <AdminCenteredPanelShell
        open={siteOpen}
        onClose={() => setSiteOpen(false)}
        ariaLabel="机房"
        title={siteEdit ? "编辑机房" : "新增机房"}
        className="max-w-[min(560px,96vw)]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <AdminFormGrid>
            <AdminFormField label="名称">
              <AdminFormInput placeholder="名称" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
            </AdminFormField>
            <AdminFormField label="编码" fullWidth>
              <AdminFormInput
                placeholder={siteEdit ? "编码（可清空后保存为不填）" : "编码留空则自动生成"}
                value={siteCode}
                onChange={(e) => setSiteCode(e.target.value)}
              />
            </AdminFormField>
            <AdminFormField label="排序">
              <AdminFormInput
                type="number"
                placeholder="排序"
                value={siteOrder}
                onChange={(e) => setSiteOrder(Number(e.target.value))}
              />
            </AdminFormField>
          </AdminFormGrid>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--twin-hairline)] px-4 py-3">
          <button type="button" className={toolbarBtn} onClick={() => setSiteOpen(false)}>
            取消
          </button>
          <button type="button" className={toolbarBtnPrimary} onClick={() => void saveSite()}>
            保存
          </button>
        </div>
      </AdminCenteredPanelShell>

      {/* 新增 / 编辑选项集 */}
      <AdminCenteredPanelShell
        open={optOpen}
        onClose={() => setOptOpen(false)}
        ariaLabel="选项集"
        title={optEdit ? "编辑选项集" : "新增选项集"}
        className="max-w-[min(640px,96vw)]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <AdminFormGrid>
            <AdminFormField label="名称" fullWidth>
              <AdminFormInput placeholder="名称" value={optName} onChange={(e) => setOptName(e.target.value)} />
            </AdminFormField>
            <AdminFormField label="选项" fullWidth hint="每行一个选项">
              <textarea
                className={textareaClass}
                rows={8}
                placeholder="每行一个选项"
                value={optLines}
                onChange={(e) => setOptLines(e.target.value)}
              />
            </AdminFormField>
          </AdminFormGrid>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--twin-hairline)] px-4 py-3">
          <button type="button" className={toolbarBtn} onClick={() => setOptOpen(false)}>
            取消
          </button>
          <button type="button" className={toolbarBtnPrimary} onClick={() => void saveOpt()}>
            保存
          </button>
        </div>
      </AdminCenteredPanelShell>

      {/* 新增 / 编辑模板 */}
      <AdminCenteredPanelShell
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        ariaLabel="巡查模板"
        title={tplEdit ? "编辑模板" : "新增模板"}
        className="max-w-[min(880px,96vw)]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <AdminFormGrid>
            <AdminFormField label="模板名称" fullWidth>
              <AdminFormInput placeholder="模板名称" value={tplName} onChange={(e) => setTplName(e.target.value)} />
            </AdminFormField>
          </AdminFormGrid>
          <div className="mt-3">
            <AdminFormField label="适用机房" hint="不勾选表示全局模板">
              <div className="flex max-h-36 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
                {enabledSites.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--twin-ink)]">
                    <AdminSwitchScaled
                      size="sm"
                      checked={tplSiteIds.includes(s.id)}
                      onChange={(on) => {
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
            </AdminFormField>
          </div>
          <p className="mb-2 mt-4 text-xs text-[var(--twin-mute)]">
            巡查项（可视化配置；下拉型需先在「下拉选项」中维护选项集）
          </p>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {tplItemRows.map((row, idx) => (
              <div
                key={idx}
                className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3"
              >
                <AdminFormGrid>
                  <AdminFormField label="标签">
                    <AdminFormInput
                      placeholder="字段标签"
                      value={row.label}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTplItemRows((r) => r.map((x, i) => (i === idx ? { ...x, label: v } : x)));
                      }}
                    />
                  </AdminFormField>
                  <AdminFormField label="类型">
                    <AdminFormSelect
                      value={row.fieldType}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTplItemRows((r) =>
                          r.map((x, i) =>
                            i === idx ? { ...x, fieldType: v, optionSetId: v === "SELECT" ? x.optionSetId : "" } : x
                          )
                        );
                      }}
                    >
                      {FM_FIELD_TYPES.map((ft) => (
                        <option key={ft} value={ft}>
                          {ft}
                        </option>
                      ))}
                    </AdminFormSelect>
                  </AdminFormField>
                  {row.fieldType === "SELECT" && (
                    <AdminFormField label="选项集">
                      <AdminFormSelect
                        value={row.optionSetId}
                        onChange={(e) => {
                          const v = e.target.value;
                          setTplItemRows((r) => r.map((x, i) => (i === idx ? { ...x, optionSetId: v } : x)));
                        }}
                      >
                        <option value="">选择选项集</option>
                        {optionSets.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </AdminFormSelect>
                    </AdminFormField>
                  )}
                </AdminFormGrid>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <AdminFormToggleRow label="必填">
                    <AdminSwitchScaled
                      size="3.5"
                      checked={row.required}
                      onChange={(checked) =>
                        setTplItemRows((r) => r.map((x, i) => (i === idx ? { ...x, required: checked } : x)))
                      }
                    />
                  </AdminFormToggleRow>
                  <div className="ml-auto flex gap-1">
                    <button
                      type="button"
                      title="上移"
                      className={iconBtn}
                      disabled={idx === 0}
                      onClick={() => setTplItemRows((r) => moveArr(r, idx, -1))}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="下移"
                      className={iconBtn}
                      disabled={idx === tplItemRows.length - 1}
                      onClick={() => setTplItemRows((r) => moveArr(r, idx, 1))}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="删除此行"
                      className={iconDangerBtn}
                      onClick={() => setTplItemRows((r) => r.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-[var(--twin-link)] hover:underline"
            onClick={() =>
              setTplItemRows((r) => [...r, { label: "", fieldType: "TEXT", optionSetId: "", required: false }])
            }
          >
            + 添加一行
          </button>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--twin-hairline)] px-4 py-3">
          <button type="button" className={toolbarBtn} onClick={() => setTplOpen(false)}>
            取消
          </button>
          <button type="button" className={toolbarBtnPrimary} onClick={() => void saveTpl()}>
            保存
          </button>
        </div>
      </AdminCenteredPanelShell>
    </div>
  );
}
