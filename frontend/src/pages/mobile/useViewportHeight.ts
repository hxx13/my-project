import { useEffect, useState } from "react";

/**
 * 实测可视视口高度（px），0 表示尚未测到（SSR/首帧），调用方应回落到 100dvh。
 *
 * 移动端弹窗不能用 100vh 定高：微信 / iOS webview 里 vh 按大视口算，
 * 地址栏或工具栏展开时元素底部会被推出可见区；100dvh 又不是所有 webview
 * 版本都支持，声明被丢弃后照样溢出。直接量 visualViewport 最稳。
 *
 * 软键盘弹出时 visualViewport 会缩小，弹窗随之变矮并内部滚动 —— 正是想要的行为。
 */
export function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window === "undefined" ? 0 : window.visualViewport?.height ?? window.innerHeight,
  );

  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setHeight(vv?.height ?? window.innerHeight);
    update();
    vv?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return height;
}
