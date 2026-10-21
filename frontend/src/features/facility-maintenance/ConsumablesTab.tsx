import { useMemo, useState, Fragment } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, Plus, X, Zap } from "lucide-react";

import {
  createFmConsumableLine,
  deleteFmConsumableLine,
  exportFmExcel,
  fetchFmConsumableCatalog,
  fetchFmConsumableLines,
  fetchFmSites,
  importFmExcel,
  patchFmConsumableLine,
} from "@/api/domains/facilityMaintenance.api";
import { AdminCenteredPanelShell } from "@/components/admin/AdminCenteredPanelShell";
import { AdminFilePickButton } from "@/components/admin/AdminFilePickButton";
import {
  AdminFormField,
  AdminFormGrid,
  AdminFormInput,
  AdminFormSelect,
} from "@/components/admin/AdminFormPrimitives";
import { AdminFillScrollRegion, AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import DataSkeleton from "@/components/ui/DataSkeleton";
import { appConfirm } from "@/lib/appDialog";
import { formatDateTimeAsiaShanghai } from "@/lib/formatDateTimeAsiaShanghai";
import { FmToolbar, type FmTabItem } from "@/features/facility-maintenance/shared/FmToolbar";
import {
  groupByCategory,
  loadQuickOptions,
  saveQuickOptions,
  type LedgerGroup,
  type QuickOption,
} from "@/features/facility-maintenance/shared/ledgerGroups";

/* ================================================================== */
/*  ConsumablesTab — 设施检查维护「耗材」台账 tab                          */
/*  一次拉全后按耗材名称分组；组头可直接新增并继承上一组内容。                 */
/*  快捷项保存在本地，点击只回填表单，仍由用户确认后提交。                     */
/* ================================================================== */

const QUICK_KEY = "fm-quick-consumables";

type Row = Record<string, unknown>;

const toolbarBtn =
  "rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50";
const toolbarBtnPrimary =
  "rounded-lg bg-[var(--app-color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50";
const rowBtn =
  "rounded-md border border-[var(--app-color-border-default)] px-2.5 py-1 text-xs hover:bg-[var(--app-color-surface-hover)]";
const rowDangerBtn =
  "rounded-md border border-[color-mix(in_srgb,var(--app-color-feedback-danger)_30%,transparent)] px-2.5 py-1 text-xs text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-feedback-danger-soft)]";

/** 后端字段 camel/snake 双写法兼容（沿用具名映射，避免与本地 state 混用） */
function pick(row: Row, camel: string, snake: string): unknown {
  const v = row[camel];
  return v != null ? v : row[snake];
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

/** 后端时间串 → 日期输入框需要的 `YYYY-MM-DD`（台账只记日期） */
function toDateInput(raw: unknown): string {
  const s = str(raw).trim().replace(" ", "T");
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function nowDate(): string {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** `YYYY-MM-DD` → 后端可解析的当天零点墙钟串 */
function toBackendDatetime(v: string): string {
  const t = v.trim();
  if (!t) return t;
  if (t.length === 10) return `${t}T00:00:00`;
  return t.length === 16 ? `${t}:00` : t;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** 台账一次拉全：分组与组内继承都需要完整数据，分页会把同一分类截成两半。 */
async function fetchAllConsumables(siteId: string) {
  const size = 200;
  let page = 1;
  let all: Row[] = [];
  let total = 0;
  for (let i = 0; i < 50; i += 1) {
    const data = await fetchFmConsumableLines({ siteId: siteId || undefined, page, size });
    const batch = (data.rows ?? []) as Row[];
    total = Number(data.total ?? 0);
    all = all.concat(batch);
    if (batch.length < size || all.length >= total) break;
    page += 1;
  }
  return { rows: all, total };
}

type ConsumablesTabProps = {
  tabs: FmTabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
};

export default function ConsumablesTab({ tabs, activeTab, onTabChange }: ConsumablesTabProps) {
  const qc = useQueryClient();

  // 列表筛选（本地 state）
  const [siteId, setSiteId] = useState("");
  const [exporting, setExporting] = useState(false);

  // 弹层表单
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formCatalogId, setFormCatalogId] = useState("");
  const [formName, setFormName] = useState("");
  const [formSiteId, setFormSiteId] = useState("");
  const [formQty, setFormQty] = useState("1");
  const [formUnit, setFormUnit] = useState("件");
  const [formOccurredAt, setFormOccurredAt] = useState("");
  const [formNote, setFormNote] = useState("");
  const [saving, setSaving] = useState(false);

  // 分类默认收起：先看分类概览，点组头再展开明细
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [quickOptions, setQuickOptions] = useState<QuickOption[]>(() => loadQuickOptions(QUICK_KEY));

  // 与页面壳共用 ["fmSites"]，命中缓存、不重复发 /sites
  const { data: sites = [] } = useQuery({
    queryKey: ["fmSites"] as const,
    queryFn: () => fetchFmSites(true),
    staleTime: 5 * 60 * 1000,
  });
  const enabledSites = useMemo(() => sites.filter((s) => Number(s.disabled) !== 1), [sites]);

  // 与页面壳共用 ["fmConsumableCatalog"]，命中缓存、不重复发 /consumable-catalog
  const { data: catalog = [] } = useQuery({
    queryKey: ["fmConsumableCatalog"] as const,
    queryFn: () => fetchFmConsumableCatalog(true),
    staleTime: 5 * 60 * 1000,
  });
  const enabledCatalog = useMemo(() => catalog.filter((c) => Number(c.disabled) !== 1), [catalog]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["fmConsumableLines", { siteId: siteId || undefined }] as const,
    queryFn: () => fetchAllConsumables(siteId),
    placeholderData: (prev) => prev,
  });

  const total = Number(data?.total ?? 0);
  const rows = (data?.rows ?? []) as Row[];

  const groups = useMemo(
    () =>
      groupByCategory(
        rows,
        (row) => str(pick(row, "consumableName", "consumable_name")) || "未命名",
        (row) => formatDateTimeAsiaShanghai(pick(row, "occurredAt", "occurred_at")).slice(0, 10),
      ),
    [rows],
  );

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const persistQuick = (list: QuickOption[]) => {
    setQuickOptions(list);
    saveQuickOptions(QUICK_KEY, list);
  };

  const saveAsQuick = () => {
    const name = formName.trim();
    if (!name || !formSiteId) {
      toast.error("先填好耗材名称和机房，再存为快捷项");
      return;
    }
    const siteName = enabledSites.find((s) => s.id === formSiteId)?.name ?? "";
    persistQuick([
      ...quickOptions,
      {
        id: String(Date.now()),
        label: `${name} × ${formQty || 1} · ${siteName}`,
        data: {
          name,
          qty: formQty,
          unit: formUnit.trim(),
          siteId: formSiteId,
          note: formNote.trim(),
        },
      },
    ]);
    toast.success("已存为快捷项");
  };

  const applyQuick = (opt: QuickOption) => {
    const d = opt.data as { name?: string; qty?: string; unit?: string; siteId?: string; note?: string };
    const name = d.name ?? "";
    setEditingId(null);
    setFormCatalogId(enabledCatalog.find((c) => c.name === name)?.id ?? "");
    setFormName(name);
    setFormSiteId(d.siteId || siteId || enabledSites[0]?.id || "");
    setFormQty(d.qty || "1");
    setFormUnit(d.unit || "件");
    setFormNote(d.note ?? "");
    setFormOccurredAt(nowDate());
    setFormOpen(true);
  };

  const openNew = (group?: LedgerGroup<Row>) => {
    setEditingId(null);
    if (group) {
      // 组内新增：继承该分类最近一条的机房、数量、单位与备注，名称锁定为当前分类
      const last = group.latest;
      setFormName(str(pick(last, "consumableName", "consumable_name")));
      setFormCatalogId(enabledCatalog.find((c) => c.name === group.name)?.id ?? "");
      setFormSiteId(str(pick(last, "siteId", "site_id")) || siteId || enabledSites[0]?.id || "");
      setFormQty(str(last.qty) || "1");
      setFormUnit(str(last.unit) || "件");
      setFormNote(str(last.note));
    } else {
      setFormCatalogId("");
      setFormName("");
      setFormSiteId(siteId || enabledSites[0]?.id || "");
      setFormQty("1");
      setFormUnit("件");
      setFormNote("");
    }
    setFormOccurredAt(nowDate());
    setFormOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditingId(String(row.id));
    setFormCatalogId("");
    setFormName(str(pick(row, "consumableName", "consumable_name")));
    setFormSiteId(str(pick(row, "siteId", "site_id")));
    setFormQty(str(row.qty));
    setFormUnit(str(row.unit));
    setFormOccurredAt(toDateInput(pick(row, "occurredAt", "occurred_at")));
    setFormNote(str(row.note));
    setFormOpen(true);
  };

  /** 目录选中 → 自动带出名称与单位（沿用旧的名称/单位联动） */
  const applyCatalog = (id: string) => {
    setFormCatalogId(id);
    const hit = enabledCatalog.find((c) => c.id === id);
    if (!hit) return;
    setFormName(hit.name);
    if (hit.unit) setFormUnit(hit.unit);
  };

  /** 手输名称命中目录时也带出单位（旧实现即如此） */
  const onNameChange = (v: string) => {
    setFormName(v);
    const hit = enabledCatalog.find((c) => c.name === v);
    if (hit?.unit) setFormUnit(hit.unit);
  };

  const save = async () => {
    const name = formName.trim();
    if (!name) {
      toast.error("请填写名称");
      return;
    }
    const qty = Number(formQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("数量需为大于 0 的数字");
      return;
    }
    if (!formSiteId) {
      toast.error("请选择机房");
      return;
    }
    setSaving(true);
    try {
      const body = {
        siteId: formSiteId,
        consumableName: name,
        qty,
        unit: formUnit.trim() || undefined,
        occurredAt: toBackendDatetime(formOccurredAt) || undefined,
        note: formNote.trim() || undefined,
      };
      if (editingId) {
        await patchFmConsumableLine(editingId, body);
        toast.success("已保存");
      } else {
        await createFmConsumableLine(body);
        toast.success("已添加");
      }
      setFormOpen(false);
      qc.invalidateQueries({ queryKey: ["fmConsumableLines"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Row) => {
    if (!(await appConfirm("确定删除该耗材登记？此操作不可恢复。", { danger: true }))) return;
    try {
      await deleteFmConsumableLine(String(row.id));
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["fmConsumableLines"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const blob = await exportFmExcel("consumables");
      downloadBlob(blob, `facility-maintenance-consumables-${Date.now()}.xlsx`);
      toast.success("已导出（按耗材名称分组）");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const onImportFiles = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    try {
      const r = await importFmExcel(f, "consumables");
      toast.success(`已导入耗材 ${r.consumables} 条`);
      qc.invalidateQueries({ queryKey: ["fmConsumableLines"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // 四态：loading 交给 DataSkeleton，error/empty 交给 AdminTableShell
  const errorMessage = error ? (error as Error).message || "加载耗材登记失败" : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 工具栏：页面 tab + 本 tab 功能按钮（同一行，固定区） */}
      <FmToolbar tabs={tabs} activeTab={activeTab} onTabChange={onTabChange}>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-[var(--app-color-text-tertiary)]">机房</span>
          <AdminSelect
            className="h-8 text-xs"
            aria-label="按机房筛选"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
          >
            <option value="">全部</option>
            {enabledSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </AdminSelect>
        </div>
        {quickOptions.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <span className="inline-flex items-center gap-1 text-[10px] text-[var(--app-color-text-tertiary)]">
              <Zap className="h-3 w-3" /> 快捷
            </span>
            {quickOptions.map((opt) => (
              <span
                key={opt.id}
                className="inline-flex items-center overflow-hidden rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)]"
              >
                <button
                  type="button"
                  className="max-w-[11rem] truncate px-2 py-0.5 text-[11px] text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]"
                  title={opt.label}
                  onClick={() => applyQuick(opt)}
                >
                  {opt.label}
                </button>
                <button
                  type="button"
                  className="px-1 py-0.5 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-feedback-danger)]"
                  title="删除快捷项"
                  onClick={() => persistQuick(quickOptions.filter((o) => o.id !== opt.id))}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="min-w-0 flex-1" />
        <span className="text-[11px] text-[var(--app-color-text-tertiary)]">共 {total} 条</span>
        <button type="button" className={toolbarBtn} disabled={exporting} onClick={() => void doExport()}>
          <span className="inline-flex items-center gap-1">
            <Download className="h-4 w-4" /> {exporting ? "导出中…" : "导出"}
          </span>
        </button>
        <AdminFilePickButton
          accept=".xlsx,.xls"
          className="min-h-[2rem] px-3 py-1.5 text-xs font-normal shadow-none"
          onFiles={(files) => void onImportFiles(files)}
        >
          导入
        </AdminFilePickButton>
        <button type="button" className={toolbarBtnPrimary} onClick={() => openNew()}>
          <span className="inline-flex items-center gap-1">
            <Plus className="h-4 w-4" /> 新增
          </span>
        </button>
      </FmToolbar>

      {/* 表格：唯一滚动区，按耗材名称分组 */}
      <AdminFillScrollRegion className="px-3 py-3">
        {isLoading ? (
          <DataSkeleton variant="table" rows={6} />
        ) : (
          <AdminTableShell
            error={errorMessage}
            onRetry={() => void refetch()}
            empty={!error && rows.length === 0}
            emptyMessage="暂无耗材登记，点击「新增」创建。"
          >
            <table className="twin-table w-full min-w-[760px]">
              <thead>
                <tr>
                  <th>物品名</th>
                  <th className="text-right">数量</th>
                  <th>单位</th>
                  <th>机房</th>
                  <th>发生日期</th>
                  <th>登记人</th>
                  <th>备注</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              {groups.map((group) => {
                const collapsed = !expandedGroups.has(group.name);
                return (
                  <Fragment key={group.name}>
                    <tbody>
                      <tr
                        className="cursor-pointer bg-[var(--app-color-surface-elevated)] hover:bg-[var(--app-color-surface-hover)]"
                        onClick={() => toggleGroup(group.name)}
                      >
                        <td colSpan={8} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {collapsed ? (
                              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)]" />
                            ) : (
                              <ChevronDown className="h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)]" />
                            )}
                            <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">
                              {group.name}
                            </span>
                            <span className="text-[11px] text-[var(--app-color-text-tertiary)]">
                              × {group.count}
                              {group.rangeText ? ` · ${group.rangeText}` : ""}
                            </span>
                            <button
                              type="button"
                              className="ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--app-color-border-default)] px-2 py-0.5 text-[11px] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
                              onClick={(e) => {
                                e.stopPropagation();
                                openNew(group);
                              }}
                            >
                              <Plus className="h-3 w-3" /> 在「{group.name}」新增
                            </button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                    {!collapsed && (
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={String(row.id)}>
                            <td className="min-w-[8rem] whitespace-normal break-words px-3 py-2">
                              {str(pick(row, "consumableName", "consumable_name"))}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{str(row.qty)}</td>
                            <td className="whitespace-nowrap px-3 py-2">{str(row.unit)}</td>
                            <td className="min-w-[7rem] whitespace-normal break-words px-3 py-2">
                              {str(pick(row, "siteName", "site_name"))}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {formatDateTimeAsiaShanghai(pick(row, "occurredAt", "occurred_at")).slice(0, 10)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-[var(--twin-mute)]">
                              {str(pick(row, "createdByName", "created_by_name")) || "—"}
                            </td>
                            <td className="max-w-[16rem] whitespace-normal break-words px-3 py-2">{str(row.note)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <button type="button" className={rowBtn} onClick={() => openEdit(row)}>
                                  编辑
                                </button>
                                <button type="button" className={rowDangerBtn} onClick={() => void remove(row)}>
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    )}
                  </Fragment>
                );
              })}
            </table>
          </AdminTableShell>
        )}
      </AdminFillScrollRegion>

      {/* 新增 / 编辑弹层 */}
      <AdminCenteredPanelShell
        open={formOpen}
        onClose={() => {
          if (!saving) setFormOpen(false);
        }}
        ariaLabel="耗材登记"
        title={editingId ? "编辑耗材登记" : "新增耗材登记"}
        className="max-w-[min(680px,96vw)]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <AdminFormGrid>
            <AdminFormField label="耗材名目" fullWidth hint="选择后自动带出名称与单位，也可手动填写">
              <AdminFormSelect value={formCatalogId} disabled={saving} onChange={(e) => applyCatalog(e.target.value)}>
                <option value="">（手动填写）</option>
                {enabledCatalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </AdminFormSelect>
            </AdminFormField>
            <AdminFormField label="名称">
              <AdminFormInput
                value={formName}
                disabled={saving}
                placeholder="耗材名称"
                onChange={(e) => onNameChange(e.target.value)}
              />
            </AdminFormField>
            <AdminFormField label="机房">
              <AdminFormSelect value={formSiteId} disabled={saving} onChange={(e) => setFormSiteId(e.target.value)}>
                <option value=""></option>
                {enabledSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </AdminFormSelect>
            </AdminFormField>
            <AdminFormField label="数量">
              <AdminFormInput
                value={formQty}
                disabled={saving}
                inputMode="decimal"
                onChange={(e) => setFormQty(e.target.value)}
              />
            </AdminFormField>
            <AdminFormField label="单位">
              <AdminFormInput value={formUnit} disabled={saving} onChange={(e) => setFormUnit(e.target.value)} />
            </AdminFormField>
            <AdminFormField label="发生日期">
              <AdminFormInput
                type="date"
                value={formOccurredAt}
                disabled={saving}
                onChange={(e) => setFormOccurredAt(e.target.value)}
              />
            </AdminFormField>
            <AdminFormField label="备注" fullWidth>
              <AdminFormInput value={formNote} disabled={saving} onChange={(e) => setFormNote(e.target.value)} />
            </AdminFormField>
          </AdminFormGrid>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--twin-hairline)] px-4 py-3">
          <button type="button" className={toolbarBtn} disabled={saving} onClick={saveAsQuick}>
            <span className="inline-flex items-center gap-1">
              <Zap className="h-4 w-4" /> 存为快捷项
            </span>
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className={toolbarBtn} disabled={saving} onClick={() => setFormOpen(false)}>
              取消
            </button>
            <button type="button" className={toolbarBtnPrimary} disabled={saving} onClick={() => void save()}>
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </AdminCenteredPanelShell>
    </div>
  );
}
