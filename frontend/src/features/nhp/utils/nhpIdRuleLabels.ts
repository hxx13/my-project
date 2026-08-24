/**
 * NHP 16 类 ID 编号规则中文名（对齐 04-码表与编号规则 §二）。
 * 后端 crf_id_rule / crf_field.id_rule_type 仅存码值，展示层在此映射。
 */

export interface IdRuleTypeOption {
  value: string;
  label: string;
  zhName: string;
}

/** 16 类 ID 类型 → 中文名 */
export const ID_RULE_TYPE_ZH: Record<string, string> = {
  DON: "供体猪 ID",
  RCP: "受体猴 ID",
  XM: "配型记录 ID",
  TX: "移植事件 ID",
  FU: "随访记录 ID",
  AE: "不良事件 ID",
  REG: "免疫方案 ID",
  MED: "用药记录 ID",
  LVL: "血药浓度监测 ID",
  ANES: "麻醉记录 ID",
  PATH: "病理记录 ID",
  HX: "心脏模块记录 ID",
  PERF: "灌注记录 ID",
  SMP: "样本 ID",
  TST: "检测委托单 ID",
  RS: "检测结果 ID",
};

/** 派生键 ID 类型：pattern 由上游占位符拼出，不递增序列（对齐 crf_id_rule.derived=1） */
export const DERIVED_ID_RULE_TYPES = ["ANES", "HX", "RS"] as const;

/** PK 字段可选编码引擎（13 个非派生类；ANES/HX/RS 为派生键不走取号器） */
const PK_ID_RULE_CODES = [
  "DON",
  "RCP",
  "XM",
  "TX",
  "FU",
  "AE",
  "REG",
  "MED",
  "LVL",
  "PATH",
  "PERF",
  "SMP",
  "TST",
] as const;

export function idRuleTypeZh(code?: string | null): string {
  const c = (code || "").trim().toUpperCase();
  return ID_RULE_TYPE_ZH[c] ?? c;
}

/** 下拉选项：「供体猪 ID（DON）」 */
export function formatIdRuleSelectLabel(code?: string | null): string {
  const c = (code || "").trim().toUpperCase();
  const zh = ID_RULE_TYPE_ZH[c];
  if (zh) return `${zh}（${c}）`;
  return c || "—";
}

/** 行内/标题：「供体猪 ID · DON」 */
export function formatIdRuleTypeInline(code?: string | null): string {
  const c = (code || "").trim().toUpperCase();
  const zh = ID_RULE_TYPE_ZH[c];
  if (zh) return `${zh} · ${c}`;
  return c || "—";
}

export const PK_ID_RULE_OPTIONS: IdRuleTypeOption[] = PK_ID_RULE_CODES.map((value) => ({
  value,
  zhName: idRuleTypeZh(value),
  label: formatIdRuleSelectLabel(value),
}));
