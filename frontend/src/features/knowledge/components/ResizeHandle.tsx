import { useCallback, useRef, useEffect } from "react";

interface Props {
  onResize: (delta: number) => void;
  direction?: "horizontal" | "vertical";
}

export function ResizeHandle({ onResize, direction = "horizontal" }: Props) {
  const dragging = useRef(false);
  const startCoord = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startCoord.current = direction === "horizontal" ? e.clientX : e.clientY;
    document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  }, [direction]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const current = direction === "horizontal" ? e.clientX : e.clientY;
      const delta = current - startCoord.current;
      startCoord.current = current;
      onResize(delta);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onResize, direction]);

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-[4px] shrink-0 cursor-col-resize hover:bg-[var(--app-color-accent)] transition-colors bg-transparent active:bg-[var(--app-color-accent)] relative group"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}
