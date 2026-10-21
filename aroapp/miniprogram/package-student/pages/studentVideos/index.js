const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const api = require('../../utils/studentTrainingApi.js');

const PAGE_PATH = '/package-student/pages/studentVideos/index';
const PLAY_PAGE = '/package-student/pages/studentVideoPlay/index';

function fmtDuration(seconds) {
  const n = Number(seconds) || 0;
  if (n <= 0) return '—';
  const m = Math.floor(n / 60);
  const r = n % 60;
  return m + ':' + (r < 10 ? '0' + r : r);
}

function mapRow(v) {
  const percent = Number(v.percent) || 0;
  return {
    id: v.id,
    title: v.title || '未命名视频',
    durationText: fmtDuration(v.durationSeconds),
    percent: percent,
    completed: !!v.completed,
    stateText: v.completed ? '已完成' : percent > 0 ? '已看 ' + percent + '%' : '未观看',
  };
}

Page({
  data: {
    pageGateOk: false,
    loading: false,
    rows: [],
  },

  onLoad() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    if (!token || !pagePermission.canAccessMiniPage(PAGE_PATH, role, 'STUDENT')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      this._accessDenied = true;
      wx.navigateBack({ delta: 1 });
      return;
    }
    this.setData({ pageGateOk: true });
  },

  onShow() {
    if (this._accessDenied || !this.data.pageGateOk) return;
    this.load();
  },

  onPullDownRefresh() {
    Promise.resolve(this.load()).then(
      () => wx.stopPullDownRefresh(),
      () => wx.stopPullDownRefresh(),
    );
  },

  load() {
    this.setData({ loading: true });
    return api
      .fetchMyLearningVideos()
      .then((list) => {
        this.setData({ rows: (list || []).map(mapRow), loading: false });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  onWatchTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: PLAY_PAGE + '?id=' + encodeURIComponent(id) });
  },
});
