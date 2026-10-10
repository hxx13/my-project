import axios, { AxiosError } from "axios";
import type { ApiResponse } from "@/api/types/common";
import { authStorage } from "@/features/auth/authStorage";
import { reportIfServerUnreachable } from "@/store/useServerDownStore";
import { attachTokenRefreshInterceptor } from "./tokenRefresh";

export const http = axios.create({
    baseURL: "/api/v1/twin",
    timeout: 15000,
});

http.interceptors.request.use((config) => {
    const token = authStorage.getToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    const role = authStorage.getRole();
    if (role) {
        config.headers["X-Scan-Operator-Role"] = role;
    }
    return config;
});

http.interceptors.response.use(
    (response) => response,
    (error: AxiosError<{ message?: string }>) => {
        // 后端不可达（重启/停机）不吐技术原文 —— 全局弹窗统一提示，见 ServerRestartNotice
        if (reportIfServerUnreachable(error)) {
            return Promise.reject(new Error("服务器暂时不可用，请稍候"));
        }
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

attachTokenRefreshInterceptor(http);

export const unwrapApiResponse = <T>(payload: ApiResponse<T>): T => payload.data;
