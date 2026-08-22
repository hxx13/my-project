/**
 * PK 取号上下文：从研究对象 + 表单已填值拼出 ids/preview、ids/next 所需 ctx。
 */
import type { FormField } from "../schema/formTemplate";
import type { NhpSubject } from "../api/nhpRecord.api";
import { DERIVED_ID_RULE_TYPES, PK_ID_RULE_OPTIONS } from "./nhpIdRuleLabels";

const PK_ID_TYPES = new Set(PK_ID_RULE_OPTIONS.map((o) => o.value));
const DERIVED_ID_TYPES = new Set<string>(DERIVED_ID_RULE_TYPES);

/** 从 unit 形如「ANES-XXX」「TX-XXX」推断 ID 类型（种子模板未写 roleMeta.pkRule 时的回退） */
function inferPkIdTypeFromUnit(field: FormField): string | undefined {
  const unit = (field.config?.unit ?? "").trim().toUpperCase();
  const m = /^([A-Z]{2,4})-/.exec(unit);
  if (!m) return undefined;
  const code = m[1];
  return PK_ID_TYPES.has(code) || DERIVED_ID_TYPES.has(code) ? code : undefined;
}

export function resolvePkIdType(field: FormField): string | undefined {
  const rule = field.roleMeta?.pkRule?.trim().toUpperCase();
  if (rule) return rule;
  return inferPkIdTypeFromUnit(field);
}

export function isDerivedPkIdType(idType: string): boolean {
  return DERIVED_ID_TYPES.has(idType.toUpperCase());
}

function strVal(values: Record<string, unknown>, key: string): string | undefined {
  const v = values[key];
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function yymmdd(): string {
  return new Date().toISOString().slice(2, 10).replace(/-/g, "");
}

function yymm(): string {
  return yymmdd().slice(0, 4);
}

/** 将已知的 PK 字段值写入 ctx（供 TX/REG/SMP 等依赖上游主键的规则使用）。 */
function mergePkValuesFromForm(
  ctx: Record<string, unknown>,
  values: Record<string, unknown>,
  allFields?: FormField[],
) {
  if (!allFields) return;
  for (const f of allFields) {
    const idType = resolvePkIdType(f);
    const v = strVal(values, f.fieldKey);
    if (!idType || !v) continue;
    switch (idType) {
      case "DON":
        ctx.donor = v;
        ctx.DON = v;
        ctx.DONOR = v;
        ctx.don = v;
        break;
      case "RCP":
        ctx.recip = v;
        ctx.RECIP = v;
        ctx.recipient = v;
        break;
      case "TX":
        ctx.tx = v;
        ctx.TX = v;
        ctx.txCode = v;
        break;
      case "REG":
        ctx.reg = v;
        ctx.REG = v;
        ctx.regimenCode = v;
        break;
      case "TST":
        ctx.testId = v;
        ctx.TEST_ID = v;
        ctx.testCode = v;
        break;
      default:
        break;
    }
  }
}

/** 研究对象级主键：DON/RCP 在登记时已取号则直接用作预览/落库，不再递增。 */
export function subjectPkCode(subject: NhpSubject | null | undefined, idType: string): string | undefined {
  if (!subject?.subjectCode) return undefined;
  const type = idType.toUpperCase();
  if (type === "DON" && subject.subjectType === "DONOR") return subject.subjectCode;
  if (type === "RCP" && subject.subjectType === "RECIPIENT") return subject.subjectCode;
  return undefined;
}

export function buildPkIdContext(
  idType: string,
  subject: NhpSubject | null | undefined,
  values: Record<string, unknown>,
  allFields?: FormField[],
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {
    year: new Date().getFullYear(),
  };

  if (subject?.farmCode) {
    ctx.base = subject.farmCode;
    ctx.farm = subject.farmCode;
    ctx.farmCode = subject.farmCode;
  }

  if (subject?.subjectCode) {
    if (subject.subjectType === "DONOR") {
      ctx.donor = subject.subjectCode;
      ctx.DON = subject.subjectCode;
      ctx.DONOR = subject.subjectCode;
      ctx.don = subject.subjectCode;
    } else if (subject.subjectType === "RECIPIENT") {
      ctx.recip = subject.subjectCode;
      ctx.RECIP = subject.subjectCode;
      ctx.recipient = subject.subjectCode;
    }
  }

  mergePkValuesFromForm(ctx, values, allFields);

  const date = yymmdd();
  ctx.date = date;
  ctx["日期"] = date;
  const ym = yymm();
  ctx.yearmonth = ym;
  ctx["年月"] = ym;

  return ctx;
}
