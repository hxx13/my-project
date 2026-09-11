import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

/** 管理端四态，映射到 shadcn Button（见 docs/admin-ui-design-system.md） */
export type AdminButtonTone = "primary" | "secondary" | "ghost" | "destructive";

const toneToVariant: Record<AdminButtonTone, VariantProps<typeof buttonVariants>["variant"]> = {
  primary: "default",
  secondary: "default",
  ghost: "default",
  destructive: "default",
};

/** 管理端按钮统一：实色填充（禁止描边/线条+文字），一眼可辨为可点击。disabled 由 toneClassNames 自行控制透明度 */
const adminButtonShell =
  "rounded-[length:var(--admin-radius-md,0.375rem)] border-0 font-medium shadow-sm transition-colors hover:shadow disabled:opacity-100";

/**
 * 管理端按钮统一：实色填充（禁止描边/线条+文字），一眼可辨为可点击。
 *
 * 所有淡色都必须写成 `color-mix(in_srgb,var(--token)_N%,transparent)`，**不能**写
 * Tailwind 的斜杠透明度（`bg-[var(--token)]/15`）：v3 对「任意值 + 斜杠透明度」不生成任何规则
 * （实测编译结果为空），而 tailwind-merge 仍把它当合法 bg-* 吃掉基础变体的底色 ——
 * 两者叠加会让按钮完全没有背景，看起来是白的、和背景融在一起。全仓库 108 个文件踩过这个坑。
 *
 * 浓度按「在奶油色页面上看得出是按钮」定：secondary 35%（15% 实测与底色只差 16-20 个通道值，
 * 肉眼近乎无差）。
 */
const toneClassNames: Record<AdminButtonTone, string> = {
  primary:
    "bg-[var(--app-color-accent)] text-white hover:bg-[var(--app-color-accent-hover)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-color-accent)_40%,transparent)] focus-visible:ring-offset-2 disabled:bg-[color-mix(in_srgb,var(--app-color-accent)_60%,transparent)]",
  secondary:
    "bg-[color-mix(in_srgb,var(--app-color-accent)_35%,transparent)] text-[var(--app-color-accent)] hover:bg-[color-mix(in_srgb,var(--app-color-accent)_50%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-color-accent)_40%,transparent)] focus-visible:ring-offset-2 disabled:bg-[color-mix(in_srgb,var(--app-color-accent)_12%,transparent)] disabled:text-[var(--app-color-text-tertiary)]",
  ghost:
    "bg-[color-mix(in_srgb,var(--app-color-accent)_22%,transparent)] text-[var(--app-color-accent)] hover:bg-[color-mix(in_srgb,var(--app-color-accent)_35%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-color-accent)_40%,transparent)] focus-visible:ring-offset-2 disabled:bg-[color-mix(in_srgb,var(--app-color-accent)_8%,transparent)] disabled:text-[var(--app-color-text-tertiary)]",
  destructive:
    "bg-red-500 text-white hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2 disabled:bg-red-500/60",
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

export const AdminButton = React.forwardRef<HTMLButtonElement, AdminButtonProps>(
  function AdminButton(
    { tone = "primary", className, loading, active, disabled, children, ...props },
    ref
  ) {
    return (
      <Button
        ref={ref}
        variant={toneToVariant[tone]}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          adminButtonShell,
          toneClassNames[tone],
          active && "ring-2 ring-[color:color-mix(in_srgb,var(--admin-focus-ring)_50%,transparent)] ring-offset-1",
          className
        )}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {children}
      </Button>
    );
  }
);
