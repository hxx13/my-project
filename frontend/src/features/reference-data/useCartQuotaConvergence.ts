import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { fetchSpecQuota } from "@/api/domains/referenceData.api";
import type { CartLine } from "./CartDrawer";
import { canEditCartLine } from "./CartTree";
import { planCartQuota } from "./cartQuotaCeilings";

/**
 * 购物车行的周期上限：**一次算清两件事**，口径与小程序 `_reconcileQuota` 完全一致。
 *
 * <ol>
 *   <li>返回每行「最多可订多少」，购物车的 + 与手输拿它当闸门；以前购物车只受单笼上限约束，
 *       周期上限形同虚设（上限 3 也能加到 5）。</li>
 *   <li>他人提交把某 (规格, 周期) 的可用量吃低、全组确实超了，才把**超出部分**收敛掉并弹提示
 *       —— 绝不静默改写。</li>
 * </ol>
 *
 * <p>算术（含 `available` 已把本行算进去这个坑）在 {@link planCartQuota}，那边有单测。
 *
 * <p>按 (物品, 规格, 周期) 去重，每组只发一次 quota 请求；用 ref Set 记住已收敛过的行 id，
 * 15s 轮询反复触发也不重复弹。
 */
export function useCartQuotaConvergence(opts: {
  lines: CartLine[];
  campus?: string | null;
  isPi: boolean;
  currentUserId: string;
  onConverge: (line: CartLine, newQty: number) => void;
}): Map<number, number> {
  const { lines, campus, isPi, currentUserId } = opts;
  const onConvergeRef = useRef(opts.onConverge);
  onConvergeRef.current = opts.onConverge;
  const handledRef = useRef<Set<string>>(new Set());
  const [ceilings, setCeilings] = useState<Map<number, number>>(() => new Map());

  // 依赖用「内容签名」而不是 lines 数组本身：调用方每次渲染都传新数组，
  // 直接依赖它，下面 setCeilings 引发的重渲染会再跑一遍 effect，转成死循环。
  const sig = lines
    .map((l) => `${l.id}:${l.qty}:${l.itemId}:${l.specLabel || ""}:${l.deliveryCycle || ""}:${l.addedBy}`)
    .join("|");

  useEffect(() => {
    if (!campus) return;
    const byKey = new Map<string, CartLine[]>();
    for (const l of lines) {
      const key = `${l.itemId}::${l.specLabel || "-"}::${l.deliveryCycle || "-"}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(l);
    }
    let disposed = false;
    const next = new Map<number, number>();
    for (const group of byKey.values()) {
      const first = group[0];
      // 只处理当前登录人能改的行，避免服务端权限拦截
      if (!group.some((l) => canEditCartLine(l, { isPi, currentUserId }))) continue;
      void fetchSpecQuota({
        refDataId: first.itemId,
        spec: first.specLabel || undefined,
        cycle: first.deliveryCycle ?? undefined,
        campus,
      })
        .then((q) => {
          if (disposed) return;
          if (q.configured !== true || q.available == null) return;
          const avail = Number(q.available);
          if (!Number.isFinite(avail)) return;
          // 算术在 cartQuotaCeilings（有单测）：available 已含本行，自己减自己会清零/变负
          const plan = planCartQuota(
            group.map((l) => ({ id: l.id, qty: l.qty, editable: canEditCartLine(l, { isPi, currentUserId }) })),
            avail,
          );
          for (const [id, max] of plan.ceilings) next.set(id, max);
          for (const c of plan.converge) {
            if (handledRef.current.has(String(c.id))) continue;
            handledRef.current.add(String(c.id));
            const l = group.find((x) => x.id === c.id)!;
            const name = l.specLabel || l.itemLabel;
            onConvergeRef.current(l, c.qty);
            toast.error(`${name} 本周期可订量已被占至 ${c.qty} 只，数量已收敛到 ${c.qty}`);
          }
          for (const l of group) {
            if (!plan.converge.some((c) => c.id === l.id)) handledRef.current.delete(String(l.id));
          }
        })
        .catch(() => { /* quota 端点未就绪或失败：当作未知，不收敛也不设上限 */ })
        .finally(() => {
          if (disposed) return;
          setCeilings((prev) => (sameCeilings(prev, next) ? prev : next));
        });
    }
    return () => { disposed = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, campus, isPi, currentUserId]);

  return ceilings;
}

function sameCeilings(a: Map<number, number>, b: Map<number, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}
