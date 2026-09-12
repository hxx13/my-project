import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

/**
 * 点遮罩关闭弹窗的安全写法：只在「按下」也落在遮罩上时才关。
 *
 * 直接用 onClick + e.target === e.currentTarget 会在两种情况下误关：
 *  1. 在弹窗内按下拖选文字、滑到弹窗外松手 —— click 被派发到按下点和松开点的
 *     最近公共祖先，也就是遮罩本身；
 *  2. 触摸端拖拽/长按结束后浏览器补发的 click，同样会命中遮罩。
 */
export function useOverlayDismiss(onDismiss: () => void) {
  const downOnOverlay = useRef(false);
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      downOnOverlay.current = e.target === e.currentTarget;
    },
    onClick: (e: ReactMouseEvent<HTMLElement>) => {
      if (downOnOverlay.current && e.target === e.currentTarget) onDismiss();
    },
  };
}
