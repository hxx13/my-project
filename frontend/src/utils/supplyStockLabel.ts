/** QUANTIFIED：有锁定时展示账面库存 + 锁定量；无锁定仅「库存 N」。FLAG：有货/缺货。 */
export function formatSupplyStockLabel(item: {
  stockMode?: string | null;
  stockQty?: number | null;
  lockedQty?: number | null;
  availableQty?: number | null;
}): string {
  const mode = String(item.stockMode || "");
  const stock = Number(item.stockQty ?? 0);
  const locked = Number(item.lockedQty ?? 0);
  const avail =
    item.availableQty != null
      ? Number(item.availableQty)
      : Math.max(0, stock - (Number.isFinite(locked) ? locked : 0));

  if (mode === "FLAG") {
    return avail >= 1 ? "有货" : "缺货";
  }
  if (Number.isFinite(locked) && locked > 0) {
    return `库存 ${stock} · 不含锁定 ${locked}`;
  }
  return `库存 ${stock}`;
}
