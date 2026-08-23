var springAuth = require('../../../utils/springAuth.js');
var envConfig = require('../../../utils/envConfig.js');
var pagePermission = require('../../../utils/pagePermission.js');
var { hasMinRole, isStudentAccount } = require('../../../utils/roleAccess.js');

function buildEnvActions(currentPresetId) {
  return envConfig.getPresetList().map(function (preset) {
    var action = {
      id: preset.id,
      name: preset.label,
      subname: preset.hint,
    };
    if (preset.id === currentPresetId) {
      action.color = '#1989fa';
    }
    return action;
  });
}

function getCurrentEnvLabel(presetId) {
  var preset = envConfig.PRESETS[presetId];
  return preset ? preset.label : presetId;
}

Page({
  data: {
    hasToken: false,
    isStudentView: false,
    canAnnouncementAdmin: false,
    canReleaseAdmin: false,
    showEnvSwitcher: false,
    currentEnvLabel: '',
    envVersionLabel: '',
    envSheetVisible: false,
    envActions: [],
  },

  onShow: function () {
    try {
      void pagePermission.refreshMiniPermissions();
    } catch (e) {
      /* ignore */
    }
    var tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
    if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();
    var role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    var token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    var studentView = isStudentAccount();
    var presetId = envConfig.getEffectivePresetId();
    var envVersion = envConfig.getEnvVersion();
    this.setData({
      hasToken: Boolean(token),
      isStudentView: studentView,
      // 管理员功能仅按角色判定（统一权限体系）
      canAnnouncementAdmin:
        hasMinRole(role, 'ADMIN') &&
        pagePermission.canShowMiniEntry('settings', '/package-feature/pages/announcementAdmin/index', role, 'ADMIN'),
      canReleaseAdmin:
        hasMinRole(role, 'PLATFORM_OWNER') &&
        pagePermission.canShowMiniEntry('settings', '/package-feature/pages/releaseNotesAdmin/index', role, 'PLATFORM_OWNER'),
      showEnvSwitcher: envConfig.canShowEnvSwitcher(role),
      currentEnvLabel: getCurrentEnvLabel(presetId),
      envVersionLabel: envVersion,
      envActions: buildEnvActions(presetId),
    });
  },

  openEnvSheet: function () {
    var presetId = envConfig.getEffectivePresetId();
    this.setData({
      envSheetVisible: true,
      envActions: buildEnvActions(presetId),
    });
  },

  closeEnvSheet: function () {
    this.setData({ envSheetVisible: false });
  },

  onEnvSelect: function (event) {
    var item = event.detail || {};
    var nextId = item.id;
    if (!nextId) return;
    var currentId = envConfig.getEffectivePresetId();
    this.setData({ envSheetVisible: false });
    if (nextId === currentId) return;

    try {
      envConfig.setEnvOverride(nextId);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '切换失败', icon: 'none' });
      return;
    }
    springAuth.clearSpringSession();
    wx.showModal({
      title: '环境已切换',
      content:
        '已切换到「' +
        getCurrentEnvLabel(nextId) +
        '」。请完全关闭小程序（从多任务划掉）后重新打开，以确保云环境与登录态生效。',
      showCancel: false,
      confirmText: '知道了',
    });
  },

  goNotifySettings: function () {
    if (!wx.getStorageSync(springAuth.KEYS.TOKEN)) {
      wx.showToast({ title: '请先绑定校内账号', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/notifySettings/index' });
  },

  goRoomWatch: function () {
    if (!wx.getStorageSync(springAuth.KEYS.TOKEN)) {
      wx.showToast({ title: '请先绑定校内账号', icon: 'none' });
      return;
    }
    var role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.canAccessMiniPage('/package-feature/pages/settingsRoomWatch/index', role, 'STUDENT')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/settingsRoomWatch/index' });
  },

  goAnnouncementAdmin: function () {
    wx.navigateTo({ url: '/package-feature/pages/announcementAdmin/index' });
  },

  goReleaseNotesAdmin: function () {
    wx.navigateTo({ url: '/package-feature/pages/releaseNotesAdmin/index' });
  },
});
