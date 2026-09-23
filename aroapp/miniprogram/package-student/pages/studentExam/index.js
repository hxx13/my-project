const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const api = require('../../utils/studentTrainingApi.js');

const PAGE_PATH = '/package-student/pages/studentExam/index';
const ANSWER_PAGE = '/package-student/pages/studentExamAnswer/index';

function fmtTime(s) {
  const raw = String(s || '').trim();
  return raw ? raw.replace('T', ' ').slice(0, 16) : '';
}

function toMs(s) {
  const raw = fmtTime(s);
  if (!raw) return null;
  // iOS 只认 "yyyy-MM-ddTHH:mm:ss"，不能直接喂 "yyyy-MM-dd HH:mm:ss"
  const t = new Date(`${raw.replace(' ', 'T')}:00`).getTime();
  return isNaN(t) ? null : t;
}

function validityText(p) {
  const from = fmtTime(p.validFrom);
  const to = fmtTime(p.validTo);
  if (!from && !to) return '不限';
  return `${from || '不限'} ~ ${to || '不限'}`;
}

function validityState(p) {
  const now = Date.now();
  const from = toMs(p.validFrom);
  const to = toMs(p.validTo);
  if (from != null && now < from) return 'before';
  if (to != null && now > to) return 'after';
  return 'open';
}

function mapPaper(p) {
  const submitted = !!p.submitted;
  const passed = submitted && p.qualifyYn === 1;
  const statusText = !submitted ? '未作答' : p.qualifyYn === 1 ? '合格' : '不合格';
  const vs = validityState(p);
  let hint = '';
  let actionText = '';
  if (passed) hint = '不可查看';
  else if (vs === 'before') hint = '未到开放时间';
  else if (vs === 'after') hint = '已过有效期';
  else actionText = submitted ? '重新作答' : '去答题';
  return {
    id: p.id,
    title: p.title || '未命名试卷',
    qualifyText: `及格 ${p.qualifyScore == null ? 80 : p.qualifyScore}`,
    timeLimitText: p.totalTime ? `${p.totalTime} 分钟` : '不限',
    validityText: validityText(p),
    statusText: statusText,
    tone: statusText === '合格' ? 'ok' : statusText === '不合格' ? 'danger' : 'muted',
    passed: passed,
    canAnswer: !!actionText,
    actionText: actionText,
    hint: hint,
  };
}

Page({
  data: {
    pageGateOk: false,
    loading: false,
    rows: [],
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

  load() {
    this.setData({ loading: true });
    return api
      .fetchMyExamPapers()
      .then((list) => {
        this.setData({ rows: (list || []).map(mapPaper), loading: false });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  onStartTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `${ANSWER_PAGE}?paperId=${id}` });
  },
});
