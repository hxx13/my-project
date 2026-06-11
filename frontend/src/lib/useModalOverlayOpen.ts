import { useEffect, useState } from "react";

function hasModalOverlay(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.documentElement.hasAttribute("data-modal-scroll-lock") ||
    document.querySelector('[data-modal-layer="true"]') != null
  );
}

/**
 * 全屏弹窗（含扫码弹窗）是否打开。
 * 背后若有 requestAnimationFrame 自动滚动，应在 overlay 打开时暂停，避免半透明遮罩闪烁。
 */
export function useModalOverlayOpen(): boolean {
  const [open, setOpen] = useState(() => hasModalOverlay());

  useEffect(() => {
    const sync = () => setOpen(hasModalOverlay());
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-modal-scroll-lock"],
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-modal-layer"],
    });
    sync();
    return () => observer.disconnect();
  }, []);

  return open;
}
