import { MoreHorizontal } from "lucide-react";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type DebugOpsMenuMinRole = "STAFF" | "ADMIN" | "SUPER_ADMIN";

export type DebugOpsMenuItem = {
  key: string;
  label: string;
  onSelect: () => void;
  minRole?: DebugOpsMenuMinRole;
  danger?: boolean;
  disabled?: boolean;
};

type Props = {
  items: DebugOpsMenuItem[];
  align?: "start" | "end";
  /** 触发器文案，默认「运维」 */
  triggerLabel?: string;
  className?: string;
};

/**
 * Debug 页危险操作收纳：按角色过滤后展示为单一下拉，避免工具栏平铺。
 */
export function DebugDangerousOpsMenu({ items, align = "end", triggerLabel = "运维", className }: Props) {
  const role = authStorage.getRole() || "STUDENT";
  const visible = items.filter((i) => !i.minRole || hasMinRole(role, i.minRole));
  if (visible.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-debug-dangerous-ops-trigger
          className={
            className ??
            "inline-flex h-[var(--admin-control-height,2.25rem)] shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          }
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
          {triggerLabel}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[10rem]">
        {visible.map((i) => (
          <DropdownMenuItem
            key={i.key}
            disabled={i.disabled}
            className={i.danger ? "text-rose-600 focus:bg-rose-50 focus:text-rose-700" : undefined}
            onSelect={() => i.onSelect()}
          >
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
