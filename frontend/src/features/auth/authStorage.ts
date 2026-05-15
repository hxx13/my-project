import type { AuthUserInfo } from "@/api/domains/auth.api";

const TOKEN_KEY = "auth_token";
const ROLE_KEY = "auth_role";
const USER_INFO_KEY = "auth_user_info";
const MOCK_JWT_PREFIX = "jwt_mock_token_";

/** 登录或自助改昵称后写入 userInfo，供头部等订阅刷新 */
export const AUTH_USERINFO_UPDATED_EVENT = "aro-auth-userinfo-updated";

function dispatchUserInfoUpdated() {
  try {
    window.dispatchEvent(new Event(AUTH_USERINFO_UPDATED_EVENT));
  } catch {
    /* ignore */
  }
}

function parseStoredUserInfo(): AuthUserInfo | null {
  try {
    const raw = localStorage.getItem(USER_INFO_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as AuthUserInfo;
    if (!o || typeof o.id !== "string") return null;
    return o;
  } catch {
    return null;
  }
}

export const authStorage = {
  getToken(): string {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  },
  getRole(): string {
    return localStorage.getItem(ROLE_KEY) ?? "";
  },
  getUserInfo(): AuthUserInfo | null {
    return parseStoredUserInfo();
  },
  /**
   * @param userInfo 传入则持久化；`null` 清空；`undefined` 不改写（仅换 token/role 时兼容）
   */
  setAuth(token: string, role: string, userInfo?: AuthUserInfo | null) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ROLE_KEY, role);
    if (userInfo === undefined) {
      /* keep existing */
    } else if (userInfo === null) {
      localStorage.removeItem(USER_INFO_KEY);
    } else {
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
    }
    if (userInfo !== undefined) {
      dispatchUserInfoUpdated();
    }
  },
  setUserInfo(userInfo: AuthUserInfo | null) {
    if (userInfo === null) {
      localStorage.removeItem(USER_INFO_KEY);
    } else {
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
    }
    dispatchUserInfoUpdated();
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(USER_INFO_KEY);
  },
  hasToken(): boolean {
    return Boolean(this.getToken());
  },
  /** 与后端 AuthService.generateMockJwt 约定一致；非 mock 形态时返回 null */
  getUserIdFromToken(): string | null {
    const t = this.getToken();
    if (!t.startsWith(MOCK_JWT_PREFIX)) return null;
    const id = t.slice(MOCK_JWT_PREFIX.length).trim();
    return id.length > 0 ? id : null;
  },
};
