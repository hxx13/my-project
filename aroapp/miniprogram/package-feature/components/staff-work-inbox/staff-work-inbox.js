const springAuth = require('../../../utils/springAuth.js');
const {
  refreshPendingBadges: pullPendingBadgeSnapshot,
  peekPendingBadges,
} = require('../../../utils/badgeSnapshotStore.js');
const { formatBadgeText } = require('../../../utils/pendingBadgeCounts.js');
const { shouldRefreshOnShow } = require('../../../utils/pageShowRefresh.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const { resolveMediaUrlsForDisplay } = require('../../utils/workorderMedia.js');
const { fetchCapabilitySummaryMap } = require('../../utils/capabilitySummary.js');
const inboxKindRoutes = require('../../utils/inboxKindRoutes.js');
const inboxCardTheme = require('../../utils/inboxCardTheme.js');
const notificationReadSync = require('../../utils/notificationReadSync.js');

function getHostTabBar() {
  const pages = getCurrentPages();
  const cur = pages && pages.length ? pages[pages.length - 1] : null;
  return cur && typeof cur.getTabBar === 'function' ? cur.getTabBar() : null;
}

function parseResponse(res) {
  const { statusCode, data } = res;
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false, message: body || '响应解析失败' };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || `请求失败(${statusCode})` };
  }
  return { ok: true, body };
}

function toTextTime(v) {
  if (!v) return '-';
  return String(v).replace('T', ' ').slice(0, 19);
}

function claimStatusText(s) {
  if (s === 'PENDING') return '待出库';
  if (s === 'FULFILLED') return '已完成';
  if (s === 'WITHDRAWN') return '已撤回';
  return s || '-';
}

function orderStatusText(s) {
  if (s === 'PENDING') return '待处理';
  if (s === 'PROCESSING') return '处理中';
  if (s === 'COMPLETED') return '已完成';
  return s || '-';
}

function bizTypeZh(v) {
  if (v === 'REPAIR') return '报修';
  if (v === 'PURCHASE') return '采购';
  if (v === 'SUPPLIES_CLAIM') return '物资领用';
  return v || '-';
}

function eventTypeZh(v) {
  if (v === 'CREATED') return '已创建';
  if (v === 'STARTED') return '已接单';
  if (v === 'COMPLETED') return '已完成';
  if (v === 'WITHDRAWN') return '已撤回';
  if (v === 'DELETED') return '已删除';
  if (v === 'RESTORED') return '已恢复';
  return v || '-';
}

function applicantDisplay(o) {
  if (!o) return '-';
  const n = (o.applicantName && String(o.applicantName).trim()) || '';
  if (n) return n;
  const id = (o.userId && String(o.userId).trim()) || '';
  return id || '未知申请人';
}

function workOrderApplicantLine(d) {
  if (!d) return '-';
  const n = (d.applicantName && String(d.applicantName).trim()) || '';
  if (n) return n;
  const id = (d.applicantId && String(d.applicantId).trim()) || '';
  return id || '-';
}

async function buildWorkOrderDetail(kind, d) {
  const requestImageUrls = await resolveMediaUrlsForDisplay(d.requestImages || []);
  const resultImageUrls = await resolveMediaUrlsForDisplay(d.resultImages || []);
  const procName = (d.processorName && String(d.processorName).trim()) || '';
  const procId = (d.processorId && String(d.processorId).trim()) || '';
  const processorLine = procName || procId ? procName || procId : '';
  return {
    kind,
    kindTitle: kind === 'repair' ? '报修单' : '采购单',
    id: d.id,
    location: (d.location && String(d.location).trim()) || '-',
    content: (d.content && String(d.content).trim()) || '-',
    status: d.status,
    statusText: orderStatusText(d.status),
    createTimeText: toTextTime(d.createTime),
    startTimeText: d.startTime ? toTextTime(d.startTime) : '',
    finishTimeText: d.finishTime ? toTextTime(d.finishTime) : '',
    resultRemark: (d.resultRemark && String(d.resultRemark).trim()) || '',
    applicantLine: workOrderApplicantLine(d),
    processorLine,
    isPublicText:
      d.isPublic === 1 ? '公开' : d.isPublic === 0 ? '非公开' : '',
    requestImageUrls,
    resultImageUrls,
    hasRequestImages: requestImageUrls.length > 0,
    hasResultImages: resultImageUrls.length > 0,
  };
}

function sortKeyFrom(v) {
  if (!v) return 0;
  const t = Date.parse(String(v).replace(' ', 'T'));
  return Number.isFinite(t) ? t : 0;
}

function snippetText(s, max) {
  const t = String(s || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!t) return '';
  const n = max || 160;
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

/** 统一卡片「申请人」槽位：无有效值时不占位 */
function presentMetaApplicant(raw) {
  const t = String(raw || '').trim();
  if (!t || t === '—' || t === '-') return '';
  return t;
}

/**
 * 统一卡片文案槽位（与 index.wxml svc-card-body 一致）：
 * - head：typeLine + timeText
 * - meta：metaLabel + metaValue（无则整行不占位）
 * - primary / secondary：主次分级；无则不占位
 */
function buildTimelinePresent(it) {
  const k = String(it.kind || '').toUpperCase();
  const p = it.payload || {};
  const timeText = it.timeLine || (p.timeText != null ? String(p.timeText) : '') || '';
  if (k === 'NOTIFICATION') {
    const bz = (p.bizTypeZh && String(p.bizTypeZh).trim()) || inboxCardTheme.bizTypeZh(p.bizType);
    const ez = (p.eventTypeZh && String(p.eventTypeZh).trim()) || inboxCardTheme.eventTypeZh(p.eventType);
    const typeLine = [bz, ez].filter(Boolean).join(' · ') || '通知';
    const title = String(it.title || '').trim();
    const sub = String(it.subtitle || '').trim();
    const et = String(p.eventType || '').trim().toUpperCase();
    const btRaw = String(p.bizType || '').trim().toUpperCase();
    const hideReceiptDigest =
      et === 'COMPLETED' && (btRaw === 'REPAIR' || btRaw === 'PURCHASE' || btRaw === 'SUPPLIES_CLAIM');
    const primary = title || (!hideReceiptDigest ? sub : '') || '—';
    const secondary = hideReceiptDigest ? '' : title && sub ? sub : '';
    return {
      typeLine,
      timeText,
      metaLabel: '',
      metaValue: '',
      primary: primary || '—',
      secondary,
    };
  }
  if (k === 'REPAIR') {
    const loc = String(it.title || '').trim();
    const prev = String(p.contentPreview || '').trim();
    const applicant = presentMetaApplicant(p.applicantLine);
    return {
      typeLine: '报修',
      timeText,
      metaLabel: applicant ? '申请人' : '',
      metaValue: applicant,
      primary: loc ? `地点 · ${loc}` : prev || '—',
      secondary: loc && prev ? prev : '',
    };
  }
  if (k === 'PURCHASE') {
    const loc = String(it.title || '').trim();
    const prev = String(p.contentPreview || '').trim();
    const applicant = presentMetaApplicant(p.applicantLine);
    return {
      typeLine: '采购',
      timeText,
      metaLabel: applicant ? '申请人' : '',
      metaValue: applicant,
      primary: loc ? `地点 · ${loc}` : prev || '—',
      secondary: loc && prev ? prev : '',
    };
  }
  if (k === 'SUPPLIES_CLAIM') {
    const st = String(p.statusZh || '').trim();
    const applicant = presentMetaApplicant(p.applicantLine);
    const primary = st ? `状态 · ${st}` : '物资领用';
    const secondary = '明细请在详情中查看';
    return {
      typeLine: '物资领用',
      timeText,
      metaLabel: applicant ? '申请人' : '',
      metaValue: applicant,
      primary,
      secondary,
    };
  }
  const fallback = String(it.subtitle || it.title || '').trim();
  return {
    typeLine: '动态',
    timeText,
    metaLabel: '',
    metaValue: '',
    primary: fallback || '—',
    secondary: '',
  };
}

function buildNoticePresent(r) {
  const typeLine = [r.bizTypeText, r.eventTypeText].filter(Boolean).join(' · ') || '通知';
  const title = String(r.title || '').trim();
  const et = String(r.eventType || '').trim().toUpperCase();
  const bt = String(r.bizType || '').trim().toUpperCase();
  let content = String(r.content || '').trim();
  if (et === 'COMPLETED' && (bt === 'REPAIR' || bt === 'PURCHASE' || bt === 'SUPPLIES_CLAIM')) {
    content = '';
  }
  const primary = title || content || '—';
  const secondary = title && content ? content : '';
  return {
    typeLine,
    timeText: r.createTimeText || '',
    metaLabel: '',
    metaValue: '',
    primary,
    secondary,
  };
}

/** 有能力处理报修/采购时，时间线卡片主体可跳转处理页（仅主体；详情仍走底部「详情」） */
function enrichTimelineProcessNav(row, capMap) {
  const cm = capMap || {};
  const k = String(row.kind || '').toUpperCase();
  let timelineTapProcess = false;
  let timelineProcessKind = '';
  let timelineProcessOrderId = String(row.id || '').trim();
  const repairProc = !!(cm.REPAIR && cm.REPAIR.canProcess);
  const purchaseProc = !!(cm.PURCHASE && cm.PURCHASE.canProcess);
  if (k === 'REPAIR' && repairProc) {
    timelineTapProcess = true;
    timelineProcessKind = 'repair';
  } else if (k === 'PURCHASE' && purchaseProc) {
    timelineTapProcess = true;
    timelineProcessKind = 'purchase';
  } else if (k === 'NOTIFICATION') {
    const p = row.payload || {};
    const bt = String(p.bizType || '').trim().toUpperCase();
    const bid = String(p.bizId || '').trim();
    const et = String(p.eventType || '').trim().toUpperCase();
    const completionReceipt =
      et === 'COMPLETED' && (bt === 'REPAIR' || bt === 'PURCHASE' || bt === 'SUPPLIES_CLAIM');
    if (!completionReceipt && bt === 'REPAIR' && bid && repairProc) {
      timelineTapProcess = true;
      timelineProcessKind = 'repair';
      timelineProcessOrderId = bid;
    } else if (!completionReceipt && bt === 'PURCHASE' && bid && purchaseProc) {
      timelineTapProcess = true;
      timelineProcessKind = 'purchase';
      timelineProcessOrderId = bid;
    }
  }
  return {
    ...row,
    timelineTapProcess,
    timelineProcessKind,
    timelineProcessOrderId,
  };
}

function toDownloadUrl(row) {
  if (!row) return '';
  const url = String(row.downloadUrl || '').trim();
  if (/^https?:\/\//i.test(url)) return url;
  const path = String(row.downloadPath || '').trim();
  return springAuth.toAbsoluteMediaUrl(url || path);
}

function formatReceiptTabBadge(n) {
  const x = Number(n) || 0;
  if (x <= 0) return '';
  return x > 99 ? '99+' : String(x);
}

function mapCompletionReceiptRow(r) {
  const bt = String(r.bizType || '').trim().toUpperCase();
  const themeKey = inboxCardTheme.themeKeyForBizType(bt);
  const typeLine = [bizTypeZh(bt), '办结回执'].filter(Boolean).join(' · ');
  const title = String(r.title || '').trim();
  return {
    nid: r.id,
    bizType: bt,
    bizId: String(r.bizId || '').trim(),
    eventType: String(r.eventType || '').trim(),
    themeKey,
    typeLine,
    timeText: toTextTime(r.createTime),
    primary: title || '—',
  };
}

Component({
  options: {
    styleIsolation: 'apply-shared',
  },
  properties: {
    embedded: {
      type: Boolean,
      value: false,
    },
    /** 与路由 ?tab= 一致：timeline | notice | pending | done */
    initialActiveTab: {
      type: String,
      value: '',
    },
  },
  data: {
    activeTab: 'timeline',
    page: 1,
    size: 20,
    onlyUnread: false,
    rows: [],
    loading: false,
    loadingMore: false,
    hasMore: true,
    timelineRows: [],
    timelineDisplayRows: [],
    timelineOnlyUnread: false,
    timelineLoading: false,
    timelineBeforeMillis: null,
    timelineHasMore: true,
    unifiedPending: [],
    unifiedDone: [],
    pendingLoading: false,
    doneLoading: false,
    canStaff: false,
    isAdmin: false,
    canProcessClaims: false,
    popupShow: false,
    claimDetail: null,
    workOrderDetail: null,
    grantMap: {},
    fulfilling: false,
    claimPdfLinks: [],
    claimPdfLoading: false,
    capabilityMap: {},
    receiptUnreadBadgeText: '',
    receiptUnreadRows: [],
    /** 教职工「待处理」Tab：与 Web staffUnifiedWorkInboxPending 同源（peek pending-badges） */
    pendingTabBadgeText: '',
    /** 通知分栏角标（与 Web 分区一致，peek pending-badges） */
    noticeSubTabBadgeText: '',
  },

  observers: {
    initialActiveTab(tab) {
      const t = String(tab || '').trim();
      const allowed = ['timeline', 'notice', 'pending', 'done'];
      if (allowed.indexOf(t) < 0) return;
      const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
      if ((t === 'pending' || t === 'done') && !hasMinRole(role, 'STAFF')) return;
      this.setData({ activeTab: t });
    },
  },

  pageLifetimes: {
    show() {
      if (this.properties.embedded) {
        void this.runWorkInboxShow();
      }
    },
  },

  methods: {
  filterTimelineRowsForDisplay(rows) {
    if (!this.data.timelineOnlyUnread) return rows || [];
    return (rows || []).filter((it) => {
      const k = String(it.kind || '').toUpperCase();
      if (k === 'NOTIFICATION') return !!it.unread;
      return false;
    });
  },

  syncTimelineDisplayRows() {
    this.setData({
      timelineDisplayRows: this.filterTimelineRowsForDisplay(this.data.timelineRows),
    });
  },

  toggleTimelineOnlyUnread() {
    if (this.data.activeTab !== 'timeline') return;
    this.setData({ timelineOnlyUnread: !this.data.timelineOnlyUnread }, () => this.syncTimelineDisplayRows());
  },

  /** 教职工「已处理」Tab：办结回执未读角标 + 列表条 */
  async refreshReceiptUnreadStrip() {
    if (!this.data.canStaff || !wx.getStorageSync(springAuth.KEYS.TOKEN)) {
      this.setData({ receiptUnreadBadgeText: '', receiptUnreadRows: [] });
      return;
    }
    try {
      const res = await springAuth.springRequest({
        url: '/api/notifications/completion-receipts/unread',
        method: 'GET',
        data: { limit: 30 },
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      const d = p.body.data || {};
      const count = Number(d.count || 0);
      const items = Array.isArray(d.items) ? d.items : [];
      this.setData({
        receiptUnreadBadgeText: formatReceiptTabBadge(count),
        receiptUnreadRows: items.map(mapCompletionReceiptRow),
      });
    } catch (e) {
      this.setData({ receiptUnreadBadgeText: '', receiptUnreadRows: [] });
    }
  },

  /** 通知已读后强制重拉 pending-badges 并刷新自定义 TabBar，避免角标与列表不一致 */
  async attachUnreadFlags(items) {
    const keys = [];
    (items || []).forEach((it) => {
      const bt = notificationReadSync.workKindToBizType(it.workKind);
      if (bt && it.id) keys.push({ bizType: bt, bizId: it.id });
    });
    if (!keys.length) {
      return (items || []).map((it) => ({ ...it, hasUnreadNotice: false }));
    }
    const flags = await notificationReadSync.fetchUnreadBizFlags(keys);
    return (items || []).map((it) => {
      const bt = notificationReadSync.workKindToBizType(it.workKind);
      const ck = bt ? notificationReadSync.toBizCompositeKey(bt, it.id) : '';
      return { ...it, hasUnreadNotice: ck ? !!flags[ck] : false };
    });
  },

  syncBadgesAfterNoticeMutation() {
    void pullPendingBadgeSnapshot({ force: true }).then(() => {
      this.syncPendingTabBadgeFromSnapshot();
      this.syncNoticeSubTabBadges();
      const tabBar = getHostTabBar();
      if (tabBar && typeof tabBar.refreshTabs === 'function') tabBar.refreshTabs();
    });
    void this.refreshReceiptUnreadStrip();
  },

  syncPendingTabBadgeFromSnapshot() {
    if (!this.data.canStaff) {
      this.setData({ pendingTabBadgeText: '' });
      return;
    }
    const c = peekPendingBadges();
    const n = c ? Number(c.staffUnifiedWorkInboxPending || 0) : 0;
    this.setData({ pendingTabBadgeText: n > 0 ? formatBadgeText(n) : '' });
  },

  /** 通知分栏「通知」Tab：系统通知未读数字（与 Web notify 同源） */
  syncNoticeSubTabBadges() {
    if (!this.data.canStaff) {
      this.setData({ noticeSubTabBadgeText: '' });
      return;
    }
    const c = peekPendingBadges();
    const t = c && c.notifyText != null && String(c.notifyText).trim() !== '' ? String(c.notifyText).trim() : '';
    if (t) {
      this.setData({ noticeSubTabBadgeText: t });
      return;
    }
    const n = c ? Number(c.notify || 0) : 0;
    this.setData({ noticeSubTabBadgeText: n > 0 ? formatBadgeText(n) : '' });
  },

  async runWorkInboxShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const canStaff = hasMinRole(role, 'STAFF');
    const isAdmin = hasMinRole(role, 'ADMIN');
    const capMap = await fetchCapabilitySummaryMap({});
    const claimRow = capMap.SUPPLIES_CLAIM || {};
    const canProcessClaims = !!claimRow.canProcess;
    this.setData({ canStaff, isAdmin, canProcessClaims, capabilityMap: capMap });
    if (canStaff) {
      void pullPendingBadgeSnapshot().then(() => {
        this.syncPendingTabBadgeFromSnapshot();
        this.syncNoticeSubTabBadges();
      });
    } else {
      this.setData({ pendingTabBadgeText: '', noticeSubTabBadgeText: '' });
    }
    void this.refreshReceiptUnreadStrip();
    const sceneKey = [role, this.data.activeTab, this.data.onlyUnread ? '1' : '0', this.data.timelineOnlyUnread ? '1' : '0'].join('|');
    if (!shouldRefreshOnShow(this, { sceneKey, ttlMs: 15000 })) return;
    this.refreshActiveTab({ showLoading: true });
  },

  onPullDownRefresh() {
    const p = this.refreshActiveTab({});
    Promise.resolve(p).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.activeTab === 'timeline') {
      this.loadTimeline({ append: true });
      return;
    }
    if (this.data.activeTab === 'notice') {
      this.loadData({ append: true });
    }
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    if ((tab === 'pending' || tab === 'done') && !this.data.canStaff) return;
    this.setData({ activeTab: tab }, () => this.refreshActiveTab({ showLoading: true }));
  },

  refreshActiveTab(opts) {
    const show = !!(opts && opts.showLoading);
    if (this.data.activeTab === 'timeline') {
      return this.loadTimeline({ reset: true, showLoading: show });
    }
    if (this.data.activeTab === 'notice') {
      return this.loadData({ reset: true, showLoading: show });
    }
    if (this.data.activeTab === 'pending') {
      return this.loadPendingUnified({ showLoading: show });
    }
    return this.loadDoneUnified({ showLoading: show });
  },

  async loadTimeline(opts) {
    const o = opts || {};
    const reset = !!o.reset;
    const append = !!o.append;
    const showLoading = !!o.showLoading;
    if (this.data.timelineLoading) return;
    if (append && !this.data.timelineHasMore) return;
    if (reset) {
      this.setData({ timelineRows: [], timelineDisplayRows: [], timelineBeforeMillis: null, timelineHasMore: true });
    }
    const beforeMillis = append && this.data.timelineBeforeMillis ? this.data.timelineBeforeMillis : null;
    if (showLoading) this.setData({ timelineLoading: true });
    try {
      const capMap = await fetchCapabilitySummaryMap({});
      const reqData = { limit: 20 };
      if (beforeMillis != null && beforeMillis > 0) {
        reqData.beforeMillis = beforeMillis;
      }
      const res = await springAuth.springRequest({
        url: '/api/me/inbox/feed',
        method: 'GET',
        data: reqData,
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const payload = parsed.body.data || {};
      const list = Array.isArray(payload.items) ? payload.items : [];
      const mapped = list.map((it) => {
        const kUpper = String(it.kind || '').toUpperCase();
        const themeKey =
          kUpper === 'NOTIFICATION' && it.payload && it.payload.bizType
            ? inboxCardTheme.themeKeyForBizType(it.payload.bizType)
            : inboxCardTheme.themeKeyForKind(it.kind);
        const timeLine =
          inboxCardTheme.formatFeedTime(it.sortAtMillis) ||
          (it.payload && it.payload.timeText != null ? String(it.payload.timeText) : '') ||
          '';
        const row = {
          ...it,
          kindId: `${it.kind || ''}_${it.id || ''}`,
          kindLabel: inboxKindRoutes.labelForKind(it.kind),
          themeKey,
          timeLine,
        };
        row.present = buildTimelinePresent(row);
        return enrichTimelineProcessNav(row, capMap);
      });
      const rows = reset ? mapped : (this.data.timelineRows || []).concat(mapped);
      const nextBefore = payload.nextBeforeMillis != null ? payload.nextBeforeMillis : null;
      const hasMore = list.length >= 20 && nextBefore != null;
      this.setData({
        timelineRows: rows,
        timelineBeforeMillis: nextBefore,
        timelineHasMore: hasMore,
      });
      this.syncTimelineDisplayRows();
      void this.refreshReceiptUnreadStrip();
    } catch (err) {
      if (reset) this.setData({ timelineRows: [], timelineHasMore: false });
      wx.showToast({
        title: (err && err.message) ? String(err.message).slice(0, 18) : '加载失败',
        icon: 'none',
      });
    } finally {
      this.setData({ timelineLoading: false });
    }
  },

  findTimelineRow(kindId) {
    const id = String(kindId || '').trim();
    if (!id) return null;
    return (this.data.timelineRows || []).find((r) => r.kindId === id) || null;
  },

  onTimelineMainTap(e) {
    const kindId = e.currentTarget.dataset.kindId;
    const item = this.findTimelineRow(kindId);
    if (!item || !item.timelineTapProcess) return;
    const kind = item.timelineProcessKind;
    const oid = String(item.timelineProcessOrderId || '').trim();
    if (!oid) return;
    if (kind === 'repair') {
      wx.navigateTo({ url: `/package-feature/pages/repairProcess/index?focusId=${encodeURIComponent(oid)}` });
      return;
    }
    if (kind === 'purchase') {
      wx.navigateTo({ url: `/package-feature/pages/purchaseProcess/index?focusId=${encodeURIComponent(oid)}` });
    }
  },

  async onTimelineDetailTap(e) {
    const kindId = e.currentTarget.dataset.kindId;
    const item = this.findTimelineRow(kindId);
    if (!item) return;
    const kind = String(item.kind || '').toUpperCase();
    if (kind === 'NOTIFICATION') {
      const p = item.payload || {};
      const bt = p.bizType ? String(p.bizType).trim() : '';
      const bid = p.bizId ? String(p.bizId).trim() : '';
      const et = p.eventType ? String(p.eventType).trim().toUpperCase() : '';
      if (bt === 'SUPPLIES_CLAIM' && bid && et === 'COMPLETED') {
        const nid = String(item.id || '').trim();
        if (nid) {
          try {
            const res = await springAuth.springRequest({
              url: `/api/notifications/${encodeURIComponent(nid)}/read`,
              method: 'PATCH',
              data: {},
            });
            const pr = parseResponse(res);
            if (pr.ok) {
              const timelineRows = (this.data.timelineRows || []).map((row) =>
                String(row.id) === nid ? { ...row, unread: false } : row,
              );
              this.setData({ timelineRows });
              this.syncTimelineDisplayRows();
              this.syncBadgesAfterNoticeMutation();
            }
          } catch (e) {
            /* ignore */
          }
        }
        await this.openClaimModal(bid);
        return;
      }
      if (bt === 'SUPPLIES_CLAIM' && bid) {
        this.openClaimModal(bid);
        return;
      }
      if (et === 'COMPLETED' && (bt === 'REPAIR' || bt === 'PURCHASE') && bid) {
        const nid = String(item.id || '').trim();
        if (nid) {
          try {
            const res = await springAuth.springRequest({
              url: `/api/notifications/${encodeURIComponent(nid)}/read`,
              method: 'PATCH',
              data: {},
            });
            const pr = parseResponse(res);
            if (pr.ok) {
              const timelineRows = (this.data.timelineRows || []).map((row) =>
                String(row.id) === nid ? { ...row, unread: false } : row,
              );
              this.setData({ timelineRows });
              this.syncTimelineDisplayRows();
              this.syncBadgesAfterNoticeMutation();
            }
          } catch (e) {
            /* ignore */
          }
        }
        await this.openWorkOrderModal(bt === 'REPAIR' ? 'repair' : 'purchase', bid);
        return;
      }
      wx.showModal({
        title: item.title || '通知',
        content: item.subtitle || '',
        showCancel: false,
      });
      return;
    }
    if (kind === 'REPAIR') {
      this.openWorkOrderModal('repair', item.id);
      return;
    }
    if (kind === 'PURCHASE') {
      this.openWorkOrderModal('purchase', item.id);
      return;
    }
    if (kind === 'SUPPLIES_CLAIM') {
      this.openClaimModal(item.id);
    }
  },

  toggleOnlyUnread() {
    if (this.data.activeTab !== 'notice') return;
    this.setData({ onlyUnread: !this.data.onlyUnread }, () => this.loadData({ reset: true, showLoading: true }));
  },

  workOrderListParams(status) {
    if (this.data.isAdmin) {
      return { page: 1, size: 40, status, includePrivate: true, onlyMine: false };
    }
    return { page: 1, size: 40, status, onlyMine: true };
  },

  async loadPendingUnified(opts) {
    const show = !!(opts && opts.showLoading);
    if (!this.data.canStaff) return;
    this.setData({ pendingLoading: true });
    try {
      const wo = (st) => this.workOrderListParams(st);
      const [cRes, rPen, rProc, pPen, pProc] = await Promise.all([
        springAuth.springRequest({ url: '/api/supplies/claims/pending-tasks', method: 'GET', data: {} }),
        springAuth.springRequest({
          url: '/api/repair/orders',
          method: 'GET',
          data: wo('PENDING'),
        }),
        springAuth.springRequest({
          url: '/api/repair/orders',
          method: 'GET',
          data: wo('PROCESSING'),
        }),
        springAuth.springRequest({
          url: '/api/purchase/orders',
          method: 'GET',
          data: wo('PENDING'),
        }),
        springAuth.springRequest({
          url: '/api/purchase/orders',
          method: 'GET',
          data: wo('PROCESSING'),
        }),
      ]);

      const merged = [];

      const cp = parseResponse(cRes);
      if (cp.ok) {
        (cp.body.data || []).forEach((o) => {
          const applicant = applicantDisplay(o);
          const applicantMeta = presentMetaApplicant(applicant);
          const timeLine = toTextTime(o.createdAt);
          merged.push({
            key: `claim_${o.id}`,
            workKind: 'claim',
            id: o.id,
            kindLabel: '物资领用',
            themeKey: 'supplies',
            serviceBrand: inboxCardTheme.serviceBrandForKind('SUPPLIES_CLAIM', {}),
            title: applicantDisplay(o),
            sub: `${toTextTime(o.createdAt)} · ${claimStatusText(o.status)}`,
            timeLine,
            sortAt: sortKeyFrom(o.createdAt),
            present: {
              typeLine: '物资领用',
              timeText: timeLine,
              metaLabel: applicantMeta ? '申请人' : '',
              metaValue: applicantMeta,
              primary: `状态 · ${claimStatusText(o.status)}`,
              secondary: '',
            },
          });
        });
      }

      const pushOrders = (parsed, kindLabel, workKind) => {
        if (!parsed.ok) return;
        const payload = parsed.body.data || {};
        const list = Array.isArray(payload.data) ? payload.data : [];
        list.forEach((row) => {
          const applicantRaw = (row.applicantName && String(row.applicantName).trim()) || row.applicantId || '-';
          const applicantMeta = presentMetaApplicant(applicantRaw);
          const themeKey = workKind === 'repair' ? 'repair' : 'purchase';
          const timeLine = toTextTime(row.startTime || row.createTime);
          const loc = String(row.location || '').trim();
          const prev = snippetText(row.content, 160);
          merged.push({
            key: `${workKind}_${row.id}_${row.status}`,
            workKind,
            id: row.id,
            kindLabel,
            themeKey,
            serviceBrand: inboxCardTheme.serviceBrandForKind(workKind === 'repair' ? 'REPAIR' : 'PURCHASE', {}),
            title: row.location || '-',
            sub: `${applicantRaw} · ${orderStatusText(row.status)} · ${toTextTime(row.createTime)}`,
            timeLine,
            sortAt: sortKeyFrom(row.startTime || row.createTime),
            present: {
              typeLine: kindLabel,
              timeText: timeLine,
              metaLabel: applicantMeta ? '申请人' : '',
              metaValue: applicantMeta,
              primary: loc ? `地点 · ${loc}` : prev || '—',
              secondary: loc && prev ? prev : '',
            },
          });
        });
      };

      pushOrders(parseResponse(rPen), '报修', 'repair');
      pushOrders(parseResponse(rProc), '报修', 'repair');
      pushOrders(parseResponse(pPen), '采购', 'purchase');
      pushOrders(parseResponse(pProc), '采购', 'purchase');

      merged.sort((a, b) => b.sortAt - a.sortAt);
      const withFlags = await this.attachUnreadFlags(merged);
      this.setData({ unifiedPending: withFlags });
    } catch {
      this.setData({ unifiedPending: [] });
    } finally {
      this.setData({ pendingLoading: false });
    }
  },

  async loadDoneUnified(opts) {
    const show = !!(opts && opts.showLoading);
    if (!this.data.canStaff) return;
    this.setData({ doneLoading: true });
    try {
      const [cRes, rDone, pDone] = await Promise.all([
        springAuth.springRequest({
          url: '/api/supplies/claims/recent-closed',
          method: 'GET',
          data: { limit: 40 },
        }),
        springAuth.springRequest({
          url: '/api/repair/orders',
          method: 'GET',
          data: this.workOrderListParams('COMPLETED'),
        }),
        springAuth.springRequest({
          url: '/api/purchase/orders',
          method: 'GET',
          data: this.workOrderListParams('COMPLETED'),
        }),
      ]);

      const merged = [];

      const cp = parseResponse(cRes);
      if (cp.ok) {
        (cp.body.data || []).forEach((o) => {
          const endLine = o.status === 'WITHDRAWN' ? '已撤回' : `已完成 · ${toTextTime(o.fulfilledAt)}`;
          const applicant = applicantDisplay(o);
          const applicantMeta = presentMetaApplicant(applicant);
          const timeLine = toTextTime(o.fulfilledAt || o.createdAt);
          merged.push({
            key: `claim_done_${o.id}`,
            workKind: 'claim',
            id: o.id,
            kindLabel: '物资领用',
            themeKey: 'supplies',
            serviceBrand: inboxCardTheme.serviceBrandForKind('SUPPLIES_CLAIM', {}),
            title: applicantDisplay(o),
            sub: `${toTextTime(o.createdAt)} · ${endLine}`,
            timeLine,
            sortAt: sortKeyFrom(o.fulfilledAt || o.createdAt),
            present: {
              typeLine: '物资领用',
              timeText: timeLine,
              metaLabel: applicantMeta ? '申请人' : '',
              metaValue: applicantMeta,
              primary: `申请 · ${toTextTime(o.createdAt)}`,
              secondary: endLine,
            },
          });
        });
      }

      const pushDone = (parsed, kindLabel, workKind) => {
        if (!parsed.ok) return;
        const payload = parsed.body.data || {};
        const list = Array.isArray(payload.data) ? payload.data : [];
        list.forEach((row) => {
          const applicantRaw = (row.applicantName && String(row.applicantName).trim()) || row.applicantId || '-';
          const applicantMeta = presentMetaApplicant(applicantRaw);
          const themeKey = workKind === 'repair' ? 'repair' : 'purchase';
          const timeLine = toTextTime(row.finishTime || row.createTime);
          const loc = String(row.location || '').trim();
          const prev = snippetText(row.content, 160);
          const finishStr = `已完成 · ${toTextTime(row.finishTime)}`;
          let primary = '';
          let secondary = '';
          if (loc) {
            primary = `地点 · ${loc}`;
            secondary = [prev, finishStr].filter(Boolean).join('\n');
          } else if (prev) {
            primary = prev;
            secondary = finishStr;
          } else {
            primary = finishStr;
          }
          merged.push({
            key: `${workKind}_done_${row.id}`,
            workKind,
            id: row.id,
            kindLabel,
            themeKey,
            serviceBrand: inboxCardTheme.serviceBrandForKind(workKind === 'repair' ? 'REPAIR' : 'PURCHASE', {}),
            title: row.location || '-',
            sub: `${applicantRaw} · 已完成 · 完成 ${toTextTime(row.finishTime)}`,
            timeLine,
            sortAt: sortKeyFrom(row.finishTime || row.createTime),
            present: {
              typeLine: kindLabel,
              timeText: timeLine,
              metaLabel: applicantMeta ? '申请人' : '',
              metaValue: applicantMeta,
              primary,
              secondary,
            },
          });
        });
      };

      pushDone(parseResponse(rDone), '报修', 'repair');
      pushDone(parseResponse(pDone), '采购', 'purchase');

      merged.sort((a, b) => b.sortAt - a.sortAt);
      const withFlags = await this.attachUnreadFlags(merged);
      this.setData({ unifiedDone: withFlags });
      await this.refreshReceiptUnreadStrip();
    } catch {
      this.setData({ unifiedDone: [] });
    } finally {
      this.setData({ doneLoading: false });
    }
  },

  async onCompletionReceiptMarkRead(e) {
    const nid = String(e.currentTarget.dataset.nid || '').trim();
    if (!nid) return;
    wx.showLoading({ title: '…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/notifications/${encodeURIComponent(nid)}/read`,
        method: 'PATCH',
        data: {},
      });
      const pr = parseResponse(res);
      if (!pr.ok) throw new Error(pr.message);
      this.syncBadgesAfterNoticeMutation();
    } catch (err) {
      wx.showToast({
        title: (err && err.message) ? String(err.message).slice(0, 18) : '失败',
        icon: 'none',
      });
    } finally {
      wx.hideLoading();
    }
  },

  async onCompletionReceiptOpenDetail(e) {
    const nid = String(e.currentTarget.dataset.nid || '').trim();
    const bt = String(e.currentTarget.dataset.biztype || '').trim().toUpperCase();
    const bid = String(e.currentTarget.dataset.bizid || '').trim();
    if (!bid) return;
    if (nid) {
      try {
        const res = await springAuth.springRequest({
          url: `/api/notifications/${encodeURIComponent(nid)}/read`,
          method: 'PATCH',
          data: {},
        });
        const pr = parseResponse(res);
        if (pr.ok) {
          this.syncBadgesAfterNoticeMutation();
        }
      } catch (err) {
        /* ignore */
      }
    }
    if (bt === 'SUPPLIES_CLAIM') {
      await this.openClaimModal(bid);
      return;
    }
    if (bt === 'REPAIR') {
      await this.openWorkOrderModal('repair', bid);
      return;
    }
    if (bt === 'PURCHASE') {
      await this.openWorkOrderModal('purchase', bid);
    }
  },

  onWorkTap(e) {
    const kind = e.currentTarget.dataset.kind;
    const id = e.currentTarget.dataset.id;
    if (!kind || !id) return;
    if (kind === 'claim') {
      this.openClaimModal(id);
      return;
    }
    if (kind === 'repair' || kind === 'purchase') {
      this.openWorkOrderModal(kind, id);
    }
  },

  async loadData(options) {
    const opts = options || {};
    const reset = !!opts.reset;
    const append = !!opts.append;
    const showLoading = !!opts.showLoading;
    if (this.data.loading || this.data.loadingMore) return;
    if (append && !this.data.hasMore) return;
    const nextPage = reset ? 1 : append ? this.data.page + 1 : this.data.page;
    if (showLoading) this.setData({ loading: true });
    if (append) this.setData({ loadingMore: true });
    try {
      const reqData = {
        page: nextPage,
        size: this.data.size,
        onlyUnread: this.data.onlyUnread,
      };
      if (this.data.canStaff) {
        reqData.excludeBizTypes = 'REPAIR,PURCHASE,SUPPLIES_CLAIM';
      }
      const res = await springAuth.springRequest({
        url: '/api/notifications',
        method: 'GET',
        data: reqData,
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const payload = parsed.body.data || {};
      const list = Array.isArray(payload.data) ? payload.data : [];
      const total = Number(payload.total || 0);
      const mapped = list.map((r) => {
        const row = {
          ...r,
          isRead: Number(r.isRead || 0),
          createTimeText: toTextTime(r.createTime),
          bizTypeText: bizTypeZh(r.bizType),
          eventTypeText: eventTypeZh(r.eventType),
          themeKey: inboxCardTheme.themeKeyForBizType(r.bizType),
          serviceBrand: inboxCardTheme.serviceBrandForNoticeRow(r.bizType),
          noticeDigest: [bizTypeZh(r.bizType), eventTypeZh(r.eventType)].filter(Boolean).join(' · '),
          tappable:
            (r.bizType === 'SUPPLIES_CLAIM' && !!r.bizId) ||
            (String(r.eventType || '').trim().toUpperCase() === 'COMPLETED' &&
              (String(r.bizType || '').trim().toUpperCase() === 'REPAIR' ||
                String(r.bizType || '').trim().toUpperCase() === 'PURCHASE') &&
              !!r.bizId),
        };
        row.present = buildNoticePresent(row);
        return row;
      });
      const rows = reset ? mapped : this.data.rows.concat(mapped);
      this.setData({
        rows,
        page: nextPage,
        hasMore: rows.length < total,
      });
    } catch (err) {
      wx.showToast({
        title: (err && err.message) ? String(err.message).slice(0, 18) : '加载失败',
        icon: 'none',
      });
    } finally {
      const done = {};
      if (showLoading) done.loading = false;
      if (append) done.loadingMore = false;
      this.setData(done);
    }
  },

  cancelClearClaimTimer() {
    if (this._claimClearTimer) {
      clearTimeout(this._claimClearTimer);
      this._claimClearTimer = null;
    }
  },

  scheduleClearClaimDetail() {
    this.cancelClearClaimTimer();
    this._claimClearTimer = setTimeout(() => {
      this._claimClearTimer = null;
      if (!this.data.popupShow) {
        this.setData({ claimDetail: null, workOrderDetail: null, grantMap: {}, fulfilling: false, claimPdfLinks: [], claimPdfLoading: false });
      }
    }, 320);
  },

  onPopupClose() {
    this.setData({ popupShow: false });
    this.scheduleClearClaimDetail();
  },

  async onNoticeTap(e) {
    const tappable = !!e.currentTarget.dataset.tappable;
    const bizType = String(e.currentTarget.dataset.biztype || '').trim();
    const eventType = String(e.currentTarget.dataset.eventtype || '').trim().toUpperCase();
    const bizId = String(e.currentTarget.dataset.bizid || '').trim();
    const nid = String(e.currentTarget.dataset.notificationId || '').trim();
    if (!tappable) return;
    if (eventType === 'COMPLETED' && bizType === 'SUPPLIES_CLAIM' && bizId && nid) {
      wx.showLoading({ title: '…', mask: true });
      try {
        const res = await springAuth.springRequest({
          url: `/api/notifications/${encodeURIComponent(nid)}/read`,
          method: 'PATCH',
          data: {},
        });
        const pr = parseResponse(res);
        if (pr.ok) {
          // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
          const rows = (this.data.rows || []).map((r) =>
            String(r.id) === nid ? { ...r, isRead: 1 } : r,
          );
          this.setData({ rows });
          this.syncBadgesAfterNoticeMutation();
        }
      } catch (err) {
        /* ignore */
      } finally {
        wx.hideLoading();
      }
      await this.openClaimModal(bizId);
      return;
    }
    if (bizType === 'SUPPLIES_CLAIM' && bizId) {
      this.openClaimModal(bizId);
      return;
    }
    if (eventType === 'COMPLETED' && (bizType === 'REPAIR' || bizType === 'PURCHASE') && bizId && nid) {
      wx.showLoading({ title: '…', mask: true });
      try {
        const res = await springAuth.springRequest({
          url: `/api/notifications/${encodeURIComponent(nid)}/read`,
          method: 'PATCH',
          data: {},
        });
        const pr = parseResponse(res);
        if (pr.ok) {
          // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
          const rows = (this.data.rows || []).map((r) =>
            String(r.id) === nid ? { ...r, isRead: 1 } : r,
          );
          this.setData({ rows });
          this.syncBadgesAfterNoticeMutation();
        }
      } catch (err) {
        /* ignore */
      } finally {
        wx.hideLoading();
      }
      await this.openWorkOrderModal(bizType === 'REPAIR' ? 'repair' : 'purchase', bizId);
    }
  },

  async openClaimModal(orderId) {
    this.cancelClearClaimTimer();
    wx.showLoading({ title: '加载…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/supplies/claims/${encodeURIComponent(orderId)}`,
        method: 'GET',
        data: {},
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      const d = p.body.data;
      const grantMap = {};
      (d.lines || []).forEach((l) => {
        grantMap[l.id] = true;
      });
      const claimDetail = {
        ...d,
        createdAtText: toTextTime(d.createdAt),
        statusText: claimStatusText(d.status),
        fulfilledAtText: toTextTime(d.fulfilledAt),
        applicantDisplay: applicantDisplay(d),
      };
      this.setData({
        claimDetail,
        workOrderDetail: null,
        grantMap,
        claimPdfLinks: [],
        claimPdfLoading: true,
        popupShow: true,
      });
      await this.loadClaimPdfLinks(orderId);
    } catch (err) {
      wx.showToast({
        title: (err && err.message) ? String(err.message).slice(0, 18) : '加载失败',
        icon: 'none',
      });
    } finally {
      wx.hideLoading();
    }
  },

  async loadClaimPdfLinks(orderId) {
    try {
      const res = await springAuth.springRequest({
        url: `/api/supplies/claims/${encodeURIComponent(orderId)}/pdf-links`,
        method: 'GET',
        data: {},
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      this.setData({ claimPdfLinks: (p.body.data && p.body.data.links) || [] });
    } catch (err) {
      this.setData({ claimPdfLinks: [] });
    } finally {
      this.setData({ claimPdfLoading: false });
    }
  },

  async getClaimPdfLink() {
    const detail = this.data.claimDetail;
    if (!detail || this.data.claimPdfLoading) return;
    this.setData({ claimPdfLoading: true });
    wx.showLoading({ title: '生成中…', mask: true });
    try {
      const createdRes = await springAuth.springRequest({
        url: `/api/supplies/claims/${encodeURIComponent(detail.id)}/pdf-link`,
        method: 'POST',
        data: {},
      });
      const created = parseResponse(createdRes);
      if (!created.ok) throw new Error(created.message);
      await this.loadClaimPdfLinks(detail.id);
      const link = toDownloadUrl(created.body.data || {});
      if (link) {
        wx.setClipboardData({ data: link });
      } else {
        wx.showToast({ title: '已生成链接', icon: 'success' });
      }
    } catch (err) {
      wx.showToast({ title: (err && err.message) ? String(err.message).slice(0, 18) : '获取失败', icon: 'none' });
      this.setData({ claimPdfLoading: false });
    } finally {
      wx.hideLoading();
    }
  },

  copyClaimPdfLink(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const item = (this.data.claimPdfLinks || [])[idx];
    const link = toDownloadUrl(item);
    if (!link) {
      wx.showToast({ title: '链接无效', icon: 'none' });
      return;
    }
    wx.setClipboardData({ data: link });
  },

  async onDoneClaimPdfLink(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showLoading({ title: '生成中…', mask: true });
    try {
      const createdRes = await springAuth.springRequest({
        url: `/api/supplies/claims/${encodeURIComponent(id)}/pdf-link`,
        method: 'POST',
        data: {},
      });
      const created = parseResponse(createdRes);
      if (!created.ok) throw new Error(created.message);
      const link = toDownloadUrl(created.body.data || {});
      if (link) {
        wx.setClipboardData({ data: link });
      } else {
        wx.showToast({ title: '已生成链接', icon: 'success' });
      }
    } catch (err) {
      wx.showToast({ title: (err && err.message) ? String(err.message).slice(0, 18) : '失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  closePopup() {
    this.setData({ popupShow: false });
    this.scheduleClearClaimDetail();
  },

  async openWorkOrderModal(kind, orderId) {
    if (kind !== 'repair' && kind !== 'purchase') return;
    this.cancelClearClaimTimer();
    const path =
      kind === 'repair'
        ? `/api/repair/orders/${encodeURIComponent(orderId)}`
        : `/api/purchase/orders/${encodeURIComponent(orderId)}`;
    wx.showLoading({ title: '加载…', mask: true });
    try {
      const res = await springAuth.springRequest({ url: path, method: 'GET', data: {} });
      const p = parseResponse(res);
      if (!p.ok) {
        wx.showToast({
          title: (p.message && String(p.message).slice(0, 20)) || '无权限',
          icon: 'none',
        });
        return;
      }
      const d = p.body.data;
      const workOrderDetail = await buildWorkOrderDetail(kind, d);
      this.setData({
        workOrderDetail,
        claimDetail: null,
        grantMap: {},
        popupShow: true,
      });
    } catch (err) {
      wx.showToast({
        title: (err && err.message) ? String(err.message).slice(0, 18) : '加载失败',
        icon: 'none',
      });
    } finally {
      wx.hideLoading();
    }
  },

  previewWorkOrderImages(e) {
    const field = e.currentTarget.dataset.field;
    const d = this.data.workOrderDetail;
    if (!d || (field !== 'request' && field !== 'result')) return;
    const urls = field === 'request' ? d.requestImageUrls : d.resultImageUrls;
    if (!urls || !urls.length) return;
    const idx = Number(e.currentTarget.dataset.idx || 0);
    wx.previewImage({
      current: urls[idx] || urls[0],
      urls,
    });
  },

  onLineGrantChange(e) {
    const id = Number(e.currentTarget.dataset.id);
    const arr = e.detail.value || [];
    const grantMap = { ...this.data.grantMap, [id]: arr.indexOf('1') >= 0 };
    this.setData({ grantMap });
  },

  async confirmFulfill() {
    const d = this.data.claimDetail;
    if (!d || !this.data.canProcessClaims || d.status !== 'PENDING' || this.data.fulfilling) return;
    const lines = (d.lines || []).map((l) => ({
      lineId: l.id,
      grant: this.data.grantMap[l.id] === true,
      fulfillQty: l.qty,
    }));
    if (!lines.some((x) => x.grant)) {
      wx.showToast({ title: '请勾选行', icon: 'none' });
      return;
    }
    this.setData({ fulfilling: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/supplies/admin/claims/${encodeURIComponent(d.id)}/fulfill`,
        method: 'POST',
        data: { lines },
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      wx.showToast({ title: '已出库', icon: 'success' });
      this.closePopup();
      if (this.data.canStaff) {
        await this.loadPendingUnified({});
        await this.loadDoneUnified({});
      }
      if (this.data.activeTab === 'timeline') {
        await this.loadTimeline({ reset: true });
      }
      if (this.data.activeTab === 'notice') {
        await this.loadData({ reset: true });
      }
    } catch (err) {
      wx.showToast({
        title: (err && err.message) ? String(err.message).slice(0, 18) : '失败',
        icon: 'none',
      });
    } finally {
      this.setData({ fulfilling: false });
    }
  },

  async markWorkItemRead(e) {
    const kind = String(e.currentTarget.dataset.kind || '').trim();
    const id = String(e.currentTarget.dataset.id || '').trim();
    const bt = notificationReadSync.workKindToBizType(kind);
    if (!bt || !id) return;
    wx.showLoading({ title: '…', mask: true });
    try {
      const parsed = await notificationReadSync.markReadByBiz(bt, id);
      if (!parsed.ok) throw new Error(parsed.message);
      const ck = notificationReadSync.toBizCompositeKey(bt, id);
      const clear = (it) =>
        notificationReadSync.workKindToBizType(it.workKind) === bt && String(it.id) === id
          ? { ...it, hasUnreadNotice: false }
          : it;
      const rows = (this.data.rows || []).map((r) =>
        r.bizType && r.bizId && notificationReadSync.toBizCompositeKey(r.bizType, r.bizId) === ck
          ? { ...r, isRead: 1 }
          : r
      );
      const timelineRows = (this.data.timelineRows || []).map((row) => {
        const p = row.payload || {};
        if (
          String(row.kind || '').toUpperCase() === 'NOTIFICATION' &&
          String(p.bizType || '').toUpperCase() === bt &&
          String(p.bizId || '').trim() === id
        ) {
          return { ...row, unread: false };
        }
        return row;
      });
      this.setData({
        rows,
        timelineRows,
        unifiedPending: (this.data.unifiedPending || []).map(clear),
        unifiedDone: (this.data.unifiedDone || []).map(clear),
      });
      this.syncTimelineDisplayRows();
      this.syncBadgesAfterNoticeMutation();
    } catch (err) {
      wx.showToast({
        title: (err && err.message) ? String(err.message).slice(0, 18) : '失败',
        icon: 'none',
      });
    } finally {
      wx.hideLoading();
    }
  },

  async markRead(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showLoading({ title: '…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/notifications/${encodeURIComponent(id)}/read`,
        method: 'PATCH',
        data: {},
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      const nid = String(id);
      const rows = (this.data.rows || []).map((r) =>
        String(r.id) === nid ? { ...r, isRead: 1 } : r
      );
      this.setData({ rows });
      this.syncBadgesAfterNoticeMutation();
    } catch (err) {
      wx.showToast({
        title: (err && err.message) ? String(err.message).slice(0, 18) : '失败',
        icon: 'none',
      });
    } finally {
      wx.hideLoading();
    }
  },

  /** 「全部」动态里通知类卡片：标为已读后合并当前行并刷新角标（针对个人收件记录） */
  async markTimelineNotificationRead(e) {
    const id = e.currentTarget.dataset.id;
    const kindId = e.currentTarget.dataset.kindId;
    if (!id) return;
    wx.showLoading({ title: '…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/notifications/${encodeURIComponent(id)}/read`,
        method: 'PATCH',
        data: {},
      });
      const parsed = parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message);
      const nid = String(id);
      const timelineRows = (this.data.timelineRows || []).map((row) =>
        String(row.id) === nid || (kindId && row.kindId === kindId) ? { ...row, unread: false } : row,
      );
      this.setData({ timelineRows });
      this.syncTimelineDisplayRows();
      this.syncBadgesAfterNoticeMutation();
    } catch (err) {
      wx.showToast({
        title: (err && err.message) ? String(err.message).slice(0, 18) : '失败',
        icon: 'none',
      });
    } finally {
      wx.hideLoading();
    }
  },

  markAllRead() {
    wx.showModal({
      title: '确认操作',
      content: '确认将全部通知标记已读？（含报修/采购/物资等所有状态）',
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          const parsed = await notificationReadSync.markAllRead();
          if (!parsed.ok) throw new Error(parsed.message);
          wx.showToast({ title: '已全部标记', icon: 'success' });
          // 保存后仅合并当前列表已读状态，禁止整表 load — post-save-no-full-refresh.mdc
          const rows = (this.data.rows || []).map((r) => ({ ...r, isRead: 1 }));
          const timelineRows = (this.data.timelineRows || []).map((row) => ({ ...row, unread: false }));
          const unifiedPending = (this.data.unifiedPending || []).map((it) => ({ ...it, hasUnreadNotice: false }));
          const unifiedDone = (this.data.unifiedDone || []).map((it) => ({ ...it, hasUnreadNotice: false }));
          this.setData({ rows, timelineRows, unifiedPending, unifiedDone, receiptUnreadBadgeText: '', receiptUnreadRows: [] });
          this.syncTimelineDisplayRows();
          this.syncBadgesAfterNoticeMutation();
        } catch (err) {
          wx.showToast({
            title: (err && err.message) ? String(err.message).slice(0, 18) : '失败',
            icon: 'none',
          });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },
  },
});
