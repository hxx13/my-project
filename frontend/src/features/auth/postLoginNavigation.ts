import { fetchPublicPagePermissions } from "@/api/domains/pagePermission.api";
import { canAccessWebPage } from "@/features/auth/pagePermissionAccess";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

/** 教职工路由命名空间 */
const STAFF_NS = "/console";

/** 判断是否为学生库账号 */
function isStudentAccount(): boolean {
  const source = authStorage.getUserInfo()?.accountSource;
  if (source === "STUDENT") return true;
  if (source === "STAFF") return false;
  // accountSource 为空时，按角色兜底：MEMBER 即学生
  const role = authStorage.getRole() ?? "MEMBER";
  return !hasMinRole(role, "STAFF");
}

/** 站点根路径 / 刷新后默认落地（同步，供 RootEntryRedirect）。不检查 portal — 根路径按账号类型决定去向。 */
export function resolveRootEntryPath(_role: string): string {
  if (isStudentAccount()) return "/student/home";
  return `${STAFF_NS}/admin`;
}

/** 无「落地页 / 回跳地址」时，按账号类型决定默认首页 */
export async function resolveDefaultPathAfterLogin(role: string): Promise<string> {
  if (isStudentAccount()) return "/student/home";

  try {
    const nodes = await fetchPublicPagePermissions("WEB");
    if (hasMinRole(role, "STAFF") && canAccessWebPage(nodes || [], `${STAFF_NS}/admin`, role, "STAFF")) {
      return `${STAFF_NS}/admin`;
    }
  } catch {
    if (hasMinRole(role, "STAFF")) return `${STAFF_NS}/admin`;
  }
  return `${STAFF_NS}/dashboard`;
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
