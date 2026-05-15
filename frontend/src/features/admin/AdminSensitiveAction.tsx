import type { MinRole } from "@/api/domains/pagePermission.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export type AdminSensitiveActionProps = {
  /** 右键菜单「敏感操作」分区展示名 */
  label: string;
  /** 低于该角色不渲染子节点（可见性） */
  visibilityMinRole?: MinRole;
  /** 菜单内「跳转权限设置」等收紧能力所要求的最低角色，默认超级管理员 */
  configureMinRole?: MinRole;
  children: React.ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLSpanElement>, "children">;

/**
 * 高敏感操作区：控制可见性，并在自定义右键菜单中展示「敏感操作」说明（配置能力由菜单内按 configureMinRole 收紧）。
 */
export function AdminSensitiveAction({
  label,
  visibilityMinRole = "ADMIN",
  configureMinRole = "SUPER_ADMIN",
  children,
  className,
  ...rest
}: AdminSensitiveActionProps) {
  const role = authStorage.getRole() || "STUDENT";
  if (!hasMinRole(role, visibilityMinRole)) return null;
  return (
    <span
      data-admin-sensitive-action="1"
      data-sensitive-label={label}
      data-sensitive-configure-min-role={configureMinRole}
      className={cn("inline-flex", className)}
      {...rest}
    >
      {children}
    </span>
  );
}
