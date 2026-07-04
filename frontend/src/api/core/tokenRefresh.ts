import axios, { AxiosError } from "axios";
import { authStorage } from "@/features/auth/authStorage";

let refreshing = false;
let refreshPromise: Promise<string | null> | null = null;
let logoutDispatched = false;

/** 强制登出：清除存储 → 通知其他模块(WebSocket等) → 跳转登录页 */
function forceLogout() {
    const portal = authStorage.getLoginPortal();
    authStorage.clear();
    if (!logoutDispatched) {
        logoutDispatched = true;
        try {
            window.dispatchEvent(new Event("AUTH_FORCE_LOGOUT"));
        } catch {
            /* ignore */
        }
    }
    const loginPath = portal === "student" ? "/student/login"
      : portal === "mobile" ? "/m/login"
      : "/login";
    if (window.location.pathname !== loginPath && window.location.hash !== `#${loginPath}`) {
        window.location.href = loginPath;
    }
}

export async function doRefresh(): Promise<string | null> {
    const oldToken = authStorage.getToken();
    if (!oldToken) return null;
    try {
        const res = await axios.post("/api/auth/token/refresh", null, {
            headers: { Authorization: `Bearer ${oldToken}` },
        });
        const data = res.data;
        if (data?.success && data?.data?.token) {
            const { token, role, userInfo } = data.data;
            authStorage.setAuth(token, role ?? authStorage.getRole(), userInfo ?? undefined);
            return token;
        }
        return null;
    } catch {
        return null;
    }
}

export function attachTokenRefreshInterceptor(
    instance: ReturnType<typeof axios.create>,
) {
    instance.interceptors.response.use(
        (response) => response,
        async (error: AxiosError) => {
            const status = error.response?.status;
            if (status !== 401) return Promise.reject(error);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const config = error.config as any;
            if (!config || config._retried) return Promise.reject(error);

            if (config.url?.includes("/api/auth/token/refresh")) {
                forceLogout();
                return Promise.reject(error);
            }

            if (!refreshing) {
                refreshing = true;
                refreshPromise = doRefresh();
            }

            try {
                const newToken = await refreshPromise;
                if (newToken && config) {
                    config._retried = true;
                    config.headers.Authorization = `Bearer ${newToken}`;
                    return instance(config);
                }
                forceLogout();
                return Promise.reject(error);
            } finally {
                refreshing = false;
                refreshPromise = null;
            }
        },
    );
}
