import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus } from "lucide-react";

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
import { PaginationBar } from "@/features/facility-maintenance/shared/PaginationBar";
import { FmToolbar, type FmTabItem } from "@/features/facility-maintenance/shared/FmToolbar";

/* ================================================================== */
/*  ConsumablesTab — 设施检查维护「耗材」台账 tab                          */
/*  自持数据（React Query）：机房筛选/分页均为本地 state。                   */
/*  列表只认后端已有参数（siteId/page/size）。                              */
/* ================================================================== */

const PAGE_SIZE = 20;

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

/** 后端时间串 → datetime-local 需要的 `YYYY-MM-DDTHH:mm` */
function toDatetimeLocal(raw: unknown): string {
  const s = str(raw).trim().replace(" ", "T");
  return s.length >= 16 ? s.slice(0, 16) : s;
}

function nowDatetimeLocal(): string {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

/** datetime-local（16 位）→ 后端可解析的秒级墙钟串 */
function toBackendDatetime(v: string): string {
  const t = v.trim();
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

type ConsumablesTabProps = {
  tabs: FmTabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
};

export default function ConsumablesTab({ tabs, activeTab, onTabChange }: ConsumablesTabProps) {
  const qc = useQueryClient();

  // 列表筛选 / 分页（本地 state）
  const [siteId, setSiteId] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZE);
  const [exporting, setExporting] = useState(false);

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

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["fmConsumableLines", { siteId: siteId || undefined, page, size }] as const,
    queryFn: () => fetchFmConsumableLines({ siteId: siteId || undefined, page, size }),
    placeholderData: (prev) => prev,
  });

  const total = Number(data?.total ?? 0);
  const rows = (data?.rows ?? []) as Row[];

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

  const openNew = () => {
    setEditingId(null);
    setFormCatalogId("");
    setFormName("");
    setFormSiteId(siteId || enabledSites[0]?.id || "");
    setFormQty("1");
    setFormUnit("件");
    setFormOccurredAt(nowDatetimeLocal());
    setFormNote("");
    setFormOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditingId(String(row.id));
    setFormCatalogId("");
    setFormName(str(pick(row, "consumableName", "consumable_name")));
    setFormSiteId(str(pick(row, "siteId", "site_id")));
    setFormQty(str(row.qty));
    setFormUnit(str(row.unit));
    setFormOccurredAt(toDatetimeLocal(pick(row, "occurredAt", "occurred_at")));
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
      toast.success("已导出");
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
            onChange={(e) => {
              setSiteId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部</option>
            {enabledSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </AdminSelect>
        </div>
        <div className="min-w-0 flex-1" />
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
        <button type="button" className={toolbarBtnPrimary} onClick={openNew}>
          <span className="inline-flex items-center gap-1">
            <Plus className="h-4 w-4" /> 新增
          </span>
        </button>
      </FmToolbar>

      {/* 表格：唯一滚动区 */}
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
                  <th>发生时间</th>
                  <th>登记人</th>
                  <th>备注</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
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
                      {formatDateTimeAsiaShanghai(pick(row, "occurredAt", "occurred_at"))}
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
            </table>
          </AdminTableShell>
        )}
      </AdminFillScrollRegion>

      {/* 分页：固定区（PaginationBar 根节点自带 shrink-0） */}
      <div className="shrink-0 border-t border-[var(--twin-hairline)] px-3 py-2">
        <PaginationBar
          page={page}
          size={size}
          total={total}
          onPageChange={setPage}
          onSizeChange={(s) => {
            setSize(s);
            setPage(1);
          }}
          disabled={isFetching}
        />
      </div>

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
            <AdminFormField label="发生时间">
              <AdminFormInput
                type="datetime-local"
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

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--twin-hairline)] px-4 py-3">
          <button type="button" className={toolbarBtn} disabled={saving} onClick={() => setFormOpen(false)}>
            取消
          </button>
          <button type="button" className={toolbarBtnPrimary} disabled={saving} onClick={() => void save()}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </AdminCenteredPanelShell>
    </div>
  );
}
