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

  useEffect(() => {
    if (!open) return;
    /**
     * 给浮层挂上「我是另一层弹层」的标记，**必须**。
     *
     * ui/dialog.tsx 的 blockOutsideDismiss 只认 `[data-modal-layer="true"]`：
     * 带这个标记的层上的 pointerdown 不算「点了外面」。本浮层 Portal 挂到 body，
     * 对 Radix 而言在弹窗内容树之外 —— 不挂标记的话，**点浮层里的选项会被判成外部交互，
     * 整个外层弹窗跟着卸载**（用户填的份数/备注/临时文件全丢）。
     *
     * 放在这里而不是各调用点的 JSX：浮层的定位与「不被误关」是同一个契约，
     * 本 hook 的 7 个消费者（SelectField / AdminSearchSelect / 工位选择器 / 空间树选择器 …）
     * 都靠它，漏一个就漏一个坑。2026-09-15 工位选择器就是这么点不动的。
     */
    panelRef.current?.setAttribute("data-modal-layer", "true");
  }, [open, panelRef]);

  return {
    panelStyle: {
      position: "fixed",
      left: pos.left,
      top: pos.top,
      minWidth: pos.minWidth,
      // 高于 ConfigModalShell（--z-modal: 800），否则浮层落在弹窗遮罩下「点不开」
      zIndex: 801,
      /**
       * **必须显式 auto**：本浮层 Portal 挂到 document.body，而 Radix 的模态 Dialog
       * 会给 body 挂 `pointer-events: none`（它自己的内容再 auto 回来）。挂在 body 上的
       * 浮层会原样继承那个 none —— 表现是**整块浮层收不到任何点击**，点哪都只是把它关掉，
       * 选中项永远不变（看起来像「某些项选不中」）。
       *
       * 2026-09-15 实测：`getComputedStyle(panel).pointerEvents === 'none'`、
       * `getComputedStyle(document.body).pointerEvents === 'none'`。
       */
      pointerEvents: "auto",
    },
  };
}
