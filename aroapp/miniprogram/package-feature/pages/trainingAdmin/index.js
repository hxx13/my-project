const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const api = require('../../utils/trainingAdminApi.js');

const PAGE_PATH = '/package-feature/pages/trainingAdmin/index';
const EDIT_PAGE = '/package-feature/pages/trainingAdmin/edit';
const REVIEW_PAGE = '/package-feature/pages/trainingAdmin/review';

function currentUserId() {
  try {
    const raw = wx.getStorageSync(springAuth.KEYS.USER_INFO);
    const u = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return (u && u.id != null ? String(u.id) : '') || '';
  } catch (e) {
    return '';
  }
}

function isSuperRole(role) {
  const r = String(role || '').toUpperCase();
  return r === 'PLATFORM_OWNER' || r === 'SUPER_ADMIN';
}

Page({
  data: {
    pageGateOk: false,
    loading: false,
    keyword: '',
    campusTabs: [],
    activeCampus: '',
    list: [],
    visible: [],
    total: 0,
  },

  onLoad() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    if (!token || !pagePermission.canAccessMiniPage(PAGE_PATH, role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      this._accessDenied = true;
      wx.navigateBack({ delta: 1 });
      return;
    }
    this._role = role;
    this._uid = currentUserId();
    this.setData({ pageGateOk: true });
  },

  onShow() {
    if (this._accessDenied || !this.data.pageGateOk) return;
    this.load();
  },

  onPullDownRefresh() {
    const done = () => wx.stopPullDownRefresh();
    Promise.resolve(this.load()).then(done, done);
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
  },

  doSearch() {
    this.load();
  },

  load() {
    this.setData({ loading: true });
    const kw = (this.data.keyword || '').trim();
    return api
      .fetchTrainings({ page: 1, pageSize: 200, keyword: kw || undefined })
      .then((d) => {
        const role = this._role;
        const uid = this._uid;
        const list = ((d && d.list) || []).map((s) => {
          const owners = s.ownerNames || s.ownerIds || [];
          const canWrite = isSuperRole(role) || (s.ownerIds || []).indexOf(uid) >= 0;
          const published = s.status === 'PUBLISHED';
          return {
            id: s.id,
            name: s.name || '未命名培训',
            code: s.code || '',
            typeName: s.typeName || '',
            campus: (s.campus || '').trim() || '其他',
            ownersText: owners.length ? owners.join('、') : '未指定',
            statusText: published ? '已发布' : '草稿',
            published: published,
            canWrite: canWrite,
          };
        });
        const tabs = [];
        list.forEach((x) => {
          if (tabs.indexOf(x.campus) < 0) tabs.push(x.campus);
        });
        // 与后台排序配置一致：有校区的在前按字典序，「其他」放最后
        tabs.sort(function (a, b) {
          if (a === '其他') return 1;
          if (b === '其他') return -1;
          return a < b ? -1 : a > b ? 1 : 0;
        });
        const active = tabs.indexOf(this.data.activeCampus) >= 0 ? this.data.activeCampus : tabs[0] || '';
        this._all = list;
        this.setData({
          list: list,
          campusTabs: tabs,
          activeCampus: active,
          visible: list.filter((x) => x.campus === active),
          total: list.length,
          loading: false,
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  onCampusTab(e) {
    const name = e.currentTarget.dataset.name;
    if (name === this.data.activeCampus) return;
    this.setData({
      activeCampus: name,
      visible: (this._all || []).filter((x) => x.campus === name),
    });
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: EDIT_PAGE + (id ? '?id=' + id : '') });
  },

  goReview(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: REVIEW_PAGE + '?id=' + id });
  },

  onTogglePublish(e) {
    const id = e.currentTarget.dataset.id;
    const published = e.currentTarget.dataset.published === true || e.currentTarget.dataset.published === 'true';
    wx.showModal({
      title: published ? '取消发布' : '发布培训',
      content: published ? '取消后学生端将看不到该培训，确定吗？' : '发布后学生端即可报名，确定吗？',
      success: (res) => {
        if (!res.confirm) return;
        const op = published ? api.unpublishTraining(id) : api.publishTraining(id);
        op.then(() => {
          wx.showToast({ title: published ? '已取消发布' : '已发布', icon: 'success' });
          this.load();
        }).catch((err) => wx.showToast({ title: err.message || '操作失败', icon: 'none' }));
      },
    });
  },
});
