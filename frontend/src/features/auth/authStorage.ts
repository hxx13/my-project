import type { AuthUserInfo } from "@/api/domains/auth.api";

const TOKEN_KEY = "auth_token";
const ROLE_KEY = "auth_role";
const USER_INFO_KEY = "auth_user_info";
const PREV_TOKEN_KEY = "auth_prev_token";
const PREV_ROLE_KEY = "auth_prev_role";
const PREV_USER_INFO_KEY = "auth_prev_user_info";
/** 扫码弹窗 PIN 验证后进入学生中心时写入，用于顶栏仅展示「返回扫码页」、隐藏退出登录 */
const STUDENT_ENTRY_FROM_SCAN_KEY = "student_entry_from_scan";
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
    this.clearStudentEntryFromScan();
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
};
