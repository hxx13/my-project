const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');

function parseResponse(res) {
  const statusCode = res.statusCode;
  const data = res.data;
  let body = data;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = { success: false }; }
  }
  if (statusCode === 401 || statusCode === 403) return { ok: false, message: (body && body.message) || '无权限' };
  if (!body || body.success !== true) return { ok: false, message: (body && body.message) || '请求失败(' + statusCode + ')' };
  return { ok: true, body: body };
}

function mapRow(row) {
  const enabled = row.enabled !== 0;
  return Object.assign({}, row, {
    enabledFlag: enabled,
    statusText: enabled ? '已上线' : '已下线',
    statusTone: enabled ? 'on' : 'off',
  });
}

Page({
  _loadedOnce: false,

  data: {
    loading: false,
    rows: [],
  },

  onLoad: function () {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'ADMIN')) {
      wx.showToast({ title: '仅管理员及以上', icon: 'none' });
      setTimeout(function () { wx.navigateBack({ delta: 1 }); }, 300);
      return;
    }
    this.reload();
  },

  onShow: function () {
    // 从编辑页返回时由编辑页就地合并 rows，禁止整表 reload — post-save-no-full-refresh.mdc
    if (!this._loadedOnce) return;
  },

  onPullDownRefresh: function () {
    this.reload().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  reload: function () {
    const self = this;
    self.setData({ loading: true });
    return springAuth.springRequest({
      url: '/api/admin/mp-announcements',
      method: 'GET',
      data: {},
    }).then(function (res) {
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message || '加载失败');
      const list = Array.isArray(p.body.data) ? p.body.data : [];
      self.setData({ rows: list.map(mapRow) });
      self._loadedOnce = true;
    }).catch(function (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }).finally(function () {
      self.setData({ loading: false });
    });
  },

  openCreate: function () {
    wx.navigateTo({ url: '/package-feature/pages/announcementEdit/index' });
  },

  openEdit: function (e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/package-feature/pages/announcementEdit/index?id=' + encodeURIComponent(id) });
  },
});
