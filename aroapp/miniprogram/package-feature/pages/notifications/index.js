var springAuth = require('../../../utils/springAuth.js');
var pagePermission = require('../../../utils/pagePermission.js');
var studentAlerts = require('../../../utils/studentAlertHelpers.js');

Page({
  data: {
    initialTab: '',
    activeTab: 'notice',
    loading: true,
    error: '',
    generalNotices: [],
    personalNotices: [],
    systemNotices: [],
  },

  onLoad: function (options) {
    var tab = options && options.tab ? String(options.tab).trim() : '';
    // options.view === 'bulletins' 是老入口的兼容参数，公告与系统公告都在本页，无需再分流
    this.setData({ initialTab: tab, activeTab: 'notice' });
    wx.setNavigationBarTitle({ title: '公告' });
  },

  onShow: function () {
    var role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/notifications/index', role, 'STUDENT')) return;
    this.loadStudentData();
    // 打开公告区即标记「已看到」；服务端确认推进游标后再清首页红点，不整表重拉 — post-save-no-full-refresh.mdc
    studentAlerts.markAnnouncementsViewed()
      .then(function () { studentAlerts.clearHomeAnnouncementDot(); })
      .catch(function () {});
  },

  loadStudentData: function () {
    var self = this;
    self.setData({ loading: true, error: '' });
    studentAlerts.fetchStudentAlerts().then(function (data) {
      if (self.data.activeTab === 'system') {
        self.loadSystemNotices();
        return;
      }
      var sections = studentAlerts.splitAnnouncementSections(data);
      self.setData({
        loading: false,
        generalNotices: sections.general.map(buildBulletinItem),
        personalNotices: sections.personal.map(buildBulletinItem),
        systemNotices: [],
      });
    }).catch(function (err) {
      self.setData({ loading: false, error: (err && err.message) || '网络错误' });
    });
  },

  loadSystemNotices: function () {
    var self = this;
    springAuth.springRequest({ url: '/api/mp/releases', method: 'GET', data: {} }).then(function (res) {
      // 真实形态 {success:true, data:[MiniProgramReleaseView]}，res.data 可能是字符串
      var body = res && res.data;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = null; }
      }
      if (!body || body.success !== true) {
        throw new Error((body && body.message) || '加载失败');
      }
      var rows = Array.isArray(body.data) ? body.data : [];
      self.setData({
        loading: false,
        systemNotices: rows.map(function (r) {
          return {
            id: r.id,
            kind: 'release',
            title: r.title || '',
            preview: r.versionCode ? ('版本 ' + r.versionCode) : (r.summary || ''),
            time: studentAlerts.formatTime(r.publishedAtText || ''),
          };
        }),
      });
    }).catch(function (err) {
      self.setData({ loading: false, error: (err && err.message) || '网络错误' });
    });
  },

  onSwitchTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab, error: '' });
    if (tab === 'system' && this.data.systemNotices.length) return;
    if (tab === 'system') {
      this.setData({ loading: true });
      this.loadSystemNotices();
      return;
    }
    this.loadStudentData();
  },

  onAlertTap: function (e) {
    studentAlerts.navigateToAlertDetail(e.currentTarget.dataset.id, e.currentTarget.dataset.kind);
  },

  onPullDownRefresh: function () {
    this.loadStudentData();
    wx.stopPullDownRefresh();
  },

  onReachBottom: function () {},

});

function buildBulletinItem(item) {
  var decorated = studentAlerts.decorateBulletinListItem(item);
  return {
    id: decorated.id,
    kind: decorated.kind,
    title: decorated.title,
    // 表头已展示时间戳（time），副标题不再重复渲染，卡片只留「表头 + 标题」
    preview: '',
    time: studentAlerts.formatTime(item.publishAt || item.createdAt || ''),
    badgeLabel: decorated.badgeLabel,
    badgeBg: decorated.badgeBg,
    badgeColor: decorated.badgeColor,
  };
}
