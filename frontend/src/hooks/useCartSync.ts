/**
 * 购物车写回控制器 —— 全端统一「最新态 + 串行/防抖提交」标准件。
 *
 * 职责：
 *  1) 持有最新态 ref：同一 tick 内的多次变更基于最新态累加，杜绝闭包旧值覆盖；
 *  2) 写回串行化（serialize）或防抖合并（debounce），杜绝并发全量替换互相覆盖；
 *  3) flushNow / cancelPending：提交/清空/修订恢复前取消防抖悬挂，防止过期快照写回。
 *
 * 不拥有渲染态：渲染态由调用方决定（服务端购物车走 React Query cache、本地购物车走
 * useState），本 hook 只负责「最新态 + 落库」这一条写回链路，便于四个界面共用同一套。
 *
 * 变更语义（数量 clamp / 归零删除）统一走 cartMath 纯函数。
 */
import { useCallback, useEffect, useRef } from "react";
import type { CartState } from "@/utils/cartMath";
import { createSerializedQueue } from "@/utils/serializeAsync";

export type CartCommit = (next: CartState) => void | Promise<void>;

export interface UseCartSyncOptions {
  /** 全量替换写回（远程 PUT / localStorage 持久化）。每次变更都会走到这里。 */
  commit: CartCommit;
  /**
   * serialize（默认）：每次变更按入队顺序逐次提交，绝不并发；
   * debounce：合并 debounceMs 内的连续变更、以最新态提交一次。
   */
  mode?: "serialize" | "debounce";
  /** debounce 毫秒数，默认 420。 */
  debounceMs?: number;
}

export function useCartSync(options: UseCartSyncOptions) {
  const cartRef = useRef<CartState>({});
  const queueRef = useRef(createSerializedQueue());
  const timerRef = useRef<number | null>(null);
  const optsRef = useRef(options);
  optsRef.current = options;

  const runCommit = useCallback((payload: CartState) => {
    return queueRef.current.run(() => optsRef.current.commit(payload));
  }, []);

  /** 更新最新态（水合 / 外部恢复后调用，使 ref 与渲染源一致）。 */
  const setLatest = useCallback((next: CartState) => {
    cartRef.current = next;
  }, []);

  /** 变更后调用：更新最新态并提交（serialize 逐次 / debounce 合并最新态）。 */
  const schedule = useCallback(
    (next: CartState) => {
      cartRef.current = next;
      const opts = optsRef.current;
      if (opts.mode === "debounce") {
        if (timerRef.current != null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          void runCommit(cartRef.current);
        }, opts.debounceMs ?? 420);
      } else {
        void runCommit(next);
      }
    },
    [runCommit],
  );

  /** 立即提交最新态并清掉未触发的防抖定时器（提交/清空前调用，防过期快照覆盖）。 */
  const flushNow = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return runCommit(cartRef.current);
  }, [runCommit]);

  /** 仅取消防抖定时器、不提交（修订退出恢复原购物车等场景）。 */
  const cancelPending = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 卸载时清理防抖定时器
  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return { cartRef, setLatest, schedule, flushNow, cancelPending };
}
