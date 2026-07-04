import { useEffect, useRef } from "react";

/**
 * 模块级状态：是否有任意扫码条处于展开状态。
 * DebugNav 的全局 keydown listener 负责捕获刷卡器输入并路由到 scanner input，
 * 但 useCardReaderEnterGuard 的 capture 阶段 stopPropagation 会阻断 bubble 阶段的
 * DebugNav listener。当 scanner 展开时，guard 必须放行让 bubble listener 接收 Enter。
 *
 * 用法：
 * - DebugNav 在 scanner 展开/收起时调用 setGlobalScannerOpen(true/false)
 * - App.tsx 的全局 guard 通过此信号感知 scanner 是否展开，展开时自动放行
 * - DebugNav 自己的 guard 通过 disabled 参数直接控制
 */
let globalScannerOpen = false;
export function setGlobalScannerOpen(open: boolean) {
  globalScannerOpen = open;
}

/**
 * 读卡器 Enter 键防护：在 capture 阶段拦截 Enter 键，
 * 防止读卡器连续刷卡时意外触发聚焦按钮的 click 行为。
 *
 * 检测逻辑：
 * - 追踪短时间内连续的数字/字母按键（典型读卡器行为）
 * - 当检测到读卡器活动 + Enter 键 + 焦点在 button/a 上 → preventDefault + stopPropagation
 *
 * 不影响：
 * - INPUT / TEXTAREA 正常输入（读卡器输入框通过 id 白名单放行）
 * - 人工键盘操作（按键间隔 > 200ms 自动重置检测计数器）
 * - Ctrl/Alt/Meta 组合键
 * - 任意 scanner 展开时（全局放行，让 bubble listener 接收）
 */
export function useCardReaderEnterGuard(
  /**
   * 白名单 input element id。当焦点在此 input 上时，不拦截 Enter，
   * 由该 input 自身的 onKeyDown 处理扫码逻辑。
   */
  scannerInputId?: string,
  /**
   * 禁用 guard。当扫码条展开且无网络请求时，应禁用 guard，
   * 让刷卡器输入通过全局 keydown listener 正常到达扫码逻辑，
   * 避免 capture 阶段 stopPropagation 导致 bubble 阶段监听器收不到 Enter。
   */
  disabled?: boolean,
) {
  const cardKeyCountRef = useRef(0);
  const lastCardKeyTimeRef = useRef(0);
  /** 批量刷卡字符之间的最大间隔（ms），超过即判定为人工输入 */
  const CARD_KEY_GAP_MS = 200;
  /** 触发 Enter 拦截所需的最小连续刷卡字符数 */
  const MIN_CARD_KEYS = 3;

  useEffect(() => {
    const handleCapture = (e: KeyboardEvent) => {
      // guard 被禁用 → 完全透传，不追踪不拦截
      if (disabled) return;

      // 任意扫码条展开 → 完全透传，让 bubble 阶段的 DebugNav listener 处理刷卡输入
      if (globalScannerOpen) return;

      // 修饰键组合 → 放行（Ctrl+S 等快捷键）
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const activeEl = document.activeElement;
      if (!activeEl) return;

      const tag = activeEl.tagName;

      // INPUT / TEXTAREA → 放行（除非是扫码输入框自身，由其 onKeyDown 处理）
      if (tag === "INPUT" || tag === "TEXTAREA") {
        // 扫码输入框放行：不拦截，让字符和 Enter 正常到达 input
        if (scannerInputId && (activeEl as HTMLElement).id === scannerInputId) {
          // 但仍需追踪读卡器按键以保持计数准确（input 自身的 onKeyDown 也会处理 Enter）
          const now = Date.now();
          if (typeof e.key === "string" && e.key.length === 1) {
            if (now - lastCardKeyTimeRef.current > CARD_KEY_GAP_MS) {
              cardKeyCountRef.current = 0;
            }
            cardKeyCountRef.current++;
            lastCardKeyTimeRef.current = now;
          }
          if (e.key === "Enter") {
            // 扫码框的 Enter 由其自身 onKeyDown 处理，我们只重置计数
            cardKeyCountRef.current = 0;
          }
        }
        return;
      }

      const now = Date.now();

      if (e.key === "Enter") {
        // 检测读卡器活动：短时间内连续收到 ≥ MIN_CARD_KEYS 个字符按键
        const isCardReaderActive =
          cardKeyCountRef.current >= MIN_CARD_KEYS &&
          now - lastCardKeyTimeRef.current < CARD_KEY_GAP_MS;

        // 读卡器活跃 + 焦点在按钮/链接上 → 拦截 Enter
        if (isCardReaderActive && (tag === "BUTTON" || tag === "A" || tag === "SUMMARY")) {
          e.preventDefault();
          e.stopPropagation();
        }

        // Enter 后重置计数
        cardKeyCountRef.current = 0;
      } else if (typeof e.key === "string" && e.key.length === 1) {
        // 单个可打印字符 → 追踪读卡器活动
        if (now - lastCardKeyTimeRef.current > CARD_KEY_GAP_MS) {
          cardKeyCountRef.current = 0;
        }
        cardKeyCountRef.current++;
        lastCardKeyTimeRef.current = now;
      }
    };

    window.addEventListener("keydown", handleCapture, true);
    return () => window.removeEventListener("keydown", handleCapture, true);
  }, [scannerInputId, disabled]);
}