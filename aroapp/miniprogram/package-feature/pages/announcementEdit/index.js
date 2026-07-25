const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const { htmlToMd } = require('../../utils/markdown.js');

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

function parseFieldValue(raw) {
  if (raw != null && typeof raw === 'object' && raw.value != null) return String(raw.value);
  return raw != null ? String(raw) : '';
}

function stripHtmlText(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapAdminRow(row) {
  const enabled = row.enabled !== 0;
  return Object.assign({}, row, {
    enabledFlag: enabled,
    statusText: enabled ? '已上线' : '已下线',
    statusTone: enabled ? 'on' : 'off',
  });
}

const EMPTY_FORM = {
  title: '',
  summary: '',
  bodyHtml: '',
  bodyMd: '',
  enabled: true,
  sortOrderStr: '0',
};

Page({
  data: {
    loading: false,
    errorMessage: '',
    submitting: false,
    editingId: '',
    submitBtnText: '发布公告',
    form: Object.assign({}, EMPTY_FORM),
  },

  onLoad: function (options) {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'ADMIN')) {
      wx.showToast({ title: '仅管理员及以上', icon: 'none' });
      setTimeout(function () { wx.navigateBack({ delta: 1 }); }, 300);
      return;
    }
    const id = options && options.id ? String(options.id).trim() : '';
    wx.setNavigationBarTitle({ title: id ? '编辑公告' : '新建公告' });
    if (id) {
      this.setData({ editingId: id, submitBtnText: '保存修改' });
      this.loadExisting(id);
    }
  },

  loadExisting: function (id) {
    const self = this;
    self.setData({ loading: true, errorMessage: '' });
    springAuth.springRequest({
      url: '/api/admin/mp-announcements/' + encodeURIComponent(id),
      method: 'GET',
      data: {},
    }).then(function (res) {
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message || '加载失败');
      const row = p.body && p.body.data;
      if (!row) throw new Error('公告不存在');
      const bodyHtml = row.bodyHtml || '';
      self.setData({
        form: {
          title: row.title || '',
          summary: row.summary || '',
          bodyHtml: bodyHtml,
          bodyMd: htmlToMd(bodyHtml),
          enabled: row.enabled !== 0,
          sortOrderStr: String(row.sortOrder != null ? row.sortOrder : 0),
        },
      });
    }).catch(function (e) {
      const msg = (e && e.message) || '加载失败';
      self.setData({ errorMessage: msg });
      wx.showToast({ title: msg, icon: 'none' });
    }).finally(function () {
      self.setData({ loading: false });
    });
  },

  retryLoad: function () {
    const id = this.data.editingId;
    if (id) {
      this.loadExisting(id);
    } else {
      wx.navigateBack({ delta: 1 });
    }
  },

  onFv: function (e) {
    const k = e.currentTarget.dataset.k;
    const v = parseFieldValue(e.detail);
    this.setData({ ['form.' + k]: v });
  },

  onRichBodyChange: function (e) {
    const html = (e.detail && e.detail.value) || '';
    const md = (e.detail && e.detail.md) || '';
    this.setData({ 'form.bodyHtml': html, 'form.bodyMd': md });
  },

  onEnabledSwitch: function (e) {
    const enabled = !!e.detail;
    this.setData({
      'form.enabled': enabled,
      submitBtnText: this.data.editingId ? '保存修改' : (enabled ? '发布公告' : '保存草稿'),
    });
  },

  onCancel: function () {
    if (this.data.submitting) return;
    wx.navigateBack({ delta: 1 });
  },

  validateForm: function () {
    const f = this.data.form || {};
    const title = String(f.title || '').trim();
    if (!title) {
      wx.showToast({ title: '请填写标题', icon: 'none' });
      return null;
    }
    const bodyText = String(f.bodyMd || '').trim() || stripHtmlText(f.bodyHtml);
    if (!bodyText) {
      wx.showToast({ title: '请填写公告正文', icon: 'none' });
      return null;
    }
    const sortN = parseInt(String(f.sortOrderStr || '0'), 10);
    return {
      title: title,
      summary: String(f.summary || '').trim(),
      bodyHtml: String(f.bodyHtml || ''),
      enabled: f.enabled ? 1 : 0,
      sortOrder: Number.isFinite(sortN) ? sortN : 0,
    };
  },

  mergeIntoParentList: function (saved, deletedId) {
    const pages = getCurrentPages();
    const prev = pages.length >= 2 ? pages[pages.length - 2] : null;
    if (!prev || !prev.data || !Array.isArray(prev.data.rows) || typeof prev.setData !== 'function') return;
    if (deletedId) {
      const rid = String(deletedId);
      prev.setData({ rows: prev.data.rows.filter(function (x) { return String(x.id) !== rid; }) });
      return;
    }
    if (!saved || saved.id == null) return;
    const rows = prev.data.rows.slice();
    const sid = String(saved.id);
    const idx = rows.findIndex(function (x) { return String(x.id) === sid; });
    const mapped = mapAdminRow(saved);
    if (idx >= 0) rows[idx] = mapped;
    else rows.unshift(mapped);
    prev.setData({ rows: rows });
  },

  submitForm: function () {
    const self = this;
    if (self.data.submitting) return;
    const payload = self.validateForm();
    if (!payload) return;
    self.setData({ submitting: true });
    const id = self.data.editingId;
    const url = id
      ? '/api/admin/mp-announcements/' + encodeURIComponent(id)
      : '/api/admin/mp-announcements';
    const method = id ? 'PUT' : 'POST';
    springAuth.springRequest({ url: url, method: method, data: payload }).then(function (res) {
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message || '保存失败');
      wx.showToast({ title: '已保存', icon: 'success' });
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      self.mergeIntoParentList(p.body && p.body.data);
      setTimeout(function () { wx.navigateBack({ delta: 1 }); }, 600);
    }).catch(function (e) {
      wx.showToast({ title: (e && e.message) || '失败', icon: 'none' });
    }).finally(function () {
      self.setData({ submitting: false });
    });
  },

  confirmDelete: function () {
    const self = this;
    const id = self.data.editingId;
    if (!id) return;
    wx.showModal({
      title: '删除确认',
      content: '确定删除该公告？删除后首页将不再展示。',
      success: function (r) {
        if (!r.confirm) return;
        self.setData({ submitting: true });
        springAuth.springRequest({
          url: '/api/admin/mp-announcements/' + encodeURIComponent(id),
          method: 'DELETE',
          data: {},
        }).then(function (res) {
          const p = parseResponse(res);
          if (!p.ok) throw new Error(p.message || '删除失败');
          wx.showToast({ title: '已删除', icon: 'success' });
          self.mergeIntoParentList(null, id);
          setTimeout(function () { wx.navigateBack({ delta: 1 }); }, 600);
        }).catch(function (e) {
          wx.showToast({ title: (e && e.message) || '失败', icon: 'none' });
        }).finally(function () {
          self.setData({ submitting: false });
        });
      },
    });
  },
});
