import { fetchPublicPagePermissions } from "@/api/domains/pagePermission.api";
import { canAccessWebPage } from "@/features/auth/pagePermissionAccess";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

/** 教职工路由命名空间 */
const STAFF_NS = "/console";

/** 判断是否为学生库账号：role 优先（role≥STAFF 视为非学生，含切到学生视角仍保留教职工 role 的场景），再按 id 前缀/accountSource 兜底。 */
export function isStudentAccount(): boolean {
  const role = authStorage.getRole() ?? "MEMBER";
  // 权限统一不分视角：role ≥ STAFF 即视为非学生，杜绝「切视角后 id 变学号却被误判学生」而丢失管理入口
  if (hasMinRole(role, "STAFF")) return false;
  const info = authStorage.getUserInfo();
  const id = info?.id;
  if (id) {
    const up = id.toUpperCase();
    if (up.startsWith("STAFF_") || up.startsWith("USR_") || up === "SYS_SUPER_ROOT") return false;
    if (/^\d+$/.test(id)) return true;
  }
  const source = info?.accountSource;
  if (source === "STUDENT") return true;
  if (source === "STAFF") return false;
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
