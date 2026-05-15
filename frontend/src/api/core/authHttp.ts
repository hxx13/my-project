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

authHttp.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    const message =
      error.response?.data?.message ??
      error.message ??
      "Network request failed";
    return Promise.reject(new Error(message));
  }
);
