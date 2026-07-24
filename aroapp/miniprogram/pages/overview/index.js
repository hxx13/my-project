const springAuth = require('../../utils/springAuth.js');
const pagePermission = require('../../utils/pagePermission.js');
const { hasMinRole } = require('../../utils/roleAccess.js');

function unwrapNestedDto(outer) {
  if (outer == null) return null;
  if (typeof outer !== 'object') return outer;
  if (Object.prototype.hasOwnProperty.call(outer, 'data')) return outer.data;
  return outer;
}

function parseResponse(res) {
  const statusCode = Number(res && res.statusCode);
  let body = res ? res.data : null;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false, message: body || '响应解析失败' };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限访问' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || `请求失败(${statusCode || 0})` };
  }
  return { ok: true, data: unwrapNestedDto(body.data) };
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

Page({
  data: {
    /** 管理员及以上：双区饼图等区块 */
    canOverviewAdmin: false,
    loading: false,
    rankingLoading: false,
    pudongTotal: 0,
    puxiTotal: 0,
    pudongPieRows: [],
    puxiPieRows: [],
    lineRows: [],
    lineMax: 0,
    rankRows: [],
    rankTimeType: 'MONTH',
    rankRegion: 'TOTAL',
    updatedAtText: '',
  },

  onLoad() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const canOverviewAdmin = hasMinRole(role, 'ADMIN');
    this.setData({ canOverviewAdmin });
    this.loadOverview();
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.guardPageOnShow(this, '/pages/overview/index', role, 'STUDENT')) return;
    const canOverviewAdmin = hasMinRole(role, 'ADMIN');
    this.setData({ canOverviewAdmin });
    const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
    if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();
    this.loadOverview();
  },

  async onPullDownRefresh() {
    await this.loadOverview();
    wx.stopPullDownRefresh();
  },

  async loadOverview() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const [pieRes, lineRes, rankRes] = await Promise.all([
        springAuth.springRequest({ url: '/api/v1/twin/dashboard/pie-chart', method: 'GET', data: {} }),
        springAuth.springRequest({ url: '/api/v1/twin/dashboard/line-chart', method: 'GET', data: {} }),
        this.fetchRankingRequest(this.data.rankTimeType, this.data.rankRegion),
      ]);
      const pieParsed = parseResponse(pieRes);
      const lineParsed = parseResponse(lineRes);
      const rankParsed = parseResponse(rankRes);
      if (!pieParsed.ok) throw new Error(pieParsed.message);
      if (!lineParsed.ok) throw new Error(lineParsed.message);
      if (!rankParsed.ok) throw new Error(rankParsed.message);

      const pie = pieParsed.data || {};
      const line = lineParsed.data || {};
      const rank = Array.isArray(rankParsed.data) ? rankParsed.data : [];

      const pudongTotal = n(pie.pudongTotal);
      const puxiTotal = n(pie.puxiTotal);
      const pudongPieRows = this.buildPieRows(pie.pudongPie, pudongTotal);
      const puxiPieRows = this.buildPieRows(pie.puxiPie, puxiTotal);
      const lineRows = this.buildLineRows(line);
      const lineMax = lineRows.reduce((m, r) => Math.max(m, r.pudong, r.puxi), 0);
      const rankRows = rank.slice(0, 50).map((item, idx) => ({
        rankNo: idx + 1,
        name: String(item.groupName || item.name || item.projectName || '-'),
        value: n(item.count || item.totalCount || item.value || item.times),
      }));

      this.setData({
        pudongTotal,
        puxiTotal,
        pudongPieRows,
        puxiPieRows,
        lineRows,
        lineMax,
        rankRows,
        updatedAtText: this.timeText(new Date()),
      });
    } catch (e) {
      wx.showToast({ title: '概览加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  fetchRankingRequest(timeType, region) {
    return springAuth.springRequest({
      url: '/api/v1/twin/dashboard/ranking',
      method: 'GET',
      data: { timeType, region },
    });
  },

  async loadRankingOnly() {
    if (this.data.rankingLoading) return;
    this.setData({ rankingLoading: true });
    try {
      const rankRes = await this.fetchRankingRequest(this.data.rankTimeType, this.data.rankRegion);
      const rankParsed = parseResponse(rankRes);
      if (!rankParsed.ok) throw new Error(rankParsed.message);
      const rank = Array.isArray(rankParsed.data) ? rankParsed.data : [];
      const rankRows = rank.slice(0, 50).map((item, idx) => ({
        rankNo: idx + 1,
        name: String(item.groupName || item.name || item.projectName || '-'),
        value: n(item.count || item.totalCount || item.value || item.times),
      }));
      this.setData({ rankRows, updatedAtText: this.timeText(new Date()) });
    } catch (e) {
      wx.showToast({ title: '榜单加载失败', icon: 'none' });
    } finally {
      this.setData({ rankingLoading: false });
    }
  },

  buildPieRows(list, total) {
    const rows = Array.isArray(list) ? list : [];
    const safeTotal = total > 0 ? total : rows.reduce((s, it) => s + n(it.value || it.count), 0);
    return rows
      .map((it) => {
        const value = n(it.value || it.count);
        const name = String(it.roomName || it.name || it.label || '未命名');
        const pct = safeTotal > 0 ? Math.round((value * 1000) / safeTotal) / 10 : 0;
        return { name, value, pct, widthPct: Math.max(6, Math.min(100, pct)) };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  },

  buildLineRows(line) {
    const times = Array.isArray(line.times) ? line.times : [];
    const pd = Array.isArray(line.pudong) ? line.pudong : [];
    const px = Array.isArray(line.puxi) ? line.puxi : [];
    return times.map((t, idx) => ({
      time: String(t || ''),
      pudong: n(pd[idx]),
      puxi: n(px[idx]),
    }));
  },

  onRankTimeTap(e) {
    const v = String(e.currentTarget.dataset.value || '');
    if (!v || v === this.data.rankTimeType) return;
    this.setData({ rankTimeType: v }, () => {
      this.loadRankingOnly();
    });
  },

  onRankRegionTap(e) {
    const v = String(e.currentTarget.dataset.value || '');
    if (!v || v === this.data.rankRegion) return;
    this.setData({ rankRegion: v }, () => {
      this.loadRankingOnly();
    });
  },

  timeText(d) {
    const dt = d instanceof Date ? d : new Date();
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  },
});
