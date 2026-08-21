/**
 * 标签展示层派生函数。
 *
 * 标签本身是服务端实体（见 `@/api/domains/agvTag.api`）——内置标签也在
 * `agv_tag` 表里，与自定义标签同构。此处刻意不保留任何内置标签常量：
 * 一旦前端也存一份，它就会和服务端种子数据构成第二处真相，改了颜色两边不一致。
 */
import type { AgvTag } from "@/api/domains/agvTag.api";

/** 标签未定义颜色时的兜底，与服务端 agv_tag.color 的默认值一致 */
export const DEFAULT_TAG_COLOR = "#6b7280";

/** 全部标签名 */
export function getAllTagOptions(tags: AgvTag[]): string[] {
  return tags.map((t) => t.name);
}

/** 标签名 → 颜色 */
export function getAllTagColors(tags: AgvTag[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const t of tags) result[t.name] = t.color || DEFAULT_TAG_COLOR;
  return result;
}

/** 某台车可见的标签名：world 标签全局可见，agv 标签只对绑定的那台车可见 */
export function getVisibleTags(agvIp: string, tags: AgvTag[]): string[] {
  return tags
    .filter((t) => t.scope === "world" || t.robotIp === agvIp)
    .map((t) => t.name);
}
