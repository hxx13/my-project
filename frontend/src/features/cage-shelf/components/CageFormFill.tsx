import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { appPrompt } from "@/lib/appDialog";
import {
  fetchCageTemplate,
  fetchCageInfoValues,
  updateCageInfoValues,
  fetchCageInfoCodelist,
  type CageTemplateDetail,
  type CageTemplateField,
  type CageClaimInfoValue,
} from "../api/cageForm.api";
import { fetchCageOpEditable, fetchCageOpFieldOptions, addCageOpFieldOption } from "@/api/domains/cageShelf.api";
import { AdminSearchSelect } from "@/components/admin/AdminSearchSelect";
import { CAGE_FORM_KEY } from "../cageFormConstants";

type CodelistOptions = Record<string, { value: string; label: string }[]>;

/** 字段是否声明了动态选项源（config.optionsSource），如动物品系取该笼位 AUP 白名单 */
function optionsSourceOf(field: CageTemplateField): string | null {
  if (!field.config) return null;
  try {
    const c = JSON.parse(field.config) as { optionsSource?: unknown };
    return typeof c?.optionsSource === "string" ? c.optionsSource : null;
  } catch {
    return null;
  }
}

/** 选择题模式（config.choiceType）：multiple = 多值，存 value_json 数组 */
function choiceTypeOf(field: CageTemplateField): string | null {
  if (!field.config) return null;
  try {
    const c = JSON.parse(field.config) as { choiceType?: unknown };
    return typeof c?.choiceType === "string" ? c.choiceType : null;
  } catch {
    return null;
  }
}

const isMultiChoiceField = (field: CageTemplateField) => choiceTypeOf(field) === "multiple";

/** 从模板结构平铺出所有字段（去重，保留 section/subsection 归属） */
export function flattenFields(template: CageTemplateDetail): Array<{ section: string; subsection?: string; field: CageTemplateField }> {
  const out: Array<{ section: string; subsection?: string; field: CageTemplateField }> = [];
  for (const s of template.sections ?? []) {
    for (const sub of s.subsections ?? []) {
      for (const f of sub.fields ?? []) out.push({ section: s.label || s.code, subsection: sub.label || sub.code, field: f });
    }
    for (const f of s.fields ?? []) out.push({ section: s.label || s.code, field: f });
  }
  return out;
}

/** 接口错误转文案：权限失败单独点名，避免和「表单未发布」混为一谈（历史上二者都渲染成后者）。 */
function errText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/403|无权限|未登录|登录已过期/.test(msg)) return `无权读取表单：${msg || "403"}`;
  return msg || "表单加载失败";
}

/**
 * 笼位详情内联填表：读取已发布组合模板（cage_detail，status=FROZEN）的三级结构。
 * 值读写走「笼位级表单值」GET/PUT。默认只读，`editable` 为 true 时提供「编辑」进入编辑态，
 * 保存只提交相对载入初值有变化的字段（避免把未改动的已同步字段提交成 null 而误删）。
 */
export default function CageFormFill({
  animalCageId,
  claimed = false,
  editable = false,
}: {
  animalCageId: number | string | null;
  /** 是否已有认领记录（认领流程的领地；与「一键认领」入口互斥） */
  claimed?: boolean;
  editable?: boolean;
}) {
  const [template, setTemplate] = useState<CageTemplateDetail | null>(null);
  const [codelists, setCodelists] = useState<CodelistOptions>({});
  /** 动态选项（canonical → 选项），按笼位现算，如动物品系 */
  const [dynOptions, setDynOptions] = useState<CodelistOptions>({});
  /** 字段配置开关（canonical → 能否手输 / 能否新增预设），随选项一起从后端下发 */
  const [dynFlags, setDynFlags] = useState<Record<string, { allowAddOption?: boolean; allowManualInput?: boolean }>>({});
  /** 正在新增预设的字段（防重复点击） */
  const [addingOption, setAddingOption] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  /** 服务端判定：该笼位当前用户能否编辑（与分笼/转移同源：管理员+/额外身份/认领人/实验员本人） */
  const [serverEditable, setServerEditable] = useState(false);
  const initialValues = useRef<Record<string, unknown>>({});

  useEffect(() => {
    if (animalCageId == null) {
      setServerEditable(false);
      return;
    }
    let cancelled = false;
    fetchCageOpEditable(animalCageId)
      .then((r) => {
        if (!cancelled) setServerEditable(r.editable);
      })
      .catch(() => {
        if (!cancelled) setServerEditable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [animalCageId]);

  /** 可编辑 = 调用方给的模式权限 或 服务端按笼位判定（学生认领后即可编辑自己的笼位） */
  const canEdit = editable || serverEditable;

  // 载入发布模板 + 当前笼位的表单值（两个请求一起收敛，避免 loading 早于模板落地）
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    setEditing(false);
    let cancelled = false;
    void Promise.allSettled([
      fetchCageTemplate(CAGE_FORM_KEY),
      animalCageId != null ? fetchCageInfoValues(animalCageId) : Promise.resolve([]),
    ]).then(([tplRes, valRes]) => {
      if (cancelled) return;
      if (tplRes.status === "fulfilled") {
        setTemplate(tplRes.value);
      } else {
        setTemplate(null);
        setLoadError(errText(tplRes.reason));
      }
      if (valRes.status === "fulfilled") {
        const m: Record<string, unknown> = {};
        for (const r of valRes.value) m[r.canonical] = r.value;
        initialValues.current = m;
        setValues(m);
      } else {
        initialValues.current = {};
        setValues({});
        // 模板读到了但值没读到，才把值的错误暴露出来（否则模板错误已经更能说明问题）
        if (tplRes.status === "fulfilled") setLoadError(errText(valRes.reason));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
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

  // 载入字段候选（按笼位现算）+ 配置开关。
  // combo 题型即使没有 optionsSource 也要拉 —— 它的候选可能来自字段自己的码表，
  // 而且「能否新增预设」这个开关只有后端知道。
  useEffect(() => {
    if (!template || animalCageId == null) {
      setDynOptions({});
      setDynFlags({});
      return;
    }
    const targets = flattenFields(template)
      .map(({ field }) => field)
      .filter((f) => optionsSourceOf(f) != null || f.fieldType === "combo");
    if (targets.length === 0) {
      setDynOptions({});
      setDynFlags({});
      return;
    }
    let cancelled = false;
    (async () => {
      const m: CodelistOptions = {};
      const fl: Record<string, { allowAddOption?: boolean; allowManualInput?: boolean }> = {};
      for (const f of targets) {
        try {
          const r = await fetchCageOpFieldOptions(animalCageId, f.canonical);
          m[f.canonical] = r.options ?? [];
          fl[f.canonical] = { allowAddOption: r.allowAddOption, allowManualInput: r.allowManualInput };
        } catch {
          m[f.canonical] = [];
        }
      }
      if (!cancelled) {
        setDynOptions(m);
        setDynFlags(fl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [template, animalCageId]);

  const setValue = (canonical: string, value: unknown) => setValues((v) => ({ ...v, [canonical]: value }));

  /**
   * 新增候选（浮层底部那一行触发的）。
   * 写进字段码表还是该笼位所属 AUP 的白名单，由后端按字段配置决定；
   * 后端返回刷新后的选项，直接替换本地那份，不额外再拉一次。
   * 浮层里没字时会先弹窗问名称 —— 新增候选 ≠ 给这个字段赋值，两者是分开的。
   */
  const handleAddOption = async (field: CageTemplateField, typed: string) => {
    if (animalCageId == null) return;
    const input = typed || (await appPrompt("新增候选名称", "", {
      title: "新增候选",
      placeholder: "要加进候选的名称",
      confirmText: "新增",
    }));
    const label = (input ?? "").trim();
    if (!label) return;
    setAddingOption(field.canonical);
    try {
      const r = await addCageOpFieldOption(animalCageId, field.canonical, label);
      setDynOptions((p) => ({ ...p, [field.canonical]: r.options ?? [] }));
      setDynFlags((p) => ({
        ...p,
        [field.canonical]: { allowAddOption: r.allowAddOption, allowManualInput: r.allowManualInput },
      }));
      toast.success(`已加入候选：${label}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "新增预设失败");
    } finally {
      setAddingOption(null);
    }
  };

  const handleSave = async () => {
    if (animalCageId == null || fields.length === 0) return;
    setSaving(true);
    try {
      const payload: CageClaimInfoValue[] = [];
      for (const { field } of fields) {
        const raw = values[field.canonical];
        const init = initialValues.current[field.canonical];
        // 多值字段比较内容而非引用：取消勾选回到原集合时不应伪造成「有改动」
        if (Array.isArray(raw) || Array.isArray(init)) {
          if (JSON.stringify(raw ?? []) === JSON.stringify(init ?? [])) continue;
          payload.push({ fieldId: field.fieldId, value: Array.isArray(raw) ? raw.map(String) : [] });
          continue;
        }
        if (raw === init) continue;
        payload.push({
          fieldId: field.fieldId,
          value: typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? raw : null,
        });
      }
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
  if (loadError) return <div className="py-3 text-center text-[11px] text-[var(--twin-danger,#ef4444)]">{loadError}</div>;
  if (!template) return <div className="py-3 text-center text-[11px] text-[var(--twin-mute)]">表单未发布</div>;
  if (template.status !== "FROZEN") return <div className="py-3 text-center text-[11px] text-[var(--twin-mute)]">表单未发布（当前状态：{template.status}）</div>;
  if (fields.length === 0) return <div className="py-3 text-center text-[11px] text-[var(--twin-mute)]">表单无字段</div>;

  const isChoice = (field: CageTemplateField) => field.dictKey || optionsSourceOf(field) != null || field.fieldType === "select" || field.fieldType === "choice" || field.fieldType === "cascade";

  /** 字段选项：后端现算过就用它（含新增预设后的刷新结果），否则退回静态码表 */
  const optionsFor = (field: CageTemplateField) =>
    dynOptions[field.canonical] ?? (codelists[field.dictKey ?? ""] ?? []);

  /** 该字段是否允许在填写时新增预设（后端最终还会再拦一道） */
  const canAddOption = (field: CageTemplateField) => !!dynFlags[field.canonical]?.allowAddOption;

  /** 自动获取字段（role 非 VALUE）：只决定角标，不再决定能否编辑。 */
  const isAuto = (field: CageTemplateField) => field.role != null && field.role !== "VALUE";

  /**
   * 能否人工修改 — 只看 editable（与 role 解耦，由字段管理页配置）。
   * 字段未下发 editable 时回退旧口径（role=VALUE 可改），避免旧接口把整表锁死。
   */
  const canEditField = (field: CageTemplateField) =>
    field.editable ?? (field.role == null || field.role === "VALUE");

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
    if (Array.isArray(val)) {
      if (val.length === 0) return "-";
      const opts = optionsFor(field);
      return val.map((v) => opts.find((o) => o.value === String(v))?.label ?? String(v)).join("、");
    }
    if (ft === "checkbox") return val === true ? "是" : "否";
    if (isChoice(field)) {
      const opt = optionsFor(field).find((o) => o.value === String(val));
      return opt ? opt.label : String(val);
    }
    return String(val);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        {claimed && (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ background: "#16a34a18", color: "#16a34a", border: "1px solid #16a34a40" }}
          >
            已认领
          </span>
        )}
        {editing ? (
          <span className="text-[9px] text-[var(--twin-warning)]">编辑中 · 保存仅提交有改动的字段</span>
        ) : (
          <span className="text-[9px] text-[var(--twin-mute)]">
            {canEdit ? "只读 · 点「编辑」可修改" : "只读"}
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
                <span className="text-[10px] tracking-[0.06em] text-[var(--twin-mute)]">
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
                {!editing || !canEditField(field) ? (
                  <span className="text-[12px] font-semibold text-[var(--twin-ink)] font-variant-numeric tabular-nums">{readOnlyValue(field)}</span>
                ) : isMultiChoiceField(field) ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {optionsFor(field).map((o) => {
                      const arr = Array.isArray(val) ? (val as unknown[]).map(String) : [];
                      const on = arr.includes(o.value);
                      return (
                        <label key={o.value} className="flex items-center gap-1 text-[11px] text-[var(--twin-ink)]">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => setValue(field.canonical, on ? arr.filter((v) => v !== o.value) : [...arr, o.value])}
                            className="h-3.5 w-3.5 accent-[var(--twin-primary)]"
                          />
                          {o.label}
                        </label>
                      );
                    })}
                    {optionsFor(field).length === 0 && <span className="text-[10px] text-[var(--twin-mute)]">无可选项（该笼位未关联 AUP）</span>}
                  </div>
                ) : ft === "combo" ? (
                  /* 输入框 + 候选：复用通用 AdminSearchSelect（可直接输入，也可从候选点选）。
                     它的浮层走 Portal + fixed，不会被表单所在的弹窗/滚动容器裁掉。
                     「新增候选」作为浮层底部的一行并入候选列表 —— 不另挂按钮，
                     否则分不清用户是手敲的还是刚从候选选的，会诱导重复新增。 */
                  <AdminSearchSelect
                    value={typeof val === "string" ? val : ""}
                    onChange={(v) => setValue(field.canonical, v)}
                    options={optionsFor(field).map((o) => o.value)}
                    placeholder={optionsFor(field).length > 0 ? "可直接输入，或从候选中选" : "直接输入"}
                    className="rounded-twin-md border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] shadow-none"
                    onAddOption={canAddOption(field) ? (name) => void handleAddOption(field, name) : undefined}
                    addOptionLabel={addingOption === field.canonical ? "新增中" : "新增"}
                  />
                ) : isChoice(field) ? (
                  <select
                    value={typeof val === "string" ? val : ""}
                    onChange={(e) => setValue(field.canonical, e.target.value)}
                    className="w-full rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-ink)]"
                  >
                    <option value="">—</option>
                    {(optionsFor(field)).map((o) => (
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

      {canEdit && (
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
