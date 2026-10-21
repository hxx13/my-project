/**
 * 远程屏幕控制：列出正在展示本网站的网页，并让其中一台跳到指定页面。
 *
 * 复用后台同档接口（/api/admin/screens/**，ADMIN+），不另开后门。
 * 屏幕靠「标签页自己生成的编号 + 用户起的名字」辨认，见网页端 RemoteScreenAgent。
 */
const springAuth = require('../../utils/springAuth.js');
const miniPrefs = require('../../utils/miniPreferencesApi.js');

const BASE = '/api/admin/screens';

function parseSpringResult(res) {
  const statusCode = Number(res && res.statusCode);
  let body = res ? res.data : null;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false, message: body || '响应解析失败' };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限访问' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || '请求失败(' + (statusCode || 0) + ')' };
  }
  return { ok: true, data: body.data };
}

async function call(url, method, data) {
  const res = await springAuth.springRequest({ url: BASE + url, method: method || 'GET', data: data || {} });
  const p = parseSpringResult(res);
  if (!p.ok) throw new Error(p.message || '请求失败');
  return p.data;
}

/** 在线屏幕：{screenId, label, route, title, ip, lastSeenAt} */
async function list() {
  const d = await call('', 'GET');
  return Array.isArray(d) ? d : [];
}

/** 让指定屏幕跳到某个路由（只接受站内绝对路径）。
 *  `code` 传配对码时，可以操作**不属于本账号**的展示页。 */
function navigate(screenId, route, code) {
  return call('/' + encodeURIComponent(screenId) + '/navigate', 'POST', {
    route: route,
    code: code || null,
  });
}

/** 用页面角落显示的配对码找到那台页面（跨账号/跨设备都能连） */
function pair(code) {
  return call('/pair', 'POST', { code: code });
}

/** 给屏幕起名（小程序里辨认哪一台） */
function rename(screenId, label) {
  return call('/' + encodeURIComponent(screenId) + '/label', 'PUT', { label: label });
}

// ---------------------------------------------------------------- 可跳转的页面
//
// **读后端持久化的导航配置**（就是 nav-manager 里改名称/顺序后存的那份），
// 不是小程序里写死的一张表 —— 后台改名后这里立刻跟着变。

function flattenNav(nodes, out) {
  (nodes || []).forEach(function (n) {
    if (n && n.type === 'ITEM' && n.itemPath && n.visible !== false) {
      out.push({ label: n.title, value: '/console' + n.itemPath });
    }
    if (n && n.children && n.children.length) flattenNav(n.children, out);
  });
}

async function fetchNavRoutes() {
  const res = await springAuth.springRequest({
    url: '/api/admin-nav/config?scope=ADMIN',
    method: 'GET',
    data: {},
  });
  const p = parseSpringResult(res);
  if (!p.ok) throw new Error(p.message || '读取页面清单失败');
  const out = [];
  flattenNav(p.data || [], out);
  // 去重（同名路径只留一条）
  const seen = {};
  return out.filter(function (r) {
    if (seen[r.value]) return false;
    seen[r.value] = 1;
    return true;
  });
}

// ---------------------------------------------------------------- 收藏（远程切换专用）
//
// 存在 mini-preferences 的 **remoteRouteStars** 里 —— 按路由记，与侧栏「收藏」分开：
// 侧栏收藏是「我自己常用的入口」，这里的收藏是「讲解时要切给大屏看的页面」。
// 后端会合并缺省字段，所以只提交这一个字段，不会把主题等别的配置冲掉。

/** /console/admin/x → /admin/x（收藏里存的是去掉 /console 的形式） */
function normalizeRoute(value) {
  return String(value || '')
    .replace(/^\/console/, '')
    .replace(/[?#].*$/, '');
}

async function fetchStarredRoutes() {
  try {
    const p = await miniPrefs.fetchMiniPreferences();
    return Array.isArray(p && p.remoteRouteStars) ? p.remoteRouteStars : [];
  } catch (e) {
    return [];
  }
}

/**
 * 切换某一条收藏（加/移），返回切换后的完整列表。
 * **按单个路由提交**，不传整份列表 —— 两端/多标签同时改时不会互相覆盖。
 */
async function toggleStarRoute(path) {
  const res = await springAuth.springRequest({
    url: '/api/me/mini-preferences/remote-route-stars/toggle',
    method: 'POST',
    data: { path: path },
  });
  const p = parseSpringResult(res);
  if (!p.ok) throw new Error(p.message || '保存收藏失败');
  return Array.isArray(p.data) ? p.data : [];
}

module.exports = {
  list: list,
  navigate: navigate,
  rename: rename,
  pair: pair,
  fetchNavRoutes: fetchNavRoutes,
  normalizeRoute: normalizeRoute,
  fetchStarredRoutes: fetchStarredRoutes,
  toggleStarRoute: toggleStarRoute,
};
