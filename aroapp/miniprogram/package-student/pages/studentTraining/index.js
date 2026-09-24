const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { hasMinRole, isStudentAccount } = require('../../../utils/roleAccess.js');
const personIdentity = require('../../../utils/personIdentity.js');
const api = require('../../utils/studentTrainingApi.js');

const PAGE_PATH = '/package-student/pages/studentTraining/index';
/** 培训计划管理（审核 / 评分 / 下放房间）——只有这场培训的所属人能进 */
const REVIEW_PAGE = '/package-feature/pages/trainingAdmin/review';

/** "yyyy-MM-dd HH:mm:ss" → "MM-dd HH:mm" */
function shortTime(s) {
  const raw = String(s || '').trim();
  if (raw.length < 16) return raw || '—';
  return `${raw.slice(5, 10)} ${raw.slice(11, 16)}`;
}

/** 当前登录账号 id（与 trainingAdmin 同口径） */
function currentUserId() {
  try {
    const raw = wx.getStorageSync(springAuth.KEYS.USER_INFO);
    const u = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return (u && u.id != null ? String(u.id) : '') || '';
  } catch (e) {
    return '';
  }
}

function mapTraining(t, opts) {
  const occs = t.occurrences || [];
  const first = occs[0] || null;
  const statusText = occs.reduce(function (acc, o) {
    const s = api.enrollStatus(!!o.enrolled, o.testYn, o.testFraction);
    if (s === '已通过') return '已通过';
    if (s === '已拒绝' && acc !== '已通过') return '已拒绝';
    if (s === '待审核' && acc === '未报名') return '待审核';
    return acc;
  }, '未报名');
  const act = api.enrollAction(first);
  const owners = t.ownerNames || t.ownerIds || [];
  const o = opts || {};
  // 能进管理页的两个条件都要：① 我是这场培训的所属人 ② 我有管理权（教职工视角 + 最高权限或饲养组长）
  const isOwner = !!o.uid && (t.ownerIds || []).indexOf(o.uid) >= 0;
  return {
    id: t.id,
    name: t.name || '未命名培训',
    typeName: t.typeName || '',
    campus: (t.campus || '').trim() || '其他',
    timeText: first ? shortTime(first.startTime) : '—',
    addressText: (first && first.address) || '—',
    ownerText: owners.length ? owners.join('、') : '—',
    statusText: statusText,
    tone: api.statusTone(statusText),
    act: act,
    occurrenceId: first ? first.id : null,
    enrollmentId: first ? first.enrollmentId : null,
    eligible: !!t.eligible,
    examPassed: !!t.examPassed,
    healthOk: !!t.healthOk,
    paperCount: (t.papers || []).length,
    mine: isOwner && !!o.canManage,
  };
}

/** 按校区分组，保持后端「校区 → 配置序号」的顺序 */
function groupByCampus(list) {
  const groups = [];
  const index = {};
  list.forEach(function (t) {
    const key = t.campus || '其他';
    if (index[key] == null) {
      index[key] = groups.length;
      groups.push({ name: key, items: [] });
    }
    groups[index[key]].items.push(t);
  });
  return groups;
}

function mapEnrollment(e) {
  const statusText = api.enrollStatus(true, e.testYn, e.testFraction);
  return {
    id: e.id,
    trainingName: e.trainingName || '—',
    timeText: shortTime(e.startTime),
    addressText: e.address || '—',
    statusText: statusText,
    tone: api.statusTone(statusText),
    cancellable: !api.isFullyPassed(e.testYn, e.testFraction),
  };
}

Page({
  data: {
    pageGateOk: false,
    tab: 'list',
    loading: false,
    campusTabs: [],
    activeCampus: '',
    visible: [],
    total: 0,
    myRows: [],
    myLoading: false,
    enrollShow: false,
    target: null,
    submitting: false,
  },

  onLoad() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    if (!token || !pagePermission.canAccessMiniPage(PAGE_PATH, role, 'STUDENT')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      this._accessDenied = true;
      wx.navigateBack({ delta: 1 });
      return;
    }
    this._uid = currentUserId();
    // 「管理」按钮的门与 trainingAdmin 同口径：教职工视角 +（最高权限 或 饲养组长）。
    // 身份码走接口、异步回来；列表若已经加载过就重拉一次，把 mine 标上
    personIdentity
      .fetchMyIdentityCodes()
      .then((codes) => {
        const r = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
        this._canManage = !isStudentAccount() &&
          (hasMinRole(r, 'SUPER_ADMIN') || !!codes[personIdentity.CODE_BREEDING_GROUP_LEADER]);
        if (this._shown) this.loadList();
      })
      .catch(function () {});
    this.setData({ pageGateOk: true });
  },

  onShow() {
    this._shown = true;
    if (this._accessDenied || !this.data.pageGateOk) return;
    this.loadList();
  },

  onPullDownRefresh() {
    const done = () => wx.stopPullDownRefresh();
    const task = this.data.tab === 'list' ? this.loadList() : this.loadMine();
    Promise.resolve(task).then(done, done);
  },

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    this.setData({ tab: tab });
    if (tab === 'mine') this.loadMine();
    else this.loadList();
  },

  loadList() {
    this.setData({ loading: true });
    const uid = this._uid;
    const canManage = !!this._canManage;
    return api
      .fetchMyTrainings()
      .then((list) => {
        const mapped = (list || []).map(function (t) {
          return mapTraining(t, { uid: uid, canManage: canManage });
        });
        const groups = groupByCampus(mapped);
        this._groups = groups;
        const tabs = groups.map(function (g) {
          return { name: g.name, count: g.items.length };
        });
        const keep = tabs.some((t) => t.name === this.data.activeCampus) ? this.data.activeCampus : '';
        const active = keep || (tabs[0] ? tabs[0].name : '');
        this.setData({
          campusTabs: tabs,
          activeCampus: active,
          visible: (groups.filter((g) => g.name === active)[0] || {}).items || [],
          total: mapped.length,
          loading: false,
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  /** 校区分区切换：只换 tab，不把各区堆成一列 */
  onCampusTab(e) {
    const name = e.currentTarget.dataset.name;
    if (!name || name === this.data.activeCampus) return;
    const g = (this._groups || []).filter((x) => x.name === name)[0];
    this.setData({ activeCampus: name, visible: (g && g.items) || [] });
  },

  loadMine() {
    this.setData({ myLoading: true });
    return api
      .fetchMyEnrollments()
      .then((list) => {
        this.setData({ myRows: (list || []).map(mapEnrollment), myLoading: false });
      })
      .catch((err) => {
        this.setData({ myLoading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  findTraining(id) {
    const groups = this._groups || [];
    for (let i = 0; i < groups.length; i++) {
      const hit = groups[i].items.filter((x) => String(x.id) === String(id))[0];
      if (hit) return hit;
    }
    return null;
  },

  onEnrollTap(e) {
    const target = this.findTraining(e.currentTarget.dataset.id);
    if (!target) return;
    this.setData({ target: target, enrollShow: true });
  },

  onEnrollClose() {
    if (this.data.submitting) return;
    this.setData({ enrollShow: false });
  },

  onConfirmEnroll() {
    const target = this.data.target;
    if (!target || !target.occurrenceId || this.data.submitting) return;
    this.setData({ submitting: true });
    api
      .enrollOccurrence(target.occurrenceId)
      .then(() => {
        this.setData({ submitting: false, enrollShow: false });
        wx.showToast({ title: '已报名', icon: 'success' });
        return this.loadList();
      })
      .catch((err) => {
        this.setData({ submitting: false });
        wx.showToast({ title: err.message || '报名失败', icon: 'none' });
      });
  },

  /** 取消报名（列表卡片 / 我的报名两处共用） */
  onCancelTap(e) {
    const id = e.currentTarget.dataset.eid;
    if (!id) return;
    wx.showModal({
      title: '取消报名',
      content: '确定取消该场次的报名吗？',
      confirmText: '取消报名',
      confirmColor: '#ee0a24',
      success: (res) => {
        if (!res.confirm) return;
        api
          .cancelEnrollment(id)
          .then(() => {
            wx.showToast({ title: '已取消', icon: 'success' });
            return this.data.tab === 'mine' ? this.loadMine() : this.loadList();
          })
          .catch((err) => wx.showToast({ title: err.message || '取消失败', icon: 'none' }));
      },
    });
  },

  /** 已通过的培训 → 看证书（带 enrollmentId，只列这一场的那对证书） */
  onViewCert(e) {
    const eid = e.currentTarget.dataset.eid;
    wx.navigateTo({
      url: '/package-student/pages/studentCertificate/index' + (eid ? '?enrollmentId=' + eid : ''),
    });
  },

  /**
   * 我是这场培训的所属人 → 进培训计划管理：学员审核/评分 + 给报名的学员下放房间权限。
   * 同一个 review 页也管这场培训的其它入口（培训计划列表里点进来的就是它）。
   */
  onManage(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: REVIEW_PAGE + '?id=' + id });
  },

  /** 门槛里的「健康调查表」：没提交就点进去填（题面与网页端同一份） */
  onGateHealth() {
    const t = this.data.target;
    if (t && t.healthOk) return;
    wx.navigateTo({ url: '/package-student/pages/studentHealthSurvey/index' });
  },

  /** 重新报名：被驳回的报名仍占着场次，先退再报 */
  onReapplyTap(e) {
    const target = this.findTraining(e.currentTarget.dataset.id);
    if (!target || !target.enrollmentId) return;
    wx.showModal({
      title: '重新报名',
      content: '将撤销上次报名并重新提交，确定继续吗？',
      confirmText: '重新报名',
      success: (res) => {
        if (!res.confirm) return;
        api
          .cancelEnrollment(target.enrollmentId)
          .then(() => api.enrollOccurrence(target.occurrenceId))
          .then(() => {
            wx.showToast({ title: '已重新报名', icon: 'success' });
            return this.loadList();
          })
          .catch((err) => wx.showToast({ title: err.message || '重新报名失败', icon: 'none' }));
      },
    });
  },
});
