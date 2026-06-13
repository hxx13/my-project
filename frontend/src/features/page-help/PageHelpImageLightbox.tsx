import { useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { Portal } from "@/components/Portal";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  alt?: string;
  onClose: () => void;
};

/** 帮助正文图片全屏预览（Portal 层，避免嵌套 Dialog 触发 Radix ref 死循环） */
export function PageHelpImageLightbox({ src, alt = "", onClose }: Props) {
  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      handleClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [handleClose]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[var(--z-command)] isolate pointer-events-auto"
        role="dialog"
        aria-modal="true"
        aria-label={alt.trim() || "图片预览"}
      >
        <button
          type="button"
          className="absolute inset-0 z-0 border-0 bg-black/85"
          onClick={handleClose}
          aria-label="关闭预览"
        />
        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center p-4 sm:p-10">
          <img
            src={src}
            alt={alt}
            className="pointer-events-auto max-h-[88vh] max-w-[min(96vw,1400px)] object-contain"
            draggable={false}
          />
        </div>
        <button
          type="button"
          className={cn(
            "absolute right-3 top-3 z-[2] inline-flex h-10 w-10 items-center justify-center",
            "rounded-[var(--app-radius-pill)] border border-white/20 bg-black/55 text-white",
            "shadow-[var(--app-elevation-dropdown)] hover:bg-black/75",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleClose();
          }}
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </Portal>
  );
}
