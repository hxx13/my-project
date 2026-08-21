/** NHP 动物研究对象展示文案：对象=动物，供体/受体=角色类型（非硬编码「受体NHP」标签）。 */

export function animalTypeLabel(t?: string | null): string {
  const u = (t || "").toUpperCase();
  if (u === "DONOR") return "供体";
  if (u === "RECIPIENT") return "受体";
  return t || "—";
}

export function animalTypeLongLabel(t?: string | null): string {
  const u = (t || "").toUpperCase();
  if (u === "DONOR") return "供体动物";
  if (u === "RECIPIENT") return "受体动物";
  return t || "动物";
}
