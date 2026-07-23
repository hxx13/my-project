/**
 * 小程序个人配置（持久化在绑定账号 sys_user.mini_preferences_json）
 */
const springAuth = require('./springAuth.js');

function defaultPrefs() {
  return { roomWatch: { selections: [] } };
}

function parseResult(res) {
  const { statusCode, data } = res;
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false };
    }
  }
  if (statusCode === 401 || statusCode === 403) return { ok: false };
  if (!body || typeof body !== 'object') return { ok: false };
  const okSuccess = body.success === true || body.success === 'true';
  const okCode = Number(body.code) === 200 && body.data != null && typeof body.data === 'object';
  if (!okSuccess && !okCode) return { ok: false };
  return { ok: true, body };
}

async function fetchMiniPreferences() {
  const token = wx.getStorageSync(springAuth.KEYS.TOKEN);
  if (!token) return defaultPrefs();
  try {
    const res = await springAuth.springRequest({
      url: '/api/me/mini-preferences',
      method: 'GET',
      data: {},
    });
    const p = parseResult(res);
    if (!p.ok || !p.body.data) return defaultPrefs();
    const d = p.body.data;
    if (!d.roomWatch) d.roomWatch = { selections: [] };
    if (!Array.isArray(d.roomWatch.selections)) d.roomWatch.selections = [];
    return d;
  } catch (e) {
    console.warn('[miniPreferencesApi] fetch', e);
    return defaultPrefs();
  }
}

async function saveMiniPreferences(prefs) {
  const res = await springAuth.springRequest({
    url: '/api/me/mini-preferences',
    method: 'PUT',
    data: prefs || defaultPrefs(),
  });
  const p = parseResult(res);
  if (!p.ok) {
    let msg = '保存失败';
    try {
      const raw = res && res.data;
      const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (body && body.message) msg = String(body.message);
    } catch (e) {
      /* ignore */
    }
    throw new Error(msg);
  }
  return p.body.data || defaultPrefs();
}

module.exports = {
  fetchMiniPreferences,
  saveMiniPreferences,
  defaultPrefs,
};
