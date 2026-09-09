import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 固定行高文本：文字超长时不换行增加高度、也不打省略号隐藏，
 * 而是缩小字号，让「多一行」的文字挤进原来的行高空间（对齐 AUP ProjectNameTitle）。
 */
export function ShrinkText({
  text,
  lines = 2,
  baseFontPx = 13,
  className,
}: {
  text: string;
  lines?: number;
  baseFontPx?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shrunk, setShrunk] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      el.style.fontSize = "";
      el.style.setProperty("-webkit-line-clamp", String(lines));
      const over = el.scrollHeight - el.clientHeight > 2;
      setShrunk(over);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, lines]);

  return (
    <div
      ref={ref}
      className={cn("shrink-line", shrunk && "is-shrunk", className)}
      style={{
        WebkitLineClamp: shrunk ? lines + 1 : lines,
        fontSize: shrunk ? `${Math.round(baseFontPx * lines / (lines + 1))}px` : undefined,
      }}
    >
      {text || "—"}
    </div>
  );
}
