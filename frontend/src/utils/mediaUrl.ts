/**
 * 小程序云开发 fileID；浏览器无法直接用于 <img src>。
 */
export function isCloudFileId(url: string | null | undefined): boolean {
  const u = (url != null && String(url).trim()) || "";
  return u.startsWith("cloud://");
}

/**
 * Web 端可用的图片地址；cloud:// 返回 undefined。
 */
export function webImageSrc(url: string | null | undefined): string | undefined {
  const u = (url != null && String(url).trim()) || "";
  if (!u) return undefined;
  if (isCloudFileId(u)) return undefined;
  return u;
}
