const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const suppliesExportApi = require('../../utils/suppliesExportApi.js');
const specUtil = require('../../utils/specSchemaUtil.js');

const AUDIT_SIZE = 20;
const DATE_LIST_CAP = 800;
const MIN_SELECTABLE_DATE = '2020-01-01';

function readSpringUserId() {
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

function parseResponse(res) {
  const { statusCode, data } = res;
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false };
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

function mergeRemarkWithSpec(remark, specSnapshot) {
  var base = remark && String(remark).trim() ? String(remark).trim() : '';
  var specPart = specUtil.formatSpecRemark(specSnapshot);
  if (!specPart) return base || '—';
  if (!base || base === '—') return specPart;
  return base + '；' + specPart;
}

function formatSpecLabel(specJson) {
  var obj = specJson;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch (e) { return ''; }
  }
  if (!obj || typeof obj !== 'object') return '';
  var keys = Object.keys(obj);
  if (keys.length === 0) return '';
  return keys.map(function (k) { return k + ':' + obj[k]; }).join(' ');
}

function claimStatusZh(s) {
  const u = String(s || '').toUpperCase();
  if (u === 'PENDING') return '待出库';
  if (u === 'FULFILLED') return '已完成';
  if (u === 'WITHDRAWN') return '已撤回';
  if (u === 'DELETED') return '已删除';
  return s || '-';
}

/** 聚合表「类型」仅二态：入库 / 出库（ADJUST 按数量正负归类） */
function movementInOutLabel(movementType, qty) {
  const u = String(movementType || '').toUpperCase();
  const q = qty != null ? Number(qty) : 0;
  if (u === 'INBOUND') return '入库';
  if (u === 'OUTBOUND') return '出库';
  if (u === 'ADJUST') return q < 0 ? '出库' : '入库';
  return '—';
}

/** 增加的库存 / 新增的库存：与表头语义一致；流水行按类型填数 */
function movementAddStockCols(m) {
  const t = String((m && m.movementType) || '').toUpperCase();
  const q = m && m.qty != null ? Number(m.qty) : 0;
  const kind = movementInOutLabel(m && m.movementType, m && m.qty);
  if (kind === '入库') {
    if (t === 'INBOUND') {
      const v = q > 0 ? String(q) : '0';
      return { addStock: v, newStock: v };
    }
    if (t === 'ADJUST') {
      const inc = q > 0 ? q : 0;
      const addS = String(inc);
      return { addStock: addS, newStock: String(q) };
    }
  }
  if (kind === '出库') {
    const out = Math.abs(q);
    const outS = String(out);
    if (t === 'OUTBOUND') return { addStock: '—', newStock: outS };
    if (t === 'ADJUST' && q < 0) return { addStock: '—', newStock: outS };
  }
  return { addStock: '—', newStock: '—' };
}

function lineIoType(orderStatus, fulfilledQty) {
  const fq = Number(fulfilledQty) || 0;
  const u = String(orderStatus || '').toUpperCase();
  if (fq > 0) return '出库';
  if (u === 'FULFILLED' || u === 'WITHDRAWN') return '—';
  return '待出库';
}

function toTimeText(v) {
  if (!v) return '-';
  return String(v).replace('T', ' ').slice(0, 19);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isoDateFromDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function defaultMonthStartToToday() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return { rangeFrom: isoDateFromDate(from), rangeTo: isoDateFromDate(to) };
}

function compareIsoDate(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function parseIsoToLocal(iso) {
  const p = String(iso || '').split('-').map((x) => Number(x));
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return null;
  return new Date(p[0], p[1] - 1, p[2]);
}

/** 自 maxIso 起向过去列出日期（含），最多 DATE_LIST_CAP 条 */
function buildIsoDateRowsDescending(maxIso, minIso) {
  const maxD = parseIsoToLocal(maxIso);
  const minD = parseIsoToLocal(minIso);
  if (!maxD || !minD) return [];
  const out = [];
  let d = new Date(maxD.getFullYear(), maxD.getMonth(), maxD.getDate());
  const stop = new Date(minD.getFullYear(), minD.getMonth(), minD.getDate());
  let n = 0;
  while (d >= stop && n < DATE_LIST_CAP) {
    const s = isoDateFromDate(d);
    out.push({ k: s, main: s, sub: '' });
    d.setDate(d.getDate() - 1);
    n += 1;
  }
  return out;
}

function truncateChip(s, maxLen) {
  const t = String(s || '').trim();
  if (!t) return '—';
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

function buildMergedDisplayRows(movements, restored) {
  const parts = [];
  (movements || []).forEach((m) => {
    const { addStock, newStock } = movementAddStockCols(m);
    parts.push({
      sortKey: String(m.createdAt || ''),
      _key: `m:${m.id}`,
      rowTint: '',
      timeText: toTimeText(m.createdAt),
      name: m.itemName || '-',
      ioType: movementInOutLabel(m.movementType, m.qty),
      applyQty: addStock,
      changeQty: newStock,
      stockText: m.stockAfter != null ? String(m.stockAfter) : '',
      op: m.operatorName || m.operatorUserId || '—',
      ap: m.applicantName || m.applicantUserId || '—',
      remark: mergeRemarkWithSpec(m.remark, m.specSnapshot),
    });
  });
  (restored || []).forEach((h, idx) => {
    parts.push({
      sortKey: String(h.outboundTime || ''),
      _key: `r:${h.claimId || ''}:${idx}`,
      rowTint: 'violet',
      timeText: toTimeText(h.outboundTime),
      name: h.itemName || '-',
      ioType: '出库',
      applyQty: String(h.applyQty != null ? h.applyQty : 0),
      changeQty: String(h.outboundQty != null ? h.outboundQty : 0),
      stockText: '',
      op: h.fulfilledByName || h.fulfilledByUserId || '—',
      ap: h.applicantName || h.applicantUserId || '—',
      remark: mergeRemarkWithSpec('自领用单还原', h.specSnapshot),
    });
  });
  parts.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  return parts.map(({ sortKey, ...row }) => row);
}

Page({
  data: {
    pageGateOk: false,
    canAuditSection: false,
    activeTab: 'personal',
    personalMode: 'single',
    singleClaimChipText: '请选择领用日期…',
    mineClaims: [],
    selectedClaimId: '',
    claimDetail: null,
    loadingPersonal: false,
    exportingPersonal: false,
    centerSheet: { visible: false, title: '', pickKind: '', rows: [] },
    categoryPickLabels: ['全部分类'],
    categoryPickIndex: 0,
    categoryIds: [''],
    categoryChipShort: '全部分类',
    itemsRaw: [],
    itemKeyword: '',
    itemPickLabels: ['请选择物品…'],
    itemPickIndex: 0,
    itemPickIds: [''],
    itemChipShort: '请选择物品…',
    selectedItemId: '',
    auditHotIdsArr: [],
    auditRows: [],
    restoredRows: [],
    auditTotal: 0,
    restoredTotal: 0,
    auditPage: 1,
    mergedRows: [],
    loadingAudit: false,
    exportingAudit: false,
    auditPagerShow: false,
    rangeFrom: '',
    rangeTo: '',
    applicantOptions: [],
    rangeApplicantUserId: '',
    rangeApplicantLabel: '本人',
    rangeMeta: null,
    rangeFlatRows: [],
    loadingRange: false,
    exportingRange: false,
    /** 领用区间代查他人：与后端一致，仅超级管理员及以上可切换领用人 */
    canPickRangeApplicants: false,
  },

  noop() {},

  onLoad() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    const ok =
      hasMinRole(role, 'STAFF') &&
      (pagePermission.canShowMiniEntry('mine', '/package-feature/pages/suppliesAudit/index', role, 'STAFF') ||
        pagePermission.canShowMiniEntry('home', '/package-feature/pages/suppliesAudit/index', role, 'STAFF') ||
        pagePermission.canAccessMiniPage('/package-feature/pages/suppliesAudit/index', role, 'STAFF'));
    if (!ok) {
      wx.showToast({ title: '无权限', icon: 'none' });
      this._denied = true;
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    const canAuditSection = hasMinRole(role, 'SENIOR');
    const canPickRangeApplicants = hasMinRole(role, 'SUPER_ADMIN');
    this.setData({ pageGateOk: true, canAuditSection, canPickRangeApplicants, activeTab: 'personal' }, () => {
      void this.loadMineClaims();
    });
  },

  onShow() {
    if (this._denied || !this.data.pageGateOk) return;
    void pagePermission.refreshMiniPermissions();
    if (this.data.activeTab === 'personal') {
      void this.loadMineClaims();
    }
    if (this.data.activeTab === 'audit' && this.data.canAuditSection) {
      void this.ensureAuditMeta();
    }
  },

  onMainTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
    if (tab === 'personal') {
      void this.loadMineClaims();
    } else {
      void this.ensureAuditMeta();
    }
  },

  onPersonalMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.personalMode) return;
    if (mode === 'multi') {
      const dr = defaultMonthStartToToday();
      this.setData({
        personalMode: 'multi',
        rangeFrom: dr.rangeFrom,
        rangeTo: dr.rangeTo,
        rangeMeta: null,
        rangeFlatRows: [],
        claimDetail: null,
        selectedClaimId: '',
        singleClaimChipText: '请选择领用日期…',
      });
      void this.ensureApplicantOptions();
      // 日期与领用人就绪后由 scheduleRangeQuery 自动拉聚合，无需手动「查询」
    } else {
      this.setData({
        personalMode: 'single',
        rangeMeta: null,
        rangeFlatRows: [],
      });
    }
  },

  closeCenterSheet() {
    this.setData({ centerSheet: { visible: false, title: '', pickKind: '', rows: [] } });
  },

  openClaimDateSheet() {
    const rows = (this.data.mineClaims || []).map((c) => {
      const t = toTimeText(c.createdAt);
      const day = t.slice(0, 10);
      return {
        k: c.id,
        main: day,
        sub: `${claimStatusZh(c.status)} · ${t.slice(11, 16)}`,
        claimId: c.id,
      };
    });
    if (!rows.length) {
      wx.showToast({ title: '暂无领用记录', icon: 'none' });
      return;
    }
    this.setData({
      centerSheet: { visible: true, title: '选择领用日期', pickKind: 'claim', rows },
    });
  },

  openRangeFromSheet() {
    const today = isoDateFromDate(new Date());
    const rows = buildIsoDateRowsDescending(today, MIN_SELECTABLE_DATE);
    this.setData({
      centerSheet: { visible: true, title: '选择开始日期', pickKind: 'rangeFrom', rows },
    });
  },

  openRangeToSheet() {
    const today = isoDateFromDate(new Date());
    const rows = buildIsoDateRowsDescending(today, MIN_SELECTABLE_DATE);
    this.setData({
      centerSheet: { visible: true, title: '选择结束日期', pickKind: 'rangeTo', rows },
    });
  },

  openApplicantSheet() {
    if (!this.data.canPickRangeApplicants) return;
    const opts = this.data.applicantOptions || [];
    if (opts.length <= 1) {
      wx.showToast({ title: '仅本人可选', icon: 'none' });
      return;
    }
    const rows = opts.map((o) => ({
      k: o.userId,
      main: o.displayName || o.userId || '—',
      sub: '',
      userId: o.userId,
    }));
    this.setData({
      centerSheet: { visible: true, title: '选择领用人', pickKind: 'applicant', rows },
    });
  },

  openAuditCategorySheet() {
    const labels = this.data.categoryPickLabels || [];
    const rows = labels.map((main, idx) => ({
      k: `c${idx}`,
      main,
      sub: '',
      catIdx: idx,
    }));
    this.setData({
      centerSheet: { visible: true, title: '选择分类', pickKind: 'auditCategory', rows },
    });
  },

  openAuditItemSheet() {
    const k = (this.data.itemKeyword || '').trim().toLowerCase();
    const raw = this.data.itemsRaw || [];
    const hot = new Set(this.data.auditHotIdsArr || []);
    let list = !k ? raw.slice() : raw.filter((it) => String(it.name || '').toLowerCase().includes(k));
    list.sort((a, b) => {
      const ha = hot.has(a.id);
      const hb = hot.has(b.id);
      if (ha !== hb) return ha ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
    });
    const rows = list.map((it) => ({
      k: String(it.id),
      main: `${hot.has(it.id) ? '※ ' : ''}${it.name || ''}`,
      sub: '',
      itemId: it.id,
    }));
    if (!rows.length) {
      wx.showToast({ title: '暂无物品', icon: 'none' });
      return;
    }
    this.setData({
      centerSheet: { visible: true, title: '选择物品', pickKind: 'auditItem', rows },
    });
  },

  onCenterSheetRowTap(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const rows = this.data.centerSheet.rows || [];
    const row = rows[idx];
    const kind = this.data.centerSheet.pickKind;
    if (!row) return;
    if (kind === 'claim') {
      const id = row.claimId;
      const chip = `${row.main} · ${row.sub}`;
      this.setData({
        centerSheet: { visible: false, title: '', pickKind: '', rows: [] },
        singleClaimChipText: chip,
        selectedClaimId: id,
      });
      void this.loadClaimDetail(id);
      return;
    }
    if (kind === 'rangeFrom') {
      const v = row.main;
      const to = (this.data.rangeTo || '').trim();
      if (to && compareIsoDate(v, to) > 0) {
        wx.showToast({ title: '开始不能晚于结束', icon: 'none' });
        return;
      }
      this.setData({ rangeFrom: v, centerSheet: { visible: false, title: '', pickKind: '', rows: [] } }, () =>
        this.scheduleRangeQuery(),
      );
      return;
    }
    if (kind === 'rangeTo') {
      const v = row.main;
      const from = (this.data.rangeFrom || '').trim();
      if (from && compareIsoDate(from, v) > 0) {
        wx.showToast({ title: '结束不能早于开始', icon: 'none' });
        return;
      }
      this.setData({ rangeTo: v, centerSheet: { visible: false, title: '', pickKind: '', rows: [] } }, () =>
        this.scheduleRangeQuery(),
      );
      return;
    }
    if (kind === 'applicant') {
      const uid = row.userId;
      const label = row.main || uid;
      this.setData(
        {
          rangeApplicantUserId: uid,
          rangeApplicantLabel: label,
          centerSheet: { visible: false, title: '', pickKind: '', rows: [] },
        },
        () => this.scheduleRangeQuery(),
      );
      return;
    }
    if (kind === 'auditCategory') {
      const catIdx = row.catIdx;
      this.setData({
        categoryPickIndex: catIdx,
        selectedItemId: '',
        auditPage: 1,
        centerSheet: { visible: false, title: '', pickKind: '', rows: [] },
      });
      void this.loadAuditHotIds().then(() => this.loadItems());
      return;
    }
    if (kind === 'auditItem') {
      const itemId = row.itemId;
      this.setData({
        selectedItemId: itemId === '' || itemId == null ? '' : itemId,
        auditPage: 1,
        centerSheet: { visible: false, title: '', pickKind: '', rows: [] },
      });
      this.applyItemPicker();
      return;
    }
  },

  async ensureApplicantOptions() {
    try {
      const res = await springAuth.springRequest({
        url: '/api/supplies/claims/applicant-options',
        method: 'GET',
        data: {},
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      const list = Array.isArray(p.body.data) ? p.body.data : [];
      const selfId = readSpringUserId();
      let uid = selfId;
      let label = '本人';
      const hit = list.find((x) => x && String(x.userId) === selfId);
      if (hit && hit.displayName) label = String(hit.displayName);
      else if (list[0] && list[0].userId) {
        uid = String(list[0].userId);
        label = list[0].displayName ? String(list[0].displayName) : uid;
      }
      this.setData({ applicantOptions: list, rangeApplicantUserId: uid, rangeApplicantLabel: label }, () => {
        if (this.data.personalMode === 'multi') this.scheduleRangeQuery();
      });
    } catch {
      const selfId = readSpringUserId();
      this.setData(
        {
          applicantOptions: [],
          rangeApplicantUserId: selfId,
          rangeApplicantLabel: '本人',
        },
        () => {
          if (this.data.personalMode === 'multi') this.scheduleRangeQuery();
        },
      );
    }
  },

  /** 多次模式：起止日期与领用人变更后防抖自动聚合查询（无单独查询按钮） */
  scheduleRangeQuery() {
    if (this.data.personalMode !== 'multi') return;
    const from = (this.data.rangeFrom || '').trim();
    const to = (this.data.rangeTo || '').trim();
    if (!from || !to) return;
    clearTimeout(this._rangeQueryDebounce);
    this._rangeQueryDebounce = setTimeout(() => {
      this._rangeQueryDebounce = null;
      void this.onQueryClaimRange({ silent: true });
    }, 280);
  },

  async loadMineClaims() {
    this.setData({ loadingPersonal: true });
    const prevId = this.data.selectedClaimId;
    const prevMode = this.data.personalMode;
    try {
      const res = await springAuth.springRequest({
        url: '/api/supplies/claims/mine',
        method: 'GET',
        data: { page: 1, size: 100 },
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      const inner = p.body.data || {};
      const rows = Array.isArray(inner.data) ? inner.data : [];
      let nextSel = '';
      let chip = '请选择领用日期…';
      if (prevMode === 'single' && prevId) {
        const hit = rows.find((c) => c && c.id === prevId);
        if (hit) {
          nextSel = prevId;
          const t = toTimeText(hit.createdAt);
          chip = `${t.slice(0, 10)} · ${claimStatusZh(hit.status)} · ${t.slice(11, 16)}`;
        }
      }
      // 保存后仅合并列表与当前选中 id；有选中则 loadClaimDetail 刷新一条，禁止为同步一条而整页 reload（post-save-no-full-refresh.mdc）
      this.setData({
        mineClaims: rows,
        selectedClaimId: nextSel,
        singleClaimChipText: chip,
        claimDetail: null,
      });
      if (nextSel) {
        void this.loadClaimDetail(nextSel);
      }
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.setData({ mineClaims: [], claimDetail: null, selectedClaimId: '', singleClaimChipText: '请选择领用日期…' });
    } finally {
      this.setData({ loadingPersonal: false });
    }
  },

  loadClaimDetail(id) {
    this.setData({ loadingPersonal: true });
    springAuth
      .springRequest({ url: `/api/supplies/claims/${encodeURIComponent(id)}`, method: 'GET', data: {} })
      .then((res) => {
        const p = parseResponse(res);
        if (!p.ok) throw new Error(p.message);
        const d = p.body.data;
        const rawLines = Array.isArray(d.lines) ? d.lines : [];
        const lines = rawLines.map((line) => ({
          ...line,
          lineIoType: lineIoType(d.status, line.fulfilledQty != null ? line.fulfilledQty : 0),
          specLabel: line.specSnapshot ? formatSpecLabel(line.specSnapshot) : '',
        }));
        this.setData({
          claimDetail: {
            ...d,
            statusText: claimStatusZh(d.status),
            createdAtText: toTimeText(d.createdAt),
            fulfilledAtText: toTimeText(d.fulfilledAt),
            applicantDisp: d.applicantName || d.userId || '—',
            fulfilledByDisp: d.fulfilledByName || d.fulfilledBy || '—',
            lines,
          },
        });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
        this.setData({ claimDetail: null });
      })
      .finally(() => this.setData({ loadingPersonal: false }));
  },

  onPersonalExportUnified() {
    if (this.data.exportingPersonal || this.data.exportingRange) return;
    if (this.data.personalMode === 'single') {
      void this.onExportPersonal();
    } else {
      void this.onExportClaimRange();
    }
  },

  async onExportPersonal() {
    const id = this.data.selectedClaimId;
    if (!id || this.data.exportingPersonal) return;
    this.setData({ exportingPersonal: true });
    wx.showLoading({ title: '导出中…', mask: true });
    try {
      const { base64 } = await suppliesExportApi.exportPersonalClaimExcel(id);
      const fs = wx.getFileSystemManager();
      const path = `${wx.env.USER_DATA_PATH}/supply-claim-${id.replace(/[^A-Za-z0-9_-]/g, '_')}.xlsx`;
      await new Promise((resolve, reject) => {
        fs.writeFile({
          filePath: path,
          data: base64,
          encoding: 'base64',
          success: resolve,
          fail: reject,
        });
      });
      wx.openDocument({ filePath: path, fileType: 'xlsx', showMenu: true });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '导出失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ exportingPersonal: false });
    }
  },

  _flattenRangePack(pack) {
    const orders = pack && Array.isArray(pack.data) ? pack.data : [];
    const out = [];
    orders.forEach((o) => {
      const lines = Array.isArray(o.lines) ? o.lines : [];
      lines.forEach((line) => {
        out.push({
          _key: `${o.id}:${line.id}`,
          createdAtText: toTimeText(o.createdAt),
          statusText: claimStatusZh(o.status),
          fulfilledAtText: toTimeText(o.fulfilledAt),
          snapshotName: line.snapshotName,
          specLabel: line.specSnapshot ? formatSpecLabel(line.specSnapshot) : '',
          qty: line.qty,
          fq: line.fulfilledQty != null ? line.fulfilledQty : 0,
          lineIoType: lineIoType(o.status, line.fulfilledQty != null ? line.fulfilledQty : 0),
          fulfilledByDisp: o.fulfilledByName || o.fulfilledBy || '—',
          applicantDisp: o.applicantName || o.userId || '—',
        });
      });
    });
    return out;
  },

  async onQueryClaimRange(opts) {
    const silent = !!(opts && opts.silent);
    if (this.data.personalMode !== 'multi') return;
    if (this.data.loadingRange) return;
    const from = (this.data.rangeFrom || '').trim();
    const to = (this.data.rangeTo || '').trim();
    if (!from || !to) {
      if (!silent) wx.showToast({ title: '请选择起止日期', icon: 'none' });
      return;
    }
    this.setData({ loadingRange: true });
    try {
      const data = { from, to };
      const uid = (this.data.rangeApplicantUserId || '').trim();
      if (uid) data.applicantUserId = uid;
      const res = await springAuth.springRequest({
        url: '/api/supplies/claims/mine-range',
        method: 'GET',
        data,
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      const pack = p.body.data;
      const flat = this._flattenRangePack(pack);
      this.setData({
        rangeMeta: {
          total: pack.total,
          applicantDisplayName: pack.applicantDisplayName,
          applicantUserId: pack.applicantUserId,
          from: pack.from,
          to: pack.to,
        },
        rangeFlatRows: flat,
      });
      if (!silent) wx.showToast({ title: `共${pack.total}单`, icon: 'none' });
    } catch (err) {
      this.setData({ rangeMeta: null, rangeFlatRows: [] });
      wx.showToast({ title: (err && err.message) || '查询失败', icon: 'none' });
    } finally {
      this.setData({ loadingRange: false });
    }
  },

  async onExportClaimRange() {
    if (this.data.exportingRange) return;
    const from = (this.data.rangeFrom || '').trim();
    const to = (this.data.rangeTo || '').trim();
    if (!from || !to) {
      wx.showToast({ title: '请选择起止日期', icon: 'none' });
      return;
    }
    this.setData({ exportingRange: true });
    wx.showLoading({ title: '导出中…', mask: true });
    try {
      const applicantUserId = (this.data.rangeApplicantUserId || '').trim();
      const { base64 } = await suppliesExportApi.exportPersonalClaimsRangeExcel({
        from,
        to,
        applicantUserId: applicantUserId || undefined,
      });
      const uidPart = applicantUserId ? applicantUserId.replace(/[^A-Za-z0-9_-]/g, '_') : 'me';
      const fs = wx.getFileSystemManager();
      const path = `${wx.env.USER_DATA_PATH}/supply-claims-${uidPart}-${from}_${to}.xlsx`;
      await new Promise((resolve, reject) => {
        fs.writeFile({
          filePath: path,
          data: base64,
          encoding: 'base64',
          success: resolve,
          fail: reject,
        });
      });
      wx.openDocument({ filePath: path, fileType: 'xlsx', showMenu: true });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '导出失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ exportingRange: false });
    }
  },

  async ensureAuditMeta() {
    await Promise.all([this.loadCategories(), this.loadAuditHotIds()]);
    await this.loadItems();
  },

  updateAuditChips() {
    const ci = this.data.categoryPickIndex;
    const ii = this.data.itemPickIndex;
    const cat = (this.data.categoryPickLabels || [])[ci] || '全部分类';
    const item = (this.data.itemPickLabels || [])[ii] || '请选择物品…';
    this.setData({
      categoryChipShort: truncateChip(cat, 8),
      itemChipShort: truncateChip(item, 10),
    });
  },

  async loadCategories() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    const admin = hasMinRole(role, 'ADMIN');
    const url = admin ? '/api/supplies/admin/categories' : '/api/supplies/categories';
    try {
      const res = await springAuth.springRequest({ url, method: 'GET', data: {} });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      const list = Array.isArray(p.body.data) ? p.body.data : [];
      const labels = ['全部分类'].concat(list.map((c) => c.name || String(c.id)));
      const ids = [''].concat(list.map((c) => c.id));
      this.setData({
        categoryPickLabels: labels,
        categoryPickIndex: 0,
        categoryIds: ids,
      });
      this.updateAuditChips();
    } catch (e) {
      this.setData({ categoryPickLabels: ['全部分类'], categoryPickIndex: 0, categoryIds: [''] });
      this.updateAuditChips();
    }
  },

  categoryIdSelected() {
    const idx = this.data.categoryPickIndex;
    const ids = this.data.categoryIds || [''];
    const id = ids[idx];
    if (id === '' || id == null) return undefined;
    return Number(id);
  },

  async loadAuditHotIds() {
    const cid = this.categoryIdSelected();
    try {
      const res = await springAuth.springRequest({
        url: '/api/supplies/admin/audit/item-ids-with-records',
        method: 'GET',
        data: cid != null ? { categoryId: cid } : {},
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      const arr = Array.isArray(p.body.data) ? p.body.data : [];
      this.setData({ auditHotIdsArr: arr.map((x) => Number(x)) });
    } catch (e) {
      this.setData({ auditHotIdsArr: [] });
    }
  },

  async loadItems() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    const admin = hasMinRole(role, 'ADMIN');
    const cid = this.categoryIdSelected();
    const url = admin ? '/api/supplies/admin/items' : '/api/supplies/items';
    const data = cid != null ? { categoryId: cid } : {};
    try {
      const res = await springAuth.springRequest({ url, method: 'GET', data });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      const list = Array.isArray(p.body.data) ? p.body.data : [];
      this.setData({ itemsRaw: list });
      this.applyItemPicker();
    } catch (e) {
      this.setData({ itemsRaw: [] });
      this.applyItemPicker();
    }
  },

  applyItemPicker() {
    const k = (this.data.itemKeyword || '').trim().toLowerCase();
    const raw = this.data.itemsRaw || [];
    const hot = new Set(this.data.auditHotIdsArr || []);
    let list = !k ? raw.slice() : raw.filter((it) => String(it.name || '').toLowerCase().includes(k));
    list.sort((a, b) => {
      const ha = hot.has(a.id);
      const hb = hot.has(b.id);
      if (ha !== hb) return ha ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
    });
    const labels = ['请选择物品…'].concat(list.map((it) => (hot.has(it.id) ? '※ ' : '') + (it.name || '')));
    const ids = [''].concat(list.map((it) => it.id));
    let pickIdx = 0;
    const cur = this.data.selectedItemId;
    if (cur !== '' && cur != null) {
      const found = ids.findIndex((x) => x === cur || String(x) === String(cur));
      if (found >= 0) pickIdx = found;
    }
    const maxPick = Math.max(0, ids.length - 1);
    pickIdx = Math.min(Math.max(0, pickIdx), maxPick);
    const rawId = ids[pickIdx];
    const nextId = rawId === '' || rawId == null ? '' : rawId;
    this.setData({
      itemPickLabels: labels,
      itemPickIds: ids,
      itemPickIndex: pickIdx,
      selectedItemId: nextId,
    });
    this.updateAuditChips();
    if (nextId) void this.loadAuditRows();
    else {
      this.setData({
        auditRows: [],
        restoredRows: [],
        mergedRows: [],
        auditTotal: 0,
        restoredTotal: 0,
        auditPagerShow: false,
      });
    }
  },

  onItemKeyword(e) {
    this.setData({ itemKeyword: e.detail.value || '' });
    this.applyItemPicker();
  },

  async loadAuditRows() {
    const itemId = this.data.selectedItemId;
    if (!itemId) return;
    this.setData({ loadingAudit: true });
    try {
      const res = await springAuth.springRequest({
        url: '/api/supplies/admin/audit/inventory-movements',
        method: 'GET',
        data: { itemId: Number(itemId), page: this.data.auditPage, size: AUDIT_SIZE },
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      const inner = p.body.data || {};
      const auditRows = Array.isArray(inner.data) ? inner.data : [];
      const auditTotal = Number(inner.total || 0);
      const restoredRows = Array.isArray(inner.restoredData) ? inner.restoredData : [];
      const restoredTotal = Number(inner.restoredTotal || 0);
      const mergedRows = buildMergedDisplayRows(auditRows, restoredRows);
      const maxPage = Math.max(Math.ceil(auditTotal / AUDIT_SIZE), Math.ceil(restoredTotal / AUDIT_SIZE), 1);
      this.setData({
        auditRows,
        restoredRows,
        auditTotal,
        restoredTotal,
        mergedRows,
        auditPagerShow: maxPage > 1,
        loadingAudit: false,
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.setData({
        auditRows: [],
        restoredRows: [],
        mergedRows: [],
        auditTotal: 0,
        restoredTotal: 0,
        auditPagerShow: false,
        loadingAudit: false,
      });
    }
  },

  onRefreshAudit() {
    if (!this.data.selectedItemId) {
      wx.showToast({ title: '请先选择物品', icon: 'none' });
      return;
    }
    void this.loadAuditRows();
  },

  onAuditPrev() {
    if (this.data.auditPage <= 1) return;
    this.setData({ auditPage: this.data.auditPage - 1 });
    void this.loadAuditRows();
  },

  onAuditNext() {
    const { auditTotal, restoredTotal, auditPage } = this.data;
    const maxPage = Math.max(Math.ceil(auditTotal / AUDIT_SIZE), Math.ceil(restoredTotal / AUDIT_SIZE), 1);
    if (auditPage >= maxPage) return;
    this.setData({ auditPage: auditPage + 1 });
    void this.loadAuditRows();
  },

  async onExportAudit() {
    const itemId = this.data.selectedItemId;
    if (!itemId || this.data.exportingAudit) return;
    this.setData({ exportingAudit: true });
    wx.showLoading({ title: '导出中…', mask: true });
    try {
      const { base64 } = await suppliesExportApi.exportAuditItemExcel(Number(itemId));
      const fs = wx.getFileSystemManager();
      const path = `${wx.env.USER_DATA_PATH}/supply-audit-item-${String(itemId)}.xlsx`;
      await new Promise((resolve, reject) => {
        fs.writeFile({
          filePath: path,
          data: base64,
          encoding: 'base64',
          success: resolve,
          fail: reject,
        });
      });
      wx.openDocument({ filePath: path, fileType: 'xlsx', showMenu: true });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '导出失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ exportingAudit: false });
    }
  },
});
