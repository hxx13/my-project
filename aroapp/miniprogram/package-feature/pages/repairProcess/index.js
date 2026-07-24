const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const {
  uploadImages,
  previewImages,
  MAX_IMAGE_COUNT,
  shouldSkipReloadOnShow,
  resolveWorkorderRowsMedia,
} = require('../../utils/workorderMedia.js');
const notificationReadSync = require('../../utils/notificationReadSync.js');
const { refreshPendingBadges } = require('../../../utils/badgeSnapshotStore.js');

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

function statusText(v) {
  if (v === 'PENDING') return '待处理';
  if (v === 'PROCESSING') return '处理中';
  if (v === 'COMPLETED') return '已完成';
  return v || '-';
}

function toTextTime(v) {
  if (!v) return '-';
  return String(v).replace('T', ' ').slice(0, 19);
}

Page({
  onLoad(options) {
    const fid = options && options.focusId ? String(options.focusId) : '';
    this._focusOrderId = fid ? decodeURIComponent(fid) : '';
  },

  data: {
    statusFilter: 'PENDING',
    page: 1,
    size: 20,
    rows: [],
    loading: false,
    loadingMore: false,
    hasMore: true,
    showComplete: false,
    completingId: '',
    completeRemark: '',
    completeImages: [],
    recycleRows: [],
    recycleSelected: {},
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!hasMinRole(role, 'SUPER_ADMIN')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/repairProcess/index', role, 'SUPER_ADMIN')) return;
    if (shouldSkipReloadOnShow(this)) return;
    this.loadData({ reset: true, showLoading: true });
    this.loadRecycle();
  },

  onPullDownRefresh() {
    this.loadData({ reset: true }).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadData({ append: true });
  },

  onStatusFilter(e) {
    this.setData({ statusFilter: e.currentTarget.dataset.status || 'PENDING' }, () => this.loadData({ reset: true, showLoading: true }));
  },

  async loadData(options) {
    const opts = options || {};
    const reset = !!opts.reset;
    const append = !!opts.append;
    const showLoading = !!opts.showLoading;
    if (this.data.loading || this.data.loadingMore) return;
    if (append && !this.data.hasMore) return;
    const nextPage = reset ? 1 : (append ? this.data.page + 1 : this.data.page);
    if (showLoading) this.setData({ loading: true });
    if (append) this.setData({ loadingMore: true });
    try {
      const res = await springAuth.springRequest({
        url: '/api/repair/orders',
        method: 'GET',
        data: {
          page: nextPage,
          size: this.data.size,
          status: this.data.statusFilter || undefined,
          includePrivate: true,
        },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const payload = parsed.body.data || {};
      const list = Array.isArray(payload.data) ? payload.data : [];
      const total = Number(payload.total || 0);
      let mapped = await resolveWorkorderRowsMedia(
        list.map((r) => ({
          ...r,
          statusText: statusText(r.status),
          createTimeText: toTextTime(r.createTime),
          hasUnreadNotice: false,
        }))
      );
      try {
        const keys = mapped.map((r) => ({ bizType: 'REPAIR', bizId: r.id }));
        const flags = await notificationReadSync.fetchUnreadBizFlags(keys);
        mapped = mapped.map((r) => ({
          ...r,
          hasUnreadNotice: !!flags[notificationReadSync.toBizCompositeKey('REPAIR', r.id)],
        }));
      } catch (e) {
        /* ignore */
      }
      const rows = reset ? mapped : this.data.rows.concat(mapped);
      this.setData({
        rows,
        page: nextPage,
        hasMore: rows.length < total,
      });
    } catch (err) {
      wx.showToast({
        title: (err && err.message) ? String(err.message).slice(0, 18) : '加载失败',
        icon: 'none',
      });
    } finally {
      const done = {};
      if (showLoading) done.loading = false;
      if (append) done.loadingMore = false;
      this.setData(done);
    }
  },

  async loadRecycle() {
    try {
      const rRes = await springAuth.springRequest({
        url: '/api/repair/orders/recycle',
        method: 'GET',
        data: { page: 1, size: 200 },
      });
      const rp = parseResponse(rRes);
      if (rp.ok) {
        const payload = rp.body.data || {};
        const rows = Array.isArray(payload.data) ? payload.data : [];
        this.setData({ recycleRows: rows, recycleSelected: {} });
      } else {
        this.setData({ recycleRows: [], recycleSelected: {} });
      }
    } catch (e) {
      this.setData({ recycleRows: [], recycleSelected: {} });
    }
  },

  async markOrderRead(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showLoading({ title: '…', mask: true });
    try {
      const parsed = await notificationReadSync.markReadByBiz('REPAIR', id);
      if (!parsed.ok) throw new Error(parsed.message);
      const rows = (this.data.rows || []).map((r) =>
        String(r.id) === String(id) ? { ...r, hasUnreadNotice: false } : r
      );
      this.setData({ rows });
      void refreshPendingBadges({ force: true });
    } catch (err) {
      wx.showToast({
        title: (err && err.message) ? String(err.message).slice(0, 18) : '失败',
        icon: 'none',
      });
    } finally {
      wx.hideLoading();
    }
  },

  startOrder(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '确认接单',
      content: '接单后状态将变为处理中。',
      success: async (r) => {
        if (!r.confirm || this._orderMutating) return;
        this._orderMutating = true;
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const res = await springAuth.springRequest({
            url: `/api/repair/orders/${encodeURIComponent(id)}/start`,
            method: 'PATCH',
            data: {},
          });
          const parsed = parseResponse(res);
          if (!parsed.ok) throw new Error(parsed.message);
          wx.showToast({ title: '已接单', icon: 'success' });
          await this.loadData({ reset: true });
          await this.loadRecycle();
        } catch (err) {
          wx.showToast({
            title: (err && err.message) ? String(err.message).slice(0, 18) : '失败',
            icon: 'none',
          });
        } finally {
          wx.hideLoading();
          this._orderMutating = false;
        }
      },
    });
  },

  openCompletePopup(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ showComplete: true, completingId: id, completeRemark: '', completeImages: [] });
  },

  closeCompletePopup() {
    this.setData({ showComplete: false, completingId: '', completeRemark: '', completeImages: [] });
  },

  onCompleteRemarkInput(e) {
    this.setData({ completeRemark: e.detail.value });
  },

  async onChooseCompleteImages() {
    if (this._uploadingImages) return;
    this._uploadingImages = true;
    wx.showLoading({ title: '上传中…', mask: true });
    try {
      const completeImages = await uploadImages(this.data.completeImages, {
        maxCount: MAX_IMAGE_COUNT,
        cloudDir: 'workorders/repair',
      });
      this.setData({ completeImages });
    } catch (err) {
      wx.showToast({ title: (err && err.message) ? String(err.message).slice(0, 18) : '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this._uploadingImages = false;
    }
  },

  onRemoveCompleteImage(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    if (Number.isNaN(idx)) return;
    this.setData({ completeImages: this.data.completeImages.filter((_, i) => i !== idx) });
  },

  onPreviewCompleteImages(e) {
    previewImages(this.data.completeImages, e.currentTarget.dataset.url, this);
  },

  onPreviewCardImages(e) {
    previewImages(e.currentTarget.dataset.urls, e.currentTarget.dataset.url, this);
  },

  async completeOrder() {
    if (!this.data.completingId || this._orderMutating) return;
    this._orderMutating = true;
    wx.showLoading({ title: '处理中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/repair/orders/${encodeURIComponent(this.data.completingId)}/complete`,
        method: 'PATCH',
        data: {
          resultRemark: (this.data.completeRemark || '').trim(),
          resultImages: this.data.completeImages || [],
        },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      wx.showToast({ title: '已完成', icon: 'success' });
      this.closeCompletePopup();
      await this.loadData({ reset: true });
      await this.loadRecycle();
    } catch (err) {
      wx.showToast({
        title: (err && err.message) ? String(err.message).slice(0, 18) : '失败',
        icon: 'none',
      });
    } finally {
      wx.hideLoading();
      this._orderMutating = false;
    }
  },

  deleteOrder(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '删除工单',
      content: '确认删除该工单？删除后可在回收站恢复或彻底删除。',
      confirmColor: '#ee0a24',
      success: async (r) => {
        if (!r.confirm || this._orderMutating) return;
        this._orderMutating = true;
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const res = await springAuth.springRequest({
            url: `/api/repair/orders/${encodeURIComponent(id)}`,
            method: 'DELETE',
            data: {},
          });
          const parsed = parseResponse(res);
          if (!parsed.ok) throw new Error(parsed.message);
          wx.showToast({ title: '已删除', icon: 'success' });
          await this.loadData({ reset: true });
          await this.loadRecycle();
        } catch (err) {
          wx.showToast({
            title: (err && err.message) ? String(err.message).slice(0, 18) : '删除失败',
            icon: 'none',
          });
        } finally {
          wx.hideLoading();
          this._orderMutating = false;
        }
      },
    });
  },

  onToggleRecycleSelect(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const key = `recycleSelected.${id}`;
    const now = !!(this.data.recycleSelected && this.data.recycleSelected[id]);
    this.setData({ [key]: !now });
  },

  async onRestoreRecycle(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const res = await springAuth.springRequest({
      url: `/api/repair/orders/recycle/${encodeURIComponent(id)}/restore`,
      method: 'POST',
      data: {},
    });
    const p = parseResponse(res);
    if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
    wx.showToast({ title: '已恢复', icon: 'success' });
    await this.loadData({ reset: true });
    await this.loadRecycle();
  },

  onPurgeRecycleOne(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '彻底删除',
      content: '确认彻底删除该回收站工单？',
      confirmColor: '#ee0a24',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await springAuth.springRequest({
          url: `/api/repair/orders/recycle/${encodeURIComponent(id)}`,
          method: 'DELETE',
          data: {},
        });
        const p = parseResponse(res);
        if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
        wx.showToast({ title: '已删除', icon: 'success' });
        await this.loadRecycle();
      },
    });
  },

  onPurgeRecycleSelected() {
    const ids = Object.keys(this.data.recycleSelected || {}).filter((k) => this.data.recycleSelected[k]);
    if (!ids.length) return wx.showToast({ title: '请先勾选', icon: 'none' });
    wx.showModal({
      title: '批量彻底删除',
      content: `确认删除 ${ids.length} 条回收站工单？`,
      confirmColor: '#ee0a24',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await springAuth.springRequest({
          url: '/api/repair/orders/recycle/purge',
          method: 'POST',
          data: { ids },
        });
        const p = parseResponse(res);
        if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
        wx.showToast({ title: '已删除', icon: 'success' });
        await this.loadRecycle();
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
          url: '/api/repair/orders/recycle',
          method: 'DELETE',
          data: {},
        });
        const p = parseResponse(res);
        if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
        wx.showToast({ title: '已清空', icon: 'success' });
        await this.loadRecycle();
      },
    });
  },
});
