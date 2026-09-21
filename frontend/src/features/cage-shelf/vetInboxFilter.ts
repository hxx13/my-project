import type { CageVetMessage } from "@/api/domains/cageShelf.api";

/**
 * 兽医收件箱的筛选 / 搜索口径。
 *
 * ⚠️ **必须与小程序 `aroapp/miniprogram/package-feature/utils/vetInboxSections.js` 逐字一致**：
 * 同一批消息在两个端上筛出来的结果不一样，用户会认为其中一端坏了。改这里就同步改那边。
 * 小程序侧的等价实现在那边有单测（`tests/vetInboxSections.test.js`），这边由
 * `__tests__/vetInboxFilter.test.ts` 钉住，两边用的是同一批用例。
 */

export type InboxFilter = "all" | "pending" | "replied";

/** 回没回意见，与「已读/未读」是两条独立轴：可以看完还没回，也可以没点已查看就先回了 */
export const INBOX_FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待回意见" },
  { key: "replied", label: "已回意见" },
];

/** 搜索命中的字段 */
export const INBOX_KEYWORD_FIELDS = [
  "positionLabel", "shelveName", "roomName", "floorName", "campusName",
  "projectPiName", "experimenterName", "aupNumber", "cageBoxCode", "statusLabel",
] as const;

/** 回过指导意见（文字或图片任一） */
export function hasVetAdvice(m: Pick<CageVetMessage, "adviceText" | "adviceImages">): boolean {
  return !!m.adviceText?.trim() || (m.adviceImages?.length ?? 0) > 0;
}

export function matchesInboxFilter(
  m: Pick<CageVetMessage, "adviceText" | "adviceImages">,
  f: InboxFilter,
): boolean {
  if (f === "replied") return hasVetAdvice(m);
  if (f === "pending") return !hasVetAdvice(m);
  return true;
}

export function matchesInboxKeyword(m: CageVetMessage, kw: string): boolean {
  const k = kw.trim().toLowerCase();
  if (!k) return true;
  return INBOX_KEYWORD_FIELDS.some((f) => String(m[f] ?? "").toLowerCase().includes(k));
}

/** 筛选胶囊上的数字：跟着关键字走，筛完只剩 0 的按钮自己就说明白了 */
export function vetInboxFilterCounts(
  list: CageVetMessage[],
  kw: string,
): { all: number; pending: number; replied: number } {
  const c = { all: 0, pending: 0, replied: 0 };
  for (const m of list) {
    if (!matchesInboxKeyword(m, kw)) continue;
    c.all += 1;
    if (hasVetAdvice(m)) c.replied += 1;
    else c.pending += 1;
  }
  return c;
}
