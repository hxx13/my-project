const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const { fetchCapabilitySummaryMap } = require('../../utils/capabilitySummary.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { peekPendingBadges, refreshPendingBadges } = require('../../../utils/badgeSnapshotStore.js');
const { formatBadgeText } = require('../../../utils/pendingBadgeCounts.js');
const {
  canShowStudentMaterialSwitch,
  goStudentMaterial,
} = require('../../utils/suppliesStudentSwitch.js');
const specUtil = require('../../utils/specSchemaUtil.js');
const { calcMaterialMallLayout } = require('../../utils/materialMallLayout.js');

const SUPPLIES_CART_STORAGE_VER = 'aroapp_supplies_cart_v2';

/* ── Spec helpers ────────────────────────────────────────────── */

/**
 * Generate all combinations (cartesian product) of spec dimensions.
 * Input:  { "尺寸":["S","M","L"], "颜色":["红","蓝"] }
 * Output: [{ "尺寸":"S","颜色":"红" }, { "尺寸":"S","颜色":"蓝" }, ...]
 */
function generateSpecCombos(dimensions) {
  if (!dimensions || typeof dimensions !== 'object') return [];
  const dimKeys = Object.keys(dimensions).filter(function (k) { return Array.isArray(dimensions[k]) && dimensions[k].length > 0; });
  if (dimKeys.length === 0) return [];
  var combos = [{}];
  dimKeys.forEach(function (k) {
    var next = [];
    combos.forEach(function (c) {
      dimensions[k].forEach(function (v) {
        var copy = {};
        Object.keys(c).forEach(function (ck) { copy[ck] = c[ck]; });
        copy[k] = v;
        next.push(copy);
      });
    });
    combos = next;
  });
  return combos;
}

/**
 * Format a spec snapshot object into a human-readable label.
 * {"尺寸":"M","颜色":"红"} -> "尺寸:M 颜色:红"
 */
function formatSpecLabel(specJson) {
  if (!specJson) return '';
  var obj = specJson;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch (e) { return ''; }
  }
  if (!obj || typeof obj !== 'object') return '';
  var keys = Object.keys(obj);
  if (keys.length === 0) return '';
  return keys.map(function (k) { return k + ':' + obj[k]; }).join(' ');
}

/**
 * Build a cart key for a spec item.
 * itemId=42, selections={"尺寸":"M","颜色":"红"} -> "42::尺寸=M|颜色=红"
 */
function specCartKey(itemId, selections) {
  if (!selections || typeof selections !== 'object') return String(itemId);
  var keys = Object.keys(selections).filter(function (k) { return selections[k] != null && selections[k] !== ''; });
  if (keys.length === 0) return String(itemId);
  keys.sort();
  var parts = keys.map(function (k) { return k + '=' + selections[k]; });
  return itemId + '::' + parts.join('|');
}

/**
 * Parse a cart key back into itemId and specSnapshot.
 * "42::尺寸=M|颜色=红" -> { itemId: 42, specSnapshot: {"尺寸":"M","颜色":"红"} }
 * "42" -> { itemId: 42, specSnapshot: null }
 */
function parseCartKey(key) {
  var str = String(key);
  var idx = str.indexOf('::');
  if (idx === -1) return { itemId: Number(str), specSnapshot: null };
  var itemId = Number(str.slice(0, idx));
  var specPart = str.slice(idx + 2);
  var spec = {};
  if (specPart) {
    specPart.split('|').forEach(function (pair) {
      var eq = pair.indexOf('=');
      if (eq > 0) spec[pair.slice(0, eq)] = pair.slice(eq + 1);
    });
  }
  return { itemId: itemId, specSnapshot: Object.keys(spec).length ? spec : null };
}

/** 规格对象 → 键排序后的 JSON 字符串（与后端行合并键规范一致）
 *  后端 CreateSupplyClaimRequest.Line.specSnapshot 为 String，请求体必须传 JSON 文本而非对象 */
function specSnapshotToJson(spec) {
  if (!spec || typeof spec !== 'object') return undefined;
  var keys = Object.keys(spec).sort();
  if (!keys.length) return undefined;
  var sorted = {};
  keys.forEach(function (k) { sorted[k] = spec[k]; });
  return JSON.stringify(sorted);
}

/**
 * True when the item has a valid specSchema (at least one dimension with options).
 */
function itemHasSpec(item) {
  return specUtil.hasSpecSchema(item && item.specSchema);
}

/**
 * Parse specSchema from item into legacy flat map { 维度名: options[] }（供 SKU 面板使用）
 */
function parseSpecSchema(item) {
  var dims = specUtil.parseSpecDimensions(item && item.specSchema);
  if (!dims.length) return null;
  var schema = {};
  dims.forEach(function (d) {
    schema[d.name] = d.options;
  });
  return schema;
}

/* ── Cart persistence ────────────────────────────────────────── */

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

function suppliesCartStorageKey() {
  return `${SUPPLIES_CART_STORAGE_VER}_${readSpringUserId() || 'local'}`;
}

/**
 * Load persisted cart. Keys are strings; numeric-only keys = non-spec items,
 * keys containing "::" = spec variants.
 */
function loadPersistedSuppliesCart() {
  try {
    const raw = wx.getStorageSync(suppliesCartStorageKey());
    if (raw == null || raw === '') return {};
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!o || typeof o !== 'object') return {};
    const cart = {};
    Object.keys(o).forEach((k) => {
      const qty = Number(o[k]);
      if (Number.isFinite(qty) && qty > 0) {
        cart[k] = Math.min(Math.floor(qty), 999);
      }
    });
    return cart;
  } catch (e) {
    return {};
  }
}

function persistSuppliesCart(cart) {
  try {
    wx.setStorageSync(suppliesCartStorageKey(), cart || {});
  } catch (e) {
    /* ignore */
  }
}

function mergeRemoteCartLines(bodyLines) {
  const cart = {};
  if (!bodyLines || typeof bodyLines !== 'object') return cart;
  Object.keys(bodyLines).forEach((k) => {
    const qty = Number(bodyLines[k]);
    if (Number.isFinite(qty) && qty > 0) {
      cart[k] = Math.min(Math.floor(qty), 999);
    }
  });
  return cart;
}

async function fetchRemoteSuppliesCart() {
  const res = await springAuth.springRequest({ url: '/api/supplies/cart', method: 'GET', data: {} });
  const p = parseResponse(res);
  if (!p.ok) return null;
  const lines = (p.body.data && p.body.data.lines) || {};
  return mergeRemoteCartLines(lines);
}

async function saveRemoteSuppliesCart(cart) {
  const lines = {};
  Object.keys(cart || {}).forEach((k) => {
    const qty = cart[k];
    if (!Number.isFinite(qty) || qty <= 0) return;
    lines[k] = Math.min(Math.floor(qty), 999);
  });
  const res = await springAuth.springRequest({ url: '/api/supplies/cart', method: 'PUT', data: { lines } });
  return parseResponse(res).ok;
}

function cartTotalQty(cart) {
  return Object.keys(cart || {}).reduce((s, k) => s + (Number(cart[k]) || 0), 0);
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

/**
 * Decorate items with spec-derived fields used by the SKU panel WXML.
 * Must be called after setData whenever items or specSelections change.
 */
function decorateSpecFields(items, specSelections) {
  if (!items || !items.length) return items;
  var sel = specSelections || {};
  return items.map(function (it) {
    var schema = parseSpecSchema(it);
    if (!schema) {
      it._specDims = null;
      it._specAllSelected = false;
      it._specCartKey = null;
      return it;
    }
    var dims = Object.keys(schema).map(function (k) {
      return { dimKey: k, options: schema[k] };
    });
    it._specDims = dims;
    var itemSel = sel[it.id] || {};
    var allSelected = dims.length > 0 && dims.every(function (d) {
      return itemSel[d.dimKey] != null && itemSel[d.dimKey] !== '';
    });
    it._specAllSelected = allSelected;
    it._specCartKey = allSelected ? specCartKey(it.id, itemSel) : null;
    return it;
  });
}

function decorateItems(list) {
  const arr = list || [];
  return arr.map((it) => {
    const name = it.name != null ? String(it.name) : '';
    const ch = name.trim().charAt(0) || '?';
    const noveltyTag = String(it.noveltyTag || it.novelty_tag || '').trim();
    const isNewItem =
      normalizeBool(it.isNewItem, noveltyTag === '新品!') ||
      normalizeBool(it.newItem, noveltyTag === '新品!');
    const isNewInbound =
      normalizeBool(it.isNewInbound, noveltyTag === '进货!') ||
      normalizeBool(it.newInbound, noveltyTag === '进货!');
    return {
      ...it,
      coverAbsUrl: springAuth.toAbsoluteMediaUrl(it.coverUrl),
      nameInitial: ch,
      isNewItem,
      isNewInbound,
      noveltyTag: noveltyTag || (isNewItem && isNewInbound ? '新品!/进货!' : isNewInbound ? '进货!' : isNewItem ? '新品!' : ''),
    };
  });
}

async function resolveItemsCloudUrls(items) {
  if (!items || items.length === 0) return;
  const httpUrls = items
    .map((it) => it.coverAbsUrl)
    .filter((u) => u && !u.startsWith('cloud://'));
  if (httpUrls.length === 0) return;
  try {
    const { mappings } = await springAuth.resolveCloudUrls(httpUrls);
    let hit = 0;
    items.forEach((it) => {
      const cloud = mappings[it.coverAbsUrl];
      if (cloud) { it.coverAbsUrl = cloud; hit++; }
    });
    if (hit < httpUrls.length) springAuth.triggerCloudSync();
  } catch (_) {
    springAuth.triggerCloudSync();
  }
}

function normalizeBool(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no' || v === '') return false;
  }
  return !!fallback;
}

/**
 * Build cart display lines from cart object + item list.
 * Shows spec labels for spec-variant entries.
 */
function buildCartLines(cart, items) {
  const out = [];
  Object.keys(cart || {}).forEach((k) => {
    const qty = cart[k] || 0;
    if (qty <= 0) return;
    const parsed = parseCartKey(k);
    const it = (items || []).find((x) => x.id === parsed.itemId);
    const specLabel = parsed.specSnapshot ? formatSpecLabel(parsed.specSnapshot) : '';
    out.push({
      id: k,
      itemId: parsed.itemId,
      name: it ? it.name : '物资',
      coverAbsUrl: it ? it.coverAbsUrl : '',
      nameInitial: it ? it.nameInitial : '?',
      qty,
      specLabel: specLabel,
      specSnapshot: parsed.specSnapshot,
    });
  });
  return out;
}

/* ── Merge dialog helpers ─────────────────────────────────────── */

/**
 * 待处理订单物资摘要：snapshotName×qty 用「、」连接，超 3 项截断为「等N项」。
 */
function summarizePendingLines(lines) {
  var arr = Array.isArray(lines) ? lines : [];
  if (!arr.length) return '';
  var parts = arr.slice(0, 3).map(function (l) {
    var name = String((l && l.snapshotName) || '物资');
    return name + '×' + (Number(l && l.qty) || 0);
  });
  var txt = parts.join('、');
  if (arr.length > 3) txt += ' 等' + arr.length + '项';
  return txt;
}

/**
 * 待处理订单分类（合并目标匹配规则）：
 * - regular：所有行均非独立下单（independentOrder !== 1）
 * - independent：所有行同一 itemId 且该物资独立下单
 * - mixed：其余（含无行数据的旧单）→ 不进入任何目标列表
 */
function classifyPendingOrder(order) {
  var lines = order && order.lines;
  if (!Array.isArray(lines) || lines.length === 0) return { kind: 'mixed' };
  // 行的 independentOrder 为 null/undefined = 物资已被删除，该单不可作为合并目标（后端必然拒绝）
  var hasUnknown = lines.some(function (l) { return l == null || l.independentOrder == null; });
  if (hasUnknown) return { kind: 'mixed' };
  var hasIndep = lines.some(function (l) { return Number(l && l.independentOrder) === 1; });
  if (!hasIndep) return { kind: 'regular' };
  var firstId = Number(lines[0].itemId);
  var allSame =
    Number.isFinite(firstId) &&
    lines.every(function (l) {
      return Number(l && l.itemId) === firstId && Number(l && l.independentOrder) === 1;
    });
  if (allSame) return { kind: 'independent', itemId: firstId };
  return { kind: 'mixed' };
}

Page({
  data: {
    categories: [],
    activeCat: 'all',
    items: [],
    filteredItems: [],
    searchKeyword: '',
    cart: {},
    cartCount: 0,
    cartLines: [],
    cartSheetShow: false,
    loading: false,
    submitting: false,
    showAdminEntry: false,
    noveltyNewItemCount: 0,
    noveltyInboundCount: 0,
    noveltyHintVisible: false,
    showProcessEntry: false,
    pageGateOk: false,
    processBadgeText: '',
    mineRecordBadgeText: '',
    claimReviseOrderId: '',
    remarkByLine: {},
    remarkExpandedByLine: {},
    confirmOpen: false,
    confirmLines: [],
    /** 独立下单拆单提示：购物车含独立下单物资时提交将拆分为多张工单 */
    willSplit: false,
    multiIndependent: false,
    independentItemNames: [],
    /** 合并到待处理订单弹窗（规则匹配方案）
     *  mergeRegular: null | { orders:[...], selectedId } — selectedId 为 '' 表示新建订单
     *  mergeIndependents: [{ itemId, name, orders:[...], selectedId, hasTargets }] */
    mergeDialogShow: false,
    mergeRegular: null,
    mergeIndependents: [],
    showStudentSwitch: false,
    navBarHeight: 64,
    pageHeight: 667,
    /** 搜索栏+提示条占位（fixed 下方文档流垫片） */
    headerBodyH: 46,
    /** 列表区 scroll-view 显式高度（px） */
    mainScrollH: 400,
    listRefreshing: false,
    /** Spec: current dimension selections per item, keyed by numeric itemId */
    specSelections: {},
  },

  _itemsCache: {},
  _previewActive: false,
  _navOutToSubPage: false,
  _lastReloadAt: 0,
  _bootstrapReviseClaimId: '',
  _cartSaveTimer: null,

  /** fixed 顶栏 + 列表区 px 高度（禁用 100vh / height:100%） */
  applyMallLayout() {
    const layout = calcMaterialMallLayout({
      noveltyVisible: !!this.data.noveltyHintVisible,
    });
    const patch = {};
    if (layout.pageHeight !== this.data.pageHeight) patch.pageHeight = layout.pageHeight;
    if (layout.navBarHeight !== this.data.navBarHeight) patch.navBarHeight = layout.navBarHeight;
    if (layout.headerBodyH !== this.data.headerBodyH) patch.headerBodyH = layout.headerBodyH;
    if (layout.mainScrollH !== this.data.mainScrollH) patch.mainScrollH = layout.mainScrollH;
    if (Object.keys(patch).length) this.setData(patch);
  },

  onLoad(options) {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    const rid = options && options.reviseClaimId ? String(options.reviseClaimId).trim() : '';
    const mallPath = '/package-feature/pages/supplies/index';
    const adminMallOk =
      pagePermission.canAccessMiniPage(mallPath, role, 'ADMIN') ||
      pagePermission.canShowMiniEntry('home', mallPath, role, 'ADMIN');
    const reviseDeepLinkOk =
      !!rid &&
      hasMinRole(role, 'STAFF') &&
      pagePermission.canAccessMiniPage('/package-feature/pages/suppliesMine/index', role, 'STAFF');
    const ok = adminMallOk || reviseDeepLinkOk;
    if (!ok) {
      wx.showToast({ title: '无权限', icon: 'none' });
      this._suppliesAccessDenied = true;
      wx.navigateBack({ delta: 1 });
      return;
    }
    if (rid) {
      this._bootstrapReviseClaimId = rid;
    }
    const cart = loadPersistedSuppliesCart();
    this.setData({ pageGateOk: true, cart, cartCount: cartTotalQty(cart) }, () => {
      this.applyMallLayout();
    });
  },

  applyTopBadges(c) {
    if (!c) {
      this.setData({ processBadgeText: '', mineRecordBadgeText: '' });
      return;
    }
    let processBadgeText = '';
    if (this.data.showProcessEntry) {
      const pn = Number(c.processSupplies || 0);
      processBadgeText = pn > 0 ? c.processSuppliesText || formatBadgeText(pn) : '';
    }
    const mn = Number(c.supplies || 0);
    const mineRecordBadgeText = mn > 0 ? c.suppliesText || formatBadgeText(mn) : '';
    this.setData({ processBadgeText, mineRecordBadgeText });
  },

  onSwitchStudent() {
    const proceed = () => {
      this.setData({ cartSheetShow: false, confirmOpen: false });
      goStudentMaterial();
    };
    if (String(this.data.claimReviseOrderId || '').trim()) {
      // redirectTo 会卸载本页：先做与 goStudentMaterial 相同的权限检查，
      // 无权限时保持原有直达 toast 行为，不弹离开确认
      const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
      if (!canShowStudentMaterialSwitch(role)) {
        wx.showToast({ title: '无权限', icon: 'none' });
        return;
      }
      this._confirmExitRevise(proceed);
      return;
    }
    proceed();
  },

  async onShow() {
    if (this._suppliesAccessDenied || !this.data.pageGateOk) return;
    this.applyMallLayout();
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    const cap = await fetchCapabilitySummaryMap({});
    const claim = cap.SUPPLIES_CLAIM || {};
    const admin = cap.SUPPLIES_ADMIN || {};
    const superOk = hasMinRole(role, 'SUPER_ADMIN');
    this.setData({
      showProcessEntry: superOk && !!claim.canProcess,
      showAdminEntry:
        superOk &&
        !!admin.canProcess &&
        pagePermission.canShowMiniEntry('mine', '/package-feature/pages/suppliesAdmin/index', role, 'SUPER_ADMIN'),
      showStudentSwitch: canShowStudentMaterialSwitch(role),
    });
    this.applyTopBadges(peekPendingBadges());
    void refreshPendingBadges().then((c) => this.applyTopBadges(c));

    if (this._previewActive) {
      this._previewActive = false;
      return;
    }

    if (this._navOutToSubPage) {
      this._navOutToSubPage = false;
      // FALLBACK: sub-page navigation now prompts before leaving (goMine /
      // goProcess / goAdmin call _confirmExitRevise), so revise mode should
      // already be exited here. If it is somehow still active on return,
      // abandon it: restore the user's own persisted cart (durable stores
      // were never touched by the revise flow) and drop the exit guard.
      if (String(this.data.claimReviseOrderId || '').trim()) {
        this._exitReviseMode();
      }
      const key = this.cacheKeyForCat(this.data.activeCat);
      const cached = this._itemsCache[key];
      if (cached && Array.isArray(cached.items)) {
        this.loadItems({ useCache: true, silent: true }).catch(() => {});
        this.loadItems({ useCache: true, silent: true, forceRefresh: true }).catch(() => {});
        this.pullCartFromServer().catch(() => {});
        return;
      }
    }

    if (Date.now() - this._lastReloadAt < 2000) return;
    this.reload();
  },

  onUnload() {
    // Durable stores need no cleanup (revise flow never writes to them);
    // just cancel any pending debounced remote save. Also drop the revise
    // exit guard for hygiene (user may have confirmed the native alert).
    if (this._cartSaveTimer) { clearTimeout(this._cartSaveTimer); this._cartSaveTimer = null; }
    try { wx.disableAlertBeforeUnload({}); } catch (e) { /* ignore */ }
  },

  onListRefresh() {
    if (this.data.listRefreshing) return;
    this.setData({ listRefreshing: true });
    this.reload().finally(() => this.setData({ listRefreshing: false }));
  },

  async reload() {
    this.setData({ loading: true });
    try {
      await springAuth.refreshPublicRuntimeConfig().catch(() => null);
      const cRes = await springAuth.springRequest({ url: '/api/supplies/categories', method: 'GET', data: {} });
      const cp = parseResponse(cRes);
      if (!cp.ok) throw new Error(cp.message);
      this.setData({ categories: cp.body.data || [] });
      await this.loadItems();
      await this.maybeBootstrapReviseClaim();
      await this.pullCartFromServer();
      this._lastReloadAt = Date.now();
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async maybeBootstrapReviseClaim() {
    const id = this._bootstrapReviseClaimId;
    if (!id) return;
    this._bootstrapReviseClaimId = '';
    wx.showLoading({ title: '载入工单…', mask: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/supplies/claims/${encodeURIComponent(id)}`,
        method: 'GET',
        data: {},
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      const d = p.body.data || {};
      if (String(d.status || '').toUpperCase() !== 'PENDING') {
        wx.showToast({ title: '仅待处理工单可修订', icon: 'none' });
        return;
      }
      const cart = {};
      (d.lines || []).forEach((l) => {
        const iid = l.itemId != null ? Number(l.itemId) : NaN;
        const q = l.qty != null ? Number(l.qty) : 0;
        if (Number.isFinite(iid) && iid > 0 && Number.isFinite(q) && q > 0) {
          // Build cart key: include specSnapshot if present.
          // 后端返回的 specSnapshot 是 JSON 字符串（如 "{\"尺寸\":\"M\"}"），先解析成对象。
          var spec = l.specSnapshot;
          if (typeof spec === 'string' && spec.trim()) {
            try { spec = JSON.parse(spec); } catch (e) { spec = null; }
          }
          if (spec && typeof spec === 'object' && Object.keys(spec).length > 0) {
            var k = specCartKey(iid, spec);
            cart[k] = Math.min((cart[k] || 0) + Math.floor(q), 999);
          } else {
            cart[String(iid)] = Math.min((cart[String(iid)] || 0) + Math.floor(q), 999);
          }
        }
      });
      // Revise cart is PAGE-LOCAL only: never touch local storage or the
      // remote cart here — the user's own durable cart stays untouched
      // throughout the revise flow.
      const cartCount = cartTotalQty(cart);
      const cartLines = buildCartLines(cart, this.data.items || []);
      this.setData({
        cart,
        cartCount,
        claimReviseOrderId: id,
        cartSheetShow: true,
        cartLines,
      });
      // 修订态激活：开启返回拦截（返回/退出页面前弹原生确认）
      this._enableReviseExitGuard();
      wx.showToast({ title: '已从工单载入购物车', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '载入失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /* ── Revise exit guard ─────────────────────────────────────── */

  /** 修订态返回拦截：开启原生返回确认弹窗（基础库 ≥2.12.0） */
  _enableReviseExitGuard() {
    try {
      wx.enableAlertBeforeUnload({
        message: '当前正在修改领用单，返回将取消本次修改',
      });
    } catch (e) { /* 基础库 <2.12.0 降级：无拦截 */ }
  },

  _disableReviseExitGuard() {
    try { wx.disableAlertBeforeUnload({}); } catch (e) { /* ignore */ }
  },

  /**
   * 退出修订态：清除修订单号、恢复用户自己的持久购物车、关闭返回拦截。
   * （修订购物车是页面本地的，持久存储从未被触碰。）
   */
  _exitReviseMode() {
    this._disableReviseExitGuard();
    const ownCart = loadPersistedSuppliesCart();
    this.setData({
      claimReviseOrderId: '',
      cart: ownCart,
      cartCount: cartTotalQty(ownCart),
      cartLines: [],
      cartSheetShow: false,
      remarkByLine: {},
      remarkExpandedByLine: {},
    });
  },

  /**
   * 修订提交核心（confirmSubmit 修订分支与离开守卫共用，防止逻辑漂移）：
   * 构建行（含 specSnapshot JSON 化）→ specRequired 校验 → PUT lines →
   * 成功后拆单提示、退出修订态（恢复自己的购物车 + 关闭返回拦截）、刷新列表。
   * 成功 resolve(true)；校验失败 / 请求失败 toast 后 resolve(false)，页面停留、修订态保持。
   */
  async _submitReviseLines() {
    if (this.data.submitting) return false;
    const reviseId = String(this.data.claimReviseOrderId || '').trim();
    if (!reviseId) return false;
    const lines = this._buildClaimLines();
    if (!lines.length) {
      wx.showToast({ title: '请选择物资', icon: 'none' });
      return false;
    }
    // Enforce specRequired on submit
    var failed = false;
    var _this = this;
    lines.forEach(function (l) {
      if (!l.specSnapshot) {
        var it = (_this.data.items || []).find(function (x) { return x.id === l.itemId; });
        if (it && itemHasSpec(it) && Number(it.specRequired) === 1) {
          wx.showToast({ title: '「' + it.name + '」必须选择规格', icon: 'none' });
          failed = true;
        }
      }
    });
    if (failed) return false;
    this.setData({ submitting: true, confirmOpen: false });
    try {
      const res = await springAuth.springRequest({
        url: `/api/supplies/claims/${encodeURIComponent(reviseId)}/lines`,
        method: 'PUT',
        data: { lines },
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      // 修订也可能触发独立下单拆分：展示拆分张数（与 onMergeConfirm 一致）
      const rd = p.body.data || {};
      const reviseSplitCount = Number(rd.splitCount || 0);
      if (reviseSplitCount > 1) {
        wx.showToast({ title: `已更新工单，并拆分出 ${reviseSplitCount - 1} 张新工单`, icon: 'none' });
      } else {
        wx.showToast({ title: '已更新工单', icon: 'success' });
      }
      // Do NOT clear durable stores: the revise flow never touched them.
      // _exitReviseMode restores the user's own persisted cart into page state
      // and disables the back-navigation guard.
      if (this._cartSaveTimer) { clearTimeout(this._cartSaveTimer); this._cartSaveTimer = null; }
      this._exitReviseMode();
      await this.loadItems({ forceRefresh: true });
      return true;
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '失败', icon: 'none' });
      return false;
    } finally {
      this.setData({ submitting: false });
    }
  },

  /**
   * 修订态离开确认（三选一）：
   * 保存修改并离开（提交修订，成功后退出修订态再导航；失败停留）/
   * 取消修改并离开（退出修订态后导航）/ 点遮罩取消（停留，修订态保持）。
   */
  _confirmExitRevise(onProceed) {
    wx.showActionSheet({
      alertText: '正在修改领用单', // 基础库支持时显示标题文本；不支持则忽略
      itemList: ['保存修改并离开', '取消修改并离开'],
      itemColor: '#323233',
      success: (r) => {
        if (r.tapIndex === 0) {
          // 保存修改：走与 confirmSubmit 修订分支相同的提交核心
          void this._submitReviseLines().then((ok) => {
            if (ok && typeof onProceed === 'function') onProceed();
          });
        } else if (r.tapIndex === 1) {
          // 取消修改：退出修订态并恢复自己的购物车，然后继续导航
          this._exitReviseMode();
          if (typeof onProceed === 'function') onProceed();
        }
      },
      fail: () => { /* 取消/点击遮罩 = 留在本页，修订态保持 */ },
    });
  },

  cacheKeyForCat(cat) {
    return cat === 'all' ? 'all' : `cat:${Number(cat)}`;
  },

  async loadItems(options) {
    const opts = options || {};
    const useCache = opts.useCache !== false;
    const silent = !!opts.silent;
    const forceRefresh = !!opts.forceRefresh;
    const { activeCat } = this.data;
    const cacheKey = this.cacheKeyForCat(activeCat);
    if (useCache) {
      const cached = this._itemsCache[cacheKey];
      if (cached && Array.isArray(cached.items)) {
        // Re-decorate cached items with current spec selections
        decorateSpecFields(cached.items, this.data.specSelections);
        const patchCached = {
          items: cached.items,
          noveltyInboundCount: cached.noveltyInboundCount || 0,
          noveltyNewItemCount: cached.noveltyNewItemCount || 0,
          noveltyHintVisible: (cached.noveltyInboundCount || 0) + (cached.noveltyNewItemCount || 0) > 0,
        };
        if (this.data.cartSheetShow) {
          patchCached.cartLines = buildCartLines(this.data.cart, cached.items);
        }
        this.setData(patchCached, () => {
          this.applyMallLayout();
          this.applyItemFilter();
          this.reconcileCartWithStock(this.data.items);
        });
        if (!silent && !forceRefresh) return;
      }
    }
    const params = activeCat === 'all' ? {} : { categoryId: activeCat };
    const res = await springAuth.springRequest({ url: '/api/supplies/items', method: 'GET', data: params });
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    const items = decorateItems(p.body.data || []);
    await resolveItemsCloudUrls(items);
    // Decorate with spec panel computed fields
    decorateSpecFields(items, this.data.specSelections);
    const noveltyInboundCount = items.filter((it) => !!it.isNewInbound).length;
    const noveltyNewItemCount = items.filter((it) => !!it.isNewItem).length;
    const patch = {
      items,
      noveltyInboundCount,
      noveltyNewItemCount,
      noveltyHintVisible: noveltyInboundCount + noveltyNewItemCount > 0,
    };
    if (this.data.cartSheetShow) {
      patch.cartLines = buildCartLines(this.data.cart, items);
    }
    this._itemsCache[cacheKey] = {
      items,
      noveltyInboundCount,
      noveltyNewItemCount,
      fetchedAt: Date.now(),
    };
    this.setData(patch, () => {
      this.applyMallLayout();
      this.applyItemFilter();
      this.reconcileCartWithStock(this.data.items);
    });
  },

  reconcileCartWithStock(items) {
    const cart = { ...(this.data.cart || {}) };
    let changed = false;
    Object.keys(cart).forEach((k) => {
      const parsed = parseCartKey(k);
      const it = (items || []).find((x) => x.id === parsed.itemId);
      if (!it) return;
      const max = this.maxForItem(it);
      if (max <= 0) {
        delete cart[k];
        changed = true;
      } else if (cart[k] > max) {
        cart[k] = max;
        changed = true;
      }
    });
    if (!changed) return;
    this.syncCart(cart);
  },

  applyItemFilter() {
    const keyword = (this.data.searchKeyword || '').trim().toLowerCase();
    const items = this.data.items || [];
    if (!keyword) {
      this.setData({ filteredItems: items });
      return;
    }
    const filteredItems = items.filter((it) => {
      const name = String(it.name || '').toLowerCase();
      const subtitle = String(it.subtitle || '').toLowerCase();
      const idText = String(it.id || '').toLowerCase();
      return name.includes(keyword) || subtitle.includes(keyword) || idText.includes(keyword);
    });
    this.setData({ filteredItems });
  },

  onTopBarSearch(e) {
    const value = (e.detail && e.detail.value) || '';
    this.setData({ searchKeyword: value }, () => this.applyItemFilter());
  },

  onSearchInput(e) {
    this.onTopBarSearch({ detail: { value: (e.detail && e.detail.value) || '' } });
  },

  onSelectCat(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ activeCat: id === 'all' ? 'all' : Number(id) }, () => {
      const key = this.cacheKeyForCat(this.data.activeCat);
      const hasCache = !!(this._itemsCache[key] && Array.isArray(this._itemsCache[key].items));
      this.loadItems({ useCache: true }).catch(() => {});
      if (hasCache) {
        this.loadItems({ useCache: true, silent: true, forceRefresh: true }).catch(() => {});
      }
    });
  },

  maxForItem(item) {
    if (!item) return 0;
    if (item.stockMode === 'QUANTIFIED') {
      // 可用库存 = 总库存 − 待处理单锁定量；availableQty 缺失时回落 stockQty
      var avail = Number(item.availableQty);
      if (Number.isFinite(avail)) return Math.max(0, avail);
      return Math.max(0, Number(item.stockQty) || 0);
    }
    var flagQty = item.availableQty != null ? Number(item.availableQty) : Number(item.stockQty);
    return flagQty >= 1 ? 9999 : 0;
  },

  /**
   * 提交行构建（confirmSubmit / 修订提交 / 合并提交共用，防止逻辑漂移）：
   * 购物车 key 解析 itemId + specSnapshot（键排序 JSON 化），附加行备注。
   */
  _buildClaimLines() {
    const _this = this;
    return Object.keys(this.data.cart)
      .map(function (k) {
        var parsed = parseCartKey(k);
        var qty = _this.data.cart[k];
        var remark = (_this.data.remarkByLine[k] || '').trim();
        var entry = { itemId: parsed.itemId, qty: qty, remark: remark || undefined };
        // 请求体形态：specSnapshot 统一为键排序 JSON 字符串（后端字段为 String）
        if (parsed.specSnapshot) entry.specSnapshot = specSnapshotToJson(parsed.specSnapshot);
        return entry;
      })
      .filter(function (l) { return l.qty > 0; });
  },

  /**
   * 跨分类物品查找表：购物车可能含非当前分类的物资，
   * 合并所有分类缓存 + 当前列表，按 itemId 建索引。
   */
  _buildItemLookup() {
    var itemById = {};
    var self = this;
    Object.keys(this._itemsCache || {}).forEach(function (ck) {
      var arr = (self._itemsCache[ck] && self._itemsCache[ck].items) || [];
      arr.forEach(function (x) { itemById[x.id] = x; });
    });
    (this.data.items || []).forEach(function (x) { itemById[x.id] = x; });
    return itemById;
  },

  /* ── Spec selection ─────────────────────────────────── */

  /** Tap a dimension option chip in the SKU panel. */
  onSpecDimTap(e) {
    const itemId = Number(e.currentTarget.dataset.itemId);
    const dimKey = String(e.currentTarget.dataset.dimKey || '');
    const optVal = String(e.currentTarget.dataset.optVal || '');
    if (!itemId || !dimKey) return;
    const sel = { ...(this.data.specSelections[itemId] || {}) };
    if (sel[dimKey] === optVal) {
      delete sel[dimKey];
    } else {
      sel[dimKey] = optVal;
    }
    // Re-decorate items + filteredItems to reflect new spec selections
    var newSpecSelections = { ...this.data.specSelections, [itemId]: sel };
    var items = decorateSpecFields(this.data.items.slice(), newSpecSelections);
    var filteredItems = decorateSpecFields(this.data.filteredItems.slice(), newSpecSelections);
    this.setData({
      [`specSelections.${itemId}`]: sel,
      items: items,
      filteredItems: filteredItems,
    });
  },

  /** Determine if all spec dimensions for an item are selected. */
  _specAllSelected(item) {
    var schema = parseSpecSchema(item);
    if (!schema) return false;
    var sel = this.data.specSelections[item.id] || {};
    var dimKeys = Object.keys(schema);
    return dimKeys.length > 0 && dimKeys.every(function (k) { return sel[k] != null && sel[k] !== ''; });
  },

  /** Get the current spec cart key for an item (null if not all selected). */
  _specKeyForItem(item) {
    if (!itemHasSpec(item)) return null;
    var sel = this.data.specSelections[item.id] || {};
    if (!this._specAllSelected(item)) return null;
    return specCartKey(item.id, sel);
  },

  /** Tap a spec combo in the grid to quick-add. */
  onSpecComboTap(e) {
    var itemId = Number(e.currentTarget.dataset.itemId);
    var comboJson = String(e.currentTarget.dataset.combo || '');
    if (!itemId || !comboJson) return;
    var combo;
    try { combo = JSON.parse(comboJson); } catch (err) { return; }
    // Set selections to this combo
    this.setData({ [`specSelections.${itemId}`]: combo });
    // Then add to cart
    this._addSpecCart(itemId, combo);
  },

  _addSpecCart(itemId, selections) {
    var key = specCartKey(itemId, selections);
    // 跨分类查找：购物车可能含非当前分类的物资
    var item = this._buildItemLookup()[itemId];
    var max = this.maxForItem(item);
    if (max <= 0) {
      wx.showToast({ title: '暂无库存', icon: 'none' });
      return;
    }
    try { wx.vibrateShort({ type: 'light' }); } catch (err) { /* ignore */ }
    var cart = { ...this.data.cart };
    var cur = cart[key] || 0;
    cart[key] = Math.min(cur + 1, max);
    this.syncCart(cart);
  },

  addCart(e) {
    const idRaw = String(e.currentTarget.dataset.id);
    // 购物车弹窗的规格行传入完整 cart key（含 "::"）：解析后走规格加购
    if (idRaw.indexOf('::') !== -1) {
      const parsedKey = parseCartKey(idRaw);
      if (parsedKey.specSnapshot) {
        this._addSpecCart(parsedKey.itemId, parsedKey.specSnapshot);
        return;
      }
    }
    const id = Number(idRaw);
    const item = this.data.items.find((x) => x.id === id);
    // If item has spec, ignore simple +/- (must use SKU panel)
    if (itemHasSpec(item)) {
      // Default: if all dims selected, add using spec key
      var sel = this.data.specSelections[id] || {};
      if (this._specAllSelected(item)) {
        this._addSpecCart(id, sel);
      } else {
        wx.showToast({ title: '请先选择规格', icon: 'none' });
      }
      return;
    }
    const max = this.maxForItem(item);
    if (max <= 0) {
      wx.showToast({ title: '暂无库存', icon: 'none' });
      return;
    }
    try {
      wx.vibrateShort({ type: 'light' });
    } catch (err) {
      /* ignore */
    }
    const cart = { ...this.data.cart };
    const cur = cart[id] || 0;
    cart[id] = Math.min(cur + 1, max);
    this.syncCart(cart);
  },

  decCart(e) {
    const idRaw = e.currentTarget.dataset.id;
    // For spec items, the dataset id is the full cart key string
    const key = String(idRaw);
    const cur = this.data.cart[key] || 0;
    if (cur <= 0) return;
    try {
      wx.vibrateShort({ type: 'light' });
    } catch (err) {
      /* ignore */
    }
    const cart = { ...this.data.cart };
    const next = cur - 1;
    if (next <= 0) delete cart[key];
    else cart[key] = next;
    this.syncCart(cart);
  },

  onQtyInputBlur(e) {
    const idRaw = e.currentTarget.dataset.id;
    const key = String(idRaw);
    const parsed = parseCartKey(key);
    // 跨分类解析：购物车行可能来自非当前分类，先查全部分类缓存
    let item = this.data.items.find((x) => x.id === parsed.itemId);
    if (!item) item = this._buildItemLookup()[parsed.itemId];
    // 仍无法解析时不拒绝编辑：回落 999 上限，最终由后端校验库存
    const max = item ? this.maxForItem(item) : 999;
    if (max <= 0) {
      wx.showToast({ title: '暂无库存', icon: 'none' });
      return;
    }
    const raw = String((e.detail && e.detail.value) || '').trim();
    const num = Number(raw);
    const cart = { ...this.data.cart };
    if (!raw || Number.isNaN(num) || num <= 0) {
      delete cart[key];
      this.syncCart(cart);
      return;
    }
    const next = Math.min(Math.floor(num), max);
    cart[key] = next;
    if (num > max) {
      wx.showToast({ title: `最多可下单 ${max}`, icon: 'none' });
    }
    this.syncCart(cart);
  },

  pullCartFromServer() {
    return (async () => {
      if (String(this.data.claimReviseOrderId || '').trim()) return;
      const remote = await fetchRemoteSuppliesCart();
      if (remote == null) return;
      const local = loadPersistedSuppliesCart();
      let cart = remote;
      if (cartTotalQty(remote) === 0 && cartTotalQty(local) > 0) {
        cart = local;
        if (this._cartSaveTimer) { clearTimeout(this._cartSaveTimer); this._cartSaveTimer = null; }
        await saveRemoteSuppliesCart(cart).catch(() => null);
      }
      persistSuppliesCart(cart);
      const cartCount = cartTotalQty(cart);
      const patch = { cart, cartCount };
      if (this.data.cartSheetShow) {
        patch.cartLines = buildCartLines(cart, this.data.items || []);
        if (cartCount === 0) patch.cartSheetShow = false;
      }
      this.setData(patch);
    })();
  },

  _scheduleRemoteCartSave(cart) {
    if (this._cartSaveTimer) clearTimeout(this._cartSaveTimer);
    this._cartSaveTimer = setTimeout(() => {
      this._cartSaveTimer = null;
      void saveRemoteSuppliesCart(cart).catch(() => null);
    }, 450);
  },

  syncCart(cart) {
    // While revising a claim, the cart is page-local only: never persist to
    // local storage or the remote cart, so the user's own cart survives.
    const revising = !!String(this.data.claimReviseOrderId || '').trim();
    if (!revising) {
      persistSuppliesCart(cart);
      this._scheduleRemoteCartSave(cart);
    }
    const cartCount = cartTotalQty(cart);
    const patch = { cart, cartCount };
    if (this.data.cartSheetShow) {
      patch.cartLines = buildCartLines(cart, this.data.items);
      if (cartCount === 0) {
        patch.cartSheetShow = false;
      }
    }
    this.setData(patch);
  },

  openCartSheet() {
    const cartLines = buildCartLines(this.data.cart, this.data.items);
    if (!cartLines.length) {
      wx.showToast({ title: '购物车是空的', icon: 'none' });
      return;
    }
    this.setData({ cartSheetShow: true, cartLines });
  },

  closeCartSheet() {
    this.setData({ cartSheetShow: false });
  },

  clearCart() {
    if (this.data.cartCount === 0) {
      wx.showToast({ title: '购物车已是空的', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '清空购物车',
      content: '确认清空全部物资？',
      confirmColor: '#ee0a24',
      success: (res) => {
        if (!res.confirm) return;
        if (this._cartSaveTimer) { clearTimeout(this._cartSaveTimer); this._cartSaveTimer = null; }
        // 清空 always empties everything visible. In revise mode this also
        // exits the revise flow; user explicitly asked for an empty cart,
        // so clear the durable stores too — predictable result.
        persistSuppliesCart({});
        void saveRemoteSuppliesCart({}).catch(() => null);
        const wasRevising = !!String(this.data.claimReviseOrderId || '').trim();
        // 清空即退出修订态：关闭返回拦截（clearCart 已自行清空全部状态，
        // 不走 _exitReviseMode 以免恢复持久购物车与清空语义冲突）
        if (wasRevising) this._disableReviseExitGuard();
        this.setData({
          cart: {},
          cartCount: 0,
          cartLines: [],
          cartSheetShow: false,
          remarkByLine: {},
          claimReviseOrderId: '',
        });
        wx.showToast({ title: wasRevising ? '已清空并退出修改' : '已清空', icon: wasRevising ? 'none' : 'success' });
      },
    });
  },

  previewItemImage(e) {
    const current = String((e.currentTarget.dataset && e.currentTarget.dataset.url) || '').trim();
    if (!current) return;
    this._previewActive = true;
    const urls = (this.data.filteredItems || [])
      .map((it) => String(it.coverAbsUrl || '').trim())
      .filter((u) => !!u);
    const list = urls.length ? Array.from(new Set(urls)) : [current];
    wx.previewImage({
      current,
      urls: list,
    });
  },

  sheetAdd(e) {
    this.addCart(e);
  },

  sheetDec(e) {
    this.decCart(e);
  },

  async submitOrder() {
    if (this.data.submitting || this.data.cartCount === 0) return;
    const lines = Object.keys(this.data.cart)
      .map((k) => {
        var parsed = parseCartKey(k);
        return {
          itemId: parsed.itemId,
          qty: this.data.cart[k],
          // 请求体形态：specSnapshot 统一为键排序 JSON 字符串（后端字段为 String）
          specSnapshot: parsed.specSnapshot ? specSnapshotToJson(parsed.specSnapshot) : undefined,
        };
      })
      .filter((l) => l.qty > 0);
    if (!lines.length) {
      wx.showToast({ title: '请选择物资', icon: 'none' });
      return;
    }
    // Check specRequired enforcement
    var failed = false;
    var _this = this;
    lines.forEach(function (l) {
      if (!l.specSnapshot) {
        var it = (_this.data.items || []).find(function (x) { return x.id === l.itemId; });
        if (it && itemHasSpec(it) && Number(it.specRequired) === 1) {
          wx.showToast({ title: '「' + it.name + '」必须选择规格', icon: 'none' });
          failed = true;
        }
      }
    });
    if (failed) return;

    // Check for independent-order items, warn about split.
    // Build a full item map across ALL category caches (cart may hold items
    // from categories other than the active one), plus current items.
    var itemById = this._buildItemLookup();

    // Dedupe by itemId: spec variants of the same item ("42::尺寸=M" and
    // "42::尺寸=L") must count once.
    var independentIds = {};
    var independentItems = [];
    var independentInfos = [];
    var regularIds = {};
    var regularItems = [];
    Object.keys(this.data.cart).forEach(function (k) {
      var parsed = parseCartKey(k);
      var it = itemById[parsed.itemId];
      if (it && it.independentOrder === 1) {
        if (!independentIds[it.id]) {
          independentIds[it.id] = true;
          independentItems.push(it.name);
          independentInfos.push({ itemId: it.id, name: it.name });
        }
      } else {
        // Regular item, or unresolvable — treat unresolved conservatively
        // as regular rather than dropping it silently.
        if (!regularIds[parsed.itemId]) {
          regularIds[parsed.itemId] = true;
          regularItems.push(it ? it.name : '物资');
        }
      }
    });
    var willSplit = independentItems.length > 0 && regularItems.length > 0;
    var multiIndependent = independentItems.length > 1;

    const cartLines = buildCartLines(this.data.cart, this.data.items);
    const confirmLines = cartLines.map((cl) => ({
      ...cl,
      remark: this.data.remarkByLine[cl.id] || '',
    }));
    const remarkExpandedByLine = { ...(this.data.remarkExpandedByLine || {}) };
    confirmLines.forEach((l) => {
      if (l.remark && !remarkExpandedByLine[l.id]) {
        remarkExpandedByLine[l.id] = true;
      }
    });
    this.setData({
      confirmLines,
      cartLines,
      remarkExpandedByLine,
      willSplit,
      multiIndependent,
      independentItemNames: independentItems,
    });

    // 修订模式跳过合并检查，直接进入原确认弹窗
    const reviseId = String(this.data.claimReviseOrderId || '').trim();
    if (!reviseId) {
      this.setData({ submitting: true });
      const pending = await this._fetchPendingClaims();
      this.setData({ submitting: false });
      if (pending && pending.length) {
        const plan = this._buildMergePlan(pending, {
          hasRegular: regularItems.length > 0,
          regularIdSet: regularIds,
          independents: independentInfos,
        });
        if (plan) {
          this.setData({
            mergeDialogShow: true,
            mergeRegular: plan.regular,
            mergeIndependents: plan.independents,
          });
          return;
        }
      }
      // 拉取失败 / 无待处理订单 / 无任何规则匹配目标：直接走正常提交确认
    }
    this.setData({ confirmOpen: true });
  },

  /**
   * 构建合并方案（规则匹配，禁止随意选择）：
   * - 购物车常规物资 → 仅可并入「常规待处理订单」（不含任何独立下单行），另附「新建订单」选项
   * - 购物车独立下单物资 X → 仅可并入「X 的独立待处理订单」（所有行均为 X 且独立下单）
   * - 旧混合单（既有独立又有常规行 / 无行数据）不进入任何目标列表
   * - 每组自动默认选中最近一张匹配订单；无任何组存在目标时返回 null（跳过弹窗）
   */
  _buildMergePlan(pendingRows, cartInfo) {
    var regularOrders = [];
    var indepByItem = {};
    (pendingRows || []).forEach(function (o) {
      var c = classifyPendingOrder(o);
      if (c.kind === 'regular') {
        regularOrders.push(o);
      } else if (c.kind === 'independent') {
        if (!indepByItem[c.itemId]) indepByItem[c.itemId] = [];
        indepByItem[c.itemId].push(o);
      }
      // mixed/legacy：排除
    });
    var regular = null;
    if (cartInfo.hasRegular && regularOrders.length) {
      var idSet = cartInfo.regularIdSet || {};
      var orders = regularOrders.map(function (o) {
        // 目标单已含购物车同款物资 → 提示追加数量（后端按 (itemId, spec) 归并）
        var hasOverlap = (o.lines || []).some(function (l) { return !!idSet[Number(l && l.itemId)]; });
        return { ...o, hasOverlap: hasOverlap };
      });
      // _fetchPendingClaims 已按 createdAt 降序：默认选中最近一张
      regular = { orders: orders, selectedId: orders[0].id };
    }
    var independents = (cartInfo.independents || []).map(function (x) {
      var matches = indepByItem[x.itemId] || [];
      return {
        itemId: x.itemId,
        name: x.name,
        orders: matches,
        selectedId: matches.length ? matches[0].id : '',
        hasTargets: matches.length > 0,
      };
    });
    var anyTarget = !!regular || independents.some(function (s) { return s.hasTargets; });
    if (!anyTarget) return null;
    return { regular: regular, independents: independents };
  },

  /**
   * 拉取我的待处理领用单（合并弹窗数据源，含行明细）。
   * 失败返回 null（调用方 fail open 走正常提交）。
   */
  async _fetchPendingClaims() {
    try {
      const res = await springAuth.springRequest({
        url: '/api/supplies/claims/mine',
        method: 'GET',
        data: { status: 'PENDING', page: 1, size: 50, withLines: 'true' },
      });
      const p = parseResponse(res);
      if (!p.ok) return null;
      const list = (p.body.data && p.body.data.data) || [];
      return list
        .map(function (o) {
          const id = String(o.id != null ? o.id : '');
          const createdAt = String(o.createdAt || '');
          const lines = Array.isArray(o.lines) ? o.lines : [];
          return {
            id,
            idShort: '…' + id.slice(-8),
            createdAt,
            // "07-17 14:32"：省去年份，弹窗行更紧凑
            createdAtText: createdAt.replace('T', ' ').slice(5, 16),
            applicantName:
              String(o.applicantName || o.applicant || o.createdByName || '').trim() || '我',
            itemSummary: summarizePendingLines(lines),
            lines,
          };
        })
        .filter(function (o) { return !!o.id; })
        .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0; });
    } catch (e) {
      return null;
    }
  },

  /** 常规物资分组选择目标（含 data-id="" 的「新建订单」选项） */
  onMergeRegularSelect(e) {
    if (this.data.submitting) return;
    if (!this.data.mergeRegular) return;
    const id = e.currentTarget.dataset.id;
    if (id == null) return;
    this.setData({ 'mergeRegular.selectedId': String(id) });
  },

  /** 独立下单物资分组选择目标（仅该物资自己的独立订单可选） */
  onMergeIndepSelect(e) {
    if (this.data.submitting) return;
    const idx = Number(e.currentTarget.dataset.index);
    const id = e.currentTarget.dataset.id;
    if (!Number.isFinite(idx) || id == null) return;
    const sec = (this.data.mergeIndependents || [])[idx];
    if (!sec || !sec.hasTargets) return;
    this.setData({ [`mergeIndependents[${idx}].selectedId`]: String(id) });
  },

  closeMergeDialog() {
    // 弹窗关闭 = 取消本次提交（不新建、不合并，购物车保留）
    if (this.data.submitting) return;
    this.setData({ mergeDialogShow: false });
  },

  onMergeCreateNew() {
    // 直接新建：跳过合并，走原确认弹窗 → POST /claims（后端自动拆单）
    if (this.data.submitting) return;
    this.setData({ mergeDialogShow: false, confirmOpen: true });
  },

  async onMergeConfirm() {
    if (this.data.submitting) return;
    // 购物车行：与 confirmSubmit 相同的共享构建器
    const lines = this._buildClaimLines();
    if (!lines.length) {
      wx.showToast({ title: '请选择物资', icon: 'none' });
      return;
    }
    const regular = this.data.mergeRegular;
    // selectedId 为 '' 时表示常规物资选择「新建订单」→ 不传 regularTargetOrderId
    const regularTargetOrderId =
      regular && String(regular.selectedId || '').trim() ? String(regular.selectedId).trim() : undefined;
    const independentTargets = {};
    (this.data.mergeIndependents || []).forEach(function (s) {
      if (s && s.hasTargets && String(s.selectedId || '').trim()) {
        independentTargets[String(s.itemId)] = String(s.selectedId).trim();
      }
    });
    const body = { lines };
    if (regularTargetOrderId) body.regularTargetOrderId = regularTargetOrderId;
    if (Object.keys(independentTargets).length) body.independentTargets = independentTargets;
    this.setData({ submitting: true });
    try {
      const res = await springAuth.springRequest({
        url: '/api/supplies/claims/merge-submit',
        method: 'POST',
        data: body,
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      const d = p.body.data || {};
      const mergedN = Array.isArray(d.mergedOrderIds) ? d.mergedOrderIds.length : 0;
      const createdN = Array.isArray(d.createdOrderIds) ? d.createdOrderIds.length : 0;
      let title = '已提交';
      if (mergedN > 0 && createdN > 0) title = `已并入 ${mergedN} 张、新建 ${createdN} 张订单`;
      else if (mergedN > 0) title = `已并入 ${mergedN} 张订单`;
      else if (createdN > 0) title = `已新建 ${createdN} 张订单`;
      wx.showToast({ title, icon: 'none' });
      // 合并成功：与非修订提交成功路径一致地清空持久购物车
      if (this._cartSaveTimer) { clearTimeout(this._cartSaveTimer); this._cartSaveTimer = null; }
      persistSuppliesCart({});
      void saveRemoteSuppliesCart({}).catch(() => null);
      this.setData({
        cart: {},
        cartCount: 0,
        cartLines: [],
        cartSheetShow: false,
        remarkByLine: {},
        mergeDialogShow: false,
        mergeRegular: null,
        mergeIndependents: [],
      });
      await this.loadItems({ forceRefresh: true });
      void refreshPendingBadges({ force: true }).then((snap) => this.applyTopBadges(snap));
    } catch (e) {
      // 失败：保留弹窗与购物车，允许重试或改选
      wx.showToast({ title: (e && e.message) || '合并失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  closeConfirm() {
    this.setData({ confirmOpen: false });
  },

  onConfirmRemarkBlur(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ [`remarkByLine.${id}`]: e.detail.value || '' });
    const idx = (this.data.confirmLines || []).findIndex((l) => String(l.id) === String(id));
    if (idx >= 0) {
      this.setData({ [`confirmLines[${idx}].remark`]: e.detail.value || '' });
    }
  },

  async confirmSubmit() {
    if (this.data.submitting) return;
    const reviseId = String(this.data.claimReviseOrderId || '').trim();
    if (reviseId) {
      // 修订分支：与离开守卫共用同一提交核心（行构建/校验/PUT/退出修订态）
      const ok = await this._submitReviseLines();
      if (ok) wx.navigateBack({ delta: 1 });
      return;
    }
    const lines = this._buildClaimLines();
    if (!lines.length) {
      wx.showToast({ title: '请选择物资', icon: 'none' });
      return;
    }
    // Enforce specRequired on submit
    var failed = false;
    var _this = this;
    lines.forEach(function (l) {
      if (!l.specSnapshot) {
        var it = (_this.data.items || []).find(function (x) { return x.id === l.itemId; });
        if (it && itemHasSpec(it) && Number(it.specRequired) === 1) {
          wx.showToast({ title: '「' + it.name + '」必须选择规格', icon: 'none' });
          failed = true;
        }
      }
    });
    if (failed) return;

    this.setData({ submitting: true, confirmOpen: false });
    try {
      const res = await springAuth.springRequest({
        url: '/api/supplies/claims',
        method: 'POST',
        data: { lines },
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      wx.showToast({ title: '已提交', icon: 'success' });
      if (this._cartSaveTimer) { clearTimeout(this._cartSaveTimer); this._cartSaveTimer = null; }
      persistSuppliesCart({});
      void saveRemoteSuppliesCart({}).catch(() => null);
      this.setData({ cart: {}, cartCount: 0, cartLines: [], cartSheetShow: false, remarkByLine: {} });
      // 提交后锁定量已变化，强制刷新以展示最新可用库存
      await this.loadItems({ forceRefresh: true });
      void refreshPendingBadges({ force: true }).then((snap) => this.applyTopBadges(snap));
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onRemarkBlur(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ [`remarkByLine.${id}`]: e.detail.value || '' });
  },

  onToggleRemark(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const cur = !!(this.data.remarkExpandedByLine && this.data.remarkExpandedByLine[id]);
    this.setData({ [`remarkExpandedByLine.${id}`]: !cur });
  },

  goMine() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!pagePermission.canAccessMiniPage('/package-feature/pages/suppliesMine/index', role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    const proceed = () => {
      this._navOutToSubPage = true;
      wx.navigateTo({ url: '/package-feature/pages/suppliesMine/index' });
    };
    if (String(this.data.claimReviseOrderId || '').trim()) {
      this._confirmExitRevise(proceed);
      return;
    }
    proceed();
  },

  goProcess() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!hasMinRole(role, 'SUPER_ADMIN') || !this.data.showProcessEntry) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    const proceed = () => {
      this._navOutToSubPage = true;
      wx.navigateTo({ url: '/package-feature/pages/suppliesProcess/index' });
    };
    if (String(this.data.claimReviseOrderId || '').trim()) {
      this._confirmExitRevise(proceed);
      return;
    }
    proceed();
  },

  goAdmin() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!hasMinRole(role, 'SUPER_ADMIN') || !this.data.showAdminEntry) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    const proceed = () => {
      this._navOutToSubPage = true;
      wx.navigateTo({ url: '/package-feature/pages/suppliesAdmin/index' });
    };
    if (String(this.data.claimReviseOrderId || '').trim()) {
      this._confirmExitRevise(proceed);
      return;
    }
    proceed();
  },
});
