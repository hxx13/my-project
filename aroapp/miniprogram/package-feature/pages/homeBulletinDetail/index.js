const mpBulletinApi = require('../../../utils/mpBulletinApi.js');
const studentAlerts = require('../../../utils/studentAlertHelpers.js');
const { isStudentAccount } = require('../../../utils/roleAccess.js');
const { preparePublishedContentHtml } = require('../../../utils/mpPublishedContentHtml.js');

function withBodyTypography(detail) {
  if (!detail) return detail;
  var html = preparePublishedContentHtml(detail.bodyHtml || detail.contentHtml || '', detail.contentJson);
  return Object.assign({}, detail, { bodyHtml: html });
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
    this._scanPopupBulletin = isStudentAccount() && studentAlerts.isScanPopupBulletinKind(kind);
    this._studentAlert = isStudentAccount()
      && studentAlerts.isStudentMobileAlertKind(kind)
      && !this._scanPopupBulletin;
    this.setData({
      kindLabel: studentAlerts.isImportantReminderKind(kind)
        ? '重要提醒'
        : (kind === 'release' ? '版本' : studentAlerts.kindLabel(kind)),
    });
    this.load();
  },

  load() {
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

  loadScanPopupBulletin() {
    var self = this;
    self.setData({ loading: true, errorText: '' });
    studentAlerts.fetchScanPopupBulletinDetail(self._id, self._kind).then(function (item) {
      var time = studentAlerts.formatTime(item.publishAt || item.createdAt || '');
      self.setData({
        detail: withBodyTypography({
          title: item.title || '',
          bodyHtml: item.contentHtml || '',
          contentJson: item.contentJson || '',
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
          contentJson: item.contentJson || '',
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
