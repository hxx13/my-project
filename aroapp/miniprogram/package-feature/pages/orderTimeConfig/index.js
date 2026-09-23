const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const personIdentity = require('../../../utils/personIdentity.js');
const otApi = require('../../utils/orderTimeConfigApi.js');

const CAMPUSES = ['浦东', '浦西'];
const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 特殊时段（RANGE）恒在最顶；其余按 (sortOrder, id) —— 与 Web orderedRules 同口径 */
function sortRules(list) {
  const span = (list || []).filter((r) => r.shape === 'RANGE');
  const rest = (list || []).filter((r) => r.shape !== 'RANGE');
  rest.sort(function (a, b) {
    const sa = a.sortOrder != null ? a.sortOrder : 0;
    const sb = b.sortOrder != null ? b.sortOrder : 0;
    return sa !== sb ? sa - sb : (a.id || 0) - (b.id || 0);
  });
  return span.concat(rest);
}

/** 品种列表 [{value,label}] → { 品种id: 名称 }：列表里只有 categoryKey（后端不返回名称），
 *  不建这张反查表就会显示成「品种 · 42」。 */
function breedLabelByKey(options) {
  const map = {};
  (options || []).forEach(function (o) {
    if (o && o.value != null) map[String(o.value)] = o.label;
  });
  return map;
}

/** 列表行展示所需的派生字段。`_k` 是稳定且唯一的本地键：新建的行保存前没有后端 id，
 *  wxml 的 wx:key 与所有行内动作都用它定位；提交时不带 `_k`（见 toRulePayload 的白名单写法）。 */
function decorateRule(r, labelByKey) {
  const catLabel = r.categoryLabel || (labelByKey && labelByKey[String(r.categoryKey)]) || r.categoryKey || '';
  const scopeText =
    r.shape === 'RANGE' ? '特殊时段' : r.scope === 'CATEGORY' ? '品种 · ' + catLabel : '全局';
  let summaryText = '';
  if (r.shape === 'RANGE') {
    summaryText = (r.rangeStartAt || '') + ' → ' + (r.rangeEndAt || '');
  } else if (r.shape === 'WEEKLY_SPAN') {
    summaryText = '周' + (r.startWeekday || '') + ' ' + (r.dailyStartTime || '')
      + ' → 周' + (r.endWeekday || '') + ' ' + (r.dailyEndTime || '');
  } else {
    const names = ['一', '二', '三', '四', '五', '六', '日'];
    const days = String(r.weekdays || '').split(',').filter(Boolean)
      .map(function (n) { return names[Number(n) - 1] || n; }).join('、');
    summaryText = '每周 ' + days + ' ' + (r.dailyStartTime || '') + '–' + (r.dailyEndTime || '');
  }
  return Object.assign({}, r, {
    _k: r.id != null ? 'r' + r.id : 'new_' + Math.random().toString(36).slice(2),
    scopeText: scopeText,
    summaryText: summaryText,
    effectText: r.effect === 'DISABLE' ? '禁用' : '开放',
    activeFlag: r.active == null ? 1 : Number(r.active),
    isRange: r.shape === 'RANGE',
    expired: r.shape === 'RANGE' && !!r.rangeEndAt && new Date(String(r.rangeEndAt).replace(' ', 'T')) < new Date(),
  });
}

/** 草稿行 → 提交体。两个 tab 的保存共用这一处，免得同一份后端对象出现两种转换。 */
function toRulePayload(r) {
  return {
    id: r.id != null ? r.id : undefined,
    scope: r.scope,
    categoryKey: r.scope === 'CATEGORY' ? (r.categoryKey || null) : null,
    effect: r.effect,
    shape: r.shape,
    weekdays: r.shape === 'WEEKLY' ? (r.weekdays || null) : null,
    startWeekday: r.shape === 'WEEKLY_SPAN' ? (r.startWeekday != null ? r.startWeekday : null) : null,
    endWeekday: r.shape === 'WEEKLY_SPAN' ? (r.endWeekday != null ? r.endWeekday : null) : null,
    dailyStartTime: r.dailyStartTime || null,
    dailyEndTime: r.dailyEndTime || null,
    rangeStartAt: r.shape === 'RANGE' ? (r.rangeStartAt || null) : null,
    rangeEndAt: r.shape === 'RANGE' ? (r.rangeEndAt || null) : null,
    label: r.label || null,
    sortOrder: r.isRange ? 0 : r.sortOrder,
    active: r.activeFlag != null ? r.activeFlag : 1,
  };
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function fmtTime(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }

/** 到货周期行：date 为 YYYY-MM-DD；expired 用墙钟当天串比较（日期串字典序 = 时间序） */
function cycleRows(dates) {
  const today = fmtDate(new Date());
  return (dates || []).map(function (d) {
    return { date: d, expired: d < today, _k: 'c' + d + '_' + Math.random().toString(36).slice(2) };
  });
}

function sortCycles(list) {
  return (list || []).slice().sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
}

/** YYYY-MM-DD 的后一天；用 / 分隔避免 JSCore 把纯日期当 UTC 解析成前一日 */
function nextDayStr(dateStr) {
  const d = new Date(String(dateStr).replace(/-/g, '/') + ' 00:00:00');
  d.setDate(d.getDate() + 1);
  return fmtDate(d);
}

/** "09:00:00" / "09:00" → "09:00"；空值原样返回 */
function timeToHM(s) {
  if (!s) return '';
  const m = String(s).match(/^\d{2}:\d{2}/);
  return m ? m[0] : String(s);
}

/** "YYYY-MM-DD HH:mm:ss" → { date, time } */
function splitDateTime(s) {
  const m = String(s || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return m ? { date: m[1], time: m[2] } : { date: '', time: '' };
}

/** 由选中的 ISO 星期字符串数组派生 7 位渲染标志（WXML 不能 indexOf） */
function weekdayFlags(list) {
  const flags = [false, false, false, false, false, false, false];
  (list || []).forEach(function (wd) {
    const n = Number(wd);
    if (n >= 1 && n <= 7) flags[n - 1] = true;
  });
  return flags;
}

/** 参考数据项展示名：fieldData 可能是 JSON 字符串，先解包再读 title/subtitle（与 Web TimeWindowRuleEditor 同口径） */
function breedLabel(item) {
  let fd = item && item.fieldData;
  if (typeof fd === 'string') { try { fd = JSON.parse(fd); } catch (e) { fd = null; } }
  const name = (fd && (fd.title || fd.subtitle)) || ('ID ' + (item && item.id));
  return String(name);
}

Page({
  data: {
    pageGateOk: false,
    campuses: CAMPUSES,
    campus: '',
    subTab: 'window',
    weekdayLabels: WEEKDAY_LABELS,
    // 可购窗口
    defaultMode: 'OPEN',
    rules: [],
    deletedRuleIds: [],
    // 预计送达
    etaMode: 'RELATIVE',
    etaWorkdayOffset: '3',
    etaWeekday: 1,
    etaWeekdayLabel: '周一',
    summary: null,
    // ── 编辑弹窗（Task 4）──
    rulePopup: false,
    ruleEditKey: '',              // 被编辑行的本地键 _k；空 = 新建
    ruleEditId: null,             // 被编辑行的后端 id；新建时为 null（提交时不出现在 body 里）
    ruleShape: 'WEEKLY',          // WEEKLY 每日固定 / WEEKLY_SPAN 跨星期区间
    ruleScope: 'GLOBAL',          // GLOBAL / CATEGORY
    ruleCategoryKey: '',
    ruleCategoryLabel: '',
    ruleEffect: 'OPEN',           // OPEN / DISABLE
    ruleWeekdays: [],             // ['1','3'] 选中的 ISO 星期（字符串）
    ruleWeekdayFlags: [false, false, false, false, false, false, false],
    ruleDayStart: '09:00',
    ruleDayEnd: '17:00',
    ruleStartWeekday: 1,
    ruleEndWeekday: 5,
    ruleSpanStart: '09:00',
    ruleSpanEnd: '17:00',
    ruleLabel: '',
    breedOptions: [],
    breedLabels: [],
    breedIndex: 0,
    breedPopup: false,
    rangePopup: false,
    rangeEditKey: '',             // 被编辑行的本地键 _k；空 = 新建
    rangeEditId: null,            // 被编辑行的后端 id；新建时为 null
    rangeStartDate: '',
    rangeStartTime: '09:00',
    rangeEndDate: '',
    rangeEndTime: '17:00',
    rangeLabel: '',
    weekdayPickerRange: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    // 到货周期清单（预计送达 tab 内）
    cyclesDraft: [],
    cyclesPredicted: [],
  },

  onShow() {
    this._ensureAccess().then((ok) => {
      if (!ok) return;
      // 校区：优先沿用动物订购页记住的选择，否则回退到第一个校区
      if (!this.data.campus) {
        let stored = '';
        try {
          stored = String(wx.getStorageSync('animal_order_campus') || '');
        } catch (e) {
          stored = '';
        }
        this.setData({ campus: stored || CAMPUSES[0] });
      }
      this.setData({ pageGateOk: true }, () => this.reloadAll());
    });
  },

  /**
   * 页面准入：超管 或 持「业务」标签。
   *
   * <p>不走 page-permission 注册表 —— 子包路径在服务端扫描时匹配不上
   * （pagePermission.js 会把 package-feature 前缀剥掉再查，且 WXML 入口发现要求
   * van-cell 上有字面量 title，「我的」页没有），所以那个 DB 覆盖对本入口失效，
   * 字面量判定才是实际生效的那条。真正的门在后端 canManageOrderConfig。
   */
  async _ensureAccess() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (hasMinRole(role, 'SUPER_ADMIN')) return true;
    let codes = {};
    try {
      codes = await personIdentity.fetchMyIdentityCodes();
    } catch (e) {
      codes = {};
    }
    if (codes && codes.BUSINESS) return true;
    wx.showToast({ title: '无权限', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 400);
    return false;
  },

  onCampusTap(e) {
    const campus = e.currentTarget.dataset.campus;
    if (campus === this.data.campus) return;
    try { wx.setStorageSync('animal_order_campus', campus); } catch (err) { /* ignore */ }
    this.setData({ campus: campus }, () => this.reloadAll());
  },

  onSubTabChange(e) {
    const name = (e.detail && e.detail.name) || 'window';
    this.setData({ subTab: name });
  },

  async reloadAll() {
    wx.showLoading({ title: '加载中', mask: true });
    try {
      const [admin, summary, cycles] = await Promise.all([
        otApi.fetchAdminPolicy(this.data.campus),
        otApi.fetchPolicySummary(this.data.campus),
        otApi.fetchCyclesAdmin(this.data.campus),
      ]);
      // 品种名称反查表：后端规则里只有 categoryKey，列表要显示名字就得先在本地建表
      await this.ensureBreeds();
      const labelByKey = breedLabelByKey(this.data.breedOptions);
      const rules = ((admin && admin.rules) || []).map(function (r) {
        return decorateRule(r, labelByKey);
      });
      const stored = ((cycles && cycles.stored) || []);
      this.setData({
        defaultMode: (admin && admin.defaultMode) || 'OPEN',
        etaMode: (admin && admin.etaMode) || 'RELATIVE',
        etaWorkdayOffset: String((admin && admin.etaWorkdayOffset) != null ? admin.etaWorkdayOffset : 3),
        etaWeekday: (admin && admin.etaWeekday) != null ? admin.etaWeekday : 1,
        etaWeekdayLabel: WEEKDAY_LABELS[(((admin && admin.etaWeekday) != null ? admin.etaWeekday : 1) - 1 + 7) % 7],
        rules: sortRules(rules),
        summary: summary || null,
        // 到货周期：清单草稿初始 = 服务端清单（空时服务端会自动按策略播种）
        cyclesDraft: cycleRows(stored),
        cyclesPredicted: ((cycles && cycles.predicted) || []),
        // 重新加载 = 换一份草稿：deletedRuleIds 必须清空，否则「在浦东删一条 → 切到浦西 →
        // 保存」会把浦东那条 id 一并提交成删除，跨校区误删（策略是按校区存的）。
        deletedRuleIds: [],
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /** 默认可购性 */
  onDefaultMode(e) {
    this.setData({ defaultMode: e.currentTarget.dataset.mode });
  },

  /** 启用/停用：只改本地草稿，随「保存」一起落库（与 Web 同口径）。定位一律用 _k，新建行没有 id */
  toggleRuleActive(e) {
    const key = e.currentTarget.dataset.key;
    const rules = (this.data.rules || []).map(function (r) {
      if (r._k !== key) return r;
      const next = r.activeFlag ? 0 : 1;
      return Object.assign({}, r, { activeFlag: next, active: next });
    });
    this.setData({ rules: rules });
  },

  /** 上移/下移：顺序即优先级。特殊时段钉顶不可移，故只在同为非 RANGE 的相邻行间互换 */
  moveRule(e) {
    const key = e.currentTarget.dataset.key;
    const dir = Number(e.currentTarget.dataset.dir); // -1 上移 / +1 下移
    const list = (this.data.rules || []).slice();
    const idx = list.findIndex(function (r) { return r._k === key; });
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    if (list[idx].isRange || list[target].isRange) return; // 特殊时段不参与排序
    const tmp = list[idx];
    list[idx] = list[target];
    list[target] = tmp;
    // 重排 sortOrder：只给非 RANGE 的行编号，特殊时段不占号
    let order = 0;
    const renumbered = list.map(function (r) {
      if (r.isRange) return r;
      order += 1;
      return Object.assign({}, r, { sortOrder: order });
    });
    this.setData({ rules: renumbered });
  },

  /** 软删除：移出草稿并把 id 记进 deletedRuleIds，随保存一起提交（库里保留可恢复）。
   *  新建后又删掉的草稿行没有 id，不该进删除列表。 */
  deleteRule(e) {
    const self = this;
    const key = e.currentTarget.dataset.key;
    const hit = (self.data.rules || []).find(function (r) { return r._k === key; });
    if (!hit) return;
    wx.showModal({
      title: '删除时段',
      content: '确认删除？数据库中会保留，可恢复。',
      confirmColor: '#dc2626',
      success: function (res) {
        if (!res.confirm) return;
        const deleted = hit.id != null
          ? (self.data.deletedRuleIds || []).concat([hit.id])
          : (self.data.deletedRuleIds || []);
        self.setData({
          rules: (self.data.rules || []).filter(function (r) { return r._k !== key; }),
          deletedRuleIds: deleted,
        });
      },
    });
  },

  /** 保存整份策略：两个 tab 提交的是同一份后端对象，所以转换走模块级的 toRulePayload */
  async saveWindow() {
    wx.showLoading({ title: '保存中', mask: true });
    try {
      const rules = (this.data.rules || []).map(function (r, i) {
        return Object.assign(toRulePayload(r), { sortOrder: r.isRange ? 0 : i + 1 });
      });
      await otApi.saveAdminPolicy({
        campus: this.data.campus,
        defaultMode: this.data.defaultMode,
        etaMode: this.data.etaMode,
        etaWorkdayOffset: parseInt(this.data.etaWorkdayOffset, 10) || 0,
        etaWeekday: this.data.etaWeekday,
        rules: rules,
        deletedRuleIds: this.data.deletedRuleIds || [],
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ deletedRuleIds: [] });
      await this.reloadAll();
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // ── 时段编辑弹窗 ──
  openNewRule() {
    this.setData({
      rulePopup: true,
      ruleEditKey: '',
      ruleEditId: null,
      ruleShape: 'WEEKLY',
      ruleScope: 'GLOBAL',
      ruleCategoryKey: '',
      ruleCategoryLabel: '',
      ruleEffect: 'OPEN',
      ruleWeekdays: [],
      ruleWeekdayFlags: weekdayFlags([]),
      ruleDayStart: '09:00',
      ruleDayEnd: '17:00',
      ruleStartWeekday: 1,
      ruleEndWeekday: 5,
      ruleSpanStart: '09:00',
      ruleSpanEnd: '17:00',
      ruleLabel: '',
      breedIndex: 0,
    });
  },

  editRule(e) {
    const key = e.currentTarget.dataset.key;
    const r = (this.data.rules || []).find(function (x) { return x._k === key; });
    if (!r) return;
    const wds = String(r.weekdays || '').split(',').filter(Boolean);
    let breedIndex = 0;
    if (r.scope === 'CATEGORY') {
      const idx = (this.data.breedOptions || []).findIndex(function (o) { return String(o.value) === String(r.categoryKey); });
      if (idx >= 0) breedIndex = idx;
    }
    this.setData({
      rulePopup: true,
      ruleEditKey: key,
      ruleEditId: r.id != null ? r.id : null,
      ruleShape: r.shape === 'WEEKLY_SPAN' ? 'WEEKLY_SPAN' : 'WEEKLY',
      ruleScope: r.scope || 'GLOBAL',
      ruleCategoryKey: r.categoryKey || '',
      ruleCategoryLabel: r.categoryLabel || '',
      ruleEffect: r.effect || 'OPEN',
      ruleWeekdays: wds,
      ruleWeekdayFlags: weekdayFlags(wds),
      ruleDayStart: timeToHM(r.dailyStartTime) || '09:00',
      ruleDayEnd: timeToHM(r.dailyEndTime) || '17:00',
      ruleSpanStart: timeToHM(r.dailyStartTime) || '09:00',
      ruleSpanEnd: timeToHM(r.dailyEndTime) || '17:00',
      ruleStartWeekday: r.startWeekday != null ? r.startWeekday : 1,
      ruleEndWeekday: r.endWeekday != null ? r.endWeekday : 5,
      ruleLabel: r.label || '',
      breedIndex: breedIndex,
    });
  },

  closeRulePopup() {
    this.setData({ rulePopup: false, ruleEditKey: '', ruleEditId: null });
  },

  openNewRange() {
    // 与 Web 一致：默认 现在+1h → 现在+4h
    const start = new Date(Date.now() + 3600e3);
    const end = new Date(Date.now() + 4 * 3600e3);
    this.setData({
      rangePopup: true,
      rangeEditKey: '',
      rangeEditId: null,
      rangeStartDate: fmtDate(start),
      rangeStartTime: fmtTime(start),
      rangeEndDate: fmtDate(end),
      rangeEndTime: fmtTime(end),
      rangeLabel: '',
    });
  },

  editRange(e) {
    const key = e.currentTarget.dataset.key;
    const r = (this.data.rules || []).find(function (x) { return x._k === key; });
    if (!r) return;
    const s = splitDateTime(r.rangeStartAt);
    const t = splitDateTime(r.rangeEndAt);
    this.setData({
      rangePopup: true,
      rangeEditKey: key,
      rangeEditId: r.id != null ? r.id : null,
      rangeStartDate: s.date,
      rangeStartTime: s.time || '09:00',
      rangeEndDate: t.date,
      rangeEndTime: t.time || '17:00',
      rangeLabel: r.label || '',
    });
  },

  closeRangePopup() {
    this.setData({ rangePopup: false, rangeEditKey: '', rangeEditId: null });
  },

  onRuleShape(e) { this.setData({ ruleShape: e.currentTarget.dataset.shape }); },
  onRuleScope(e) { this.setData({ ruleScope: e.currentTarget.dataset.scope }); },
  onRuleEffect(e) { this.setData({ ruleEffect: e.currentTarget.dataset.effect }); },
  onRuleLabel(e) { this.setData({ ruleLabel: e.detail || '' }); },
  onRuleDayStart(e) { this.setData({ ruleDayStart: e.detail.value }); },
  onRuleDayEnd(e) { this.setData({ ruleDayEnd: e.detail.value }); },
  onRuleSpanStart(e) { this.setData({ ruleSpanStart: e.detail.value }); },
  onRuleSpanEnd(e) { this.setData({ ruleSpanEnd: e.detail.value }); },
  onRuleStartWeekday(e) { this.setData({ ruleStartWeekday: Number(e.detail.value) + 1 }); },
  onRuleEndWeekday(e) { this.setData({ ruleEndWeekday: Number(e.detail.value) + 1 }); },
  onRangeStartDate(e) { this.setData({ rangeStartDate: e.detail.value }); },
  onRangeStartTime(e) { this.setData({ rangeStartTime: e.detail.value }); },
  onRangeEndDate(e) { this.setData({ rangeEndDate: e.detail.value }); },
  onRangeEndTime(e) { this.setData({ rangeEndTime: e.detail.value }); },
  onRangeLabel(e) { this.setData({ rangeLabel: e.detail || '' }); },

  toggleRuleWeekday(e) {
    const wd = String(e.currentTarget.dataset.wd);
    const list = (this.data.ruleWeekdays || []).slice();
    const i = list.indexOf(wd);
    if (i >= 0) list.splice(i, 1); else list.push(wd);
    this.setData({ ruleWeekdays: list, ruleWeekdayFlags: weekdayFlags(list) });
  },

  onRuleWeekdayPreset(e) {
    const list = String(e.currentTarget.dataset.preset || '').split(',').filter(Boolean);
    this.setData({ ruleWeekdays: list, ruleWeekdayFlags: weekdayFlags(list) });
  },

  /** 品种列表按需加载一次并缓存；失败不抛（列表退化成显示 id，不因为拉不到品种就整页失败） */
  async ensureBreeds() {
    if (this.data.breedOptions && this.data.breedOptions.length) return this.data.breedOptions;
    try {
      const raw = await otApi.listBreeds();
      const options = (raw || []).map(function (item) {
        return { value: String(item.id), label: breedLabel(item) };
      });
      this.setData({
        breedOptions: options,
        breedLabels: options.map(function (o) { return o.label; }),
      });
      return options;
    } catch (err) {
      return [];
    }
  },

  async openBreedPicker() {
    const options = await this.ensureBreeds();
    if (!options.length) {
      wx.showToast({ title: '加载品种失败', icon: 'none' });
      return;
    }
    this.setData({ breedPopup: true });
  },

  onBreedPick(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const opt = (this.data.breedOptions || [])[idx];
    if (!opt) return;
    this.setData({
      breedIndex: idx,
      ruleCategoryKey: opt.value,
      ruleCategoryLabel: opt.label,
      breedPopup: false,
    });
  },

  closeBreedPicker() {
    this.setData({ breedPopup: false });
  },

  /** 校验并写入草稿（不落库，随「保存可购窗口策略」一起提交） */
  saveRule() {
    const d = this.data;
    if (d.ruleScope === 'CATEGORY' && !d.ruleCategoryKey) {
      wx.showToast({ title: '请选择品种', icon: 'none' }); return;
    }
    if (d.ruleShape === 'WEEKLY' && (!d.ruleWeekdays || !d.ruleWeekdays.length)) {
      wx.showToast({ title: '请至少选一个星期', icon: 'none' }); return;
    }
    const base = {
      id: d.ruleEditId != null ? d.ruleEditId : undefined,
      scope: d.ruleScope,
      categoryKey: d.ruleScope === 'CATEGORY' ? d.ruleCategoryKey : null,
      categoryLabel: d.ruleScope === 'CATEGORY' ? d.ruleCategoryLabel : '',
      effect: d.ruleEffect,
      shape: d.ruleShape,
      label: (d.ruleLabel || '').trim() || null,
      active: 1,
      activeFlag: 1,
    };
    const row = d.ruleShape === 'WEEKLY'
      ? Object.assign(base, {
          weekdays: d.ruleWeekdays.slice().sort().join(','),
          dailyStartTime: d.ruleDayStart + ':00',
          dailyEndTime: d.ruleDayEnd + ':00',
          startWeekday: null, endWeekday: null, rangeStartAt: null, rangeEndAt: null,
        })
      : Object.assign(base, {
          startWeekday: d.ruleStartWeekday, endWeekday: d.ruleEndWeekday,
          dailyStartTime: d.ruleSpanStart + ':00', dailyEndTime: d.ruleSpanEnd + ':00',
          weekdays: null, rangeStartAt: null, rangeEndAt: null,
        });
    const list = (this.data.rules || []).slice();
    const idx = list.findIndex(function (r) { return r._k === d.ruleEditKey; });
    const decorated = decorateRule(row, breedLabelByKey(this.data.breedOptions));
    // 编辑已有行时保留原 _k，避免列表重建导致的抖动；新建行由 decorateRule 生成新的
    if (idx >= 0) decorated._k = d.ruleEditKey;
    if (idx >= 0) list[idx] = decorated; else list.push(decorated);
    this.setData({ rules: sortRules(list), rulePopup: false, ruleEditKey: '', ruleEditId: null });
  },

  saveRange() {
    const d = this.data;
    if (!d.rangeStartDate || !d.rangeEndDate) {
      wx.showToast({ title: '请选择起止日期', icon: 'none' }); return;
    }
    const startAt = d.rangeStartDate + ' ' + d.rangeStartTime + ':00';
    const endAt = d.rangeEndDate + ' ' + d.rangeEndTime + ':00';
    if (endAt <= startAt) {
      wx.showToast({ title: '结束时间必须晚于开始时间', icon: 'none' }); return;
    }
    const row = {
      id: d.rangeEditId != null ? d.rangeEditId : undefined,
      scope: 'GLOBAL', effect: 'OPEN', shape: 'RANGE',
      rangeStartAt: startAt, rangeEndAt: endAt,
      label: (d.rangeLabel || '').trim() || null,
      active: 1, activeFlag: 1,
    };
    const list = (this.data.rules || []).slice();
    const idx = list.findIndex(function (r) { return r._k === d.rangeEditKey; });
    const decorated = decorateRule(row, breedLabelByKey(this.data.breedOptions));
    if (idx >= 0) decorated._k = d.rangeEditKey;
    if (idx >= 0) list[idx] = decorated; else list.push(decorated);
    this.setData({ rules: sortRules(list), rangePopup: false, rangeEditKey: '', rangeEditId: null });
  },

  // ── 预计送达 tab ──
  onEtaMode(e) { this.setData({ etaMode: e.currentTarget.dataset.mode }); },
  onEtaOffset(e) { this.setData({ etaWorkdayOffset: e.detail || '0' }); },
  onEtaWeekday(e) {
    const idx = Number(e.detail.value) || 0;
    this.setData({ etaWeekday: idx + 1, etaWeekdayLabel: this.data.weekdayLabels[idx] });
  },

  /**
   * 预计送达与可购窗口同属一份管理端草稿：后端 PUT 是整份替换，
   * 所以这里必须把当前 rules / defaultMode 一起带上，否则会把窗口规则清空。
   */
  async saveEta() {
    wx.showLoading({ title: '保存中', mask: true });
    try {
      await otApi.saveAdminPolicy({
        campus: this.data.campus,
        defaultMode: this.data.defaultMode,
        etaMode: this.data.etaMode,
        etaWorkdayOffset: parseInt(this.data.etaWorkdayOffset, 10) || 0,
        etaWeekday: this.data.etaWeekday,
        rules: (this.data.rules || []).map(function (r, i) {
          return Object.assign(toRulePayload(r), { sortOrder: r.isRange ? 0 : i + 1 });
        }),
        deletedRuleIds: this.data.deletedRuleIds || [],
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      await this.reloadAll();
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // ── 到货周期清单 ──
  /** 改某天的日期：picker 直接落在行内，选中即回写草稿（不落库，随「保存」提交） */
  onCycleDateChange(e) {
    const key = e.currentTarget.dataset.key;
    const date = e.detail.value;
    const today = fmtDate(new Date());
    const list = (this.data.cyclesDraft || []).map(function (c) {
      if (c._k !== key) return c;
      return { date: date, expired: date < today, _k: c._k };
    });
    this.setData({ cyclesDraft: sortCycles(list) });
  },

  deleteCycleDay(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({
      cyclesDraft: (this.data.cyclesDraft || []).filter(function (c) { return c._k !== key; }),
    });
  },

  /** 新增一天：默认 = 现有最晚日期 + 1 天（空则今天），日期仍可在行内 picker 改 */
  addCycleDay() {
    const list = (this.data.cyclesDraft || []).slice();
    let latest = '';
    list.forEach(function (c) { if (!latest || c.date > latest) latest = c.date; });
    const date = latest ? nextDayStr(latest) : fmtDate(new Date());
    const today = fmtDate(new Date());
    list.push({ date: date, expired: date < today, _k: 'c' + date + '_' + Math.random().toString(36).slice(2) });
    this.setData({ cyclesDraft: sortCycles(list) });
  },

  /** 按策略重新生成：把编辑器填成 predicted（不立即保存，让管理员核对后再点保存） */
  adoptCycles() {
    const predicted = this.data.cyclesPredicted || [];
    if (!predicted.length) {
      wx.showToast({ title: '暂无推算结果', icon: 'none' });
      return;
    }
    this.setData({ cyclesDraft: cycleRows(predicted) });
    wx.showToast({ title: '已按当前策略填入，确认后请点保存', icon: 'none' });
  },

  /** 保存清单 = PUT 整份数组；清空（空数组）会让该校区静默回到按策略推算，故先确认 */
  async saveCycles() {
    const cycles = (this.data.cyclesDraft || []).map(function (c) { return c.date; });
    const self = this;
    const doSave = async function () {
      wx.showLoading({ title: '保存中', mask: true });
      try {
        await otApi.saveCyclesAdmin(self.data.campus, cycles);
        wx.showToast({ title: '已保存', icon: 'success' });
        await self.reloadAll();
      } catch (e) {
        wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    };
    if (!cycles.length) {
      wx.showModal({
        title: '清空到货周期清单',
        content: '确认清空？保存后该校区回到「按策略推算」（下次打开会自动重新生成）。',
        confirmColor: '#dc2626',
        success: function (res) { if (res.confirm) doSave(); },
      });
      return;
    }
    await doSave();
  },
});
