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

/* ── 页脚（公共站渲染，结构对齐 admin 的 PortalFooterConfig） ── */

export interface PortalFooterLink {
  label: string;
  url: string;
  requiresAuth?: boolean;
  sortOrder: number;
}

export interface PortalFooterGroup {
  group: string;
  sortOrder: number;
  items: PortalFooterLink[];
}

export interface PortalFooterData {
  copyright?: string;
  contact?: { phone?: string; email?: string; address?: string; workHours?: string };
  groups: PortalFooterGroup[];
}

/** 获取页脚配置。返回 null 时前端回退默认页脚。 */
export async function fetchPortalFooter(): Promise<PortalFooterData | null> {
  try {
    const response = await axios.get<Result<PortalFooterData>>("/api/public/portal-footer");
    if (!response.data?.success) return null;
    return response.data.data ?? null;
  } catch {
    return null;
  }
}

/* ── 今日进出统计（首页数据大盘） ── */

export interface PortalLineChart {
  times: string[];
  pudong: number[];
  puxi: number[];
}

export interface PortalStats {
  pudongTotal: number;
  puxiTotal: number;
  totalEnter: number;
  lineChart?: PortalLineChart;
}

/** 获取今日进出统计。失败时返回 null，前端显示 0。 */
export async function fetchPortalStats(): Promise<PortalStats | null> {
  try {
    const response = await axios.get<Result<PortalStats>>("/api/public/portal-stats");
    if (!response.data?.success || !response.data?.data) {
      return null;
    }
    const d = response.data.data;
    return {
      pudongTotal: Number(d.pudongTotal) || 0,
      puxiTotal: Number(d.puxiTotal) || 0,
      totalEnter: Number(d.totalEnter) || 0,
      lineChart: d.lineChart,
    };
  } catch {
    return null;
  }
}
