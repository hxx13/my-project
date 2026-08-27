import { fetchPublicPagePermissions } from "@/api/domains/pagePermission.api";
import { canAccessWebPage } from "@/features/auth/pagePermissionAccess";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

/** 教职工路由命名空间 */
const STAFF_NS = "/console";

/**
 * 判断是否为学生库账号。
 * 优先级：accountSource（后端明确返回的账号来源库）> role > id 前缀。
 *
 * accountSource 优先的原因：双视角绑定的学生账号，其 role 可能被抬到 STAFF+，
 * 若按 role 优先会把它误判成教职工，导致学生账号登录却跳进教职工后台（/console/admin）。
 * 而「教职工切学生视图」时展开的是原 userInfo，accountSource 仍是 STAFF，
 * 所以 accountSource 优先不会破坏那个保留管理入口的场景。
 */
export function isStudentAccount(): boolean {
  const info = authStorage.getUserInfo();
  const source = info?.accountSource;
  if (source === "STUDENT") return true;
  if (source === "STAFF") return false;

  // 老账号无 accountSource：role ≥ STAFF 视为教职工（保护「切视角后 id 变学号」场景），再按 id 前缀兜底。
  const role = authStorage.getRole() ?? "MEMBER";
  if (hasMinRole(role, "STAFF")) return false;
  const id = info?.id;
  if (id) {
    const up = id.toUpperCase();
    if (up.startsWith("STAFF_") || up.startsWith("USR_") || up === "SYS_SUPER_ROOT") return false;
    if (/^\d+$/.test(id)) return true;
  }
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
