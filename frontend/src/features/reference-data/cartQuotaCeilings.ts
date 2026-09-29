/**
 * 购物车行的周期上限算术（小程序 `_reconcileQuota` 是同一套，改这里要同步改那边）。
 *
 * `available` = 上限 − **订单已占**（服务端 `SpecQuotaService.usedQty`）。**购物车不占额度**：
 * 加购只是意向，扣减发生在提交订单那一刻，所以这里的数不会因为自己往车里加东西而变小。
 *
 * 由此两条规则：
 * - 全组可保留总量 = `max(0, available)`，且**下限取 0**（上限被调小、订单已超额时，可用量是负的）；
 * - 本行天花板 = 本行现有数量 + 全组还能加的余量。
 *
 * 「收敛」只在一个场景发生：**别人下单把额度吃掉**，导致本车已填数量超过剩余 —— 那时削掉超出部分
 * 并弹提示（不静默改数）。
 */

export interface CartQuotaRow {
  id: number;
  qty: number;
  /** 只有当前登录人能改的行才会被改写；不可改的行仍占配额 */
  editable: boolean;
}

export interface CartQuotaPlan {
  /** 每个可改行的天花板（本行最多能到多少），供 +/手输当闸门 */
  ceilings: Map<number, number>;
  /** 需要收敛的行与目标数量（全组确实超了才有） */
  converge: Array<{ id: number; qty: number }>;
}

export function planCartQuota(rows: CartQuotaRow[], available: number): CartQuotaPlan {
  const ceilings = new Map<number, number>();
  const converge: Array<{ id: number; qty: number }> = [];
  if (!rows.length || !Number.isFinite(available)) return { ceilings, converge };

  const groupTotal = rows.reduce((s, r) => s + r.qty, 0);
  const allowedTotal = Math.max(0, available); // 购物车不占额度，剩余多少就能在车里留多少
  const headroom = Math.max(0, allowedTotal - groupTotal);
  let remaining = allowedTotal;
  for (const r of rows) {
    // 前面的行先占，后面的削 —— 削谁都要有个顺序，按加入顺序保住早的那条
    const keep = Math.min(r.qty, Math.max(0, remaining));
    remaining -= keep;
    if (!r.editable) continue;
    ceilings.set(r.id, r.qty + headroom);
    if (keep < r.qty) converge.push({ id: r.id, qty: keep });
  }
  return { ceilings, converge };
}
