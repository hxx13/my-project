const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const api = require('../../utils/studentTrainingApi.js');

const PAGE_PATH = '/package-student/pages/studentExamAnswer/index';

/** 后端字段 → 渲染用的题目模型（本次只做选择题） */
function buildSections(paper) {
  const sections = [];
  let index = 0;
  let unsupported = 0;
  (paper.sections || []).forEach(function (sec) {
    const questions = [];
    (sec.fields || []).forEach(function (f) {
      if (f.type !== 'choice') {
        unsupported += 1;
        return;
      }
      index += 1;
      const cfg = f.config || {};
      questions.push({
        key: f.questionKey,
        index: index,
        label: f.label || f.questionKey,
        multiple: cfg.choiceType === 'multiple',
        options: (f.options || []).map(function (o) {
          return { value: o.value, label: o.label, picked: false };
        }),
      });
    });
    if (questions.length) sections.push({ code: sec.code, label: sec.label || sec.code, questions: questions });
  });
  return { sections: sections, unsupported: unsupported, total: index };
}

Page({
  data: {
    pageGateOk: false,
    loading: true,
    passed: false,
    paperTitle: '',
    sections: [],
    total: 0,
    answered: 0,
    unsupported: 0,
    submitting: false,
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
    this.paperId = Number(options && options.paperId);
    this.answers = {};
    this.setData({ pageGateOk: true });
  },

  onShow() {
    if (this._accessDenied || !this.data.pageGateOk) return;
    if (this._loaded) return;
    this.load();
  },

  load() {
    if (!this.paperId) {
      wx.showToast({ title: '试卷不存在', icon: 'none' });
      wx.navigateBack({ delta: 1 });
      return;
    }
    this.setData({ loading: true });
    api
      .fetchMyExamPaper(this.paperId)
      .then((paper) => {
        if (!paper) throw new Error('试卷不存在');
        // 已合格的卷不再展示题目与答案
        if (paper.myQualifyYn === 1) {
          this._loaded = true;
          this.setData({ loading: false, passed: true, paperTitle: paper.title || '' });
          return;
        }
        const built = buildSections(paper);
        this._loaded = true;
        this.setData({
          loading: false,
          paperTitle: paper.title || '',
          sections: built.sections,
          total: built.total,
          unsupported: built.unsupported,
          answered: 0,
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  onPickOption(e) {
    const ds = e.currentTarget.dataset;
    const qkey = ds.qkey;
    const value = ds.value;
    if (!qkey || value == null) return;
    const multiple = ds.multiple === true || ds.multiple === 'true';

    if (multiple) {
      const cur = Array.isArray(this.answers[qkey]) ? this.answers[qkey].slice() : [];
      const at = cur.indexOf(value);
      if (at >= 0) cur.splice(at, 1);
      else cur.push(value);
      this.answers[qkey] = cur;
    } else {
      this.answers[qkey] = value;
    }
    this.refreshPicked();
  },

  /** 重算每题选项的选中态与已答计数（setData 需要整棵新对象才会刷新） */
  refreshPicked() {
    let answered = 0;
    // 内层 map 没有 thisArg，先把 answers 取出来，别在内层回调里用 this
    const answers = this.answers || {};
    const sections = this.data.sections.map(function (sec) {
      return {
        code: sec.code,
        label: sec.label,
        questions: sec.questions.map(function (q) {
          const picked = answers[q.key];
          const pickedList = Array.isArray(picked) ? picked : picked == null ? [] : [picked];
          if (pickedList.length) answered += 1;
          return {
            key: q.key,
            index: q.index,
            label: q.label,
            multiple: q.multiple,
            options: q.options.map(function (o) {
              return { value: o.value, label: o.label, picked: pickedList.indexOf(o.value) >= 0 };
            }),
          };
        }),
      };
    });
    this.setData({ sections: sections, answered: answered });
  },

  onSubmitTap() {
    if (this.data.submitting) return;
    const unanswered = this.data.total - this.data.answered;
    wx.showModal({
      title: '提交试卷',
      content: unanswered > 0
        ? `还有 ${unanswered} 题未作答，提交后不可查看答案，确定提交吗？`
        : '提交后不可查看得分与正确答案，确定提交吗？',
      confirmText: '确定提交',
      success: (res) => {
        if (res.confirm) this.doSubmit();
      },
    });
  },

  doSubmit() {
    this.setData({ submitting: true });
    api
      .submitExamPaper(this.paperId, this.answers)
      .then((r) => {
        this.setData({ submitting: false });
        const passed = r && r.qualifyYn === 1;
        wx.showToast({
          title: passed ? '本次合格' : '本次未合格，可重答',
          icon: 'none',
          duration: 1800,
        });
        setTimeout(() => wx.navigateBack({ delta: 1 }), 1800);
      })
      .catch((err) => {
        this.setData({ submitting: false });
        wx.showToast({ title: err.message || '提交失败', icon: 'none' });
      });
  },
});
