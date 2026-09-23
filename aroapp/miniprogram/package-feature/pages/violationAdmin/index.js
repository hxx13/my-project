/**
 * 违规管理（小程序版 /#/console/admin/student-violations 的「违规记录」表）
 * 范围（用户口径：只做违规记录表）：筛选 + 按批次分组的记录卡 + 详情 + 新建/编辑 + 解除/解除公告/删除 + 批量解除/删除。
 * 未落地：⚙ 里的规则/公告/题库/滞留等配置弹窗、记录图片上传、文案模板快选、笼架来源开单。
 *
 * 接口（web adminHttp baseURL=/api/admin → 小程序写全路径 /api/admin/...）：
 *   GET    /api/admin/twin/student-violations
 *   POST   /api/admin/twin/student-violations/batch
 *   PUT    /api/admin/twin/student-violations/{id}
 *   DELETE /api/admin/twin/student-violations/{id}
 *   POST   /api/admin/twin/student-violations/{id}/clear
 *   POST   /api/admin/twin/student-violations/{id}/clear-notice
 *   GET    /api/admin/twin/student-violations/{id}/disposition-detail
 *   GET    /api/admin/twin/student-violations/personnel/project-groups/search
 *   GET    /api/admin/twin/student-violations/personnel/by-project-group
 */
const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');

const BASE = '/api/admin/twin/student-violations';
const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '生效中' },
  { value: 'CLEARED', label: '已解除' },
  { value: 'EXPIRED', label: '已过期' },
  { value: 'SUPERSEDED', label: '已替换' },
  { value: 'PROCESSED', label: '已处理' },
];

const SOURCE_OPTIONS = [
  { value: 'MANUAL', label: '手动' },
  { value: 'CAGE_STATUS', label: '笼架联动' },
  { value: 'AUTO_STRANDED', label: '自动滞留' },
];

const STRATEGY_OPTIONS = [
  { value: 'SHOW_ONLY', label: '仅展示' },
  { value: 'ACK_READ', label: '确认阅读' },
  { value: 'ACK_PUZZLE', label: '拼图短语' },
  { value: 'QUIZ', label: '答题' },
  { value: 'SIGNATURE', label: '签名确认' },
];

/** 编辑态的三种到期方式（开单只接受 RELATIVE，不展示这一行） */
const EXPIRY_OPTIONS = [
  { value: 'KEEP', label: '保持不变' },
  { value: 'CLEAR', label: '清除到期' },
  { value: 'RELATIVE', label: '相对天数' },
];

const ENTER_LOCK_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'LOCKED', label: '已禁入' },
  { value: 'UNLOCKED', label: '可进入' },
];

/** 默认口径同 web DEFAULT_RECORDS_FILTERS：状态=生效中 + 是否禁入=已禁入 */
function freshFilters() {
  return { keyword: '', status: 'ACTIVE', source: '', enterLock: 'LOCKED' };
}

const ACTION_LABEL = { forbid: '立即禁入', every: '每次扫码提示', unlock: '验证后解禁' };

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

/** 统一解包：非 success 一律抛错（HTTP 200 + success:false 是业务失败，不能当成功） */
function unwrap(res) {
  const b = body(res);
  const code = Number(res && res.statusCode);
  if (code === 401 || code === 403) throw new Error((b && b.message) || '无权限访问');
  if (!b || b.success !== true) throw new Error((b && (b.message || b.msg)) || '请求失败');
  return b.data;
}

function req(options) {
  return springAuth.springRequest({
    url: BASE + (options.path || ''),
    method: options.method || 'GET',
    data: options.data || {},
  });
}

function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function labelOf(options, value) {
  const hit = options.find((o) => o.value === value);
  return hit ? hit.label : value;
}

function parseImageUrls(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

/* ─────────── 处置策略解析（与 web slots/dispositionTypes 同口径） ─────────── */

function strategyFromRow(row) {
  const dtype = String(row.dispositionType || '').toUpperCase();
  const maxEnter = row.maxEnterSuccess == null ? null : row.maxEnterSuccess;
  if (dtype === 'QUIZ') return { type: 'QUIZ', phrase: '' };
  if (dtype === 'ACK_READ') return { type: 'ACK_READ', phrase: '' };
  if (dtype === 'SIGNATURE') return { type: 'SIGNATURE', phrase: '' };
  if (dtype === 'SHOW_ONLY') return { type: 'SHOW_ONLY', phrase: '' };
  const phrase = String(row.interactiveChallenge || '').trim();
  const puzzle = dtype === 'ACK_PUZZLE' || phrase.length > 0;
  return { type: puzzle ? 'ACK_PUZZLE' : 'SHOW_ONLY', phrase: phrase };
}

function strategyLabel(type) {
  const hit = STRATEGY_OPTIONS.find((o) => o.value === type);
  return hit ? hit.label : type;
}

/** 与 web violationEnterLocked 同判据 */
function violationEnterLocked(row) {
  if (row.enterLocked != null) return !!row.enterLocked;
  if (row.status !== 'ACTIVE') return false;
  const max = row.maxEnterSuccess;
  const used = row.enterSuccessCount || 0;
  if (max != null && used >= max) return true;
  if (String(row.interactiveChallenge || '').trim() && !row.interactiveChallengeVerifiedAt) return true;
  return !!row.forbidEnter;
}

/** 到期副文案（与 web dueSecondaryLabel 同口径） */
function dueSecondaryLabel(row) {
  if (row.status === 'CLEARED' || row.status === 'PROCESSED') return '已解除';
  if (row.status === 'EXPIRED') return '已过期';
  if (row.expireAt) {
    const remain = Math.ceil((new Date(String(row.expireAt).replace(' ', 'T')).getTime() - Date.now()) / 86400000);
    if (remain <= 0) return '已过期';
    return remain === 1 ? '明天到期' : '剩 ' + remain + ' 天';
  }
  if (row.interactiveUnlockOnVerify) return '验证后解禁';
  if (strategyFromRow(row).type !== 'SHOW_ONLY') return '验证后解禁';
  if (row.forbidEnter) return '需人工解除';
  return '无日历到期';
}

/** 详情卡片（与 web summarizeDispositionForDetail 同口径） */
function detailRows(row) {
  const stg = strategyFromRow(row);
  const actions = [];
  if (row.forbidEnter) actions.push(ACTION_LABEL.forbid);
  if (row.showNoticeEveryScan) actions.push(ACTION_LABEL.every);
  if (row.interactiveUnlockOnVerify) actions.push(ACTION_LABEL.unlock);
  const max = row.maxEnterSuccess;
  return [
    { k: '记录 ID', v: '#' + row.id },
    { k: '关联规则', v: row.ruleName || '—' },
    { k: '处置策略', v: strategyLabel(stg.type) },
    { k: '拼图短语', v: stg.type === 'ACK_PUZZLE' ? stg.phrase || '—' : '—' },
    { k: '处置动作', v: actions.length ? actions.join('、') : '无' },
    { k: '进入计数', v: (row.enterSuccessCount || 0) + ' / ' + (max != null ? max : '不限') },
    { k: '到期', v: (row.expireAt ? String(row.expireAt).slice(0, 16) : '—') + '（' + dueSecondaryLabel(row) + '）' },
    { k: '创建', v: (String(row.createdAt || '').slice(0, 16) || '—') + (row.createdByDisplayName ? ' · ' + row.createdByDisplayName : '') },
    { k: '解除', v: row.clearedAt ? String(row.clearedAt).slice(0, 16) + (row.clearedByDisplayName ? ' · ' + row.clearedByDisplayName : '') : '—' },
  ];
}

/** 按批次连续分段（后端已按 batch_id DESC, id ASC 排好，只分段不排序） */
function groupByBatch(rows) {
  const blocks = [];
  rows.forEach((row) => {
    const raw = String(row.batchId || '').trim();
    const batchId = raw || 'SINGLE-' + row.id;
    const last = blocks[blocks.length - 1];
    if (last && last.batchId === batchId) last.rows.push(row);
    else blocks.push({ batchId, rows: [row] });
  });
  return blocks;
}

function decorate(row) {
  const images = parseImageUrls(row.imageUrls);
  return Object.assign({}, row, {
    __locked: violationEnterLocked(row),
    __images: images,
    __imageCount: images.length,
    __statusLabel: (STATUS_OPTIONS.find((s) => s.value === row.status) || {}).label || row.status || '—',
    __sourceLabel: (SOURCE_OPTIONS.find((s) => s.value === row.source) || {}).label || row.source || '—',
    __dueText: (row.expireAt ? String(row.expireAt).slice(0, 10) : '') + '·' + dueSecondaryLabel(row),
    __noticeText:
      row.noticeState === 'ACTIVE'
        ? '公示中'
        : row.noticeState === 'CLEARED'
          ? '已下板'
          : row.noticeState === 'WINDOW_ENDED'
            ? '展示已结束'
            : '未公示',
    __dispText: row.disposition
      ? [row.disposition.stateLabel, row.disposition.typeLabel].filter(Boolean).join(' · ')
      : '—',
    __dispDetail: (row.disposition && row.disposition.detail) || '',
    __createdText: String(row.createdAt || '').slice(5, 16),
    __canClear: row.status === 'ACTIVE',
    __canClearNotice: row.status === 'ACTIVE' && !row.noticeClearedAt,
  });
}

Page({
  data: {
    loading: true,
    error: '',
    rows: [],
    blocks: [],
    total: 0,
    page: 1,
    totalPages: 1,
    hasMore: false,
    loadingMore: false,

    /** f = 已生效（驱动列表与 chip）；d = 抽屉编辑副本，点「查看结果」才回写 f */
    f: freshFilters(),
    d: freshFilters(),
    searchDraft: '',
    filterSheetOpen: false,
    filterCount: 0,
    chips: [],
    options: {
      status: STATUS_OPTIONS,
      source: SOURCE_OPTIONS,
      enterLock: ENTER_LOCK_OPTIONS,
    },

    expandedId: 0,
    detailMap: {},
    detailLoading: 0,

    selectMode: false,
    selectedIds: [],
    /** 与 selectedIds 同源的 map，只为 WXML 里能用 {{selectedMap[row.id]}} 高亮（模板不支持 indexOf） */
    selectedMap: {},
    batchRunning: false,

    // 编辑器
    editorOpen: false,
    editorMode: 'create',
    editorId: 0,
    editorTargetName: '',
    form: {
      violationText: '',
      forbid: false,
      every: false,
      unlock: false,
      strategy: 'SHOW_ONLY',
      phrase: '',
      maxEnterSuccess: '',
      expireMode: 'RELATIVE',
      expireAfterDays: '',
      noticeLinkExpire: true,
      noticeDisplayDays: '',
    },
    strategyOptions: STRATEGY_OPTIONS,
    expiryOptions: EXPIRY_OPTIONS,
    editorSaving: false,
    // 开单来源 / 锁定方式（对齐 web RecordEditorView）
    editorSource: 'MANUAL',
    editorLockMode: 'single',
    // 文案模板快选
    templateOpen: false,
    templates: [],
    templateLoading: false,
    // 笼架联动：先选一条生效中的笼架违规父记录
    cageOpen: false,
    cageLoading: false,
    cageList: [],
    cagePicked: null,
    // 开单选人
    groupKeywordDraft: '',
    groupKeyword: '',
    groupOptions: [],
    groupSearching: false,
    members: [],
    memberChecked: [],
    memberMap: {},
    membersLoading: false,
  },

  onLoad() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'ADMIN')) {
      wx.showToast({ title: '需要管理员权限', icon: 'none' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 400);
      return;
    }
    this.loadList(false);
  },

  /* ─────────── 列表 ─────────── */

  loadList(append) {
    const self = this;
    const f = this.data.f;
    const keyword = f.keyword.trim();
    if (!append) this.setData({ loading: true, error: '' });

    const params = {};
    if (keyword) {
      // 关键词依赖展示名/规则名，留在前端收窄：拉全量再过滤（同 web），不分页
      params.limit = 500;
      params.page = 1;
    } else {
      params.page = this.data.page;
      params.pageSize = PAGE_SIZE;
    }
    if (f.status) params.statuses = f.status;
    if (f.source) params.sources = f.source;
    if (f.enterLock) params.lockedOnly = f.enterLock === 'LOCKED';

    req({ path: '', method: 'GET', data: params })
      .then((res) => {
        const d = unwrap(res) || {};
        let list = Array.isArray(d.list) ? d.list : [];
        const total = Number(d.total) || 0;
        if (keyword) {
          const kw = keyword.toLowerCase();
          list = list.filter(
            (r) =>
              String(r.targetUserDisplayName || '').toLowerCase().indexOf(kw) >= 0 ||
              String(r.targetUserId || '').toLowerCase().indexOf(kw) >= 0 ||
              String(r.ruleName || '').toLowerCase().indexOf(kw) >= 0
          );
        }
        const totalPages = keyword ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
        const pageRows = list.map(decorate);
        const rows = append ? (self.data.rows || []).concat(pageRows) : pageRows;
        const patch = {
          loading: false,
          loadingMore: false,
          error: '',
          rows,
          blocks: groupByBatch(rows),
          total,
          totalPages,
          hasMore: !keyword && self.data.page < totalPages,
        };
        // 追加下一页时保留展开态与勾选，避免翻到底部把已选清掉
        if (!append) {
          patch.selectedIds = [];
          patch.selectedMap = {};
          patch.expandedId = 0;
          patch.detailMap = {};
        }
        self.setData(patch);
      })
      .catch((err) => {
        self.setData({
          loading: false,
          loadingMore: false,
          error: (err && err.message) || '加载失败',
        });
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

  /* ─────────── 筛选 ─────────── */

  afterApply() {
    const f = this.data.f;
    this.setData({ filterCount: this.computeFilterCount(f), chips: this.buildChips(f) });
    this.reload();
  },

  /** 默认项（生效中 + 已禁入）不计入条件数，避免一进来就显示「筛选 2」 */
  computeFilterCount(f) {
    const def = freshFilters();
    let n = 0;
    if (f.status !== def.status) n += 1;
    if (f.source) n += 1;
    if (f.enterLock !== def.enterLock) n += 1;
    return n;
  },

  buildChips(f) {
    const def = freshFilters();
    const chips = [];
    if (f.status !== def.status) {
      chips.push({ k: 'status', t: f.status ? labelOf(STATUS_OPTIONS, f.status) : '全部状态' });
    }
    if (f.source) chips.push({ k: 'source', t: labelOf(SOURCE_OPTIONS, f.source) });
    if (f.enterLock !== def.enterLock) {
      chips.push({ k: 'enterLock', t: f.enterLock ? labelOf(ENTER_LOCK_OPTIONS, f.enterLock) : '禁入不限' });
    }
    return chips;
  },

  onRemoveChip(e) {
    const k = String(e.currentTarget.dataset.k || '');
    if (!k) return;
    const fresh = freshFilters();
    const f = Object.assign({}, this.data.f);
    const d = Object.assign({}, this.data.d);
    f[k] = fresh[k];
    d[k] = fresh[k];
    this.setData({ f: f, d: d });
    this.afterApply();
  },

  onSearchInput(e) {
    this.setData({ searchDraft: e.detail.value });
  },

  onSearchConfirm() {
    const v = this.data.searchDraft.trim();
    const f = Object.assign({}, this.data.f);
    const d = Object.assign({}, this.data.d);
    f.keyword = v;
    d.keyword = v;
    this.setData({ f: f, d: d });
    this.afterApply();
  },

  onSearchClear() {
    const f = Object.assign({}, this.data.f);
    const d = Object.assign({}, this.data.d);
    f.keyword = '';
    d.keyword = '';
    this.setData({ f: f, d: d, searchDraft: '' });
    this.afterApply();
  },

  openFilterSheet() {
    this.setData({ filterSheetOpen: true, d: Object.assign({}, this.data.f) });
  },

  closeFilterSheet() {
    this.setData({ filterSheetOpen: false });
  },

  onSheetPick(e) {
    const field = String(e.currentTarget.dataset.field || '');
    if (!field) return;
    const patch = {};
    patch['d.' + field] = String(e.detail.value || '');
    this.setData(patch);
  },

  onResetFilters() {
    const fresh = freshFilters();
    this.setData({ f: fresh, d: Object.assign({}, fresh), searchDraft: '', filterSheetOpen: false });
    this.afterApply();
  },

  applyFilters() {
    this.setData({ f: Object.assign({}, this.data.d), filterSheetOpen: false });
    this.afterApply();
  },

  /* ─────────── 详情 / 行操作 ─────────── */

  onToggleDetail(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    if (this.data.expandedId === id) {
      this.setData({ expandedId: 0 });
      return;
    }
    const detailMap = this.data.detailMap;
    if (detailMap[id]) {
      this.setData({ expandedId: id });
      return;
    }
    const self = this;
    const row = this.data.rows.find((r) => Number(r.id) === id);
    this.setData({ expandedId: id, detailLoading: id });
    req({ path: '/' + id + '/disposition-detail', method: 'GET' })
      .then((data) => {
        const next = Object.assign({}, self.data.detailMap);
        next[id] = Object.assign({ __base: row ? detailRows(row) : [] }, data || {});
        self.setData({ detailMap: next, detailLoading: 0 });
      })
      .catch(() => {
        const next = Object.assign({}, self.data.detailMap);
        next[id] = { __base: row ? detailRows(row) : [], __error: '处置明细加载失败' };
        self.setData({ detailMap: next, detailLoading: 0 });
      });
  },

  confirmThen(content, onOk) {
    wx.showModal({
      title: '确认',
      content: content,
      success: (res) => {
        if (res.confirm) onOk();
      },
    });
  },

  onClear(e) {
    const self = this;
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    this.confirmThen('解除后该条将不再在扫码弹窗展示，记录仍保留。确定？', () => {
      req({ path: '/' + id + '/clear', method: 'POST' })
        .then(() => {
          wx.showToast({ title: '已解除', icon: 'success' });
          self.loadList(false);
        })
        .catch((err) => wx.showToast({ title: (err && err.message) || '解除失败', icon: 'none' }));
    });
  },

  onClearNotice(e) {
    const self = this;
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    this.confirmThen('解除公告后该条不再上大屏公示，记录与禁入均不变。确定？', () => {
      req({ path: '/' + id + '/clear-notice', method: 'POST' })
        .then(() => {
          wx.showToast({ title: '已解除公告', icon: 'success' });
          self.loadList(false);
        })
        .catch((err) => wx.showToast({ title: (err && err.message) || '解除公告失败', icon: 'none' }));
    });
  },

  onDelete(e) {
    const self = this;
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    this.confirmThen('确定物理删除记录 #' + id + '？不可恢复。', () => {
      req({ path: '/' + id, method: 'DELETE' })
        .then(() => {
          wx.showToast({ title: '已删除', icon: 'success' });
          self.loadList(false);
        })
        .catch((err) => wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' }));
    });
  },

  onOpenModal(e) {
    const id = Number(e.currentTarget.dataset.id);
    const row = this.data.rows.find((r) => Number(r.id) === id);
    if (!row) return;
    wx.showActionSheet({
      itemList: ['编辑', '解除', '解除公告', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) this.openEditor(row);
        else if (res.tapIndex === 1) this.onClear({ currentTarget: { dataset: { id: id } } });
        else if (res.tapIndex === 2) this.onClearNotice({ currentTarget: { dataset: { id: id } } });
        else if (res.tapIndex === 3) this.onDelete({ currentTarget: { dataset: { id: id } } });
      },
      fail: () => {},
    });
  },

  onCreateTap() {
    this.openEditor(null);
  },

  onPreviewImage(e) {
    const rowIdx = Number(e.currentTarget.dataset.row);
    const url = e.currentTarget.dataset.url;
    const row = this.data.rows.find((r) => Number(r.id) === rowIdx);
    if (!row || !url) return;
    wx.previewImage({ urls: row.__images, current: url });
  },

  /* ─────────── 批量 ─────────── */

  toggleSelectMode() {
    this.setData({ selectMode: !this.data.selectMode, selectedIds: [], selectedMap: {} });
  },

  onToggleSelect(e) {
    const id = Number(e.currentTarget.dataset.id);
    const list = this.data.selectedIds.slice();
    const map = Object.assign({}, this.data.selectedMap);
    const idx = list.indexOf(id);
    if (idx >= 0) {
      list.splice(idx, 1);
      delete map[id];
    } else {
      list.push(id);
      map[id] = true;
    }
    this.setData({ selectedIds: list, selectedMap: map });
  },

  /** 卡片点击：批量模式下选中，否则展开详情 */
  onCardTap(e) {
    if (this.data.selectMode) {
      this.onToggleSelect(e);
      return;
    }
    this.onToggleDetail(e);
  },

  /** 批量动作：串行执行，逐条收集成败（同 web runBatch） */
  runBatch(verb, ids, pathOf, method) {
    const self = this;
    if (!ids.length) {
      wx.showToast({ title: '请先选择记录', icon: 'none' });
      return;
    }
    const content =
      verb === '解除'
        ? '将解除已选 ' + ids.length + ' 条记录：不再在扫码弹窗展示，记录仍保留。确定？'
        : '将物理删除已选 ' + ids.length + ' 条记录，不可恢复。确定？';
    this.confirmThen(content, () => {
      self.setData({ batchRunning: true });
      let ok = 0;
      const errors = [];
      const step = (i) => {
        if (i >= ids.length) {
          self.setData({ batchRunning: false, selectMode: false, selectedIds: [], selectedMap: {} });
          self.loadList(false);
          if (errors.length) {
            wx.showToast({ title: '已' + verb + ' ' + ok + ' 条，' + errors.length + ' 条失败：' + errors[0], icon: 'none' });
          } else {
            wx.showToast({ title: '已' + verb + ' ' + ok + ' 条', icon: 'success' });
          }
          return;
        }
        req({ path: pathOf(ids[i]), method: method })
          .then(() => {
            ok += 1;
          })
          .catch((err) => {
            errors.push((err && err.message) || '未知错误');
          })
          .then(() => step(i + 1));
      };
      step(0);
    });
  },

  onBatchClear() {
    this.runBatch('解除', this.data.selectedIds, (id) => '/' + id + '/clear', 'POST');
  },

  onBatchDelete() {
    this.runBatch('删除', this.data.selectedIds, (id) => '/' + id, 'DELETE');
  },

  /* ─────────── 编辑器 ─────────── */

  openEditor(row) {
    if (!row) {
      this.setData({
        editorOpen: true,
        editorMode: 'create',
        editorId: 0,
        editorTargetName: '',
        editorSource: 'MANUAL',
        editorLockMode: 'single',
        cagePicked: null,
        cageList: [],
        templates: [],
        groupKeywordDraft: '',
        groupKeyword: '',
        groupOptions: [],
        members: [],
        memberChecked: [],
        memberMap: {},
        form: {
          violationText: '',
          forbid: false,
          every: false,
          unlock: false,
          strategy: 'SHOW_ONLY',
          phrase: '',
          maxEnterSuccess: '',
          expireMode: 'RELATIVE',
          expireAfterDays: '',
          noticeLinkExpire: true,
          noticeDisplayDays: '',
        },
      });
      return;
    }
    const stg = strategyFromRow(row);
    this.setData({
      editorOpen: true,
      editorMode: 'edit',
      editorId: row.id,
      editorTargetName: (row.targetUserDisplayName || row.targetUserId) + ' · ' + row.__statusLabel,
      form: {
        violationText: row.violationText || '',
        forbid: !!row.forbidEnter,
        every: !!row.showNoticeEveryScan,
        unlock: !!row.interactiveUnlockOnVerify,
        strategy: stg.type,
        phrase: stg.phrase,
        maxEnterSuccess: row.maxEnterSuccess == null ? '' : String(row.maxEnterSuccess),
        expireMode: 'KEEP',
        expireAfterDays: '',
        noticeLinkExpire: row.noticeLinkExpire !== 0,
        noticeDisplayDays: row.noticeDisplayDays == null ? '' : String(row.noticeDisplayDays),
      },
    });
  },

  closeEditor() {
    if (this.data.editorSaving) return;
    this.setData({ editorOpen: false });
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    const form = Object.assign({}, this.data.form);
    form[field] = e.detail.value;
    this.setData({ form: form });
  },

  onFormToggle(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    const form = Object.assign({}, this.data.form);
    form[field] = !!e.detail.value;
    this.setData({ form: form });
  },

  onStrategyChange(e) {
    const value = String((e.detail && e.detail.value) || '');
    if (!value) return;
    const form = Object.assign({}, this.data.form);
    form.strategy = value;
    // 交互类策略若无禁入则沦为摆设（同 web ensureForbidForStrategy）
    if (value !== 'SHOW_ONLY') form.forbid = true;
    this.setData({ form: form });
  },

  onExpiryChange(e) {
    const value = String((e.detail && e.detail.value) || '');
    if (!value) return;
    const form = Object.assign({}, this.data.form);
    form.expireMode = value;
    this.setData({ form: form });
  },

  /* ── 开单来源 / 锁定方式 / 模板 / 笼架联动 ── */

  onSourceModeTap(e) {
    const v = String(e.currentTarget.dataset.v || '');
    if (!v || v === this.data.editorSource) return;
    this.setData({ editorSource: v, cagePicked: v === 'CAGE' ? this.data.cagePicked : null });
    if (v === 'CAGE' && !this.data.cageList.length) this.loadCageList();
  },

  onLockModeTap(e) {
    const v = String(e.currentTarget.dataset.v || '');
    if (!v || v === this.data.editorLockMode) return;
    const patch = { editorLockMode: v };
    // 切回单人时只保留第一个已选
    if (v === 'single' && this.data.memberChecked.length > 1) {
      const keep = this.data.memberChecked[0];
      const map = {};
      map[keep] = true;
      patch.memberChecked = [keep];
      patch.memberMap = map;
    }
    this.setData(patch);
  },

  openTemplateSheet() {
    const self = this;
    this.setData({ templateOpen: true, templateLoading: true });
    springAuth
      .springRequest({ url: BASE + '/text-templates', method: 'GET', data: {} })
      .then((res) => {
        self.setData({ templateLoading: false, templates: unwrap(res) || [] });
      })
      .catch((err) => {
        self.setData({ templateLoading: false, templates: [] });
        wx.showToast({ title: (err && err.message) || '模板加载失败', icon: 'none' });
      });
  },

  closeTemplateSheet() {
    this.setData({ templateOpen: false });
  },

  onPickTemplate(e) {
    const id = Number(e.currentTarget.dataset.id);
    const t = this.data.templates.find((x) => Number(x.id) === id);
    if (!t) return;
    const form = Object.assign({}, this.data.form);
    form.violationText = t.violationText || '';
    this.setData({ form: form, templateOpen: false });
  },

  loadCageList() {
    const self = this;
    this.setData({ cageOpen: true, cageLoading: true });
    springAuth
      .springRequest({ url: '/api/admin/twin/cage-status-violations', method: 'GET', data: {} })
      .then((res) => {
        const list = unwrap(res) || [];
        self.setData({
          cageLoading: false,
          cageList: list.filter((r) => String(r.status || '').toUpperCase() === 'ACTIVE'),
        });
      })
      .catch((err) => {
        self.setData({ cageLoading: false, cageList: [] });
        wx.showToast({ title: (err && err.message) || '笼架违规加载失败', icon: 'none' });
      });
  },

  closeCageSheet() {
    this.setData({ cageOpen: false });
  },

  /** 选父记录：列表行不带成员，取详情拿 members 当作目标人 */
  onPickCage(e) {
    const self = this;
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    springAuth
      .springRequest({ url: '/api/admin/twin/cage-status-violations/' + id, method: 'GET', data: {} })
      .then((res) => {
        const d = unwrap(res) || {};
        const members = Array.isArray(d.members) ? d.members : [];
        const checked = members.map((m) => String(m.userId || '')).filter(Boolean);
        const map = {};
        checked.forEach((u) => {
          map[u] = true;
        });
        self.setData({
          cageOpen: false,
          cagePicked: {
            id: id,
            label:
              (d.positionLabel || d.roomName || '') +
              (d.projectGroupName ? ' · ' + d.projectGroupName : '') +
              (d.statusCode ? ' · ' + d.statusCode : ''),
          },
          memberChecked: checked,
          memberMap: map,
        });
        if (!checked.length) wx.showToast({ title: '该父记录无成员，请改用手动选人', icon: 'none' });
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '笼架详情加载失败', icon: 'none' }));
  },

  /* ── 开单选人 ── */

  onGroupKeywordInput(e) {
    this.setData({ groupKeywordDraft: e.detail.value });
  },

  onGroupSearch() {
    const self = this;
    const kw = this.data.groupKeywordDraft.trim();
    if (!kw) {
      wx.showToast({ title: '请输入课题组关键词', icon: 'none' });
      return;
    }
    this.setData({ groupSearching: true, groupKeyword: kw });
    springAuth
      .springRequest({
        url: BASE + '/personnel/project-groups/search?keyword=' + encodeURIComponent(kw) + '&limit=30',
        method: 'GET',
        data: {},
      })
      .then((res) => {
        const list = unwrap(res) || [];
        self.setData({ groupSearching: false, groupOptions: list });
        if (!list.length) wx.showToast({ title: '未找到课题组', icon: 'none' });
      })
      .catch((err) => {
        self.setData({ groupSearching: false, groupOptions: [] });
        wx.showToast({ title: (err && err.message) || '搜索失败', icon: 'none' });
      });
  },

  onPickGroup(e) {
    const self = this;
    const name = String(e.currentTarget.dataset.name || '');
    if (!name) return;
    this.setData({ membersLoading: true, members: [], memberChecked: [], memberMap: {}, groupOptions: [] });
    springAuth
      .springRequest({
        url: BASE + '/personnel/by-project-group?projectGroupName=' + encodeURIComponent(name) + '&limit=500',
        method: 'GET',
        data: {},
      })
      .then((res) => {
        const list = unwrap(res) || [];
        self.setData({
          membersLoading: false,
          members: list.map((m) => ({
            userId: String(m.user_id || ''),
            name: m.name || String(m.user_id || ''),
          })),
        });
      })
      .catch((err) => {
        self.setData({ membersLoading: false, members: [] });
        wx.showToast({ title: (err && err.message) || '加载成员失败', icon: 'none' });
      });
  },

  onToggleMember(e) {
    const userId = String(e.currentTarget.dataset.userid || '');
    if (!userId) return;
    const single = this.data.editorLockMode === 'single';
    let list = this.data.memberChecked.slice();
    let map = Object.assign({}, this.data.memberMap);
    const idx = list.indexOf(userId);
    if (idx >= 0) {
      list.splice(idx, 1);
      delete map[userId];
    } else if (single) {
      list = [userId];
      map = {};
      map[userId] = true;
    } else {
      list.push(userId);
      map[userId] = true;
    }
    this.setData({ memberChecked: list, memberMap: map });
  },

  /** 处置策略 → 后端注册表编码 + 配置 JSON */
  buildDisposition(form) {
    const type = form.strategy;
    if (type === 'ACK_PUZZLE') {
      const phrase = String(form.phrase || '').trim();
      if (!phrase) throw new Error('请填写拼图短语');
      return { dispositionType: 'ACK_PUZZLE', dispositionConfigJson: JSON.stringify({ phrase: phrase }) };
    }
    if (type === 'QUIZ') {
      return {
        dispositionType: 'QUIZ',
        dispositionConfigJson: JSON.stringify({ questionBankId: 'default', drawCount: 3, passCount: 2, maxAttempts: 3 }),
      };
    }
    if (type === 'ACK_READ') {
      return { dispositionType: 'ACK_READ', dispositionConfigJson: null };
    }
    if (type === 'SIGNATURE') {
      return { dispositionType: 'SIGNATURE', dispositionConfigJson: JSON.stringify({ preamble: '' }) };
    }
    return { dispositionType: 'SHOW_ONLY', dispositionConfigJson: null };
  },

  buildCommon(form) {
    if (!String(form.violationText || '').trim()) throw new Error('请填写违规说明');
    if (!form.noticeLinkExpire && form.noticeDisplayDays === '') throw new Error('请填写公告展示天数');
    const disp = this.buildDisposition(form);
    return {
      violationText: String(form.violationText).trim(),
      forbidEnter: !!form.forbid,
      maxEnterSuccess: numOrNull(form.maxEnterSuccess),
      showNoticeEveryScan: !!form.every,
      interactiveChallenge: form.strategy === 'ACK_PUZZLE' ? String(form.phrase).trim() : null,
      interactiveUnlockOnVerify: !!form.unlock,
      dispositionType: disp.dispositionType,
      dispositionConfigJson: disp.dispositionConfigJson,
      noticeDisplayDays: form.noticeLinkExpire ? null : numOrNull(form.noticeDisplayDays),
      noticeLinkExpire: form.noticeLinkExpire ? 1 : 0,
    };
  },

  onSave() {
    const self = this;
    const form = this.data.form;
    let payload;
    try {
      payload = this.buildCommon(form);
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
      return;
    }

    const isCreate = this.data.editorMode === 'create';
    let path = '';
    let method = 'PUT';

    if (isCreate) {
      if (!this.data.memberChecked.length) {
        wx.showToast({ title: '请先选择违规人员', icon: 'none' });
        return;
      }
      payload.targetUserIds = this.data.memberChecked.slice();
      payload.imageUrls = [];
      payload.expireAfterDays = numOrNull(form.expireAfterDays);
      if (this.data.editorSource === 'CAGE' && this.data.cagePicked) {
        payload.cageViolationId = this.data.cagePicked.id;
      }
      path = '/batch';
      method = 'POST';
    } else {
      const row = this.data.rows.find((r) => Number(r.id) === Number(this.data.editorId));
      payload.imageUrls = row ? row.__images : [];
      payload.expireMode = form.expireMode;
      payload.expireAfterDays = form.expireMode === 'RELATIVE' ? numOrNull(form.expireAfterDays) : null;
      path = '/' + this.data.editorId;
    }

    this.setData({ editorSaving: true });
    springAuth
      .springRequest({ url: BASE + path, method: method, data: payload })
      .then((res) => {
        const b = body(res);
        if (!b || b.success !== true) {
          throw new Error((b && (b.message || b.msg)) || '保存失败');
        }
        const result = b.data;
        if (isCreate && result && result.failed && result.failed.length) {
          wx.showToast({
            title: '已创建 ' + result.createdCount + ' 条，' + result.failed.length + ' 条失败',
            icon: 'none',
          });
        } else {
          wx.showToast({ title: '已保存', icon: 'success' });
        }
        self.setData({ editorSaving: false, editorOpen: false });
        self.loadList(false);
      })
      .catch((err) => {
        self.setData({ editorSaving: false });
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      });
  },

  onRetry() {
    this.loadList(false);
  },
});
