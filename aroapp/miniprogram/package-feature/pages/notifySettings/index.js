var springAuth = require('../../../utils/springAuth.js');

Page({
  data: {
    settings: [],
    loading: true,
  },

  onShow: function () {
    this.loadSettings();
  },

  loadSettings: function () {
    var that = this;
    that.setData({ loading: true });
    springAuth.springRequest({
      url: '/user/notify-settings',
      method: 'GET',
      success: function (res) {
        var list = (res.data && res.data.data) ? res.data.data : [];
        var active = list.filter(function (s) { return s.sourceEnabled; });
        that.setData({ settings: active, loading: false });
      },
      fail: function () {
        wx.showToast({ title: '加载失败', icon: 'none' });
        that.setData({ loading: false });
      }
    });
  },

  toggleSource: function (e) {
    var that = this;
    var code = e.currentTarget.dataset.code;
    var enabled = e.currentTarget.dataset.enabled;
    springAuth.springRequest({
      url: '/user/notify-settings/' + code,
      method: 'PUT',
      data: { enabled: !enabled },
      success: function () {
        var list = that.data.settings.map(function (s) {
          if (s.sourceCode === code) { s.myEnabled = !enabled; }
          return s;
        });
        that.setData({ settings: list });
      },
      fail: function () {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    });
  },

  toggleChannel: function (e) {
    var that = this;
    var code = e.currentTarget.dataset.code;
    var key = e.currentTarget.dataset.key;
    var muted = e.currentTarget.dataset.muted;
    var body = {};
    body[key] = !muted;
    springAuth.springRequest({
      url: '/user/notify-settings/' + code,
      method: 'PUT',
      data: body,
      success: function () {
        var list = that.data.settings.map(function (s) {
          if (s.sourceCode === code) { s[key] = !muted; }
          return s;
        });
        that.setData({ settings: list });
      },
      fail: function () {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    });
  }
});
