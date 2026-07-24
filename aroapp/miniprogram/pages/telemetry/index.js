const telemetryApi = require('../../utils/animalRoomTelemetryApi.js');
const springAuth = require('../../utils/springAuth.js');
const pagePermission = require('../../utils/pagePermission.js');
const { hasMinRole } = require('../../utils/roleAccess.js');
const animalRoomHvacUnits = require('../../utils/animalRoomHvacUnits.js');

Page({
  data: {
    telemetryPage: null,
    telemetryErr: '',
    telemetryLoading: false,
    lastSoloPx: 360,
  },

  onLoad() {
    this._telemetryPollTimer = null;
    this._telemetryActiveTabKey = '';
    this._lastTelemetryManualRefreshAt = 0;
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'ADMIN')) {
      this.setData({ telemetryErr: '需要管理员及以上权限', telemetryLoading: false });
      return;
    }
    this.loadTelemetryPage(false, null);
  },

  onUnload() {
    this.clearTelemetryPoll();
    this.clearTelemetryAdjacentPrefetch();
  },

  onHide() {
    this.clearTelemetryPoll();
    this.clearTelemetryAdjacentPrefetch();
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.guardPageOnShow(this, '/pages/telemetry/index', role, 'ADMIN')) return;
    if (!hasMinRole(role, 'ADMIN')) return;
    const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
    if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();
    if (this.data.telemetryPage) this.scheduleTelemetryPoll();
    wx.nextTick(() => {
      const comp = this.selectComponent('#telemetry-comp');
      if (comp && typeof comp.measureSoloWidth === 'function') comp.measureSoloWidth();
    });
  },

  clearTelemetryPoll() {
    if (this._telemetryPollTimer) {
      clearInterval(this._telemetryPollTimer);
      this._telemetryPollTimer = null;
    }
  },

  clearTelemetryAdjacentPrefetch() {
    if (this._telemetryAdjacentPrefetchTimer) {
      clearTimeout(this._telemetryAdjacentPrefetchTimer);
      this._telemetryAdjacentPrefetchTimer = null;
    }
  },

  scheduleTelemetryAdjacentPrefetch(soloPx, centerTabKey) {
    this.clearTelemetryAdjacentPrefetch();
    const px = soloPx != null ? soloPx : this.data.lastSoloPx || 360;
    const center = String(centerTabKey || '').trim();
    if (!center) return;
    this._telemetryAdjacentPrefetchTimer = setTimeout(() => {
      this._telemetryAdjacentPrefetchTimer = null;
      const keyNow = String(this._telemetryActiveTabKey || '').trim();
      if (!keyNow || keyNow !== center) return;
      telemetryApi.prefetchAdjacentAnimalRoomFloorDetails({
        soloWidthPx: px,
        campus: null,
        activeTabKey: keyNow,
        getPage: () => this.data.telemetryPage,
        onMerged: (merged) => {
          this.setData({ telemetryPage: merged });
        },
      });
    }, 500);
  },

  scheduleTelemetryPoll() {
    this.clearTelemetryPoll();
    const p = this.data.telemetryPage;
    const ms = telemetryApi.clampTelemetryPollIntervalMs(p && p.pollIntervalMs);
    if (ms > 0) {
      this._telemetryPollTimer = setInterval(() => {
        this.loadTelemetryPage(false, this.data.lastSoloPx);
      }, ms);
    }
  },

  loadTelemetryPage(sync, soloPx) {
    const px = soloPx != null ? soloPx : this.data.lastSoloPx || 360;
    const first = !this.data.telemetryPage;
    this.setData({ lastSoloPx: px });
    if (first) this.setData({ telemetryLoading: true, telemetryErr: '' });
    if (!String(this._telemetryActiveTabKey || '').trim()) {
      const sk = telemetryApi.readStoredTelemetryFloorTabKey();
      if (sk) this._telemetryActiveTabKey = sk;
    }

    const tabKeyForPoll = () => {
      const k = String(this._telemetryActiveTabKey || '').trim();
      if (k) return k;
      return telemetryApi.pickInitialTelemetryTabKeyFromSummary(this.data.telemetryPage);
    };

    const finishOk = (merged, centerTabKeyForPrefetch) => {
      this.setData({
        telemetryPage: merged,
        telemetryLoading: false,
        telemetryErr: '',
      });
      this.scheduleTelemetryPoll();
      wx.nextTick(() => {
        const comp = this.selectComponent('#telemetry-comp');
        if (comp && typeof comp.measureSoloWidth === 'function') comp.measureSoloWidth();
      });
      const pf = String(centerTabKeyForPrefetch || this._telemetryActiveTabKey || '').trim();
      if (pf) this.scheduleTelemetryAdjacentPrefetch(px, pf);
    };

    const tkPoll = first ? '' : tabKeyForPoll();

    if (!first && tkPoll) {
      return telemetryApi
        .fetchAnimalRoomTelemetrySummaryAndTabParallel(!!sync, px, null, tkPoll)
        .then(({ summary, detail }) => {
          if (!detail) {
            if (!String(this._telemetryActiveTabKey || '').trim()) {
              const fallbackTk = telemetryApi.pickInitialTelemetryTabKeyFromSummary(summary);
              if (fallbackTk) this._telemetryActiveTabKey = fallbackTk;
            }
            finishOk(summary, this._telemetryActiveTabKey);
            return summary;
          }
          const base = this.data.telemetryPage;
          const merged = telemetryApi.mergeTelemetrySplitResult(base, summary, detail, tkPoll);
          if (!String(this._telemetryActiveTabKey || '').trim()) {
            this._telemetryActiveTabKey = tkPoll;
          }
          finishOk(merged, tkPoll);
          return merged;
        })
        .catch((e) => {
          this.setData({
            telemetryLoading: false,
            telemetryErr: (e && (e.message || e.errMsg)) || '加载失败',
          });
        });
    }

    return telemetryApi
      .fetchAnimalRoomTelemetry(!!sync, px, null, { telemetrySummaryOnly: true })
      .then((summary) => {
        const tabKey = first
          ? telemetryApi.pickInitialTelemetryTabKeyFromSummary(summary)
          : tabKeyForPoll();
        if (!tabKey) {
          finishOk(summary, '');
          return summary;
        }
        return telemetryApi
          .fetchAnimalRoomTelemetry(!!sync, px, null, { telemetryTabKey: tabKey })
          .then((detail) => {
            const base = first ? undefined : this.data.telemetryPage;
            const merged = telemetryApi.mergeTelemetrySplitResult(base, summary, detail, tabKey);
            if (first || !String(this._telemetryActiveTabKey || '').trim()) {
              this._telemetryActiveTabKey = tabKey;
            }
            finishOk(merged, tabKey);
            return merged;
          });
      })
      .catch((e) => {
        this.setData({
          telemetryLoading: false,
          telemetryErr: (e && (e.message || e.errMsg)) || '加载失败',
        });
      });
  },

  onTelemetryTabChange(e) {
    const tk = e && e.detail && e.detail.tabKey;
    if (tk) this._telemetryActiveTabKey = String(tk).trim();
  },

  onTelemetryFetchTab(e) {
    const tk = e && e.detail && e.detail.tabKey;
    const w = e && e.detail && e.detail.soloWidthPx;
    const px = w != null ? w : this.data.lastSoloPx;
    const key = tk != null ? String(tk).trim() : '';
    if (!key) return;
    this._telemetryActiveTabKey = key;
    if (animalRoomHvacUnits.isSyntheticHvacTabKey(key)) {
      telemetryApi
        .fetchAnimalRoomTelemetry(false, px, null, { telemetryTabKey: key })
        .then((detail) => {
          const cur = this.data.telemetryPage;
          const merged = telemetryApi.mergeTabDetailIntoPage(cur, detail, key);
          this.setData({ telemetryPage: merged });
          const comp = this.selectComponent('#telemetry-comp');
          if (comp && typeof comp.applyTelemetryPage === 'function') {
            comp.applyTelemetryPage(merged, { preserveTabKey: key });
          }
        })
        .catch((err) => {
          wx.showToast({ title: (err && (err.message || err.errMsg)) || '加载失败', icon: 'none' });
        });
      return;
    }
    telemetryApi
      .fetchAnimalRoomTelemetry(false, px, null, { telemetryTabKey: key })
      .then((detail) => {
        const cur = this.data.telemetryPage;
        const merged = telemetryApi.mergeTabDetailIntoPage(cur, detail, key);
        this.setData({ telemetryPage: merged });
        this.scheduleTelemetryAdjacentPrefetch(px, key);
      })
      .catch((err) => {
        wx.showToast({ title: (err && (err.message || err.errMsg)) || '加载失败', icon: 'none' });
      });
  },

  onTelemetryReload(e) {
    const w = e && e.detail && e.detail.soloWidthPx;
    if (w == null) return;
    this.loadTelemetryPage(false, w);
  },

  onTelemetryTagMerge(e) {
    const row = e && e.detail && e.detail.row;
    const page = this.data.telemetryPage;
    if (!row || !page || !Array.isArray(page.tagItems)) return;
    const vn = String(row.variableName || '').trim();
    const tagItems = page.tagItems.map((it) => {
      if (String((it && it.variableName) || '').trim() === vn) {
        return Object.assign({}, it, row);
      }
      return it;
    });
    this.setData({ telemetryPage: Object.assign({}, page, { tagItems }) });
  },

  async onPullDownRefresh() {
    try {
      const cooldownMs = 60 * 1000;
      const now = Date.now();
      const last = this._lastTelemetryManualRefreshAt || 0;
      if (now - last < cooldownMs) {
        const waitSec = Math.max(1, Math.ceil((cooldownMs - (now - last)) / 1000));
        wx.showToast({ title: `${waitSec} 秒后可再次下拉刷新`, icon: 'none' });
        return;
      }
      this._lastTelemetryManualRefreshAt = now;
      await this.loadTelemetryPage(true, this.data.lastSoloPx);
    } catch (e) {
      /* loadTelemetryPage 已在 catch 中 setData */
    } finally {
      wx.stopPullDownRefresh();
    }
  },
});
