/**
 * ============================================================================
 * 物品台账 · 图形视图 — 共享常量 & 工具函数
 * ============================================================================
 *
 * 本文件是 inventory 图形视图的唯一常量来源。组件引用分类色、几何判定、
 * 树查找等辅助函数时统一从这里 import。
 */

import type { Item, SpaceNode } from "@/api/domains/inventory.api";

/* ═══════════════════════════════════════════════════════════
   分类 → 颜色映射
   手术用品(天蓝) / 医疗器械(紫) / 药品(玫红) / 消耗品(绿)
   ═══════════════════════════════════════════════════════════ */

export const CATEGORY_COLORS: Record<string, string> = {
  "手术用品": "#0ea5e9",
  "医疗器械": "#8b5cf6",
  "药品": "#f43f5e",
  "消耗品": "#10b981",
};

/** 平面图头部图例，按固定顺序展示 */
export const CATEGORY_LEGEND: Array<{ name: string; color: string }> = [
  { name: "手术用品", color: "#0ea5e9" },
  { name: "医疗器械", color: "#8b5cf6" },
  { name: "药品", color: "#f43f5e" },
  { name: "消耗品", color: "#10b981" },
];

const FALLBACK_PALETTE = ["#0ea5e9", "#8b5cf6", "#f43f5e", "#10b981", "#f59e0b", "#06b6d4", "#6366f1"];

/** 未知分类名 → 稳定取色（按字符哈希落到调色板） */
export function categoryColor(name: string | null | undefined): string {
  if (!name) return "#a1a1a1";
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}

/* ═══════════════════════════════════════════════════════════
   空间树工具
   ═══════════════════════════════════════════════════════════ */

/** 深度优先拍平 */
export function flattenNodes(nodes: SpaceNode[]): SpaceNode[] {
  const out: SpaceNode[] = [];
  const walk = (list: SpaceNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function findNode(nodes: SpaceNode[], id: number | null): SpaceNode | null {
  if (id == null) return null;
  for (const n of nodes) {
    if (n.id === id) return n;
    const r = findNode(n.children ?? [], id);
    if (r) return r;
  }
  return null;
}

/** 根 → 目标节点的路径段 */
export function buildPath(nodes: SpaceNode[], id: number | null): Array<{ id: number; name: string }> {
  if (id == null) return [];
  const walk = (list: SpaceNode[], trail: Array<{ id: number; name: string }>): Array<{ id: number; name: string }> | null => {
    for (const n of list) {
      const next = [...trail, { id: n.id, name: n.name }];
      if (n.id === id) return next;
      const r = walk(n.children ?? [], next);
      if (r) return r;
    }
    return null;
  };
  return walk(nodes, []) ?? [];
}

/** 目标节点所有祖先（不含自身）的 id，用于自动展开到选中项 */
export function ancestorIds(nodes: SpaceNode[], id: number | null): number[] {
  return buildPath(nodes, id).slice(0, -1).map((s) => s.id);
}

/** 节点是否带完整几何信息（posX/posY/width/height 均非空） */
export function hasGeometry(n: SpaceNode): boolean {
  return n.posX != null && n.posY != null && n.width != null && n.height != null;
}

/** 归一化坐标(0~1) → 百分比字符串；非法/缺失时回退 */
export function pct(v: number | null | undefined, fallbackPct: number): string {
  if (v == null || !Number.isFinite(v)) return `${fallbackPct}%`;
  const c = Math.min(1, Math.max(0, v));
  return `${c * 100}%`;
}

/** 将数值夹到 [0,1]（拖拽换算归一化坐标用） */
export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** 对一组空间节点（含各自全部后代）的 itemCount 求和，得到子树物品总数 */
export function sumSubtreeItemCount(nodes: SpaceNode[]): number {
  let total = 0;
  const walk = (list: SpaceNode[]) => {
    for (const n of list) {
      total += n.itemCount ?? 0;
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return total;
}

/* ═══════════════════════════════════════════════════════════
   物品工具
   ═══════════════════════════════════════════════════════════ */

export function groupBySpace(list: Item[]): Map<number, Item[]> {
  const m = new Map<number, Item[]>();
  for (const it of list) {
    if (it.spaceId == null) continue;
    const arr = m.get(it.spaceId) ?? [];
    arr.push(it);
    m.set(it.spaceId, arr);
  }
  return m;
}

/** 最近盘点时间 → "MM-DD"（如 08-15） */
export function formatDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = String(v).slice(0, 10);
  return d.length >= 10 ? d.slice(5) : d || "—";
}

/** 完整时间 → "YYYY-MM-DD HH:mm" */
export function formatDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  return String(v).replace("T", " ").slice(0, 16);
}

const LOG_TYPE_LABELS: Record<string, string> = {
  CREATE: "新建",
  UPDATE: "更新",
  TRANSFER: "转移",
  SCAN_FOUND: "盘点在库",
  SCAN_NEW: "盘点新增",
  SCAN_MISSING: "盘点缺失",
  RETIRE: "废弃",
};

export function logTypeLabel(t: string): string {
  return LOG_TYPE_LABELS[t] ?? t;
}

/* ═══════════════════════════════════════════════════════════
   物品字段标签
   ═══════════════════════════════════════════════════════════ */

const GRANULARITY_LABELS: Record<string, string> = { UNIT: "一物一码", BATCH: "一批一码" };
const STATUS_LABELS: Record<string, string> = { IN_USE: "在库", MISSING: "丢失待确认", RETIRED: "已废弃" };

export function granularityLabel(g: string | null | undefined): string {
  if (!g) return "—";
  return GRANULARITY_LABELS[g] ?? g;
}

export function statusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return STATUS_LABELS[s] ?? s;
}

/** 状态 → 圆点颜色（在库=绿 / 丢失待确认=橙 / 废弃=灰） */
export function statusColor(s: string | null | undefined): string {
  if (s === "MISSING") return "#f59e0b";
  if (s === "RETIRED") return "#94a3b8";
  return "#10b981";
}

/** 是否按「批量」展示数量（BATCH 或 qty > 1） */
export function showQty(it: { granularity?: string | null; qty?: number | null }): boolean {
  return it.granularity === "BATCH" || (it.qty ?? 1) > 1;
}

/** 解析详情图 JSON 字符串 → URL 数组 */
export function parseDetailImages(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) return j.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
  return [];
}
