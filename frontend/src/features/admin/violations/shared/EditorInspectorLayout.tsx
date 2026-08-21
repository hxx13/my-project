import { useEffect, useState } from "react";
import type { CSSProperties, JSX, ReactNode } from "react";
import { cn } from "@/lib/utils";

type EditorInspectorLayoutProps = {
  canvas: ReactNode;
  inspector: ReactNode;
  footer?: ReactNode;
  breadcrumb?: ReactNode;
  /** 检查器列宽，默认 "20rem"。 */
  inspectorWidth?: string;
  /** 检查器 label 列宽，默认 "6rem"。 */
  labelWidth?: string;
};

const CARD_CLASS =
  "rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] [box-shadow:var(--app-elevation-card)]";

/**
 * 编辑器 + 检查器双区布局。区域边界由本组件独占：画布与检查器是两张同宽高、同边框的对齐卡，
 * 检查器内部由 InspectorGroup 以分隔线分区，不再各自浮动。高度链由本组件独占，调用方不得注入
 * h-* / min-h-* / overflow-*。父级必须是有界高度的 flex 容器（如 ConfigModalShell fill 内），
 * 否则 flex-1 min-h-0 不成立，会退化成整页滚动。
 * canvas / inspector 各自独立滚动，整页不滚；窄屏(<1100px)改单列共用滚动区。
 */
export function EditorInspectorLayout({
  canvas,
  inspector,
  footer,
  breadcrumb,
  inspectorWidth = "20rem",
  labelWidth = "6rem",
}: EditorInspectorLayoutProps): JSX.Element {
  const [narrow, setNarrow] = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth < 1100
  );

  useEffect(() => {
    const update = () => setNarrow(window.innerWidth < 1100);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const style = { "--insp-w": inspectorWidth, "--insp-label": labelWidth } as CSSProperties;

  return (
    <div style={style} className="flex min-h-0 flex-1 flex-col gap-4">
      {breadcrumb != null ? <div className="shrink-0">{breadcrumb}</div> : null}

      {narrow ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain">
          <div className={cn("min-w-0 shrink-0 p-5", CARD_CLASS)}>{canvas}</div>
          <div className={cn("flex min-w-0 shrink-0 flex-col", CARD_CLASS)}>{inspector}</div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
          <div className={cn("min-w-0 flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-5", CARD_CLASS)}>
            {canvas}
          </div>
          <div className={cn("flex w-[var(--insp-w)] shrink-0 min-h-0 flex-col overflow-y-auto overscroll-y-contain", CARD_CLASS)}>
            {inspector}
          </div>
        </div>
      )}

      {footer != null ? <div className="shrink-0">{footer}</div> : null}
    </div>
  );
}
