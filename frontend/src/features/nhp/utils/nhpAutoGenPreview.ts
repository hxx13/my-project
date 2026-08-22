/**
 * NHP 填写页自动生成字段：DERIVED 派生预览 + 必填校验辅助。
 * PK 取号预览仍走 ids/preview（见 nhpPkIdContext + NhpFillWorkbench）。
 */
import type { FormField } from "../schema/formTemplate";

function hasFieldValue(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** 已知 DERIVED 概念码（对齐 crf_field.concept_code） */
const CONCEPT_PAIR_SCORE = "PAIR_SCORE";
const CONCEPT_VR = "VR";

function numVal(values: Record<string, unknown>, key: string): number | undefined {
  const v = values[key];
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function strVal(values: Record<string, unknown>, key: string): string | undefined {
  const v = values[key];
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function findFieldKey(allFields: FormField[] | undefined, ...suffixes: string[]): string | undefined {
  if (!allFields?.length) return undefined;
  for (const suffix of suffixes) {
    const hit = allFields.find((f) => f.fieldKey.endsWith(suffix) || f.fieldKey.includes(suffix));
    if (hit) return hit.fieldKey;
  }
  return undefined;
}

function resolveConceptCode(field: FormField): string | undefined {
  const fromField = field.conceptCode?.trim().toUpperCase();
  if (fromField) return fromField;
  const fromMeta = field.roleMeta?.derivedSource?.trim();
  if (fromMeta === CONCEPT_PAIR_SCORE || fromMeta === CONCEPT_VR) return fromMeta;
  const fromConfig = field.config?.conceptCode?.trim();
  if (fromConfig) return fromConfig.toUpperCase();
  if (field.fieldKey.endsWith("D3.01.006")) return CONCEPT_PAIR_SCORE;
  if (field.fieldKey.endsWith("D10.02.006")) return CONCEPT_VR;
  return undefined;
}

/** 交叉配型结果 → 分项得分（V1 规则引擎占位，待后端 calc_expression 落地后替换） */
function xmResultPoints(result?: string): number | undefined {
  if (!result) return undefined;
  const r = result.trim();
  if (/阴性/i.test(r)) return 100;
  if (/弱阳/i.test(r)) return 50;
  if (/阳性/i.test(r)) return 0;
  return undefined;
}

/** 配对评分：CDC / 流式 / ADCC 均值（0–100） */
function computePairingScore(values: Record<string, unknown>, allFields?: FormField[]): string | undefined {
  const cdcKey = findFieldKey(allFields, "D3.01.003", "cdc_xm_result");
  const flowKey = findFieldKey(allFields, "D3.01.004", "flow_xm_result");
  const adccKey = findFieldKey(allFields, "D3.01.005", "adcc_result");
  const parts = [cdcKey, flowKey, adccKey]
    .map((k) => (k ? xmResultPoints(strVal(values, k)) : undefined))
    .filter((n): n is number => n != null);
  if (!parts.length) return undefined;
  const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
  return avg.toFixed(1);
}

/** 血管阻力：压力 / 流量（mmHg/(mL/min)）；优先门静脉，双路时回退肝动脉 */
function computeVascularResistance(values: Record<string, unknown>, allFields?: FormField[]): string | undefined {
  const pvFlowKey = findFieldKey(allFields, "D10.02.002", "pv_flow");
  const pvPressKey = findFieldKey(allFields, "D10.02.004", "pv_pressure");
  const haFlowKey = findFieldKey(allFields, "D10.02.003", "ha_flow");
  const haPressKey = findFieldKey(allFields, "D10.02.005", "ha_pressure");

  const pairs: [string | undefined, string | undefined][] = [
    [pvPressKey, pvFlowKey],
    [haPressKey, haFlowKey],
  ];
  for (const [pressKey, flowKey] of pairs) {
    if (!pressKey || !flowKey) continue;
    const p = numVal(values, pressKey);
    const q = numVal(values, flowKey);
    if (p == null || q == null || q === 0) continue;
    return (p / q).toFixed(2);
  }
  return undefined;
}

export function isAutoGenField(field: FormField): boolean {
  return field.role === "PK" || field.role === "DERIVED";
}

/** 已落库值，或自动生成字段的有效预览 */
export function hasEffectiveFieldValue(
  field: FormField,
  values: Record<string, unknown>,
  previews: Record<string, string>,
): boolean {
  if (hasFieldValue(values[field.fieldKey])) return true;
  if (isAutoGenField(field) && previews[field.fieldKey]) return true;
  return false;
}

/** DERIVED 字段：从当前表单上下文计算预览（不落库） */
export function computeDerivedPreview(
  field: FormField,
  values: Record<string, unknown>,
  allFields?: FormField[],
): string | undefined {
  const concept = resolveConceptCode(field);
  switch (concept) {
    case CONCEPT_PAIR_SCORE:
      return computePairingScore(values, allFields);
    case CONCEPT_VR:
      return computeVascularResistance(values, allFields);
    default:
      return undefined;
  }
}

/** 保存/提交前：把 DERIVED 预览写入 values 副本（PK 仍由 ensurePkValues 处理） */
export function applyDerivedPreviews(
  src: Record<string, unknown>,
  derivedFields: FormField[],
  previews: Record<string, string>,
): Record<string, unknown> {
  const next = { ...src };
  for (const f of derivedFields) {
    const key = f.fieldKey;
    if (hasFieldValue(next[key])) continue;
    const preview = previews[key];
    if (preview) next[key] = preview;
  }
  return next;
}
