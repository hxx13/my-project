type StockInfo = {
  stockMode?: string | null;
  stockQty?: number | null;
  lockedQty?: number | null;
  availableQty?: number | null;
};

function resolveStockInfo(item: StockInfo) {
  const stock = Number(item.stockQty ?? 0);
  const locked = Number(item.lockedQty ?? 0);
  const avail =
    item.availableQty != null
      ? Number(item.availableQty)
      : Math.max(0, stock - locked);
  return { stock, locked, avail };
}

/** 商城/领用侧：首数字=剩余可领（账面−锁定），有锁定时标注锁定占用。FLAG：有货/缺货。 */
export function formatSupplyStockLabel(item: StockInfo): string {
  const { stock, locked, avail } = resolveStockInfo(item);
  if (String(item.stockMode || "") === "FLAG") return avail >= 1 ? "有货" : "缺货";
  if (locked > 0) return `库存剩余 ${avail} · 已锁定 ${locked}`;
  return `库存 ${stock}`;
}

/** 管理侧：改库存针对账面总数，因此首数字=账面，有锁定时同屏披露剩余可领与锁定占用。 */
export function formatSupplyStockAdminLabel(item: StockInfo): string {
  const { stock, locked, avail } = resolveStockInfo(item);
  if (String(item.stockMode || "") === "FLAG") return avail >= 1 ? "有货" : "缺货";
  if (locked > 0) return `库存 ${stock}（剩余可领 ${avail} · 已锁定 ${locked}）`;
  return `库存 ${stock}`;
}
