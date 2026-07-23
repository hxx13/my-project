import * as React from "react";
import { ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: FileList | null) => void;
  children?: React.ReactNode;
  className?: string;
};

/** 与 AdminButton secondary 一致外观的原生文件选择 */
export function AdminFilePickButton({
  accept = "image/*",
  multiple,
  disabled,
  onFiles,
  children = "选择图片",
  className,
}: Props) {
  return (
    <label
      className={cn(
        "inline-flex min-h-[var(--admin-control-height,2.25rem)] cursor-pointer items-center justify-center gap-1.5 rounded-[length:var(--admin-radius-md,0.375rem)] border-2 border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 text-sm font-medium text-[var(--app-color-text-primary)] shadow-sm transition-all",
        "hover:border-[var(--app-color-border-strong)] hover:bg-[var(--app-color-surface-hover)] focus-within:ring-[3px] focus-within:ring-[color:var(--admin-focus-ring)]/40 active:translate-y-px",
        disabled && "pointer-events-none cursor-not-allowed opacity-50",
        className
      )}
    >
      <ImagePlus className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      <span>{children}</span>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
