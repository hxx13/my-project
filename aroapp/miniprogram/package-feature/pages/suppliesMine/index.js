const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { peekPendingBadges, refreshPendingBadges } = require('../../../utils/badgeSnapshotStore.js');
const {
  canShowStudentMaterialSwitch,
  goStudentMaterial,
} = require('../../utils/suppliesStudentSwitch.js');

function parseResponse(res) {
  const { statusCode, data } = res;
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false, message: body || '响应解析失败' };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || `请求失败(${statusCode})` };
  }
  return { ok: true, body };
}

function statusText(s) {
  if (s === 'PENDING') return '待出库';
  if (s === 'FULFILLED') return '已完成';
  if (s === 'WITHDRAWN') return '已撤回';
  if (s === 'DELETED') return '已删除';
  return s || '-';
}

function toTime(v) {
  if (!v) return '-';
  return String(v).replace('T', ' ').slice(0, 16);
}

function formatSpecLabel(specJson) {
  if (!specJson) return '';
  var obj = specJson;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch (e) { return ''; }
  }
  if (!obj || typeof obj !== 'object') return '';
  var keys = Object.keys(obj);
  if (keys.length === 0) return '';
  return keys.map(function (k) { return k + ':' + obj[k]; }).join(' ');
}

function decorateClaimLines(lines) {
  return (lines || []).map((l) => {
    const name = l.snapshotName != null ? String(l.snapshotName) : '';
    const ch = name.trim().charAt(0) || '?';
    return {
      ...l,
      coverAbsUrl: springAuth.toAbsoluteMediaUrl(l.coverUrl),
      nameInitial: ch,
      specLabel: l.specSnapshot ? formatSpecLabel(l.specSnapshot) : '',
    };
  });
}

/** @deprecated Cloud URL resolution no longer needed; all images go through direct HTTP */
async function resolveLineCloudUrls(_lines) {
  /* no-op: cloud:// resolution removed in Phase 2C */
}

Page({
  _previewActive: false,

  data: {
    activeTab: 'mine',
    rows: [],
    recycleRows: [],
    page: 1,
    total: 0,
    recyclePage: 1,
    recycleTotal: 0,
    size: 10,
    loading: false,
    detailShow: false,
    detail: null,
    confirmDeleteShow: false,
    pendingDeleteId: '',
    pageGateOk: false,
    /** 与 pending-badges.supplies 同源：本人待出库数量，用于「我的记录」Tab 角标 */
    minePendingBadgeText: '',
    showStudentSwitch: false,
  },

  onLoad() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    const ok =
      hasMinRole(role, 'STAFF') && pagePermission.canAccessMiniPage('/package-feature/pages/suppliesMine/index', role, 'STAFF');
    if (!ok) {
      wx.showToast({ title: '无权限', icon: 'none' });
      this._mineAccessDenied = true;
      wx.navigateBack({ delta: 1 });
      return;
    }
    this.setData({ pageGateOk: true });
  },

  applyMinePendingTabBadge() {
    const c = peekPendingBadges();
    const n = c ? Number(c.supplies || 0) : 0;
    const t = n > 0 && c.suppliesText ? String(c.suppliesText) : '';
    this.setData({ minePendingBadgeText: t });
  },

  onShow() {
    if (this._mineAccessDenied || !this.data.pageGateOk) return;
    if (this._previewActive) {
      this._previewActive = false;
      return;
    }
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    this.setData({ showStudentSwitch: canShowStudentMaterialSwitch(role) });
    this.applyMinePendingTabBadge();
    void refreshPendingBadges().then(() => this.applyMinePendingTabBadge());
    this.load();
  },

  onSwitchStudent() {
    goStudentMaterial();
  },

  onPullDownRefresh() {
    this.setData({ page: 1, recyclePage: 1 });
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
  },

  cancelDetailTimer() {
    if (this._detailClearTimer) {
      clearTimeout(this._detailClearTimer);
      this._detailClearTimer = null;
    }
  },

  scheduleClearDetail() {
    this.cancelDetailTimer();
    this._detailClearTimer = setTimeout(() => {
      this._detailClearTimer = null;
      if (!this.data.detailShow) {
        this.setData({ detail: null });
      }
    }, 320);
  },

  onDetailPopupClose() {
    this.setData({ detailShow: false });
    this.scheduleClearDetail();
  },

  async load() {
    this.setData({ loading: true });
    try {
      await springAuth.refreshPublicRuntimeConfig().catch(() => null);
      const { page, recyclePage, size } = this.data;
      const [mineRes, recycleRes] = await Promise.all([
        springAuth.springRequest({
          url: '/api/supplies/claims/mine',
          method: 'GET',
          data: { page, size },
        }),
        springAuth.springRequest({
          url: '/api/supplies/claims/recycle/mine',
          method: 'GET',
          data: { page: recyclePage, size },
        }),
      ]);
      const mineParsed = parseResponse(mineRes);
      const recycleParsed = parseResponse(recycleRes);
      if (!mineParsed.ok) throw new Error(mineParsed.message);
      if (!recycleParsed.ok) throw new Error(recycleParsed.message);
      const minePayload = mineParsed.body.data || {};
      const recyclePayload = recycleParsed.body.data || {};
      const rows = (minePayload.data || []).map((r) => ({
        ...r,
        createdAtText: toTime(r.createdAt),
        fulfilledAtText: toTime(r.fulfilledAt),
        statusText: statusText(r.status),
        displayTitle: '领用',
      }));
      const recycleRows = (recyclePayload.data || []).map((r) => ({
        ...r,
        createdAtText: toTime(r.createdAt),
        deletedAtText: toTime(r.deletedTime),
        purgeAfterText: toTime(r.purgeAfterTime),
        statusText: statusText(r.status),
      }));
      this.setData({
        rows,
        total: Number(minePayload.total || 0),
        recycleRows,
        recycleTotal: Number(recyclePayload.total || 0),
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
    this.cancelDetailTimer();
    wx.showLoading({ title: '加载…', mask: true });
    springAuth
      .springRequest({
        url: `/api/supplies/claims/${encodeURIComponent(id)}`,
        method: 'GET',
        data: {},
      })
      .then(async (res) => {
        const p = parseResponse(res);
        if (!p.ok) throw new Error(p.message);
        const d = p.body.data;
        const lines = decorateClaimLines(d.lines || []);
        await resolveLineCloudUrls(lines);
        const detail = {
          ...d,
          lines,
          createdAtText: toTime(d.createdAt),
          fulfilledAtText: toTime(d.fulfilledAt),
          statusText: statusText(d.status),
        };
        this.setData({ detail, detailShow: true });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      })
      .finally(() => wx.hideLoading());
  },

  closeDetail() {
    this.setData({ detailShow: false });
    this.scheduleClearDetail();
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

  /** 与 suppliesProcess「去物资页修改」相同：物资页 reviseClaimId + PUT /api/supplies/claims/{id}/lines */
  goReviseInMall(e) {
    const id = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
    if (!id) return;
    if (this.data.detailShow) {
      this.setData({ detailShow: false });
      this.scheduleClearDetail();
    }
    wx.navigateTo({ url: `/package-feature/pages/supplies/index?reviseClaimId=${encodeURIComponent(id)}` });
  },

  goClaimExport(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/package-feature/pages/suppliesClaimExport/index?claimId=${encodeURIComponent(id)}` });
  },

  noop() {},

  onDeleteRecord(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ confirmDeleteShow: true, pendingDeleteId: id });
  },

  cancelDelete() {
    this.setData({ confirmDeleteShow: false, pendingDeleteId: '' });
  },

  async confirmDelete() {
    const id = this.data.pendingDeleteId;
    if (!id) return;
    this.setData({ confirmDeleteShow: false, pendingDeleteId: '' });
    const res = await springAuth.springRequest({
      url: `/api/supplies/claims/${encodeURIComponent(id)}`,
      method: 'DELETE',
      data: {},
    });
    const p = parseResponse(res);
    if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
    wx.showToast({ title: '已删除', icon: 'success' });
    await this.load();
    await refreshPendingBadges({ force: true }).catch(() => null);
    this.applyMinePendingTabBadge();
  },

  async onRestoreRecord(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const res = await springAuth.springRequest({
      url: `/api/supplies/claims/recycle/${encodeURIComponent(id)}/restore`,
      method: 'POST',
      data: {},
    });
    const p = parseResponse(res);
    if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
    wx.showToast({ title: '已恢复', icon: 'success' });
    await this.load();
  },

  prevPage() {
    if (this.data.page <= 1) return;
    this.setData({ page: this.data.page - 1 }, () => this.load().catch(() => {}));
  },

  nextPage() {
    const { page, total, size } = this.data;
    if (page * size >= total) return;
    this.setData({ page: page + 1 }, () => this.load().catch(() => {}));
  },

  prevRecyclePage() {
    if (this.data.recyclePage <= 1) return;
    this.setData({ recyclePage: this.data.recyclePage - 1 }, () => this.load().catch(() => {}));
  },

  nextRecyclePage() {
    const { recyclePage, recycleTotal, size } = this.data;
    if (recyclePage * size >= recycleTotal) return;
    this.setData({ recyclePage: recyclePage + 1 }, () => this.load().catch(() => {}));
  },
});
