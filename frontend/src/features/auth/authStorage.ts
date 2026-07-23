import type { AuthUserInfo } from "@/api/domains/auth.api";
import { resetAuthSessionQueries } from "@/features/auth/authQueryScope";
import { resetStudentSessionQueries } from "@/features/student/utils/studentQueryScope";

const TOKEN_KEY = "auth_token";
const ROLE_KEY = "auth_role";
const USER_INFO_KEY = "auth_user_info";
const PREV_TOKEN_KEY = "auth_prev_token";
const PREV_ROLE_KEY = "auth_prev_role";
const PREV_USER_INFO_KEY = "auth_prev_user_info";
/** 扫码弹窗 PIN 验证后进入学生中心时写入，用于顶栏仅展示「返回扫码页」、隐藏退出登录 */
const STUDENT_ENTRY_FROM_SCAN_KEY = "student_entry_from_scan";
const MOCK_JWT_PREFIX = "jwt_mock_token_";
/** 登录入口视角：教职工门户 /login vs 学生门户 /student/login */
const LOGIN_PORTAL_KEY = "auth_login_portal";

export type AuthLoginPortal = "staff" | "student" | "mobile";

// ===== Mirror Mode: staff viewing student page without auth swap =====
const MIRROR_TOKEN_KEY = "mirror_token";
const MIRROR_USER_INFO_KEY = "mirror_user_info";
const MIRROR_ACTIVE_KEY = "mirror_active";
const MIRROR_SOURCE_KEY = "mirror_source"; // "scan" | "aro_impersonate"

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
  markLoginPortal(portal: AuthLoginPortal) {
    localStorage.setItem(LOGIN_PORTAL_KEY, portal);
  },

  getLoginPortal(): AuthLoginPortal | null {
    const v = localStorage.getItem(LOGIN_PORTAL_KEY);
    return v === "staff" || v === "student" || v === "mobile" ? v : null;
  },

  clearLoginPortal() {
    localStorage.removeItem(LOGIN_PORTAL_KEY);
  },

  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(USER_INFO_KEY);
    // 不清 portal —— 退登后 pending 请求触发 forceLogout 时仍需知道跳哪个登录页
    this.clearStudentEntryFromScan();
    this.exitMirrorMode();
    resetAuthSessionQueries();
  },

  /** 标记当前学生中心会话来自扫码弹窗（特殊通道） */
  markStudentEntryFromScan() {
    try {
      sessionStorage.setItem(STUDENT_ENTRY_FROM_SCAN_KEY, "1");
    } catch {
      /* ignore */
    }
  },

  isStudentEntryFromScan(): boolean {
    try {
      return sessionStorage.getItem(STUDENT_ENTRY_FROM_SCAN_KEY) === "1";
    } catch {
      return false;
    }
  },

  clearStudentEntryFromScan() {
    try {
      sessionStorage.removeItem(STUDENT_ENTRY_FROM_SCAN_KEY);
    } catch {
      /* ignore */
    }
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

  /**
   * 特殊通道进入学生中心前，保存当前登录态为"上一会话"。
   * 用于返回扫码页时恢复教职工身份，避免角色泄露或被迫重新登录。
   */
  savePreviousSession() {
    const token = this.getToken();
    if (!token) return; // 无当前会话则跳过
    localStorage.setItem(PREV_TOKEN_KEY, token);
    localStorage.setItem(PREV_ROLE_KEY, this.getRole());
    const raw = localStorage.getItem(USER_INFO_KEY);
    if (raw) localStorage.setItem(PREV_USER_INFO_KEY, raw);
  },

  /** 是否存在已保存的上一会话 */
  hasPreviousSession(): boolean {
    return Boolean(localStorage.getItem(PREV_TOKEN_KEY));
  },

  /**
   * 从学生中心返回扫码页时调用：恢复上一会话身份。
   * @returns true=已恢复上一会话，false=无上一会话（调用方需自行清理跳转）
   */
  restorePreviousSession(): boolean {
    const prevToken = localStorage.getItem(PREV_TOKEN_KEY);
    if (!prevToken) {
      this.clear();
      return false;
    }
    const prevRole = localStorage.getItem(PREV_ROLE_KEY) ?? "";
    let prevUserInfo = null;
    try {
      const raw = localStorage.getItem(PREV_USER_INFO_KEY);
      if (raw) prevUserInfo = JSON.parse(raw);
    } catch { /* ignore */ }

    this.setAuth(prevToken, prevRole, prevUserInfo as AuthUserInfo | null);
    this.clearPreviousSession();
    this.clearStudentEntryFromScan();
    return true;
  },

  /** 清除已保存的上一会话（不修改当前登录态） */
  clearPreviousSession() {
    localStorage.removeItem(PREV_TOKEN_KEY);
    localStorage.removeItem(PREV_ROLE_KEY);
    localStorage.removeItem(PREV_USER_INFO_KEY);
  },

  // ===== Mirror Mode: staff viewing student page =====

  /** Whether mirror mode is active (localStorage, survives refresh) */
  isMirrorMode(): boolean {
    try {
      return localStorage.getItem(MIRROR_ACTIVE_KEY) === "1";
    } catch {
      return false;
    }
  },

  /** Get the target student's token for API calls */
  getMirrorToken(): string {
    return localStorage.getItem(MIRROR_TOKEN_KEY) ?? "";
  },

  /** Get the target student's user info */
  getMirrorUserInfo(): AuthUserInfo | null {
    try {
      const raw = localStorage.getItem(MIRROR_USER_INFO_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AuthUserInfo;
    } catch {
      return null;
    }
  },

  /** Which flow entered mirror mode: "scan" or "aro_impersonate" */
  getMirrorSource(): string | null {
    return localStorage.getItem(MIRROR_SOURCE_KEY) ?? null;
  },

  /** Get the mirrored student's user ID (for TanStack Query cache scoping) */
  getMirrorUserId(): string | null {
    const info = this.getMirrorUserInfo();
    return info?.id?.trim() || null;
  },

  /**
   * Enter mirror mode: store student token/info alongside staff auth.
   * Staff auth (token, role, userInfo) remains completely untouched.
   * @param source "scan" for scanner PIN/face entry, "aro_impersonate" for ARO switch
   */
  enterMirrorMode(token: string, userInfo: AuthUserInfo, source: "scan" | "aro_impersonate") {
    localStorage.setItem(MIRROR_TOKEN_KEY, token);
    if (userInfo) {
      localStorage.setItem(MIRROR_USER_INFO_KEY, JSON.stringify(userInfo));
    } else {
      localStorage.removeItem(MIRROR_USER_INFO_KEY);
    }
    localStorage.setItem(MIRROR_ACTIVE_KEY, "1");
    localStorage.setItem(MIRROR_SOURCE_KEY, source);
    // Flush stale TanStack Query caches from previous student session
    try { resetStudentSessionQueries(); } catch { /* ignore */ }
  },

  /**
   * Exit mirror mode: clear all mirror keys, cleanup flags.
   * Does NOT modify main auth (staff token/role/userInfo remain intact).
   * Caller is responsible for navigation.
   */
  exitMirrorMode() {
    localStorage.removeItem(MIRROR_TOKEN_KEY);
    localStorage.removeItem(MIRROR_USER_INFO_KEY);
    localStorage.removeItem(MIRROR_ACTIVE_KEY);
    localStorage.removeItem(MIRROR_SOURCE_KEY);
    this.clearStudentEntryFromScan();
    try { resetStudentSessionQueries(); } catch { /* ignore */ }
  },
};
