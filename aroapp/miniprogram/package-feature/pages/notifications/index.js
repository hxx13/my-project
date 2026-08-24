var springAuth = require('../../../utils/springAuth.js');
var pagePermission = require('../../../utils/pagePermission.js');
var studentAlerts = require('../../../utils/studentAlertHelpers.js');
var { isStudentAccount } = require('../../../utils/roleAccess.js');

Page({
  data: {
    initialTab: '',
    viewMode: 'messages',
    isStaff: false,
    loading: true,
    error: '',
    notices: [],
    bulletins: [],
    pinnedNotices: [],
    unreadCount: 0,
    markingAll: false,
    pageTitle: '消息通知',
    emptyTitle: '暂无消息',
    emptyText: '物资审核、延迟申请、违规提醒等会出现在这里',
  },

  onLoad: function (options) {
    var tab = options && options.tab ? String(options.tab).trim() : '';
    var view = options && options.view ? String(options.view).trim() : '';
    var viewMode = view === 'bulletins' ? 'bulletins' : 'messages';
    this.setData({
      initialTab: tab,
      viewMode: viewMode,
      pageTitle: viewMode === 'bulletins' ? '公告通知' : '消息通知',
      emptyTitle: viewMode === 'bulletins' ? '暂无公告' : '暂无消息',
      emptyText: viewMode === 'bulletins'
        ? '管理员发布的公告会显示在这里'
        : '物资审核、延迟申请、违规提醒等会出现在这里',
    });
    wx.setNavigationBarTitle({ title: viewMode === 'bulletins' ? '公告通知' : '消息通知' });
  },

  onShow: function () {
    var role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/notifications/index', role, 'STUDENT')) return;
    var isStaffView = !isStudentAccount();
    this.setData({ isStaff: isStaffView });
    if (isStaffView) {
      var self = this;
      wx.nextTick(function () {
        var c = self.selectComponent('#staffInbox');
        if (c && c.runWorkInboxShow) void c.runWorkInboxShow();
      });
    } else {
      this.loadStudentData();
    }
  },

  loadStudentData: function () {
    var self = this;
    self.setData({ loading: true, error: '' });
    studentAlerts.fetchStudentAlerts().then(function (data) {
      if (self.data.viewMode === 'bulletins') {
        var bulletins = studentAlerts.extractScanPopupBulletins(data)
          .slice()
          .sort(function (a, b) {
            var ta = a.publishAt || a.createdAt || '';
            var tb = b.publishAt || b.createdAt || '';
            return String(tb).localeCompare(String(ta));
          })
          .map(buildBulletinItem);
        self.setData({
          loading: false,
          bulletins: bulletins,
          notices: [],
          pinnedNotices: [],
          unreadCount: 0,
        });
        return;
      }

      var raw = studentAlerts.extractPersonalAlerts(data);
      var notices = raw.map(studentAlerts.decoratePersonalAlertItem);
      var pinnedNotices = notices.filter(function (n) { return n.isImportantReminder; });
      var regularNotices = notices.filter(function (n) { return !n.isImportantReminder; });
      self.setData({
        loading: false,
        notices: regularNotices,
        pinnedNotices: pinnedNotices,
        bulletins: [],
        unreadCount: countUnread(notices),
      });
    }).catch(function (err) {
      self.setData({ loading: false, error: (err && err.message) || '网络错误' });
    });
  },

  onMarkAllRead: function () {
    var self = this;
    if (self.data.viewMode !== 'messages' || self.data.markingAll) return;
    self.setData({ markingAll: true });
    springAuth.springRequest({ url: '/api/student/mobile/alerts/read-all', method: 'POST', data: {} }).then(function () {
      var mark = function (arr) { return arr.map(function (n) { n.isRead = true; return n; }); };
      // 保存后仅合并已读状态，禁止整表 load — post-save-no-full-refresh.mdc
      self.setData({
        markingAll: false,
        notices: mark(self.data.notices),
        pinnedNotices: mark(self.data.pinnedNotices),
        unreadCount: 0,
      });
      wx.showToast({ title: '已全部标记为已读', icon: 'success' });
    }).catch(function () {
      self.setData({ markingAll: false });
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  onAlertTap: function (e) {
    var id = e.currentTarget.dataset.id;
    var kind = e.currentTarget.dataset.kind;
    if (id && kind) {
      wx.navigateTo({
        url: '/package-feature/pages/homeBulletinDetail/index?id=' + encodeURIComponent(id) + '&kind=' + encodeURIComponent(kind),
      });
    }
  },

  onPullDownRefresh: function () {
    if (this.data.isStaff) {
      var c = this.selectComponent('#staffInbox');
      if (c && c.onPullDownRefresh) c.onPullDownRefresh();
    } else {
      this.loadStudentData();
    }
    wx.stopPullDownRefresh();
  },

  onReachBottom: function () {
    if (this.data.isStaff) {
      var c = this.selectComponent('#staffInbox');
      if (c && c.onReachBottom) c.onReachBottom();
    }
  },
});

function countUnread(arr) {
  var n = 0;
  for (var i = 0; i < arr.length; i += 1) {
    if (!arr[i].isRead) n += 1;
  }
  return n;
}

function buildBulletinItem(item) {
  var decorated = studentAlerts.decorateBulletinListItem(item);
  return {
    id: decorated.id,
    kind: decorated.kind,
    title: decorated.title,
    preview: decorated.subtitle,
    time: studentAlerts.formatTime(item.publishAt || item.createdAt || ''),
    badgeLabel: decorated.badgeLabel,
    badgeBg: decorated.badgeBg,
    badgeColor: decorated.badgeColor,
  };
}
