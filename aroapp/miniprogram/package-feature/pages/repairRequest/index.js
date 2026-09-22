const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const { fetchCapabilitySummaryMap } = require('../../utils/capabilitySummary.js');
const pagePermission = require('../../../utils/pagePermission.js');
const {
  uploadImages,
  previewImages,
  MAX_IMAGE_COUNT,
  shouldSkipReloadOnShow,
  resolveWorkorderRowsMedia,
} = require('../../utils/workorderMedia.js');
const { formatBackendDateTimeForDisplay } = require('../../utils/datetimeBeijing.js');
const { extractHttpUrls } = require('../../utils/workorderCardDetail.js');
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

Page({
  onLoad(options) {
    const fid = options && options.focusId ? String(options.focusId) : '';
    this._focusOrderId = fid ? decodeURIComponent(fid) : '';
  },

  data: {
    formExpanded: false,
    form: { location: '', content: '', isPublic: true, requestImages: [] },
    statusFilter: '',
    page: 1,
    size: 20,
    rows: [],
    loading: false,
    loadingMore: false,
    hasMore: true,
    /** 处理权限：决定卡片右上角是否出现接单/完成/删除，以及是否显示回收站 */
    canProcess: false,
    highlightId: '',
    scrollIntoViewId: '',
    detailShow: false,
    detailRow: null,
    detailLinkList: [],
    showComplete: false,
    completingId: '',
    completeRemark: '',
    completeImages: [],
    submitting: false,
    recycleRows: [],
    recycleSelected: {},
  },

  async onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!hasMinRole(role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/repairRequest/index', role, 'STAFF')) return;
    const cap = await fetchCapabilitySummaryMap({});
    const canProcess = !!(cap.REPAIR || {}).canProcess;
    this.setData({ canProcess });
    if (shouldSkipReloadOnShow(this)) return;
    this.loadData({ reset: true, showLoading: true });
    if (canProcess) this.loadRecycle();
  },

  onPullDownRefresh() {
    this.loadData({ reset: true }).finally(() => wx.stopPullDownRefresh());
  },

  onListReachBottom() {
    this.loadData({ append: true });
  },

  onLocationInput(e) {
    this.setData({ form: { ...this.data.form, location: e.detail.value } });
  },

  onContentInput(e) {
    this.setData({ form: { ...this.data.form, content: e.detail.value } });
  },

  onPublicChange(e) {
    this.setData({ form: { ...this.data.form, isPublic: !!e.detail.value } });
  },

  toggleForm() {
    this.setData({ formExpanded: !this.data.formExpanded });
  },

  togglePublic() {
    this.setData({ 'form.isPublic': !this.data.form.isPublic });
  },

  async onChooseRequestImages() {
    if (this._uploadingImages) return;
    this._uploadingImages = true;
    this._skipResumeReloadOnce = true; // 防止选图返回触发 onShow 刷新
    wx.showLoading({ title: '上传中…', mask: true });
    try {
      const requestImages = await uploadImages(this.data.form.requestImages, {
        maxCount: MAX_IMAGE_COUNT,
        cloudDir: 'workorders/repair',
      });
      this.setData({ form: { ...this.data.form, requestImages } });
    } catch (err) {
      wx.showToast({ title: (err && err.message) ? String(err.message).slice(0, 18) : '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this._uploadingImages = false;
    }
  },

  onRemoveRequestImage(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    if (Number.isNaN(idx)) return;
    const next = (this.data.form.requestImages || []).filter((_, i) => i !== idx);
    this.setData({ form: { ...this.data.form, requestImages: next } });
  },

  onPreviewRequestImages(e) {
    previewImages(this.data.form.requestImages, e.currentTarget.dataset.url, this);
  },

  onPreviewCardImages(e) {
    previewImages(e.currentTarget.dataset.urls, e.currentTarget.dataset.url, this);
  },

  onPreviewCompleteImages(e) {
    previewImages(this.data.completeImages, e.currentTarget.dataset.url, this);
  },

  onStatusFilter(e) {
    this.setData({ statusFilter: e.currentTarget.dataset.status || '' }, () => this.loadData({ reset: true, showLoading: true }));
  },

  async submit() {
    if (this._submitting) return;
    const location = (this.data.form.location || '').trim();
    const content = (this.data.form.content || '').trim();
    if (!location || !content) {
      wx.showToast({ title: '请填写地点和内容', icon: 'none' });
      return;
    }
    this._submitting = true;
    wx.showLoading({ title: '提交中…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: '/api/repair/orders',
        method: 'POST',
        data: {
          location,
          content,
          requestImages: this.data.form.requestImages || [],
          isPublic: !!this.data.form.isPublic,
        },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      wx.showToast({ title: '提交成功', icon: 'success' });
      this.setData({ form: { ...this.data.form, content: '', requestImages: [] } });
      await this.loadData({ reset: true });
      if (this.data.canProcess) await this.loadRecycle();
    } catch (err) {
      wx.showToast({
        title: (err && err.message) ? String(err.message).slice(0, 18) : '提交失败',
        icon: 'none',
      });
    } finally {
      wx.hideLoading();
      this._submitting = false;
    }
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
    const canProcess = this.data.canProcess;
    try {
      const res = await springAuth.springRequest({
        url: '/api/repair/orders',
        method: 'GET',
        data: {
          page: nextPage,
          size: this.data.size,
          status: this.data.statusFilter || undefined,
          includePrivate: canProcess,
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
          createTimeText: formatBackendDateTimeForDisplay(r.createTime),
          canWithdraw: r.status === 'PENDING',
          canStart: canProcess && r.status === 'PENDING',
          canComplete: canProcess && r.status === 'PROCESSING',
          canDelete: canProcess,
          hasUnreadNotice: false,
        }))
      );
      if (canProcess) {
        try {
          const keys = mapped.map((r) => ({ bizType: 'REPAIR', bizId: r.id }));
          const flags = await notificationReadSync.fetchUnreadBizFlags(keys);
          mapped = mapped.map((r) => ({
            ...r,
            hasUnreadNotice: !!flags[notificationReadSync.toBizCompositeKey('REPAIR', r.id)],
          }));
        } catch (e) {
          /* 未读标记失败不影响列表 */
        }
      }
      const rows = reset ? mapped : this.data.rows.concat(mapped);
      const done = { rows, page: nextPage, hasMore: rows.length < total };
      if (reset && this._focusOrderId) {
        const target = rows.find((r) => String(r.id) === this._focusOrderId);
        this._focusOrderId = '';
        if (target) {
          done.highlightId = target.id;
          done.scrollIntoViewId = `wo-${target.id}`;
        }
      }
      this.setData(done);
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
      const res = await springAuth.springRequest({
        url: '/api/repair/orders/recycle',
        method: 'GET',
        data: { page: 1, size: 200 },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const payload = parsed.body.data || {};
      this.setData({
        recycleRows: Array.isArray(payload.data) ? payload.data : [],
        recycleSelected: {},
      });
    } catch (e) {
      this.setData({ recycleRows: [], recycleSelected: {} });
    }
  },

  /* ---- 处理动作（原先在报修处理页，现直接落在卡片右上角） ---- */

  async markOrderRead(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showLoading({ title: '…', mask: true });
    try {
      const parsed = await notificationReadSync.markReadByBiz('REPAIR', id);
      if (!parsed.ok) throw new Error(parsed.message);
      this.setData({
        rows: (this.data.rows || []).map((r) =>
          String(r.id) === String(id) ? { ...r, hasUnreadNotice: false } : r
        ),
      });
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

  async completeOrder() {
    if (!this.data.completingId || this._orderMutating) return;
    this._orderMutating = true;
    this.setData({ submitting: true });
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
      this.setData({ submitting: false });
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
    const now = !!(this.data.recycleSelected && this.data.recycleSelected[id]);
    this.setData({ [`recycleSelected.${id}`]: !now });
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

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const row = (this.data.rows || []).find((x) => x.id === id);
    if (!row) return;
    this.setData({
      detailShow: true,
      detailRow: row,
      detailLinkList: extractHttpUrls(row.content || ''),
    });
  },

  closeDetail() {
    this.setData({ detailShow: false, detailRow: null, detailLinkList: [] });
  },

  copyDetailBody() {
    const row = this.data.detailRow;
    const c = row && row.content;
    if (!c) {
      wx.showToast({ title: '无内容', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: String(c),
      success: () => wx.showToast({ title: '已复制', icon: 'success' }),
    });
  },

  copyDetailLink(e) {
    const u = e.currentTarget.dataset.url;
    if (!u) return;
    wx.setClipboardData({
      data: String(u),
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' }),
    });
  },

  withdraw(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '确认撤回',
      content: '仅待处理状态支持撤回，确认继续？',
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const res = await springAuth.springRequest({
            url: `/api/repair/orders/${encodeURIComponent(id)}/withdraw`,
            method: 'POST',
            data: {},
          });
          const parsed = parseResponse(res);
          if (!parsed.ok) throw new Error(parsed.message);
          wx.showToast({ title: '已撤回', icon: 'success' });
          await this.loadData({ reset: true });
          if (this.data.canProcess) await this.loadRecycle();
        } catch (err) {
          wx.showToast({
            title: (err && err.message) ? String(err.message).slice(0, 18) : '操作失败',
            icon: 'none',
          });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },
});
