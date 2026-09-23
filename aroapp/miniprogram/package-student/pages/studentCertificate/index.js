const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const api = require('../../utils/studentTrainingApi.js');

const PAGE_PATH = '/package-student/pages/studentCertificate/index';

/** 我的证书：正文在服务端，这里只列条目；点预览下载 PDF 用系统能力打开。 */
Page({
  data: {
    pageGateOk: false,
    loading: false,
    rows: [],
    downloadingId: 0,
  },

  onLoad(options) {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    if (!token || !pagePermission.canAccessMiniPage(PAGE_PATH, role, 'STUDENT')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      this._accessDenied = true;
      wx.navigateBack({ delta: 1 });
      return;
    }
    // 从培训卡片进来时带上 enrollmentId：只显示那一场培训的证书
    this.enrollmentId = options && options.enrollmentId ? String(options.enrollmentId) : '';
    this.setData({ pageGateOk: true });
  },

  onShow() {
    if (this._accessDenied || !this.data.pageGateOk) return;
    if (this._loaded) return;
    this.load();
  },

  onPullDownRefresh() {
    const done = () => wx.stopPullDownRefresh();
    Promise.resolve(this.load()).then(done, done);
  },

  load() {
    this.setData({ loading: true });
    return api
      .fetchMyCertificates()
      .then((d) => {
        const templates = (d && d.templates) || [];
        const titleOf = (key) => {
          const hit = templates.filter((t) => t && t.key === key)[0];
          return hit ? hit.titleZh : '培训证书';
        };
        let list = (d && d.list) || [];
        if (this.enrollmentId) {
          list = list.filter((c) => String(c.enrollmentId) === this.enrollmentId);
        }
        this._loaded = true;
        this.setData({
          loading: false,
          rows: list.map((c) => ({
            id: c.id,
            title: titleOf(c.templateKey),
            personName: c.personName || '—',
            trainingDate: (c.trainingDate || '').slice(0, 10) || '—',
            trainerName: c.trainerName || '—',
            trainingName: c.trainingName || '',
          })),
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  /** 预览：后端出 PDF → 落到本地临时文件 → 用微信原生能力打开 */
  onPreview(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id || this._busy) return;
    this._busy = true;
    this.setData({ downloadingId: id });
    api
      .downloadCertificatePdf(id)
      .then((path) => {
        this._busy = false;
        this.setData({ downloadingId: 0 });
        api.openPdfFile(path);
      })
      .catch((err) => {
        this._busy = false;
        this.setData({ downloadingId: 0 });
        wx.showToast({ title: err.message || '下载失败', icon: 'none' });
      });
  },
});
