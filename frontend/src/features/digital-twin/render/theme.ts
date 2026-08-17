// 数字孪生 HVAC 拓扑 render 层的主题常量与语义工具。
// 中性色（面板/文字/边框）一律用项目的 --twin-* 变量，随浅色/深色自动切换；
// 本文件只放领域相关的「分类色 / 告警色 / 边色 / 强调色」，用中间调色值，在明暗两态下都可读。

import type { BindingSemantic, NodeKind } from "@/features/digital-twin/schema/types";

/** 各节点类型的描边/发光主色（中间调，明暗皆可读）。 */
export const NODE_KIND_COLOR: Record<NodeKind, string> = {
  equipment: "#0891b2",
  acZone: "#8b5cf6",
  room: "#059669",
};

/** 各节点类型的卡片填充色：分类色淡染 + 主题软画布底，随明暗自动切换。 */
export const NODE_KIND_FILL: Record<NodeKind, string> = {
  equipment: "color-mix(in srgb, #0891b2 12%, var(--twin-canvas-soft))",
  acZone: "color-mix(in srgb, #8b5cf6 12%, var(--twin-canvas-soft))",
  room: "color-mix(in srgb, #059669 12%, var(--twin-canvas-soft))",
};

/** 告警态统一使用的颜色（边框 + 发光）。 */
export const ALARM_COLOR = "#e11d48";

/** 强调色：遥测读数、激活态、连线提示等，随用途复用。 */
export const ACCENT_COLOR = "#0891b2";

/** 送风边（主气流）颜色。 */
export const EDGE_MAIN_COLOR = "#059669";

/** 回风边颜色。 */
export const EDGE_RETURN_COLOR = "#94a3b8";

/** 语义 → 短标签映射表。 */
const SEMANTIC_TAGS: Record<BindingSemantic, string> = {
  temperature: "温",
  humidity: "湿",
  pressure: "压",
  status: "状态",
  generic: "值",
};

/** 语义 → 短标签（label 缺失时的兜底）。 */
export function semanticTag(semantic: BindingSemantic): string {
  return SEMANTIC_TAGS[semantic];
}
