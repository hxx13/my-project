import axios, { AxiosError } from "axios";
import { authStorage } from "@/features/auth/authStorage";

export const authHttp = axios.create({
  baseURL: "/api",
  timeout: 20000,
});

authHttp.interceptors.request.use((config) => {
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
    const message =
      error.response?.data?.message ??
      error.message ??
      "Network request failed";
    return Promise.reject(new Error(message));
  }
);
