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

/** QUANTIFIED：有锁定时「库存 N · 不含锁定 M」(M=锁定量)；无锁定仅「库存 N」。FLAG：有货/缺货。 */
function formatSupplyStockLabel(item) {
  if (!item) return '';
  var mode = String(item.stockMode || '');
  var stock = Number(item.stockQty != null ? item.stockQty : 0);
  var locked = Number(item.lockedQty != null ? item.lockedQty : 0);
  var avail = item.availableQty != null
    ? Number(item.availableQty)
    : Math.max(0, stock - (Number.isFinite(locked) ? locked : 0));
  if (mode === 'FLAG') {
    return avail >= 1 ? '有货' : '缺货';
  }
  if (Number.isFinite(locked) && locked > 0) {
    return '库存 ' + stock + ' · 不含锁定 ' + locked;
  }
  return '库存 ' + stock;
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
      _stockLabel: formatSupplyStockLabel(it),
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
    this.setData({ cartSheetShow: false, confirmOpen: false });
    goStudentMaterial();
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
          // Build cart key: include specSnapshot if present
          if (l.specSnapshot && typeof l.specSnapshot === 'object' && Object.keys(l.specSnapshot).length > 0) {
            var k = specCartKey(iid, l.specSnapshot);
            cart[k] = Math.min(Math.floor(q), 999);
          } else {
            cart[String(iid)] = Math.min(Math.floor(q), 999);
          }
        }
      });
      persistSuppliesCart(cart);
      void saveRemoteSuppliesCart(cart).catch(() => null);
      const cartCount = cartTotalQty(cart);
      const cartLines = buildCartLines(cart, this.data.items || []);
      this.setData({
        cart,
        cartCount,
        claimReviseOrderId: id,
        cartSheetShow: true,
        cartLines,
      });
      wx.showToast({ title: '已从工单载入购物车', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '载入失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
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
    // 可用库存 = 总库存 − 待处理单锁定量；availableQty 缺失时回落 stockQty
    var effectiveQty = Number(item.availableQty != null ? item.availableQty : item.stockQty);
    if (item.stockMode === 'QUANTIFIED') {
      return Math.max(0, Number.isFinite(effectiveQty) ? effectiveQty : 0);
    }
    return effectiveQty >= 1 ? 99 : 0;
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
    var item = this.data.items.find(function (x) { return x.id === itemId; });
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
    const id = Number(e.currentTarget.dataset.id);
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
    const item = this.data.items.find((x) => x.id === parsed.itemId);
    const max = this.maxForItem(item);
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
    persistSuppliesCart(cart);
    this._scheduleRemoteCartSave(cart);
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

  submitOrder() {
    if (this.data.submitting || this.data.cartCount === 0) return;
    const lines = Object.keys(this.data.cart)
      .map((k) => {
        var parsed = parseCartKey(k);
        return {
          itemId: parsed.itemId,
          qty: this.data.cart[k],
          specSnapshot: parsed.specSnapshot || undefined,
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
    this.setData({ confirmOpen: true, confirmLines, cartLines, remarkExpandedByLine });
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
    const lines = Object.keys(this.data.cart)
      .map((k) => {
        var parsed = parseCartKey(k);
        const qty = this.data.cart[k];
        const remark = (this.data.remarkByLine[k] || '').trim();
        var entry = { itemId: parsed.itemId, qty, remark: remark || undefined };
        if (parsed.specSnapshot) entry.specSnapshot = parsed.specSnapshot;
        return entry;
      })
      .filter((l) => l.qty > 0);
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

    const reviseId = String(this.data.claimReviseOrderId || '').trim();
    this.setData({ submitting: true, confirmOpen: false });
    try {
      if (reviseId) {
        const res = await springAuth.springRequest({
          url: `/api/supplies/claims/${encodeURIComponent(reviseId)}/lines`,
          method: 'PUT',
          data: { lines },
        });
        const p = parseResponse(res);
        if (!p.ok) throw new Error(p.message);
        wx.showToast({ title: '已更新工单', icon: 'success' });
        persistSuppliesCart({});
        void saveRemoteSuppliesCart({}).catch(() => null);
        this.setData({
          cart: {},
          cartCount: 0,
          cartLines: [],
          cartSheetShow: false,
          claimReviseOrderId: '',
          remarkByLine: {},
        });
        await this.loadItems({ forceRefresh: true });
        wx.navigateBack({ delta: 1 });
        return;
      }
      const res = await springAuth.springRequest({
        url: '/api/supplies/claims',
        method: 'POST',
        data: { lines },
      });
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      wx.showToast({ title: '已提交', icon: 'success' });
      persistSuppliesCart({});
      void saveRemoteSuppliesCart({}).catch(() => null);
      this.setData({ cart: {}, cartCount: 0, cartLines: [], cartSheetShow: false, remarkByLine: {} });
      await this.loadItems();
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
    this._navOutToSubPage = true;
    wx.navigateTo({ url: '/package-feature/pages/suppliesMine/index' });
  },

  goProcess() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!hasMinRole(role, 'SUPER_ADMIN') || !this.data.showProcessEntry) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    this._navOutToSubPage = true;
    wx.navigateTo({ url: '/package-feature/pages/suppliesProcess/index' });
  },

  goAdmin() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!hasMinRole(role, 'SUPER_ADMIN') || !this.data.showAdminEntry) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    this._navOutToSubPage = true;
    wx.navigateTo({ url: '/package-feature/pages/suppliesAdmin/index' });
  },
});
