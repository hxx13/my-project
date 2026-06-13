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

/** 管理端按钮统一：2px 描边 + 浅阴影，主/次/危险均一眼可辨为可点击 */
const adminButtonShell =
  "rounded-[length:var(--admin-radius-md,0.375rem)] !border-2 shadow-sm hover:shadow";

const toneClassNames: Record<AdminButtonTone, string> = {
  primary:
    "!border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:!border-primary",
  secondary:
    "!border-[var(--app-color-border-strong)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] hover:!border-[var(--app-color-border-strong)] hover:bg-[var(--app-color-surface-hover)]",
  ghost:
    "!border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] hover:!border-[var(--app-color-border-strong)] hover:bg-[var(--app-color-surface-hover)]",
  destructive:
    "!border-red-400 bg-red-50 text-red-800 hover:!border-red-500 hover:bg-red-100 dark:!border-red-500/80 dark:bg-red-950/50 dark:text-red-100 dark:hover:bg-red-950/70",
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
  "flex w-full cursor-pointer items-center gap-3 rounded-lg border-2 border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2.5 text-left shadow-sm transition-all hover:border-[var(--app-color-border-strong)] hover:bg-[var(--app-color-surface-hover)] active:translate-y-px";

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
        active && "!border-[color:var(--admin-focus-ring)] ring-2 ring-[color:var(--admin-focus-ring)]/30 ring-offset-1 ring-offset-background",
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
}
