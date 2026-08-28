/*
 * 动物订购选购页（服务端共享购物车）
 * 对齐 H5 MobileAnimalOrderView + PC ReferenceDataManager 的下单逻辑。
 * 学生/教职工视角通用；isPi 决定「谁可正式提交订单」。
 */
const springAuth = require('../../../utils/springAuth.js');
const api = require('../../utils/animalOrderApi.js');

function readUserInfo() {
  try {
    const raw = wx.getStorageSync(springAuth.KEYS.USER_INFO);
    if (!raw) return null;
    const u = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return u && typeof u === 'object' ? u : null;
  } catch (e) {
    return null;
  }
}

function extractOptions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p.map(String) : ((p && p.items) || []); } catch (e) { return []; }
  }
  if (typeof raw === 'object' && raw.items) return raw.items.map(String);
  return [];
}

function parseSpecLabel(ss) {
  if (!ss) return '';
  let obj = ss;
  if (typeof ss === 'string') { try { obj = JSON.parse(ss); } catch (e) { return ss; } }
  if (obj && typeof obj === 'object') {
    if (obj.option) return String(obj.option);
    const vals = Object.values(obj).filter(Boolean);
    if (vals.length) return vals.join(' · ');
  }
  return '';
}

function fieldVal(item, key) {
  const fd = item && item.fieldData;
  const v = fd ? fd[key] : undefined;
  return v == null ? '' : String(v);
}

Page({
  data: {
    pageGateOk: false,
    loading: true,
    errorMsg: '',

    activeTypeKey: 'SUPPLIER',
    typeLabel: '供应商',
    drillStack: [],       // [{id,label,typeKey}]
    items: [],            // 当前层级列表（已装饰）
    sidebarItems: [],     // 父层级兄弟项（侧边栏）
    sidebarParentLabel: '',

    aups: [],
    selectedAupId: '',
    selectedAupNo: '',
    isPi: false,

    timePolicy: null,     // {canOrderNow, closedReason, nextOpenAt, estimatedDeliveryDate}
    orderingBlocked: false,

    groupId: '',
    cart: [],             // 服务端购物车行（已装饰）
    cartCount: 0,
    readyCount: 0,
    myDraftCount: 0,
    myReadyCount: 0,
    plainCart: {},        // 无规格车行：refDataId → {id, qty}
    plainQtyByItem: {},   // refDataId → 无规格数量（步进器展示）
    totalQtyByItem: {},   // refDataId → 总数量（选择规格角标）

    specTemplates: [],
    specSheetOpen: false,
    specItem: null,
    specOptionRows: [],   // [{key, templateName, label}]
    specQtys: {},         // {key: qty}

    aupSheetOpen: false,
    cartSheetOpen: false,
    submitConfirmOpen: false,
    submitRemark: '',
    packageRemark: '',
    submitting: false,

    orderHistoryOpen: false,
    orders: [],
  },

  onLoad() {
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    if (!token) {
      this.setData({ pageGateOk: false, loading: false });
      return;
    }
    this.setData({ pageGateOk: true });
    this.loadAll();
  },

  onShow() {
    // 从 AUP 选择等返回后刷新购物车
    if (this.data.pageGateOk && this.data.groupId) {
      this.loadCart();
    }
  },

  loadAll() {
    this.setData({ loading: true, errorMsg: '' });
    const self = this;
    const p1 = api.fetchApprovedAups().catch(function () { return []; });
    const p2 = api.fetchMyRoles().catch(function () { return { isPi: false }; });
    const p3 = api.listSpecTemplates().catch(function () { return []; });

    Promise.all([p1, p2, p3]).then(function (rs) {
      const aups = rs[0];
      const roles = rs[1];
      const templates = rs[2];
      const selectedAupId = self.data.selectedAupId || (aups.length === 1 ? String(aups[0].id) : '');
      const selAup = aups.find(function (a) { return String(a.id) === String(selectedAupId); }) || null;
      const selectedAupNo = selAup ? (selAup.registerNo || '') : '';
      const fromAup = aups.find(function (a) { return a.projectGroupId != null; });
      const u = readUserInfo() || {};
      const projectGroupName = (u.projectGroupName || '').trim();
      const effectiveGroupName = projectGroupName || (aups.find(function (a) { return (a.projectGroupName || '').trim(); }) || {}).projectGroupName || '';
      const groupId = api.resolveGroupId(fromAup ? fromAup.projectGroupId : null, effectiveGroupName);

      self.setData({
        aups: aups,
        selectedAupId: selectedAupId,
        selectedAupNo: selectedAupNo,
        isPi: !!(roles && roles.isPi),
        specTemplates: templates,
        groupId: groupId,
      }, function () {
        self.loadItems();
        self.loadCart();
        self.loadTimePolicy();
      });
    }).catch(function (e) {
      self.setData({ loading: false, errorMsg: (e && e.message) || '加载失败' });
    });
  },

  loadItems() {
    const self = this;
    const typeKey = this.data.activeTypeKey;
    const stack = this.data.drillStack;
    const parentId = stack.length ? stack[stack.length - 1].id : undefined;
    this.setData({ loading: true });
    api.listByType(typeKey, parentId).then(function (list) {
      const items = list.map(function (it) {
        const specTemplateIds = it.fieldData ? it.fieldData.specTemplateIds : null;
        const hasSpec = Array.isArray(specTemplateIds)
          ? specTemplateIds.length > 0
          : (typeof specTemplateIds === 'string' && specTemplateIds.trim().length > 0 && specTemplateIds !== '[]');
        const imageUrl = fieldVal(it, 'imageUrl');
        const title = fieldVal(it, 'title') || ('ID ' + it.id);
        return {
          id: it.id,
          title: title,
          subtitle: fieldVal(it, 'subtitle'),
          description: fieldVal(it, 'description'),
          purchasable: !!(it.fieldData && it.fieldData.purchasable),
          childCount: it.childCount || 0,
          specTemplateIds: specTemplateIds,
          hasSpec: hasSpec,
          coverAbsUrl: imageUrl ? springAuth.toAbsoluteMediaUrl(imageUrl) : '',
          nameInitial: (title || '品').charAt(0),
        };
      });
      self.setData({
        items: items,
        typeLabel: api.getTypeConfig(typeKey).label,
        loading: false,
        errorMsg: '',
      });
      self.loadSidebar();
    }).catch(function (e) {
      self.setData({ loading: false, errorMsg: (e && e.message) || '加载失败' });
    });
  },

  loadSidebar() {
    const cfg = api.getTypeConfig(this.data.activeTypeKey);
    const sidebarParentType = cfg ? cfg.parentType : undefined;
    if (!sidebarParentType) {
      this.setData({ sidebarItems: [], sidebarParentLabel: '' });
      return;
    }
    const stack = this.data.drillStack;
    const sidebarParentId = stack.length >= 2 ? stack[stack.length - 2].id : undefined;
    const self = this;
    api.listByType(sidebarParentType, sidebarParentId).then(function (list) {
      self.setData({
        sidebarItems: (list || []).map(function (it) {
          return { id: it.id, label: fieldVal(it, 'title') || fieldVal(it, 'subtitle') || ('ID ' + it.id) };
        }),
        sidebarParentLabel: api.getTypeConfig(sidebarParentType).label,
      });
    }).catch(function () {
      self.setData({ sidebarItems: [], sidebarParentLabel: '' });
    });
  },

  onSidebarTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    const item = this.data.sidebarItems.find(function (x) { return x.id === id; });
    if (!item) return;
    const stack = this.data.drillStack;
    if (!stack.length) return;
    const newStack = stack.slice(0, -1).concat([{ id: item.id, label: item.label, typeKey: stack[stack.length - 1].typeKey }]);
    this.setData({ drillStack: newStack }, function () { this.loadItems(); this.loadTimePolicy(); });
  },

  loadCart() {
    const self = this;
    const groupId = this.data.groupId;
    if (!groupId) return;
    api.fetchCart(groupId).then(function (list) {
      const u = readUserInfo() || {};
      const currentUserId = (u.id != null ? u.id : u.userId) != null ? String(u.id != null ? u.id : u.userId) : '';
      const displayName = (u.displayName || u.name || '').trim();
      const cart = (list || []).map(function (ci) {
        const addedByName = (ci.addedByName || '').trim();
        return {
          id: ci.id,
          refDataId: ci.refDataId,
          itemLabel: (ci.refDataLabel || '').trim() || ('ID ' + ci.refDataId),
          specLabel: parseSpecLabel(ci.specSelections),
          qty: ci.quantity || 0,
          packageStatus: ci.packageStatus || 'DRAFT',
          packageRemark: ci.packageRemark || '',
          addedBy: ci.addedBy,
          addedByLabel: addedByName || (ci.addedBy === currentUserId ? displayName : '') || ci.addedBy || '',
          canEdit: true,
        };
      });
      const cartCount = cart.reduce(function (s, l) { return s + l.qty; }, 0);
      const ready = cart.filter(function (l) { return l.packageStatus === 'READY'; });
      const myDraft = cart.filter(function (l) { return l.addedBy === currentUserId && l.packageStatus !== 'READY'; });
      const myReady = cart.filter(function (l) { return l.addedBy === currentUserId && l.packageStatus === 'READY'; });
      const plainCart = {};
      const plainQtyByItem = {};
      const totalQtyByItem = {};
      cart.forEach(function (l) {
        const rid = l.refDataId;
        if (rid == null) return;
        totalQtyByItem[rid] = (totalQtyByItem[rid] || 0) + l.qty;
        if (!l.specLabel) {
          plainCart[rid] = { id: l.id, qty: l.qty };
          plainQtyByItem[rid] = l.qty;
        }
      });
      self.setData({
        cart: cart,
        cartCount: cartCount,
        readyCount: ready.length,
        myDraftCount: myDraft.length,
        myReadyCount: myReady.length,
        plainCart: plainCart,
        plainQtyByItem: plainQtyByItem,
        totalQtyByItem: totalQtyByItem,
      });
    }).catch(function () { /* 静默 */ });
  },

  loadTimePolicy() {
    const self = this;
    const stack = this.data.drillStack;
    const breedSeg = stack.find(function (s) { return s.typeKey === 'ANIMAL_BREED'; });
    const categoryKey = breedSeg ? String(breedSeg.id) : undefined;
    api.fetchTimePolicy(categoryKey).then(function (policy) {
      self.setData({
        timePolicy: policy,
        orderingBlocked: !!(policy && !policy.canOrderNow),
      });
    }).catch(function () { /* 静默 */ });
  },

  // ── 下钻 / 面包屑 ──
  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.items.find(function (x) { return x.id === id; });
    if (!item) return;
    const cfg = api.getTypeConfig(this.data.activeTypeKey);
    if (cfg && cfg.childType && item.childCount > 0) {
      const stack = this.data.drillStack.concat([{ id: item.id, label: item.title, typeKey: this.data.activeTypeKey }]);
      this.setData({ drillStack: stack, activeTypeKey: cfg.childType }, function () { this.loadItems(); this.loadTimePolicy(); });
    }
    // 选购不再由整卡点击触发，改由卡片右侧的「选择规格」按钮或「+/- 数量」步进器处理
  },

  onBuyTap(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.items.find(function (x) { return x.id === id; });
    if (item) this.openSpec(item);
  },

  onPlainAdd(e) {
    const self = this;
    const id = Number(e.currentTarget.dataset.id);
    if (this.data.orderingBlocked) {
      wx.showToast({ title: (this.data.timePolicy && this.data.timePolicy.closedReason) || '当前不可购', icon: 'none' });
      return;
    }
    if (!this.data.selectedAupId) {
      wx.showToast({ title: '请先选择 AUP', icon: 'none' });
      this.setData({ aupSheetOpen: true });
      return;
    }
    const plain = this.data.plainCart[id];
    if (plain) {
      api.updateCartItem(plain.id, { quantity: plain.qty + 1 }).then(function () { self.loadCart(); }).catch(function (err) {
        wx.showToast({ title: (err && err.message) || '更新失败', icon: 'none' });
      });
    } else {
      api.addToCart({ refDataId: id, aupRecordId: Number(this.data.selectedAupId), quantity: 1 }, this.data.groupId)
        .then(function () { self.loadCart(); })
        .catch(function (err) { wx.showToast({ title: (err && err.message) || '加入失败', icon: 'none' }); });
    }
  },

  onPlainDec(e) {
    const self = this;
    const id = Number(e.currentTarget.dataset.id);
    const plain = this.data.plainCart[id];
    if (!plain) return;
    if (plain.qty <= 1) {
      api.removeCartItem(plain.id).then(function () { self.loadCart(); }).catch(function (err) {
        wx.showToast({ title: (err && err.message) || '移除失败', icon: 'none' });
      });
    } else {
      api.updateCartItem(plain.id, { quantity: plain.qty - 1 }).then(function () { self.loadCart(); }).catch(function (err) {
        wx.showToast({ title: (err && err.message) || '更新失败', icon: 'none' });
      });
    }
  },

  onBreadcrumbTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (isNaN(index) || index < 0) {
      this.setData({ drillStack: [], activeTypeKey: 'SUPPLIER' }, function () { this.loadItems(); this.loadTimePolicy(); });
      return;
    }
    const stack = this.data.drillStack.slice(0, index + 1);
    const last = stack[stack.length - 1];
    const cfg = api.getTypeConfig(last.typeKey);
    this.setData({ drillStack: stack, activeTypeKey: cfg.childType || last.typeKey }, function () { this.loadItems(); this.loadTimePolicy(); });
  },

  goBackLevel() {
    const stack = this.data.drillStack.slice(0, -1);
    if (stack.length === 0) {
      this.setData({ drillStack: [], activeTypeKey: 'SUPPLIER' }, function () { this.loadItems(); this.loadTimePolicy(); });
      return;
    }
    const last = stack[stack.length - 1];
    const cfg = api.getTypeConfig(last.typeKey);
    this.setData({ drillStack: stack, activeTypeKey: cfg.childType || last.typeKey }, function () { this.loadItems(); this.loadTimePolicy(); });
  },

  // ── 规格 ──
  openSpec(item) {
    if (this.data.orderingBlocked) {
      wx.showToast({ title: (this.data.timePolicy && this.data.timePolicy.closedReason) || '当前不可购', icon: 'none' });
      return;
    }
    if (!this.data.selectedAupId) {
      wx.showToast({ title: '请先选择 AUP', icon: 'none' });
      this.setData({ aupSheetOpen: true });
      return;
    }
    const idList = Array.isArray(item.specTemplateIds)
      ? item.specTemplateIds.map(Number)
      : [];
    const rows = [];
    this.data.specTemplates.forEach(function (tpl) {
      if (idList.indexOf(Number(tpl.id)) < 0) return;
      extractOptions(tpl.options).forEach(function (opt) {
        rows.push({ key: tpl.id + ':' + opt, templateName: tpl.name, label: opt });
      });
    });
    this.setData({ specItem: item, specOptionRows: rows, specQtys: {}, specSheetOpen: true });
  },

  closeSpec() {
    this.setData({ specSheetOpen: false, specItem: null, specOptionRows: [], specQtys: {} });
  },

  onSpecDec(e) {
    const key = e.currentTarget.dataset.key;
    const cur = this.data.specQtys[key] || 0;
    const next = Math.max(0, cur - 1);
    const specQtys = Object.assign({}, this.data.specQtys);
    if (next <= 0) delete specQtys[key];
    else specQtys[key] = next;
    this.setData({ specQtys: specQtys });
  },

  onSpecInc(e) {
    const key = e.currentTarget.dataset.key;
    const specQtys = Object.assign({}, this.data.specQtys);
    specQtys[key] = Math.min(999, (specQtys[key] || 0) + 1);
    this.setData({ specQtys: specQtys });
  },

  onSpecConfirm() {
    const self = this;
    const item = this.data.specItem;
    const entries = this.data.specOptionRows
      .filter(function (r) { return (self.data.specQtys[r.key] || 0) > 0; })
      .map(function (r) { return { optionLabel: r.templateName + ': ' + r.label, qty: self.data.specQtys[r.key] }; });
    if (!entries.length) return;
    if (!item || !this.data.selectedAupId || !this.data.groupId) return;

    this.setData({ submitting: true });
    const aupRecordId = Number(this.data.selectedAupId);
    let chain = Promise.resolve();
    let ok = 0;
    entries.forEach(function (entry) {
      chain = chain.then(function () {
        return api.addToCart({
          refDataId: item.id,
          aupRecordId: aupRecordId,
          quantity: entry.qty,
          specSelections: { option: entry.optionLabel },
        }, self.data.groupId).then(function () { ok += 1; });
      });
    });
    chain.then(function () {
      self.setData({ submitting: false, specSheetOpen: false, specItem: null, specOptionRows: [], specQtys: {} });
      wx.showToast({ title: '已加入购物车 (' + ok + ' 项)', icon: 'success' });
      self.loadCart();
    }).catch(function (e) {
      self.setData({ submitting: false });
      wx.showToast({ title: (e && e.message) || '加入失败', icon: 'none' });
    });
  },

  // ── 购物车 ──
  openCartSheet() { this.setData({ cartSheetOpen: true }); },
  closeCartSheet() { this.setData({ cartSheetOpen: false }); },

  onCartDec(e) {
    const id = Number(e.currentTarget.dataset.id);
    const line = this.data.cart.find(function (l) { return l.id === id; });
    if (!line) return;
    if (line.qty <= 1) {
      this.removeCartLine(id);
    } else {
      this.updateCartQty(id, line.qty - 1);
    }
  },

  onCartInc(e) {
    const id = Number(e.currentTarget.dataset.id);
    const line = this.data.cart.find(function (l) { return l.id === id; });
    if (!line) return;
    this.updateCartQty(id, line.qty + 1);
  },

  updateCartQty(id, qty) {
    const self = this;
    api.updateCartItem(id, { quantity: qty }).then(function () { self.loadCart(); }).catch(function (e) {
      wx.showToast({ title: (e && e.message) || '更新失败', icon: 'none' });
    });
  },

  removeCartLine(id) {
    const self = this;
    api.removeCartItem(id).then(function () { self.loadCart(); }).catch(function (e) {
      wx.showToast({ title: (e && e.message) || '移除失败', icon: 'none' });
    });
  },

  onPackageRemarkInput(e) { this.setData({ packageRemark: e.detail.value }); },

  onMarkReady() {
    const self = this;
    if (this.data.orderingBlocked) { wx.showToast({ title: (this.data.timePolicy && this.data.timePolicy.closedReason) || '当前不可购', icon: 'none' }); return; }
    if (!this.data.myDraftCount) { wx.showToast({ title: '没有可提交的草稿行', icon: 'none' }); return; }
    this.setData({ submitting: true });
    api.markPackageReady(this.data.groupId, { packageRemark: (this.data.packageRemark || '').trim() || undefined })
      .then(function () {
        self.setData({ submitting: false, packageRemark: '' });
        wx.showToast({ title: '已提交给 PI', icon: 'success' });
        self.loadCart();
      })
      .catch(function (e) { self.setData({ submitting: false }); wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none' }); });
  },

  onWithdraw() {
    const self = this;
    api.withdrawPackage(this.data.groupId).then(function () {
      wx.showToast({ title: '已撤回订单包', icon: 'success' });
      self.loadCart();
    }).catch(function (e) { wx.showToast({ title: (e && e.message) || '撤回失败', icon: 'none' }); });
  },

  onClearCart() {
    const self = this;
    wx.showModal({
      title: '清空购物车',
      content: '确认清空课题组共享购物车？此操作不可撤销。',
      success: function (res) {
        if (!res.confirm) return;
        api.clearCart(self.data.groupId).then(function () {
          self.setData({ cartSheetOpen: false });
          self.loadCart();
        }).catch(function (e) { wx.showToast({ title: (e && e.message) || '清空失败', icon: 'none' }); });
      },
    });
  },

  openSubmitConfirm() {
    if (this.data.orderingBlocked) { wx.showToast({ title: (this.data.timePolicy && this.data.timePolicy.closedReason) || '当前不可购', icon: 'none' }); return; }
    if (!this.data.isPi) { wx.showToast({ title: '仅组长可正式提交申领单', icon: 'none' }); return; }
    if (!this.data.readyCount) { wx.showToast({ title: '没有 READY 订单包可提交', icon: 'none' }); return; }
    this.setData({ submitConfirmOpen: true, submitRemark: '' });
  },

  closeSubmitConfirm() { this.setData({ submitConfirmOpen: false }); },
  onSubmitRemarkInput(e) { this.setData({ submitRemark: e.detail.value }); },

  onSubmitOrder() {
    const self = this;
    const u = readUserInfo() || {};
    const currentUserId = (u.id != null ? u.id : u.userId) != null ? String(u.id != null ? u.id : u.userId) : '';
    const displayName = (u.displayName || u.name || '').trim();
    const projectGroupName = (u.projectGroupName || '').trim();
    const cartIds = this.data.cart.filter(function (l) { return l.packageStatus === 'READY'; }).map(function (l) { return l.id; });

    this.setData({ submitting: true });
    api.submitOrder({
      groupId: this.data.groupId,
      submitterId: currentUserId,
      submitterName: displayName,
      projectGroupName: projectGroupName,
      cartIds: cartIds,
      submitRemark: (this.data.submitRemark || '').trim() || undefined,
    }).then(function () {
      self.setData({ submitting: false, submitConfirmOpen: false, cartSheetOpen: false, submitRemark: '' });
      wx.showToast({ title: '订单已提交', icon: 'success' });
      self.loadCart();
    }).catch(function (e) {
      self.setData({ submitting: false });
      wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none' });
    });
  },

  // ── AUP ──
  openAupSheet() { this.setData({ aupSheetOpen: true }); },
  closeAupSheet() { this.setData({ aupSheetOpen: false }); },
  onSelectAup(e) {
    const id = String(e.currentTarget.dataset.id);
    const aup = this.data.aups.find(function (a) { return String(a.id) === id; }) || null;
    this.setData({
      selectedAupId: id,
      selectedAupNo: aup ? (aup.registerNo || '') : '',
      aupSheetOpen: false,
    });
  },

  // ── 订单记录 ──
  openOrders() {
    const self = this;
    this.setData({ orderHistoryOpen: true });
    if (this.data.groupId) {
      api.fetchOrders(this.data.groupId).then(function (orders) {
        self.setData({ orders: orders || [] });
      }).catch(function () {});
    }
  },
  closeOrders() { this.setData({ orderHistoryOpen: false }); },

  // ── 访客 ──
  goLogin() {
    wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/index/index' }); } });
  },
});
