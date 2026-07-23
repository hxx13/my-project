const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const suppliesExportApi = require('../../utils/suppliesExportApi.js');

function parseResponse(res) {
  const { statusCode, data } = res;
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false };
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

Page({
  data: {
    pageGateOk: false,
    claimId: '',
    detail: null,
    loading: false,
    exportBusy: false,
  },

  onLoad(query) {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    const ok =
      hasMinRole(role, 'STAFF') && pagePermission.canAccessMiniPage('/package-feature/pages/suppliesClaimExport/index', role, 'STAFF');
    if (!ok) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    const id = (query && (query.claimId || query.id)) || '';
    if (!id) {
      wx.showToast({ title: '缺少单号', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    this.setData({ pageGateOk: true, claimId: id });
    this.loadDetail(id);
  },

  loadDetail(id) {
    this.setData({ loading: true });
    springAuth
      .springRequest({
        url: `/api/supplies/claims/${encodeURIComponent(id)}`,
        method: 'GET',
        data: {},
      })
      .then((res) => {
        const p = parseResponse(res);
        if (!p.ok) throw new Error(p.message);
        this.setData({ detail: p.body.data });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
        this.setData({ detail: null });
      })
      .finally(() => this.setData({ loading: false }));
  },

  async onExportExcel() {
    const id = this.data.claimId;
    if (!id || this.data.exportBusy) return;
    this.setData({ exportBusy: true });
    wx.showLoading({ title: '导出中…', mask: true });
    try {
      const { base64 } = await suppliesExportApi.exportPersonalClaimExcel(id);
      const fs = wx.getFileSystemManager();
      const path = `${wx.env.USER_DATA_PATH}/supply-claim-${id.replace(/[^A-Za-z0-9_-]/g, '_')}.xlsx`;
      fs.writeFile({
        filePath: path,
        data: base64,
        encoding: 'base64',
        success: () => {
          wx.openDocument({
            filePath: path,
            fileType: 'xlsx',
            showMenu: true,
          });
        },
        fail: (e) => {
          wx.showToast({ title: (e && e.errMsg) || '写入失败', icon: 'none' });
        },
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '导出失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ exportBusy: false });
    }
  },
});
