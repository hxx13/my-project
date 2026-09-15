import { useCallback, useRef, useEffect } from "react";

interface Props { onResize: (delta: number) => void }

/**
 * 竖向拖拽分隔条：按下后按鼠标位移回调 `onResize(delta)`，由调用方自己夹取范围与落库。
 * 原属知识库左栏，SOP 左栏也要用，提到共用目录。
 *
 * 只接鼠标事件 —— 触摸端不生效（需要的是 pointer 事件），当前调用方都在桌面后台。
 */
export function ResizeHandle({ onResize }: Props) {
  const dragging = useRef(false);
  const startX = useRef(0);
  /**
   * 回调放 ref 里，effect 才能用空依赖只订阅一次。
   *
   * 以前是 `useEffect(..., [onResize])`，而调用方普遍传内联箭头（每次渲染都是新函数），
   * 于是每动一下 → setState → 重渲染 → 重订阅 → **cleanup 把 `dragging` 清成 false**，
   * 拖拽就此中断，表现为「拖一下就停、不跟手」。知识库那个调用方同样中招。
   */
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      onResizeRef.current(e.clientX - startX.current);
      startX.current = e.clientX;
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // 走到这里只可能是真卸载（依赖是空的）：收拾光标/选中态，防止泄漏到下一次拖拽
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  return (
    <div
      onMouseDown={onMouseDown}
      className="group relative w-1 shrink-0 cursor-col-resize transition-colors hover:bg-[color-mix(in_srgb,var(--app-color-accent)_35%,transparent)]"
    >
      {/* 命中区左右各外扩 4px：视觉条只有 4px，直接按它太难按 */}
      <div className="absolute inset-y-0 -left-1 -right-1" />
      {/* 把手：**常显**，明确「这里能拖」—— 只靠悬停变色的话没人知道它可以拖。
          纯装饰（pointer-events-none），真按下还是走上面那层。悬停时加深。 */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[3px] rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] px-[3px] py-1.5 shadow-sm transition group-hover:border-[var(--app-color-accent)]">
        <span className="h-[3px] w-[3px] rounded-full bg-[var(--app-color-text-tertiary)] transition group-hover:bg-[var(--app-color-accent)]" />
        <span className="h-[3px] w-[3px] rounded-full bg-[var(--app-color-text-tertiary)] transition group-hover:bg-[var(--app-color-accent)]" />
        <span className="h-[3px] w-[3px] rounded-full bg-[var(--app-color-text-tertiary)] transition group-hover:bg-[var(--app-color-accent)]" />
      </div>
    </div>
  );
}
