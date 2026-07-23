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
    showProcessLink: false,
    detailShow: false,
    detailRow: null,
    detailLinkList: [],
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
    const row = cap.REPAIR || {};
    this.setData({ showProcessLink: !!row.canProcess });
    if (shouldSkipReloadOnShow(this)) return;
    this.loadData({ reset: true, showLoading: true });
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
    let urls = e.currentTarget.dataset.urls;
    const url = e.currentTarget.dataset.url;
    if (!Array.isArray(urls) && this.data.detailRow && Array.isArray(this.data.detailRow.requestImages)) {
      urls = this.data.detailRow.requestImages;
    }
    previewImages(urls || [], url, this);
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
    try {
      const res = await springAuth.springRequest({
        url: '/api/repair/orders',
        method: 'GET',
        data: {
          page: nextPage,
          size: this.data.size,
          status: this.data.statusFilter || undefined,
          includePrivate: false,
        },
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const payload = parsed.body.data || {};
      const list = Array.isArray(payload.data) ? payload.data : [];
      const total = Number(payload.total || 0);
      const mapped = await resolveWorkorderRowsMedia(
        list.map((r) => ({
          ...r,
          statusText: statusText(r.status),
          createTimeText: formatBackendDateTimeForDisplay(r.createTime),
          canWithdraw: r.status === 'PENDING',
        }))
      );
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

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const row = (this.data.rows || []).find((x) => x.id === id);
    if (!row) return;
    const content = row.content || '';
    this.setData({
      detailShow: true,
      detailRow: row,
      detailLinkList: extractHttpUrls(content),
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

  goProcess() {
    if (!this.data.showProcessLink) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/repairProcess/index' });
  },
});
