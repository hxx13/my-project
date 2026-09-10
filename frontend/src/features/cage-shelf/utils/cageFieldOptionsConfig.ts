/**
 * 笼位字段 config 的候选能力开关（cage_info_field.config）。
 *
 * 四个键（全部可选）：
 *  - optionsSource   string   动态候选源，约定 AUP_<REF_TYPE>（如 AUP_ANIMAL_STRAIN）；缺省 = 无动态源
 *  - restrictToAup   boolean  候选是否受 AUP 白名单限制，默认 true
 *  - allowManualInput boolean 允许自由输入（题型 combo 才有意义），默认 false
 *  - allowAddOption  boolean  允许填写时新增预设，默认 false
 *
 * 只增删这四个键，config 里其它结构化配置（choiceType / columns / fields 等）原样保留。
 */
import { TYPES_WITH_OPTIONS } from "@/features/nhp/schema/typeRegistry";

/** 常见动态候选源建议值（可手填其它 AUP_<REF_TYPE>）。 */
export const OPTIONS_SOURCE_SUGGESTIONS = ["AUP_ANIMAL_STRAIN"];

/** 某题型是否渲染候选（选择类）。 */
export function hasOptionsType(t?: string | null): boolean {
  return !!t && TYPES_WITH_OPTIONS.has(t as never);
}

/** 解析字段 config JSON；非法/非对象一律回退空对象，绝不抛。 */
export function parseFieldConfig(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export interface OptionsConfigValues {
  optionsSource: string;
  restrictToAup: string;
  allowManualInput: string;
  allowAddOption: string;
}

/** 从 config JSON 读出四开关的编辑态（缺省安全回退）。 */
export function readOptionsConfig(raw?: string | null): OptionsConfigValues {
  const cfg = parseFieldConfig(raw);
  return {
    optionsSource: typeof cfg.optionsSource === "string" ? cfg.optionsSource : "",
    restrictToAup: cfg.restrictToAup === false ? "NO" : "YES",
    allowManualInput: cfg.allowManualInput === true ? "YES" : "NO",
    allowAddOption: cfg.allowAddOption === true ? "YES" : "NO",
  };
}

/**
 * 把四开关折算回 config JSON，返回 null 表示 config 已无任何键（清空列）。
 * 等于默认值时不落键，保持 config 精简：restrictToAup 默认 true，其余默认 false。
 * 非选择类题型不渲染候选，原样回传，避免无谓重写或丢失既有 config。
 */
export function mergeOptionsConfig(
  raw: string | null | undefined,
  fieldType: string,
  v: OptionsConfigValues,
): string | null {
  if (!hasOptionsType(fieldType)) return raw ?? null;
  const cfg = parseFieldConfig(raw);
  const src = v.optionsSource.trim();
  if (src) cfg.optionsSource = src;
  else delete cfg.optionsSource;
  if (src && v.restrictToAup === "NO") cfg.restrictToAup = false;
  else delete cfg.restrictToAup;
  if (fieldType === "combo" && v.allowManualInput === "YES") cfg.allowManualInput = true;
  else delete cfg.allowManualInput;
  if (v.allowAddOption === "YES") cfg.allowAddOption = true;
  else delete cfg.allowAddOption;
  return Object.keys(cfg).length > 0 ? JSON.stringify(cfg) : null;
}
