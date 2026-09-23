/**
 * 进出流水（小程序版 /#/console/debug 的「进出流水」）
 * 数据源：GET /api/v1/twin/dashboard/debug/logs/filter（与 web DebugTablePage 同接口同参数）
 * 筛选形态：顶部只留「搜索框 + 筛选N」，条件收进底部抽屉（用户 2026-09-23 定）。
 * 未落地：web 用 10 万条卡映射建「豁免字典」补「延迟还卡」标记，手机端只用行级
 * is_keep_card/freeze_exempt_flag（少了「映射表里 freezeExemptFlag=1」这一路的补标）。
 */
const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');

const PAGE_SIZE = 20;
const PREVIEW_CHARS = 44;

const ACTION_OPTIONS = [
  { value: '', label: '全部' },
  { value: '1', label: '进入' },
  { value: '2', label: '离开' },
];

const CAMPUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: '浦东', label: '浦东' },
  { value: '浦西', label: '浦西' },
];

const FLOOR_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'E11A', label: 'E11A' },
  { value: 'E11B', label: 'E11B' },
  { value: '地下E11C', label: 'E11C' },
  { value: '1', label: '1F' },
  { value: '2', label: '2F' },
  { value: '3', label: '3F' },
  { value: '4', label: '4F' },
];

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 北京时区的 YYYY-MM-DD（手机上设备时区未必是 +8） */
function beijingDayKey(date) {
  const t = new Date((date || new Date()).getTime() + 8 * 3600 * 1000);
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
}

function freshFilters() {
  const today = beijingDayKey();
  return {
    keyword: '',
    actionType: '',
    campus: '',
    floor: '',
    roomName: '',
    excludeBlacklist: true,
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

function toBoolFlag(v) {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes';
  }
  return false;
}

function str(v) {
  return v == null ? '' : String(v).trim();
}

/** 操作来源：feed_source → 中文（同 web utils/accessLogFeedColumns） */
function labelOperationSource(log) {
  const src = str(log.feed_source != null ? log.feed_source : log.feedSource);
  if (!src) return Number(log.accessType) === 1 || Number(log.accessType) === 2 ? '未标注' : '—';
  if (src === 'WEB_SCAN') return 'Web 扫码';
  if (src === 'MOBILE_ROOM') return '移动端';
  if (src === 'LOCAL_SCAN') return '本地扫码';
  if (src === 'TWIN_AUTO_SIGNOUT') return '孪生·自动签退';
  if (src.indexOf('TWIN_') === 0) return '孪生系统';
  if (src === 'ARO_OFFICIAL_UNMATCHED') return '官方登记';
  return src;
}

function simplifyTriggerText(s) {
  return String(s)
    .replace(/roomId=\d+/gi, '')
    .replace(/channel=[^\s|；]+/gi, '')
    .replace(/state=[A-Za-z0-9_]+/gi, '')
    .replace(/autoRiskActionEnabled=[^；\s]+/gi, '门禁联动已关闭')
    .replace(/\s*[|｜]\s*/g, '；')
    .replace(/；+/g, '；')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 离开触发原因全文（同 web exitTriggerReasonFull） */
function exitTriggerReasonFull(log) {
  if (Number(log.accessType) !== 2) return '—';
  let det = str(log.feed_detail_zh != null ? log.feed_detail_zh : log.feedDetailZh);
  if (!det) {
    const sum = str(log.feed_summary_zh != null ? log.feed_summary_zh : log.feedSummaryZh);
    return sum ? simplifyTriggerText(sum) : '—';
  }
  det = simplifyTriggerText(det);
  const u = det.toUpperCase();
  if (u.indexOf('ACTIVATION_EXPIRE') >= 0 || u.indexOf('激活超时') >= 0) return '门禁激活超时后的自动离开';
  if (u.indexOf('仅 ARO') >= 0 || u.indexOf('门禁联动已关闭') >= 0 || u.indexOf('AUTO_RISK') >= 0) {
    return '仅完成离开登记；门禁联动已关闭，未撤权限、未冻结';
  }
  if (u.indexOf('FIRST_FREEZE') >= 0) return '与首次冻结策略相关';
  if (u.indexOf('SECOND_FREEZE') >= 0) return '与二次冻结策略相关';
  if (u.indexOf('MANUAL') >= 0) return '管理员手动';
  if (u.indexOf('SCHEDULE') >= 0 || u.indexOf('定时') >= 0) return '定时任务触发';
  const first = (det.split(/[；\n]/)[0] || det).trim();
  return first.length > 220 ? first.slice(0, 217) + '…' : first;
}

function decorate(log) {
  const full = exitTriggerReasonFull(log);
  const needsMore = Number(log.accessType) === 2 && full.length > PREVIEW_CHARS;
  const isOwn =
    toBoolFlag(log.is_own_card) ||
    toBoolFlag(log.isOwnCard) ||
    ((toBoolFlag(log.has_physical_card_mapping) || toBoolFlag(log.hasPhysicalCardMapping)) &&
      !toBoolFlag(log.is_borrowed_card) &&
      !toBoolFlag(log.isBorrowedCard));
  const keepForExit =
    toBoolFlag(log.is_keep_card) ||
    toBoolFlag(log.isKeepCard) ||
    toBoolFlag(log.freeze_exempt_flag) ||
    toBoolFlag(log.freezeExemptFlag);
  const at = Number(log.accessType);
  const idPart = [str(log.user_type_names), str(log.project_group_names)].filter(Boolean).join(' · ');
  const locPart = [str(log.area_name), str(log.room_name)].filter(Boolean).join(' ');
  return Object.assign({}, log, {
    __actionLabel: at === 1 ? '进入' : at === 2 ? '离开' : '未知',
    __sourceLabel: labelOperationSource(log),
    __exitFull: full,
    __exitPreview: needsMore ? full.slice(0, PREVIEW_CHARS) + '…' : full,
    __exitNeedsMore: needsMore,
    __ownCardLabel: isOwn ? '自带校园卡' : '领用公卡',
    __keepForExit: keepForExit,
    __idPart: idPart,
    __locPart: locPart || '—',
  });
}

Page({
  data: {
    loading: true,
    error: '',
    options: {
      actionType: ACTION_OPTIONS,
      campus: CAMPUS_OPTIONS,
      floor: FLOOR_OPTIONS,
    },
    /** f = 已生效（驱动列表与 chip）；d = 抽屉编辑副本，点「查看结果」才回写 f */
    f: freshFilters(),
    d: freshFilters(),

    searchDraft: '',
    filterSheetOpen: false,
    filterCount: 0,
    chips: [],

    records: [],
    total: 0,
    page: 1,
    totalPages: 1,
    hasMore: false,
    loadingMore: false,
    statEnter: 0,
    expandedKeys: {},
  },

  onLoad() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'STAFF')) {
      wx.showToast({ title: '需要教职工权限', icon: 'none' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 400);
      return;
    }
    this.afterApply();
  },

  /* ─────────── 列表 ─────────── */

  buildParams() {
    const f = this.data.f;
    const params = { excludeBlacklist: f.excludeBlacklist };
    if (f.keyword.trim()) params.keyword = f.keyword.trim();
    if (f.startDate) params.startTime = f.startDate + ' 00:00:00';
    if (f.endDate) params.endTime = f.endDate + ' 23:59:59';
    if (f.actionType) params.actionType = Number(f.actionType);
    if (f.campus.trim()) params.campus = f.campus.trim();
    if (f.floor) params.floor = f.floor;
    if (f.roomName.trim()) params.roomName = f.roomName.trim();
    return params;
  },

  loadList(append) {
    const self = this;
    const params = this.buildParams();
    if (!append) this.setData({ loading: true, error: '' });

    springAuth
      .springRequest({
        url: '/api/v1/twin/dashboard/debug/logs/filter',
        method: 'GET',
        data: Object.assign({ page: this.data.page, size: PAGE_SIZE }, params),
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
        // 后端形状：{ code, message, success, data: { data: [...], total: N } }
        // —— payload 是 b.data（对象），不是 b.data.data（那已经是行数组了）
        const payload = b.data && typeof b.data === 'object' ? b.data : {};
        const rows = Array.isArray(payload.data) ? payload.data : [];
        const total = Number(payload.total) || 0;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const decorated = rows.map(decorate);
        self.setData({
          loading: false,
          loadingMore: false,
          error: '',
          records: append ? (self.data.records || []).concat(decorated) : decorated,
          total,
          totalPages,
          hasMore: self.data.page < totalPages,
        });
      })
      .catch((err) => {
        self.setData({
          loading: false,
          loadingMore: false,
          error: (err && err.message) || '网络请求失败',
        });
      });

    // KPI 摘要：进入数（同过滤条件，失败静默，不阻塞列表）
    if (append) return;
    springAuth
      .springRequest({ url: '/api/v1/twin/dashboard/debug/stats', method: 'GET', data: params })
      .then((res) => {
        const b = body(res);
        if (!b || b.success !== true) return;
        // 同 web asMapData：stats 的 data 可能再套一层 { data: {...} }
        const raw = b.data;
        const d =
          raw && typeof raw === 'object' && !Array.isArray(raw) &&
          raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
            ? raw.data
            : raw;
        if (d) this.setData({ statEnter: Number(d.totalEnter) || 0 });
      })
      .catch(() => {});
  },

  reload() {
    this.setData({ page: 1, expandedKeys: {} });
    this.loadList(false);
  },

  /** 触底加载下一页（小程序不用上下页按钮） */
  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.setData({ loadingMore: true, page: this.data.page + 1 });
    this.loadList(true);
  },

  /* ─────────── 已选条件 chip ─────────── */

  afterApply() {
    const f = this.data.f;
    this.setData({ filterCount: this.computeFilterCount(f), chips: this.buildChips(f) });
    this.reload();
  },

  computeFilterCount(f) {
    const today = beijingDayKey();
    let n = 0;
    if (f.actionType) n += 1;
    if (f.campus) n += 1;
    if (f.floor) n += 1;
    if (f.roomName.trim()) n += 1;
    if (!f.excludeBlacklist) n += 1;
    if (f.startDate !== today || f.endDate !== today) n += 1;
    return n;
  },

  buildChips(f) {
    const today = beijingDayKey();
    const chips = [];
    if (f.actionType) chips.push({ k: 'actionType', t: f.actionType === '1' ? '进入' : '离开' });
    if (f.campus) chips.push({ k: 'campus', t: f.campus + '校区' });
    if (f.floor) {
      const hit = FLOOR_OPTIONS.find((o) => o.value === f.floor);
      chips.push({ k: 'floor', t: hit ? hit.label : f.floor });
    }
    if (f.roomName.trim()) chips.push({ k: 'roomName', t: '房号 ' + f.roomName.trim() });
    if (!f.excludeBlacklist) chips.push({ k: 'excludeBlacklist', t: '含黑名单' });
    if (f.startDate !== today || f.endDate !== today) {
      chips.push({ k: 'date', t: f.startDate.slice(5) + '~' + f.endDate.slice(5) });
    }
    return chips;
  },

  onRemoveChip(e) {
    const k = String(e.currentTarget.dataset.k || '');
    if (!k) return;
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

  /* ─────────── 筛选抽屉 ─────────── */

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

  onSheetBlacklistSwitch(e) {
    this.setData({ 'd.excludeBlacklist': !!e.detail.value });
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

  /* ─────────── 其他 ─────────── */

  toggleExitReason(e) {
    const key = String(e.currentTarget.dataset.key || '');
    if (!key) return;
    const next = Object.assign({}, this.data.expandedKeys);
    if (next[key]) delete next[key];
    else next[key] = true;
    this.setData({ expandedKeys: next });
  },

  onRetry() {
    this.loadList(false);
  },
});
