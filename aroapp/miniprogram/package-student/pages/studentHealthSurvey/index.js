/**
 * 学生端「健康调查表」（整屏填写页）。
 *
 * 与网页端 frontend/src/features/health-survey 同一份题面、同一份存库结构，
 * 提交走同一个后端接口：GET/PUT /api/student/training/health-survey（PUT 的 body 是 { data }）。
 *
 * wxml 里不能调函数，所以每题的选中态在 JS 里**预先算成可渲染的模型**（model），
 * 结构一变就重建；纯文字输入不重建（只记在 _value 里），免得每敲一个字就 setData 一次。
 */
const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const S = require('../../utils/healthSurveySchema.js');

const PAGE_PATH = '/package-student/pages/studentHealthSurvey/index';
/** 本页路由（看门狗要用它判断自己有没有走掉） */
const PAGE_ROUTE = 'package-student/pages/studentHealthSurvey/index';

function asArray(v) { return Array.isArray(v) ? v : []; }
function asString(v) { return typeof v === 'string' ? v : ''; }
function asYesNo(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : { answer: '' }; }
function asGrid(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function asList(v) { return Array.isArray(v) ? v : []; }

/** 一道题 → 可渲染模型（带上 field.key，回调里直接用它回写） */
function buildField(f, raw) {
  const m = { kind: f.kind, key: f.key, label: f.label };
  switch (f.kind) {
    case 'checkboxes': {
      const cur = asArray(raw);
      m.opts = f.options.map(function (o) { return { label: o, on: cur.indexOf(o) >= 0 }; });
      break;
    }
    case 'radios': {
      const cur = asString(raw);
      m.opts = f.options.map(function (o) { return { label: o, on: cur === o }; });
      break;
    }
    case 'yesno': {
      const cur = asYesNo(raw);
      m.yesOn = cur.answer === '是';
      m.noOn = cur.answer === '否';
      m.detail = cur.detail || '';
      m.detailHint = f.detail || '';
      // 补充说明只在选了「是」且这题有 detail 时才出现（与网页端一致）
      m.showDetail = !!f.detail && cur.answer === '是';
      break;
    }
    case 'text':
    case 'textarea': {
      m.text = asString(raw);
      m.placeholder = f.placeholder || '';
      break;
    }
    case 'grid': {
      const g = asGrid(raw);
      m.head = [f.rowHeader].concat(f.columns);
      m.rows = f.rows.map(function (r) {
        const picked = asArray(g[r]);
        return {
          label: r,
          cells: f.columns.map(function (c) { return { label: c, on: picked.indexOf(c) >= 0 }; }),
        };
      });
      break;
    }
    case 'list': {
      const rows = asList(raw);
      m.cols = f.columns;
      m.rows = rows.map(function (row, ri) {
        return {
          ri: ri,
          cells: f.columns.map(function (c) { return { label: c, value: asString(row[c]) }; }),
        };
      });
      break;
    }
    default:
      break;
  }
  return m;
}

function buildModel(value) {
  return S.HEALTH_SURVEY.map(function (sec) {
    return {
      title: sec.title,
      fields: sec.fields.map(function (f) { return buildField(f, value[f.key]); }),
    };
  });
}

Page({
  data: {
    title: S.SURVEY_TITLE,
    declaration: S.SURVEY_DECLARATION,
    footer: S.SURVEY_FOOTER,
    model: [],
    loading: true,
    saving: false,
    submittedAt: '',
    pageGateOk: false,
  },

  onLoad() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    if (!token || !pagePermission.canAccessMiniPage(PAGE_PATH, role, 'STUDENT')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      this._denied = true;
      wx.navigateBack({ delta: 1 });
      return;
    }
    this._value = {};
    this.setData({ pageGateOk: true });
    this.load();
  },

  load() {
    this.setData({ loading: true });
    return springAuth
      .springRequest({ url: '/api/student/training/health-survey', method: 'GET', data: {} })
      .then((res) => {
        const body = (res && res.data) || {};
        if (body.success === false) throw new Error(body.message || '加载失败');
        const payload = body.data || null;
        this._value = (payload && payload.data) || {};
        this.setData({
          model: buildModel(this._value),
          submittedAt: (payload && payload.submittedAt) || '',
          loading: false,
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  /** 改完结构就整体重建模型（勾选/单选/表格），顺带把「是」的补充说明显隐算准 */
  rebuild() {
    this.setData({ model: buildModel(this._value) });
  },

  onToggleCheck(e) {
    const k = e.currentTarget.dataset.k;
    const o = e.currentTarget.dataset.o;
    const cur = asArray(this._value[k]);
    this._value[k] = cur.indexOf(o) >= 0
      ? cur.filter(function (x) { return x !== o; })
      : cur.concat([o]);
    this.rebuild();
  },

  onPickRadio(e) {
    const k = e.currentTarget.dataset.k;
    this._value[k] = e.currentTarget.dataset.o;
    this.rebuild();
  },

  onPickYesNo(e) {
    const k = e.currentTarget.dataset.k;
    const a = e.currentTarget.dataset.a;
    const cur = asYesNo(this._value[k]);
    this._value[k] = { answer: a, detail: cur.detail || '' };
    this.rebuild();
  },

  /** 纯文字：只记进 _value，不 setData —— 重建会把光标和输入法顶掉 */
  onText(e) {
    this._value[e.currentTarget.dataset.k] = e.detail.value;
  },

  onDetail(e) {
    const k = e.currentTarget.dataset.k;
    const cur = asYesNo(this._value[k]);
    this._value[k] = { answer: cur.answer, detail: e.detail.value };
  },

  onGridCell(e) {
    const k = e.currentTarget.dataset.k;
    const r = e.currentTarget.dataset.r;
    const c = e.currentTarget.dataset.c;
    const g = Object.assign({}, asGrid(this._value[k]));
    const picked = asArray(g[r]);
    g[r] = picked.indexOf(c) >= 0
      ? picked.filter(function (x) { return x !== c; })
      : picked.concat([c]);
    this._value[k] = g;
    this.rebuild();
  },

  onListInput(e) {
    const ds = e.currentTarget.dataset;
    const rows = asList(this._value[ds.k]).map(function (r) { return Object.assign({}, r); });
    if (!rows[ds.i]) return;
    rows[ds.i][ds.c] = e.detail.value;
    this._value[ds.k] = rows;
  },

  onListAdd(e) {
    const k = e.currentTarget.dataset.k;
    const field = this._fieldOf(k);
    const cols = (field && field.columns) || [];
    const blank = {};
    cols.forEach(function (c) { blank[c] = ''; });
    this._value[k] = asList(this._value[k]).concat([blank]);
    this.rebuild();
  },

  onListDel(e) {
    const ds = e.currentTarget.dataset;
    this._value[ds.k] = asList(this._value[ds.k]).filter(function (_, i) { return i !== ds.i; });
    this.rebuild();
  },

  /** 按 key 找回题目定义（新增行要知道有哪些列） */
  _fieldOf(key) {
    for (let i = 0; i < S.HEALTH_SURVEY.length; i++) {
      const fs = S.HEALTH_SURVEY[i].fields;
      for (let j = 0; j < fs.length; j++) {
        if (fs[j].key === key) return fs[j];
      }
    }
    return null;
  },

  onSubmit() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    wx.showLoading({ title: '提交中', mask: true });
    springAuth
      .springRequest({
        url: '/api/student/training/health-survey',
        method: 'PUT',
        data: { data: this._value },
      })
      .then((res) => {
        const body = (res && res.data) || {};
        // 写请求必须看 success：HTTP 200 + success:false 也是失败
        if (!body.success) throw new Error(body.message || '提交失败');
        wx.hideLoading();
        this.setData({ saving: false, submittedAt: this._now() });
        wx.showToast({ title: '已提交', icon: 'success' });
        // 提交即离开（与网页端一致）：退回调用它的那一页 —— 培训报名的门槛会 onShow 重拉，
        // 那一行随即变成「已提交」
        this.leave(900);
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ saving: false });
        wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
      });
  },

  /**
   * 离开本页。页面栈里没有上一页时 navigateBack 会**静默**失败，
   * 那时按钮会一直停在「提交中…」把人锁死；所以兜底 reLaunch，再加个看门狗。
   */
  leave(delay) {
    setTimeout(() => {
      wx.navigateBack({
        delta: 1,
        fail: () => wx.reLaunch({ url: '/pages/mine/index' }),
      });
      setTimeout(() => {
        const pages = getCurrentPages();
        const top = pages[pages.length - 1];
        if (top && top.route === PAGE_ROUTE) {
          if (this.data.saving) this.setData({ saving: false });
          wx.reLaunch({ url: '/pages/mine/index' });
        }
      }, 600);
    }, delay || 0);
  },

  _now() {
    const d = new Date();
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },
});
