const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { refreshPendingBadges } = require('../../../utils/badgeSnapshotStore.js');
const { formatBadgeText } = require('../../../utils/pendingBadgeCounts.js');
const api = require('../../utils/studentReviewApi.js');
const mat = require('../../utils/materialStudentApi.js');
const { formatBeijingDateTimeFull, parseToTimestamp } = require('../../utils/beijingTime.js');

/** 与 Web studentReviewPoll.ts 同源 */
const PENDING_POLL_MS = 15000;

const TAB_LABELS = {
  material: '物资审核',
  scanDelay: '延迟免冻结',
  demands: '需求建议',
};

const STATUS_ZH = {
  DRAFT: '草稿',
  PENDING: '待审核',
  FIRST_OK: '初审通过',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  EXPIRED: '已过期',
  FULFILLED: '已出库',
  RECEIVED: '已完成',
};

/** 与 Web MaterialReviewPage statusBadge() 对齐：不同状态不同颜色 */
function statusTagClass(status) {
  switch ((status || '').toUpperCase()) {
    case 'PENDING':
    case 'FIRST_OK':
      return 'tag-warn';
    case 'APPROVED':
      return 'tag-approved';
    case 'REJECTED':
      return 'tag-rejected';
    case 'FULFILLED':
      return 'tag-fulfilled';
    case 'RECEIVED':
      return 'tag-received';
    default:
      return 'tag-muted';
  }
}

function readCurrentUserId() {
  try {
    const raw = wx.getStorageSync(springAuth.KEYS.USER_INFO);
    if (!raw) return '';
    const u = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const id = u && (u.id != null ? u.id : u.userId != null ? u.userId : u.username);
    return id != null ? String(id).trim() : '';
  } catch (e) {
    return '';
  }
}

function statusZh(s) {
  return STATUS_ZH[s] || s || '-';
}

function fmtTime(v) {
  return formatBeijingDateTimeFull(v);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function todayBeijingKey() {
  try {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const g = (t) => (parts.find((x) => x.type === t) || {}).value || '';
    return `${g('year')}-${pad2(Number(g('month')))}-${pad2(Number(g('day')))}`;
  } catch (e) {
    return '';
  }
}

function beijingDateKey(v) {
  const fmt = fmtTime(v);
  return fmt ? fmt.slice(0, 10) : '';
}

function isTodayBeijing(v) {
  const key = beijingDateKey(v);
  if (!key) return false;
  return key === todayBeijingKey();
}

function parseReviewerIds(jsonStr) {
  if (!jsonStr) return [];
  try {
    const arr = JSON.parse(jsonStr);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch (e) {
    return [];
  }
}

function buildItemReviewerMap(items) {
  const map = {};
  (items || []).forEach((item) => {
    const ids = [
      ...parseReviewerIds(item.reviewerIds),
      ...parseReviewerIds(item.secondReviewerIds),
    ];
    map[item.id] = ids;
  });
  return map;
}

function buildOptionReviewerMap(options) {
  const map = {};
  (options || []).forEach((opt) => {
    map[opt.id] = (opt.reviewerUserIds || []).map(String);
  });
  return map;
}

function isMyMaterialRequest(req, itemReviewerMap, userId) {
  if (!userId) return false;
  const lines = Array.isArray(req.lines) ? req.lines : [];
  return lines.some((line) => (itemReviewerMap[line.itemId] || []).includes(userId));
}

function isMyScanDelayOption(optionId, optionReviewerMap, userId) {
  if (!userId) return false;
  return (optionReviewerMap[optionId] || []).includes(userId);
}

function approveLabel(req) {
  if (!req) return '通过';
  if (req.status === 'FIRST_OK') return '复审通过';
  if (req.workflowType === 'DUAL_REVIEW') return '初审通过';
  return '通过并出库';
}

function isMaterialPending(s) {
  return s === 'PENDING' || s === 'FIRST_OK';
}

function mapMaterialRow(req) {
  const lines = Array.isArray(req.lines) ? req.lines : [];
  var firstLine = lines[0] || {};
  return {
    ...req,
    statusText: statusZh(req.status),
    statusTagClass: statusTagClass(req.status),
    createdAtText: fmtTime(req.createdAt),
    approveLabel: approveLabel(req),
    lineSummary: lines.map((l) => {
      var base = `${l.snapshotName || '物品'}×${l.qty || 0}`;
      var spec = mat.formatSpecLabel(l.specSnapshot);
      return spec ? `${base}（${spec}）` : base;
    }).join('、'),
    canReview: isMaterialPending(req.status),
    canRevoke: req.status === 'APPROVED' || req.status === 'FULFILLED',
    isPending: isMaterialPending(req.status),
    firstItemId: firstLine.itemId || 0,
    firstItemName: firstLine.snapshotName || '物品',
    firstSpecLabel: mat.formatSpecLabel(firstLine.specSnapshot) || '',
  };
}

/**
 * Group pending material requests by (first line itemId) then by specSnapshot.
 */
var SPEC_SUB_GROUP_LIMIT = 10;

function groupMaterialByItemSpec(list) {
  if (!list || !list.length) return [];
  var groupMap = {};
  list.forEach(function (req) {
    var key = req.firstItemId || 0;
    if (!groupMap[key]) {
      groupMap[key] = { itemId: key, itemName: req.firstItemName || '物品', specSubGroups: {} };
    }
    var specKey = req.firstSpecLabel || '__none__';
    if (!groupMap[key].specSubGroups[specKey]) {
      groupMap[key].specSubGroups[specKey] = { specLabel: req.firstSpecLabel || '', requests: [] };
    }
    groupMap[key].specSubGroups[specKey].requests.push(req);
  });
  return Object.keys(groupMap).map(function (k) {
    var allSubs = Object.keys(groupMap[k].specSubGroups).map(function (sk) {
      return {
        specLabel: groupMap[k].specSubGroups[sk].specLabel,
        requests: groupMap[k].specSubGroups[sk].requests,
      };
    });
    return {
      itemId: groupMap[k].itemId,
      itemName: groupMap[k].itemName,
      specSubGroupsAll: allSubs,
      specSubGroups: allSubs,
      specSubGroupsOverflow: allSubs.length > SPEC_SUB_GROUP_LIMIT ? allSubs.length - SPEC_SUB_GROUP_LIMIT : 0,
    };
  });
}

function applySpecGroupCollapse(groups, expandMap) {
  return (groups || []).map(function (grp) {
    var all = grp.specSubGroupsAll || grp.specSubGroups || [];
    var expanded = !!(expandMap && expandMap[grp.itemId]);
    if (expanded || all.length <= SPEC_SUB_GROUP_LIMIT) {
      return Object.assign({}, grp, {
        specSubGroups: all,
        specSubGroupsOverflow: 0,
      });
    }
    return Object.assign({}, grp, {
      specSubGroups: all.slice(0, SPEC_SUB_GROUP_LIMIT),
      specSubGroupsOverflow: all.length - SPEC_SUB_GROUP_LIMIT,
    });
  });
}

/** 给每个分组挂上 _collapsed 标记，供 WXML 控制物品组的展开/收起 */
function stampItemGroupCollapse(groups, collapseMap) {
  return (groups || []).map(function (grp) {
    return Object.assign({}, grp, {
      _collapsed: !!(collapseMap && collapseMap[grp.itemId]),
    });
  });
}

/** 把物资 specSubGroups 的 requests 拆成 _pendingReqs / _resolvedReqs，已审默认收起 */
function splitMaterialSubGroupsByStatus(subGroups) {
  return (subGroups || []).map(function (sub) {
    var pending = [];
    var resolved = [];
    (sub.requests || []).forEach(function (r) {
      if (r.canReview) pending.push(r); else resolved.push(r);
    });
    return Object.assign({}, sub, {
      _pendingReqs: pending,
      _resolvedReqs: resolved,
      _hasBoth: pending.length > 0 && resolved.length > 0,
      _resolvedCollapsed: true,
    });
  });
}

/** 把 scanDelay option group 的 items 拆成 _pendingItems / _historyItems，已审默认收起 */
function splitScanDelayGroupsByStatus(groups) {
  return (groups || []).map(function (grp) {
    var pending = [];
    var history = [];
    (grp.items || []).forEach(function (it) {
      if (it._kind === 'pending') pending.push(it); else history.push(it);
    });
    return Object.assign({}, grp, {
      _pendingItems: pending,
      _historyItems: history,
      _hasBoth: pending.length > 0 && history.length > 0,
      _historyCollapsed: true,
    });
  });
}

/** 找出全部已审（无待审卡片）的物品组，返回应自动折叠的 itemId map */
function buildMaterialAutoCollapseMap(rawGroups) {
  var map = {};
  (rawGroups || []).forEach(function (grp) {
    var hasPending = false;
    (grp.specSubGroupsAll || grp.specSubGroups || []).forEach(function (sub) {
      (sub.requests || []).forEach(function (r) {
        if (r.canReview) hasPending = true;
      });
    });
    if (!hasPending) map[grp.itemId] = true;
  });
  return map;
}

/** 找出全部已审（无待审项）的 scanDelay option 组，返回应自动折叠的 groupKey map */
function buildScanDelayAutoCollapseMap(rawGroups) {
  var map = {};
  (rawGroups || []).forEach(function (grp) {
    var hasPending = false;
    (grp.items || []).forEach(function (it) {
      if (it._kind === 'pending') hasPending = true;
    });
    if (!hasPending) map[grp.groupKey] = true;
  });
  return map;
}

/** 物资分组最终处理：spec截断 → status分离 → autoCollapse合并 → itemCollapse标记 */
function finalizeMaterialGrouped(rawGroups, expandMap, collapseMap) {
  var withSpecLimit = applySpecGroupCollapse(rawGroups, expandMap || {});
  var withStatusSplit = withSpecLimit.map(function (grp) {
    return Object.assign({}, grp, {
      specSubGroups: splitMaterialSubGroupsByStatus(grp.specSubGroups || []),
    });
  });
  // 全部已审的物品组自动折叠，但用户手动操作优先
  var autoCollapse = buildMaterialAutoCollapseMap(rawGroups);
  var mergedCollapse = Object.assign({}, autoCollapse, collapseMap || {});
  return stampItemGroupCollapse(withStatusSplit, mergedCollapse);
}

/** scanDelay分组最终处理：status分离 + autoCollapse */
function finalizeScanDelayGrouped(rawGroups, collapseMap) {
  var withStatusSplit = splitScanDelayGroupsByStatus(rawGroups);
  var autoCollapse = buildScanDelayAutoCollapseMap(rawGroups);
  var mergedCollapse = Object.assign({}, autoCollapse, collapseMap || {});
  return stampScanDelayGroupCollapse(withStatusSplit, mergedCollapse);
}

/** 给 scanDelay option 组挂上 _collapsed 标记 */
function stampScanDelayGroupCollapse(groups, collapseMap) {
  return (groups || []).map(function (grp) {
    return Object.assign({}, grp, {
      _collapsed: !!(collapseMap && collapseMap[grp.groupKey]),
    });
  });
}

function mapScanPendingRow(req) {
  const approved = req.approvedCount != null ? Number(req.approvedCount) : 0;
  const refSeq = req.referenceSeq != null ? Number(req.referenceSeq) : approved + 1;
  const name = req.subjectDisplayName || req.subjectUserId || '待审人员';
  const group = req.subjectGroupName || '未标注课题组';
  return {
    ...req,
    _kind: 'pending',
    createdAtText: fmtTime(req.createdAt),
    subjectLine: `${name} · ${group} · 历史已通过 ${approved} 次${refSeq > 0 ? `（本次第 ${refSeq} 次）` : ''}`,
  };
}

function mapScanHistoryRow(req) {
  const status = String(req.status || '').toUpperCase();
  return {
    ...req,
    _kind: 'history',
    createdAtText: fmtTime(req.createdAt),
    reviewedAtText: fmtTime(req.reviewedAt),
    statusText: status === 'APPROVED' ? '已通过' : status === 'REJECTED' ? '已拒绝' : status === 'EXPIRED' ? '已过期' : status,
    subjectLine: `${req.subjectDisplayName || req.subjectUserId || '-'} · ${req.subjectGroupName || '未标注课题组'}`,
    isApproved: status === 'APPROVED',
    isExpired: status === 'EXPIRED',
  };
}

function mapDemandRow(d) {
  return {
    ...d,
    createdAtText: fmtTime(d.createdAt),
    statusText: Number(d.status) === 1 ? '已处理' : '未处理',
    open: Number(d.status) !== 1,
  };
}

function sortByCreatedDesc(a, b) {
  const ta = parseToTimestamp(a.createdAt, 0);
  const tb = parseToTimestamp(b.createdAt, 0);
  return tb - ta;
}

/** 与 Web scanDelayReviewDisplay.ts 同源：选项颜色调色板 */
var SCAN_DELAY_OPTION_COLORS = [
  '#d97706', '#4a7cac', '#16a34a', '#ca8a04',
  '#dc2626', '#2563eb', '#0e7490', '#b45309',
];

function hashGroupKey(key) {
  var h = 0;
  for (var i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function scanDelayOptionColor(key) {
  return SCAN_DELAY_OPTION_COLORS[hashGroupKey(key) % SCAN_DELAY_OPTION_COLORS.length];
}

/** 与 Web groupScanDelayByOption() 同源：按选项分组 */
function groupScanDelayByOption(list) {
  if (!list || !list.length) return [];
  var map = {};
  list.forEach(function (item) {
    var key = (item.optionLabel || '').trim() || (item.optionId ? 'option:' + item.optionId : '__default__');
    if (!map[key]) map[key] = [];
    map[key].push(item);
  });
  return Object.keys(map)
    .sort(function (a, b) { return a.localeCompare(b, 'zh-CN'); })
    .map(function (key) {
      var items = map[key];
      return {
        groupKey: key,
        optionLabel: items[0].optionLabel || '延迟免冻结',
        count: items.length,
        color: scanDelayOptionColor(key),
        items: items,
      };
    });
}

function splitTodayHistory(list) {
  const today = [];
  const history = [];
  (list || []).forEach((item) => {
    if (isTodayBeijing(item.createdAt)) today.push(item);
    else history.push(item);
  });
  return { today, history };
}

function buildFilteredMaterialLists(pendingRaw, finishedRaw, itemReviewerMap, userId) {
  const pending = (pendingRaw || [])
    .filter((req) => isMyMaterialRequest(req, itemReviewerMap, userId))
    .map(mapMaterialRow);
  const finished = ((finishedRaw && finishedRaw.data) || [])
    .filter((req) => isMyMaterialRequest(req, itemReviewerMap, userId))
    .map(mapMaterialRow);
  const merged = [...pending, ...finished].sort(sortByCreatedDesc);
  const groups = splitTodayHistory(merged);
  // 历史中的待审项独立分组，避免混入已审结历史被遗漏
  const historyPending = groups.history.filter((r) => r.isPending);
  const historyDone = groups.history.filter((r) => !r.isPending);
  // 与 Web 对齐：今天区全量分组（含 pending + 非 pending），历史已审区也分组
  const materialGroupedToday = groupMaterialByItemSpec(groups.today);
  const materialGroupedHistoryPending = groupMaterialByItemSpec(historyPending);
  const materialGroupedHistoryDone = groupMaterialByItemSpec(historyDone);
  return { merged, pendingFiltered: pending, ...groups, historyPending, historyDone, materialGroupedToday, materialGroupedHistoryPending, materialGroupedHistoryDone };
}

function buildFilteredScanDelayLists(pendingRaw, historyRaw, optionReviewerMap, userId) {
  const pending = (pendingRaw || [])
    .filter((req) => isMyScanDelayOption(req.optionId, optionReviewerMap, userId))
    .map(mapScanPendingRow);
  const history = (historyRaw || [])
    .filter((req) => isMyScanDelayOption(req.optionId, optionReviewerMap, userId) && !!req.reviewedBy)
    .map(mapScanHistoryRow);
  const merged = [...pending, ...history].sort(sortByCreatedDesc);
  const groups = splitTodayHistory(merged);
  const scanDelayGroupedToday = groupScanDelayByOption(groups.today);
  const scanDelayGroupedHistory = groupScanDelayByOption(groups.history);
  return { merged, pendingFiltered: pending, ...groups, scanDelayGroupedToday, scanDelayGroupedHistory };
}

function normalizeTab(raw) {
  const t = raw ? String(raw) : 'material';
  if (t === 'scanDelay' || t === 'demands') return t;
  return 'material';
}

function syncTabMeta(rawCounts) {
  const c = rawCounts || {};
  return {
    tabLabels: { ...TAB_LABELS },
    tabBadges: {
      material: formatBadgeText(c.filteredMaterialPending),
      scanDelay: formatBadgeText(c.filteredScanDelayPending),
      demands: formatBadgeText(c.openDemand),
    },
  };
}

function demandEntryStatusText(visible, loading) {
  if (loading) return '…';
  return visible ? '已开启' : '已关闭';
}

function pushGlobalReviewBadges() {
  void refreshPendingBadges({ force: true });
}

Page({
  data: {
    activeTab: 'material',
    loading: false,
    canDelete: false,
    demandEntryVisible: true,
    demandEntryStatusText: '已开启',
    toggleDemandLoading: false,
    materialList: [],
    materialToday: [],
    materialHistoryPending: [],
    materialHistoryDone: [],
    materialHistory: [],
    materialTodayOpen: true,
    materialHistoryPendingOpen: true,
    materialHistoryDoneOpen: false,
    materialGroupedToday: [],
    materialGroupedHistoryPending: [],
    materialGroupedHistoryDone: [],
    materialSpecExpand: {},
    materialItemCollapseMap: {},
    scanDelayList: [],
    scanDelayToday: [],
    scanDelayHistory: [],
    scanDelayTodayOpen: true,
    scanDelayHistoryOpen: false,
    scanDelayGroupedToday: [],
    scanDelayGroupedHistory: [],
    scanDelayGroupCollapseMap: {},
    scanDelayPendingCount: 0,
    demands: [],
    counts: {
      pendingMaterialRaw: 0,
      finishedMaterialRaw: 0,
      scanDelayRaw: 0,
      openDemand: 0,
    },
    tabLabels: { ...TAB_LABELS },
    tabBadges: {
      material: '',
      scanDelay: '',
      demands: '',
    },
    autoApproveVisible: false,
    autoApproveKind: 'scanDelay',
  },

  onLoad(options) {
    const tab = normalizeTab(options && options.tab);
    if (tab !== this.data.activeTab) {
      this.setData({ activeTab: tab });
    }
  },

  onShow() {
    this._alive = true;
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!hasMinRole(role, 'STAFF')) {
      wx.showToast({ title: '需要教职工权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/studentReviewHub/index', role, 'STAFF')) return;
    this.setData({ canDelete: hasMinRole(role, 'SUPER_ADMIN') });
    this._currentUserId = readCurrentUserId();
    this.loadDashboard();
    this.startPendingPoll();
  },

  onHide() {
    this._alive = false;
    this.stopPendingPoll();
  },

  onUnload() {
    this._alive = false;
    this.stopPendingPoll();
  },

  startPendingPoll() {
    this.stopPendingPoll();
    this._pollTimer = setInterval(() => {
      this.loadDashboard({ silent: true });
    }, PENDING_POLL_MS);
  },

  stopPendingPoll() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  onPullDownRefresh() {
    this.loadDashboard().finally(() => wx.stopPullDownRefresh());
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
  },

  toggleMaterialToday() {
    this.setData({ materialTodayOpen: !this.data.materialTodayOpen });
  },

  toggleMaterialHistoryPending() {
    this.setData({ materialHistoryPendingOpen: !this.data.materialHistoryPendingOpen });
  },

  toggleMaterialHistoryDone() {
    this.setData({ materialHistoryDoneOpen: !this.data.materialHistoryDoneOpen });
  },

  onExpandMaterialSpecGroups(e) {
    var itemId = e.currentTarget.dataset.itemId;
    if (itemId == null) return;
    var expandMap = Object.assign({}, this.data.materialSpecExpand || {});
    expandMap[itemId] = true;
    var todayAll = this.data.materialToday || [];
    var historyPending = this.data.materialHistoryPending || [];
    var collapseMap = this.data.materialItemCollapseMap || {};
    this.setData({
      materialSpecExpand: expandMap,
      materialGroupedToday: finalizeMaterialGrouped(groupMaterialByItemSpec(todayAll), expandMap, collapseMap),
      materialGroupedHistoryPending: finalizeMaterialGrouped(groupMaterialByItemSpec(historyPending), expandMap, collapseMap),
    });
  },

  /** 切换单个物品分组的展开/收起 */
  onToggleMaterialItemGroup(e) {
    var itemId = e.currentTarget.dataset.itemId;
    if (itemId == null) return;
    var collapseMap = Object.assign({}, this.data.materialItemCollapseMap || {});
    collapseMap[itemId] = !collapseMap[itemId];
    // 更新三个分区的分组数据，打上 _collapsed 标记
    var expandMap = this.data.materialSpecExpand || {};
    var todayAll = this.data.materialToday || [];
    var historyPending = this.data.materialHistoryPending || [];
    var historyDone = this.data.materialHistoryDone || [];
    this.setData({
      materialItemCollapseMap: collapseMap,
      materialGroupedToday: finalizeMaterialGrouped(groupMaterialByItemSpec(todayAll), expandMap, collapseMap),
      materialGroupedHistoryPending: finalizeMaterialGrouped(groupMaterialByItemSpec(historyPending), expandMap, collapseMap),
      materialGroupedHistoryDone: finalizeMaterialGrouped(groupMaterialByItemSpec(historyDone), {}, collapseMap),
    });
  },

  /** 切换物资「已审核」子区的展开/收起 */
  onToggleMaterialResolved(e) {
    var itemId = e.currentTarget.dataset.itemId;
    var specLabel = e.currentTarget.dataset.specLabel || '';
    if (itemId == null) return;
    var self = this;
    function toggleIn(groups) {
      return (groups || []).map(function (grp) {
        if (grp.itemId !== itemId) return grp;
        return Object.assign({}, grp, {
          specSubGroups: (grp.specSubGroups || []).map(function (sub) {
            if (sub.specLabel !== specLabel) return sub;
            return Object.assign({}, sub, { _resolvedCollapsed: !sub._resolvedCollapsed });
          }),
        });
      });
    }
    self.setData({
      materialGroupedToday: toggleIn(self.data.materialGroupedToday),
      materialGroupedHistoryPending: toggleIn(self.data.materialGroupedHistoryPending),
      materialGroupedHistoryDone: toggleIn(self.data.materialGroupedHistoryDone),
    });
  },

  /** 切换延迟免冻结 option 组的展开/收起 */
  onToggleScanDelayGroup(e) {
    var groupKey = e.currentTarget.dataset.groupKey;
    if (!groupKey) return;
    var map = Object.assign({}, this.data.scanDelayGroupCollapseMap || {});
    map[groupKey] = !map[groupKey];
    var scanDelayToday = this.data.scanDelayToday || [];
    var scanDelayHistory = this.data.scanDelayHistory || [];
    this.setData({
      scanDelayGroupCollapseMap: map,
      scanDelayGroupedToday: finalizeScanDelayGrouped(groupScanDelayByOption(scanDelayToday), map),
      scanDelayGroupedHistory: finalizeScanDelayGrouped(groupScanDelayByOption(scanDelayHistory), map),
    });
  },

  /** 切换延迟免冻结「已审核」子区的展开/收起 */
  onToggleScanDelayHistory(e) {
    var groupKey = e.currentTarget.dataset.groupKey;
    if (!groupKey) return;
    var self = this;
    function toggleIn(groups) {
      return (groups || []).map(function (grp) {
        if (grp.groupKey !== groupKey) return grp;
        return Object.assign({}, grp, { _historyCollapsed: !grp._historyCollapsed });
      });
    }
    self.setData({
      scanDelayGroupedToday: toggleIn(self.data.scanDelayGroupedToday),
      scanDelayGroupedHistory: toggleIn(self.data.scanDelayGroupedHistory),
    });
  },

  toggleMaterialHistory() {
    this.setData({ materialHistoryOpen: !this.data.materialHistoryOpen });
  },

  toggleScanDelayToday() {
    this.setData({ scanDelayTodayOpen: !this.data.scanDelayTodayOpen });
  },

  toggleScanDelayHistory() {
    this.setData({ scanDelayHistoryOpen: !this.data.scanDelayHistoryOpen });
  },

  async loadDashboard(opts = {}) {
    const silent = !!(opts && opts.silent);
    if (!silent) this.setData({ loading: true });
    try {
      const userId = this._currentUserId || readCurrentUserId();
      const results = await Promise.all([
        api.fetchPendingMaterialRequests(),
        api.fetchFinishedMaterialRequests({ page: 1, size: 50 }),
        api.fetchPendingScanDelayRequests(),
        api.fetchScanDelayHistory(100),
        api.fetchAllMaterialDemands({ page: 1, size: 200 }),
        api.fetchDemandEntryVisible(),
        api.fetchAdminMaterialItems(),
        api.fetchScanDelayOptions(),
      ]);
      const pendingRaw = results[0];
      const finishedRes = results[1];
      const scanDelayRaw = results[2];
      const historyRaw = results[3];
      const demandsRes = results[4];
      const demandEntryVisible = results[5];
      const allItems = results[6];
      const scanOptions = results[7];

      // 审核人姓名映射（历史卡片显示）
      let reviewerNameMap = {};
      try {
        const reviewers = await api.fetchEligibleReviewers();
        (reviewers || []).forEach(function (r) {
          if (r && r.userId) reviewerNameMap[String(r.userId)] = r.displayName || r.userName || r.userId;
        });
      } catch (e) { /* 非关键，静默失败 */ }

      const itemReviewerMap = buildItemReviewerMap(allItems);
      const optionReviewerMap = buildOptionReviewerMap(scanOptions);

      const materialView = buildFilteredMaterialLists(pendingRaw, finishedRes, itemReviewerMap, userId);
      const scanView = buildFilteredScanDelayLists(scanDelayRaw, historyRaw, optionReviewerMap, userId);
      const demands = ((demandsRes && demandsRes.data) || []).map(mapDemandRow);

      const counts = {
        pendingMaterialRaw: (pendingRaw || []).length,
        finishedMaterialRaw: ((finishedRes && finishedRes.data) || []).length,
        scanDelayRaw: (scanDelayRaw || []).length,
        openDemand: demands.filter((d) => d.open).length,
        /** 与 Web filteredMaterialPendingCount 同源：仅统计当前用户作为审核人的待审数量 */
        filteredMaterialPending: materialView.pendingFiltered.length,
        /** 与 Web filteredScanDelayPending.length 同源 */
        filteredScanDelayPending: scanView.pendingFiltered.length,
      };

      if (!this._alive) return;

      // 给历史项附加审核人姓名
      var enrichReviewer = function (list) {
        return (list || []).map(function (r) {
          var ids = parseReviewerIds(r.reviewerIds);
          var name = '';
          for (var i = 0; i < ids.length; i++) {
            var n = reviewerNameMap[ids[i]];
            if (n) { name = n; break; }
          }
          return Object.assign({}, r, { reviewerName: name || (r.reviewedBy || '') });
        });
      };

      var expandMap = this.data.materialSpecExpand || {};
      var collapseMap = this.data.materialItemCollapseMap || {};
      this.setData({
        materialList: materialView.merged,
        materialToday: materialView.today,
        materialHistoryPending: enrichReviewer(materialView.historyPending),
        materialHistoryDone: enrichReviewer(materialView.historyDone),
        materialHistory: enrichReviewer(materialView.history),
        materialGroupedToday: finalizeMaterialGrouped(materialView.materialGroupedToday, expandMap, collapseMap),
        materialGroupedHistoryPending: finalizeMaterialGrouped(materialView.materialGroupedHistoryPending, expandMap, collapseMap),
        materialGroupedHistoryDone: finalizeMaterialGrouped(materialView.materialGroupedHistoryDone, {}, collapseMap),
        scanDelayList: scanView.merged,
        scanDelayToday: scanView.today,
        scanDelayHistory: scanView.history,
        scanDelayGroupedToday: finalizeScanDelayGrouped(scanView.scanDelayGroupedToday, this.data.scanDelayGroupCollapseMap || {}),
        scanDelayGroupedHistory: finalizeScanDelayGrouped(scanView.scanDelayGroupedHistory, this.data.scanDelayGroupCollapseMap || {}),
        scanDelayPendingCount: scanView.pendingFiltered.length,
        demands,
        demandEntryVisible,
        demandEntryStatusText: demandEntryStatusText(demandEntryVisible, false),
        reviewerNameMap,
        counts,
        ...syncTabMeta(counts),
      });
      if (!silent) {
        pushGlobalReviewBadges();
      }
    } catch (e) {
      if (!silent) {
        wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      }
    } finally {
      if (!silent && this._alive) this.setData({ loading: false });
    }
  },

  async onMaterialApprove(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showLoading({ title: '处理中…', mask: true });
    try {
      await api.approveMaterialRequest(id);
      // 保存后仅合并/移除当前行，禁止整表 load；post-save-no-full-refresh.mdc
      this.removeMaterialRow(id);
      wx.showToast({ title: '已通过', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async onMaterialReject(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showLoading({ title: '处理中…', mask: true });
    try {
      await api.rejectMaterialRequest(id);
      this.removeMaterialRow(id);
      wx.showToast({ title: '已拒绝', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async onMaterialDelete(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || !this.data.canDelete) return;
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '删除申领',
        content: '确定删除此申领单？',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!ok) return;
    wx.showLoading({ title: '删除中…', mask: true });
    try {
      await api.deleteMaterialRequest(id);
      this.removeMaterialRow(id);
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '删除失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async onMaterialRevoke(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '撤销审核',
        content: '撤销此审核？申领将回到待审状态，库存将回退。',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!ok) return;
    wx.showLoading({ title: '撤销中…', mask: true });
    try {
      await api.revokeMaterialRequest(id);
      // 从本地列表移除（后端已回退到待审，刷新后重新出现在待审列表）
      this.removeMaterialRow(id);
      wx.showToast({ title: '已撤销，回退待审', icon: 'success' });
      // 刷新以拉取最新待审列表（被撤销的项会重新出现在待审中）
      this.loadDashboard({ silent: true });
    } catch (err) {
      wx.showToast({ title: err.message || '撤销失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  reviewerNameFor(userId) {
    const map = this.data.reviewerNameMap || {};
    const uid = String(userId || '');
    return map[uid] || uid || '—';
  },

  removeMaterialRow(id) {
    const sid = String(id);
    const filterOut = (list) => (list || []).filter((r) => String(r.id) !== sid);
    const materialList = filterOut(this.data.materialList);
    const materialToday = filterOut(this.data.materialToday);
    const materialHistory = filterOut(this.data.materialHistory);
    const materialHistoryPending = filterOut(this.data.materialHistoryPending);
    const materialHistoryDone = filterOut(this.data.materialHistoryDone);
    const filteredMaterialPending = materialList.filter((r) => r.canReview).length;
    const counts = {
      ...this.data.counts,
      pendingMaterialRaw: Math.max(0, Number(this.data.counts.pendingMaterialRaw || 0) - 1),
      filteredMaterialPending,
    };
    // Rebuild grouped data after removal
    var expandMap = this.data.materialSpecExpand || {};
    var collapseMap = this.data.materialItemCollapseMap || {};
    var materialGroupedToday = finalizeMaterialGrouped(
      groupMaterialByItemSpec(materialToday), expandMap, collapseMap);
    var materialGroupedHistoryPending = finalizeMaterialGrouped(
      groupMaterialByItemSpec(materialHistoryPending.filter(function (r) { return r.isPending; })),
      expandMap, collapseMap);
    var materialGroupedHistoryDone = finalizeMaterialGrouped(
      groupMaterialByItemSpec(materialHistoryDone), {}, collapseMap);
    this.setData({
      materialList,
      materialToday,
      materialHistory,
      materialHistoryPending,
      materialHistoryDone,
      materialGroupedToday,
      materialGroupedHistoryPending,
      materialGroupedHistoryDone,
      counts,
      ...syncTabMeta(counts),
    });
    pushGlobalReviewBadges();
  },

  async onScanDelayApprove(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    wx.showLoading({ title: '处理中…', mask: true });
    try {
      await api.reviewScanDelayRequest(id, true);
      this.removeScanDelayRow(id);
      wx.showToast({ title: '已通过并授予免冻结', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async onScanDelayReject(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    wx.showLoading({ title: '处理中…', mask: true });
    try {
      await api.reviewScanDelayRequest(id, false, '已拒绝');
      this.removeScanDelayRow(id);
      wx.showToast({ title: '已拒绝', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  removeScanDelayRow(id) {
    const filterOut = (list) => (list || []).filter((r) => Number(r.id) !== Number(id));
    const scanDelayList = filterOut(this.data.scanDelayList);
    const scanDelayToday = filterOut(this.data.scanDelayToday);
    const scanDelayHistory = filterOut(this.data.scanDelayHistory);
    var sdCollapseMap = this.data.scanDelayGroupCollapseMap || {};
    const scanDelayGroupedToday = finalizeScanDelayGrouped(groupScanDelayByOption(scanDelayToday), sdCollapseMap);
    const scanDelayGroupedHistory = finalizeScanDelayGrouped(groupScanDelayByOption(scanDelayHistory), sdCollapseMap);
    const scanDelayPendingCount = scanDelayList.filter((r) => r._kind === 'pending').length;
    const counts = {
      ...this.data.counts,
      scanDelayRaw: Math.max(0, Number(this.data.counts.scanDelayRaw || 0) - 1),
      filteredScanDelayPending: scanDelayPendingCount,
    };
    this.setData({
      scanDelayList,
      scanDelayToday,
      scanDelayHistory,
      scanDelayGroupedToday,
      scanDelayGroupedHistory,
      scanDelayPendingCount,
      counts,
      ...syncTabMeta(counts),
    });
    pushGlobalReviewBadges();
  },

  async onDemandResolve(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    wx.showLoading({ title: '处理中…', mask: true });
    try {
      await api.resolveMaterialDemand(id);
      const demands = (this.data.demands || []).map((d) =>
        Number(d.id) === id ? { ...d, status: 1, statusText: '已处理', open: false } : d,
      );
      const openDemand = demands.filter((d) => d.open).length;
      const counts = { ...this.data.counts, openDemand };
      this.setData({
        demands,
        counts,
        ...syncTabMeta(counts),
      });
      pushGlobalReviewBadges();
      wx.showToast({ title: '已标记', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onOpenScanDelayAutoApprove() {
    this.setData({ autoApproveVisible: true, autoApproveKind: 'scanDelay' });
  },

  onOpenMaterialAutoApprove() {
    this.setData({ autoApproveVisible: true, autoApproveKind: 'material' });
  },

  onCloseAutoApprove() {
    this.setData({ autoApproveVisible: false });
  },

  onAutoApproveRunSuccess() {
    this.loadDashboard();
  },

  async onToggleDemandEntry() {
    if (this.data.toggleDemandLoading) return;
    this.setData({
      toggleDemandLoading: true,
      demandEntryStatusText: demandEntryStatusText(this.data.demandEntryVisible, true),
    });
    try {
      const data = await api.toggleDemandEntryVisible();
      const demandEntryVisible = !!(data && data.visible);
      this.setData({
        demandEntryVisible,
        demandEntryStatusText: demandEntryStatusText(demandEntryVisible, false),
      });
      wx.showToast({ title: demandEntryVisible ? '入口已开启' : '入口已关闭', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: e.message || '切换失败', icon: 'none' });
    } finally {
      this.setData({
        toggleDemandLoading: false,
        demandEntryStatusText: demandEntryStatusText(this.data.demandEntryVisible, false),
      });
    }
  },
});
