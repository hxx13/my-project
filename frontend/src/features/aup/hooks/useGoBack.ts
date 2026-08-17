import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * 返回「上一个进入本页的页面」：
 * 1. 路由 state 带 returnTo（且是站内路径）→ 返回 returnTo；
 * 2. 浏览器有历史记录 → history 后退一步；
 * 3. 兜底 → 返回 fallbackPath。
 *
 * 比固定 navigate("/") 更符合「从哪来回哪去」，供填写页/缓冲页/编辑页等复用。
 */
export function useGoBack(fallbackPath = "/") {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    const returnTo = (location.state as { returnTo?: unknown } | null)?.returnTo;
    if (typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      navigate(returnTo);
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallbackPath);
    }
  }, [navigate, location.state, fallbackPath]);
}
