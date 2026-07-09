import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

/** 管理端四态，映射到 shadcn Button（见 docs/admin-ui-design-system.md） */
export type AdminButtonTone = "primary" | "secondary" | "ghost" | "destructive";

const toneToVariant: Record<AdminButtonTone, VariantProps<typeof buttonVariants>["variant"]> = {
  primary: "outline",
  secondary: "outline",
  ghost: "outline",
  destructive: "outline",
};

/** 管理端按钮统一：实色填充，一眼可辨为可点击 */
const adminButtonShell =
  "rounded-[length:var(--admin-radius-md,0.375rem)] font-medium transition-colors";

const toneClassNames: Record<AdminButtonTone, string> = {
  primary:
    "bg-[var(--app-color-accent)] text-white hover:opacity-90",
  secondary:
    "bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-border-default)]",
  ghost:
    "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]",
  destructive:
    "bg-red-500 text-white hover:bg-red-600",
};

export type AdminButtonProps = Omit<React.ComponentProps<typeof Button>, "variant"> & {
  tone?: AdminButtonTone;
  /** 请求中：禁用并显示旋转图标 */
  loading?: boolean;
  /** 切换/分段选中态（描边加粗，便于辨认已点选） */
  active?: boolean;
};

/** 下拉列表中的「可点选行」按钮样式（人员/课题组预检） */
export const adminPickableRowClass =
  "flex w-full cursor-pointer items-center gap-3 rounded-lg bg-[var(--app-color-surface-container)] p-2.5 text-left transition-colors hover:bg-[var(--app-color-surface-hover)]";

export function AdminButton({
  tone = "primary",
  className,
  loading,
  active,
  disabled,
  children,
  ...props
}: AdminButtonProps) {
  return (
    <Button
      variant={toneToVariant[tone]}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        adminButtonShell,
        toneClassNames[tone],
        active && "ring-2 ring-[color:var(--admin-focus-ring)]/50 ring-offset-1",
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
}
