const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole, isStudentAccount } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const { peekPendingBadges, refreshPendingBadges } = require('../../../utils/badgeSnapshotStore.js');
const { formatBadgeText } = require('../../../utils/pendingBadgeCounts.js');
const {
  canShowSuppliesSwitch,
  goSupplies,
} = require('../../utils/suppliesStudentSwitch.js');
const { calcMaterialMallLayout } = require('../../utils/materialMallLayout.js');
const mat = require('../../utils/materialStudentApi.js');
const specUtil = require('../../utils/specSchemaUtil.js');

/**
 * Cartesian product of dimension options, returning an array of {key, label, dims} objects.
 */
function generateSpecCombos(dimensions) {
  if (!dimensions || !dimensions.length) return [];
  var combos = [{}];
  dimensions.forEach(function (dim) {
    var opts = dim.options || [];
    var next = [];
    combos.forEach(function (combo) {
      opts.forEach(function (opt) {
        var c = {};
        Object.keys(combo).forEach(function (k) { c[k] = combo[k]; });
        c[dim.name] = opt;
        next.push(c);
      });
    });
    combos = next;
  });
  return combos.map(function (dims) {
    var entries = Object.keys(dims).map(function (k) { return k + '=' + dims[k]; });
    return {
      key: entries.join('|'),
      label: Object.values(dims).join('\xB7'),
      dims: dims,
    };
  });
}

/**
 * Parse specSchema JSON into dimensions array: [{name, options}]
 */
function parseSpecDimensions(specSchema) {
  return specUtil.parseSpecDimensions(specSchema);
}

/**
 * Read itemId from a cart key (numeric for non-spec, composite like "123::颜色=红|尺寸=S")
 */
function readItemIdFromKey(key) {
  return mat.itemIdFromCartKey(key);
}

/**
 * Build composite cart key from itemId + spec combo dims object.
 */
function buildSpecCartKey(itemId, comboDims) {
  var entries = Object.keys(comboDims).map(function (k) { return k + '=' + comboDims[k]; });
  return String(itemId) + '::' + entries.join('|');
}

/**
 * Filter combos by multi-select selections.
 */
function filterCombosByMultiSelections(combos, selections) {
  if (!selections || !Object.keys(selections).length) return [];
  return (combos || []).filter(function (combo) {
    return Object.keys(selections).every(function (dimName) {
      var opts = selections[dimName];
      if (!opts || !opts.length) return true;
      return opts.indexOf(combo.dims[dimName]) >= 0;
    });
  });
}

function hasAnyMultiSpecSelection(selections) {
  if (!selections) return false;
  return Object.keys(selections).some(function (k) {
    return (selections[k] || []).length > 0;
  });
}

function isMultiSpecSelectionReady(dimensions, selections) {
  if (!dimensions || !dimensions.length) return false;
  if (!selections) return false;
  return dimensions.every(function (d) {
    return (selections[d.name] || []).length > 0;
  });
}

function toggleMultiSpecOption(selections, dimName, optValue) {
  var next = Object.assign({}, selections || {});
  var cur = (next[dimName] || []).slice();
  var idx = cur.indexOf(optValue);
  if (idx >= 0) cur.splice(idx, 1);
  else cur.push(optValue);
  if (cur.length) next[dimName] = cur;
  else delete next[dimName];
  return next;
}

function normalizeMultiSelections(raw) {
  if (!raw || typeof raw !== 'object') return {};
  var next = {};
  Object.keys(raw).forEach(function (dim) {
    var v = raw[dim];
    if (Array.isArray(v)) {
      var arr = v.filter(Boolean);
      if (arr.length) next[dim] = arr;
    } else if (v != null && v !== '') {
      next[dim] = [String(v)];
    }
  });
  return next;
}

function enrichSheetDimensions(dimensions, selections, expandedMap) {
  return (dimensions || []).map(function (dim) {
    var selected = selections[dim.name] || [];
    var summary = selected.length ? selected.join('、') : '';
    return {
      name: dim.name,
      expanded: !!(expandedMap && expandedMap[dim.name]),
      summary: summary,
      options: (dim.options || []).map(function (opt) {
        return { value: opt, selected: selected.indexOf(opt) >= 0 };
      }),
    };
  });
}

function resolveActiveCombos(dimensions, combos, selections) {
  var multi = normalizeMultiSelections(selections);
  if (!isMultiSpecSelectionReady(dimensions, multi)) return [];
  return filterCombosByMultiSelections(combos, multi);
}

/** @deprecated 兼容旧单选结构 */
function filterCombosBySelections(combos, selections) {
  return filterCombosByMultiSelections(combos, normalizeMultiSelections(selections));
}

function sumCartQtyForItem(cart, itemId) {
  var sum = 0;
  Object.keys(cart || {}).forEach(function (k) {
    if (readItemIdFromKey(k) === itemId) sum += Number(cart[k]) || 0;
  });
  return sum;
}

function enrichDisplayItems(items, cart) {
  return (items || []).map(function (it) {
    return Object.assign({}, it, {
      hasSpec: specUtil.hasSpecSchema(it.specSchema),
      itemCartQty: sumCartQtyForItem(cart, it.id),
    });
  });
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
    pageGateOk: false,
    mineRecordBadgeText: '',
    canManageItems: false,
    confirmOpen: false,
    confirmLines: [],
    willSplit: false,
    multiIndependent: false,
    mergeDialogShow: false,
    mergePendingRequests: [],
    mergeSelectedId: '',
    showSuppliesSwitch: false,
    navBarHeight: 64,
    pageHeight: 667,
    headerBodyH: 46,
    mainScrollH: 400,
    /** Spec fields */
    specSelections: {},
    specDimensions: {},
    specCombos: {},
    specFilteredCombos: {},
    /** 居中规格弹窗（对齐 H5 SpecSheet） */
    specSheetOpen: false,
    specSheetItemId: 0,
    specSheetItem: null,
    specSheetDimensions: [],
    specSheetSelections: {},
    specSheetActiveCombos: [],
    specSheetShowPlain: false,
    specSheetReady: false,
    specSheetItemCartQty: 0,
    specSheetExpanded: {},
    listRefreshing: false,
  },

  _itemsCache: {},
  _previewActive: false,
  _lastReloadAt: 0,
  _cartSaveTimer: null,

  /** fixed 顶栏 + 列表区 px 高度（禁用 100vh / height:100%） */
  applyMallLayout() {
    const layout = calcMaterialMallLayout({ noveltyVisible: false });
    const patch = {};
    if (layout.pageHeight !== this.data.pageHeight) patch.pageHeight = layout.pageHeight;
    if (layout.navBarHeight !== this.data.navBarHeight) patch.navBarHeight = layout.navBarHeight;
    if (layout.headerBodyH !== this.data.headerBodyH) patch.headerBodyH = layout.headerBodyH;
    if (layout.mainScrollH !== this.data.mainScrollH) patch.mainScrollH = layout.mainScrollH;
    if (Object.keys(patch).length) this.setData(patch);
  },

  onLoad() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    const ok =
      !!token &&
      pagePermission.canAccessMiniPage('/package-feature/pages/studentMaterial/index', role, 'STUDENT');
    if (!ok) {
      wx.showToast({ title: '无权限', icon: 'none' });
      this._accessDenied = true;
      wx.navigateBack({ delta: 1 });
      return;
    }
    const cart = mat.loadLocalCart();
    const isStudent = isStudentAccount();
    const canManageItems = !isStudent && hasMinRole(role, 'STAFF');
    this.setData({
      pageGateOk: true,
      cart,
      cartCount: mat.cartTotalQty(cart),
      canManageItems,
      showSuppliesSwitch: false,
    }, () => {
      this.applyMallLayout();
    });
  },

  applyTopBadges(c) {
    const mn = c ? Number(c.material || 0) : 0;
    const mineRecordBadgeText = mn > 0 ? c.materialText || formatBadgeText(mn) : '';
    this.setData({ mineRecordBadgeText });
  },

  onSwitchSupplies() {
    this.setData({
      cartSheetShow: false,
      confirmOpen: false,
      mergeDialogShow: false,
      specSheetOpen: false,
      specSheetItemId: 0,
    });
    goSupplies();
  },

  onShow() {
    if (this._accessDenied || !this.data.pageGateOk) return;
    this.applyMallLayout();
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    const isStudent = isStudentAccount();
    this.setData({
      showSuppliesSwitch: !isStudent && hasMinRole(role, 'STAFF') && canShowSuppliesSwitch(role),
      canManageItems: !isStudent && hasMinRole(role, 'STAFF'),
    });
    this.applyTopBadges(peekPendingBadges());
    void refreshPendingBadges().then((c) => this.applyTopBadges(c));
    if (this._previewActive) {
      this._previewActive = false;
      return;
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
      const cRes = await springAuth.springRequest({ url: '/api/material/categories', method: 'GET', data: {} });
      const cp = mat.parseResponse(cRes);
      if (!cp.ok) throw new Error(cp.message);
      this.setData({ categories: cp.body.data || [] });
      this._itemsCache = {};
      await this.loadItems();
      await this.pullCartFromServer();
      this._lastReloadAt = Date.now();
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  cacheKeyForCat(cat) {
    return cat === 'all' ? 'all' : `cat:${Number(cat)}`;
  },

  /**
   * Pre-parse spec data (dimensions + combos) for all items with specSchema.
   */
  _prepareSpecData(items) {
    var specDimensions = {};
    var specCombos = {};
    var specSelections = Object.assign({}, this.data.specSelections || {});
    (items || []).forEach(function (it) {
      var dims = parseSpecDimensions(it.specSchema);
      if (!dims.length) return;
      specDimensions[it.id] = dims;
      specCombos[it.id] = generateSpecCombos(dims);
      if (!specSelections[it.id]) specSelections[it.id] = {};
    });
    return { specDimensions: specDimensions, specCombos: specCombos, specSelections: specSelections };
  },

  /**
   * Rebuild filtered combos for all items based on current selections.
   */
  _rebuildFilteredCombos() {
    var specFilteredCombos = {};
    var selections = this.data.specSelections || {};
    var combos = this.data.specCombos || {};
    Object.keys(combos).forEach(function (itemId) {
      specFilteredCombos[itemId] = filterCombosByMultiSelections(
        combos[itemId],
        normalizeMultiSelections(selections[itemId]),
      );
    });
    this.setData({ specFilteredCombos: specFilteredCombos });
  },

  async loadItems(options) {
    const opts = options || {};
    const useCache = opts.useCache !== false;
    const { activeCat } = this.data;
    const cacheKey = this.cacheKeyForCat(activeCat);
    if (useCache) {
      const cached = this._itemsCache[cacheKey];
      if (cached && Array.isArray(cached.items)) {
        const patch = { items: cached.items };
        if (this.data.cartSheetShow) {
          patch.cartLines = mat.buildCartLines(this.data.cart, cached.items);
        }
        // Rebuild spec data
        var specPrep = this._prepareSpecData(cached.items);
        patch.specDimensions = specPrep.specDimensions;
        patch.specCombos = specPrep.specCombos;
        patch.specSelections = specPrep.specSelections;
        this.setData(patch, () => {
          this.applyItemFilter();
          this.reconcileCartWithStock(this.data.items);
          this._rebuildFilteredCombos();
        });
        if (!opts.forceRefresh) return;
      }
    }
    const params = activeCat === 'all' ? {} : { categoryId: activeCat };
    const res = await springAuth.springRequest({ url: '/api/material/items', method: 'GET', data: params });
    const p = mat.parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    const items = mat.decorateItems(p.body.data || []).map((it) => ({
      ...it,
      stockLineText: mat.stockLineText(it),
      _outOfStock: (function () {
        if (it.stockMode === 'UNLIMITED') return false;
        if (it.stockMode === 'QUANTIFIED') return (Number(it.stockQty) || 0) <= 0;
        return Number(it.stockQty) < 1;
      })(),
    }));
    var specPrep2 = this._prepareSpecData(items);
    const patch = {
      items,
      specDimensions: specPrep2.specDimensions,
      specCombos: specPrep2.specCombos,
      specSelections: specPrep2.specSelections,
    };
    if (this.data.cartSheetShow) {
      patch.cartLines = mat.buildCartLines(this.data.cart, items);
    }
    this._itemsCache[cacheKey] = { items, fetchedAt: Date.now() };
    this.setData(patch, () => {
      this.applyItemFilter();
      this.reconcileCartWithStock(this.data.items);
      this._rebuildFilteredCombos();
    });
  },

  reconcileCartWithStock(items) {
    const cart = Object.assign({}, this.data.cart || {});
    let changed = false;
    (items || []).forEach((it) => {
      const id = it.id;
      const max = this.maxForItem(it);
      Object.keys(cart).forEach((k) => {
        const parsedId = readItemIdFromKey(k);
        if (parsedId !== id) return;
        if (max <= 0) {
          delete cart[k];
          changed = true;
        } else if (cart[k] > max) {
          cart[k] = max;
          changed = true;
        }
      });
    });
    if (!changed) return;
    this.syncCart(cart);
  },

  applyItemFilter() {
    const keyword = (this.data.searchKeyword || '').trim().toLowerCase();
    const items = this.data.items || [];
    const cart = this.data.cart || {};
    let list = items;
    if (keyword) {
      list = items.filter((it) => {
        const name = String(it.name || '').toLowerCase();
        const subtitle = String(it.subtitle || '').toLowerCase();
        return name.includes(keyword) || subtitle.includes(keyword);
      });
    }
    this.setData({ filteredItems: enrichDisplayItems(list, cart) });
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
      this.loadItems({ useCache: true }).catch(() => {});
    });
  },

  maxForItem(item) {
    if (!item) return 0;
    if (item.stockMode === 'UNLIMITED') return 999;
    if (item.stockMode === 'QUANTIFIED') return Math.max(0, Number(item.stockQty) || 0);
    return Number(item.stockQty) >= 1 ? 9999 : 0;
  },

  refreshSpecSheetDisplay() {
    var itemId = this.data.specSheetItemId;
    if (!itemId) return;
    var dims = (this.data.specDimensions || {})[itemId] || [];
    var combos = (this.data.specCombos || {})[itemId] || [];
    var selections = normalizeMultiSelections(this.data.specSheetSelections || {});
    var item = (this.data.items || []).find(function (x) { return x.id === Number(itemId); });
    var ready = isMultiSpecSelectionReady(dims, selections);
    this.setData({
      specSheetDimensions: enrichSheetDimensions(dims, selections, this.data.specSheetExpanded || {}),
      specSheetSelections: selections,
      specSheetActiveCombos: resolveActiveCombos(dims, combos, selections),
      specSheetShowPlain: item && item.specRequired !== 1 && !hasAnyMultiSpecSelection(selections),
      specSheetReady: ready,
      specSheetItemCartQty: sumCartQtyForItem(this.data.cart || {}, itemId),
    });
  },

  onSelectSpecOption(e) {
    var dimName = e.currentTarget.dataset.dim;
    var optValue = e.currentTarget.dataset.opt;
    if (!dimName || !this.data.specSheetOpen) return;
    var selections = toggleMultiSpecOption(
      normalizeMultiSelections(this.data.specSheetSelections || {}),
      dimName,
      optValue,
    );
    this.setData({ specSheetSelections: selections }, () => this.refreshSpecSheetDisplay());
  },

  toggleSpecDimExpand(e) {
    var dimName = e.currentTarget.dataset.dim;
    if (!dimName) return;
    var expanded = Object.assign({}, this.data.specSheetExpanded || {});
    if (expanded[dimName]) delete expanded[dimName];
    else expanded[dimName] = true;
    this.setData({ specSheetExpanded: expanded }, () => this.refreshSpecSheetDisplay());
  },

  openSpecSheet(e) {
    var itemId = Number(e.currentTarget.dataset.id);
    var item = (this.data.items || []).find(function (x) { return x.id === itemId; });
    if (!item || !specUtil.hasSpecSchema(item.specSchema) || item._outOfStock) return;
    var dims = (this.data.specDimensions || {})[itemId] || parseSpecDimensions(item.specSchema);
    var selections = normalizeMultiSelections((this.data.specSelections || {})[itemId] || {});
    this.setData({
      specSheetOpen: true,
      specSheetItemId: itemId,
      specSheetItem: item,
      specSheetSelections: selections,
      specSheetExpanded: {},
    }, () => this.refreshSpecSheetDisplay());
  },

  closeSpecSheet() {
    var itemId = this.data.specSheetItemId;
    if (itemId) {
      var allSel = Object.assign({}, this.data.specSelections || {});
      allSel[itemId] = Object.assign({}, this.data.specSheetSelections || {});
      this.setData({ specSelections: allSel }, () => this._rebuildFilteredCombos());
    }
    this.setData({
      specSheetOpen: false,
      specSheetItemId: 0,
      specSheetItem: null,
      specSheetDimensions: [],
      specSheetSelections: {},
      specSheetActiveCombos: [],
      specSheetShowPlain: false,
      specSheetReady: false,
      specSheetItemCartQty: 0,
      specSheetExpanded: {},
    });
  },

  onSpecSheetClose() {
    this.closeSpecSheet();
  },

  noop() {},

  /* ---- Cart manipulation (supports composite keys) ---- */

  addCart(e) {
    var rawKey = e.currentTarget.dataset.id;
    if (rawKey == null) return;
    var key = String(rawKey);
    var itemId = readItemIdFromKey(key);
    var item = this.data.items.find((x) => x.id === itemId);
    var max = this.maxForItem(item);
    if (max <= 0) {
      wx.showToast({ title: '暂无库存', icon: 'none' });
      return;
    }
    var cart = Object.assign({}, this.data.cart);
    var cur = cart[key] || 0;
    cart[key] = Math.min(cur + 1, max);
    this.syncCart(cart);
  },

  /** Direct SKU-grid add: constructs composite key from itemId + combo dims. */
  onSpecComboAdd(e) {
    var itemId = Number(e.currentTarget.dataset.itemId);
    var comboKey = e.currentTarget.dataset.comboKey;
    if (!itemId || !comboKey) return;
    var cartKey = String(itemId) + '::' + comboKey;
    var item = this.data.items.find((x) => x.id === itemId);
    var max = this.maxForItem(item);
    if (max <= 0) {
      wx.showToast({ title: '暂无库存', icon: 'none' });
      return;
    }
    var cart = Object.assign({}, this.data.cart);
    var cur = cart[cartKey] || 0;
    cart[cartKey] = Math.min(cur + 1, max);
    this.syncCart(cart);
  },

  decCart(e) {
    var rawKey = e.currentTarget.dataset.id;
    if (rawKey == null) return;
    var key = String(rawKey);
    var cur = this.data.cart[key] || 0;
    if (cur <= 0) return;
    var cart = Object.assign({}, this.data.cart);
    var next = cur - 1;
    if (next <= 0) delete cart[key];
    else cart[key] = next;
    this.syncCart(cart);
  },

  onQtyInputBlur(e) {
    var rawKey = e.currentTarget.dataset.id;
    if (rawKey == null) return;
    var key = String(rawKey);
    var itemId = readItemIdFromKey(key);
    if (!itemId) return;
    var item = this.data.items.find((x) => x.id === itemId);
    var max = this.maxForItem(item);
    if (max <= 0) {
      wx.showToast({ title: '暂无库存', icon: 'none' });
      return;
    }
    var raw = String((e.detail && e.detail.value) || '').trim();
    var num = Number(raw);
    var cart = Object.assign({}, this.data.cart);
    if (!raw || Number.isNaN(num) || num <= 0) {
      delete cart[key];
      this.syncCart(cart);
      return;
    }
    cart[key] = Math.min(Math.floor(num), max);
    if (num > max) wx.showToast({ title: '最多 ' + max, icon: 'none' });
    this.syncCart(cart);
  },

  pullCartFromServer() {
    return (async () => {
      const remote = await mat.fetchRemoteCart();
      if (remote == null) return;
      const local = mat.loadLocalCart();
      let cart = remote;
      if (mat.cartTotalQty(remote) === 0 && mat.cartTotalQty(local) > 0) {
        cart = local;
        await mat.saveRemoteCart(cart).catch(() => null);
      }
      mat.persistLocalCart(cart);
      const cartCount = mat.cartTotalQty(cart);
      const patch = { cart, cartCount };
      if (this.data.cartSheetShow) {
        patch.cartLines = mat.buildCartLines(cart, this.data.items || []);
        if (cartCount === 0) patch.cartSheetShow = false;
      }
      this.setData(patch);
    })();
  },

  _scheduleRemoteCartSave(cart) {
    if (this._cartSaveTimer) clearTimeout(this._cartSaveTimer);
    this._cartSaveTimer = setTimeout(() => {
      this._cartSaveTimer = null;
      void mat.saveRemoteCart(cart).catch(() => null);
    }, 450);
  },

  syncCart(cart) {
    mat.persistLocalCart(cart);
    this._scheduleRemoteCartSave(cart);
    const cartCount = mat.cartTotalQty(cart);
    const patch = { cart, cartCount };
    if (this.data.cartSheetShow) {
      patch.cartLines = mat.buildCartLines(cart, this.data.items);
      if (cartCount === 0) patch.cartSheetShow = false;
    }
    patch.filteredItems = enrichDisplayItems(this.data.filteredItems || [], cart);
    if (this.data.specSheetOpen && this.data.specSheetItemId) {
      patch.specSheetItemCartQty = sumCartQtyForItem(cart, this.data.specSheetItemId);
    }
    this.setData(patch);
  },

  openCartSheet() {
    const cartLines = mat.buildCartLines(this.data.cart, this.data.items);
    if (!cartLines.length) {
      wx.showToast({ title: '申领栏是空的', icon: 'none' });
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
    wx.previewImage({ current, urls: urls.length ? Array.from(new Set(urls)) : [current] });
  },

  sheetAdd(e) {
    this.addCart(e);
  },

  sheetDec(e) {
    this.decCart(e);
  },

  async submitOrder() {
    if (this.data.submitting || this.data.cartCount === 0) return;

    // 规格必选：有规格且 specRequired=1 的条目必须带完整 specSnapshot
    var items = this.data.items || [];
    var cart = this.data.cart || {};
    var specDimensions = this.data.specDimensions || {};
    for (var key in cart) {
      if (!cart[key]) continue;
      var parsed = mat.parseSpecCartKey(key);
      var item = items.find(function (x) { return x.id === parsed.itemId; });
      if (!item || !specUtil.hasSpecSchema(item.specSchema)) continue;
      if (Number(item.specRequired) === 1) {
        if (!parsed.specSnapshot) {
          wx.showToast({ title: '请选择完整规格', icon: 'none' });
          return;
        }
        var dims = specDimensions[parsed.itemId] || [];
        var allSelected = dims.every(function (d) { return parsed.specSnapshot[d.name] != null; });
        if (!allSelected) {
          wx.showToast({ title: '请选择完整规格', icon: 'none' });
          return;
        }
      }
    }

    // 校验购物车中已选规格的维度完整性
    for (var key2 in cart) {
      if (!cart[key2]) continue;
      var parsed2 = mat.parseSpecCartKey(key2);
      if (!parsed2.specSnapshot) continue;
      var dims2 = specDimensions[parsed2.itemId] || [];
      if (!dims2.length) continue;
      var allSelected2 = dims2.every(function (d) { return parsed2.specSnapshot[d.name] != null; });
      if (!allSelected2) {
        wx.showToast({ title: '请选择完整规格', icon: 'none' });
        return;
      }
    }

    const confirmLines = mat.buildCartLines(this.data.cart, this.data.items);
    if (!confirmLines.length) {
      wx.showToast({ title: '请选择物品', icon: 'none' });
      return;
    }

    // 独立下单拆分提示（对齐 supplies 页；按 itemId 去重，规格键属于同一物品；跨分类缓存查找）
    var lookupById = {};
    items.forEach(function (it) { lookupById[it.id] = it; });
    var cache = this._itemsCache || {};
    Object.keys(cache).forEach(function (ck) {
      var cachedItems = (cache[ck] && cache[ck].items) || [];
      cachedItems.forEach(function (it) {
        if (!lookupById[it.id]) lookupById[it.id] = it;
      });
    });
    var independentIds = {};
    var regularIds = {};
    Object.keys(cart).forEach(function (k) {
      if (!cart[k]) return;
      var iid = readItemIdFromKey(k);
      var it = lookupById[iid];
      if (!it) return;
      if (Number(it.independentOrder) === 1) independentIds[iid] = true;
      else regularIds[iid] = true;
    });
    var willSplit = Object.keys(independentIds).length > 0 && Object.keys(regularIds).length > 0;
    var multiIndependent = Object.keys(independentIds).length > 1;

    var hintPatch = { confirmLines: confirmLines, willSplit: willSplit, multiIndependent: multiIndependent };

    // 查询本人待处理申领单；查询失败时放行走普通确认流程（fail open）
    this.setData({ submitting: true });
    var pendingRequests = [];
    try {
      const res = await springAuth.springRequest({
        url: '/api/material/requests/mine',
        method: 'GET',
        data: { status: 'PENDING', page: 1, size: 50 },
      });
      const p = mat.parseResponse(res);
      if (p.ok) {
        const payload = p.body.data || {};
        if (Array.isArray(payload.data)) pendingRequests = payload.data;
      }
    } catch (e) {
      pendingRequests = [];
    }
    this.setData({ submitting: false });

    if (!pendingRequests.length) {
      this.setData(Object.assign({ confirmOpen: true }, hintPatch));
      return;
    }

    // 有待处理单：打开合并选择弹窗，默认选中最近一张
    var sorted = pendingRequests.slice().sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    var mergeOptions = sorted.map(function (r) {
      var lineCount = Array.isArray(r.lines) ? r.lines.length : 0;
      var createdAtText = mat.toTime(r.createdAt);
      return {
        idStr: String(r.id),
        shortId: String(r.id || '').slice(-8),
        metaText: createdAtText + (lineCount > 0 ? ' · ' + lineCount + ' 项' : ''),
      };
    });
    this.setData(Object.assign({
      mergeDialogShow: true,
      mergePendingRequests: mergeOptions,
      mergeSelectedId: mergeOptions[0].idStr,
    }, hintPatch));
  },

  closeConfirm() {
    this.setData({ confirmOpen: false });
  },

  /** 由购物车构建提交行（新建/合并两条提交路径共用，防止字段漂移） */
  _buildSubmitLines() {
    var cart = this.data.cart;
    return Object.keys(cart)
      .map(function (k) {
        var qty = cart[k];
        if (qty <= 0) return null;
        if (k.includes('::')) {
          var parsed = mat.parseSpecCartKey(k);
          return {
            itemId: parsed.itemId,
            qty: qty,
            specSnapshot: parsed.specSnapshot
              ? JSON.stringify(parsed.specSnapshot)
              : undefined,
          };
        }
        return { itemId: Number(k), qty: qty };
      })
      .filter(function (l) { return l != null; });
  },

  /** 提交成功后的统一清理：清空本地+远端购物车、刷新列表与角标、跳转记录页 */
  async _afterSubmitSuccess() {
    mat.persistLocalCart({});
    void mat.saveRemoteCart({}).catch(() => null);
    this.setData({ cart: {}, cartCount: 0, cartLines: [], cartSheetShow: false, specSelections: {} });
    await this.loadItems({ forceRefresh: true });
    void refreshPendingBadges({ force: true }).then((snap) => this.applyTopBadges(snap));
    wx.navigateTo({ url: '/package-feature/pages/studentMaterialRequests/index' });
  },

  async confirmSubmit() {
    if (this.data.submitting) return;
    var lines = this._buildSubmitLines();
    if (!lines.length) {
      wx.showToast({ title: '请选择物品', icon: 'none' });
      return;
    }
    const applicantGroup = mat.resolveApplicantGroup();
    const payload = { lines: lines };
    if (applicantGroup) payload.applicantGroup = applicantGroup;
    this.setData({ submitting: true, confirmOpen: false });
    try {
      const res = await springAuth.springRequest({
        url: '/api/material/requests',
        method: 'POST',
        data: payload,
      });
      const p = mat.parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      wx.showToast({ title: '已提交', icon: 'success' });
      await this._afterSubmitSuccess();
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  /* ---- 合并到待处理申领单 ---- */

  onMergeSelect(e) {
    const id = e.currentTarget.dataset.id;
    if (id == null) return;
    this.setData({ mergeSelectedId: String(id) });
  },

  closeMergeDialog() {
    if (this.data.submitting) return;
    this.setData({ mergeDialogShow: false });
  },

  onMergeCreateNew() {
    if (this.data.submitting) return;
    this.setData({ mergeDialogShow: false, confirmOpen: true });
  },

  async onMergeConfirm() {
    if (this.data.submitting) return;
    const targetId = this.data.mergeSelectedId;
    if (!targetId) {
      wx.showToast({ title: '请选择要合并的申领单', icon: 'none' });
      return;
    }
    var lines = this._buildSubmitLines();
    if (!lines.length) {
      wx.showToast({ title: '请选择物品', icon: 'none' });
      return;
    }
    const applicantGroup = mat.resolveApplicantGroup();
    const payload = { lines: lines };
    if (applicantGroup) payload.applicantGroup = applicantGroup;
    this.setData({ submitting: true });
    try {
      const res = await springAuth.springRequest({
        url: `/api/material/requests/${encodeURIComponent(targetId)}/merge`,
        method: 'POST',
        data: payload,
      });
      const p = mat.parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      const list = Array.isArray(p.body.data) ? p.body.data : [];
      const created = list.length > 1 ? list.length - 1 : 0;
      wx.showToast({
        title: created > 0 ? `已合并，并生成 ${created} 张新申领单` : '已合并到待处理申领单',
        icon: 'none',
      });
      this.setData({ mergeDialogShow: false });
      await this._afterSubmitSuccess();
    } catch (e) {
      // 合并失败：保持弹窗打开，仅提示并复位提交态
      wx.showToast({ title: (e && e.message) || '合并失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  goMine() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.canAccessMiniPage('/package-feature/pages/studentMaterialRequests/index', role, 'STUDENT')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/studentMaterialRequests/index' });
  },

  goManage() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.canAccessMiniPage('/package-feature/pages/materialAdmin/index', role, 'STAFF')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-feature/pages/materialAdmin/index' });
  },
});
