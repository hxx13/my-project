import { useCallback, useRef, useEffect } from "react";

interface Props { onResize: (delta: number) => void }

export function ResizeHandle({ onResize }: Props) {
  const dragging = useRef(false);
  const startX = useRef(0);

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
      onResize(e.clientX - startX.current);
      startX.current = e.clientX;
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // 组件卸载时清理 body 样式，防止光标/选择状态泄漏
      if (dragging.current) {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
  }, [onResize]);

  return (
    <div onMouseDown={onMouseDown} className="w-1 shrink-0 cursor-col-resize hover:bg-[var(--app-color-accent)] transition-colors relative">
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}
