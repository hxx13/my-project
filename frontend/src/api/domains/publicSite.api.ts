import axios from "axios";

interface Result<T> {
  code: number;
  message: string;
  success: boolean;
  data: T;
}

export type LoginBranding = {
  heroImageUrls: string[];
  intervalSec: number;
  /** 后台开关：为 false 时不展示背景轮播（仅纯色与装饰层） */
  heroCarouselEnabled?: boolean;
};

export async function fetchLoginBranding(): Promise<LoginBranding> {
  const response = await axios.get<Result<LoginBranding>>("/api/public/login-branding");
  if (!response.data?.success || !response.data?.data) {
    throw new Error(response.data?.message || "加载登录配置失败");
  }
  return response.data.data;
}
