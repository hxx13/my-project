import axios from "axios";

interface Result<T> {
  code: number;
  message: string;
  success: boolean;
  data: T;
}

export type LoginBranding = {
  /** 兼容旧版，等同 heroImageUrlsLight */
  heroImageUrls: string[];
  heroImageUrlsLight?: string[];
  heroImageUrlsDark?: string[];
  intervalSec: number;
  /** 后台开关：为 false 时不展示背景轮播（仅纯色与装饰层） */
  heroCarouselEnabled?: boolean;
};

/** 按当前亮/暗色模式选取轮播 URL 列表 */
export function pickLoginHeroUrls(
  branding: LoginBranding | null | undefined,
  mode: "light" | "dark"
): string[] {
  if (!branding) return [];
  const lightRaw = branding.heroImageUrlsLight?.length
    ? branding.heroImageUrlsLight
    : branding.heroImageUrls;
  const light = (lightRaw || []).map((u) => String(u).trim()).filter(Boolean);
  const dark = (branding.heroImageUrlsDark || []).map((u) => String(u).trim()).filter(Boolean);
  if (mode === "dark") {
    return dark.length > 0 ? dark : light;
  }
  return light;
}

export async function fetchLoginBranding(): Promise<LoginBranding> {
  const response = await axios.get<Result<LoginBranding>>("/api/public/login-branding");
  if (!response.data?.success || !response.data?.data) {
    throw new Error(response.data?.message || "加载登录配置失败");
  }
  return response.data.data;
}

export type PortalLineChart = {
  times: string[];
  pudong: number[];
  puxi: number[];
};

export type PortalStats = {
  totalEnter: number;
  pudongTotal: number;
  puxiTotal: number;
  lineChart?: PortalLineChart;
};

export async function fetchPortalStats(): Promise<PortalStats> {
  const response = await axios.get<Result<PortalStats>>("/api/public/portal-stats");
  if (!response.data?.success || !response.data?.data) {
    throw new Error(response.data?.message || "加载首页统计失败");
  }
  return response.data.data;
}