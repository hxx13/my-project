import * as React from "react";
import { cn } from "@/lib/utils";

/** 原生 select 统一高度与焦点环（资产筛选等，见 docs/admin-ui-design-system.md） */
export const adminSelectClassName = cn(
  "min-w-0 rounded-[var(--admin-radius-md)] border border-slate-300 bg-white px-3 text-sm text-slate-900",
  "h-[var(--admin-control-height)]",
  "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--admin-focus-ring)]"
);

export type AdminSelectProps = React.ComponentPropsWithoutRef<"select">;

export const AdminSelect = React.forwardRef<HTMLSelectElement, AdminSelectProps>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(adminSelectClassName, className)} {...props} />
));
AdminSelect.displayName = "AdminSelect";
