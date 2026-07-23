const springAuth = require('../utils/springAuth.js');
const { buildTabList, activeIndexForRoute } = require('../utils/tabBarHelper.js');
const { aggregateTabBarPending } = require('../utils/pendingBadgeCounts.js');
const { refreshPendingBadges, peekPendingBadges } = require('../utils/badgeSnapshotStore.js');
const { fetchMiniPreferences } = require('../utils/miniPreferencesApi.js');
const { parseTwinOverview, roomWatchHasPresence } = require('../utils/roomPresenceDot.js');

const ROOM_PATH = '/pages/room/index';
const DOT_PENDING_PATHS = ['/pages/index/index', '/pages/mine/index'];

Component({
  data: {
    active: 0,
    tabList: buildTabList(),
  },

  lifetimes: {
    attached() {
      this.refreshTabs();
    },
  },

  pageLifetimes: {
    show() {
      this.refreshTabs();
    },
  },

  methods: {
    mergeTabRow(tab, pendingDot, roomPresenceDot) {
      const isRoom = tab.path === ROOM_PATH;
      const isPendingTab = DOT_PENDING_PATHS.indexOf(tab.path) >= 0;
      const tabDot = (isPendingTab && pendingDot) || (isRoom && roomPresenceDot);
      return {
        ...tab,
        tabDot: !!tabDot,
      };
    },

    refreshTabs() {
      const pages = getCurrentPages();
      const cur = pages[pages.length - 1];
      const route = cur && cur.route ? `/${cur.route}` : '';
      const active = route ? activeIndexForRoute(route) : 0;

      const token = wx.getStorageSync(springAuth.KEYS.TOKEN);
      if (!token) {
        this._lastPendingDot = false;
        this._lastRoomDot = false;
        const tabList = buildTabList().map((t) => this.mergeTabRow(t, false, false));
        this.setData({ tabList, active });
        return;
      }

      const snap = peekPendingBadges();
      let pendingDot = false;
      if (snap) {
        pendingDot = aggregateTabBarPending(snap) > 0;
      } else if (this._lastPendingDot === true) {
        pendingDot = true;
      }

      const roomDot = this._lastRoomDot === true;
      const tabList = buildTabList().map((t) => this.mergeTabRow(t, pendingDot, roomDot));
      this.setData({ tabList, active });

      const seq = (this._tabBadgeSeq = (this._tabBadgeSeq || 0) + 1);
      Promise.all([
        refreshPendingBadges(),
        fetchMiniPreferences(),
        springAuth
          .springRequest({
            url: '/api/v1/twin/dashboard/wechat-overview',
            method: 'GET',
            data: {},
          })
          .catch(() => ({ statusCode: 0, data: null })),
      ])
        .then(([counts, prefs, overviewRes]) => {
          if (seq !== this._tabBadgeSeq) return;
          const pendingDot2 = aggregateTabBarPending(counts) > 0;
          const ov = parseTwinOverview(overviewRes);
          const selections = (prefs && prefs.roomWatch && prefs.roomWatch.selections) || [];
          const roomPresenceDot =
            selections.length > 0 && ov.ok && roomWatchHasPresence(ov.rows, selections);
          this._lastPendingDot = pendingDot2;
          this._lastRoomDot = roomPresenceDot;
          const tabList2 = buildTabList().map((t) => this.mergeTabRow(t, pendingDot2, roomPresenceDot));
          const active2 = route ? activeIndexForRoute(route) : 0;
          this.setData({ tabList: tabList2, active: active2 });
        })
        .catch(() => {});
    },

    onChange(event) {
      var index = Number(event.detail);
      var tabList = this.data.tabList;
      if (Number.isNaN(index) || index < 0 || index >= tabList.length) return;
      var tab = tabList[index];
      if (tab.isPlaceholder) {
        wx.showToast({ title: '即将上线', icon: 'none' });
        return;
      }
      // 访客拦截：isNav 入口（申领/笼架）需登录
      if (tab.isNav) {
        var token = wx.getStorageSync('springToken');
        if (!token) {
          wx.showToast({ title: '请登录后使用', icon: 'none' });
          return;
        }
      }
      if (tab.isNav) {
        wx.navigateTo({ url: tab.path });
        return;
      }
      // 切 Tab 前关闭当前页弹层，避免 van-popup 遮罩残留与 navigate 竞态
      var pages = getCurrentPages();
      var cur = pages.length ? pages[pages.length - 1] : null;
      if (cur && typeof cur.setData === 'function' && cur.data) {
        var patch = {};
        if (cur.data.showDetail) patch.showDetail = false;
        if (cur.data.cartSheetShow) patch.cartSheetShow = false;
        if (cur.data.confirmOpen) patch.confirmOpen = false;
        if (Object.keys(patch).length) cur.setData(patch);
      }
      wx.switchTab({ url: tab.path });
      this.setData({ active: index });
    },
  },
});
