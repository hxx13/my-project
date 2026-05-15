import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export type AdminSubPageHeaderProps = {
  /** 当路由 `location.state.returnTo` 缺失或非法时的默认回退路径 */
  fallbackTo: string;
  /** 返回按钮文案，如「返回领用物资」 */
  backLabel?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/**
 * 二级子页顶栏：优先导航 `state.returnTo`（由上一级 `navigate(..., { state })` 注入），否则回退 `fallbackTo`。
 * 与全局壳层 `adminShellNavigation.ts` 互补：壳层顶栏「←」与页内返回可同时存在，便于长页滚动后仍能找到出口。
 * 设计约定见 `docs/admin-module-personnel-access-rules-supplies.md`。
 */
export function AdminSubPageHeader({
  fallbackTo,
  backLabel = "返回",
  title,
  description,
  actions,
  className,
}: AdminSubPageHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const onBack = () => {
    const rt = (location.state as { returnTo?: unknown } | null)?.returnTo;
    if (typeof rt === "string") {
      const t = rt.trim();
      if (t.startsWith("/") && !t.startsWith("//")) {
        navigate(t);
        return;
      }
    }
    navigate(fallbackTo);
  };

  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-2">
        <button
          type="button"
          onClick={onBack}
          className="group inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50"
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0 transition group-hover:-translate-x-0.5" aria-hidden />
          {backLabel}
        </button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-950 sm:text-2xl">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-neutral-600">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
