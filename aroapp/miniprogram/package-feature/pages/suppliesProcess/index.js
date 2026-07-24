const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const suppliesExportApi = require('../../utils/suppliesExportApi.js');

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

function toTextTime(v) {
  if (!v) return '-';
  return String(v).replace('T', ' ').slice(0, 19);
}

function claimStatusText(s) {
  if (s === 'PENDING') return '待出库';
  if (s === 'FULFILLED') return '已完成';
  if (s === 'WITHDRAWN') return '已撤回';
  return s || '-';
}

function applicantDisplay(o) {
  if (!o) return '-';
  const n = (o.applicantName && String(o.applicantName).trim()) || '';
  return n || o.userId || '-';
}

function recycleOrderTitle(o) {
  if (!o) return '-';
  return applicantDisplay(o);
}

Page({
  data: {
    activeTab: 'pending',
    loading: false,
    pendingRows: [],
    doneRows: [],
    expandedIds: {},
    menuOpenId: null,
    detailCache: {},
    grantMapCache: {},
    fulfillingIds: {},
    recycleRows: [],
    recycleSelected: {},
    linkPopupShow: false,
    linkClaim: null,
    exportClaimBusy: false,
    fulfillQtyByLineCache: {},
    remarkByLineCache: {},
    remarkExpandedByLineCache: {},
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'SUPER_ADMIN')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/suppliesProcess/index', role, 'SUPER_ADMIN')) return;
    springAuth.refreshPublicRuntimeConfig().finally(() => {
      this.loadAll();
    });
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh());
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      const [pRes, dRes, rRes] = await Promise.all([
        springAuth.springRequest({ url: '/api/supplies/claims/pending-tasks', method: 'GET', data: {} }),
        springAuth.springRequest({ url: '/api/supplies/claims/recent-closed', method: 'GET', data: { limit: 60 } }),
        springAuth.springRequest({ url: '/api/supplies/admin/claims/recycle', method: 'GET', data: { page: 1, size: 200 } }),
      ]);
      const pp = parseResponse(pRes);
      const dp = parseResponse(dRes);
      const rp = parseResponse(rRes);
      if (!pp.ok) throw new Error(pp.message);
      if (!dp.ok) throw new Error(dp.message);
      if (!rp.ok) throw new Error(rp.message);
      const pendingRows = (pp.body.data || []).map((it) => ({
        ...it,
        createdAtText: toTextTime(it.createdAt),
        statusText: claimStatusText(it.status),
        applicantDisplay: applicantDisplay(it),
        _headerNames: (it.lines || []).map(function(l) { return l.snapshotName; }).join('、'),
      }));
      const doneRows = (dp.body.data || []).map((it) => ({
        ...it,
        createdAtText: toTextTime(it.createdAt),
        fulfilledAtText: toTextTime(it.fulfilledAt),
        statusText: claimStatusText(it.status),
        applicantDisplay: applicantDisplay(it),
        _headerNames: (it.lines || []).map(function(l) { return l.snapshotName; }).join('、'),
      }));
      const recycleRows = ((rp.body.data && rp.body.data.data) || []).map((it) => ({
        ...it,
        applicantDisplay: applicantDisplay(it),
        statusText: claimStatusText(it.status),
        createdAtText: toTextTime(it.createdAt),
        purgeAfterText: it.purgeAfterTime ? String(it.purgeAfterTime).replace('T', ' ').slice(0, 16) : '',
        recycleTitle: recycleOrderTitle(it),
        _headerNames: (it.lines || []).map(function(l) { return l.snapshotName; }).join('、'),
      }));
      this.setData({ pendingRows, doneRows, recycleRows, recycleSelected: {} });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /* ---- 卡片展开/收起（支持多卡片同时展开） ---- */
  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (this.data.expandedIds[id]) {
      this.collapseOne(id);
      return;
    }
    // 展开
    this.setData({ ['expandedIds.' + id]: true });
    if (this.data.detailCache[id]) return; // 已缓存
    void this.expandCard(id);
  },

  expandCard(id) {
    // 列表接口已返回 lines，直接从已有数据构建缓存，无需调详情 API
    const rows = (this.data.pendingRows || []).concat(this.data.doneRows || []).concat(this.data.recycleRows || []);
    const row = rows.find(function(r) { return r.id === id; });
    const lines = row && row.lines ? row.lines : null;

    if (lines && lines.length > 0) {
      const grantMap = {};
      const fulfillQtyByLine = {};
      const remarkByLine = {};
      const remarkExpandedByLine = {};
      lines.forEach(function(line) {
        grantMap[line.id] = (line.fulfilledQty || 0) > 0;
        fulfillQtyByLine[line.id] = line.qty != null ? line.qty : 1;
        if (line.remark) {
          remarkByLine[line.id] = line.remark;
          remarkExpandedByLine[line.id] = true;
        }
        if (line.coverUrl) line._coverAbsUrl = springAuth.toAbsoluteMediaUrl(line.coverUrl);
      });
      const detail = {
        ...row,
        createdAtText: toTextTime(row.createdAt),
        fulfilledAtText: toTextTime(row.fulfilledAt),
        statusText: claimStatusText(row.status),
        applicantDisplay: applicantDisplay(row),
        _specGroups: buildSpecGroups(lines),
        _headerNames: row._headerNames || lines.map(function(l) { return l.snapshotName; }).join('、'),
      };
      this.setData({
        ['detailCache.' + id]: detail,
        ['grantMapCache.' + id]: grantMap,
        ['fulfillQtyByLineCache.' + id]: fulfillQtyByLine,
        ['remarkByLineCache.' + id]: remarkByLine,
        ['remarkExpandedByLineCache.' + id]: remarkExpandedByLine,
      });
      return;
    }

    // 兜底：列表没 lines 时才调详情 API
    const that = this;
    wx.showLoading({ title: '加载中…', mask: true });
    springAuth.springRequest({
      url: `/api/supplies/claims/${encodeURIComponent(id)}`,
      method: 'GET',
      data: {},
    }).then(function(res) {
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      const d = p.body.data;
      const grantMap = {};
      const fulfillQtyByLine = {};
      const remarkByLine = {};
      const remarkExpandedByLine = {};
      (d.lines || []).forEach(function(line) {
        grantMap[line.id] = (line.fulfilledQty || 0) > 0;
        fulfillQtyByLine[line.id] = line.qty != null ? line.qty : 1;
        if (line.remark) {
          remarkByLine[line.id] = line.remark;
          remarkExpandedByLine[line.id] = true;
        }
        if (line.coverUrl) line._coverAbsUrl = springAuth.toAbsoluteMediaUrl(line.coverUrl);
      });
      const detail = {
        ...d,
        createdAtText: toTextTime(d.createdAt),
        fulfilledAtText: toTextTime(d.fulfilledAt),
        statusText: claimStatusText(d.status),
        applicantDisplay: applicantDisplay(d),
        _specGroups: buildSpecGroups(d.lines || []),
        _headerNames: (d.lines || []).map(function(l) { return l.snapshotName; }).join('、'),
      };
      that.setData({
        ['detailCache.' + id]: detail,
        ['grantMapCache.' + id]: grantMap,
        ['fulfillQtyByLineCache.' + id]: fulfillQtyByLine,
        ['remarkByLineCache.' + id]: remarkByLine,
        ['remarkExpandedByLineCache.' + id]: remarkExpandedByLine,
      });
    }).catch(function(e) {
      wx.showToast({ title: (e && e.message) || '加载详情失败', icon: 'none' });
      that.setData({ ['expandedIds.' + id]: false });
    }).finally(function() {
      wx.hideLoading();
    });
  },

  collapseOne(id) {
    this.setData({ ['expandedIds.' + id]: false });
  },

  onCollapseCard(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.collapseOne(id);
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

  /* ---- 导出相关 ---- */
  onOpenClaimExport(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ menuOpenId: null });
    const rows = (this.data.pendingRows || []).concat(this.data.doneRows || []);
    const row = rows.find((it) => it.id === id) || { id, applicantDisplay: '-' };
    this.setData({ linkPopupShow: true, linkClaim: row, exportClaimBusy: false });
  },

  onExportExcel(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ menuOpenId: null });
    const rows = (this.data.pendingRows || []).concat(this.data.doneRows || []);
    const row = rows.find((it) => it.id === id) || { id, applicantDisplay: '-' };
    this.setData({ linkClaim: row, exportClaimBusy: false }, () => {
      this.onExportClaimExcelFromPopup();
    });
  },

  /* ---- 明细行操作 ---- */
  toggleAllLines(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const detail = this.data.detailCache[id];
    const lines = detail && detail.lines ? detail.lines : [];
    if (!lines.length) return;
    const grantMap = this.data.grantMapCache[id] || {};
    const allChecked = lines.every((l) => !!grantMap[l.id]);
    const patch = {};
    lines.forEach((l) => { patch['grantMapCache.' + id + '.' + l.id] = !allChecked; });
    this.setData(patch);
  },

  goReviseInMall(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const d = this.data.detailCache[id];
    if (!d || d.status !== 'PENDING') return;
    wx.navigateTo({ url: `/package-feature/pages/supplies/index?reviseClaimId=${encodeURIComponent(id)}` });
    this.collapseOne(id);
  },

  onLineGrantChange(e) {
    const lineId = Number(e.currentTarget.dataset.id);
    const cardId = e.currentTarget.dataset.cardId;
    if (!lineId || !cardId) return;
    const checked = Array.isArray(e.detail.value) && e.detail.value.length > 0;
    const detail = this.data.detailCache[cardId];
    const line = (detail && detail.lines ? detail.lines : []).find((l) => Number(l.id) === lineId);
    const patch = { ['grantMapCache.' + cardId + '.' + lineId]: checked };
    if (checked && line) {
      const cur = this.data.fulfillQtyByLineCache[cardId] || {};
      if (cur[lineId] == null) {
        patch['fulfillQtyByLineCache.' + cardId + '.' + lineId] = line.qty != null ? line.qty : 1;
      }
    }
    this.setData(patch);
  },

  onFulfillQtyBlur(e) {
    const lineId = Number(e.currentTarget.dataset.id);
    const cardId = e.currentTarget.dataset.cardId;
    const max = Number(e.currentTarget.dataset.max) || 999;
    if (!lineId || !cardId) return;
    const raw = e.detail && e.detail.value != null ? e.detail.value : '';
    let v = parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(v) || v < 1) v = 1;
    if (v > max) v = max;
    this.setData({ ['fulfillQtyByLineCache.' + cardId + '.' + lineId]: v });
  },

  onRemarkBlur(e) {
    const lineId = Number(e.currentTarget.dataset.id);
    const cardId = e.currentTarget.dataset.cardId;
    if (!lineId || !cardId) return;
    this.setData({ ['remarkByLineCache.' + cardId + '.' + lineId]: e.detail.value || '' });
  },

  onToggleRemark(e) {
    const lineId = Number(e.currentTarget.dataset.id);
    const cardId = e.currentTarget.dataset.cardId;
    if (!lineId || !cardId) return;
    const cur = this.data.remarkExpandedByLineCache[cardId] || {};
    this.setData({ ['remarkExpandedByLineCache.' + cardId + '.' + lineId]: !cur[lineId] });
  },

  async confirmFulfill(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const d = this.data.detailCache[id];
    if (!d || d.status !== 'PENDING') return;
    const fulfillingIds = this.data.fulfillingIds || {};
    if (fulfillingIds[id]) return;
    this.setData({ ['fulfillingIds.' + id]: true });
    try {
      const grantMap = this.data.grantMapCache[id] || {};
      const fulfillQtyByLine = this.data.fulfillQtyByLineCache[id] || {};
      const remarkByLine = this.data.remarkByLineCache[id] || {};
      const lines = (d.lines || []).map((line) => {
        const grant = !!grantMap[line.id];
        const maxQ = line.qty != null ? Number(line.qty) : 0;
        let fq = Number(fulfillQtyByLine[line.id]);
        if (!Number.isFinite(fq) || fq < 1) fq = maxQ;
        if (fq > maxQ) fq = maxQ;
        const remark = (remarkByLine[line.id] || '').trim();
        return {
          lineId: line.id,
          grant,
          fulfillQty: grant ? fq : undefined,
          remark: remark || undefined,
        };
      });
      const res = await springAuth.springRequest({
        url: `/api/supplies/admin/claims/${encodeURIComponent(id)}/fulfill`,
        method: 'POST',
        data: { lines },
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      wx.showToast({ title: '已出库', icon: 'success' });
      this.collapseOne(id);
      await this.loadAll();
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '处理失败', icon: 'none' });
    } finally {
      this.setData({ ['fulfillingIds.' + id]: false });
    }
  },

  noop() {},

  /* ---- 导出弹窗 ---- */
  openClaimExportMini() {
    const claim = this.data.linkClaim;
    if (!claim || !claim.id) return;
    this.closeLinkPopup();
    wx.navigateTo({ url: `/package-feature/pages/suppliesClaimExport/index?claimId=${encodeURIComponent(claim.id)}` });
  },

  async onExportClaimExcelFromPopup() {
    const claim = this.data.linkClaim;
    if (!claim || !claim.id || this.data.exportClaimBusy) return;
    this.setData({ exportClaimBusy: true });
    wx.showLoading({ title: '导出中…', mask: true });
    try {
      const { base64 } = await suppliesExportApi.exportPersonalClaimExcel(claim.id);
      const fs = wx.getFileSystemManager();
      const path = `${wx.env.USER_DATA_PATH}/supply-claim-${claim.id.replace(/[^A-Za-z0-9_-]/g, '_')}.xlsx`;
      fs.writeFile({
        filePath: path,
        data: base64,
        encoding: 'base64',
        success: () => {
          wx.openDocument({ filePath: path, fileType: 'xlsx', showMenu: true });
        },
        fail: (err) => {
          wx.showToast({ title: (err && err.errMsg) || '写入失败', icon: 'none' });
        },
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '导出失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ exportClaimBusy: false, linkPopupShow: false });
    }
  },

  closeLinkPopup() {
    this.setData({ linkPopupShow: false, linkClaim: null, exportClaimBusy: false });
  },

  /* ---- 删除工单 ---- */
  onDeleteClaim(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ menuOpenId: null });
    wx.showModal({
      title: '删除工单',
      content: '确认删除该物资工单？删除后不可恢复。',
      confirmColor: '#ee0a24',
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const res = await springAuth.springRequest({
            url: `/api/supplies/admin/claims/${encodeURIComponent(id)}`,
            method: 'DELETE',
            data: {},
          });
          const p = parseResponse(res);
          if (!p.ok) throw new Error(p.message);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.collapseOne(id);
          await this.loadAll();
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },

  /* ---- 回收站操作 ---- */
  onRecycleCheckChange(e) {
    const id = String(e.currentTarget.dataset.id || '').trim();
    if (!id) return;
    const checked = Array.isArray(e.detail.value) && e.detail.value.length > 0;
    this.setData({ ['recycleSelected.' + id]: checked });
  },

  onRestoreRecycleCard(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    void this.doRestoreRecycle(id);
  },

  async doRestoreRecycle(id) {
    const res = await springAuth.springRequest({
      url: `/api/supplies/admin/claims/recycle/${encodeURIComponent(id)}/restore`,
      method: 'POST',
      data: {},
    });
    const p = parseResponse(res);
    if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
    wx.showToast({ title: '已恢复', icon: 'success' });
    this.collapseOne(id);
    await this.loadAll();
  },

  onPurgeRecycleOne(e) {
    const id = String(e.currentTarget.dataset.id || '').trim();
    if (!id) return;
    this.setData({ menuOpenId: null });
    wx.showModal({
      title: '彻底删除',
      content: '确认彻底删除该回收站工单？',
      confirmColor: '#ee0a24',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await springAuth.springRequest({
          url: `/api/supplies/admin/claims/recycle/${encodeURIComponent(id)}`,
          method: 'DELETE',
          data: {},
        });
        const p = parseResponse(res);
        if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
        wx.showToast({ title: '已删除', icon: 'success' });
        this.collapseOne(id);
        await this.loadAll();
      },
    });
  },

  onPurgeRecycleSelected() {
    const ids = Object.keys(this.data.recycleSelected || {})
      .filter((k) => this.data.recycleSelected[k])
      .map((k) => String(k).trim())
      .filter((s) => !!s);
    if (!ids.length) return wx.showToast({ title: '请先勾选', icon: 'none' });
    wx.showModal({
      title: '批量彻底删除',
      content: `确认删除 ${ids.length} 条回收站工单？`,
      confirmColor: '#ee0a24',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await springAuth.springRequest({
          url: '/api/supplies/admin/claims/recycle/purge',
          method: 'POST',
          data: { ids },
        });
        const p = parseResponse(res);
        if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
        wx.showToast({ title: '已彻底删除', icon: 'success' });
        await this.loadAll();
      },
    });
  },

  onPurgeRecycleAll() {
    wx.showModal({
      title: '清空回收站',
      content: '确认一键清空回收站？',
      confirmColor: '#ee0a24',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await springAuth.springRequest({
          url: '/api/supplies/admin/claims/recycle',
          method: 'DELETE',
          data: {},
        });
        const p = parseResponse(res);
        if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
        wx.showToast({ title: '已清空', icon: 'success' });
        await this.loadAll();
      },
    });
  },
});
