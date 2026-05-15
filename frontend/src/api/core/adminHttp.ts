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

adminHttp.interceptors.response.use(
  (response) => response,
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
