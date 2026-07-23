const springAuth = require('../../../utils/springAuth.js');
const { fetchMiniPreferences, saveMiniPreferences } = require('../../../utils/miniPreferencesApi.js');
const { buildCampusFloorTree } = require('../../../utils/roomDashboard.js');
const { parseTwinOverview } = require('../../../utils/roomPresenceDot.js');

function buildBlocksFromTree(campusTree) {
  const fixed = ['浦东', '浦西'];
  const others = (campusTree || []).map((x) => x.campus).filter((c) => fixed.indexOf(c) < 0);
  const order = fixed.concat(others);
  return order.map((campus) => {
    const node = (campusTree || []).find((n) => n.campus === campus) || { floors: [] };
    const floors = (node.floors || []).map((f) => ({
      floor: f.floor,
      checked: false,
    }));
    return { campus, wholeCampus: false, floors };
  });
}

function applySelections(blocks, selections) {
  const by = {};
  (selections || []).forEach((s) => {
    if (!s) return;
    const c = String(s.campus || '').trim();
    if (!c) return;
    if (!by[c]) by[c] = { whole: false, floors: new Set() };
    const f = String(s.floor || '').trim();
    if (!f) by[c].whole = true;
    else by[c].floors.add(f);
  });
  return blocks.map((b) => {
    const x = by[b.campus];
    if (!x) {
      return {
        ...b,
        wholeCampus: false,
        floors: b.floors.map((fl) => ({ ...fl, checked: false })),
      };
    }
    if (x.whole) {
      return {
        ...b,
        wholeCampus: true,
        floors: b.floors.map((fl) => ({ ...fl, checked: false })),
      };
    }
    return {
      ...b,
      wholeCampus: false,
      floors: b.floors.map((fl) => ({ ...fl, checked: x.floors.has(fl.floor) })),
    };
  });
}

function selectionsFromBlocks(blocks) {
  const out = [];
  (blocks || []).forEach((b) => {
    if (b.wholeCampus) {
      out.push({ campus: b.campus, floor: '' });
      return;
    }
    b.floors.forEach((fl) => {
      if (fl.checked) out.push({ campus: b.campus, floor: fl.floor });
    });
  });
  return out;
}

Page({
  data: {
    campusBlocks: [],
    loading: true,
    saving: false,
  },

  onShow() {
    const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
    if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();
  },

  onLoad() {
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN);
    if (!token) {
      wx.showToast({ title: '请先绑定校内账号', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    void this.reload();
  },

  async reload() {
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN);
    if (!token) {
      this.setData({ loading: false, campusBlocks: [] });
      return;
    }
    this.setData({ loading: true });
    try {
      const [prefs, overviewRes] = await Promise.all([
        fetchMiniPreferences(),
        springAuth.springRequest({
          url: '/api/v1/twin/dashboard/wechat-overview',
          method: 'GET',
          data: {},
        }),
      ]);
      const ov = parseTwinOverview(overviewRes);
      if (!ov.ok) {
        let msg = '房间数据加载失败';
        try {
          const b = overviewRes && overviewRes.data;
          const body = typeof b === 'string' ? JSON.parse(b) : b;
          if (body && body.message) msg = String(body.message);
        } catch (e) {
          /* ignore */
        }
        throw new Error(msg);
      }
      const tree = buildCampusFloorTree(ov.rows);
      let blocks = buildBlocksFromTree(tree);
      const sels = (prefs.roomWatch && prefs.roomWatch.selections) || [];
      blocks = applySelections(blocks, sels);
      this.setData({ campusBlocks: blocks, loading: false });
    } catch (e) {
      console.warn('[settingsRoomWatch]', e);
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
      this.setData({ loading: false, campusBlocks: [] });
    }
  },

  onWholeSwitch(e) {
    const campus = e.currentTarget.dataset.campus;
    const value = !!e.detail.value;
    const campusBlocks = this.data.campusBlocks.map((b) => {
      if (b.campus !== campus) return b;
      return {
        ...b,
        wholeCampus: value,
        floors: value ? b.floors.map((fl) => ({ ...fl, checked: false })) : b.floors,
      };
    });
    this.setData({ campusBlocks });
  },

  onFloorSwitch(e) {
    const campus = e.currentTarget.dataset.campus;
    const floor = e.currentTarget.dataset.floor;
    const value = !!e.detail.value;
    const campusBlocks = this.data.campusBlocks.map((b) => {
      if (b.campus !== campus) return b;
      if (b.wholeCampus) return b;
      const floors = b.floors.map((fl) => {
        if (fl.floor !== floor) return fl;
        return { ...fl, checked: value };
      });
      return { ...b, floors };
    });
    this.setData({ campusBlocks });
  },

  async onSave() {
    if (this.data.saving || this.data.loading) return;
    const selections = selectionsFromBlocks(this.data.campusBlocks);
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中', mask: true });
    try {
      await saveMiniPreferences({ roomWatch: { selections } });
      wx.showToast({ title: '已保存', icon: 'success' });
      const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
      if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();
      setTimeout(() => wx.navigateBack(), 450);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ saving: false });
    }
  },
});
