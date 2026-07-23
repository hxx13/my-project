const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');

function parseResponse(res) {
  const { statusCode, data } = res;
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || `请求失败(${statusCode})` };
  }
  return { ok: true, body };
}

Page({
  data: {
    versionPopupShow: false,
    releases: [],
    releasesLoading: false,
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.canAccessMiniPage('/package-feature/pages/about/index', role, 'STUDENT')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 300);
      return;
    }
  },

  async openVersionHistory() {
    if (!wx.getStorageSync(springAuth.KEYS.TOKEN)) {
      wx.showToast({ title: '请先绑定校内账号', icon: 'none' });
      return;
    }
    this.setData({ versionPopupShow: true, releasesLoading: true, releases: [] });
    try {
      const res = await springAuth.springRequest({
        url: '/api/mp/releases',
        method: 'GET',
        data: {},
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message || '加载失败');
      const list = Array.isArray(p.body.data) ? p.body.data : [];
      this.setData({ releases: list });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
      this.setData({ versionPopupShow: false });
    } finally {
      this.setData({ releasesLoading: false });
    }
  },

  closeVersionHistory() {
    this.setData({ versionPopupShow: false });
  },

});
