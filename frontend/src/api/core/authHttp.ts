import axios, { AxiosError } from "axios";
import { authStorage } from "@/features/auth/authStorage";
import { attachTokenRefreshInterceptor } from "./tokenRefresh";

export const authHttp = axios.create({
  baseURL: "/api",
  timeout: 20000,
});

/** 镜像模式下应以被查看学生身份调用的 API（非管理端） */
function shouldRouteMirrorToken(url: string): boolean {
  if (url.startsWith("/student/")) return true;
  // 学生物资申领：/material/cart、/material/requests 等；排除 /material/admin
  if (url.startsWith("/material/") && !url.startsWith("/material/admin")) return true;
  return false;
}

authHttp.interceptors.request.use((config) => {
  const url = config.url ?? "";

  // Mirror mode: 学生中心与物资申领走 mirror token，避免误用教职工登录态
  if (authStorage.isMirrorMode() && shouldRouteMirrorToken(url)) {
    const mirrorToken = authStorage.getMirrorToken();
    if (mirrorToken) {
      config.headers.Authorization = `Bearer ${mirrorToken}`;
      (config as any)._mirrorRequest = true;
      return config;
    }
    // Mirror token missing but mirror mode active — exit gracefully
    authStorage.exitMirrorMode();
    window.location.href = "/#/admin";
    return config;
  }

  // Default: use the main auth token (staff or actual student)
  const token = authStorage.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function rejectIfBusinessFailed(data: unknown): void {
  if (!data || typeof data !== "object") return;
  const body = data as Record<string, unknown>;
  if (body.success === false) {
    throw new Error(
      (typeof body.message === "string" && body.message) ||
        (typeof body.msg === "string" && body.msg) ||
        "请求失败"
    );
  }
  if (body.code != null && body.code !== 200) {
    throw new Error(
      (typeof body.message === "string" && body.message) ||
        (typeof body.msg === "string" && body.msg) ||
        `请求失败(${body.code})`
    );
  }
}

authHttp.interceptors.response.use(
  (response) => {
    rejectIfBusinessFailed(response.data);
    return response;
  },
  (error: AxiosError<{ message?: string }>) => {
    // 401 统一返回用户友好提示，不泄露后端技术细节
    if (error.response?.status === 401) {
      return Promise.reject(new Error("登录已过期，请重新登录"));
    }
    const message =
      error.response?.data?.message ??
      error.message ??
      "Network request failed";
    return Promise.reject(new Error(message));
  }
);

attachTokenRefreshInterceptor(authHttp);

// Mirror-mode 401 handler: runs BEFORE the token refresh interceptor
// (axios response interceptors execute in reverse addition order).
// When the mirror (student) token expires, exit mirror mode and return
// to staff admin — do NOT trigger token refresh or force-logout.
authHttp.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as any;
    if (error.response?.status === 401 && config?._mirrorRequest) {
      // Mirror token expired or invalid — exit mirror mode gracefully
      authStorage.exitMirrorMode();
      // Avoid redirect loops
      if (window.location.hash !== "#/admin") {
        window.location.href = "/#/admin";
      }
      return Promise.reject(error);
    }
    // Not a mirror request — let the token refresh interceptor handle it
    return Promise.reject(error);
  },
);
