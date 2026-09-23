/**
 * 门禁记录库（小程序版）
 * 两个数据源 tab（用户口径：只要这两个页面的记录库，其余 tab 不要）：
 *   - 刷卡记录：GET /api/admin/twin/access-audit/preview/swing   （原 /console/admin/dahua-swing-tasks?tab=records）
 *   - 自动化日志：GET /api/v1/twin/automation-logs                （原 /console/admin/automation-logs）
 *
 * 筛选形态：顶部只留「搜索框 + 筛选N」，全部条件收进底部抽屉（用户 2026-09-23 定）；
 * 已应用的条件以可删 chip 横滑常驻，不占竖向空间。
 * 未落地：web 的 taskId/mappingHit/requireMapping/openSuccessOnly（数据质量用），
 * 以及「补全字段 / 重算受众」两个写操作。
 */
const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');

const PAGE_SIZE = 20;

const SOURCES = [
  { key: 'swing', label: '刷卡记录' },
  { key: 'auto', label: '自动化日志' },
];

const OPEN_TYPE_OPTIONS = [
  { value: '', label: '全部' },
  { value: '51', label: '合法刷卡' },
  { value: '52', label: '非法刷卡' },
  { value: '48', label: '远程开门' },
  { value: '49', label: '按钮开门' },
];

const ENTER_EXIT_OPTIONS = [
  { value: '', label: '全部' },
  { value: '1', label: '进入' },
  { value: '2', label: '离开' },
];

const RESULT_OPTIONS = [
  { value: '', label: '全部' },
  { value: '1', label: '成功' },
  { value: '0', label: '失败' },
];

const AUDIENCE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'STUDENT', label: '学生' },
  { value: 'STAFF', label: '工作人员' },
];

const AUTO_TYPE_LABEL = {
  AUTO_SIGNOUT: '离开自动化',
  ACCESS_TRACE: '通行与联动步骤',
  ACCESS_DEBUG: '联动调试追踪',
  SCHEDULER: '定时器自动化',
  EXEMPTION: '豁免自动化',
  FACE_VERIFY: '门禁人脸验证',
  DOOR_TEMP_UNLOCK: '门禁临时解锁',
};

const AUTO_TYPE_OPTIONS = [{ value: '', label: '全部' }].concat(
  Object.keys(AUTO_TYPE_LABEL).map((k) => ({ value: k, label: AUTO_TYPE_LABEL[k] }))
);

const AUTO_TRIGGER_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'TIMER', label: '定时' },
  { value: 'MANUAL', label: '手动' },
  { value: 'SYSTEM', label: '系统' },
  { value: 'USER', label: '用户' },
];

const PULL_TYPE_LABEL = { REALTIME: '实时', STATS: '审计' };

const TAG_LABEL = {
  MISSING_ENTER_EXIT: '缺进出',
  NO_MAPPING: '未映射',
  STUDENT: '学生',
  STAFF: '工作人员',
  OPEN_FAILED: '开门失败',
};

const TRIGGER_LABEL = {
  TIMER: '定时触发',
  MANUAL: '手动触发',
  SYSTEM: '系统触发',
  USER: '用户触发',
};

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 北京时区的 YYYY-MM-DD */
function beijingDayKey(date) {
  const t = new Date((date || new Date()).getTime() + 8 * 3600 * 1000);
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
}

/** 拿到最后一节：长通道名压短（列表只给一行位置） */
function tailName(s, keep) {
  const parts = String(s || '').split('-');
  const sliced = parts.slice(-keep).join('-');
  return sliced || String(s || '');
}

function freshFilters() {
  const today = beijingDayKey();
  return {
    personName: '',
    personCode: '',
    cardNumber: '',
    channelName: '',
    departmentName: '',
    openType: '',
    enterOrExit: '',
    openResult: '',
    audienceType: '',
    autoKeyword: '',
    autoType: '',
    autoTrigger: '',
    excludePenetrationPoll: true,
    startDate: today,
    endDate: today,
  };
}

function body(res) {
  const raw = res ? res.data : null;
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function labelOf(options, value) {
  const hit = options.find((o) => o.value === value);
  return hit ? hit.label : value;
}

function decorateSwing(r) {
  const resultText =
    r.openResultLabel || (Number(r.openResult) === 1 ? '成功' : Number(r.openResult) === 0 ? '失败' : '-');
  const ok = Number(r.openResult) === 1 || resultText === '成功';
  const audience = r.audienceLabel || labelOf(AUDIENCE_OPTIONS, String(r.audienceType || ''));
  const mappingText =
    r.mappingHitLabel ||
    (Number(r.mappingHit) === 1 ? '已映射' : Number(r.mappingHit) === 0 ? '未映射' : '');
  // 受众列与后端 tags 的「学生/工作人员」重名、映射列与 NO_MAPPING 重名 —— 两处都剔除，避免同屏出现两遍
  const tags = [];
  (r.tags || []).forEach((t) => {
    const label = TAG_LABEL[t] || t;
    if (!label || label === audience || label === mappingText || tags.indexOf(label) >= 0) return;
    tags.push(label);
  });
  return Object.assign({}, r, {
    __key: String(r.taskId) + '-' + String(r.recordId),
    __resultText: resultText,
    __resultOk: ok,
    __openTypeText: labelOf(OPEN_TYPE_OPTIONS, String(r.openType == null ? '' : r.openType)) || String(r.openType || ''),
    __pullText: r.pullTaskType ? PULL_TYPE_LABEL[r.pullTaskType] || r.pullTaskType : '',
    __channelText: tailName(r.channelName || r.channelCode || '', 2),
    __enterText: r.enterOrExitLabel || labelOf(ENTER_EXIT_OPTIONS, String(r.enterOrExit == null ? '' : r.enterOrExit)),
    __mappingText: mappingText,
    __audienceText: audience,
    __idText: (r.personCode ? '工号 ' + r.personCode : '') + (r.cardNumber ? ' · 卡号 ' + r.cardNumber : ''),
    __deptText: r.departmentName ? tailName(r.departmentName, 2) : '',
    __tagRows: tags,
  });
}

function decorateAuto(r) {
  return Object.assign({}, r, {
    __key: String(r.logSource || 'twin') + '-' + String(r.id),
    __typeText: r.automationTypeLabel || AUTO_TYPE_LABEL[r.automationType] || r.automationType || '-',
    __triggerText: r.triggerTypeLabel || TRIGGER_LABEL[r.triggerType] || r.triggerType || '',
    __eventText: r.eventKeyLabel || r.eventKey || '-',
    __resultText: Number(r.success) === 1 ? '成功' : Number(r.success) === 0 ? '失败' : '-',
    __resultOk: Number(r.success) === 1,
    __reasonText: r.triggerReasonLabel || r.triggerReason || '',
    __detailText: r.detailDisplayZh || r.detail || '',
  });
}

Page({
  data: {
    loading: true,
    error: '',
    sources: SOURCES,
    source: 'swing',

    options: {
      openType: OPEN_TYPE_OPTIONS,
      enterOrExit: ENTER_EXIT_OPTIONS,
      openResult: RESULT_OPTIONS,
      audienceType: AUDIENCE_OPTIONS,
      autoType: AUTO_TYPE_OPTIONS,
      autoTrigger: AUTO_TRIGGER_OPTIONS,
    },

    /** f = 已生效（驱动列表与 chip）；d = 抽屉编辑副本，点「查看结果」才回写 f */
    f: freshFilters(),
    d: freshFilters(),

    searchDraft: '',
    filterSheetOpen: false,
    filterCount: 0,
    chips: [],

    total: 0,
    page: 1,
    totalPages: 1,
    hasMore: false,
    loadingMore: false,
    rows: [],
  },

  onLoad() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'ADMIN')) {
      wx.showToast({ title: '需要管理员权限', icon: 'none' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 400);
      return;
    }
    this.afterApply();
  },

  /* ─────────── 数据源 ─────────── */

  onSourceTap(e) {
    const key = String(e.currentTarget.dataset.key || '');
    if (!key || key === this.data.source) return;
    this.setData({ source: key, searchDraft: '' });
    this.afterApply();
  },

  /* ─────────── 列表 ─────────── */

  buildParams() {
    const f = this.data.f;
    const params = { page: this.data.page, pageSize: PAGE_SIZE };
    if (f.startDate) params.startTime = f.startDate + ' 00:00:00';
    if (f.endDate) params.endTime = f.endDate + ' 23:59:59';
    if (this.data.source === 'swing') {
      if (f.personName.trim()) params.personName = f.personName.trim();
      if (f.personCode.trim()) params.personCode = f.personCode.trim();
      if (f.cardNumber.trim()) params.cardNumber = f.cardNumber.trim();
      if (f.channelName.trim()) params.channelName = f.channelName.trim();
      if (f.departmentName.trim()) params.departmentName = f.departmentName.trim();
      if (f.openType) params.openType = Number(f.openType);
      if (f.enterOrExit) params.enterOrExit = Number(f.enterOrExit);
      if (f.openResult !== '') params.openResult = Number(f.openResult);
      if (f.audienceType) params.audienceType = f.audienceType;
    } else {
      if (f.autoType) params.automationType = f.autoType;
      if (f.autoTrigger) params.triggerType = f.autoTrigger;
      if (f.autoKeyword.trim()) params.keyword = f.autoKeyword.trim();
      params.excludePenetrationPoll = f.excludePenetrationPoll;
    }
    return params;
  },

  loadList(append) {
    const self = this;
    const isSwing = this.data.source === 'swing';
    if (!append) this.setData({ loading: true, error: '' });
    springAuth
      .springRequest({
        url: isSwing
          ? '/api/admin/twin/access-audit/preview/swing'
          : '/api/v1/twin/automation-logs',
        method: 'GET',
        data: this.buildParams(),
      })
      .then((res) => {
        const b = body(res);
        const code = Number(res && res.statusCode);
        if (code === 401 || code === 403) {
          self.setData({ loading: false, loadingMore: false, error: (b && b.message) || '无权限访问' });
          return;
        }
        if (!b || b.success !== true) {
          self.setData({ loading: false, loadingMore: false, error: (b && b.message) || '加载失败' });
          return;
        }
        const d = b.data || {};
        const list = isSwing ? (Array.isArray(d.data) ? d.data : []) : Array.isArray(d.list) ? d.list : [];
        const total = Number(d.total) || 0;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const decorated = list.map((r) => (isSwing ? decorateSwing(r) : decorateAuto(r)));
        self.setData({
          loading: false,
          loadingMore: false,
          error: '',
          rows: append ? (self.data.rows || []).concat(decorated) : decorated,
          total,
          totalPages,
          hasMore: self.data.page < totalPages,
        });
      })
      .catch((err) => {
        self.setData({ loading: false, loadingMore: false, error: (err && err.message) || '网络请求失败' });
      });
  },

  reload() {
    this.setData({ page: 1 });
    this.loadList(false);
  },

  /** 触底加载下一页（小程序不用上下页按钮） */
  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.setData({ loadingMore: true, page: this.data.page + 1 });
    this.loadList(true);
  },

  /* ─────────── 已选条件 chip ─────────── */

  /** 回写 f 后统一刷新 chip / 计数 / 列表 */
  afterApply() {
    const f = this.data.f;
    this.setData({ filterCount: this.computeFilterCount(f), chips: this.buildChips(f) });
    this.reload();
  },

  computeFilterCount(f) {
    const today = beijingDayKey();
    let n = 0;
    if (this.data.source === 'swing') {
      if (f.personCode.trim()) n += 1;
      if (f.cardNumber.trim()) n += 1;
      if (f.channelName.trim()) n += 1;
      if (f.departmentName.trim()) n += 1;
      if (f.openType) n += 1;
      if (f.enterOrExit) n += 1;
      if (f.openResult !== '') n += 1;
      if (f.audienceType) n += 1;
    } else {
      if (f.autoType) n += 1;
      if (f.autoTrigger) n += 1;
      if (!f.excludePenetrationPoll) n += 1;
    }
    if (f.startDate !== today || f.endDate !== today) n += 1;
    return n;
  },

  buildChips(f) {
    const today = beijingDayKey();
    const chips = [];
    if (this.data.source === 'swing') {
      if (f.enterOrExit) chips.push({ k: 'enterOrExit', t: labelOf(ENTER_EXIT_OPTIONS, f.enterOrExit) });
      if (f.openResult !== '')
        chips.push({ k: 'openResult', t: labelOf(RESULT_OPTIONS, f.openResult) });
      if (f.openType) chips.push({ k: 'openType', t: labelOf(OPEN_TYPE_OPTIONS, f.openType) });
      if (f.audienceType) chips.push({ k: 'audienceType', t: labelOf(AUDIENCE_OPTIONS, f.audienceType) });
      if (f.channelName.trim()) chips.push({ k: 'channelName', t: '通道 ' + f.channelName.trim() });
      if (f.departmentName.trim()) chips.push({ k: 'departmentName', t: '部门 ' + f.departmentName.trim() });
      if (f.personCode.trim()) chips.push({ k: 'personCode', t: '工号 ' + f.personCode.trim() });
      if (f.cardNumber.trim()) chips.push({ k: 'cardNumber', t: '卡号 ' + f.cardNumber.trim() });
    } else {
      if (f.autoType) chips.push({ k: 'autoType', t: labelOf(AUTO_TYPE_OPTIONS, f.autoType) });
      if (f.autoTrigger) chips.push({ k: 'autoTrigger', t: labelOf(AUTO_TRIGGER_OPTIONS, f.autoTrigger) });
      if (!f.excludePenetrationPoll) chips.push({ k: 'excludePenetrationPoll', t: '含定时轮询' });
    }
    if (f.startDate !== today || f.endDate !== today) {
      chips.push({ k: 'date', t: f.startDate.slice(5) + '~' + f.endDate.slice(5) });
    }
    return chips;
  },

  onRemoveChip(e) {
    const k = String(e.currentTarget.dataset.k || '');
    if (!k) return;
    const today = beijingDayKey();
    const fresh = freshFilters();
    const f = Object.assign({}, this.data.f);
    const d = Object.assign({}, this.data.d);
    if (k === 'date') {
      f.startDate = fresh.startDate;
      f.endDate = fresh.endDate;
      d.startDate = fresh.startDate;
      d.endDate = fresh.endDate;
    } else {
      f[k] = fresh[k];
      d[k] = fresh[k];
    }
    this.setData({ f: f, d: d });
    this.afterApply();
  },

  /* ─────────── 搜索 ─────────── */

  onSearchInput(e) {
    this.setData({ searchDraft: e.detail.value });
  },

  onSearchConfirm() {
    const v = this.data.searchDraft.trim();
    const f = Object.assign({}, this.data.f);
    const d = Object.assign({}, this.data.d);
    if (this.data.source === 'swing') {
      f.personName = v;
      d.personName = v;
    } else {
      f.autoKeyword = v;
      d.autoKeyword = v;
    }
    this.setData({ f: f, d: d });
    this.afterApply();
  },

  onSearchClear() {
    const f = Object.assign({}, this.data.f);
    const d = Object.assign({}, this.data.d);
    if (this.data.source === 'swing') {
      f.personName = '';
      d.personName = '';
    } else {
      f.autoKeyword = '';
      d.autoKeyword = '';
    }
    this.setData({ f: f, d: d, searchDraft: '' });
    this.afterApply();
  },

  /* ─────────── 筛选抽屉 ─────────── */

  openFilterSheet() {
    this.setData({ filterSheetOpen: true, d: Object.assign({}, this.data.f) });
  },

  closeFilterSheet() {
    this.setData({ filterSheetOpen: false });
  },

  /** 抽屉内单选 chip（同一个 handler 服务所有 filter-row） */
  onSheetPick(e) {
    const field = String(e.currentTarget.dataset.field || '');
    const value = String(e.detail.value || '');
    if (!field) return;
    const patch = {};
    patch['d.' + field] = value;
    this.setData(patch);
  },

  onSheetInput(e) {
    const field = String(e.currentTarget.dataset.field || '');
    if (!field) return;
    const patch = {};
    patch['d.' + field] = e.detail.value;
    this.setData(patch);
  },

  onSheetDate(e) {
    const field = String(e.currentTarget.dataset.field || '');
    if (!field) return;
    const patch = {};
    patch['d.' + field] = e.detail.value;
    this.setData(patch);
  },

  onSheetToday() {
    const today = beijingDayKey();
    this.setData({ 'd.startDate': today, 'd.endDate': today });
  },

  onSheetPollSwitch(e) {
    this.setData({ 'd.excludePenetrationPoll': !!e.detail.value });
  },

  /** 重置：直接重置并生效（与 web「清除过滤」一致，不再多点一次） */
  onResetFilters() {
    const fresh = freshFilters();
    this.setData({
      f: fresh,
      d: Object.assign({}, fresh),
      searchDraft: '',
      filterSheetOpen: false,
    });
    this.afterApply();
  },

  applyFilters() {
    this.setData({ f: Object.assign({}, this.data.d), filterSheetOpen: false });
    this.afterApply();
  },

  /* ─────────── 分页 / 其他 ─────────── */

  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ urls: [url], current: url });
  },

  onRetry() {
    this.loadList(false);
  },
});
