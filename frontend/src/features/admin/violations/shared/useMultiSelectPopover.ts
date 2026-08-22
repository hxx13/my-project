import { useEffect, useLayoutEffect, useState } from "react";
import type { CSSProperties, RefObject } from "react";

const GAP = 4;
const VIEWPORT_MARGIN = 8;

type MultiSelectPopoverArgs = {
  triggerRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
};

type PanelPosition = { left: number; top: number; minWidth: number };

/**
 * 多选浮层的定位与关闭行为：fixed 定位，右侧/下方越界时翻转；
 * 点击外部 / Escape / 窗口 resize / 外部滚动关闭；浮层内点击与浮层内滚动不关闭。
 * 事件监听仅在 open 时挂载，关闭或卸载时自动清理。
 */
export function useMultiSelectPopover({
  triggerRef,
  panelRef,
  open,
  onClose,
}: MultiSelectPopoverArgs): { panelStyle: CSSProperties } {
  const [pos, setPos] = useState<PanelPosition>({ left: 0, top: 0, minWidth: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const t = trigger.getBoundingClientRect();
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;

    let left = t.left;
    let top = t.bottom + GAP;

    // 下方放不下 → 翻转到上方
    if (top + panelHeight > window.innerHeight - VIEWPORT_MARGIN) {
      top = t.top - panelHeight - GAP;
    }
    // 右侧放不下 → 右对齐翻转
    if (left + panelWidth > window.innerWidth - VIEWPORT_MARGIN) {
      left = t.right - panelWidth;
    }

    setPos({
      left: Math.max(VIEWPORT_MARGIN, left),
      top: Math.max(VIEWPORT_MARGIN, top),
      minWidth: t.width,
    });
  }, [open, triggerRef, panelRef]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target == null) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // 本项目固定高度布局，滚动发生在内部 overflow 容器；scroll 不冒泡，必须 capture 才抓得到。
    // 打开当帧 focus()/布局可能触发一次 scrollIntoView，若立刻监听会「点开即关」。
    // 浮层自身（或 trigger）内的 overflow 滚动不得关闭——否则模板列表一滚就消失。
    let scrollArmed = false;
    const armScroll = window.setTimeout(() => {
      scrollArmed = true;
    }, 0);
    const onScroll = (e: Event) => {
      if (!scrollArmed) return;
      const target = e.target;
      if (target instanceof Node) {
        if (panelRef.current?.contains(target)) return;
        if (triggerRef.current?.contains(target)) return;
      }
      onClose();
    };
    const onResize = () => onClose();

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, { capture: true });
    window.addEventListener("resize", onResize);

    return () => {
      window.clearTimeout(armScroll);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onResize);
    };
  }, [open, triggerRef, panelRef, onClose]);

  return {
    panelStyle: {
      position: "fixed",
      left: pos.left,
      top: pos.top,
      minWidth: pos.minWidth,
      // 高于 ConfigModalShell（--z-modal: 800），否则浮层落在弹窗遮罩下「点不开」
      zIndex: 801,
    },
  };
}
