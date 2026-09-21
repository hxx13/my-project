const mpBulletinApi = require('../../../utils/mpBulletinApi.js');
const springAuth = require('../../../utils/springAuth.js');
const studentAlerts = require('../../../utils/studentAlertHelpers.js');
const { applyRichTextTypography } = require('../../../utils/richTextTypography.js');

function withBodyTypography(detail) {
  if (!detail || !detail.bodyHtml) return detail;
  return Object.assign({}, detail, {
    bodyHtml: applyRichTextTypography(detail.bodyHtml),
  });
}

Page({
  data: {
    loading: true,
    detail: null,
    kindLabel: '',
    errorText: '',
  },

  onLoad(query) {
    const id = query.id != null ? String(query.id) : '';
    const kind = query.kind != null ? String(query.kind) : '';
    if (!id || !kind) {
      this.setData({ loading: false, errorText: '参数缺失' });
      return;
    }
    this._id = id;
    this._kind = kind;
    this._generalNotice = kind === 'general_notice';
    this._scanPopupBulletin = studentAlerts.isScanPopupBulletinKind(kind);
    this._studentAlert = studentAlerts.isStudentMobileAlertKind(kind) && !this._scanPopupBulletin;
    this.setData({
      kindLabel: studentAlerts.isImportantReminderKind(kind)
        ? '重要提醒'
        : (kind === 'release' ? '版本' : studentAlerts.kindLabel(kind)),
    });
    this.load();
  },

  load() {
    if (this._generalNotice) {
      this.loadGeneralNotice();
      return;
    }
    if (this._scanPopupBulletin) {
      this.loadScanPopupBulletin();
      return;
    }
    if (this._studentAlert) {
      this.loadStudentAlert();
      return;
    }
    this.loadPublicBulletin();
  },

  loadGeneralNotice() {
    var self = this;
    self.setData({ loading: true, errorText: '' });
    springAuth.springRequest({
      url: '/api/public/portal/content/' + encodeURIComponent(self._id),
      method: 'GET',
      data: {},
    }).then(function (res) {
      var body = res && res.data;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = null; }
      }
      if (!body || body.success !== true || !body.data) {
        throw new Error((body && body.message) || '加载失败');
      }
      var v = body.data;
      self.setData({
        detail: withBodyTypography({
          title: v.title || '',
          bodyHtml: v.contentHtml || '',
          publishedAtText: studentAlerts.formatTime(v.publishedAt || v.createdAt || ''),
        }),
        loading: false,
      });
      if (v.title) {
        wx.setNavigationBarTitle({ title: String(v.title).slice(0, 18) });
      }
    }).catch(function (e) {
      self.setData({
        loading: false,
        detail: null,
        errorText: (e && e.message) || '加载失败',
      });
    });
  },

  loadScanPopupBulletin() {
    var self = this;
    self.setData({ loading: true, errorText: '' });
    studentAlerts.fetchScanPopupBulletinDetail(self._id, self._kind).then(function (item) {
      var time = studentAlerts.formatTime(item.publishAt || item.createdAt || '');
      self.setData({
        detail: withBodyTypography({
          title: item.title || '',
          bodyHtml: item.contentHtml || '',
          publishedAtText: time,
        }),
        kindLabel: studentAlerts.kindLabel(item.kind),
        loading: false,
      });
      if (item.title) {
        wx.setNavigationBarTitle({ title: String(item.title).slice(0, 18) });
      }
    }).catch(function (e) {
      self.setData({
        loading: false,
        detail: null,
        errorText: (e && e.message) || '加载失败',
      });
    });
  },

  loadStudentAlert() {
    var self = this;
    self.setData({ loading: true, errorText: '' });
    studentAlerts.fetchStudentAlertDetail(self._id, self._kind).then(function (item) {
      var time = studentAlerts.formatTime(item.publishAt || item.createdAt || '');
      var bodyHtml = studentAlerts.prepareAlertBodyHtml(item);
      var decorated = studentAlerts.decoratePersonalAlertItem(item);
      var title = decorated.title || item.title || '';
      self.setData({
        detail: withBodyTypography({
          title: title,
          bodyHtml: bodyHtml,
          publishedAtText: time,
        }),
        kindLabel: studentAlerts.isImportantReminderKind(item.kind)
          ? '重要提醒'
          : studentAlerts.kindLabel(item.kind),
        loading: false,
      });
      if (title) {
        wx.setNavigationBarTitle({ title: String(title).slice(0, 18) });
      }
    }).catch(function (e) {
      self.setData({
        loading: false,
        detail: null,
        errorText: (e && e.message) || '加载失败',
      });
    });
  },

  async loadPublicBulletin() {
    this.setData({ loading: true, errorText: '' });
    try {
      const d = await mpBulletinApi.fetchBulletinDetail(this._id, this._kind);
      this.setData({ detail: withBodyTypography(d), loading: false });
      if (d && d.title) {
        wx.setNavigationBarTitle({ title: String(d.title).slice(0, 18) });
      }
    } catch (e) {
      this.setData({
        loading: false,
        detail: null,
        errorText: (e && e.message) || '加载失败',
      });
    }
  },
});
