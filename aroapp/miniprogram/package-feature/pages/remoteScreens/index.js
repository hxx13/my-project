/**
 * 远程屏幕：用手机指挥某一台正在展示本网站的电脑切到指定页面。
 *
 * 「精准指定哪一台」靠两样东西（与网页端 RemoteScreenAgent 对应）：
 *   - 每个浏览器标签页自己的编号（不依赖 IP、不依赖页面标题）
 *   - 人起的名字（第一次在下面点「改名」起一个，比如「电视墙旁那台」）
 */
const api = require('../../utils/remoteScreenApi.js');
const pagePermission = require('../../../utils/pagePermission.js');
const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');

const PAGE_PATH = '/package-feature/pages/remoteScreens/index';
const FALLBACK_ROLE = 'ADMIN';

/** 常用页面。自定义路径也能直接填 */
const ROUTES = [
  { label: '驾驶舱', value: '/console/dashboard' },
  { label: '电视墙', value: '/console/admin/video-wall' },
  { label: '网络广播', value: '/console/admin/broadcast' },
  { label: '笼架', value: '/console/admin/cage-shelves' },
  { label: '动物订购', value: '/console/admin/animal-order' },
  { label: 'AUP', value: '/console/admin/aup' },
  { label: '人员', value: '/console/admin/personnel' },
  { label: 'ARO 绑定', value: '/console/admin/aro-binding' },
  { label: '门禁控制', value: '/console/admin/door-control' },
  { label: '通行规则', value: '/console/admin/access-rules' },
  { label: 'AGV 轨迹', value: '/console/admin/agv-tracker' },
  { label: '统计分析', value: '/console/admin/analytics' },
  { label: '物资库存', value: '/console/admin/inventory' },
  { label: '合同打印', value: '/console/admin/card-print' },
];

function hhmmss(iso) {
  if (!iso) return '—';
  const m = String(iso).match(/T(\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : '—';
}

Page({
  data: {
    loading: true,
    /** 下拉刷新的转圈状态：scroll-view 的 refresher 必须靠这个字段收回 */
    refreshing: false,
    error: '',
    screens: [],
    routes: ROUTES,
    sheetOpen: false,
    target: null,
    targetName: '',
    custom: '',
    sending: false,
    /** 配对码输入 */
    pairCode: '',
    pairing: false,
    /** 已配对的页面（可跨账号/跨设备） */
    paired: null,
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, FALLBACK_ROLE)) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(function () {
        wx.navigateBack({ delta: 1 });
      }, 300);
      return;
    }
    if (!pagePermission.guardPageOnShow(this, PAGE_PATH, role, FALLBACK_ROLE)) {
      return;
    }
    this.load();
  },

  /**
   * 下拉刷新。
   *
   * <p>**必须用 refresher-triggered 收**：`wx.stopPullDownRefresh` 只管页面级下拉
   * （json 里的 enablePullDownRefresh），对 scroll-view 自带的 refresher 无效 ——
   * 只调它的话转圈会一直挂着，看着就是「卡住不动」。
   */
  onPullDownRefresh() {
    const self = this;
    this.setData({ refreshing: true });
    this.load().finally(function () {
      self.setData({ refreshing: false });
    });
  },

  onRefresh() {
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const rows = await api.list();
      const screens = rows.map(function (s) {
        return {
          screenId: s.screenId,
          code: s.code || '',
          label: s.label || '',
          name: s.label || '未命名屏幕',
          route: s.route || '—',
          title: s.title || '',
          ip: s.ip || '—',
          lastSeen: hhmmss(s.lastSeenAt),
        };
      });
      this.setData({ screens: screens, loading: false });
      // 已配对的那台可能不在本账号列表里，单独刷新一次
      this.refreshPaired();
    } catch (e) {
      this.setData({ loading: false, error: e.message || '读取失败' });
    }
  },

  // ------------------------------------------------------------ 配对码
  //
  // 页面角落显示 6 位配对码。凭码可以控制**其他账号/其他设备**打开的页面 ——
  // 展厅那台常常是别的账号登着，同账号列表里根本看不到。

  onPairInput(e) {
    this.setData({ pairCode: String(e.detail.value || '').toUpperCase() });
  },

  async onPair() {
    const code = String(this.data.pairCode || '').trim();
    if (!code || this.data.pairing) {
      if (!code) wx.showToast({ title: '请输入页面上的配对码', icon: 'none' });
      return;
    }
    this.setData({ pairing: true });
    try {
      const s = await api.pair(code);
      this.setData({
        paired: {
          screenId: s.screenId,
          code: s.code || code,
          name: s.label || '未命名屏幕',
          route: s.route || '—',
        },
        pairing: false,
      });
      wx.showToast({ title: '已连上', icon: 'none' });
    } catch (e) {
      this.setData({ pairing: false });
      wx.showToast({ title: e.message || '配对失败', icon: 'none' });
    }
  },

  async refreshPaired() {
    const p = this.data.paired;
    if (!p) return;
    try {
      const s = await api.pair(p.code);
      this.setData({
        paired: Object.assign({}, p, {
          name: s.label || '未命名屏幕',
          route: s.route || '—',
        }),
      });
    } catch (e) {
      // 那台离线了：保留卡片，切页面时会给出明确提示
      this.setData({ paired: Object.assign({}, p, { route: '已离线' }) });
    }
  },

  onTapPaired() {
    const p = this.data.paired;
    if (!p) return;
    this.setData({ sheetOpen: true, target: p, targetName: p.name, custom: '' });
  },

  onUnpair() {
    this.setData({ paired: null, pairCode: '' });
  },

  // ------------------------------------------------------------ 切页面

  onTapScreen(e) {
    const id = e.currentTarget.dataset.id;
    const s = (this.data.screens || []).find(function (x) {
      return x.screenId === id;
    });
    if (!s) return;
    this.setData({ sheetOpen: true, target: s, targetName: s.name, custom: '' });
  },

  onCloseSheet() {
    this.setData({ sheetOpen: false, target: null, sending: false });
  },

  async onPickRoute(e) {
    const route = e.currentTarget.dataset.route;
    await this.sendTo(route);
  },

  onCustomInput(e) {
    this.setData({ custom: e.detail.value });
  },

  async onCustomGo() {
    const v = String(this.data.custom || '').trim();
    if (!v) {
      wx.showToast({ title: '请输入以 / 开头的路径', icon: 'none' });
      return;
    }
    if (v.indexOf('/') !== 0) {
      wx.showToast({ title: '路径要以 / 开头', icon: 'none' });
      return;
    }
    await this.sendTo(v);
  },

  async sendTo(route) {
    const t = this.data.target;
    if (!t || this.data.sending) return;
    this.setData({ sending: true });
    try {
      await api.navigate(t.screenId, route, t.code);
      wx.showToast({ title: '已让「' + t.name + '」切过去', icon: 'none' });
      this.setData({ sheetOpen: false, target: null, sending: false });
      // 对方切页后会上报新路由，稍等再刷新
      const self = this;
      setTimeout(function () {
        self.load();
      }, 1500);
    } catch (e) {
      this.setData({ sending: false });
      wx.showToast({ title: e.message || '下发失败', icon: 'none' });
    }
  },

  // ------------------------------------------------------------ 改名

  onRenameScreen(e) {
    const id = e.currentTarget.dataset.id;
    const s = (this.data.screens || []).find(function (x) {
      return x.screenId === id;
    });
    if (!s) return;
    const self = this;
    wx.showModal({
      title: '给这台屏幕起个名',
      editable: true,
      content: s.label || '',
      placeholderText: '如：电视墙旁那台',
      success: async function (r) {
        const name = String(r.content || '').trim();
        if (!r.confirm || !name) return;
        try {
          await api.rename(id, name);
          wx.showToast({ title: '已改名', icon: 'none' });
          self.load();
        } catch (err) {
          wx.showToast({ title: err.message || '改名失败', icon: 'none' });
        }
      },
    });
  },
});
