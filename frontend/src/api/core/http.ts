import axios, { AxiosError } from "axios";
import type { ApiResponse } from "@/api/types/common";
import { authStorage } from "@/features/auth/authStorage";

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
        const message =
            error.response?.data?.message ??
            error.message ??
            "Network request failed";
        return Promise.reject(new Error(message));
    }
);

export const unwrapApiResponse = <T>(payload: ApiResponse<T>): T => payload.data;
