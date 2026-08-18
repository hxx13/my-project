/**
 * 购物车状态纯函数 —— 全端统一变更语义。
 *
 * Web / H5 / 快捷业务 / 管理端共用一个标准：
 * 基于最新态累加、clamp 到 [0, cap]、数量归零即删除该键、越界一律不产生新对象。
 * 杜绝两类塌缩：
 *  1) 用闭包旧快照覆盖新状态（同一 tick 多次变更时丢物品）；
 *  2) 并发全量替换互相覆盖（服务端整车 PUT 下最后赢家是旧快照）。
 *
 * 注意：本模块不负责写回（远程 PUT / localStorage），只负责「算出下一个状态」；
 * 写回由 useCartSync 统一处理。
 */

export type CartState = Record<string, number>;

/** 单键数量上限（与后端 saveCart 清洗一致，双端必须同值） */
export const CART_QTY_CAP = 999;

function resolveCap(max?: number): number {
  return max != null && Number.isFinite(max) && max > 0
    ? Math.min(CART_QTY_CAP, Math.floor(max))
    : CART_QTY_CAP;
}

/**
 * 将 key 置为 qty（clamp 到 [0, cap]）。qty <= 0 时删除该键。
 * - 结果与 base 相同（键已删除或未变化）时返回原对象引用，便于 React 跳过重渲染。
 */
export function cartSetQty(base: CartState, key: string, qty: number, max?: number): CartState {
  const nv = Math.max(0, Math.min(resolveCap(max), Math.floor(qty) || 0));
  if (nv === 0) {
    if (!(key in base)) return base;
    const next = { ...base };
    delete next[key];
    return next;
  }
  if (base[key] === nv) return base;
  return { ...base, [key]: nv };
}

/** 增减：key 当前值 + delta，clamp 到 [0, min(max, cap)]，归零删除。 */
export function cartAdd(base: CartState, key: string, delta: number, max?: number): CartState {
  return cartSetQty(base, key, (base[key] || 0) + delta, max);
}

/** 清空：返回新空对象。 */
export const cartClear = (): CartState => ({});

/** 总件数：求和并跳过非法值。 */
export function cartTotal(cart: CartState): number {
  let sum = 0;
  for (const v of Object.values(cart)) {
    if (Number.isFinite(v) && v > 0) sum += v;
  }
  return sum;
}

/** 是否为空。 */
export function cartIsEmpty(cart: CartState): boolean {
  return cartTotal(cart) === 0;
}
