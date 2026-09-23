import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { fetchSpecQuota } from "@/api/domains/referenceData.api";
import type { CartLine } from "./CartDrawer";
import { canEditCartLine } from "./CartTree";

/**
 * 购物车被挤占收敛：他人提交把某 (规格, 周期) 的可用量吃低后，本车已填数量超过可用量时，
 * 把该行数量收敛到可用量并弹提示 —— 绝不静默改写。
 *
 * 一次 refetch 后跑：按 (refDataId, spec, cycle) 去重，每类只发一次 quota 请求；
 * 用 ref Set 记住已收敛过的行 id，15s 轮询反复触发也不重复弹。
 */
export function useCartQuotaConvergence(opts: {
  lines: CartLine[];
  campus?: string | null;
  isPi: boolean;
  currentUserId: string;
  onConverge: (line: CartLine, newQty: number) => void;
}) {
  const { lines, campus, isPi, currentUserId } = opts;
  const onConvergeRef = useRef(opts.onConverge);
  onConvergeRef.current = opts.onConverge;
  const handledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!campus) return;
    const byKey = new Map<string, CartLine[]>();
    for (const l of lines) {
      const key = `${l.itemId}::${l.specLabel || "-"}::${l.deliveryCycle || "-"}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(l);
    }
    let disposed = false;
    for (const group of byKey.values()) {
      const first = group[0];
      // 只收敛当前登录人能改的行，避免服务端权限拦截
      const mine = group.filter((l) => canEditCartLine(l, { isPi, currentUserId }));
      if (mine.length === 0) continue;
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
          for (const l of mine) {
            if (l.qty <= avail || handledRef.current.has(String(l.id))) continue;
            handledRef.current.add(String(l.id));
            const name = l.specLabel || l.itemLabel;
            onConvergeRef.current(l, avail);
            toast.error(`${name} 本周期可订量已被占用至 ${avail} 只，数量已收敛到 ${avail}`);
          }
        })
        .catch(() => { /* quota 端点未就绪或失败：当作未知，不收敛 */ });
    }
    return () => { disposed = true; };
  }, [lines, campus, isPi, currentUserId]);
}
