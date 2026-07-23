import { authStorage } from "./authStorage";

export interface ImpersonationState {
  isImpersonating: boolean;
  impersonatedUserId: string;
  staffUserId: string;
}

/** 解码 JWT 检测当前会话是否为教职工模拟学生身份 */
export function getImpersonationState(): ImpersonationState | null {
  try {
    const token = authStorage.getToken();
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.impersonatedBy) {
      return {
        isImpersonating: true,
        impersonatedUserId: payload.sub || "",
        staffUserId: payload.impersonatedBy,
      };
    }
  } catch {
    // Not a valid JWT, ignore
  }
  return null;
}

/** 返回首页：恢复原始 auth 并跳转到 /admin */
export function returnToStaffView(): boolean {
  try {
    const raw = localStorage.getItem("admin_original_auth");
    if (raw) {
      const original = JSON.parse(raw);
      authStorage.setAuth(original.token, original.role, original.userInfo);
      localStorage.removeItem("admin_original_auth");
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** 安全退出登录：清理所有 auth 状态（含模拟残留 + 镜像模式） */
export function fullLogout(): void {
  try { localStorage.removeItem("admin_original_auth"); } catch { /* ignore */ }
  authStorage.exitMirrorMode();
  authStorage.clear();
}
