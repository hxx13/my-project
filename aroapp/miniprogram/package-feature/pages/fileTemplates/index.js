const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const fileTemplatesApi = require('../../utils/fileTemplatesApi.js');

function formatSize(n) {
  const x = Number(n) || 0;
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  return `${(x / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(iso) {
  if (!iso) return '';
  return String(iso).replace('T', ' ').slice(0, 19);
}

function mapApiRowToListRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: String(row.id || ''),
    originalName: String(row.originalName || row.original_name || '未命名'),
    sizeText: formatSize(row.sizeBytes != null ? row.sizeBytes : row.size_bytes),
    timeText: formatTime(row.createTime || row.create_time),
  };
}

Page({
  data: {
    loading: true,
    rows: [],
    schemaHint: '',
    uploadLoading: false,
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/fileTemplates/index', role, 'STAFF')) return;
    void this.loadList();
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const r = await fileTemplatesApi.fetchFileTemplates();
      if (!r.ok) throw new Error(r.message || '加载失败');
      const rows = (r.rows || []).map((row) => mapApiRowToListRow(row)).filter(Boolean);
      this.setData({
        rows,
        schemaHint: r.schemaHint || '',
        loading: false,
      });
    } catch (e) {
      this.setData({ rows: [], loading: false, schemaHint: '' });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },

  onChooseUpload() {
    if (this.data.uploadLoading) return;
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0];
        if (!f || !f.path) return;
        void this.runUpload(f.path, { fileName: f.name || `file_${Date.now()}`, mimeType: f.type || 'application/octet-stream' });
      },
    });
  },

  async runUpload(tempFilePath, meta) {
    this.setData({ uploadLoading: true });
    wx.showLoading({ title: '上传中…' });
    try {
      const data = await fileTemplatesApi.uploadFileTemplate(tempFilePath, meta);
      const newRow = mapApiRowToListRow(data);
      if (!newRow || !newRow.id) throw new Error('上传返回数据无效');
      /** 上传成功仅插入新行到列表顶部，禁止整表 load — post-save-no-full-refresh.mdc */
      const rows = [newRow, ...(this.data.rows || []).filter((r) => r.id !== newRow.id)];
      this.setData({ rows, uploadLoading: false });
      wx.hideLoading();
      wx.showToast({ title: '已上传', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      this.setData({ uploadLoading: false });
      wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' });
    }
  },

  onDownloadRow(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || 'template';
    if (!id) return;
    const label = String(name || '该文件').trim() || '该文件';
    wx.showModal({
      title: '下载文件',
      content: `确定下载「${label}」吗？`,
      confirmText: '下载',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        void this.runDownloadAfterConfirm(id, name);
      },
    });
  },

  async runDownloadAfterConfirm(id, name) {
    wx.showLoading({ title: '下载中…' });
    try {
      const path = await fileTemplatesApi.downloadTemplateToTempFile(id, name);
      wx.hideLoading();
      wx.openDocument({
        filePath: path,
        showMenu: true,
        fail(err) {
          wx.showToast({ title: (err && err.errMsg) || '无法打开', icon: 'none' });
        },
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '下载失败', icon: 'none' });
    }
  },
});
