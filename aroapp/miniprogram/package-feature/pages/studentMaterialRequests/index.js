const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { refreshPendingBadges } = require('../../../utils/badgeSnapshotStore.js');
const mat = require('../../utils/materialStudentApi.js');

/** 学生只需关心「要不要去领」；其余状态在列表卡片上已有标签 */
const STATUS_FILTERS = [
  { label: '全部', value: '' },
  { label: '待领取', value: 'FULFILLED' },
  { label: '已完成', value: 'RECEIVED' },
];

function mapRow(r) {
  const status = String(r.status || '').toUpperCase();
  const lines = mat.decorateRequestLines(r.lines || []).map(function (l) {
    return Object.assign({}, l, { specLabel: mat.formatSpecLabel(l.specSnapshot) });
  });
  const names = lines.map((l) => {
    const base = `${l.snapshotName || '物品'}×${l.qty || 0}`;
    return l.specLabel ? `${base}（${l.specLabel}）` : base;
  });
  const displayTitle = names.length ? names.join('、') : `申领单 ${r.id || ''}`;
  const lineSummary = lines.length > 2 ? `等 ${lines.length} 项` : '';
  return {
    ...r,
    lines,
    status,
    statusText: mat.requestStatusText(status),
    createdAtText: mat.toTime(r.createdAt),
    displayTitle,
    lineSummary,
    canWithdraw: status === 'PENDING' || status === 'FIRST_OK',
    canRevoke: status === 'APPROVED' || status === 'FULFILLED',
    canReceive: status === 'FULFILLED',
  };
}

Page({
  _previewActive: false,

  data: {
    statusFilters: STATUS_FILTERS,
    activeStatus: '',
    rows: [],
    page: 1,
    total: 0,
    totalPages: 1,
    size: 20,
    loading: false,
    detailShow: false,
    detail: null,
    pageGateOk: false,
  },

  onLoad() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    const ok =
      !!token &&
      pagePermission.canAccessMiniPage('/package-feature/pages/studentMaterialRequests/index', role, 'STUDENT');
    if (!ok) {
      wx.showToast({ title: '无权限', icon: 'none' });
      this._accessDenied = true;
      wx.navigateBack({ delta: 1 });
      return;
    }
    this.setData({ pageGateOk: true });
  },

  onShow() {
    if (this._accessDenied || !this.data.pageGateOk) return;
    if (this._previewActive) {
      this._previewActive = false;
      return;
    }
    this.load();
  },

  onPullDownRefresh() {
    this.setData({ page: 1 });
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  onStatusFilter(e) {
    const status = e.currentTarget.dataset.status;
    const next = status == null ? '' : String(status);
    if (next === this.data.activeStatus) return;
    this.setData({ activeStatus: next, page: 1 }, () => this.load());
  },

  async load() {
    this.setData({ loading: true });
    try {
      const { page, size, activeStatus } = this.data;
      const data = { page, size };
      if (activeStatus) data.status = activeStatus;
      const res = await springAuth.springRequest({
        url: '/api/material/requests/mine',
        method: 'GET',
        data,
      });
      const p = mat.parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      const payload = p.body.data || {};
      const rows = (payload.data || []).map(mapRow);
      const total = Number(payload.total || 0);
      const totalPages = Math.max(1, Math.ceil(total / size));
      this.setData({
        rows,
        total,
        totalPages,
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showLoading({ title: '加载…', mask: true });
    springAuth
      .springRequest({
        url: `/api/material/requests/${encodeURIComponent(id)}`,
        method: 'GET',
        data: {},
      })
      .then((res) => {
        const p = mat.parseResponse(res);
        if (!p.ok) throw new Error(p.message);
        const d = mapRow(p.body.data || {});
        this.setData({ detail: d, detailShow: true });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      })
      .finally(() => wx.hideLoading());
  },

  closeDetail() {
    this.setData({ detailShow: false, detail: null });
  },

  previewLineImage(e) {
    const current = String((e.currentTarget.dataset && e.currentTarget.dataset.url) || '').trim();
    if (!current) return;
    this._previewActive = true;
    const lines = (this.data.detail && this.data.detail.lines) || [];
    const urls = lines
      .map((l) => String(l.coverAbsUrl || '').trim())
      .filter((u) => !!u);
    wx.previewImage({ current, urls: urls.length ? Array.from(new Set(urls)) : [current] });
  },

  onDetailPopupClose() {
    this.closeDetail();
  },

  async onWithdraw(e) {
    const id = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
    if (!id) return;
    const res = await wx.showModal({ title: '撤回申领', content: '确认撤回该申领单？' });
    if (!res.confirm) return;
    wx.showLoading({ title: '处理中…', mask: true });
    try {
      const r = await springAuth.springRequest({
        url: `/api/material/requests/${encodeURIComponent(id)}/withdraw`,
        method: 'POST',
        data: {},
      });
      const p = mat.parseResponse(r);
      if (!p.ok) throw new Error(p.message);
      wx.showToast({ title: '已撤回', icon: 'success' });
      if (this.data.detailShow) this.closeDetail();
      await this.load();
      void refreshPendingBadges({ force: true }).catch(() => null);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async onRevoke(e) {
    const id = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
    if (!id) return;
    const res = await wx.showModal({ title: '撤销申领', content: '确定撤销此申领？已通过/出库的物品将被召回，审核记录将被清除。' });
    if (!res.confirm) return;
    wx.showLoading({ title: '处理中…', mask: true });
    try {
      const r = await springAuth.springRequest({
        url: `/api/material/requests/${encodeURIComponent(id)}/withdraw`,
        method: 'POST',
        data: {},
      });
      const p = mat.parseResponse(r);
      if (!p.ok) throw new Error(p.message);
      wx.showToast({ title: '已撤销，回退待审', icon: 'success' });
      if (this.data.detailShow) this.closeDetail();
      await this.load();
      void refreshPendingBadges({ force: true }).catch(() => null);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async onReceive(e) {
    const id = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
    if (!id) return;
    const res = await wx.showModal({ title: '确认领取', content: '确认已领取该申领单中的物品？' });
    if (!res.confirm) return;
    wx.showLoading({ title: '处理中…', mask: true });
    try {
      const r = await springAuth.springRequest({
        url: `/api/material/requests/${encodeURIComponent(id)}/receive`,
        method: 'POST',
        data: {},
      });
      const p = mat.parseResponse(r);
      if (!p.ok) throw new Error(p.message);
      wx.showToast({ title: '已确认领取', icon: 'success' });
      if (this.data.detailShow) this.closeDetail();
      await this.load();
      void refreshPendingBadges({ force: true }).catch(() => null);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  prevPage() {
    if (this.data.page <= 1) return;
    this.setData({ page: this.data.page - 1 }, () => this.load());
  },

  nextPage() {
    const { page, total, size } = this.data;
    if (page * size >= total) return;
    this.setData({ page: page + 1 }, () => this.load());
  },
});
