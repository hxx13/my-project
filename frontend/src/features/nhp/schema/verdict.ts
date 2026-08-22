/**
 * verdict 四态（22 §6.5：校对意见维度，独立于字段/码表的 status 生命周期）。
 * 字段审核页与码表审核页共用。
 */
export type Verdict = "CONFIRM" | "MODIFY" | "DELETE" | "QUESTION";

export const VERDICT_OPTIONS: { value: Verdict; label: string }[] = [
  { value: "CONFIRM", label: "确认" },
  { value: "MODIFY", label: "需修改" },
  { value: "DELETE", label: "建议删除" },
  { value: "QUESTION", label: "有疑问" },
];

export function verdictLabel(v?: string | null): string {
  return VERDICT_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "—";
}
