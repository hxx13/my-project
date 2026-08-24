import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  fetchCageTemplate,
  fetchCageInfoValues,
  updateCageInfoValues,
  fetchCageInfoCodelist,
  type CageTemplateDetail,
  type CageTemplateField,
} from "../api/cageForm.api";
import { CAGE_FORM_KEY } from "../cageFormConstants";

type CodelistOptions = Record<string, { value: string; label: string }[]>;

/** 从模板结构平铺出所有字段（去重，保留 section/subsection 归属） */
function flattenFields(template: CageTemplateDetail): Array<{ section: string; subsection?: string; field: CageTemplateField }> {
  const out: Array<{ section: string; subsection?: string; field: CageTemplateField }> = [];
  for (const s of template.sections ?? []) {
    for (const sub of s.subsections ?? []) {
      for (const f of sub.fields ?? []) out.push({ section: s.label || s.code, subsection: sub.label || sub.code, field: f });
    }
    for (const f of s.fields ?? []) out.push({ section: s.label || s.code, field: f });
  }
  return out;
}

/**
 * 笼位详情内联填表：读取已发布组合模板（cage_detail，status=FROZEN）的三级结构。
 * 值读写走「笼位级表单值」GET/PUT。默认只读，`editable` 为 true 时提供「编辑」进入编辑态，
 * 保存只提交相对载入初值有变化的字段（避免把未改动的已同步字段提交成 null 而误删）。
 */
export default function CageFormFill({
  animalCageId,
  claimed,
  editable = false,
}: {
  animalCageId: number | string | null;
  claimed?: boolean;
  editable?: boolean;
}) {
  const [template, setTemplate] = useState<CageTemplateDetail | null>(null);
  const [codelists, setCodelists] = useState<CodelistOptions>({});
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const initialValues = useRef<Record<string, unknown>>({});

  // 载入发布模板 + 当前笼位的表单值
  useEffect(() => {
    setLoading(true);
    fetchCageTemplate(CAGE_FORM_KEY)
      .then((t) => setTemplate(t))
      .catch(() => setTemplate(null));
    if (animalCageId != null) {
      fetchCageInfoValues(animalCageId)
        .then((rows) => {
          const m: Record<string, unknown> = {};
          for (const r of rows) m[r.canonical] = r.value;
          initialValues.current = m;
          setValues(m);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setValues({});
      setLoading(false);
    }
    setEditing(false);
  }, [animalCageId]);

  const fields = useMemo(() => (template ? flattenFields(template) : []), [template]);

  // 载入 dictKey 字段的码表选项
  useEffect(() => {
    if (!template) return;
    const keys = new Set<string>();
    for (const { field } of flattenFields(template)) if (field.dictKey) keys.add(field.dictKey);
    if (keys.size === 0) return;
    let cancelled = false;
    (async () => {
      const m: CodelistOptions = {};
      for (const k of Array.from(keys)) {
        try {
          const c = await fetchCageInfoCodelist(k);
          m[k] = (c.items ?? []).map((it) => ({ value: it.itemCode, label: it.itemLabel }));
        } catch {
          /* 码表缺失忽略 */
        }
      }
      if (!cancelled) setCodelists(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [template]);

  const setValue = (canonical: string, value: unknown) => setValues((v) => ({ ...v, [canonical]: value }));

  const handleSave = async () => {
    if (animalCageId == null || fields.length === 0) return;
    setSaving(true);
    try {
      const payload = fields
        .map(({ field }) => {
          const raw = values[field.canonical];
          const init = initialValues.current[field.canonical];
          if (raw === init) return null;
          const value: string | number | boolean | null =
            typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? raw : null;
          return { fieldId: field.fieldId, value };
        })
        .filter((x): x is { fieldId: number; value: string | number | boolean | null } => x !== null);
      if (payload.length === 0) {
        toast("没有改动");
        setSaving(false);
        return;
      }
      await updateCageInfoValues(animalCageId, payload);
      initialValues.current = { ...values };
      toast.success("已保存");
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setValues({ ...initialValues.current });
    setEditing(false);
  };

  if (loading) return <div className="py-3 text-center text-[11px] text-[var(--twin-mute)]">加载中…</div>;
  if (!template) return <div className="py-3 text-center text-[11px] text-[var(--twin-mute)]">表单未发布</div>;
  if (template.status !== "FROZEN") return <div className="py-3 text-center text-[11px] text-[var(--twin-mute)]">表单未发布（当前状态：{template.status}）</div>;
  if (fields.length === 0) return <div className="py-3 text-center text-[11px] text-[var(--twin-mute)]">表单无字段</div>;

  const isChoice = (field: CageTemplateField) => field.dictKey || field.fieldType === "select" || field.fieldType === "choice" || field.fieldType === "cascade";

  /** 自动获取只读字段：role 非 VALUE（DERIVED/PK/FK，发布时由表单配置决定），编辑态也不开放填写。 */
  const isAuto = (field: CageTemplateField) => field.role != null && field.role !== "VALUE";

  /** 占位标签：取值引擎未接入，只提示角色语义（不调用任何取号器）。 */
  const roleTagLabel = (field: CageTemplateField): string => {
    if (field.role === "PK") return "PK 取号";
    if (field.role === "FK") return "FK 实体";
    return "自动获取";
  };

  const readOnlyValue = (field: CageTemplateField): string => {
    const val = values[field.canonical];
    if (val === null || val === undefined || val === "") return "-";
    const ft = field.fieldType || (field.dictKey ? "select" : "text");
    if (ft === "checkbox") return val === true ? "是" : "否";
    if (isChoice(field)) {
      const opt = (codelists[field.dictKey ?? ""] ?? []).find((o) => o.value === String(val));
      return opt ? opt.label : String(val);
    }
    return String(val);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={claimed
            ? { background: "#16a34a18", color: "#16a34a", border: "1px solid #16a34a40" }
            : { background: "#64748b18", color: "#64748b", border: "1px solid #64748b40" }}
        >
          {claimed ? "已认领" : "未认领"}
        </span>
        {editing ? (
          <span className="text-[9px] text-[var(--twin-warning)]">编辑中 · 保存仅提交有改动的字段</span>
        ) : (
          <span className="text-[9px] text-[var(--twin-mute)]">
            {editable ? "只读 · 点「编辑」可修改" : "只读"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {fields.map(({ section, subsection, field }) => {
          const val = values[field.canonical];
          const ft = field.fieldType || (field.dictKey ? "select" : "text");
          const isWide = ft === "textarea" || ft === "richText";
          return (
            <div key={field.fieldId} className={`rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5 ${isWide ? "col-span-2" : ""}`}>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[var(--twin-mute)]">
                  {field.label || field.canonical}
                  {field.required === "YES" && <span className="text-red-500"> *</span>}
                  {isAuto(field) && (
                    <span
                      className="ml-1 rounded px-1 text-[9px] font-semibold"
                      style={{ background: "#64748b18", color: "#64748b", border: "1px solid #64748b40" }}
                    >
                      {roleTagLabel(field)}
                    </span>
                  )}
                  {subsection ? <span className="ml-1 text-[9px] text-[var(--twin-mute)]/60">{subsection}</span> : null}
                </span>
                {!editing || isAuto(field) ? (
                  <span className="text-[12px] text-[var(--twin-ink)] font-variant-numeric tabular-nums">{readOnlyValue(field)}</span>
                ) : isChoice(field) ? (
                  <select
                    value={typeof val === "string" ? val : ""}
                    onChange={(e) => setValue(field.canonical, e.target.value)}
                    className="w-full rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-ink)]"
                  >
                    <option value="">—</option>
                    {(codelists[field.dictKey ?? ""] ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : ft === "checkbox" ? (
                  <input
                    type="checkbox"
                    checked={val === true}
                    onChange={(e) => setValue(field.canonical, e.target.checked)}
                    className="h-4 w-4 accent-[var(--twin-primary)]"
                  />
                ) : ft === "number" ? (
                  <input
                    type="number"
                    value={typeof val === "number" ? val : ""}
                    onChange={(e) => setValue(field.canonical, Number.isNaN(e.target.valueAsNumber) ? null : e.target.valueAsNumber)}
                    className="w-full rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-ink)]"
                  />
                ) : ft === "date" || ft === "dateRange" ? (
                  <input
                    type="date"
                    value={typeof val === "string" ? val : ""}
                    onChange={(e) => setValue(field.canonical, e.target.value)}
                    className="w-full rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-ink)]"
                  />
                ) : ft === "textarea" || ft === "richText" ? (
                  <textarea
                    rows={3}
                    value={typeof val === "string" ? val : ""}
                    onChange={(e) => setValue(field.canonical, e.target.value)}
                    className="w-full rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-ink)]"
                  />
                ) : (
                  <input
                    type="text"
                    value={typeof val === "string" ? val : ""}
                    onChange={(e) => setValue(field.canonical, e.target.value)}
                    className="w-full rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-ink)]"
                  />
                )}
              </label>
            </div>
          );
        })}
      </div>

      {editable && (
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-twin-md px-3 py-1 text-[11px] font-semibold bg-[var(--twin-primary)] text-[var(--twin-on-primary)] hover:brightness-95 disabled:opacity-50 transition"
              >
                {saving ? "保存中..." : "保存"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="rounded-twin-md px-3 py-1 text-[11px] font-semibold border border-[var(--twin-hairline-strong)] text-[var(--twin-ink)] hover:bg-[var(--twin-canvas-soft-2)] disabled:opacity-50 transition"
              >
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-twin-md px-3 py-1 text-[11px] font-semibold border border-[var(--twin-hairline-strong)] text-[var(--twin-ink)] hover:bg-[var(--twin-canvas-soft-2)] transition"
            >
              编辑
            </button>
          )}
        </div>
      )}
    </div>
  );
}
