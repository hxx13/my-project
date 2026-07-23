/**
 * 小程序云开发 fileID；浏览器无法直接用于 <img src>。
 */
export function isCloudFileId(url: string | null | undefined): boolean {
  const u = (url != null && String(url).trim()) || "";
  return u.startsWith("cloud://");
}

/** 解析 VITE_API_BASE_URL 的 origin；未配置则 undefined */
export function getConfiguredApiOrigin(): string | undefined {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return undefined;
  }
}

/** 将 /api/... 转为当前部署可访问的地址（同源用相对路径，跨域用 API 公网 origin） */
function withApiOrigin(apiPath: string): string {
  const path = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  const configured = getConfiguredApiOrigin();
  if (configured && typeof window !== "undefined" && configured !== window.location.origin) {
    return `${configured}${path}`;
  }
  return path;
}

/**
 * 浏览器端可用的图片地址（上传文件、帮助富文本、物资封面等共用）。
 * - cloud:// → /api/upload/proxy-image
 * - /api/... → 按部署环境补全 origin（或保持相对路径）
 * - 开发环境误存的 localhost 绝对地址 → 规范为 /api/... 路径
 */
export function resolveApiMediaUrl(url: string | null | undefined): string | undefined {
  const u = (url != null && String(url).trim()) || "";
  if (!u) return undefined;

  if (isCloudFileId(u)) {
    return withApiOrigin(`/api/upload/proxy-image?url=${encodeURIComponent(u)}`);
  }

  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u);
      if (parsed.pathname.startsWith("/api/")) {
        return withApiOrigin(parsed.pathname + parsed.search);
      }
    } catch {
      /* 非 API 绝对地址原样返回 */
    }
    return u;
  }

  if (u.startsWith("/api/")) {
    return withApiOrigin(u);
  }

  return u;
}

/**
 * Web 端可用的图片地址。
 * @deprecated 请使用 resolveApiMediaUrl；保留别名避免大范围改动
 */
export function webImageSrc(url: string | null | undefined): string | undefined {
  return resolveApiMediaUrl(url);
}

/**
 * 从 UploadFileRecord 返回数据中选择最适合当前端的图片 src。
 * 浏览器端优先 publicUrl（可直接访问），wechat cloud:// 格式不可用。
 */
export function dualImageSrc(params: {
  publicUrl?: string;
  wechatFileId?: string;
  fallback?: string;
}): string | undefined {
  const { publicUrl, wechatFileId, fallback } = params;
  // 浏览器端：publicUrl 可直接访问
  if (publicUrl) return publicUrl;
  // 如果只有 wechatFileId（非 cloud:// 格式方可渲染）
  if (wechatFileId && !isCloudFileId(wechatFileId)) return wechatFileId;
  return fallback;
}

export type DualImageSource = {
  publicUrl?: string;
  wechatFileId?: string;
};
