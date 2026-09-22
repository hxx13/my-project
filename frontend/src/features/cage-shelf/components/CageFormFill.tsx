import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { appPrompt } from "@/lib/appDialog";
import {
  fetchCageInfoValues,
  updateCageInfoValues,
  type CageTemplateField,
  type CageClaimInfoValue,
} from "../api/cageForm.api";
import { fetchCageOpEditable, addCageOpFieldOption } from "@/api/domains/cageShelf.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { CageFieldEditor, canEditField, isChoiceField } from "./CageFieldEditor";
import { useCageFormAssets } from "./useCageFormAssets";

export { flattenFields } from "./CageFieldEditor";

/** 接口错误转文案：权限失败单独点名，避免和「表单未发布」混为一谈（历史上二者都渲染成后者）。 */
function errText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/403|无权限|未登录|登录已过期/.test(msg)) return `无权读取表单：${msg || "403"}`;
  return msg || "表单加载失败";
}

/**
 * 笼位详情内联填表：读取已发布组合模板（cage_detail，status=FROZEN）的三级结构。
 * 值读写走「笼位级表单值」GET/PUT。默认只读，可编辑时表头那一行给出「编辑/保存」。
 * 保存只提交相对载入初值有变化的字段（避免把未改动的已同步字段提交成 null 而误删）。
 *
 * 字段控件本身在 {@link CageFieldEditor}，「批量编辑」用的是同一个组件。
 */
export default function CageFormFill({
  animalCageId,
  claimed = false,
  editable = false,
  onBatchEdit,
}: {
  animalCageId: number | string | null;
  /** 是否已有认领记录（认领流程的领地；与「一键认领」入口互斥） */
  claimed?: boolean;
  editable?: boolean;
  /**
   * 提供后，编辑态里多一个「批量编辑」入口：把同一组字段值一次覆盖到多个笼位。
   * 由宿主页面实现「收起弹窗 → 进网格选择模式」（见 AdminCageShelfPage.enterBatchPick）；
   * 不传就不出这个按钮 —— 学生端/小程序那些没有网格多选的地方自然没有。
   */
  onBatchEdit?: (cageId: string) => void;
}) {
  const { template, templateError, loading: assetLoading, fields, optionsFor, dynFlags, setDynOptions, setDynFlags } =
    useCageFormAssets(animalCageId);

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [valuesLoading, setValuesLoading] = useState(true);
  const [valuesError, setValuesError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  /** 正在新增预设的字段（防重复点击） */
  const [addingOption, setAddingOption] = useState<string | null>(null);
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

  // 载入当前笼位的表单值
  useEffect(() => {
    setEditing(false);
    if (animalCageId == null) {
      initialValues.current = {};
      setValues({});
      setValuesError(null);
      setValuesLoading(false);
      return;
    }
    let cancelled = false;
    setValuesLoading(true);
    fetchCageInfoValues(animalCageId)
      .then((rows) => {
        if (cancelled) return;
        const m: Record<string, unknown> = {};
        for (const r of rows) m[r.canonical] = r.value;
        initialValues.current = m;
        setValues(m);
        setValuesError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        initialValues.current = {};
        setValues({});
        setValuesError(errText(e));
      })
      .finally(() => {
        if (!cancelled) setValuesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [animalCageId]);

  /** 可编辑 = 调用方给的模式权限 或 服务端按笼位判定（学生认领后即可编辑自己的笼位） */
  const canEdit = editable || serverEditable;

  const setValue = (canonical: string, value: unknown) => setValues((v) => ({ ...v, [canonical]: value }));

  /**
   * 新增候选（浮层底部那一行触发的）。
   * 落点是**该字段自己的码表**（AUP 的白名单是只读的，表单侧不回写 AUP）；
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

  const loading = assetLoading || valuesLoading;
  // 模板读不到时优先报模板的错误；模板读到了才把「值读不到」暴露出来
  const loadError = templateError ? errText(templateError) : valuesError;

  if (loading) return <div className="py-3 text-center text-[11px] text-[var(--twin-mute)]">加载中…</div>;
  if (loadError) return <div className="py-3 text-center text-[11px] text-[var(--twin-danger,#ef4444)]">{loadError}</div>;
  if (!template) return <div className="py-3 text-center text-[11px] text-[var(--twin-mute)]">表单未发布</div>;
  if (template.status !== "FROZEN") return <div className="py-3 text-center text-[11px] text-[var(--twin-mute)]">表单未发布（当前状态：{template.status}）</div>;
  if (fields.length === 0) return <div className="py-3 text-center text-[11px] text-[var(--twin-mute)]">表单无字段</div>;

  /** 该字段是否允许在填写时新增预设（后端最终还会再拦一道） */
  const canAddOption = (field: CageTemplateField) => !!dynFlags[field.canonical]?.allowAddOption;

  /** 自动获取字段（role 非 VALUE）：只决定角标，不再决定能否编辑。 */
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
    if (Array.isArray(val)) {
      if (val.length === 0) return "-";
      const opts = optionsFor(field);
      return val.map((v) => opts.find((o) => o.value === String(v))?.label ?? String(v)).join("、");
    }
    if (ft === "checkbox") return val === true ? "是" : "否";
    if (isChoiceField(field)) {
      const opt = optionsFor(field).find((o) => o.value === String(val));
      return opt ? opt.label : String(val);
    }
    return String(val);
  };

  return (
    <div className="space-y-3">
      {/* 表头一行：左边是状态提示，右边是编辑/保存 —— 两个按钮同处一行，且不在表单最底端 */}
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
        {canEdit && (
          <div className="ml-auto flex items-center gap-1.5">
            {editing ? (
              <>
                <AdminButton type="button" size="xs" disabled={saving} onClick={handleSave}>
                  {saving ? "保存中..." : "保存"}
                </AdminButton>
                <AdminButton type="button" tone="secondary" size="xs" disabled={saving} onClick={cancelEdit}>
                  取消
                </AdminButton>
                {onBatchEdit && animalCageId != null && (
                  <AdminButton
                    type="button"
                    tone="secondary"
                    size="xs"
                    onClick={() => onBatchEdit(String(animalCageId))}
                    title="把同一组字段值一次覆盖到多个笼位：先选笼位，再填字段"
                  >
                    批量编辑
                  </AdminButton>
                )}
              </>
            ) : (
              <AdminButton type="button" tone="secondary" size="xs" onClick={() => setEditing(true)}>
                编辑
              </AdminButton>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {fields.map(({ subsection, field }) => {
          const val = values[field.canonical];
          const isWide = field.fieldType === "textarea" || field.fieldType === "richText";
          return (
            <div
              key={field.fieldId}
              className={`rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5 ${isWide ? "col-span-2" : ""}`}
            >
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
                  {subsection ? <span className="ml-1 text-[9px] text-[color-mix(in_srgb,var(--twin-mute)_60%,transparent)]">{subsection}</span> : null}
                </span>
                {!editing || !canEditField(field) ? (
                  <span className="text-[12px] font-semibold text-[var(--twin-ink)] font-variant-numeric tabular-nums">{readOnlyValue(field)}</span>
                ) : (
                  <CageFieldEditor
                    field={field}
                    value={val}
                    options={optionsFor(field)}
                    canAddOption={canAddOption(field)}
                    addingOption={addingOption === field.canonical}
                    onChange={(v) => setValue(field.canonical, v)}
                    onAddOption={(name) => void handleAddOption(field, name)}
                  />
                )}
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
