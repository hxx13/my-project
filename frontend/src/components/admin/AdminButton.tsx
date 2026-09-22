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

/**
 * 立体感靠**纯投影**分层：rest `shadow`，hover 抬到 `shadow-md`，active 落到 `shadow-none`
 * 并下移 1px（视觉上"按下去"）。
 *
 * **不能用 `twin-level-*` 那套令牌**：它们每个都带 `inset 0 0 0 1px rgba(0,0,0,.08)` 的内嵌描边
 * —— 那是给无边框表面替代边框用的。按钮已经有真描边，再叠一层 inset，看起来就是描边变粗了。
 */
const adminButtonShell =
  "admin-btn rounded-[length:var(--admin-radius-md,0.375rem)] border font-medium shadow transition-[background-color,border-color,color,box-shadow,transform] hover:shadow-md active:shadow-none active:translate-y-px disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus-ring)] focus-visible:ring-offset-2";

/**
 * 管理端按钮统一：四态一律**实色填充 + 1px 同色系描边**（`border`）。
 *
 * 底色**不许**用带透明度的 `color-mix(...,transparent)`：在浅色页面上它会灰掉、发虚，
 * 浓度低了根本看不出是个按钮（15% 实测与底色只差 16-20 个通道值，肉眼近乎无差）。
 * 描边宽度取 1px 而非 2px —— 2px 在实色填充上显得笨重（实测后定的）。
 *
 * 另注：**不能**写 Tailwind 的斜杠透明度（`bg-[var(--token)]/15`）—— v3 对「任意值 + 斜杠
 * 透明度」不生成任何规则（实测编译结果为空），而 tailwind-merge 仍把它当合法 bg-* 吃掉基础
 * 变体的底色，两者叠加会让按钮完全没背景、看起来是白的。全仓库 108 个文件踩过这个坑。
 */
const toneClassNames: Record<AdminButtonTone, string> = {
  primary:
    "bg-[var(--app-color-accent)] text-white border-[var(--app-color-accent)] hover:bg-[var(--app-color-accent-hover)] hover:border-[var(--app-color-accent-hover)]",
  secondary:
    "bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]",
  ghost:
    "bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]",
  // 危险态用 danger-ink 做字与描边（danger 本体压在 danger-soft 上只有 4.36:1，11px 过不了 AA）。
  // hover 用 brightness 而不是再调一层半透明底色，保持「无透明度」。
  destructive:
    "bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger-ink)] border-[var(--app-color-feedback-danger-ink)] hover:brightness-95",
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
          `admin-btn--${tone}`,
          toneClassNames[tone],
          active && "ring-2 ring-[var(--admin-focus-ring)] ring-offset-1",
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
