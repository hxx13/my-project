import { useEffect } from "react";

/**
 * contextmenu 的 pointerType 在部分浏览器上缺失（老 Safari 派发的是 MouseEvent），
 * 那种情况只在触摸优先设备上当触摸处理，免得把鼠标右键一并关掉。
 */
export function isTouchContextMenu(e: MouseEvent): boolean {
  const pointerType = (e as PointerEvent).pointerType;
  if (pointerType === "mouse") return false;
  if (pointerType !== undefined) return true;
  return window.matchMedia?.("(pointer: coarse)")?.matches === true;
}

/**
 * 触摸设备（iPad / 安卓平板）上长按会弹系统菜单，拖拽时极易误触。
 * 挂上后本端在做交互的整个期间，触摸触发的 contextmenu 一律吃掉。
 *
 * 不影响的两种：鼠标右键（后台壳层有自己的右键菜单）、输入框/可编辑区（保留长按粘贴）。
 * 只作用于挂载它的那段 UI，所以教职工端、学生端各自挂一次即可，不用全局生效。
 */
export function useTouchMenuGuard(): void {
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (isTouchContextMenu(e)) e.preventDefault();
    };
    // capture：抢在业务组件的 onContextMenu 之前，避免被中途 stopPropagation 拦掉
    document.addEventListener("contextmenu", onCtx, true);
    return () => document.removeEventListener("contextmenu", onCtx, true);
  }, []);
}
