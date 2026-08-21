/**
 * 与 Web 登录页 / admin/login-branding 同源：按时段切换亮/暗色轮播图。
 * 小程序展示与 package-feature/utils/workorderMedia.js 完全一致：
 * mapMediaUrlList → cloud-mappings → cloud:// 优先。
 */
const springAuth = require('./springAuth.js');
const { resolveMediaUrlsForDisplay } = require('./mpDisplayMedia.js');

const DEFAULT_LIGHT_START = '08:00';
const DEFAULT_LIGHT_END = '16:30';

function parseTimeToMinutes(hhmm) {
  const parts = String(hhmm || '').trim().split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(23, h)) * 60 + Math.max(0, Math.min(59, m));
}

/** @returns {'light'|'dark'} */
function getScheduledHeroMode(now) {
  const d = now instanceof Date ? now : new Date();
  const mins = d.getHours() * 60 + d.getMinutes();
  const start = parseTimeToMinutes(DEFAULT_LIGHT_START);
  const end = parseTimeToMinutes(DEFAULT_LIGHT_END);
  if (start === end) return 'light';
  if (start < end) {
    return mins >= start && mins < end ? 'light' : 'dark';
  }
  return mins >= start || mins < end ? 'light' : 'dark';
}

function msUntilNextScheduleBoundary(now) {
  const d = now instanceof Date ? now : new Date();
  const boundaries = [DEFAULT_LIGHT_START, DEFAULT_LIGHT_END].map((t) => {
    const m = parseTimeToMinutes(t);
    const b = new Date(d);
    b.setSeconds(0, 0);
    b.setHours(Math.floor(m / 60), m % 60, 0, 0);
    return b.getTime();
  });
  let next = boundaries.find((t) => t > d.getTime());
  if (next == null) {
    const tomorrow = new Date(d);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setSeconds(0, 0);
    const m = parseTimeToMinutes(DEFAULT_LIGHT_START);
    tomorrow.setHours(Math.floor(m / 60), m % 60, 0, 0);
    next = tomorrow.getTime();
  }
  return Math.max(1000, next - d.getTime());
}

/** 与物资/报修存库格式一致：cloud:// 或 /api/upload/files/... */
function isUploadMediaUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return false;
  if (u.startsWith('cloud://')) return true;
  if (u.startsWith('/api/upload/files/')) return true;
  return /^https?:\/\//i.test(u) && u.includes('/api/upload/files/');
}

function listHeroUrlsRaw(branding, mode) {
  if (!branding) return [];
  const lightRaw = branding.heroImageUrlsLight && branding.heroImageUrlsLight.length
    ? branding.heroImageUrlsLight
    : branding.heroImageUrls;
  const lightAll = (lightRaw || []).map((u) => String(u).trim()).filter(Boolean);
  const darkAll = (branding.heroImageUrlsDark || []).map((u) => String(u).trim()).filter(Boolean);
  const light = lightAll.filter(isUploadMediaUrl);
  const dark = darkAll.filter(isUploadMediaUrl);
  const skipped = lightAll.length + darkAll.length - light.length - dark.length;
  if (skipped > 0) {
    console.warn(
      '[loginBrandingHero] 已忽略',
      skipped,
      '条非 /api/upload/files/ 轮播地址；请在管理后台用统一上传重新上传并保存'
    );
  }
  if (mode === 'dark') {
    return dark.length > 0 ? dark : light;
  }
  return light;
}

function pickLoginHeroUrls(branding, mode) {
  return listHeroUrlsRaw(branding, mode);
}

/** 与 workorderMedia.resolveMediaUrlsForDisplay 同源，供首页 swiper `<image>` */
async function resolveHeroBannerUrlsForDisplay(branding, mode) {
  const rawList = listHeroUrlsRaw(branding, mode);
  if (!rawList.length) return [];
  const urls = await resolveMediaUrlsForDisplay(rawList);
  if (rawList.some((u) => u && !u.startsWith('cloud://'))) {
    springAuth.triggerCloudSync();
  }
  return urls;
}

async function fetchLoginBranding() {
  const res = await springAuth.callSpringProxy({
    path: '/api/public/login-branding',
    method: 'GET',
    data: {},
    authorization: '',
  });
  const body = res.data && typeof res.data === 'object' ? res.data : {};
  if (res.statusCode === 200 && body.success === true && body.data) return body.data;
  throw new Error(body.message || body.msg || '加载轮播配置失败');
}

module.exports = {
  DEFAULT_LIGHT_START,
  DEFAULT_LIGHT_END,
  getScheduledHeroMode,
  msUntilNextScheduleBoundary,
  pickLoginHeroUrls,
  resolveHeroBannerUrlsForDisplay,
  fetchLoginBranding,
};
