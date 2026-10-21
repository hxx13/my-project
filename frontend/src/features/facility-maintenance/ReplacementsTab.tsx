import { useMemo, useState, Fragment } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, Plus, X, Zap } from "lucide-react";

import {
  createFmReplacementBatch,
  createFmReplacementRecord,
  deleteFmReplacementRecord,
  exportFmExcel,
  fetchFmReplacementFilterPresets,
  fetchFmReplacementRecords,
  fetchFmSites,
  importFmExcel,
  patchFmReplacementRecord,
} from "@/api/domains/facilityMaintenance.api";
import { AdminCenteredPanelShell } from "@/components/admin/AdminCenteredPanelShell";
import { AdminFilePickButton } from "@/components/admin/AdminFilePickButton";
import {
  AdminFormField,
  AdminFormGrid,
  AdminFormInput,
  AdminFormSelect,
  AdminTagCheckboxGroup,
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
/*  ReplacementsTab — 设施检查维护「更换」台账 tab                         */
/*  一次拉全后按更换类型分组；组头可直接新增并继承上一组内容。                 */
/*  快捷项保存在本地，点击只回填表单，仍由用户确认后提交。                     */
/* ================================================================== */

const QUICK_KEY = "fm-quick-replacements";

type Row = Record<string, unknown>;

const toolbarBtn =
  "rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50";
const toolbarBtnPrimary =
  "rounded-lg bg-[var(--app-color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50";
const rowBtn =
  "rounded-md border border-[var(--app-color-border-default)] px-2.5 py-1 text-xs hover:bg-[var(--app-color-surface-hover)]";
const rowDangerBtn =
  "rounded-md border border-[color-mix(in_srgb,var(--app-color-feedback-danger)_30%,transparent)] px-2.5 py-1 text-xs text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-feedback-danger-soft)]";

/** 后端字段 camel/snake 双写法兼容 */
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
async function fetchAllReplacements(siteId: string) {
  const size = 200;
  let page = 1;
  let all: Row[] = [];
  let total = 0;
  for (let i = 0; i < 50; i += 1) {
    const data = await fetchFmReplacementRecords({ siteId: siteId || undefined, page, size });
    const batch = (data.rows ?? []) as Row[];
    total = Number(data.total ?? 0);
    all = all.concat(batch);
    if (batch.length < size || all.length >= total) break;
    page += 1;
  }
  return { rows: all, total };
}

type ReplacementsTabProps = {
  tabs: FmTabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
};

export default function ReplacementsTab({ tabs, activeTab, onTabChange }: ReplacementsTabProps) {
  const qc = useQueryClient();

  // 列表筛选（本地 state）
  const [siteId, setSiteId] = useState("");
  const [exporting, setExporting] = useState(false);

  // 弹层表单
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTypes, setFormTypes] = useState<string[]>([]);
  const [formSiteId, setFormSiteId] = useState("");
  const [formAt, setFormAt] = useState("");
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

  // 含停用项：用于把历史记录里存的预设 id 映射回 label（与页面壳设置面板共用 key）
  const { data: presets = [] } = useQuery({
    queryKey: ["fmReplacementPresets"] as const,
    queryFn: () => fetchFmReplacementFilterPresets(true),
    staleTime: 5 * 60 * 1000,
  });
  const presetLabel = (raw: unknown) => {
    const ft = str(raw).trim();
    if (!ft) return "";
    return presets.find((p) => p.id === ft)?.label || ft;
  };
  const typeOptions = useMemo(() => {
    const base = presets.filter((p) => Number(p.disabled) !== 1).map((p) => ({ value: p.label, label: p.label }));
    const seen = new Set(base.map((o) => o.value));
    // 兼容旧自由文本留下的类型值：不在当前预设里也补一个可选项，否则编辑时无从选中
    const legacy = formTypes.filter((t) => !seen.has(t)).map((t) => ({ value: t, label: t }));
    return [...legacy, ...base];
  }, [presets, formTypes]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["fmReplacementRecords", { siteId: siteId || undefined }] as const,
    queryFn: () => fetchAllReplacements(siteId),
    placeholderData: (prev) => prev,
  });

  const total = Number(data?.total ?? 0);
  const rows = (data?.rows ?? []) as Row[];

  const groups = useMemo(
    () =>
      groupByCategory(
        rows,
        (row) => presetLabel(pick(row, "filterType", "filter_type")) || "未分类",
        (row) => formatDateTimeAsiaShanghai(pick(row, "replacedAt", "replaced_at")).slice(0, 10),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, presets],
  );

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const applyQuick = (opt: QuickOption) => {
    const d = opt.data as { filterTypes?: string[]; siteId?: string; note?: string };
    setEditingId(null);
    setFormTypes((d.filterTypes ?? []).filter(Boolean));
    setFormSiteId(d.siteId || siteId || enabledSites[0]?.id || "");
    setFormNote(d.note ?? "");
    setFormAt(nowDate());
    setFormOpen(true);
  };

  const persistQuick = (list: QuickOption[]) => {
    setQuickOptions(list);
    saveQuickOptions(QUICK_KEY, list);
  };

  const saveAsQuick = () => {
    if (formTypes.length === 0 || !formSiteId) {
      toast.error("先选好更换类型和机房，再存为快捷项");
      return;
    }
    const siteName = enabledSites.find((s) => s.id === formSiteId)?.name ?? "";
    persistQuick([
      ...quickOptions,
      {
        id: String(Date.now()),
        label: `${formTypes.join(" + ")} · ${siteName}`,
        data: { filterTypes: formTypes, siteId: formSiteId, note: formNote.trim() },
      },
    ]);
    toast.success("已存为快捷项");
  };

  /** 编辑态只保留一个类型（单条记录只有一个 filterType） */
  const onTypesChange = (next: string[]) => setFormTypes(editingId ? next.slice(-1) : next);

  const openNew = (group?: LedgerGroup<Row>) => {
    setEditingId(null);
    if (group) {
      // 组内新增：继承该分类最近一条的机房与备注，类型锁定为当前分类
      const last = group.latest;
      setFormTypes([presetLabel(pick(last, "filterType", "filter_type"))].filter(Boolean));
      setFormSiteId(str(pick(last, "siteId", "site_id")) || siteId || enabledSites[0]?.id || "");
      setFormNote(str(last.note));
    } else {
      setFormTypes([]);
      setFormSiteId(siteId || enabledSites[0]?.id || "");
      setFormNote("");
    }
    setFormAt(nowDate());
    setFormOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditingId(String(row.id));
    setFormTypes([presetLabel(pick(row, "filterType", "filter_type"))].filter(Boolean));
    setFormSiteId(str(pick(row, "siteId", "site_id")));
    setFormAt(toDateInput(pick(row, "replacedAt", "replaced_at")));
    setFormNote(str(row.note));
    setFormOpen(true);
  };

  const save = async () => {
    if (formTypes.length === 0) {
      toast.error("请至少选择一个更换类型");
      return;
    }
    if (!formSiteId) {
      toast.error("请选择机房");
      return;
    }
    if (!formAt) {
      toast.error("请选择更换日期");
      return;
    }
    const replacedAt = toBackendDatetime(formAt);
    const note = formNote.trim() || undefined;
    setSaving(true);
    try {
      // 降级全部失败时保持弹层打开，别让用户丢掉已填内容
      let closeOnDone = true;
      if (editingId) {
        await patchFmReplacementRecord(editingId, {
          siteId: formSiteId,
          filterType: formTypes[0],
          replacedAt,
          note,
        });
        toast.success("已保存");
      } else if (formTypes.length === 1) {
        // 单项：走单条端点（与小程序一致）
        await createFmReplacementRecord({ siteId: formSiteId, filterType: formTypes[0], replacedAt, note });
        toast.success("已添加");
      } else {
        // 多项：优先 batch，失败降级逐条
        try {
          await createFmReplacementBatch({ siteId: formSiteId, filterTypes: formTypes, replacedAt, note });
          toast.success(`已添加 ${formTypes.length} 条`);
        } catch {
          let ok = 0;
          let fail = 0;
          for (const ft of formTypes) {
            try {
              await createFmReplacementRecord({ siteId: formSiteId, filterType: ft, replacedAt, note });
              ok += 1;
            } catch {
              fail += 1;
            }
          }
          const summary = `成功 ${ok} 条，失败 ${fail} 条`;
          if (fail > 0) toast.error(summary);
          else toast.success(summary);
          closeOnDone = ok > 0;
        }
      }
      if (closeOnDone) setFormOpen(false);
      qc.invalidateQueries({ queryKey: ["fmReplacementRecords"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Row) => {
    if (!(await appConfirm("确定删除该更换记录？此操作不可恢复。", { danger: true }))) return;
    try {
      await deleteFmReplacementRecord(String(row.id));
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["fmReplacementRecords"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const blob = await exportFmExcel("replacements");
      downloadBlob(blob, `facility-maintenance-replacements-${Date.now()}.xlsx`);
      toast.success("已导出（按更换类型分组）");
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
      const r = await importFmExcel(f, "replacements");
      toast.success(`已导入更换 ${r.replacements} 条`);
      qc.invalidateQueries({ queryKey: ["fmReplacementRecords"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // 四态：loading 交给 DataSkeleton，error/empty 交给 AdminTableShell
  const errorMessage = error ? (error as Error).message || "加载更换记录失败" : null;

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

      {/* 表格：唯一滚动区，按更换类型分组 */}
      <AdminFillScrollRegion className="px-3 py-3">
        {isLoading ? (
          <DataSkeleton variant="table" rows={6} />
        ) : (
          <AdminTableShell
            error={errorMessage}
            onRetry={() => void refetch()}
            empty={!error && rows.length === 0}
            emptyMessage="暂无更换记录，点击「新增」创建。"
          >
            <table className="twin-table w-full min-w-[760px]">
              <thead>
                <tr>
                  <th>更换类型</th>
                  <th>机房</th>
                  <th>更换日期</th>
                  <th>距上次(天)</th>
                  <th>备注</th>
                  <th>操作人</th>
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
                        <td colSpan={7} className="px-3 py-2">
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
                              {presetLabel(pick(row, "filterType", "filter_type"))}
                            </td>
                            <td className="min-w-[7rem] whitespace-normal break-words px-3 py-2">
                              {str(pick(row, "siteName", "site_name"))}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {formatDateTimeAsiaShanghai(pick(row, "replacedAt", "replaced_at")).slice(0, 10)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-[var(--twin-mute)]">
                              {pick(row, "daysSincePrevious", "days_since_previous") != null
                                ? String(pick(row, "daysSincePrevious", "days_since_previous"))
                                : "-"}
                            </td>
                            <td className="max-w-[16rem] whitespace-normal break-words px-3 py-2">{str(row.note)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-[var(--twin-mute)]">
                              {str(pick(row, "createdByName", "created_by_name")) || "—"}
                            </td>
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
        ariaLabel="更换记录"
        title={editingId ? "编辑更换记录" : "新增更换记录"}
        className="max-w-[min(680px,96vw)]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <AdminFormGrid>
            <AdminFormField
              label="更换类型"
              fullWidth
              hint={editingId ? "单条记录只能有一个类型" : "可多选，一次提交多条更换记录"}
            >
              <AdminTagCheckboxGroup options={typeOptions} value={formTypes} onChange={onTypesChange} />
            </AdminFormField>
            <AdminFormField label="更换日期">
              <AdminFormInput
                type="date"
                value={formAt}
                disabled={saving}
                onChange={(e) => setFormAt(e.target.value)}
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
            <AdminFormField label="备注" fullWidth>
              <AdminFormInput value={formNote} disabled={saving} onChange={(e) => setFormNote(e.target.value)} />
            </AdminFormField>
          </AdminFormGrid>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--twin-hairline)] px-4 py-3">
          <button
            type="button"
            className={toolbarBtn}
            disabled={saving}
            onClick={saveAsQuick}
          >
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
