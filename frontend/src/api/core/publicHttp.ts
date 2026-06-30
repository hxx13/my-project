import axios from "axios";

/** 公开接口专用（无需登录态），baseURL 指向 /api */
export const publicHttp = axios.create({
  baseURL: "/api",
  timeout: 15000,
});
