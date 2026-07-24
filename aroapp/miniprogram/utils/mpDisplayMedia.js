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
  if (u.startsWith('cloud://')) {
    const proxyPath = `/api/upload/proxy-image?url=${encodeURIComponent(u)}`;
    return springAuth.toAbsoluteApiUrl(proxyPath);
  }
  if (u.startsWith('/api/upload/files/') || u.startsWith('/api/upload/proxy-image')) {
    return springAuth.toAbsoluteApiUrl(u);
  }
  // 绝对 HTTP(S) URL：生产域名走代理兜底，其他（localhost/内网）直连
  if (/^https?:\/\//i.test(u)) {
    if (u.includes('localhost') || u.includes('127.0.0.1') || u.includes('192.168.') || u.includes('10.') || u.includes('172.')) {
      return u;
    }
    const proxyPath = `/api/upload/proxy-image?url=${encodeURIComponent(u)}`;
    return springAuth.toAbsoluteApiUrl(proxyPath);
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
