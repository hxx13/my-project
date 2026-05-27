import axios, { AxiosError } from "axios";
import { authStorage } from "@/features/auth/authStorage";

export const adminHttp = axios.create({
  baseURL: "/api/admin",
  timeout: 15000,
});

adminHttp.interceptors.request.use((config) => {
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

adminHttp.interceptors.response.use(
  (response) => {
    rejectIfBusinessFailed(response.data);
    return response;
  },
  (error: AxiosError<Record<string, unknown>>) => {
    const data = (error.response?.data ?? {}) as Record<string, unknown>;
    const code = data.code != null ? String(data.code) : "";
    const message =
      (typeof data.message === "string" && data.message) ||
      (typeof data.msg === "string" && data.msg) ||
      (typeof data.error === "string" && data.error) ||
      "";
    const errMsg =
      (typeof data.errMsg === "string" && data.errMsg) ||
      (typeof data.detail === "string" && data.detail) ||
      "";
    const detailParts = [message, errMsg].filter(Boolean);
    const detail = detailParts.join(" | ");
    const finalMessage = detail
      ? `${code ? `[${code}] ` : ""}${detail}`
      : (error.message || "Network request failed");
    return Promise.reject(new Error(finalMessage));
  }
);
