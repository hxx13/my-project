import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export type UseGoBackOptions = {
  /**
   * 门户缓冲/落地页：优先 history 后退（同会话内上一路由）。
   * 管理端 content-manager 默认 false：优先 returnTo，以恢复筛选/选中 URL。
   */
  preferHistory?: boolean;
};

function sanitizeReturnTo(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  return t;
}

/** 同会话内是否有可后退的 SPA 历史（hash 下 length>1 几乎总真，故优先看 remix idx） */
function canHistoryBack(): boolean {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  if (typeof idx === "number") return idx > 0;
  return window.history.length > 1;
}

/**
 * 返回「上一个进入本页的页面」。
 *
 * 默认（管理端）：returnTo → history -1 → fallbackPath
 * preferHistory（门户缓冲/落地）：history -1 → returnTo → fallbackPath
 */
export function useGoBack(fallbackPath = "/", options?: UseGoBackOptions) {
  const navigate = useNavigate();
  const location = useLocation();
  const preferHistory = options?.preferHistory === true;

  return useCallback(() => {
    const returnTo = sanitizeReturnTo((location.state as { returnTo?: unknown } | null)?.returnTo);

    if (preferHistory) {
      if (canHistoryBack()) {
        navigate(-1);
        return;
      }
      if (returnTo) {
        navigate(returnTo);
        return;
      }
      navigate(fallbackPath);
      return;
    }

    if (returnTo) {
      navigate(returnTo);
      return;
    }
    if (canHistoryBack()) {
      navigate(-1);
    } else {
      navigate(fallbackPath);
    }
  }, [navigate, location.state, fallbackPath, preferHistory]);
}
