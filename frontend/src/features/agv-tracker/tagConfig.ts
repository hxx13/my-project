/** 标签配置 — 内置 + 自定义标签统一管理 */

export interface CustomTag {
  id: string;       // 唯一标识，如 "custom_1700000000000"
  name: string;     // 显示名称
  color: string;    // 颜色 hex
  scope: "world" | "agv";  // world=全局跨车 / agv=绑定某台 AGV
  agvIp?: string;   // scope=agv 时必须指定归属 IP
  createdAt: number;
}

// ── 内置标签 ──
export const BUILTIN_TAG_OPTIONS = ["充电", "作业", "路径", "运输", "载货", "休息"] as const;

export const BUILTIN_TAG_COLORS: Record<string, string> = {
  "充电": "#22c55e",
  "作业": "#f59e0b",
  "路径": "#6b7280",
  "运输": "#3b82f6",
  "载货": "#f97316",
  "休息": "#14b8a6",
};

// ── localStorage keys ──
const CUSTOM_TAGS_KEY = "agvCustomTags";

// ── 加载自定义标签 ──
export function loadCustomTags(): CustomTag[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TAGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ── 保存自定义标签 ──
export function saveCustomTags(tags: CustomTag[]): void {
  localStorage.setItem(CUSTOM_TAGS_KEY, JSON.stringify(tags));
}

// ── 合并内置 + 自定义标签，返回完整列表 ──
export function getAllTagOptions(customTags: CustomTag[]): string[] {
  return [...BUILTIN_TAG_OPTIONS, ...customTags.map(t => t.name)];
}

// ── 获取标签颜色（内置优先，其次自定义） ──
export function getTagColor(tag: string, customTags: CustomTag[]): string {
  if (BUILTIN_TAG_COLORS[tag]) return BUILTIN_TAG_COLORS[tag];
  const ct = customTags.find(t => t.name === tag);
  return ct?.color ?? "#6b7280";
}

// ── 获取所有标签颜色映射 ──
export function getAllTagColors(customTags: CustomTag[]): Record<string, string> {
  const result: Record<string, string> = { ...BUILTIN_TAG_COLORS };
  for (const ct of customTags) {
    result[ct.name] = ct.color;
  }
  return result;
}

// ── 按作用域筛选可见标签 ──
export function getVisibleTags(
  agvIp: string,
  customTags: CustomTag[],
): string[] {
  const builtin = [...BUILTIN_TAG_OPTIONS];
  const custom = customTags
    .filter(t => t.scope === "world" || t.agvIp === agvIp)
    .map(t => t.name);
  return [...builtin, ...custom];
}

// ── 创建自定义标签帮助函数 ──
export function createCustomTag(
  name: string,
  color: string,
  scope: "world" | "agv",
  agvIp?: string,
): CustomTag {
  return {
    id: `custom_${Date.now()}`,
    name: name.trim(),
    color,
    scope,
    agvIp: scope === "agv" ? agvIp : undefined,
    createdAt: Date.now(),
  };
}
