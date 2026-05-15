import { fetchPublicPagePermissions } from "@/api/domains/pagePermission.api";
import { canAccessWebPage } from "@/features/auth/pagePermissionAccess";
import { hasMinRole } from "@/features/auth/roleAccess";

/** 无「落地页 / 回跳地址」时，按角色与后台页面权限决定默认首页 */
export async function resolveDefaultPathAfterLogin(role: string): Promise<string> {
  try {
    const nodes = await fetchPublicPagePermissions("WEB");
    if (hasMinRole(role, "STAFF") && canAccessWebPage(nodes || [], "/admin", role, "STAFF")) {
      return "/admin";
    }
  } catch {
    /* 权限拉取失败时回前台，避免卡在登录 */
  }
  return "/";
}

export async function resolvePostLoginTarget(params: {
  role: string;
  pendingTwin: string | null;
  fromFull: string | null;
}): Promise<string> {
  if (params.pendingTwin) return params.pendingTwin;
  if (params.fromFull) return params.fromFull;
  return resolveDefaultPathAfterLogin(params.role);
}
