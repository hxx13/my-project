/** 触发规则（通用规则）的「规则类型」枚举。sourceTag 与后端 ViolationRule.sourceTag 一致。 */
export const RULE_CATEGORIES = [
  { value: "滞留未签退", sourceTag: "AUTO_STRANDED", label: "滞留未签退（自动检测）" },
  { value: "手动违规", sourceTag: "MANUAL", label: "手动违规" },
  { value: "自定义", sourceTag: "", label: "自定义规则" },
] as const;

/** 由 sourceTag 反推展示用类别名；未命中一律归入「自定义」。 */
export function detectCategory(sourceTag?: string): string {
  const found = RULE_CATEGORIES.find((c) => c.sourceTag === sourceTag);
  return found?.value ?? "自定义";
}
