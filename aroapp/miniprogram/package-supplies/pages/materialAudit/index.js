/**
 * 物资领用审计（小程序）—— 网页版「申领审计导出」的移动端只读镜像。
 *
 * 四个页签与网页版一致：个人审计 / 课题组审计 / 按物品审计 / 物品+课题组。
 * 版式与交互照实验动物订购页的「订单记录」：页签条 + 筛选/导出按钮 + 可收起筛选 + 表格（横向滚动走 CSS）。
 * 取数与口径与网页版同源：申领维度走 /material/admin/audit/requests；物品维度走
 * /audit/item/{id}/movements + /claims 后按前端同一套规则合并（含"无流水补录"与库存倒推）。
 * 权限与网页版 /admin/material/audit-export 同口径：ADMIN。
 */
const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');

const PAGE_PATH = '/package-supplies/pages/materialAudit/index';
const PAGE_SIZE = 20;
const ITEM_FLOW_LIMIT = 2000; // 与网页版同窗口：取满再前端合并，避免把老单误判成"无流水补录"
/** 物品维度一次取满，但表格分批渲染（每批行数）——几百行一次性渲染会卡 */
const ITEM_RENDER_STEP = 40;
const AUDIT_EXPORT_LIMIT = 500;

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

function nonEmpty(v) {
  const s = v == null ? '' : String(v).trim();
  return s === '' || s === '全部' ? '' : s;
}

function toTimeText(v) {
  if (!v) return '—';
  return String(v).replace('T', ' ').slice(0, 16);
}

function statusZh(s) {
  const k = String(s == null ? '' : s).trim().toUpperCase();
  if (!k) return '—';
  return STATUS_ZH[k] || '未知';
}

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

function requestIdShort(id) {
  const s = String(id || '');
  return s.length > 10 ? s.slice(-10) : s;
}

/**
 * 默认只查近一个月。
 * 不设默认时"全部时间"会把几百上千行一次拉出来（物品维度要合并流水+申领，尤其慢）；
 * 日期只是筛选条件，随时可清空放宽（点日期上的 ×）或点「重置」回到默认这一个月。
 */
function defaultReportRange() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth() - 1, to.getDate());
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: iso(from), to: iso(to) };
}

/** 申领维度：一张单按明细展开成行（网页版「个人审计」表格同口径） */
function flattenRequests(requests) {
  const rows = [];
  (requests || []).forEach((r) => {
    const lines = (r && r.lines) || [];
    lines.forEach((l, i) => {
      rows.push({
        key: `${r.id}-${i}`,
        no: requestIdShort(r.id),
        itemName: (l && l.snapshotName) || '—',
        qty: l && l.qty != null ? String(l.qty) : '—',
        spec: specLabel(l && l.specSnapshot) || '—',
        statusLabel: statusZh(r.status),
        applicantName: (r && r.applicantName) || '—',
        group: (r && r.applicantGroup) || '—',
        timeText: toTimeText(r && r.createdAt),
      });
    });
  });
  return rows;
}

function dateInRange(v, from, to) {
  if (!v) return false;
  const d = String(v).slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function movementTypeZh(t) {
  const u = String(t || '').toUpperCase();
  if (u === 'INBOUND') return '入库';
  if (u === 'OUTBOUND') return '出库';
  if (u === 'ADJUST') return '调整';
  return '无';
}

function movementQtyText(type, qty) {
  const u = String(type || '').toUpperCase();
  const n = Math.abs(Number(qty) || 0);
  if (u === 'INBOUND') return `+${n}`;
  if (u === 'OUTBOUND') return `-${n}`;
  const signed = Number(qty) || 0;
  return signed > 0 ? `+${signed}` : String(signed);
}

function remarkZh(remark) {
  const t = String(remark == null ? '' : remark).trim();
  if (!t || t === '-') return '—';
  const u = t.toUpperCase();
  if (u === 'INBOUND') return '入库';
  if (u === 'OUTBOUND') return '申领出库';
  return t;
}

/** 从当前库存锚点倒推各笔流水发生后的库存（网页端同款，历史 stock_after 有写错的） */
function recomputeStock(movements, stockByItemId) {
  const out = {};
  if (!movements || !movements.length || !stockByItemId) return out;
  const byItem = {};
  movements.forEach((m) => {
    if (!m || m.id == null || m.itemId == null) return;
    const k = String(m.itemId);
    (byItem[k] = byItem[k] || []).push(m);
  });
  Object.keys(byItem).forEach((k) => {
    const cur = stockByItemId[k];
    if (cur == null) return;
    const list = byItem[k].slice().sort((a, b) => {
      const c = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      if (c !== 0) return c;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
    let running = Number(cur) || 0;
    list.forEach((m) => {
      out[m.id] = running;
      running -= Number(m.qty) || 0;
    });
  });
  return out;
}

/**
 * 物品维度：流水 + 申领明细合并成来去流水表（与网页版 buildItemFlowRows 同一套规则）。
 * @param {boolean} movementsTruncated 流水被上限截断时不能断言"这单没流水"，此时不补录
 */
function buildItemFlowRows(claims, movements, from, to, stockByItemId, movementsTruncated) {
  const stockAfter = recomputeStock(movements, stockByItemId);
  const rows = [];
  const outboundRequestIds = {};
  (movements || []).forEach((m) => {
    const type = String(m.movementType || '').toUpperCase();
    if (type !== 'INBOUND' && type !== 'OUTBOUND' && type !== 'ADJUST') return;
    if (!dateInRange(m.createdAt, from, to)) return;
    if (type === 'OUTBOUND' && m.requestId) outboundRequestIds[m.requestId] = 1;
    rows.push({
      key: `mov-${m.id}`,
      timeText: toTimeText(m.createdAt),
      ioType: movementTypeZh(type),
      itemName: m.itemName || '—',
      spec: specLabel(m.specSnapshot) || '—',
      changeQty: movementQtyText(type, m.qty),
      stockText: stockAfter[m.id] != null ? String(stockAfter[m.id]) : (m.stockAfter != null ? String(m.stockAfter) : '—'),
      applicantName: m.applicantName || '—',
      group: m.applicantGroup || '—',
      no: requestIdShort(m.requestId),
      remark: remarkZh(m.remark),
    });
  });
  if (!movementsTruncated) {
    (claims || []).forEach((c, idx) => {
      const fulfilled = Number(c.fulfilledQty) || 0;
      if (fulfilled <= 0) return;
      if (c.requestId && outboundRequestIds[c.requestId]) return;
      const t = c.fulfilledAt || c.createdAt;
      if (!dateInRange(t, from, to)) return;
      const st = String(c.status || '').toUpperCase();
      if (st !== 'FULFILLED' && st !== 'RECEIVED') return;
      rows.push({
        key: `claim-${idx}-${c.requestId}-${c.itemName || ''}`,
        timeText: toTimeText(t),
        ioType: '出库',
        itemName: c.itemName || '—',
        spec: specLabel(c.specSnapshot) || '—',
        changeQty: `-${fulfilled}`,
        stockText: '无',
        applicantName: c.applicantName || '—',
        group: c.applicantGroup || '—',
        no: requestIdShort(c.requestId),
        remark: '申领出库（无流水补录）',
      });
    });
  }
  rows.sort((a, b) => String(b.timeText).localeCompare(String(a.timeText)));
  return rows;
}

Page({
  data: {
    pageGateOk: false,
    tab: 'personal',
    isItemTab: false,
    filtersOpen: false,
    exporting: false,
    loading: false,
    loadingMore: false,
    rows: [],
    /** 表格实际渲染的行：物品维度一次取满几百行会卡，用 slice 分批渲染（上拉补一批） */
    viewRows: [],
    itemRenderLimit: 0,
    total: 0,
    loaded: 0,
    page: 1,
    hasMore: false,

    // 筛选值（option-picker 的 value；'' = 全部）
    applicantValue: '',
    groupValue: '',
    categoryValue: '',
    itemValue: '',
    itemKeyword: '',
    from: '',
    to: '',

    // option-picker 的选项 [{value,label}]；日期走 van-datetime-picker 弹层
    applicantOptions: [],
    groupOptions: [],
    categoryOptions: [],
    itemOptions: [],
    datePickShow: false,
    datePickKey: '',
    datePickMs: Date.now(),

    // 通用导出设置弹层（组件自包含：自己拉摘要、自己导出）
    cfgShow: false,
    cfgParams: {},
    cfgSummaryUrl: '',
    cfgExportUrl: '',
    cfgName: '', 

    applicantsRaw: [],
    groupsRaw: [],
    categoriesRaw: [],
    itemsRaw: [],
  },

  onLoad(options) {
    const role = readRole();
    if (!hasMinRole(role, 'ADMIN') || !pagePermission.canAccessMiniPage(PAGE_PATH, role, 'ADMIN')) {
      this._denied = true;
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 400);
      return;
    }
    // 智能助手给的链接会带参数（?tab=&from=&to=&group=&category=&item=&applicant=&keyword=）。
    // 先记住，等候选拉回来再把值落到对应 picker 上 —— 见 applyPendingFilters。
    this._pending = options || {};
    const p = this._pending;
    const tab = p.tab === 'group' || p.tab === 'item' || p.tab === 'itemGroup' ? p.tab : 'personal';
    const patch = {
      pageGateOk: true,
      ...defaultReportRange(),
      tab,
      isItemTab: tab === 'item' || tab === 'itemGroup',
    };
    if (p.from) patch.from = p.from;
    if (p.to) patch.to = p.to;
    this.setData(patch, () => {
      Promise.resolve(this.loadLookups()).then(() => {
        this.applyPendingFilters();
        this.reload();
        // 链接带 openExport=1：直接把导出设置弹层打开（助手把用户送到「最后一步」）
        if (p.openExport === '1') this.onExport();
      });
    });
  },

  /**
   * 把链接带过来的条件落到 picker 上。
   *
   * 值**必须在候选里命中才落**：选中一个候选里没有的值，picker 上显示空、而查询条件却生效，
   * 用户看到的是「筛了但界面上没选」—— 比干脆不选更难解释。
   */
  applyPendingFilters() {
    const p = this._pending || {};
    const patch = {};
    // 链接带过来的值**可能是百分号编码还没解开的**：助手给的路径里有中文参数时实测如此
    // （`group=%E9%83%91…` 原样进了 onLoad，命不中候选 → 筛没上，界面上还看着像「没选」）。
    // 解一次再比；解不开就按原样比 —— 不能因为解码失败把整条筛选丢掉。
    const dec = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      if (s.indexOf('%') < 0) return s;
      try {
        return decodeURIComponent(s);
      } catch (e) {
        return s;
      }
    };
    const group = dec(p.group);
    const category = dec(p.category);
    const applicant = dec(p.applicant);
    if (group && (this.data.groupOptions || []).some((o) => o.value === group)) {
      patch.groupValue = group;
    }
    if (category && (this.data.categoryOptions || []).some((o) => o.value === category)) {
      patch.categoryValue = category;
    }
    if (applicant && (this.data.applicantOptions || []).some((o) => o.value === applicant)) {
      patch.applicantValue = applicant;
    }
    if (Object.keys(patch).length) this.setData(patch);
    if (p.item) {
      // 物品候选是二级异步（先分类再物品）—— 落一次，再等一拍落一次
      const applyItem = () => {
        const opts = this.data.itemOptions || [];
        if (opts.some((o) => o.value === String(p.item))) {
          this.setData({ itemValue: String(p.item) }, () => this.reload());
        }
      };
      applyItem();
      setTimeout(applyItem, 700);
    }
  },

  onShow() {
    if (this._denied || !this.data.pageGateOk) return;
    if (this._loadedOnce) this.reload();
    this._loadedOnce = true;
  },

  guard(res) {
    if (res && (res.statusCode === 401 || res.statusCode === 403)) {
      wx.showToast({ title: '登录已失效', icon: 'none' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 400);
      return false;
    }
    return true;
  },

  // ── 页签 / 视图 ──

  onTabTap(e) {
    const tab = String(e.currentTarget.dataset.tab || 'personal');
    if (tab === this.data.tab) return;
    this.setData({ tab, isItemTab: tab === 'item' || tab === 'itemGroup', filtersOpen: false }, () => {
      this.loadLookups();
      this.reload();
    });
  },

  toggleFilters() {
    this.setData({ filtersOpen: !this.data.filtersOpen });
  },

  /** 重置：清空条件并回到默认的"近一个月"；面板保持展开（还在挑条件时不该被收起来） */
  resetFilters() {
    this.setData(
      {
        applicantValue: '',
        groupValue: '',
        categoryValue: '',
        itemValue: '',
        itemKeyword: '',
        ...defaultReportRange(),
      },
      () => this.reload(),
    );
  },

  // ── 筛选即筛：改任何一项立刻取数，不用再点「筛选」 ──

  onApplicantChange(e) {
    this.setData({ applicantValue: String((e.detail && e.detail.value) || '') }, () => this.reload());
  },

  onGroupChange(e) {
    const v = String((e.detail && e.detail.value) || '');
    this.setData({ groupValue: v, itemValue: '' }, () => {
      // 物品+课题组：该组的分类/物品候选要重新拉，拿到后再取数（库存列依赖物品列表）
      if (this.data.tab === 'itemGroup') {
        Promise.resolve(this.loadLookups()).then(() => this.reload());
        return;
      }
      this.reload();
    });
  },

  onCategoryChange(e) {
    const v = String((e.detail && e.detail.value) || '');
    this.setData({ categoryValue: v, itemValue: '' }, () => {
      if (this.data.isItemTab) {
        Promise.resolve(this.loadItems()).then(() => this.reload());
        return;
      }
      this.reload();
    });
  },

  onItemChange(e) {
    this.setData({ itemValue: String((e.detail && e.detail.value) || '') }, () => this.reload());
  },

  /** 关键词逐字输入 → 350ms 防抖后自动取数（与门禁页同款做法，别一字符一请求） */
  onKeywordInput(e) {
    this.setData({ itemKeyword: (e.detail && e.detail.value) || '' });
    if (this._kwTimer) clearTimeout(this._kwTimer);
    this._kwTimer = setTimeout(() => {
      this._kwTimer = null;
      this.reload();
    }, 350);
  },

  // ── 日期：van-datetime-picker 弹层 ──

  onDateChipTap(e) {
    const key = String(e.currentTarget.dataset.key || 'from');
    const cur = key === 'to' ? this.data.to : this.data.from;
    const ms = cur ? new Date(`${cur}T00:00:00`).getTime() : Date.now();
    this.setData({ datePickShow: true, datePickKey: key, datePickMs: Number.isFinite(ms) ? ms : Date.now() });
  },

  onDateConfirm(e) {
    const ms = Number(e.detail) || Date.now();
    const d = new Date(ms);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const key = this.data.datePickKey === 'to' ? 'to' : 'from';
    this.setData({ [key]: iso, datePickShow: false }, () => this.reload());
  },

  onDateClear(e) {
    const key = String(e.currentTarget.dataset.key || 'from') === 'to' ? 'to' : 'from';
    this.setData({ [key]: '' }, () => this.reload());
  },

  onDatePickClose() {
    this.setData({ datePickShow: false });
  },

  /** 选项 label（导出文件名用） */
  labelOf(options, value, fallback) {
    const hit = (options || []).find((o) => o && o.value === value);
    return (hit && hit.label) || fallback;
  },

  // ── 候选数据 ──

  async loadLookups() {
    try {
      const tab = this.data.tab;
      const tasks = [];
      if (tab === 'personal') {
        tasks.push(springAuth.springRequest({ url: '/api/material/admin/applicants-with-records', method: 'GET' }));
      }
      if (tab === 'group' || tab === 'itemGroup') {
        tasks.push(springAuth.springRequest({ url: '/api/material/admin/groups-with-records', method: 'GET' }));
      }
      if (tab === 'item' || tab === 'itemGroup') {
        const q = this.data.groupValue ? { applicantGroup: this.data.groupValue } : {};
        tasks.push(springAuth.springRequest({ url: '/api/material/admin/categories', method: 'GET', data: q }));
      }
      const res = await Promise.all(tasks);
      let k = 0;
      const patch = {};
      if (tab === 'personal') {
        const p = parseResponse(res[k++]);
        const list = p.ok && Array.isArray(p.body) ? p.body : [];
        patch.applicantsRaw = list;
        patch.applicantOptions = [{ value: '', label: '全部申领人' }].concat(
          list.map((a) => ({ value: String(a.userId || ''), label: a.applicantName || a.userId || '—' })),
        );
      }
      if (tab === 'group' || tab === 'itemGroup') {
        const p = parseResponse(res[k++]);
        const list = p.ok && Array.isArray(p.body) ? p.body : [];
        patch.groupsRaw = list;
        patch.groupOptions = [{ value: '', label: '全部课题组' }].concat(list.map((g) => ({ value: g, label: g })));
      }
      if (tab === 'item' || tab === 'itemGroup') {
        const p = parseResponse(res[k++]);
        const list = p.ok && Array.isArray(p.body) ? p.body : [];
        patch.categoriesRaw = list;
        patch.categoryOptions = [{ value: '', label: '全部分类' }].concat(
          list.map((c) => ({ value: String(c.id), label: c.name || `#${c.id}` })),
        );
        this.setData(patch);
        this.loadItems();
        return;
      }
      this.setData(patch);
    } catch (e) {
      // 候选拉不到不挡主表
    }
  },

  async loadItems() {
    if (!this.data.isItemTab) return;
    try {
      const q = {};
      if (this.data.categoryValue) q.categoryId = this.data.categoryValue;
      if (this.data.groupValue && this.data.tab === 'itemGroup') q.applicantGroup = this.data.groupValue;
      const res = await springAuth.springRequest({ url: '/api/material/admin/items', method: 'GET', data: q });
      const p = parseResponse(res);
      const list = p.ok && Array.isArray(p.body) ? p.body : [];
      this.setData({
        itemsRaw: list,
        itemOptions: [{ value: '', label: '全部物品' }].concat(
          list.map((it) => ({ value: String(it.id), label: it.name || `#${it.id}` })),
        ),
      });
    } catch (e) {
      // 同 loadLookups
    }
  },

  // ── 取数 ──

  reload() {
    this.setData({ page: 1, loaded: 0, hasMore: false, rows: [], viewRows: [], itemRenderLimit: 0 }, () => this.loadPage(1));
  },

  async loadPage(page) {
    const first = page <= 1;
    if (!first && (this.data.loading || this.data.loadingMore)) return;
    const seq = (this._seq = (this._seq || 0) + 1);
    this.setData(first ? { loading: true } : { loadingMore: true });
    try {
      if (this.data.isItemTab) {
        await this.loadItemFlow(seq);
      } else {
        await this.loadRequestPage(page, first, seq);
      }
    } catch (e) {
      if (seq === this._seq) wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      if (seq === this._seq) this.setData({ loading: false, loadingMore: false });
    }
  },

  async loadRequestPage(page, first, seq) {
    const q = { page, size: PAGE_SIZE };
    if (this.data.from) q.from = this.data.from;
    if (this.data.to) q.to = this.data.to;
    const tab = this.data.tab;
    if (tab === 'personal' && this.data.applicantValue) q.applicantUserId = this.data.applicantValue;
    if (tab === 'group' && this.data.groupValue) q.applicantGroup = this.data.groupValue;

    const res = await springAuth.springRequest({ url: '/api/material/admin/audit/requests', method: 'GET', data: q });
    if (seq !== this._seq) return;
    if (!this.guard(res)) return;
    const p = parseResponse(res);
    if (!p.ok) {
      wx.showToast({ title: p.message, icon: 'none' });
      return;
    }
    const body = p.body || {};
    const list = Array.isArray(body.data) ? body.data : [];
    const total = Number(body.total) || 0;
    const pageRows = flattenRequests(list);
    const loaded = (first ? 0 : this.data.loaded) + list.length;
    const allRows = first ? pageRows : this.data.rows.concat(pageRows);
    this.setData({ rows: allRows, viewRows: allRows, loaded, total, hasMore: loaded < total, page });
  },

  /** 物品维度：与网页版一致——一次取满窗口，前端合并流水与申领 */
  async loadItemFlow(seq) {
    const q = { page: 1, size: ITEM_FLOW_LIMIT };
    if (this.data.from) q.from = this.data.from;
    if (this.data.to) q.to = this.data.to;
    if (this.data.categoryValue) q.categoryId = this.data.categoryValue;
    if (this.data.itemKeyword) q.keyword = this.data.itemKeyword;
    if (this.data.tab === 'itemGroup' && this.data.groupValue) q.applicantGroup = this.data.groupValue;
    const pathId = this.data.itemValue ? this.data.itemValue : 0;

    const [mvRes, clRes] = await Promise.all([
      springAuth.springRequest({ url: `/api/material/admin/audit/item/${pathId}/movements`, method: 'GET', data: q }),
      springAuth.springRequest({ url: `/api/material/admin/audit/item/${pathId}/claims`, method: 'GET', data: q }),
    ]);
    if (seq !== this._seq) return;
    if (!this.guard(mvRes) || !this.guard(clRes)) return;
    const mv = parseResponse(mvRes);
    const cl = parseResponse(clRes);
    if (!mv.ok || !cl.ok) {
      wx.showToast({ title: (mv.ok ? cl.message : mv.message) || '加载失败', icon: 'none' });
      return;
    }
    const movements = (mv.body && mv.body.data) || [];
    const claims = (cl.body && cl.body.data) || [];
    const stockByItemId = {};
    (this.data.itemsRaw || []).forEach((it) => {
      if (it && it.id != null) stockByItemId[String(it.id)] = Number(it.stockQty) || 0;
    });
    const truncated = Number(mv.body && mv.body.total) > movements.length;
    const rows = buildItemFlowRows(claims, movements, this.data.from, this.data.to, stockByItemId, truncated);
    this.setData({
      rows,
      viewRows: rows.slice(0, ITEM_RENDER_STEP),
      itemRenderLimit: ITEM_RENDER_STEP,
      total: rows.length,
      loaded: rows.length,
      hasMore: false,
      page: 1,
    });
  },

  onReachBottomEnd() {
    if (this.data.isItemTab) {
      // 物品维度：数据已全在内存，上拉只多渲染一段（不请求、不重复取数）
      if (this.data.itemRenderLimit >= this.data.rows.length) return;
      const limit = this.data.itemRenderLimit + ITEM_RENDER_STEP;
      this.setData({ itemRenderLimit: limit, viewRows: this.data.rows.slice(0, limit) });
      return;
    }
    if (!this.data.hasMore || this.data.loading || this.data.loadingMore) return;
    this.loadPage((this.data.page || 1) + 1);
  },

  // ── 导出 ──

  /** 点「导出 Excel」→ 开通用导出设置弹层（层级/板块开关），导出逻辑在组件里 */
  onExport() {
    const q = this.buildExportParams();
    const name = this.data.isItemTab
      ? `物品审计-${this.data.from || 'start'}_${this.data.to || 'end'}.xlsx`
      : `申领审计-${this.data.from || 'start'}_${this.data.to || 'end'}.xlsx`;
    this.setData({
      cfgShow: true,
      cfgParams: q,
      cfgSummaryUrl: this.exportUrl('/summary'),
      cfgExportUrl: this.exportUrl(''),
      cfgName: name,
    });
  },

  onCfgClose() {
    this.setData({ cfgShow: false });
  },

  onCfgDone() {
    this.setData({ cfgShow: false });
  },

  /** 导出/摘要共用的筛选参数（与页面筛选同源） */
  buildExportParams() {
    const q = {};
    if (this.data.from) q.from = this.data.from;
    if (this.data.to) q.to = this.data.to;
    if (this.data.isItemTab) {
      if (this.data.categoryValue) q.categoryId = this.data.categoryValue;
      if (this.data.itemKeyword) q.keyword = this.data.itemKeyword;
      if (this.data.tab === 'itemGroup' && this.data.groupValue) q.applicantGroup = this.data.groupValue;
      if (this.data.itemValue) q.exportLabel = `物品审计-${this.labelOf(this.data.itemOptions, this.data.itemValue, '全部物品')}`;
    } else {
      if (this.data.tab === 'personal' && this.data.applicantValue) q.applicantUserId = this.data.applicantValue;
      if (this.data.tab === 'group' && this.data.groupValue) q.applicantGroup = this.data.groupValue;
      q.exportLabel =
        this.data.tab === 'personal'
          ? `个人审计-${this.labelOf(this.data.applicantOptions, this.data.applicantValue, '全部申领人')}`
          : `课题组审计-${this.labelOf(this.data.groupOptions, this.data.groupValue, '全部课题组')}`;
    }
    return q;
  },

  exportUrl(suffix) {
    const pathId = this.data.itemValue ? this.data.itemValue : 0;
    return this.data.isItemTab
      ? `/api/material/admin/audit/item/${pathId}/export${suffix}`
      : `/api/material/admin/stats/export${suffix}`;
  },
});
