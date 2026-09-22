import { AdminSearchSelect } from "@/components/admin/AdminSearchSelect";
import type { CageTemplateDetail, CageTemplateField } from "../api/cageForm.api";

/**
 * 笼位表单字段的渲染与规整 —— **单一来源**。
 *
 * 单笼位填表（CageFormFill）与「批量编辑」（CageBatchEditDialog）必须渲染成同一个控件：
 * 候选浮层、新增预设、多选勾选、日期/数字分支都只写在这里一份，两边不会各自漂移。
 * 两个调用方只负责外层的标签、边框和取值落盘。
 */

/** 字段是否声明了动态选项源（config.optionsSource），如动物品系取该笼位 AUP 白名单 */
export function optionsSourceOf(field: CageTemplateField): string | null {
  if (!field.config) return null;
  try {
    const c = JSON.parse(field.config) as { optionsSource?: unknown };
    return typeof c?.optionsSource === "string" ? c.optionsSource : null;
  } catch {
    return null;
  }
}

/** 选择题模式（config.choiceType）：multiple = 多值，存 value_json 数组 */
export function choiceTypeOf(field: CageTemplateField): string | null {
  if (!field.config) return null;
  try {
    const c = JSON.parse(field.config) as { choiceType?: unknown };
    return typeof c?.choiceType === "string" ? c.choiceType : null;
  } catch {
    return null;
  }
}

export const isMultiChoiceField = (field: CageTemplateField) => choiceTypeOf(field) === "multiple";

/** 从模板结构平铺出所有字段（去重，保留 section/subsection 归属） */
export function flattenFields(
  template: CageTemplateDetail,
): Array<{ section: string; subsection?: string; field: CageTemplateField }> {
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
 * 能否人工修改 — 只看 editable（与 role 解耦，由字段管理页配置）。
 * 字段未下发 editable 时回退旧口径（role=VALUE 可改），避免旧接口把整表锁死。
 */
export const canEditField = (field: CageTemplateField) =>
  field.editable ?? (field.role == null || field.role === "VALUE");

/** 是不是「选」出来的字段（下拉 / 码表 / 组合 / 动态候选）。 */
export const isChoiceField = (field: CageTemplateField) =>
  field.dictKey || optionsSourceOf(field) != null || field.fieldType === "select" || field.fieldType === "choice" || field.fieldType === "cascade";

/** 推导题型：没声明时按有没有码表猜（与详情渲染同一口径）。 */
export const fieldTypeOf = (field: CageTemplateField) => field.fieldType || (field.dictKey ? "select" : "text");

export type FieldOption = { value: string; label: string };

export function CageFieldEditor({
  field,
  value,
  options,
  canAddOption = false,
  addingOption = false,
  onChange,
  onAddOption,
}: {
  field: CageTemplateField;
  value: unknown;
  options: FieldOption[];
  /** 后端下发的 allowAddOption（浮层底部「＋ 新增预设」那一行） */
  canAddOption?: boolean;
  /** 正在新增中（防重复点击） */
  addingOption?: boolean;
  onChange: (v: unknown) => void;
  onAddOption?: (name: string) => void;
}) {
  const ft = fieldTypeOf(field);
  const inputCls =
    "w-full rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-ink)]";

  if (isMultiChoiceField(field)) {
    const arr = Array.isArray(value) ? (value as unknown[]).map(String) : [];
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {options.map((o) => {
          const on = arr.includes(o.value);
          return (
            <label key={o.value} className="flex items-center gap-1 text-[11px] text-[var(--twin-ink)]">
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? arr.filter((v) => v !== o.value) : [...arr, o.value])}
                className="h-3.5 w-3.5 accent-[var(--twin-primary)]"
              />
              {o.label}
            </label>
          );
        })}
        {options.length === 0 && <span className="text-[10px] text-[var(--twin-mute)]">无可选项（该笼位未关联 AUP）</span>}
      </div>
    );
  }

  if (ft === "combo") {
    /* 输入框 + 候选：复用通用 AdminSearchSelect（可直接输入，也可从候选点选）。
       它的浮层走 Portal + fixed，不会被表单所在的弹窗/滚动容器裁掉。
       「新增候选」作为浮层底部的一行并入候选列表 —— 不另挂按钮，
       否则分不清用户是手敲的还是刚从候选选的，会诱导重复新增。

       clearRowLabel 必须显式给：浮层第一行是**清空**动作，默认拿 placeholder 当文案，
       而这里的 placeholder 是一句提示，用户会当成说明去点 —— 点一下值就没了，
       保存后重开显示为空，看起来就是「保存成功但没存上」。 */
    return (
      <AdminSearchSelect
        value={typeof value === "string" ? value : ""}
        onChange={(v) => onChange(v)}
        options={options.map((o) => o.value)}
        placeholder={options.length > 0 ? "可直接输入，或从候选中选" : "直接输入"}
        clearRowLabel="清除该字段的值"
        className="rounded-twin-md border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] shadow-none"
        onAddOption={canAddOption && onAddOption ? onAddOption : undefined}
        addOptionLabel={addingOption ? "新增中" : "新增"}
      />
    );
  }

  if (isChoiceField(field)) {
    return (
      <select
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (ft === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--twin-primary)]"
      />
    );
  }

  if (ft === "number") {
    return (
      <input
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(Number.isNaN(e.target.valueAsNumber) ? null : e.target.valueAsNumber)}
        className={inputCls}
      />
    );
  }

  if (ft === "date" || ft === "dateRange") {
    return (
      <input type="date" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    );
  }

  if (ft === "textarea" || ft === "richText") {
    return (
      <textarea
        rows={3}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    );
  }

  return <input type="text" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
}
