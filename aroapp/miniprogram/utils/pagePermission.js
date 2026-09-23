const springAuth = require('./springAuth.js');
const { getRoleLevel } = require('./roleAccess.js');

const CACHE = {
  mini: null,
  loadedAt: 0,
};

/** 分包页面与后台「页面权限」仍按主包 /pages/... 配置；导航可用任一分包的路径。
 *  每新增一个分包都要把前缀补进来 —— 漏一个，该分包页面的权限就会查不到配置、
 *  静默退化到 fallback 角色判定（页面照常进，权限口径却变了）。 */
const SUBPKG_PAGE_PREFIXES = [
  '/package-feature/pages/',
  '/package-supplies/pages/',
  '/package-door/pages/',
  '/package-student/pages/',
  '/package-ops/pages/',
];

function normalizePath(path) {
  const raw = String(path || '').trim();
  if (!raw) return '';
  let p = (raw.startsWith('/') ? raw : `/${raw}`).replace(/\/+/g, '/');
  /** 分包页面与后台「页面权限」仍按主包 /pages/... 配置；导航可用分包路径 */
  for (let i = 0; i < SUBPKG_PAGE_PREFIXES.length; i += 1) {
    const pre = SUBPKG_PAGE_PREFIXES[i];
    if (p.startsWith(pre)) {
      p = `/pages/${p.slice(pre.length)}`;
      break;
    }
  }
  return p;
}

function roleAllowed(currentRole, minRole) {
  return getRoleLevel(currentRole) >= getRoleLevel(minRole || 'STUDENT');
}

async function refreshMiniPermissions() {
  try {
    const res = await springAuth.callSpringDirect({
      path: '/api/public/page-permissions',
      method: 'GET',
      data: { platform: 'MINI' },
    });
    const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (res.statusCode === 200 && body && body.success === true && Array.isArray(body.data)) {
      CACHE.mini = body.data;
      CACHE.loadedAt = Date.now();
      return CACHE.mini;
    }
  } catch (e) {
    // keep fallback
  }
  if (!Array.isArray(CACHE.mini)) CACHE.mini = [];
  return CACHE.mini;
}

function getMiniPermissions() {
  return Array.isArray(CACHE.mini) ? CACHE.mini : [];
}

function canAccessMiniPage(path, role, fallbackMinRole) {
  const rows = getMiniPermissions();
  const route = normalizePath(path);
  const hit = rows.find((x) => x && x.platform === 'MINI' && x.nodeType === 'PAGE' && normalizePath(x.pathOrRoute) === route);
  if (!hit) return roleAllowed(role, fallbackMinRole || 'STUDENT');
  if (Number(hit.enabled) !== 1) return false;
  return roleAllowed(role, hit.minRole || 'STUDENT');
}

function canShowMiniEntry(source, path, role, fallbackMinRole) {
  const rows = getMiniPermissions();
  const route = normalizePath(path);
  const hit = rows.find(
    (x) =>
      x &&
      x.platform === 'MINI' &&
      x.nodeType === 'ENTRY' &&
      normalizePath(x.pathOrRoute) === route &&
      String(x.entrySource || '') === String(source || '')
  );
  if (!hit) return roleAllowed(role, fallbackMinRole || 'STUDENT');
  if (Number(hit.enabled) !== 1) return false;
  return roleAllowed(role, hit.minRole || 'STUDENT');
}

function guardPageOnShow(pageCtx, pagePath, role, fallbackMinRole) {
  if (canAccessMiniPage(pagePath, role, fallbackMinRole)) return true;
  wx.showToast({ title: '页面权限受限', icon: 'none' });
  setTimeout(() => wx.navigateBack({ delta: 1 }), 300);
  return false;
}

module.exports = {
  normalizePath,
  refreshMiniPermissions,
  getMiniPermissions,
  canAccessMiniPage,
  canShowMiniEntry,
  guardPageOnShow,
};

