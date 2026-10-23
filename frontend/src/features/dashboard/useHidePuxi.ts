import { useQuery } from "@tanstack/react-query";
import { fetchPublicRuntimeConfig } from "@/api/domains/notification.api";

/** 配置键：后台「系统参数 → 前端运行时」里的隐藏浦西开关 */
export const HIDE_PUXI_CONFIG_KEY = "dashboard.hide_puxi";

function parseBool(raw: string | undefined): boolean {
  const s = (raw ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

/**
 * 首页大屏是否隐藏浦西相关渲染。
 *
 * 与 RuleCodexCard 共用 `public-runtime-config` 查询键，不会额外发请求；
 * 后台改开关后最多 60 秒自动生效（大屏常年不聚焦也要后台轮询）。
 */
export function useHidePuxi(): boolean {
  const { data } = useQuery({
    queryKey: ["public-runtime-config"],
    queryFn: fetchPublicRuntimeConfig,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });
  return parseBool(data?.[HIDE_PUXI_CONFIG_KEY]);
}
