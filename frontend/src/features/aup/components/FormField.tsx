import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { useAupAttachments, useAupDictDetail, useAupPickers, useAupSignatureContext } from "../hooks/useAup";
import { useRefDataOptions } from "../hooks/useRefDataOptions";
import type { PickerType } from "../api/aup.api";
import type { FieldOptions, FormField as FormFieldDef, OptionItem, ShowWhen } from "../schema/formTemplate";
import {
  cascadeOptionsForLevel,
  cascadePatch,
  defaultImageAccept,
  fileIdsFromValue,
  multiSelectValues,
  parseCascadeValue,
  validateFileUpload,
} from "@/features/form-shared/fieldHelpers";

/* =====================================================================
 * 共享工具（SectionNav / FillPage 复用）
 * ================================================================== */

/** 字段取值是否「非空」（必填判定用） */
export function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "boolean") return v === true;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/** 条件显示求值（作用于 Section / SubSection / Field 任意层级） */
export function evaluateShowWhen(sw: ShowWhen | null | undefined, values: Record<string, unknown>): boolean {
  if (!sw) return true;
  const v = values[sw.field];
  switch (sw.op) {
    case "equals":
      return String(v ?? "") === String(sw.value ?? "");
    case "notEquals":
      return String(v ?? "") !== String(sw.value ?? "");
    case "contains": {
      const target = String(sw.value ?? "");
      if (Array.isArray(v)) return v.some((x) => String(x) === target);
      return String(v ?? "").includes(target);
    }
    case "notContains": {
      const target = String(sw.value ?? "");
      if (Array.isArray(v)) return !v.some((x) => String(x) === target);
      return !String(v ?? "").includes(target);
    }
    case "notEmpty":
      return hasValue(v);
    case "empty":
      return !hasValue(v);
    default:
      return true;
  }
}

/** 字段选项统一为 { value, label }（兼容纯字符串简写） */
export function normalizeOptions(options?: FieldOptions): OptionItem[] {
  if (!options) return [];
  return options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

function asStr(v: unknown): string {
  return v == null ? "" : String(v);
}

/**
 * 板块/小节标题：种子数据的 label 已含 code 前缀（如 "A：管理信息"、"A1：研究项目信息"），
 * 显示时若 label 已以 code 开头则直接返回 label，避免拼出 "A A：管理信息" 这类重复编号。
 */
export function displayTitle(code: string | null | undefined, label: string | null | undefined): string {
  const c = code?.trim() ?? "";
  const l = label?.trim() ?? "";
  if (!c) return l;
  if (!l || l === c) return c;
  if (l.startsWith(c + "：") || l.startsWith(c + ":") || l.startsWith(c + " ")) return l;
  return `${c} ${l}`;
}

/* =====================================================================
 * 表单字段渲染器：按 form_field.type 分发
 * ================================================================== */

export interface FormFieldProps {
  field: FormFieldDef;
  value: unknown;
  /** 平铺值（showWhen / group / table 联动读取用） */
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
  /** file/image 上传需要计划书 id */
  aupId?: string;
  /** 校验错误高亮（提交前预检） */
  error?: boolean;
}

export default function FormField({ field, value, values, onChange, readOnly, aupId, error }: FormFieldProps) {
  if (field.showWhen && !evaluateShowWhen(field.showWhen, values)) return null;

  switch (field.type) {
    case "divider":
      return <hr className="aup-divider" />;
    case "description":
      // 说明文字：正文在 description（支持富文本 HTML），无正文时退回标题
      // config.tone 控制高亮变体：info（蓝，默认）/ warn（琥珀）/ danger（红）/ muted（灰）
      return field.description ? (
        <div className={"aup-desc" + (field.config?.tone ? " " + field.config.tone : "")} dangerouslySetInnerHTML={{ __html: field.description }} />
      ) : (
        <p className={"aup-desc" + (field.config?.tone ? " " + field.config.tone : "")}>{field.label}</p>
      );
    case "text":
      return <Text field={field} value={asStr(value)} onChange={onChange} readOnly={readOnly} error={error} />;
    case "textarea":
      return (
        <Textarea field={field} value={asStr(value)} onChange={onChange} readOnly={readOnly} error={error} />
      );
    case "number":
      return <NumberField field={field} value={value} onChange={onChange} readOnly={readOnly} error={error} />;
    case "date":
      return (
        <FieldWrap field={field} error={error}>
          <input
            className="input"
            type="date"
            value={asStr(value)}
            disabled={readOnly}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
          />
        </FieldWrap>
      );
    case "dateRange":
      return <DateRange field={field} value={value} onChange={onChange} readOnly={readOnly} error={error} />;
    case "time":
      return (
        <FieldWrap field={field} error={error}>
          <input
            className="input"
            type="time"
            value={asStr(value)}
            disabled={readOnly}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
          />
        </FieldWrap>
      );
    case "choice":
      return <Choice field={field} value={value} onChange={onChange} readOnly={readOnly} error={error} />;
    case "select":
      // 下拉选择：原生 select 复现真实站点 el-select 的单选下拉（B5 动物、B6 品种/品系）
      return <SelectField field={field} value={value} onChange={onChange} readOnly={readOnly} error={error} />;
    case "checkbox":
      // 是否勾选：单独一行，题名即勾选框文案（避免 FieldWrap 外层标题重复显示）
      return (
        <div className={"field" + (error ? " field-error" : "")}>
          <label className={"choice" + (value === true ? " chosen" : "") + (readOnly ? " disabled" : "")}>
            <input
              type="checkbox"
              checked={value === true}
              disabled={readOnly}
              onChange={(e) => onChange(field.fieldKey, e.target.checked)}
            />
            <span>{field.label}</span>
          </label>
          {field.description ? (
            <div className="field-desc" dangerouslySetInnerHTML={{ __html: field.description }} />
          ) : null}
        </div>
      );
    case "cascade":
      return <Cascade field={field} value={value} onChange={onChange} readOnly={readOnly} error={error} />;
    case "table":
      return <TableField field={field} value={value} onChange={onChange} readOnly={readOnly} aupId={aupId} error={error} />;
    case "group":
      return <GroupField field={field} values={values} onChange={onChange} readOnly={readOnly} aupId={aupId} />;
    case "repeatGroup":
      return <RepeatGroupField field={field} values={values} onChange={onChange} readOnly={readOnly} aupId={aupId} error={error} />;
    case "file":
    case "image":
      return <FileField field={field} value={value} onChange={onChange} readOnly={readOnly} aupId={aupId} error={error} />;
    case "personPicker":
      return (
        <PickerField field={field} type="person" value={value} onChange={onChange} readOnly={readOnly} error={error} />
      );
    case "departmentPicker":
      return (
        <PickerField field={field} type="department" value={value} onChange={onChange} readOnly={readOnly} error={error} />
      );
    case "cagePicker":
      return (
        <PickerField field={field} type="cage" value={value} onChange={onChange} readOnly={readOnly} error={error} />
      );
    case "animalPicker":
      return (
        <PickerField field={field} type="animal" value={value} onChange={onChange} readOnly={readOnly} error={error} />
      );
    case "signature":
      return <SignatureField field={field} value={value} onChange={onChange} readOnly={readOnly} error={error} />;
    case "richText":
      return (
        <FieldWrap field={field} error={error}>
          <RichTextInput
            value={asStr(value)}
            disabled={readOnly}
            placeholder={field.label}
            onChange={(v) => onChange(field.fieldKey, v)}
          />
        </FieldWrap>
      );
    default:
      // 未知类型兜底为文本输入，避免空白
      return <Text field={field} value={asStr(value)} onChange={onChange} readOnly={readOnly} error={error} />;
  }
}

/* ------------------------------------------------------------------ */

function FieldWrap({ field, error, children }: { field: FormFieldDef; error?: boolean; children: ReactNode }) {
  return (
    <div className={"field" + (error ? " field-error" : "")}>
      <label>
        {field.label}
        {field.required && <span className="req">*</span>}
      </label>
      {field.description ? (
        <div className="field-desc" dangerouslySetInnerHTML={{ __html: field.description }} />
      ) : null}
      {children}
    </div>
  );
}

function Text({ field, value, onChange, readOnly, error }: { field: FormFieldDef; value: string; onChange: (k: string, v: unknown) => void; readOnly?: boolean; error?: boolean }) {
  return (
    <FieldWrap field={field} error={error}>
      <input
        className="input"
        type="text"
        value={value}
        disabled={readOnly}
        maxLength={field.config?.maxLength}
        onChange={(e) => onChange(field.fieldKey, e.target.value)}
      />
    </FieldWrap>
  );
}

function Textarea({ field, value, onChange, readOnly, error }: { field: FormFieldDef; value: string; onChange: (k: string, v: unknown) => void; readOnly?: boolean; error?: boolean }) {
  return (
    <FieldWrap field={field} error={error}>
      <textarea
        className="textarea"
        value={value}
        disabled={readOnly}
        maxLength={field.config?.maxLength}
        onChange={(e) => onChange(field.fieldKey, e.target.value)}
      />
      {field.config?.maxLength ? (
        <div className="hint">{value.length}/{field.config.maxLength} 字</div>
      ) : null}
    </FieldWrap>
  );
}

function NumberField({ field, value, onChange, readOnly, error }: { field: FormFieldDef; value: unknown; onChange: (k: string, v: unknown) => void; readOnly?: boolean; error?: boolean }) {
  const handle = (raw: string) => {
    if (raw === "") return onChange(field.fieldKey, "");
    const n = Number(raw);
    onChange(field.fieldKey, Number.isFinite(n) ? n : raw);
  };
  return (
    <FieldWrap field={field} error={error}>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          className="input"
          type="number"
          value={value == null ? "" : String(value)}
          disabled={readOnly}
          min={field.config?.min}
          max={field.config?.max}
          onChange={(e) => handle(e.target.value)}
        />
        {field.config?.unit && <span className="unit">{field.config.unit}</span>}
      </span>
    </FieldWrap>
  );
}

function DateRange({ field, value, onChange, readOnly, error }: { field: FormFieldDef; value: unknown; onChange: (k: string, v: unknown) => void; readOnly?: boolean; error?: boolean }) {
  const obj = (value && typeof value === "object" ? value : {}) as { start?: string; end?: string };
  const set = (patch: { start?: string; end?: string }) => onChange(field.fieldKey, { start: obj.start ?? "", end: obj.end ?? "", ...patch });
  return (
    <FieldWrap field={field} error={error}>
      <div className="row2" style={{ gap: 8 }}>
        <input className="input" type="date" value={obj.start ?? ""} disabled={readOnly} onChange={(e) => set({ start: e.target.value })} />
        <input className="input" type="date" value={obj.end ?? ""} disabled={readOnly} onChange={(e) => set({ end: e.target.value })} />
      </div>
    </FieldWrap>
  );
}

/* 内联/字典选项 source */
function useResolvedOptions(field: FormFieldDef): OptionItem[] {
  const inline = normalizeOptions(field.options);
  const dict = useAupDictDetail(field.dictKey);
  // EXTERNAL 码表只有表头无 items，值域由 sourceRef 指向的源模块取项；否则回退旧的 config.refDataSource。
  const refType = dict.data?.source === "EXTERNAL" ? dict.data.sourceRef : field.config?.refDataSource;
  const refData = useRefDataOptions(refType);
  return useMemo(() => {
    if (inline.length > 0) return inline;
    if (field.dictKey && dict.data?.source !== "EXTERNAL" && dict.data?.items?.length) {
      return dict.data.items.map((i) => ({ value: i.value, label: i.label }));
    }
    if (refType && refData.data) {
      return refData.data;
    }
    return [];
  }, [inline, field.dictKey, dict.data, refType, refData.data]);
}

function Choice({ field, value, onChange, readOnly, error }: { field: FormFieldDef; value: unknown; onChange: (k: string, v: unknown) => void; readOnly?: boolean; error?: boolean }) {
  const options = useResolvedOptions(field);
  const multiple = field.config?.choiceType === "multiple";
  // 排版：list 竖排（默认）/ grid 多列 / grouped 分组标题
  const layout = field.config?.layout ?? "list";
  const cols = Math.max(2, field.config?.cols ?? 3);

  const arr = multiple ? (Array.isArray(value) ? (value as string[]) : []) : [];
  const toggle = (opt: string) => {
    const next = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
    onChange(field.fieldKey, next);
  };

  const optionEl = (o: OptionItem) => {
    const isFixed = !!o.fixed;
    const checked = multiple ? isFixed || arr.includes(o.value) : isFixed || String(value ?? "") === o.value;
    const disabled = !!readOnly || isFixed;
    return (
      <label key={o.value} className={"choice" + (checked ? " chosen" : "") + (disabled ? " disabled" : "")}>
        <input
          type={multiple ? "checkbox" : "radio"}
          name={multiple ? undefined : field.fieldKey}
          checked={checked}
          disabled={disabled}
          onChange={() => !isFixed && (multiple ? toggle(o.value) : onChange(field.fieldKey, o.value))}
        />
        <span>{o.label}</span>
      </label>
    );
  };

  // grouped：按选项 group 属性聚合成「标题 + 选项」块；无 group 的选项放最前
  const groups = useMemo(() => {
    if (layout !== "grouped") return [{ title: undefined as string | undefined, items: options }];
    const map = new Map<string, OptionItem[]>();
    const head: OptionItem[] = [];
    for (const o of options) {
      if (o.group) {
        const list = map.get(o.group);
        if (list) list.push(o);
        else map.set(o.group, [o]);
      } else {
        head.push(o);
      }
    }
    const out: { title?: string; items: OptionItem[] }[] = [];
    if (head.length) out.push({ items: head });
    for (const [title, items] of map) out.push({ title, items });
    return out;
  }, [options, layout]);

  return (
    <FieldWrap field={field} error={error}>
      {groups.map((g, gi) => (
        <div
          key={gi}
          className={"choice-group" + (layout === "grid" ? " choice-grid" : "")}
          style={layout === "grid" ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}
        >
          {g.title && <div className="choice-group-title">{g.title}</div>}
          {g.items.map(optionEl)}
        </div>
      ))}
    </FieldWrap>
  );
}

/** 可搜索下拉：输入关键字过滤 + 下拉选择，适配大量选项（课题组/品系/动物品种等），替代原生 select 全量展开 */
function SelectField({ field, value, onChange, readOnly, error }: { field: FormFieldDef; value: unknown; onChange: (k: string, v: unknown) => void; readOnly?: boolean; error?: boolean }) {
  const options = useResolvedOptions(field);
  const [open, setOpen] = useState(false);
  const [kw, setKw] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const boxRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const current = asStr(value);
  const selected = useMemo(() => options.find((o) => o.value === current), [options, current]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      setKw("");
      return;
    }
    const rect = boxRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setOpen(true);
    setKw("");
  };

  // 点击外部关闭（排除输入框与 portal 下拉本体）
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t)) return;
      if (dropRef.current?.contains(t)) return;
      setOpen(false);
      setKw("");
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, kw]);

  if (readOnly) {
    return (
      <FieldWrap field={field} error={error}>
        <div className="sselect-readonly">{selected?.label || current || "—"}</div>
      </FieldWrap>
    );
  }

  return (
    <FieldWrap field={field} error={error}>
      <div className={"sselect" + (open ? " open" : "")}>
        <div className="sselect-box" ref={boxRef} onClick={toggle}>
          <input
            className="sselect-input"
            value={open ? kw : selected?.label || ""}
            placeholder="请选择"
            autoComplete="off"
            onChange={(e) => setKw(e.target.value)}
            onFocus={() => {
              if (!open) toggle();
            }}
          />
          <span className="sselect-arrow">{open ? "▴" : "▾"}</span>
        </div>
        {open &&
          createPortal(
            <div className="sselect-drop" ref={dropRef} style={{ top: pos.top, left: pos.left, width: pos.width }}>
              {filtered.length === 0 ? (
                <div className="sselect-empty">无匹配选项</div>
              ) : (
                filtered.map((o) => (
                  <div
                    key={o.value}
                    className={"sselect-item" + (o.value === current ? " active" : "")}
                    onClick={() => {
                      onChange(field.fieldKey, o.value);
                      setOpen(false);
                      setKw("");
                    }}
                  >
                    {o.label}
                  </div>
                ))
              )}
            </div>,
            document.body
          )}
      </div>
    </FieldWrap>
  );
}

function Cascade({ field, value, onChange, readOnly, error }: { field: FormFieldDef; value: unknown; onChange: (k: string, v: unknown) => void; readOnly?: boolean; error?: boolean }) {
  const options = useResolvedOptions(field);
  const levels = field.config?.levels;
  const current = parseCascadeValue(value);

  if (!levels || levels.length === 0) {
    if (options.length > 0) {
      return (
        <FieldWrap field={field} error={error}>
          <select
            className="select"
            value={current._legacy ?? ""}
            disabled={readOnly}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
          >
            <option value="">请选择</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </FieldWrap>
      );
    }
    return <Text field={field} value={asStr(value)} onChange={onChange} readOnly={readOnly} />;
  }

  return (
    <FieldWrap field={field} error={error}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {levels.map((levelLabel, i) => {
          const levelOpts = cascadeOptionsForLevel(options, levels, i, current);
          const val = current[levelLabel] ?? "";
          const prevFilled = i === 0 || Boolean(current[levels[i - 1]]);
          if (!prevFilled && i > 0) return null;
          return (
            <div key={levelLabel}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>{levelLabel}</div>
              {levelOpts.length > 0 ? (
                <select
                  className="select"
                  value={val}
                  disabled={readOnly}
                  onChange={(e) => onChange(field.fieldKey, cascadePatch(levels, current, levelLabel, i, e.target.value))}
                >
                  <option value="">请选择</option>
                  {levelOpts.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  value={val}
                  disabled={readOnly}
                  placeholder={`输入${levelLabel}`}
                  onChange={(e) => onChange(field.fieldKey, cascadePatch(levels, current, levelLabel, i, e.target.value))}
                />
              )}
            </div>
          );
        })}
      </div>
    </FieldWrap>
  );
}

function PickerField({ field, type, value, onChange, readOnly, error }: { field: FormFieldDef; type: PickerType; value: unknown; onChange: (k: string, v: unknown) => void; readOnly?: boolean; error?: boolean }) {
  const { data: options = [] } = useAupPickers(type);
  return (
    <FieldWrap field={field} error={error}>
      <select
        className="select"
        value={asStr(value)}
        disabled={readOnly}
        onChange={(e) => onChange(field.fieldKey, e.target.value)}
      >
        <option value="">请选择</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FieldWrap>
  );
}

function GroupField({ field, values, onChange, readOnly, aupId }: { field: FormFieldDef; values: Record<string, unknown>; onChange: (k: string, v: unknown) => void; readOnly?: boolean; aupId?: string }) {
  const children = field.config?.fields ?? [];
  if (children.length === 0) return null;
  // 多列布局：cols>1 时子字段按 CSS grid 排布（复现真实站点 el-row/el-col 一行多字段效果）
  const cols = Math.max(1, field.config?.cols ?? 1);
  return (
    <div className="field">
      <label>
        {field.label}
        {field.required && <span className="req">*</span>}
      </label>
      <div
        className={cols > 1 ? "group-grid" : undefined}
        style={cols > 1 ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : { paddingLeft: 12, borderLeft: "2px solid var(--border)" }}
      >
        {children.map((c) => (
          <div key={c.fieldKey} style={c.config?.span ? { gridColumn: `span ${c.config.span}` } : undefined}>
            <FormField field={c} value={values[c.fieldKey]} values={values} onChange={onChange} readOnly={readOnly} aupId={aupId} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 可重复块：同构字段组可增删多份（B5 每物种一块、B6 每物种数量表）。
 * 值为数组，每项一个块对象；块内子字段 showWhen 引用「相对 key」（如 basis），对块对象求值。
 */
function RepeatGroupField({ field, values, onChange, readOnly, aupId, error }: { field: FormFieldDef; values: Record<string, unknown>; onChange: (k: string, v: unknown) => void; readOnly?: boolean; aupId?: string; error?: boolean }) {
  const blocks: Record<string, unknown>[] = Array.isArray(values[field.fieldKey]) ? (values[field.fieldKey] as Record<string, unknown>[]) : [];
  const children = field.config?.fields ?? [];
  if (children.length === 0) return null;
  const cols = Math.max(1, field.config?.cols ?? 1);

  const patchBlock = (bi: number, key: string, v: unknown) => {
    const updated = { ...blocks[bi], [key]: v };
    // 联动隐藏的块内字段清掉残留值（如取消勾选依据后说明框消失）
    for (const c of children) {
      if (c.showWhen && !evaluateShowWhen(c.showWhen, updated)) {
        delete updated[c.fieldKey];
      }
    }
    onChange(field.fieldKey, blocks.map((b, i) => (i === bi ? updated : b)));
  };
  const addBlock = () => onChange(field.fieldKey, [...blocks, {}]);
  const delBlock = (bi: number) => onChange(field.fieldKey, blocks.filter((_, i) => i !== bi));

  return (
    <div className={"field" + (error ? " field-error" : "")}>
      <label>
        {field.label}
        {field.required && <span className="req">*</span>}
      </label>
      {field.description ? (
        <div className="field-desc" dangerouslySetInnerHTML={{ __html: field.description }} />
      ) : null}
      {blocks.map((b, bi) => (
        <div key={bi} className="repeat-block">
          <div className="repeat-block-hd">
            <span className="repeat-block-no">第 {bi + 1} 项</span>
            {!readOnly && (
              <button type="button" className="row-del" onClick={() => delBlock(bi)}>删除</button>
            )}
          </div>
          <div
            className={cols > 1 ? "group-grid" : "repeat-block-body"}
            style={cols > 1 ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}
          >
            {children.map((c) => (
              <div key={c.fieldKey} style={c.config?.span ? { gridColumn: `span ${c.config.span}` } : undefined}>
                <FormField
                  field={c}
                  value={b[c.fieldKey]}
                  values={b}
                  onChange={(k, v) => patchBlock(bi, k, v)}
                  readOnly={readOnly}
                  aupId={aupId}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      {!readOnly && (
        <span className="add-row" onClick={addBlock}>＋ 增加一项</span>
      )}
    </div>
  );
}

function TableField({ field, value, onChange, readOnly, aupId, error }: { field: FormFieldDef; value: unknown; onChange: (k: string, v: unknown) => void; readOnly?: boolean; aupId?: string; error?: boolean }) {
  const columns = field.config?.columns ?? [];
  const rows: Record<string, unknown>[] = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

  const patchRow = (ri: number, colKey: string, v: unknown) => {
    const next = rows.map((r, i) => (i === ri ? { ...r, [colKey]: v } : r));
    onChange(field.fieldKey, next);
  };
  const addRow = () => onChange(field.fieldKey, [...rows, {}]);
  const delRow = (ri: number) => onChange(field.fieldKey, rows.filter((_, i) => i !== ri));

  return (
    <FieldWrap field={field} error={error}>
      <div className="table-scroll">
        <table className="grid">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.fieldKey} style={c.config?.width ? { width: c.config.width, minWidth: c.config.width } : undefined}>
                  {c.label}{c.required && <span className="req">*</span>}
                </th>
              ))}
              {!readOnly && <th style={{ width: 40 }} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {columns.map((c) => (
                  <td key={c.fieldKey}>
                    <CellField field={c} value={row[c.fieldKey]} onChange={(v) => patchRow(ri, c.fieldKey, v)} readOnly={readOnly} aupId={aupId} />
                  </td>
                ))}
                {!readOnly && (
                  <td>
                    <button type="button" className="row-del" onClick={() => delRow(ri)}>删</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <span className="add-row" onClick={addRow}>＋ 添加一行</span>
      )}
    </FieldWrap>
  );
}

/** 表格单元格精简渲染（常用简单类型） */
function CellField({ field, value, onChange, readOnly, aupId }: { field: FormFieldDef; value: unknown; onChange: (v: unknown) => void; readOnly?: boolean; aupId?: string }) {
  switch (field.type) {
    case "text":
      // 只读态用可换行的纯文本，避免 disabled input 单行截断（表格单元格文字显示不全）
      if (readOnly) return <span className="cell-text">{asStr(value) || "—"}</span>;
      return <input className="input" type="text" value={asStr(value)} onChange={(e) => onChange(e.target.value)} />;
    case "textarea":
      if (readOnly) return <span className="cell-text">{asStr(value) || "—"}</span>;
      return <textarea className="textarea" value={asStr(value)} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return (
        <input
          className="input"
          type="number"
          value={value == null ? "" : String(value)}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      );
    case "date":
      return <input className="input" type="date" value={asStr(value)} disabled={readOnly} onChange={(e) => onChange(e.target.value)} />;
    case "time":
      return <input className="input" type="time" value={asStr(value)} disabled={readOnly} onChange={(e) => onChange(e.target.value)} />;
    case "choice":
    case "select":
      return <CellChoice field={field} value={value} onChange={onChange} readOnly={readOnly} />;
    case "checkbox":
      if ((field.options?.length ?? 0) > 0 || field.dictKey) {
        return <CellChoice field={{ ...field, type: "choice", config: { ...field.config, choiceType: "multiple" } }} value={value} onChange={onChange} readOnly={readOnly} />;
      }
      return <input type="checkbox" checked={value === true} disabled={readOnly} onChange={(e) => onChange(e.target.checked)} />;
    case "cascade":
      return <CellCascade field={field} value={value} onChange={onChange} readOnly={readOnly} />;
    case "file":
    case "image":
      return <CellFile field={field} value={value} onChange={onChange} readOnly={readOnly} aupId={aupId} />;
    case "signature":
      return <CellSignature value={value} onChange={onChange} readOnly={readOnly} />;
    case "richText":
      if (readOnly) return <span className="cell-text">{asStr(value) || "—"}</span>;
      return <RichTextInput value={asStr(value)} disabled={readOnly} onChange={onChange} />;
    case "personPicker":
    case "departmentPicker":
    case "cagePicker":
    case "animalPicker":
      return <CellPicker type={pickerTypeOf(field.type)} value={value} onChange={onChange} readOnly={readOnly} />;
    default:
      if (readOnly) return <span className="cell-text">{asStr(value) || "—"}</span>;
      return <input className="input" type="text" value={asStr(value)} onChange={(e) => onChange(e.target.value)} />;
  }
}

function pickerTypeOf(t: string): PickerType {
  return (t.replace("Picker", "") as PickerType);
}

function CellChoice({ field, value, onChange, readOnly, error }: { field: FormFieldDef; value: unknown; onChange: (v: unknown) => void; readOnly?: boolean; error?: boolean }) {
  const options = useResolvedOptions(field);
  const multiple = field.config?.choiceType === "multiple";

  if (multiple) {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (opt: string) => {
      const next = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
      onChange(next);
    };
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", padding: "2px 0" }}>
        {options.map((o) => {
          const isFixed = !!o.fixed;
          const checked = isFixed || arr.includes(o.value);
          const disabled = !!readOnly || isFixed;
          return (
            <label key={o.value} className={"choice" + (checked ? " chosen" : "") + (disabled ? " disabled" : "")} style={{ whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={checked} disabled={disabled} onChange={() => !isFixed && toggle(o.value)} />
              <span>{o.label}</span>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <select className="select" value={asStr(value)} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
      <option value="">请选择</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function CellPicker({ type, value, onChange, readOnly, error }: { type: PickerType; value: unknown; onChange: (v: unknown) => void; readOnly?: boolean; error?: boolean }) {
  const { data: options = [] } = useAupPickers(type);
  return (
    <select className="select" value={asStr(value)} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
      <option value="">请选择</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function RichTextInput({ value, onChange, disabled, placeholder }: { value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string }) {
  const [showPreview, setShowPreview] = useState(false);
  return (
    <div>
      <textarea
        className="textarea rich"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
      {value.trim() && (
        <button type="button" className="btn ghost small" style={{ marginTop: 4 }} onClick={() => setShowPreview((p) => !p)}>
          {showPreview ? "隐藏预览" : "HTML 预览"}
        </button>
      )}
      {showPreview && value.trim() && (
        <div className="aup-desc" style={{ marginTop: 4, padding: 6, border: "1px solid var(--border)", borderRadius: 4 }} dangerouslySetInnerHTML={{ __html: value }} />
      )}
    </div>
  );
}

function CellCascade({ field, value, onChange, readOnly }: { field: FormFieldDef; value: unknown; onChange: (v: unknown) => void; readOnly?: boolean }) {
  const options = useResolvedOptions(field);
  const levels = field.config?.levels;
  const current = parseCascadeValue(value);
  if (!levels || levels.length === 0) {
    return (
      <select className="select" value={current._legacy ?? ""} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
        <option value="">请选择</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {levels.map((levelLabel, i) => {
        const levelOpts = cascadeOptionsForLevel(options, levels, i, current);
        const val = current[levelLabel] ?? "";
        if (i > 0 && !current[levels[i - 1]]) return null;
        return levelOpts.length > 0 ? (
          <select
            key={levelLabel}
            className="select"
            value={val}
            disabled={readOnly}
            onChange={(e) => onChange(cascadePatch(levels, current, levelLabel, i, e.target.value))}
          >
            <option value="">{levelLabel}</option>
            {levelOpts.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <input
            key={levelLabel}
            className="input"
            value={val}
            disabled={readOnly}
            placeholder={levelLabel}
            onChange={(e) => onChange(cascadePatch(levels, current, levelLabel, i, e.target.value))}
          />
        );
      })}
    </div>
  );
}

function CellSignature({ value, onChange, readOnly }: { value: unknown; onChange: (v: unknown) => void; readOnly?: boolean }) {
  if (readOnly) return <span className="cell-text">{asStr(value) || "—"}</span>;
  return (
    <input
      className="input"
      value={asStr(value)}
      placeholder="手写签名"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function CellFile({ field, value, onChange, readOnly, aupId }: { field: FormFieldDef; value: unknown; onChange: (v: unknown) => void; readOnly?: boolean; aupId?: string }) {
  const { listQuery, uploadMutation, deleteMutation } = useAupAttachments(aupId);
  const ids = fileIdsFromValue(value);
  const files = (listQuery.data ?? []).filter((f) => ids.includes(f.fileId));
  const accept = field.type === "image" ? (field.config?.accept ?? defaultImageAccept()) : field.config?.accept;

  const onPick = (file: File | null) => {
    if (!file || !aupId) return;
    const err = validateFileUpload(file, ids.length, field.config);
    if (err) {
      toast.error(err);
      return;
    }
    uploadMutation.mutate(file, {
      onSuccess: (uploaded) => onChange([...ids, uploaded.fileId]),
    });
  };

  if (readOnly) {
    return <span className="cell-text">{files.map((f) => f.fileName).join(", ") || ids.length ? `${ids.length} 个文件` : "—"}</span>;
  }

  return (
    <div>
      {files.map((f) => (
        <span key={f.fileId} style={{ fontSize: 11, marginRight: 6 }}>
          {f.fileName}
          <button type="button" className="row-del" onClick={() => deleteMutation.mutate(f.fileId, { onSuccess: () => onChange(ids.filter((x) => x !== f.fileId)) })}>✕</button>
        </span>
      ))}
      <label className="add-row" style={{ cursor: "pointer" }}>
        {uploadMutation.isPending ? "上传中…" : "＋"}
        <input type="file" hidden accept={accept} onChange={(e) => { onPick(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      </label>
    </div>
  );
}

function SignatureField({ field, value, onChange, readOnly, error }: { field: FormFieldDef; value: unknown; onChange: (k: string, v: unknown) => void; readOnly?: boolean; error?: boolean }) {
  const ctx = useAupSignatureContext();
  const trusted = ctx.data?.domainTrusted === true;
  const required = ctx.data?.signatureRequired === true;

  if (readOnly) {
    return (
      <FieldWrap field={field} error={error}>
        <input className="input" value={asStr(value)} disabled placeholder={trusted ? "（系统自动签署）" : "（未签署）"} />
      </FieldWrap>
    );
  }
  if (trusted) {
    return (
      <FieldWrap field={field} error={error}>
        <input className="input" value={asStr(value)} disabled placeholder="提交时由系统自动签署" />
        <div className="hint">邮箱已通过机构域名校验，提交时自动签署。</div>
      </FieldWrap>
    );
  }
  return (
    <FieldWrap field={field} error={error}>
      <input
        className="input"
        value={asStr(value)}
        placeholder={required ? "请输入手写签名" : "（可选）手写签名"}
        onChange={(e) => onChange(field.fieldKey, e.target.value)}
      />
      {required && <div className="hint" style={{ color: "var(--warn)" }}>未通过机构邮箱校验，需手写签名后方可提交。</div>}
    </FieldWrap>
  );
}

function FileField({ field, value, onChange, readOnly, aupId, error }: { field: FormFieldDef; value: unknown; onChange: (k: string, v: unknown) => void; readOnly?: boolean; aupId?: string; error?: boolean }) {
  const { listQuery, uploadMutation, deleteMutation, download } = useAupAttachments(aupId);
  const ids = fileIdsFromValue(value);
  const files = (listQuery.data ?? []).filter((f) => ids.includes(f.fileId));
  const accept = field.type === "image" ? (field.config?.accept ?? defaultImageAccept()) : field.config?.accept;
  const maxCount = field.config?.maxCount ?? 10;
  const isMulti = maxCount > 1;

  const onPick = (file: File | null) => {
    if (!file || !aupId) return;
    const err = validateFileUpload(file, ids.length, field.config);
    if (err) {
      toast.error(err);
      return;
    }
    uploadMutation.mutate(file, {
      onSuccess: (uploaded) => {
        const next = isMulti ? [...ids, uploaded.fileId] : [...ids, uploaded.fileId];
        onChange(field.fieldKey, next);
      },
    });
  };

  const doDownload = async (fileId: number) => {
    try {
      const { blob, fileName } = await download(fileId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* toast 由 hook 处理 */
    }
  };

  return (
    <FieldWrap field={field} error={error}>
      {files.length > 0 ? (
        <div style={{ marginBottom: 8 }}>
          {files.map((f) => (
            <div key={f.fileId} className="attach-row">
              <span className="name">{f.fileName}</span>
              <span className="size">{(f.size / 1024).toFixed(1)} KB</span>
              <button type="button" className="icon-btn" title="下载" onClick={() => doDownload(f.fileId)}>↓</button>
              {!readOnly && (
                <button
                  type="button"
                  className="icon-btn"
                  title="删除"
                  onClick={() => {
                    deleteMutation.mutate(f.fileId, {
                      onSuccess: () => onChange(field.fieldKey, ids.filter((x) => x !== f.fileId)),
                    });
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
      {!readOnly && (
        <label className="btn ghost small" style={{ display: "inline-block", cursor: "pointer" }}>
          {uploadMutation.isPending ? "上传中…" : "＋ 上传附件"}
          <input
            type="file"
            hidden
            accept={accept}
            onChange={(e) => {
              onPick(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {!aupId && <div className="hint">保存草稿后即可上传附件</div>}
    </FieldWrap>
  );
}
