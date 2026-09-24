/**
 * 购物车行的周期上限算术（小程序 `_reconcileQuota` 是同一套，改这里要同步改那边）。
 *
 * 关键是 `available` **已经把本行的数量算进「已用」了**：服务端 `SpecQuotaService.usedQty`
 * 累加的是「全部购物车行 + 未作废订单行」。所以对一行来说：
 *
 * - 全组可保留总量 = `available + 全组数量`，且**下限取 0**（可用量本身可以是负数）；
 * - 本行天花板 = 本行数量 + 全组还能加的余量。
 *
 * 直接拿 `available` 当「本行最多可订」就是自己减自己：上限 3 加满 3 会被判超量清零，
 * 加到 5 会算出 `3 - 5 = -2` 并写回购物车。
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
  const allowedTotal = Math.max(0, available + groupTotal);
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
