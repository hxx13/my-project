/**
 * 上海交大医学院 IAM OAuth2 前端辅助（仅公开参数；secret 不进前端）。
 * 回调落地根路径 ?code=&state=（Hash 路由外），由 PortalLandingPage 处理。
 *
 * 安全：授权码等不得长期留在地址栏 / 历史 / 可分享链接；见 stripOAuthCallbackQueryEarly。
 */

const STATE_KEY = "iam_oauth_state";
const PENDING_CALLBACK_KEY = "iam_oauth_pending_callback";

/** 根路径 search 上可能出现的 OAuth 回调 query（不含 Hash 内业务 ?code=） */
const OAUTH_CALLBACK_QUERY_KEYS = [
  "code",
  "state",
  "error",
  "error_description",
  "error_uri",
  "session_state",
  "iss",
] as const;

export const IAM_ERROR = {
  PERSON_NOT_FOUND: "PERSON_NOT_FOUND",
  PERSON_AMBIGUOUS: "PERSON_AMBIGUOUS",
  ACCOUNT_NOT_PROVISIONED: "ACCOUNT_NOT_PROVISIONED",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  INVALID_REDIRECT_URI: "INVALID_REDIRECT_URI",
  INVALID_STATE: "INVALID_STATE",
  OAUTH_FAILED: "OAUTH_FAILED",
  /** 预留：仅后端 registration.enabled=true 时可能返回；前端不挂注册入口 */
  REGISTRATION_REQUIRED: "REGISTRATION_REQUIRED",
  NEED_REGISTER: "NEED_REGISTER",
} as const;

export type IamErrorCode = (typeof IAM_ERROR)[keyof typeof IAM_ERROR];

export type IamOAuthCallbackResult =
  | { kind: "code"; code: string; state: string }
  | { kind: "error"; error: string; errorDescription: string; state: string };

function envOr(key: string, fallback: string): string {
  try {
    const v = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[key];
    return typeof v === "string" && v.trim() ? v.trim() : fallback;
  } catch {
    return fallback;
  }
}

/** 公开配置；本地联调可用 VITE_IAM_* 覆盖 */
export function getIamOAuthPublicConfig() {
  return {
    authBase: envOr("VITE_IAM_AUTH_BASE", "https://auth.shsmu.edu.cn").replace(/\/+$/, ""),
    clientId: envOr("VITE_IAM_CLIENT_ID", "LADTWS"),
    redirectUri: envOr("VITE_IAM_REDIRECT_URI", "https://aroultra.shsmu.edu.cn/"),
  };
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 脱敏：只保留前后若干位，避免授权码原文进 toast / console */
export function maskOAuthSecret(value: string, head = 4, tail = 4): string {
  const v = String(value || "").trim();
  if (!v) return "";
  if (v.length <= head + tail + 1) return "***";
  return `${v.slice(0, head)}…${v.slice(-tail)}`;
}

/** 从文案中截断 code=/state= 等，防止误把授权码原文抛给用户（不误伤 PERSON_NOT_FOUND 等业务码） */
export function redactOAuthSecretsInText(text: string): string {
  return String(text || "")
    .replace(/([?&](?:code|state|session_state)=)([^&\s#"']+)/gi, (_m, prefix: string, raw: string) => {
      try {
        return prefix + maskOAuthSecret(decodeURIComponent(raw));
      } catch {
        return prefix + maskOAuthSecret(raw);
      }
    })
    .replace(/\b(?:authorization\s*code|auth(?:orization)?\s*code|oauth\s*code)\s*[:=]?\s*([A-Za-z0-9._~+/-]+=*)/gi,
      (_m, token: string) => `authorization code=${maskOAuthSecret(token)}`);
}

function hasOAuthCallbackQuery(params: URLSearchParams): boolean {
  return OAUTH_CALLBACK_QUERY_KEYS.some((k) => params.has(k));
}

/**
 * 在 React 渲染前调用：若根路径 search 带 OAuth 回调参数，先写入 sessionStorage，
 * 立刻 history.replaceState 清掉（保留 hash），避免 code 原文留在地址栏/历史。
 */
export function stripOAuthCallbackQueryEarly(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (!hasOAuthCallbackQuery(params)) return;

  const code = params.get("code");
  const state = params.get("state") || "";
  const error = params.get("error");

  try {
    if (code) {
      sessionStorage.setItem(
        PENDING_CALLBACK_KEY,
        JSON.stringify({ kind: "code", code, state } satisfies IamOAuthCallbackResult),
      );
    } else if (error) {
      sessionStorage.setItem(
        PENDING_CALLBACK_KEY,
        JSON.stringify({
          kind: "error",
          error,
          errorDescription: params.get("error_description") || "",
          state,
        } satisfies IamOAuthCallbackResult),
      );
    }
  } catch {
    /* ignore quota / private mode */
  }

  clearOAuthQueryFromUrl();
}

/** 跳转 IAM 授权页；state 写入 sessionStorage 供回调校验 */
export function startIamOAuthLogin(): void {
  const { authBase, clientId, redirectUri } = getIamOAuthPublicConfig();
  const state = randomState();
  try {
    sessionStorage.setItem(STATE_KEY, state);
  } catch {
    /* ignore */
  }
  const url =
    `${authBase}/idp/authCenter/authenticate` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;
  window.location.href = url;
}

function readPendingCallback(): IamOAuthCallbackResult | null {
  try {
    const raw = sessionStorage.getItem(PENDING_CALLBACK_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_CALLBACK_KEY);
    const parsed = JSON.parse(raw) as IamOAuthCallbackResult;
    if (parsed?.kind === "code" && typeof parsed.code === "string" && parsed.code) {
      return { kind: "code", code: parsed.code, state: parsed.state || "" };
    }
    if (parsed?.kind === "error" && typeof parsed.error === "string" && parsed.error) {
      return {
        kind: "error",
        error: parsed.error,
        errorDescription: parsed.errorDescription || "",
        state: parsed.state || "",
      };
    }
  } catch {
    try {
      sessionStorage.removeItem(PENDING_CALLBACK_KEY);
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * 取出一次 OAuth 回调（优先 early-strip 暂存；否则读 URL 并立刻清 query）。
 * 成功/失败收尾均应已清掉地址栏；此处再清一次以防漏网。
 */
export function consumeIamOAuthCallback(): IamOAuthCallbackResult | null {
  const pending = readPendingCallback();
  if (pending) {
    clearOAuthQueryFromUrl();
    return pending;
  }

  const params = new URLSearchParams(window.location.search);
  if (!hasOAuthCallbackQuery(params)) return null;

  const code = params.get("code");
  const state = params.get("state") || "";
  const error = params.get("error");
  clearOAuthQueryFromUrl();

  if (code) return { kind: "code", code, state };
  if (error) {
    return {
      kind: "error",
      error,
      errorDescription: params.get("error_description") || "",
      state,
    };
  }
  return null;
}

/** 校验 state；失败返回错误文案，成功返回 null */
export function validateAndClearIamState(returnedState: string): string | null {
  let expected = "";
  try {
    expected = sessionStorage.getItem(STATE_KEY) || "";
    sessionStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
  if (!expected || !returnedState || expected !== returnedState) {
    return "统一认证 state 校验失败，请重新登录";
  }
  return null;
}

/** 清掉根路径上的 OAuth 回调 query，保留 hash 路由与其它业务 query */
export function clearOAuthQueryFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of OAUTH_CALLBACK_QUERY_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return;
  const qs = url.searchParams.toString();
  const next = url.pathname + (qs ? `?${qs}` : "") + url.hash;
  window.history.replaceState(null, "", next);
}

/** IAM 全局登出（GLO）；本地会话应先 clear */
export function redirectIamGlobalLogout(): void {
  const { authBase, clientId, redirectUri } = getIamOAuthPublicConfig();
  const url =
    `${authBase}/idp/authCenter/GLO` +
    `?clientId=${encodeURIComponent(clientId)}` +
    `&redirectToLogin=false` +
    `&redirectToUrl=${encodeURIComponent(redirectUri)}`;
  window.location.href = url;
}

export function isIamAuthProfile(authProfile?: string | null): boolean {
  const p = (authProfile || "").trim().toUpperCase();
  return p === "IAM_OAUTH" || p === "CAS_LOGIN";
}
