import axios, { AxiosError } from "axios";
import type { ApiResponse } from "@/api/types/common";

export const http = axios.create({
    baseURL: "/api/v1/twin",
    timeout: 15000,
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
