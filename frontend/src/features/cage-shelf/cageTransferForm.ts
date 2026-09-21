import type { CageTransferFormData } from "@/api/domains/cageShelf.api";

/**
 * 转移单提交载荷的组装 —— 与弹窗的渲染无关，单独放这里是为了能脱离 DOM 断言。
 *
 * <p>核心口径：**只发学生动过的值**。自动值不落库、每次可重算，多发一个自动值
 * 就等于把那一刻的自动值冻进单子；后端对每个缺失字段各自回退到自动值。
 */

export type TransferFormTopField = "transferDate" | "unitName" | "phone";
export type TransferFormRowField = "strain" | "female" | "male";

/** 学生**改动过**的字段（与自动值相同的一律不进这里）。 */
export interface TransferFormEdits {
  transferDate?: string;
  unitName?: string;
  phone?: string;
  /** 目标笼位 id → 该行改过的字段 */
  rows?: Record<string, Partial<Record<TransferFormRowField, string>>>;
}

/** 数量格的防呆上界：夸张的数会让后端 Integer 解析炸掉整份 transferForm，学生的填写会被静默丢掉。 */
const MAX_COUNT = 100000;

/**
 * 组装提交载荷。行按**序号**与目标列表对齐（后端按下标取行），
 * 所以只要有任意一行动过，就要发等长的数组，没动的那几行留空对象。
 */
export function buildTransferForm(
  edits: TransferFormEdits,
  targetIds: string[],
): CageTransferFormData | undefined {
  const out: CageTransferFormData = {};
  if (edits.transferDate !== undefined) out.transferDate = edits.transferDate.trim();
  if (edits.unitName !== undefined) out.unitName = edits.unitName.trim();
  if (edits.phone !== undefined) out.phone = edits.phone.trim();

  const rows = targetIds.map((id) => {
    const e = edits.rows?.[id];
    const row: { strain?: string; female?: number; male?: number } = {};
    if (!e) return row;
    if (e.strain !== undefined) row.strain = e.strain.trim();
    for (const f of ["female", "male"] as const) {
      const raw = e[f]?.trim();
      if (raw === undefined || raw === "") continue;
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0 && n < MAX_COUNT) row[f] = Math.floor(n);
    }
    return row;
  });
  if (rows.some((r) => Object.keys(r).length > 0)) out.rows = rows;

  return Object.keys(out).length > 0 ? out : undefined;
}
