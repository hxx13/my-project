/**
 * 物资领用审计 —— 教职工查看学生的物资申领单（个人/课题组维度）。
 *
 * 后端取数 /api/material/admin/audit/requests（按物品配置的审核人做行级过滤，超管不 bypass），
 * 与网页版「申领审计导出」同源；这里只做只读审计：筛选（课题组/申领人/日期区间）+ 触底上拉。
 * 布局参照 package-supplies/pages/suppliesAudit（筛选卡 + 滚动列表 + 中心弹窗选择）。
 */
const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');

const PAGE_PATH = '/package-supplies/pages/materialAudit/index';
const PAGE_SIZE = 30;
const DATE_LIST_CAP = 800;
const MIN_SELECTABLE_DATE = '2020-01-01';

const STATUS_ZH = {
  DRAFT: '草稿',
  PENDING: '待审核',
  FIRST_OK: '初审通过',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  FULFILLED: '已出库',
  RECEIVED: '已完成',
};

function readRole() {
  return wx.getStorageSync(springAuth.KEYS.ROLE) || '';
}

function parseResponse(res) {
  const { statusCode, data } = res;
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false, message: '响应解析失败' };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || `请求失败(${statusCode})` };
  }
  return { ok: true, body: body.data };
}

function toTimeText(v) {
  if (!v) return '-';
  return String(v).replace('T', ' ').slice(0, 19);
}

function statusZh(s) {
  const k = String(s == null ? '' : s).trim().toUpperCase();
  if (!k) return '—';
  return STATUS_ZH[k] || '未知';
}

/** 规格快照 JSON → 「A·B」；解析不了就留空 */
function specLabel(specSnapshot) {
  if (!specSnapshot) return '';
  try {
    const obj = JSON.parse(specSnapshot);
    if (!obj || typeof obj !== 'object') return '';
    return Object.values(obj)
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter((v) => v !== '')
      .join('·');
  } catch (e) {
    return '';
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isoDateFromDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseIsoToLocal(iso) {
  const p = String(iso || '').split('-').map((x) => Number(x));
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return null;
  return new Date(p[0], p[1] - 1, p[2]);
}

function compareIsoDate(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** 自 maxIso 起向过去列日期（含），最多 DATE_LIST_CAP 条 */
function buildIsoDateRowsDescending(maxIso, minIso) {
  const maxD = parseIsoToLocal(maxIso);
  const minD = parseIsoToLocal(minIso);
  if (!maxD || !minD) return [];
  const out = [];
  const d = new Date(maxD.getFullYear(), maxD.getMonth(), maxD.getDate());
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

/** 一张申领单 → 每个明细一行（与网页版「个人审计」表格同口径） */
function flattenRequests(requests) {
  const rows = [];
  (requests || []).forEach((r) => {
    const lines = (r && r.lines) || [];
    lines.forEach((l, i) => {
      rows.push({
        key: `${r.id}-${i}`,
        timeText: toTimeText(r.createdAt),
        itemName: (l && l.snapshotName) || '—',
        qty: l && l.qty != null ? String(l.qty) : '—',
        specLabel: specLabel(l && l.specSnapshot) || '—',
        statusText: statusZh(r.status),
        applicantName: (r && r.applicantName) || '—',
        applicantGroup: (r && r.applicantGroup) || '—',
        requestId: r && r.id ? String(r.id) : '',
      });
    });
  });
  return rows;
}

Page({
  data: {
    pageGateOk: false,
    loading: false,
    loadingMore: false,
    rows: [],
    loadedRequests: 0,
    totalRequests: 0,
    hasMore: false,

    groupLabel: '全部课题组',
    applicantLabel: '全部申领人',
    rangeFrom: '',
    rangeTo: '',

    groupOptions: [],
    applicantOptions: [],
    sheet: { visible: false, title: '', pickKind: '', rows: [] },
  },

  onLoad() {
    const role = readRole();
    if (!hasMinRole(role, 'STAFF') || !pagePermission.canAccessMiniPage(PAGE_PATH, role, 'STAFF')) {
      this._denied = true;
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 400);
      return;
    }
    this.setData({ pageGateOk: true });
    this.loadFilterOptions();
    this.loadPage(1);
  },

  onShow() {
    if (this._denied || !this.data.pageGateOk) return;
    // 审核/出库状态可能在别处变过，回来时刷新第一页即可（不动筛选）
    if (this._loadedOnce) this.loadPage(1);
    this._loadedOnce = true;
  },

  /** 未登录/无权限时直接退出，不落成"加载失败" */
  guard(res, fallbackMsg) {
    if (res && (res.statusCode === 401 || res.statusCode === 403)) {
      wx.showToast({ title: '登录已失效', icon: 'none' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 400);
      return false;
    }
    return true;
  },

  /** 课题组/申领人候选：不带日期，取全量，方便"先选组再挑日期" */
  async loadFilterOptions() {
    try {
      const [groups, applicants] = await Promise.all([
        springAuth.springRequest({ url: '/api/material/admin/groups-with-records', method: 'GET' }),
        springAuth.springRequest({ url: '/api/material/admin/applicants-with-records', method: 'GET' }),
      ]);
      if (!this.guard(groups) || !this.guard(applicants)) return;
      const g = parseResponse(groups);
      const a = parseResponse(applicants);
      this.setData({
        groupOptions: g.ok && Array.isArray(g.body) ? g.body.filter(Boolean) : [],
        applicantOptions: a.ok && Array.isArray(a.body) ? a.body : [],
      });
    } catch (e) {
      // 候选拉不到不挡列表：筛选退化成"全部"
    }
  },

  buildQuery(page) {
    const q = { page, size: PAGE_SIZE };
    const from = (this.data.rangeFrom || '').trim();
    const to = (this.data.rangeTo || '').trim();
    if (from) q.from = from;
    if (to) q.to = to;
    const group = this.data.groupValue;
    const applicant = this.data.applicantValue;
    if (group) q.applicantGroup = group;
    if (applicant) q.applicantUserId = applicant;
    return q;
  },

  async loadPage(page) {
    const first = page <= 1;
    if (first ? this.data.loading : this.data.loadingMore) return;
    this.setData(first ? { loading: true } : { loadingMore: true });
    try {
      const res = await springAuth.springRequest({
        url: '/api/material/admin/audit/requests',
        method: 'GET',
        data: this.buildQuery(page),
      });
      if (!this.guard(res)) return;
      const parsed = parseResponse(res);
      if (!parsed.ok) {
        wx.showToast({ title: parsed.message, icon: 'none' });
        return;
      }
      const body = parsed.body || {};
      const list = Array.isArray(body.data) ? body.data : [];
      const total = Number(body.total) || 0;
      const pageRows = flattenRequests(list);
      const loaded = (first ? 0 : this.data.loadedRequests) + list.length;
      this.setData({
        rows: first ? pageRows : this.data.rows.concat(pageRows),
        loadedRequests: loaded,
        totalRequests: total,
        hasMore: loaded < total,
        page,
      });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  /** 页面级触底（用页面滚动 + onReachBottom，避免外层竖滚里再嵌 scroll-view 的坑） */
  onReachBottom() {
    if (!this.data.hasMore || this.data.loading || this.data.loadingMore) return;
    this.loadPage((this.data.page || 1) + 1);
  },

  onRefresh() {
    this.loadPage(1);
  },

  // ── 中心弹窗选择（与领用审计一致，禁用微信原生 picker）──

  closeSheet() {
    this.setData({ sheet: { visible: false, title: '', pickKind: '', rows: [] } });
  },

  noop() {},

  openGroupSheet() {
    const rows = [{ k: '__all__', main: '全部课题组', sub: '', group: '' }].concat(
      (this.data.groupOptions || []).map((g) => ({ k: g, main: g, sub: '', group: g })),
    );
    this.setData({ sheet: { visible: true, title: '选择课题组', pickKind: 'group', rows } });
  },

  openApplicantSheet() {
    const rows = [{ k: '__all__', main: '全部申领人', sub: '', applicant: '' }].concat(
      (this.data.applicantOptions || []).map((a) => ({
        k: a.userId,
        main: a.applicantName || a.userId || '—',
        sub: '',
        applicant: a.userId,
      })),
    );
    this.setData({ sheet: { visible: true, title: '选择申领人', pickKind: 'applicant', rows } });
  },

  openFromSheet() {
    const today = isoDateFromDate(new Date());
    this.setData({
      sheet: { visible: true, title: '选择开始日期', pickKind: 'rangeFrom', rows: buildIsoDateRowsDescending(today, MIN_SELECTABLE_DATE) },
    });
  },

  openToSheet() {
    const today = isoDateFromDate(new Date());
    this.setData({
      sheet: { visible: true, title: '选择结束日期', pickKind: 'rangeTo', rows: buildIsoDateRowsDescending(today, MIN_SELECTABLE_DATE) },
    });
  },

  onSheetRowTap(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const row = (this.data.sheet.rows || [])[idx];
    const kind = this.data.sheet.pickKind;
    if (!row) return;
    if (kind === 'group') {
      this.setData({ groupValue: row.group || '', groupLabel: row.main, sheet: { visible: false, title: '', pickKind: '', rows: [] } }, () => this.loadPage(1));
      return;
    }
    if (kind === 'applicant') {
      this.setData({ applicantValue: row.applicant || '', applicantLabel: row.main, sheet: { visible: false, title: '', pickKind: '', rows: [] } }, () => this.loadPage(1));
      return;
    }
    if (kind === 'rangeFrom') {
      const to = (this.data.rangeTo || '').trim();
      if (to && compareIsoDate(row.main, to) > 0) {
        wx.showToast({ title: '开始不能晚于结束', icon: 'none' });
        return;
      }
      this.setData({ rangeFrom: row.main, rangeTo: to, sheet: { visible: false, title: '', pickKind: '', rows: [] } }, () => this.loadPage(1));
      return;
    }
    if (kind === 'rangeTo') {
      const from = (this.data.rangeFrom || '').trim();
      if (from && compareIsoDate(from, row.main) > 0) {
        wx.showToast({ title: '结束不能早于开始', icon: 'none' });
        return;
      }
      this.setData({ rangeTo: row.main, sheet: { visible: false, title: '', pickKind: '', rows: [] } }, () => this.loadPage(1));
    }
  },

  onClearFilters() {
    this.setData(
      { groupValue: '', applicantValue: '', groupLabel: '全部课题组', applicantLabel: '全部申领人', rangeFrom: '', rangeTo: '' },
      () => this.loadPage(1),
    );
  },
});
