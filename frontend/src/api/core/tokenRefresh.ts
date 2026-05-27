import axios, { AxiosError } from "axios";
import { authStorage } from "@/features/auth/authStorage";

let refreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
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
                authStorage.clear();
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
                authStorage.clear();
                return Promise.reject(error);
            } finally {
                refreshing = false;
                refreshPromise = null;
            }
        },
    );
}
