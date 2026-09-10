/**
 * 当前登录用户的身份标签（person_identity_tag.code）。
 * 与 Web 端 frontend/src/api/domains/personIdentity.api.ts 的 fetchMyIdentity 同源，
 * 打 GET /api/person-identity/me，响应 { userId, scope, tags:[{ code, ... }] }。
 *
 * 为什么小程序要这个：Web 端的笼位表单编辑权是
 * 「客户端角色≥ADMIN ‖ 身份含 BREEDING_GROUP_LEADER ‖ 服务端按笼位判定」三者取或
 * （见 LocalDetailPanel.tsx 与 CageFormFill.tsx 的 canEdit）。小程序原先只有最后一项，
 * 于是同一个账号在 Web 能编、在小程序不能。本模块补上前两项里的身份那一项。
 *
 * 结果按「账号 + token」指纹缓存：一次会话内身份标签不变，而每次打开弹窗都要判定，
 * 不缓存会把接口打成轮询。换号或重新登录后指纹变化，缓存自动作废。
 */
const springAuth = require('./springAuth.js');

/** 与后端 CageModeVisibilityService.CODE_LEADER 同一个码，改一处必须同步改那边 */
const CODE_BREEDING_GROUP_LEADER = 'BREEDING_GROUP_LEADER';

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
    return { ok: false, message: (body && body.message) || `请求失败(${statusCode || 0})` };
  }
  return { ok: true, data: body.data };
}

let _cache = null;    // { key, codes: { CODE: true } }
let _inflight = null; // { key, promise }

function storageKey() {
  let id = '';
  try {
    const raw = wx.getStorageSync(springAuth.KEYS.USER_INFO);
    const ui = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    id = (ui && (ui.id || ui.userId || ui.username)) || '';
  } catch (e) {
    id = '';
  }
  return id + '|' + (wx.getStorageSync(springAuth.KEYS.TOKEN) || '');
}

/** 退出登录 / 换号时调用，避免把上一个账号的身份留在内存里 */
function clearIdentityCache() {
  _cache = null;
  _inflight = null;
}

/**
 * 拉当前用户的身份码集合，形如 { BREEDING_GROUP_LEADER: true }。
 * 失败一律按空集返回 —— 判定退化成「只认服务端」，不会因为一次网络抖动误放行。
 */
function fetchMyIdentityCodes() {
  const key = storageKey();
  if (_cache && _cache.key === key) return Promise.resolve(_cache.codes);
  if (_inflight && _inflight.key === key) return _inflight.promise;

  const promise = springAuth
    .springRequest({ url: '/api/person-identity/me', method: 'GET', data: {} })
    .then((res) => {
      const up = parseSpringResult(res);
      const codes = {};
      const tags = (up.ok && up.data && up.data.tags) || [];
      tags.forEach((t) => {
        if (t && t.code) codes[t.code] = true;
      });
      _cache = { key, codes };
      _inflight = null;
      return codes;
    })
    .catch(() => {
      _inflight = null;
      return {};
    });

  _inflight = { key, promise };
  return promise;
}

module.exports = {
  CODE_BREEDING_GROUP_LEADER,
  fetchMyIdentityCodes,
  clearIdentityCache,
};
