var springAuth = require('../../../utils/springAuth.js');
var pagePermission = require('../../../utils/pagePermission.js');
var studentAlerts = require('../../../utils/studentAlertHelpers.js');
var { isStudentAccount } = require('../../../utils/roleAccess.js');

Page({
  data: {
    initialTab: '',
    isStaff: false,
    loading: true,
    error: '',
    notices: [],
    unreadCount: 0,
    markingAll: false,
  },

  onLoad: function (options) {
    this.setData({ initialTab: options && options.tab ? String(options.tab).trim() : '' });
    wx.setNavigationBarTitle({ title: '消息通知' });
  },

  onShow: function () {
    var role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/messages/index', role, 'STUDENT')) return;
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
      var raw = studentAlerts.extractPersonalAlerts(data);
      var notices = raw.map(studentAlerts.decoratePersonalAlertItem);
      self.setData({
        loading: false,
        notices: notices,
        unreadCount: countUnread(notices),
      });
    }).catch(function (err) {
      self.setData({ loading: false, error: (err && err.message) || '网络错误' });
    });
  },

  onMarkAllRead: function () {
    var self = this;
    if (self.data.markingAll) return;
    self.setData({ markingAll: true });
    springAuth.springRequest({ url: '/api/student/mobile/alerts/read-all', method: 'POST', data: {} }).then(function (res) {
      var body = parseBody(res && res.data);
      if (!body || !body.success) {
        throw new Error((body && body.message) || '操作失败');
      }
      var mark = function (arr) { return arr.map(function (n) { n.isRead = true; return n; }); };
      // 保存后仅合并已读状态，禁止整表 load — post-save-no-full-refresh.mdc
      self.setData({ markingAll: false, notices: mark(self.data.notices), unreadCount: 0 });
      wx.showToast({ title: '已全部标记为已读', icon: 'success' });
    }).catch(function (err) {
      self.setData({ markingAll: false });
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    });
  },

  onAlertTap: function (e) {
    studentAlerts.navigateToAlertDetail(e.currentTarget.dataset.id, e.currentTarget.dataset.kind);
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

function parseBody(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  return null;
}

function countUnread(arr) {
  var n = 0;
  for (var i = 0; i < arr.length; i += 1) {
    if (!arr[i].isRead) n += 1;
  }
  return n;
}
