/**
 * 小程序 `<image>` 展示 URL 解析（与 package-feature/utils/workorderMedia.js 同源）。
 * 主包与子包共用，避免主包依赖分包工具。
 */
const springAuth = require('./springAuth.js');

function mapMediaUrlList(urls) {
  if (!Array.isArray(urls)) return [];
  return urls.map((u) => springAuth.toAbsoluteMediaUrl(u)).filter(Boolean);
}

/**
 * 小程序 `<image>` 展示用：cloud:// 走 proxy-image 兜底，其它走已配置的 API 域名。
 */
function toProxiedDisplayUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  // cloud:// 文件 → 走 proxy-image 兜底
  if (u.startsWith('cloud://')) {
    const proxyPath = `/api/upload/proxy-image?url=${encodeURIComponent(u)}`;
    return springAuth.toAbsoluteApiUrl(proxyPath);
  }
  // 绝对 HTTP(S) URL → 直连，不包 proxy-image
  if (/^https?:\/\//i.test(u)) {
    return u;
  }
  // 相对路径 → 拼 API 基址
  if (u.startsWith('/api/upload/files/') || u.startsWith('/api/upload/proxy-image')) {
    return springAuth.toAbsoluteApiUrl(u);
  }
  if (u.startsWith('/api/')) {
    return springAuth.toAbsoluteApiUrl(u);
  }
  return u;
}

function resolveOneDisplayUrl(url, _cloudMappings) {
  return toProxiedDisplayUrl(url);
}

async function resolveMediaUrlsForDisplay(urls) {
  if (!Array.isArray(urls) || !urls.length) return [];
  // 先拉最新 runtime config（uploadPublicBaseUrl / apiPublicBaseUrl），再解析 URL
  await springAuth.refreshPublicRuntimeConfig().catch(() => null);
  return urls.map((u) => toProxiedDisplayUrl(u)).filter(Boolean);
}

module.exports = {
  mapMediaUrlList,
  toProxiedDisplayUrl,
  resolveOneDisplayUrl,
  resolveMediaUrlsForDisplay,
};
