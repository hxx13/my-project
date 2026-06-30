/** 与小程序 package-feature/utils/materialStudentApi.js 同源 */
import { webImageSrc } from "@/utils/mediaUrl";
import type { MobileMaterialItem } from "@/api/domains/mobileStudent.api";

export interface DecoratedMaterialItem extends MobileMaterialItem {
  coverAbsUrl?: string;
  nameInitial: string;
  stockLineText: string;
}

export interface CartLine {
  id: number;
  name: string;
  coverAbsUrl?: string;
  nameInitial: string;
  qty: number;
}

const REQUEST_STATUS_ZH: Record<string, string> = {
  DRAFT: "草稿",
  PENDING: "待审核",
  FIRST_OK: "初审通过",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
  FULFILLED: "待领取",
  RECEIVED: "已完成",
};

export function requestStatusText(status: string | null | undefined): string {
  const key = String(status || "").toUpperCase();
  return REQUEST_STATUS_ZH[key] || status || "-";
}

export function formatMaterialTime(v: string | null | undefined): string {
  if (!v) return "-";
  return String(v).replace("T", " ").slice(0, 16);
}

export function stockLineText(item: MobileMaterialItem | null | undefined): string {
  if (!item) return "";
  if (item.stockMode === "UNLIMITED") return "无限";
  if (item.stockMode === "FLAG") {
    return Number(item.stockQty) >= 1 ? "有货" : "缺货";
  }
  if (item.showStockQty === 0) return "有货";
  const q = item.stockQty != null ? item.stockQty : item.stockQuantity;
  return `库存 ${q != null ? q : 0}`;
}

export function maxQtyForItem(item: MobileMaterialItem | null | undefined): number {
  if (!item) return 0;
  if (item.stockMode === "UNLIMITED") return 999;
  if (item.stockMode === "QUANTIFIED") {
    return Math.max(0, Number(item.stockQty ?? item.stockQuantity) || 0);
  }
  return Number(item.stockQty ?? item.stockQuantity) >= 1 ? 99 : 0;
}

export function decorateMaterialItems(list: MobileMaterialItem[]): DecoratedMaterialItem[] {
  return (list || []).map((it) => {
    const name = it.name != null ? String(it.name) : "";
    const ch = name.trim().charAt(0) || "?";
    const cover = it.coverUrl || it.thumbnailUrl;
    return {
      ...it,
      coverAbsUrl: webImageSrc(cover),
      nameInitial: ch,
      stockLineText: stockLineText(it),
    };
  });
}

export function buildCartLines(
  cart: Record<number, number>,
  items: DecoratedMaterialItem[],
): CartLine[] {
  const out: CartLine[] = [];
  for (const [k, qty] of Object.entries(cart || {})) {
    const id = Number(k);
    if (!Number.isFinite(id) || id <= 0 || qty <= 0) continue;
    const it = items.find((x) => x.id === id);
    out.push({
      id,
      name: it?.name || "物品",
      coverAbsUrl: it?.coverAbsUrl,
      nameInitial: it?.nameInitial || "?",
      qty,
    });
  }
  return out;
}

export function cartTotalQty(cart: Record<number, number>): number {
  return Object.values(cart || {}).reduce((s, n) => s + (Number(n) || 0), 0);
}

export function reconcileCartWithStock(
  cart: Record<number, number>,
  items: DecoratedMaterialItem[],
): Record<number, number> {
  const next = { ...cart };
  let changed = false;
  for (const it of items) {
    const id = it.id;
    if (next[id] == null) continue;
    const max = maxQtyForItem(it);
    if (max <= 0) {
      delete next[id];
      changed = true;
    } else if (next[id] > max) {
      next[id] = max;
      changed = true;
    }
  }
  return changed ? next : cart;
}
