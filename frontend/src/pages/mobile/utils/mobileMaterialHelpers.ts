/** 与小程序 package-feature/utils/materialStudentApi.js 同源（含规格购物车 key） */
import { webImageSrc } from "@/utils/mediaUrl";
import type { MobileMaterialItem } from "@/api/domains/mobileStudent.api";
import {
  hasSpecSchema,
  itemIdFromCartKey,
  parseSpecCartKey,
  sumCartQtyForItem,
} from "./mobileSpecHelpers";

export interface DecoratedMaterialItem extends MobileMaterialItem {
  coverAbsUrl?: string;
  nameInitial: string;
  stockLineText: string;
  hasSpec?: boolean;
  itemCartQty?: number;
  _outOfStock?: boolean;
}

export interface CartLine {
  id: string;
  itemId: number;
  name: string;
  coverAbsUrl?: string;
  nameInitial: string;
  qty: number;
  specLabel?: string;
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
  return Number(item.stockQty ?? item.stockQuantity) >= 1 ? 9999 : 0;
}

function isOutOfStock(item: MobileMaterialItem): boolean {
  if (item.stockMode === "UNLIMITED") return false;
  if (item.stockMode === "QUANTIFIED") {
    return (Number(item.stockQty ?? item.stockQuantity) || 0) <= 0;
  }
  return Number(item.stockQty ?? item.stockQuantity) < 1;
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
      hasSpec: hasSpecSchema(it.specSchema),
      _outOfStock: isOutOfStock(it),
    };
  });
}

export function enrichWithCartQty(
  items: DecoratedMaterialItem[],
  cart: Record<string, number>,
): DecoratedMaterialItem[] {
  return items.map((it) => ({
    ...it,
    itemCartQty: sumCartQtyForItem(cart, it.id),
  }));
}

export function buildCartLines(
  cart: Record<string, number>,
  items: DecoratedMaterialItem[],
): CartLine[] {
  const out: CartLine[] = [];
  for (const [k, qty] of Object.entries(cart || {})) {
    if (!qty || qty <= 0) continue;
    const parsed = parseSpecCartKey(k);
    const it = items.find((x) => x.id === parsed.itemId);
    out.push({
      id: k,
      itemId: parsed.itemId,
      name: it?.name || "物品",
      coverAbsUrl: it?.coverAbsUrl,
      nameInitial: it?.nameInitial || "?",
      qty,
      specLabel: parsed.specLabel || undefined,
    });
  }
  return out;
}

export function cartTotalQty(cart: Record<string, number>): number {
  return Object.values(cart || {}).reduce((s, n) => s + (Number(n) || 0), 0);
}

export function reconcileCartWithStock(
  cart: Record<string, number>,
  items: DecoratedMaterialItem[],
): Record<string, number> {
  const next = { ...cart };
  let changed = false;
  for (const it of items) {
    const max = maxQtyForItem(it);
    for (const key of Object.keys(next)) {
      if (itemIdFromCartKey(key) !== it.id) continue;
      if (max <= 0) {
        delete next[key];
        changed = true;
      } else if (next[key] > max) {
        next[key] = max;
        changed = true;
      }
    }
  }
  return changed ? next : cart;
}

export function loadPersistedCart(storageKey: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, number>;
    const cart: Record<string, number> = {};
    for (const [k, v] of Object.entries(o || {})) {
      const qty = Number(v);
      if (Number.isFinite(qty) && qty > 0) cart[k] = Math.min(Math.floor(qty), 999);
    }
    return cart;
  } catch {
    return {};
  }
}

export function persistCart(storageKey: string, cart: Record<string, number>) {
  localStorage.setItem(storageKey, JSON.stringify(cart || {}));
}
