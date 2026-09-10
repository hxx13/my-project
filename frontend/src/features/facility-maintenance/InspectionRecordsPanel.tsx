import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  createFmInspectionRecord,
  deleteFmInspectionRecord,
  fetchFmInspectionRecords,
  patchFmInspectionRecord,
  type FmTemplate,
  type FmTemplateItem,
} from "@/api/domains/facilityMaintenance.api";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { AdminCenteredPanelShell } from "@/components/admin/AdminCenteredPanelShell";
import {
  AdminFillScrollRegion,
  AdminTableShell,
} from "@/components/admin/AdminPageShell";
import {
  AdminFormField,
  AdminFormGrid,
  AdminFormInput,
  AdminFormSelect,
} from "@/components/admin/AdminFormPrimitives";
import { appConfirm } from "@/lib/appDialog";
import { formatDateTimeAsiaShanghai } from "@/lib/formatDateTimeAsiaShanghai";
import { PaginationBar } from "@/features/facility-maintenance/shared/PaginationBar";
import { TemplateItemFields } from "@/features/facility-maintenance/shared/TemplateItemFields";
import { normalizeCells } from "@/features/facility-maintenance/inspectionPayload";

/* ================================================================== */
/*  InspectionRecordsPanel — 巡查 tab 左栏「单笔记录」                    */
/*  自持列表数据（本地 state + reload），分页/机房筛选作为请求参数。       */
/*  不引入 React Query；矩阵保存算法与本组件无关。                        */
/* ================================================================== */

export type InspectionRecordsPanelProps = {
  sites: { id: string; name: string }[];
  templates: FmTemplate[];
  selectedSiteId?: string;
};

/** 列表行（后端 SQL 字段已固定，无 templateName） */
type RecordRow = {
  id: string;
  siteId: string;
  siteName: string;
  templateId: string;
  inspectedAt: string;
  operatorName: string;
  values: Record<string, string>;
};

const PAGE_SIZE = 20;

function toRow(raw: Record<string, unknown>): RecordRow {
  return {
    id: String(raw.id ?? ""),
    siteId: raw.siteId == null ? "" : String(raw.siteId),
    siteName: raw.siteName == null ? "" : String(raw.siteName),
    templateId: raw.templateId == null ? "" : String(raw.templateId),
    inspectedAt: raw.inspectedAt == null ? "" : String(raw.inspectedAt),
    operatorName: raw.operatorName == null ? "" : String(raw.operatorName),
    values: normalizeCells(raw.values),
  };
}

/** 后端时间（可带秒/空格分隔）→ datetime-local 的 `YYYY-MM-DDTHH:mm` */
function toDatetimeLocal(raw: unknown): string {
  const s = String(raw ?? "").trim().replace(" ", "T");
  return s.length >= 16 ? s.slice(0, 16) : s;
}

function nowDatetimeLocal(): string {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

const DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * BOOLEAN 项没有值（缺失或空串）时补 "false"，避免开关显示 OFF 却因空值触发必填校验。
 * 记录回填的已有值（"true"/"false"）原样保留，其余字段不动。
 */
function withBooleanDefaults(items: FmTemplateItem[], values: Record<string, string>): Record<string, string> {
  const out = { ...values };
  for (const it of items) {
    if (String(it.fieldType || "").toUpperCase() !== "BOOLEAN") continue;
    const id = String(it.id ?? "");
    if (!id) continue;
    if ((out[id] ?? "").trim() === "") out[id] = "false";
  }
  return out;
}

export function InspectionRecordsPanel({ sites, templates, selectedSiteId }: InspectionRecordsPanelProps) {
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteFilter, setSiteFilter] = useState(selectedSiteId ?? "");

  // 弹层表单
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [formSiteId, setFormSiteId] = useState("");
  const [formTemplateId, setFormTemplateId] = useState("");
  const [formInspectedAt, setFormInspectedAt] = useState("");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const templateById = useMemo(() => {
    const m = new Map<string, FmTemplate>();
    for (const t of templates) m.set(t.id, t);
    return m;
  }, [templates]);

  const templateNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of templates) m.set(t.id, t.name);
    return m;
  }, [templates]);

  const formItems: FmTemplateItem[] = formTemplateId ? templateById.get(formTemplateId)?.items ?? [] : [];

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchFmInspectionRecords({ siteId: siteFilter || undefined, page, size });
      setRows(((d?.rows as Record<string, unknown>[]) || []).map(toRow));
      setTotal(Number(d?.total ?? 0));
    } catch (e) {
      setError((e as Error).message || "加载单笔巡查记录失败");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [siteFilter, page, size]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 父级传入的机房过滤变化时同步（本地筛选仍可继续改）
  useEffect(() => {
    setSiteFilter(selectedSiteId ?? "");
  }, [selectedSiteId]);

  const openNew = () => {
    setEditing(null);
    setFormSiteId(siteFilter || sites[0]?.id || "");
    setFormTemplateId("");
    setFormInspectedAt(nowDatetimeLocal());
    setFormValues({});
    setDialogOpen(true);
  };

  const openEdit = (row: RecordRow) => {
    setEditing(row);
    setFormSiteId(row.siteId);
    setFormTemplateId(row.templateId);
    setFormInspectedAt(toDatetimeLocal(row.inspectedAt));
    setFormValues(withBooleanDefaults(templateById.get(row.templateId)?.items ?? [], row.values));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving) return;
    setDialogOpen(false);
  };

  const setField = (itemId: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [itemId]: value }));
  };

  const save = async () => {
    if (!formSiteId) {
      toast.error("请选择机房");
      return;
    }
    if (!editing && !formTemplateId) {
      toast.error("请选择巡查模板");
      return;
    }
    const at = formInspectedAt.trim();
    if (!at) {
      toast.error("请填写巡查时间");
      return;
    }
    if (!DATETIME_LOCAL_RE.test(at)) {
      toast.error("巡查时间格式不正确");
      return;
    }
    for (const it of formItems) {
      const id = String(it.id ?? "");
      const v = (formValues[id] ?? "").trim();
      // 必填判定与 TemplateItemFields 一致：requiredFlag===1 || required===true
      if ((it.requiredFlag === 1 || it.required === true) && v === "") {
        toast.error(`请填写必填项：${it.label}`);
        return;
      }
      if (String(it.fieldType || "").toUpperCase() === "NUMBER" && v !== "" && Number.isNaN(Number(v))) {
        toast.error(`「${it.label}」需填写数字`);
        return;
      }
    }

    setSaving(true);
    try {
      const body = { siteId: formSiteId, templateId: formTemplateId || null, inspectedAt: at, values: formValues };
      if (editing) {
        await patchFmInspectionRecord(editing.id, body);
        toast.success("已保存");
      } else {
        await createFmInspectionRecord(body);
        toast.success("已新增");
      }
      setDialogOpen(false);
      await reload();
    } catch (e) {
      toast.error((e as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: RecordRow) => {
    if (!(await appConfirm("确定删除该单笔巡查记录？此操作不可恢复。", { danger: true }))) return;
    try {
      await deleteFmInspectionRecord(row.id);
      toast.success("已删除");
      await reload();
    } catch (e) {
      toast.error((e as Error).message || "删除失败");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">
      {/* 操作行：固定区 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--twin-hairline)] px-2 py-2">
        <AdminSelect
          className="min-w-0 flex-1"
          aria-label="按机房筛选"
          value={siteFilter}
          onChange={(e) => {
            setSiteFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部机房</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </AdminSelect>
        <button
          type="button"
          className="shrink-0 rounded-lg bg-[var(--app-color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--app-color-accent)]/90"
          onClick={openNew}
        >
          新增单笔记录
        </button>
      </div>

      {/* 表格：唯一滚动区 */}
      <AdminFillScrollRegion className="p-2">
        <AdminTableShell
          loading={loading}
          error={error}
          onRetry={() => void reload()}
          empty={!loading && !error && rows.length === 0}
          emptyMessage="暂无单笔巡查记录，点击「新增单笔记录」创建。"
        >
          <table className="w-full min-w-[560px] border-collapse text-sm twin-table">
            <thead>
              <tr>
                <th>模板</th>
                <th>巡查时间</th>
                <th>机房</th>
                <th>操作人</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 align-middle">{templateNameById.get(row.templateId) || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 align-middle">{formatDateTimeAsiaShanghai(row.inspectedAt)}</td>
                  <td className="px-3 py-2 align-middle">{row.siteName || "—"}</td>
                  <td className="px-3 py-2 align-middle">{row.operatorName || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 align-middle">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="rounded-md border border-[var(--app-color-border-default)] px-2.5 py-1 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
                        onClick={() => openEdit(row)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-[var(--app-color-feedback-danger)] px-2.5 py-1 text-xs text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-feedback-danger-soft)]"
                        onClick={() => void remove(row)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableShell>
      </AdminFillScrollRegion>

      {/* 分页条：固定区 */}
      <div className="shrink-0 border-t border-[var(--twin-hairline)] px-2 py-2">
        <PaginationBar
          page={page}
          size={size}
          total={total}
          onPageChange={setPage}
          onSizeChange={(s) => {
            setSize(s);
            setPage(1);
          }}
          disabled={loading}
        />
      </div>

      {/* 新增 / 编辑弹层 */}
      <AdminCenteredPanelShell
        open={dialogOpen}
        onClose={closeDialog}
        ariaLabel="单笔巡查记录"
        title={editing ? "编辑单笔巡查记录" : "新增单笔巡查记录"}
        className="max-w-[min(640px,96vw)]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            <AdminFormField label="巡查模板">
              <AdminFormSelect
                value={formTemplateId}
                disabled={saving}
                onChange={(e) => {
                  // 换模板必须清空已填项，避免把旧模板的字段值带过去；BOOLEAN 项补 "false" 初值
                  const tid = e.target.value;
                  setFormTemplateId(tid);
                  setFormValues(withBooleanDefaults(templateById.get(tid)?.items ?? [], {}));
                }}
              >
                <option value=""></option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </AdminFormSelect>
            </AdminFormField>

            {formTemplateId ? (
              formItems.length > 0 ? (
                <TemplateItemFields
                  items={formItems}
                  values={formValues}
                  onChange={setField}
                  disabled={saving}
                />
              ) : (
                <p className="text-xs text-[var(--app-color-text-tertiary)]">该模板暂无巡查项。</p>
              )
            ) : null}

            <AdminFormGrid>
              <AdminFormField label="巡查时间">
                <AdminFormInput
                  type="datetime-local"
                  value={formInspectedAt}
                  disabled={saving}
                  onChange={(e) => setFormInspectedAt(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="机房">
                <AdminFormSelect
                  value={formSiteId}
                  disabled={saving}
                  onChange={(e) => setFormSiteId(e.target.value)}
                >
                  <option value=""></option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </AdminFormSelect>
              </AdminFormField>
            </AdminFormGrid>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--twin-hairline)] px-4 py-3">
          <button
            type="button"
            className="rounded-lg border border-[var(--app-color-border-default)] px-3 py-2 text-sm text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
            disabled={saving}
            onClick={closeDialog}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--app-color-accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--app-color-accent)]/90 disabled:opacity-50"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </AdminCenteredPanelShell>
    </div>
  );
}

export default InspectionRecordsPanel;
