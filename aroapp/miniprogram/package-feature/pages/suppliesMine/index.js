const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { peekPendingBadges, refreshPendingBadges } = require('../../../utils/badgeSnapshotStore.js');
const {
  canShowStudentMaterialSwitch,
  goStudentMaterial,
} = require('../../utils/suppliesStudentSwitch.js');
const suppliesExportApi = require('../../utils/suppliesExportApi.js');

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

/** 同规格行归组，展开时按规格分段显示 */
function buildSpecGroups(lines) {
  if (!lines || lines.length === 0) return [];
  var groups = [];
  var seen = {};
  lines.forEach(function (line) {
    var key = line.specSnapshot ? JSON.stringify(line.specSnapshot) : '__no_spec__';
    if (!seen[key]) {
      seen[key] = {
        specKey: key,
        specLabel: key === '__no_spec__' ? '' : formatSpecLabel(line.specSnapshot),
        lines: [],
      };
      groups.push(seen[key]);
    }
    seen[key].lines.push(line);
  });
  return groups;
}

function decorateLines(lines) {
  return (lines || []).map(function (line) {
    var name = line.snapshotName != null ? String(line.snapshotName) : '';
    return {
      ...line,
      _coverAbsUrl: springAuth.toAbsoluteMediaUrl(line.coverUrl),
      _nameInitial: (name.trim().charAt(0) || '?'),
    };
  });
}

Page({
  _previewActive: false,

  data: {
    activeTab: 'mine',
    rows: [],
    recycleRows: [],
    page: 1,
    total: 0,
    totalPages: 1,
    recyclePage: 1,
    recycleTotal: 0,
    recycleTotalPages: 1,
    size: 10,
    loading: false,
    expandedIds: {},
    detailCache: {},
    menuOpenId: null,
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
    this.setData({ activeTab: tab, menuOpenId: null });
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
          data: { page, size, withLines: true },
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
      const rows = (minePayload.data || []).map((r) => {
        const lines = decorateLines(r.lines || []);
        return {
          ...r,
          lines,
          createdAtText: toTime(r.createdAt),
          fulfilledAtText: r.fulfilledAt ? toTime(r.fulfilledAt) : '',
          statusText: statusText(r.status),
          _headerNames: lines.map((l) => l.snapshotName).filter((n) => !!n).join('、'),
        };
      });
      const recycleRows = (recyclePayload.data || []).map((r) => ({
        ...r,
        createdAtText: toTime(r.createdAt),
        deletedAtText: toTime(r.deletedTime),
        purgeAfterText: toTime(r.purgeAfterTime),
        statusText: statusText(r.status),
      }));
      const total = Number(minePayload.total || 0);
      const recycleTotal = Number(recyclePayload.total || 0);
      this.setData({
        rows,
        total,
        totalPages: Math.max(1, Math.ceil(total / size)),
        recycleRows,
        recycleTotal,
        recycleTotalPages: Math.max(1, Math.ceil(recycleTotal / size)),
        expandedIds: {},
        detailCache: {},
        menuOpenId: null,
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /* ---- 卡片展开/收起 ---- */
  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (this.data.expandedIds[id]) {
      this.setData({ ['expandedIds.' + id]: false });
      return;
    }
    const row = (this.data.rows || []).find((r) => r.id === id);
    const lines = (row && row.lines) || [];
    this.setData({
      ['expandedIds.' + id]: true,
      menuOpenId: null,
      ['detailCache.' + id]: {
        status: row ? row.status : '',
        _specGroups: buildSpecGroups(lines),
      },
    });
  },

  onCollapseCard(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ ['expandedIds.' + id]: false });
  },

  /* ---- ⋮ 菜单 ---- */
  onMenuToggle(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ menuOpenId: this.data.menuOpenId === id ? null : id });
  },

  onMenuClose() {
    this.setData({ menuOpenId: null });
  },

  previewLineImage(e) {
    const current = String((e.currentTarget.dataset && e.currentTarget.dataset.url) || '').trim();
    if (!current) return;
    this._previewActive = true;
    const row = (this.data.rows || []).find((r) => r.id === e.currentTarget.dataset.claimId);
    const lines = (row && row.lines) || [];
    const urls = lines.map((l) => String(l._coverAbsUrl || '').trim()).filter((u) => !!u);
    wx.previewImage({ current, urls: urls.length ? Array.from(new Set(urls)) : [current] });
  },

  /** 与 suppliesProcess「去物资页修改」相同：物资页 reviseClaimId + PUT /api/supplies/claims/{id}/lines */
  goReviseInMall(e) {
    const id = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
    if (!id) return;
    this.setData({ menuOpenId: null });
    wx.navigateTo({ url: `/package-feature/pages/supplies/index?reviseClaimId=${encodeURIComponent(id)}` });
  },

  /**
   * 直接导出 Excel：**不再跳「预览/导出页」**。那个页面只剩这一个动作，
   * 多一跳没意义（领用单已经改成菜单里直接打开，见 openClaimForm）。
   */
  async exportClaimExcel(e) {
    const id = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
    if (!id) return;
    this.setData({ menuOpenId: null });
    wx.showLoading({ title: '导出中…', mask: true });
    try {
      const { data } = await suppliesExportApi.exportPersonalClaimExcel(id);
      await springAuth.saveAndOpenDocument(
        data,
        `supply-claim-${id.replace(/[^A-Za-z0-9_-]/g, '_')}.xlsx`,
        'xlsx'
      );
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '导出失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 打开本次《实验动物科学部内部物品领用单》。
   *
   * 两步：先要一个分享令牌（后端顺带生成/复用归档件），再凭令牌把 PDF 字节拉回来落盘打开。
   * springRequestBinary + saveAndOpenDocument 是项目现成的下载套路（与转移单同款）。
   */
  async openClaimForm(e) {
    const id = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
    if (!id) return;
    this.setData({ menuOpenId: null });
    wx.showLoading({ title: '正在生成领用单', mask: true });
    try {
      const link = await suppliesExportApi.createClaimPdfLink(id);
      const token = link && link.downloadToken;
      if (!token) throw new Error('领用单生成失败');
      const res = await suppliesExportApi.fetchClaimFormPdf(token);
      // 文件名用后端给的（就是单号，如 20260923-位亚磊-1.pdf），与纸面印的一致
      await springAuth.saveAndOpenDocument(res.data, (link && link.fileName) || `领用单-${id}.pdf`, 'pdf');
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '打开领用单失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  noop() {},

  onDeleteRecord(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ confirmDeleteShow: true, pendingDeleteId: id, menuOpenId: null });
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
