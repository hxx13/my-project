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
 * 小程序 `<image>` 展示用：优先 cloud://，否则走已配置的 API 域名（proxy / files）。
 */
function toProxiedDisplayUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (u.startsWith('cloud://')) return u;
  if (u.startsWith('/api/upload/files/') || u.startsWith('/api/upload/proxy-image')) {
    return springAuth.toAbsoluteApiUrl(u);
  }
  if (/^https?:\/\//i.test(u)) {
    const proxyPath = `/api/upload/proxy-image?url=${encodeURIComponent(u)}`;
    return springAuth.toAbsoluteApiUrl(proxyPath);
  }
  if (u.startsWith('/api/')) {
    return springAuth.toAbsoluteApiUrl(u);
  }
  return u;
}

function resolveOneDisplayUrl(url, cloudMappings) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (u.startsWith('cloud://')) return u;
  const cloud = cloudMappings && cloudMappings[u];
  if (cloud) return cloud;
  return toProxiedDisplayUrl(u);
}

async function resolveMediaUrlsForDisplay(urls) {
  const normalized = mapMediaUrlList(urls);
  if (!normalized.length) return [];
  await springAuth.refreshPublicRuntimeConfig().catch(() => null);
  const httpUrls = normalized.filter((u) => u && !u.startsWith('cloud://'));
  let cloudMappings = {};
  if (httpUrls.length) {
    const res = await springAuth.resolveCloudUrls(httpUrls);
    cloudMappings = (res && res.mappings) || {};
  }
  return normalized.map((u) => resolveOneDisplayUrl(u, cloudMappings)).filter(Boolean);
}

module.exports = {
  mapMediaUrlList,
  toProxiedDisplayUrl,
  resolveOneDisplayUrl,
  resolveMediaUrlsForDisplay,
};
