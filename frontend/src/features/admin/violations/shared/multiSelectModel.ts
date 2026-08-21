/**
 * 多选下拉的纯逻辑层：值切换、触发器 chip 摘要、搜索过滤。
 * 全部为纯函数，不触碰 DOM / React，供单测与后续 Playwright 实测复用。
 */

export type MultiSelectOption<V extends string> = {
  value: V;
  label: string;
  desc?: string;
  tone?: "default" | "danger" | "info" | "ok" | "warn";
};

/** 切换一个值，返回新数组，不原地 mutate 入参。 */
export function toggleValue<V extends string>(values: V[], v: V): V[] {
  return values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
}

/** 触发器摘要：前 maxChips 个选中项 + 溢出计数。 */
export function summarizeChips<V extends string>(
  options: MultiSelectOption<V>[],
  values: V[],
  maxChips: number
): { chips: MultiSelectOption<V>[]; overflow: number } {
  const selected = options.filter((o) => values.includes(o.value));
  const limit = Math.max(0, maxChips);
  const chips = selected.slice(0, limit);
  return { chips, overflow: Math.max(0, selected.length - chips.length) };
}

/** 搜索过滤：匹配 label 或 desc，大小写不敏感；空关键字返回原数组。 */
export function filterOptions<V extends string>(
  options: MultiSelectOption<V>[],
  keyword: string
): MultiSelectOption<V>[] {
  const kw = keyword.trim().toLowerCase();
  if (kw === "") return options;
  return options.filter(
    (o) =>
      o.label.toLowerCase().includes(kw) ||
      (o.desc !== undefined && o.desc.toLowerCase().includes(kw))
  );
}
