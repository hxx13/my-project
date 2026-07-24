const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const pagePermission = require('../../../utils/pagePermission.js');
const specUtil = require('../../utils/specSchemaUtil.js');

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

function decorateItems(list) {
  return (list || []).map((it) => {
    const name = it.name != null ? String(it.name) : '';
    const ch = name.trim().charAt(0) || '?';
    return {
      ...it,
      coverAbsUrl: springAuth.toAbsoluteMediaUrl(it.coverUrl),
      nameInitial: ch,
    };
  });
}

/**
 * @deprecated Cloud URL resolution no longer needed; all images go through direct HTTP (Phase 2C).
 */
async function resolveItemsCloudUrls(_items) {
  /* no-op */
}

Page({
  data: {
    categories: [],
    items: [],
    filteredItems: [],
    /** 分类折叠收纳：每项含 expanded(默认收起)、items、itemCount */
    categoryBlocks: [],
    searchKeyword: '',
    newCatName: '',
    inboundOpenId: null,
    stockOpenId: null,
    inboundSubmittingId: null,
    inboundQtyById: {},
    stockNewById: {},
    formShow: false,
    formMode: 'create',
    editItemId: null,
    editOrigStockMode: '',
    editItemStockQty: 0,
    createCatIndex: 0,
    createName: '',
    createStockQty: '0',
    createModeIndex: 0,
    modeLabels: ['数量型（按件扣库存）', '有无型（有/无货）'],
    shelfLabels: ['上架（领用可见）', '下架（不可领）'],
    shelfIndex: 0,
    categoryNames: [],
    createCatName: '',
    createCoverUrl: '',
    createCoverPreview: '',
    coverExplicitlyCleared: false,
    creating: false,
    recycleRows: [],
    recycleSelected: {},
    /** Spec config for create/edit form */
    specEnabled: false,
    specDimensions: [],    // [{ dimName: '', optionsStr: '' }]
    specRequired: false,
    /** 独立下单：该物资不能与其他物资合并下单 */
    independentOrder: false,
  },

  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE);
    if (!hasMinRole(role, 'SUPER_ADMIN')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/suppliesAdmin/index', role, 'SUPER_ADMIN')) return;
    this.loadAll();
  },

  buildCategoryBlocks(categories, filteredItems, prevBlocks) {
    const prevMap = {};
    (prevBlocks || []).forEach((b) => {
      prevMap[String(b.id)] = !!b.expanded;
    });
    const cats = categories || [];
    const list = filteredItems || [];
    const catIdSet = new Set(cats.map((c) => Number(c.id)));
    const blocks = cats.map((cat) => {
      const cid = Number(cat.id);
      const children = list.filter((it) => Number(it.categoryId) === cid);
      return {
        id: cat.id,
        isOrphan: false,
        name: cat.name,
        expanded: prevMap[String(cat.id)] === true,
        itemCount: children.length,
        items: children,
      };
    });
    const orphans = list.filter((it) => !catIdSet.has(Number(it.categoryId)));
    if (orphans.length) {
      const oid = '__orphan__';
      blocks.push({
        id: oid,
        isOrphan: true,
        name: '未归类',
        expanded: prevMap[oid] === true,
        itemCount: orphans.length,
        items: orphans,
      });
    }
    return blocks;
  },

  syncCreatePickerLabels() {
    const { categories, createCatIndex } = this.data;
    const names = (categories || []).map((c) => c.name);
    const idx = Math.min(Math.max(0, createCatIndex), Math.max(0, names.length - 1));
    const createCatName = categories[idx] ? categories[idx].name : '';
    this.setData({ categoryNames: names, createCatIndex: idx, createCatName });
  },

  async loadAll() {
    try {
      await springAuth.refreshPublicRuntimeConfig().catch(() => null);
      const [cRes, iRes, rRes] = await Promise.all([
        springAuth.springRequest({ url: '/api/supplies/admin/categories', method: 'GET', data: {} }),
        springAuth.springRequest({ url: '/api/supplies/admin/items', method: 'GET', data: {} }),
        springAuth.springRequest({ url: '/api/supplies/admin/items/recycle', method: 'GET', data: { page: 1, size: 200 } }),
      ]);
      const c = parseResponse(cRes);
      const i = parseResponse(iRes);
      const r = parseResponse(rRes);
      if (!c.ok) throw new Error(c.message);
      if (!i.ok) throw new Error(i.message);
      if (!r.ok) throw new Error(r.message);
      const categories = Array.isArray(c.body.data) ? c.body.data : [];
      const rawItems = Array.isArray(i.body.data) ? i.body.data : [];
      const items = decorateItems(rawItems);
      // 渲染前解析 coverAbsUrl（cloud:// 映射已移除，直接 HTTP）
      await resolveItemsCloudUrls(items);
      const recycleRows = ((r.body.data && r.body.data.data) || []).map((it) => ({
        ...it,
        purgeAfterText: it.purgeAfterTime ? String(it.purgeAfterTime).replace('T', ' ').slice(0, 16) : '',
      }));
      const stockNewById = {};
      items.forEach((it) => {
        stockNewById[it.id] = String(it.stockQty != null ? it.stockQty : 0);
      });
      this.setData({ categories, items, stockNewById, recycleRows, recycleSelected: {} }, () => {
        this.syncCreatePickerLabels();
        this.applyItemFilter();
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },

  /**
   * @deprecated Cloud URL resolution removed in Phase 2C.
   */
  async applyCloudUrls(_items) { },

  onCatName(e) {
    this.setData({ newCatName: e.detail.value });
  },

  applyItemFilter() {
    const keyword = (this.data.searchKeyword || '').trim().toLowerCase();
    const items = this.data.items || [];
    let filteredItems = items;
    if (keyword) {
      filteredItems = items.filter((it) => {
        const name = String(it.name || '').toLowerCase();
        const idText = String(it.id || '').toLowerCase();
        const mode = String(it.stockMode || '').toLowerCase();
        return name.includes(keyword) || idText.includes(keyword) || mode.includes(keyword);
      });
    }
    // Always preserve previous expanded state so the user doesn't lose their
    // place when items are reloaded after edit/inbound/stock-save/deletion.
    const prevForExpand = this.data.categoryBlocks;
    let categoryBlocks = this.buildCategoryBlocks(this.data.categories, filteredItems, prevForExpand);
    if (keyword) {
      categoryBlocks = categoryBlocks.map((b) => (b.itemCount > 0 ? { ...b, expanded: true } : { ...b, expanded: false }));
    }
    // inboundOpenId / stockOpenId are reset on purpose: the data underneath
    // has been refreshed (e.g. stock changed), so keeping the old panel open
    // would show stale values.
    this.setData({ filteredItems, categoryBlocks, inboundOpenId: null, stockOpenId: null });
  },

  onToggleCategory(e) {
    const cid = e.currentTarget.dataset.cid;
    if (cid === undefined || cid === null) return;
    const blocks = (this.data.categoryBlocks || []).map((b) =>
      String(b.id) === String(cid) ? { ...b, expanded: !b.expanded } : b,
    );
    this.setData({ categoryBlocks: blocks });
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' }, () => this.applyItemFilter());
  },

  onInboundQtyFor(e) {
    const id = e.currentTarget.dataset.id;
    const key = `inboundQtyById.${id}`;
    this.setData({ [key]: e.detail.value });
  },

  onStockNewFor(e) {
    const id = e.currentTarget.dataset.id;
    const key = `stockNewById.${id}`;
    this.setData({ [key]: e.detail.value });
  },

  toggleInbound(e) {
    const id = Number(e.currentTarget.dataset.id);
    const cur = this.data.inboundOpenId;
    this.setData({
      inboundOpenId: cur === id ? null : id,
      stockOpenId: null,
      [`inboundQtyById.${id}`]: this.data.inboundQtyById[id] || '1',
    });
  },

  closeInbound() {
    this.setData({ inboundOpenId: null });
  },

  toggleStock(e) {
    const id = Number(e.currentTarget.dataset.id);
    const cur = this.data.stockOpenId;
    const item = this.data.items.find((x) => x.id === id);
    const patch = { stockOpenId: cur === id ? null : id, inboundOpenId: null };
    if (item && cur !== id) {
      patch[`stockNewById.${id}`] = String(item.stockQty != null ? item.stockQty : 0);
    }
    this.setData(patch);
  },

  closeStock() {
    this.setData({ stockOpenId: null });
  },

  async onInboundOne(e) {
    const itemId = Number(e.currentTarget.dataset.id);
    if (!itemId || this.data.inboundSubmittingId === itemId) return;
    const mode = e.currentTarget.dataset.mode;
    const qty =
      mode === 'FLAG'
        ? 1
        : Number((this.data.inboundQtyById && this.data.inboundQtyById[itemId]) || '0');
    if (!qty || qty <= 0) {
      wx.showToast({ title: '请填写有效数量', icon: 'none' });
      return;
    }
    this.setData({ inboundSubmittingId: itemId });
    try {
      const res = await springAuth.springRequest({
        url: '/api/supplies/admin/inbound',
        method: 'POST',
        data: { itemId, qty },
      });
      const p = parseResponse(res);
      if (!p.ok) {
        wx.showToast({ title: p.message, icon: 'none' });
        return;
      }
      wx.showToast({ title: '入库成功', icon: 'success' });
      this.setData({ inboundOpenId: null });
      await this.loadAll();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '入库失败', icon: 'none' });
    } finally {
      this.setData({ inboundSubmittingId: null });
    }
  },

  async onSaveStock(e) {
    const itemId = Number(e.currentTarget.dataset.id);
    const raw = (this.data.stockNewById && this.data.stockNewById[itemId]) || '';
    const newQty = Number(raw);
    if (!itemId || Number.isNaN(newQty) || newQty < 0) {
      wx.showToast({ title: '库存数字无效', icon: 'none' });
      return;
    }
    const res = await springAuth.springRequest({
      url: `/api/supplies/admin/items/${itemId}/stock`,
      method: 'PATCH',
      data: { newQty },
    });
    const p = parseResponse(res);
    if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
    wx.showToast({ title: '已保存', icon: 'success' });
    this.setData({ stockOpenId: null });
    await this.loadAll();
  },

  async onAddCat() {
    const name = (this.data.newCatName || '').trim();
    if (!name) return;
    const res = await springAuth.springRequest({
      url: '/api/supplies/admin/categories',
      method: 'POST',
      data: { name, sortOrder: 0, status: 1 },
    });
    const p = parseResponse(res);
    if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
    wx.showToast({ title: '已添加', icon: 'success' });
    this.setData({ newCatName: '' });
    await this.loadAll();
  },

  onDeleteCat(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除分类',
      content: '确认删除？',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await springAuth.springRequest({
          url: `/api/supplies/admin/categories/${id}`,
          method: 'DELETE',
          data: {},
        });
        const p = parseResponse(res);
        if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
        wx.showToast({ title: '已删除', icon: 'success' });
        await this.loadAll();
      },
    });
  },

  onDeleteItem(e) {
    const id = Number(e.currentTarget.dataset.id);
    const item = this.data.items.find((x) => x.id === id);
    wx.showModal({
      title: '删除物资',
      content: item ? `确定删除「${item.name}」？` : '确定删除该物资？',
      confirmColor: '#ee0a24',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await springAuth.springRequest({
          url: `/api/supplies/admin/items/${id}`,
          method: 'DELETE',
          data: {},
        });
        const p = parseResponse(res);
        if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
        wx.showToast({ title: '已删除', icon: 'success' });
        this.setData({ inboundOpenId: null, stockOpenId: null, formShow: false });
        await this.loadAll();
      },
    });
  },

  onToggleRecycleSelect(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    const now = !!(this.data.recycleSelected && this.data.recycleSelected[id]);
    this.setData({ [`recycleSelected.${id}`]: !now });
  },

  async onRestoreRecycleItem(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    const res = await springAuth.springRequest({
      url: `/api/supplies/admin/items/recycle/${id}/restore`,
      method: 'POST',
      data: {},
    });
    const p = parseResponse(res);
    if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
    wx.showToast({ title: '已恢复', icon: 'success' });
    await this.loadAll();
  },

  onPurgeRecycleItem(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    wx.showModal({
      title: '彻底删除',
      content: '确认彻底删除该回收站物资？',
      confirmColor: '#ee0a24',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await springAuth.springRequest({
          url: `/api/supplies/admin/items/recycle/${id}`,
          method: 'DELETE',
          data: {},
        });
        const p = parseResponse(res);
        if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
        wx.showToast({ title: '已删除', icon: 'success' });
        await this.loadAll();
      },
    });
  },

  onPurgeRecycleSelected() {
    const ids = Object.keys(this.data.recycleSelected || {})
      .filter((k) => this.data.recycleSelected[k])
      .map((k) => Number(k))
      .filter((n) => !Number.isNaN(n) && n > 0);
    if (!ids.length) return wx.showToast({ title: '请先勾选', icon: 'none' });
    wx.showModal({
      title: '批量彻底删除',
      content: `确认删除 ${ids.length} 条回收站物资？`,
      confirmColor: '#ee0a24',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await springAuth.springRequest({
          url: '/api/supplies/admin/items/recycle/purge',
          method: 'POST',
          data: { ids },
        });
        const p = parseResponse(res);
        if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
        wx.showToast({ title: '已彻底删除', icon: 'success' });
        await this.loadAll();
      },
    });
  },

  onPurgeRecycleAll() {
    wx.showModal({
      title: '清空回收站',
      content: '确认一键清空回收站？',
      confirmColor: '#ee0a24',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await springAuth.springRequest({
          url: '/api/supplies/admin/items/recycle',
          method: 'DELETE',
          data: {},
        });
        const p = parseResponse(res);
        if (!p.ok) return wx.showToast({ title: p.message, icon: 'none' });
        wx.showToast({ title: '已清空', icon: 'success' });
        await this.loadAll();
      },
    });
  },

  _openCreateForm(initialCatIndex) {
    if (!this.data.categories.length) {
      wx.showToast({ title: '请先新增分类', icon: 'none' });
      return;
    }
    const n = this.data.categories.length;
    let idx = 0;
    if (initialCatIndex != null && initialCatIndex >= 0 && initialCatIndex < n) {
      idx = initialCatIndex;
    }
    this.syncCreatePickerLabels();
    this.setData(
      {
        formShow: true,
        formMode: 'create',
        editItemId: null,
        editOrigStockMode: '',
        editItemStockQty: 0,
        createName: '',
        createStockQty: '0',
        createCatIndex: idx,
        createModeIndex: 0,
        shelfIndex: 0,
        createCoverUrl: '',
        createCoverPreview: '',
        coverExplicitlyCleared: false,
        creating: false,
        inboundOpenId: null,
        stockOpenId: null,
        specEnabled: false,
        specDimensions: [],
        specRequired: false,
        independentOrder: false,
      },
      () => this.syncCreatePickerLabels(),
    );
  },

  openCreate() {
    this._openCreateForm(0);
  },

  openCreateInCategory(e) {
    const cid = e.currentTarget.dataset.cid;
    if (cid === undefined || cid === null) return;
    if (String(cid) === '__orphan__') {
      wx.showToast({ title: '未归类物资请编辑后指定分类', icon: 'none' });
      return;
    }
    const ix = this.data.categories.findIndex((c) => String(c.id) === String(cid));
    if (ix < 0) {
      wx.showToast({ title: '分类不存在', icon: 'none' });
      return;
    }
    this._openCreateForm(ix);
  },

  openEdit(e) {
    const id = Number(e.currentTarget.dataset.id);
    const item = this.data.items.find((x) => x.id === id);
    if (!item || !this.data.categories.length) {
      wx.showToast({ title: '数据异常', icon: 'none' });
      return;
    }
    const catIdx = Math.max(0, this.data.categories.findIndex((c) => c.id === item.categoryId));
    const modeIdx = item.stockMode === 'FLAG' ? 1 : 0;
    const shelfIdx = item.shelfStatus === 'OFF_SHELF' ? 1 : 0;
    // Parse specSchema for edit（dimensions 权威格式，兼容旧扁平格式）
    var specEnabled = false;
    var specDimensions = [];
    var specRequired = false;
    var dimList = specUtil.parseSpecDimensions(item.specSchema);
    if (dimList.length) {
      specEnabled = true;
      specDimensions = dimList.map(function (d) {
        return { dimName: d.name, optionsStr: (d.options || []).join(',') };
      });
    }
    specRequired = Number(item.specRequired) === 1;
    this.setData(
      {
        formShow: true,
        formMode: 'edit',
        editItemId: id,
        editOrigStockMode: item.stockMode || 'QUANTIFIED',
        editItemStockQty: Number(item.stockQty) || 0,
        createName: item.name || '',
        createStockQty: String(item.stockQty != null ? item.stockQty : 0),
        createCatIndex: catIdx,
        createModeIndex: modeIdx,
        shelfIndex: shelfIdx,
        createCoverUrl: '',
        createCoverPreview: item.coverAbsUrl || '',
        coverExplicitlyCleared: false,
        creating: false,
        inboundOpenId: null,
        stockOpenId: null,
        specEnabled: specEnabled,
        specDimensions: specDimensions,
        specRequired: specRequired,
        independentOrder: item.independentOrder === 1,
      },
      () => this.syncCreatePickerLabels(),
    );
  },

  closeForm() {
    this.setData({
      formShow: false,
      createCoverUrl: '',
      createCoverPreview: '',
      coverExplicitlyCleared: false,
      creating: false,
    });
  },

  clearFormCover() {
    this.setData({
      createCoverUrl: '',
      createCoverPreview: '',
      coverExplicitlyCleared: this.data.formMode === 'edit',
    });
  },

  async pickOneImage() {
    if (wx.chooseMedia) {
      return wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
      });
    }
    return new Promise((resolve, reject) => {
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success(res) {
          const p = (res.tempFilePaths && res.tempFilePaths[0]) || '';
          resolve({ tempFiles: p ? [{ tempFilePath: p }] : [] });
        },
        fail: reject,
      });
    });
  },

  async chooseFormCover() {
    try {
      const r = await this.pickOneImage();
      const f = r.tempFiles && r.tempFiles[0];
      if (!f || !f.tempFilePath) return;
      wx.showLoading({ title: '上传中', mask: true });
      try {
        const path = f.tempFilePath;
        const url = await springAuth.uploadFileDirect(path, {});
        this.setData({
          createCoverUrl: url,
          createCoverPreview: url,
          coverExplicitlyCleared: false,
        });
      } finally {
        wx.hideLoading();
      }
    } catch (e) {
      const msg = (e && e.errMsg) || (e && e.message) || '';
      if (msg.indexOf('cancel') !== -1) return;
      wx.showToast({ title: (e && e.message) || '上传失败', icon: 'none' });
    }
  },

  onPickCat(e) {
    const createCatIndex = Number(e.detail.value) || 0;
    this.setData({ createCatIndex }, () => this.syncCreatePickerLabels());
  },

  onPickMode(e) {
    this.setData({ createModeIndex: Number(e.detail.value) || 0 });
  },

  onPickShelf(e) {
    this.setData({ shelfIndex: Number(e.detail.value) || 0 });
  },

  onCreateName(e) {
    this.setData({ createName: e.detail.value });
  },

  onCreateStockQty(e) {
    this.setData({ createStockQty: e.detail.value || '' });
  },

  /* ── Spec config ────────────────────────────────── */
  onToggleSpec() {
    this.setData({ specEnabled: !this.data.specEnabled });
  },

  onToggleSpecRequired() {
    this.setData({ specRequired: !this.data.specRequired });
  },

  onToggleIndependentOrder() {
    this.setData({ independentOrder: !this.data.independentOrder });
  },

  onAddSpecDim() {
    var dims = (this.data.specDimensions || []).slice();
    dims.push({ dimName: '', optionsStr: '' });
    this.setData({ specDimensions: dims });
  },

  onRemoveSpecDim(e) {
    var idx = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(idx)) return;
    var dims = (this.data.specDimensions || []).slice();
    dims.splice(idx, 1);
    this.setData({ specDimensions: dims });
  },

  onSpecDimName(e) {
    var idx = Number(e.currentTarget.dataset.index);
    var val = e.detail.value || '';
    if (Number.isNaN(idx)) return;
    this.setData({ ['specDimensions[' + idx + '].dimName']: val });
  },

  onSpecDimOptions(e) {
    var idx = Number(e.currentTarget.dataset.index);
    var val = e.detail.value || '';
    if (Number.isNaN(idx)) return;
    this.setData({ ['specDimensions[' + idx + '].optionsStr']: val });
  },

  async submitItemForm() {
    if (this.data.creating) return;
    const {
      categories,
      createCatIndex,
      createName,
      createStockQty,
      createModeIndex,
      shelfIndex,
      createCoverUrl,
      formMode,
      editItemId,
      editOrigStockMode,
      editItemStockQty,
      coverExplicitlyCleared,
      specEnabled,
      specDimensions,
      specRequired,
    } = this.data;
    const cat = categories[createCatIndex];
    const name = (createName || '').trim();
    if (!cat || !name) {
      wx.showToast({ title: '请选择分类并填写名称', icon: 'none' });
      return;
    }
    const mode = createModeIndex === 1 ? 'FLAG' : 'QUANTIFIED';
    const shelfStatus = shelfIndex === 1 ? 'OFF_SHELF' : 'ON_SHELF';
    const rawQty = Number(createStockQty);
    if (Number.isNaN(rawQty) || rawQty < 0) {
      wx.showToast({ title: '初始入库数量无效', icon: 'none' });
      return;
    }

    // Build specSchema from form fields（dimensions 权威格式）
    var specSchema = null;
    if (specEnabled) {
      var dimsForSave = (specDimensions || []).map(function (d) {
        return {
          name: (d.dimName || '').trim(),
          optionsStr: d.optionsStr || '',
        };
      });
      specSchema = specUtil.serializeSpecDimensions(dimsForSave);
    }

    this.setData({ creating: true });
    try {
      if (formMode === 'create') {
        const body = {
          categoryId: cat.id,
          name,
          stockMode: mode,
          stockQty: mode === 'FLAG' ? (rawQty > 0 ? 1 : 0) : Math.floor(rawQty),
          shelfStatus,
        };
        if (specSchema) body.specSchema = specSchema;
        body.specRequired = specRequired ? 1 : 0;
        body.independentOrder = this.data.independentOrder ? 1 : 0;
        const cv = (createCoverUrl || '').trim();
        if (cv) body.coverUrl = cv;
        const res = await springAuth.springRequest({
          url: '/api/supplies/admin/items',
          method: 'POST',
          data: body,
        });
        const p = parseResponse(res);
        if (!p.ok) {
          wx.showToast({ title: p.message, icon: 'none' });
          return;
        }
        wx.showToast({ title: '已创建', icon: 'success' });
        this.closeForm();
        await this.loadAll();
        return;
      }

      const body = {
        categoryId: cat.id,
        name,
        stockMode: mode,
        shelfStatus,
      };
      if (specSchema != null) body.specSchema = specSchema;
      body.specRequired = specRequired ? 1 : 0;
      body.independentOrder = this.data.independentOrder ? 1 : 0;
      if (coverExplicitlyCleared) {
        body.coverUrl = '';
      } else if ((createCoverUrl || '').trim()) {
        body.coverUrl = createCoverUrl.trim();
      }
      if (editOrigStockMode !== mode) {
        const sq = Number(editItemStockQty) || 0;
        if (mode === 'FLAG') {
          body.stockQty = sq >= 1 ? 1 : 0;
        } else {
          body.stockQty = Math.max(0, sq);
        }
      }

      const res = await springAuth.springRequest({
        url: `/api/supplies/admin/items/${editItemId}`,
        method: 'PATCH',
        data: body,
      });
      const p = parseResponse(res);
      if (!p.ok) {
        wx.showToast({ title: p.message, icon: 'none' });
        return;
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      this.closeForm();
      await this.loadAll();
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '失败', icon: 'none' });
    } finally {
      this.setData({ creating: false });
    }
  },
});
