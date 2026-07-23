const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { shouldRefreshOnShow } = require('../../../utils/pageShowRefresh.js');
const assetApi = require('../../utils/assetApi.js');

function toTextTime(v) {
  if (!v) return '';
  return String(v).replace('T', ' ').slice(0, 19);
}

function toDownloadUrl(row) {
  if (!row) return '';
  const url = String(row.downloadUrl || '').trim();
  if (/^https?:\/\//i.test(url)) return url;
  const path = String(row.downloadPath || '').trim();
  return springAuth.toAbsoluteMediaUrl(url || path);
}

function normalizeColumnLabel(label) {
  const text = String(label || '').trim();
  return text; // 不再把"存放地点N"映射为"当前存放地点"
}

function pickCurrentLocationColumn(columns) {
  const list = Array.isArray(columns) ? columns : [];
  for (let i = 0; i < list.length; i += 1) {
    const col = list[i] || {};
    const raw = String(col.columnLabel || '').trim();
    if (/^存放地点\d+$/i.test(raw)) return col;
  }
  for (let i = 0; i < list.length; i += 1) {
    const col = list[i] || {};
    const raw = String(col.columnLabel || '').trim();
    if (raw.includes('存放地点')) return col;
  }
  for (let i = 0; i < list.length; i += 1) {
    const col = list[i] || {};
    const raw = String(col.columnLabel || '').trim();
    if (raw.includes('当前位置')) return col;
  }
  return null;
}

function pickSpecModelColumn(columns) {
  const list = Array.isArray(columns) ? columns : [];
  for (let i = 0; i < list.length; i += 1) {
    const col = list[i] || {};
    const label = String(col.columnLabel || '').trim();
    if (label.includes('规格型号')) return col;
  }
  for (let i = 0; i < list.length; i += 1) {
    const col = list[i] || {};
    const label = String(col.columnLabel || '').trim();
    if (label.includes('型号')) return col;
  }
  return null;
}

function pickUserColumn(columns) {
  const list = Array.isArray(columns) ? columns : [];
  for (let i = 0; i < list.length; i += 1) {
    const col = list[i] || {};
    const label = String(col.columnLabel || '').trim();
    if (label === '使用人') return col;
  }
  for (let i = 0; i < list.length; i += 1) {
    const col = list[i] || {};
    const label = String(col.columnLabel || '').trim();
    if (label.includes('使用人') && !label.includes('工号')) return col;
  }
  return null;
}

function parsePhotoUrlField(v) {
  if (v == null) return [];
  if (Array.isArray(v)) {
    return v.map((x) => String(x || '').trim()).filter(Boolean);
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return [];
    try {
      const j = JSON.parse(s);
      return Array.isArray(j) ? j.map((x) => String(x || '').trim()).filter(Boolean) : [];
    } catch (e) {
      return [s];
    }
  }
  return [];
}

function transferStatusText(s) {
  if (s === 'IN_PROGRESS') return '进行中';
  if (s === 'COMPLETED') return '转移完毕';
  if (s === 'SUBMITTED') return '转移完毕';
  if (s === 'WITHDRAWN') return '已撤回';
  return s ? String(s) : '-';
}

function toDetailRows(assetRow, columns) {
  const list = [];
  if (!assetRow) return list;
  const dynamic = assetRow.dynamicValues || {};
  const defs = Array.isArray(columns) ? columns : [];
  for (let i = 0; i < defs.length; i += 1) {
    const col = defs[i] || {};
    const key = col.columnKey;
    if (!key) continue;
    const val = dynamic[key];
    if (val == null || String(val).trim() === '') continue;
    list.push({
      key: key,
      label: normalizeColumnLabel(col.columnLabel || ''),
      value: String(val),
    });
  }
  return list;
}

function pickTransferImages(count) {
  const maxCount = Math.max(1, Number(count) || 1);
  if (wx.chooseMedia) {
    return wx.chooseMedia({
      count: maxCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
    }).then((res) => {
      const files = (res && res.tempFiles) || [];
      return files.map((f) => f.tempFilePath || f.path).filter(Boolean);
    });
  }
  return new Promise((resolve, reject) => {
    wx.chooseImage({
      count: maxCount,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        resolve((res && res.tempFilePaths) || []);
      },
      fail(err) {
        reject(err || new Error('选择图片失败'));
      },
    });
  });
}

function decorateRows(rows) {
  return (rows || []).map((r) => ({
    ...r,
    transferTime: r.transferTime != null && String(r.transferTime).trim() !== '' ? r.transferTime : r.transfer_time,
    createTime: r.createTime != null && String(r.createTime).trim() !== '' ? r.createTime : r.create_time,
    fromLocation: r.fromLocation != null ? r.fromLocation : r.from_location,
    beforeListRaw: parsePhotoUrlField(r.photoUrlsBefore),
    afterListRaw: parsePhotoUrlField(r.photoUrlsAfter),
    beforeList: parsePhotoUrlField(r.photoUrlsBefore).map((u) => springAuth.toAbsoluteMediaUrl(u)).filter(Boolean),
    afterList: parsePhotoUrlField(r.photoUrlsAfter).map((u) => springAuth.toAbsoluteMediaUrl(u)).filter(Boolean),
    statusLabel: transferStatusText(r.status),
    summaryLocation: '-',
    summaryUser: '-',
    summaryModel: '-',
    summaryLoading: true,
  })).map((r) => ({
    ...r,
    // 兼容旧数据：若 raw 为空且有 legacy photoUrl 字段，则兜底一张
    beforeListRaw: (r.beforeListRaw && r.beforeListRaw.length) ? r.beforeListRaw : (r.photoUrl ? [String(r.photoUrl).trim()] : []),
    beforeList: (r.beforeList && r.beforeList.length) ? r.beforeList : (r.photoUrl ? [springAuth.toAbsoluteMediaUrl(String(r.photoUrl).trim())] : []),
  }));
}

Page({
  data: {
    loading: false,
    rows: [],
    page: 1,
    size: 20,
    total: 0,
    keyword: '',
    appliedKeyword: '',
    showContinuePanel: false,
    continueRecord: null,
    uploadingContinue: false,
    canDeleteTransfer: false,
    listBusy: false,
    totalPages: 1,
    showAssetDetailPopup: false,
    assetDetailLoading: false,
    assetDetailTransfer: null,
    assetDetailAsset: null,
    assetDetailLocation: '',
    assetDetailRows: [],
    deletingAfterPhoto: false,
    showPdfPopup: false,
    pdfRecord: null,
    pdfLinks: [],
    pdfLoading: false,
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/assetTransferRecord/index', role, 'STAFF')) return;
    this.setData({ canDeleteTransfer: hasMinRole(role, 'ADMIN') });
    const sceneKey = [role || '', String(this.data.page || 1), (this.data.appliedKeyword || '').trim()].join('|');
    if (!shouldRefreshOnShow(this, { sceneKey, ttlMs: 15000 })) return;
    this.loadData();
  },

  onPullDownRefresh() {
    this.setData({ page: 1 }, () => this.loadData().finally(() => wx.stopPullDownRefresh()));
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value || '' });
  },

  applySearch() {
    this.setData({ appliedKeyword: (this.data.keyword || '').trim(), page: 1 }, () => this.loadData());
  },

  prevPage() {
    if (this.data.page <= 1 || this.data.loading) return;
    this.setData({ page: this.data.page - 1 }, () => this.loadData());
  },

  nextPage() {
    const maxPage = Math.max(1, Math.ceil(this.data.total / this.data.size));
    if (this.data.page >= maxPage || this.data.loading) return;
    this.setData({ page: this.data.page + 1 }, () => this.loadData());
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const data = await assetApi.fetchTransferRecords({
        page: this.data.page,
        size: this.data.size,
        keyword: this.data.appliedKeyword || undefined,
      });
      const rows = decorateRows(data.rows || []);
      const total = Number(data.total || 0);
      const totalPages = Math.max(1, Math.ceil(total / this.data.size));
      this.setData({
        rows,
        total,
        totalPages,
      });
      this.hydrateAssetSummary(rows);
      const cr = this.data.continueRecord;
      if (cr && cr.id) {
        const updated = rows.find((x) => x.id === cr.id);
        if (updated) this.setData({ continueRecord: updated });
      }
    } catch (e) {
      wx.showToast({ title: e && e.message ? String(e.message).slice(0, 18) : '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async hydrateAssetSummary(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return;
    const merged = [...list];
    for (let i = 0; i < merged.length; i += 1) {
      const row = merged[i];
      try {
        const data = await assetApi.fetchAssetRecords({
          page: 1,
          size: 1,
          assetId: row.assetId,
        });
        const cols = (data && data.columns) || [];
        const assets = (data && data.rows) || [];
        const target =
          assets.find((x) => x && row.assetId && x.id === row.assetId) ||
          assets.find((x) => x && x.assetCode === row.assetCode) ||
          null;
        if (!target) {
          merged[i] = { ...merged[i], summaryLoading: false };
          continue;
        }
        const locationCol = pickCurrentLocationColumn(cols);
        const userCol = pickUserColumn(cols);
        const modelCol = pickSpecModelColumn(cols);
        const dv = target.dynamicValues || {};
        merged[i] = {
          ...merged[i],
          summaryLocation: (locationCol && dv[locationCol.columnKey]) || target.location || '-',
          summaryUser: (userCol && dv[userCol.columnKey]) || '-',
          summaryModel: (modelCol && dv[modelCol.columnKey]) || '-',
          summaryLoading: false,
        };
      } catch (e) {
        merged[i] = { ...merged[i], summaryLoading: false };
      }
    }
    this.setData({ rows: merged });
  },

  openContinuePanel(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((x) => x.id === id) || null;
    if (!row || row.status !== 'IN_PROGRESS') return;
    this.setData({ showContinuePanel: true, continueRecord: row });
  },

  closeContinuePanel() {
    this.setData({ showContinuePanel: false, continueRecord: null, uploadingContinue: false, deletingAfterPhoto: false });
  },

  async openPdfPopup(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((x) => x.id === id) || null;
    if (!row) return;
    this.setData({
      showPdfPopup: true,
      pdfRecord: row,
      pdfLinks: [],
      pdfLoading: true,
    });
    try {
      const data = await assetApi.listTransferPdfLinks(row.id);
      this.setData({ pdfLinks: (data && data.links) || [] });
    } catch (err) {
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '链接加载失败', icon: 'none' });
    } finally {
      this.setData({ pdfLoading: false });
    }
  },

  closePdfPopup() {
    this.setData({
      showPdfPopup: false,
      pdfRecord: null,
      pdfLinks: [],
      pdfLoading: false,
    });
  },

  async getPdfLink() {
    const row = this.data.pdfRecord;
    if (!row || !row.id || this.data.pdfLoading) return;
    this.setData({ pdfLoading: true });
    wx.showLoading({ title: '生成中…', mask: true });
    try {
      const created = await assetApi.createOrReuseTransferPdfLink(row.id);
      const linksRes = await assetApi.listTransferPdfLinks(row.id);
      this.setData({ pdfLinks: (linksRes && linksRes.links) || [] });
      const link = toDownloadUrl(created);
      if (link) {
        wx.setClipboardData({ data: link });
      } else {
        wx.showToast({ title: created && created.reused ? '已复用链接' : '已生成链接', icon: 'success' });
      }
    } catch (err) {
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '获取失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ pdfLoading: false });
    }
  },

  copyPdfLink(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const item = (this.data.pdfLinks || [])[idx];
    const link = toDownloadUrl(item);
    if (!link) {
      wx.showToast({ title: '链接无效', icon: 'none' });
      return;
    }
    wx.setClipboardData({ data: link });
  },

  async openAssetDetail(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.rows || []).find((x) => x.id === id) || null;
    if (!row) return;
    this.setData({
      showAssetDetailPopup: true,
      assetDetailLoading: true,
      assetDetailTransfer: row,
      assetDetailAsset: null,
      assetDetailLocation: '',
      assetDetailRows: [],
    });
    try {
      const data = await assetApi.fetchAssetRecords({
        page: 1,
        size: 1,
        assetId: row.assetId,
      });
      const cols = (data && data.columns) || [];
      const records = Array.isArray(data && data.rows) ? data.rows : [];
      const target =
        records.find((x) => x && row.assetId && x.id === row.assetId) ||
        records[0] ||
        null;
      const locCol = pickCurrentLocationColumn(cols);
      const dv = (target && target.dynamicValues) || {};
      const detailLoc =
        (locCol && locCol.columnKey && dv[locCol.columnKey] && String(dv[locCol.columnKey]).trim() !== '')
          ? String(dv[locCol.columnKey])
          : (target && target.location && String(target.location).trim() !== '' ? String(target.location) : '-');
      this.setData({
        assetDetailAsset: target,
        assetDetailLocation: detailLoc,
        assetDetailRows: toDetailRows(target, cols),
      });
    } catch (err) {
      wx.showToast({
        title: err && err.message ? String(err.message).slice(0, 18) : '加载详情失败',
        icon: 'none',
      });
    } finally {
      this.setData({ assetDetailLoading: false });
    }
  },

  closeAssetDetailPopup() {
    this.setData({
      showAssetDetailPopup: false,
      assetDetailLoading: false,
      assetDetailTransfer: null,
      assetDetailAsset: null,
      assetDetailLocation: '',
      assetDetailRows: [],
    });
  },

  noop() {},

  previewListPhoto(e) {
    const rindex = Number(e.currentTarget.dataset.rindex);
    const ix = Number(e.currentTarget.dataset.ix || 0);
    const kind = (e.currentTarget.dataset.kind || 'after') === 'before' ? 'beforeList' : 'afterList';
    const row = (this.data.rows || [])[rindex];
    const urls = row && row[kind] ? row[kind] : [];
    if (!urls.length) return;
    wx.previewImage({ urls, current: urls[ix] || urls[0] });
  },

  previewContinuePhoto(e) {
    const ix = Number(e.currentTarget.dataset.cix || 0);
    const rec = this.data.continueRecord;
    const urls = rec && rec.afterList ? rec.afterList : [];
    if (!urls.length) return;
    wx.previewImage({ urls, current: urls[ix] || urls[0] });
  },

  async pickContinuePhotos() {
    if (!this.data.continueRecord || !this.data.continueRecord.id) return;
    if (this.data.uploadingContinue) return;
    this.setData({ uploadingContinue: true });
    try {
      const files = await pickTransferImages(9);
      if (!files || !files.length) return;
      for (let i = 0; i < files.length; i += 1) {
        const path = files[i];
        if (!path) continue;
        // 上传至云存储 → 同步到后端 → 拿到 publicUrl 再存入业务表（对齐双端图片互通规范）
        const fileID = await springAuth.uploadCloudMediaFile(path, 'asset-transfer/after');
        if (fileID) {
          let publicUrl = fileID;
          try {
            const syncRes = await wx.cloud.callFunction({ name: 'syncToBackend', data: { wechatFileID: fileID, mimeType: 'image/jpeg' } });
            publicUrl = (syncRes && syncRes.result && syncRes.result.publicUrl)
              ? String(syncRes.result.publicUrl).trim()
              : fileID;
          } catch (_syncErr) {
            /* 同步失败时仍用 cloud:// 兜底 */
          }
          await assetApi.appendTransferAfterPhotos(this.data.continueRecord.id, [publicUrl]);
        }
      }
      await this.loadData();
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err && err.message ? String(err.message).slice(0, 18) : '上传失败', icon: 'none' });
    } finally {
      this.setData({ uploadingContinue: false });
    }
  },

  removeContinuePhoto(e) {
    const idx = Number(e.currentTarget.dataset.cix);
    if (Number.isNaN(idx) || idx < 0) return;
    const rec = this.data.continueRecord;
    const urlsRaw = (rec && rec.afterListRaw) ? rec.afterListRaw : [];
    const target = urlsRaw[idx];
    if (!rec || !rec.id || !target || this.data.deletingAfterPhoto) return;
    wx.showModal({
      title: '删除照片',
      content: '确认删除这张转移后照片？',
      confirmColor: '#b91c1c',
      success: async (r) => {
        if (!r.confirm) return;
        this.setData({ deletingAfterPhoto: true });
        wx.showLoading({ title: '删除中…', mask: true });
        try {
          await assetApi.removeTransferAfterPhoto(rec.id, target);
          await this.loadData();
          const latest = (this.data.rows || []).find((x) => x.id === rec.id);
          if (latest) {
            this.setData({ continueRecord: latest });
          }
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          wx.showToast({
            title: err && err.message ? String(err.message).slice(0, 18) : '删除失败',
            icon: 'none',
          });
        } finally {
          wx.hideLoading();
          this.setData({ deletingAfterPhoto: false });
        }
      },
    });
  },

  tapWithdraw(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || this.data.listBusy) return;
    wx.showModal({
      title: '撤回申请',
      content: '确认撤回？资产将解锁，本条记录标记为已撤回。',
      success: async (r) => {
        if (!r.confirm) return;
        this.setData({ listBusy: true });
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          await assetApi.withdrawTransferRequest(id);
          wx.showToast({ title: '已撤回', icon: 'success' });
          if (this.data.continueRecord && this.data.continueRecord.id === id) {
            this.closeContinuePanel();
          }
          await this.loadData();
        } catch (err) {
          wx.showToast({
            title: err && err.message ? String(err.message).slice(0, 18) : '失败',
            icon: 'none',
          });
        } finally {
          wx.hideLoading();
          this.setData({ listBusy: false });
        }
      },
    });
  },

  tapDeleteRecord(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || !this.data.canDeleteTransfer || this.data.listBusy) return;
    wx.showModal({
      title: '删除转移记录',
      content: '管理员删除后不可恢复。若该条为已完成且系统保存了转移前所在地，将尝试还原资产地点；否则不自动回滚地点。',
      confirmColor: '#b91c1c',
      success: async (r) => {
        if (!r.confirm) return;
        this.setData({ listBusy: true });
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          await assetApi.deleteTransferRecordAdmin(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          if (this.data.continueRecord && this.data.continueRecord.id === id) {
            this.closeContinuePanel();
          }
          await this.loadData();
        } catch (err) {
          wx.showToast({
            title: err && err.message ? String(err.message).slice(0, 18) : '失败',
            icon: 'none',
          });
        } finally {
          wx.hideLoading();
          this.setData({ listBusy: false });
        }
      },
    });
  },

  async confirmTransferComplete() {
    const rec = this.data.continueRecord;
    if (!rec || !rec.id) return;
    const after = rec.afterList || [];
    if (!after.length) {
      wx.showToast({ title: '请先上传转移后照片', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '处理中…', mask: true });
    try {
      await assetApi.completeTransferRequest(rec.id);
      wx.showToast({ title: '已确认转移完毕', icon: 'success' });
      this.closeContinuePanel();
      await this.loadData();
    } catch (e) {
      wx.showToast({ title: e && e.message ? String(e.message).slice(0, 18) : '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  pdfExpireText(v) {
    return toTextTime(v) || '-';
  },
});
