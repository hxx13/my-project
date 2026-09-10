/*
 * 动物订购选购页（服务端共享购物车）
 * 对齐 H5 MobileAnimalOrderView + PC ReferenceDataManager 的下单逻辑。
 * 学生/教职工视角通用；isPi 决定「谁可正式提交订单」。
 */
const springAuth = require('../../../utils/springAuth.js');
const api = require('../../utils/animalOrderApi.js');
const orderExportApi = require('../../utils/orderExportApi.js');

/** 订单状态中文（与 Web/H5 一致） */
const ORDER_STATUS_LABELS = {
  PENDING: '待处理',
  APPROVED: '已批准',
  REJECTED: '已驳回',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};
/** 订单记录每页条数 */
const ORDER_PAGE_SIZE = 20;

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

/* ── 共享购物车分组与身份判定 ──────────────────────────────────
 * 镜像 frontend/src/features/reference-data/CartTree.tsx 的 buildCartTree / canEditCartLine。
 * 小程序无打包通道只能内联（同 studentCageShelf 的 allocVerdict 惯例），改那边必须同步这里。
 */
function canEditCartLine(line, isPi, currentUserId) {
  return !!isPi || line.addedBy === currentUserId;
}

function splitCartByUser(lines) {
  const order = [];
  const byUser = {};
  lines.forEach(function (l) {
    if (!byUser[l.addedBy]) { byUser[l.addedBy] = []; order.push(l.addedBy); }
    byUser[l.addedBy].push(l);
  });
  return order.map(function (uid) {
    const userLines = byUser[uid];
    return { key: uid, title: '实验员 · ' + (userLines[0].addedByLabel || uid), lines: userLines };
  });
}

/** 默认 AUP→实验员→行；'spec-user' 为 规格→实验员→行 */
function buildCartTree(lines, mode) {
  const order = [];
  const buckets = {};
  const keyOf = mode === 'spec-user'
    ? function (l) { return l.itemId + '::' + (l.specLabel || '-'); }
    : function (l) { return String(l.aupRecordId == null ? 'none' : l.aupRecordId); };
  lines.forEach(function (line) {
    const k = keyOf(line);
    if (!buckets[k]) { buckets[k] = []; order.push(k); }
    buckets[k].push(line);
  });
  return order.map(function (k) {
    const g = buckets[k];
    const title = mode === 'spec-user'
      ? g[0].itemLabel + (g[0].specLabel ? ' · ' + g[0].specLabel : '')
      : 'AUP · ' + (g[0].aupLabel || '未归属');
    return { key: k, title: title, subGroups: splitCartByUser(g) };
  });
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

    // 校区：首次进入强制选择，之后记住并可在顶栏切换
    campus: '',
    campusOptions: ['浦东', '浦西'],
    campusSheetOpen: false,

    timePolicy: null,     // {canOrderNow, closedReason, nextOpenAt, estimatedDeliveryDate}
    orderingBlocked: false,

    groupId: '',
    cart: [],             // 服务端购物车行（已装饰）
    cartCount: 0,
    readyCount: 0,
    myDraftCount: 0,
    myReadyCount: 0,
    cartTreeMode: 'aup-user-spec',  // PI 分组视角；镜像 CartTree.tsx 的两种 mode
    cartTree: [],                   // buildCartTree 结果，购物车分组渲染用
    plainCart: {},        // 无规格车行：refDataId → {id, qty}
    plainQtyByItem: {},   // refDataId → 无规格数量（步进器展示）
    totalQtyByItem: {},   // refDataId → 总数量（选择规格角标）

    specTemplates: [],
    specSheetOpen: false,
    specItem: null,
    specOptionRows: [],   // [{key, templateName, label}]
    specQtys: {},         // {key: qty}
    specNoQty: 1,         // 无规格物品的数量
    cartTotalText: '',
    specPriceEnabled: false,
    specFlatPriceText: '',
    specTotalText: '',

    // 领用方式/房间（必选）+ 领用人（默认本人）
    roomTree: [],         // 房间树（已展平为可见行：{key,name,level,depth,hasChildren,expanded}）
    roomExpanded: {},     // {nodeKey: true}
    roomKeyword: '',
    roomSheetOpen: false,
    pickupRoomId: '',
    pickupRoomName: '',
    collectorId: '',
    collectorName: '',
    groupMembers: [],
    collectorSheetOpen: false,

    aupSheetOpen: false,
    cartSheetOpen: false,
    submitConfirmOpen: false,
    submitRemark: '',
    packageRemark: '',
    submitting: false,

    orderHistoryOpen: false,
    orders: [],
    // 订单记录（页签 / 双视图 / 筛选 / 导出）
    orderTab: 'pending',
    orderView: 'card',
    orderFiltersOpen: false,
    orderPage: 1,
    orderTotal: 0,
    orderTotalPages: 1,
    orderRows: [],
    orderLoading: false,
    orderExporting: false,
    orderExpanded: {},
    orderRangeInited: false,
    orderFrom: '',
    orderTo: '',
    orderCampus: '',
    orderAup: '',
    orderSupplier: '',
    orderCollector: '',
    orderRemark: '',
    orderFilterOptions: { supplier: [], aup: [], collector: [] },
    // 编辑模式
    editOrderId: null,
    editBusy: false,
  },

  onLoad() {
    const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    if (!token) {
      this.setData({ pageGateOk: false, loading: false });
      return;
    }
    let campus = '';
    try { campus = String(wx.getStorageSync('animal_order_campus') || ''); } catch (e) { campus = ''; }
    this.setData({ pageGateOk: true, campus: campus }, function () {
      if (campus) this.loadAll();
    });
  },

  /** 门禁弹窗与顶栏共用：首次选择后加载全部数据，之后仅刷新时间策略 */
  onSelectCampus(e) {
    const campus = String(e.currentTarget.dataset.campus || '');
    if (!campus || campus === this.data.campus) { this.setData({ campusSheetOpen: false }); return; }
    const first = !this.data.campus;
    try { wx.setStorageSync('animal_order_campus', campus); } catch (err) { /* ignore */ }
    this.setData({ campus: campus, campusSheetOpen: false }, function () {
      if (first) this.loadAll();
      else this.loadTimePolicy();
    });
  },

  openCampusSheet() { this.setData({ campusSheetOpen: true }); },
  closeCampusSheet() { this.setData({ campusSheetOpen: false }); },

  onShow() {
    // 从 AUP 选择等返回后刷新购物车
    if (this.data.pageGateOk && this.data.groupId) {
      this.loadCart();
    }
  },

  onUnload() {
    // 编辑态离开页面：不保存退出 = 自动回退（清空回填行，原单不动）
    const id = this.data.editOrderId;
    if (id) api.discardOrderEdit(id).catch(function () { /* 页面已销毁，静默 */ });
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
      const isPi = !!self.data.isPi;
      const aupLabelById = {};
      (self.data.aups || []).forEach(function (a) { aupLabelById[String(a.id)] = a.registerNo; });
      const cart = (list || []).map(function (ci) {
        const addedByName = (ci.addedByName || '').trim();
        const line = {
          id: ci.id,
          key: String(ci.id),
          refDataId: ci.refDataId,
          itemId: ci.refDataId,
          itemLabel: (ci.refDataLabel || '').trim() || ('ID ' + ci.refDataId),
          specLabel: parseSpecLabel(ci.specSelections),
          qty: ci.quantity || 0,
          unitPriceText: ci.unitPrice != null ? '¥' + Number(ci.unitPrice).toFixed(2) : '',
          lineAmountText: ci.lineAmount != null ? '¥' + Number(ci.lineAmount).toFixed(2) : '',
          pickupRoomName: ci.pickupRoomName || '',
          collectorName: ci.collectorName || '',
          aupRecordId: ci.aupRecordId,
          aupLabel: aupLabelById[String(ci.aupRecordId)] || '未归属',
          packageStatus: ci.packageStatus || 'DRAFT',
          packageRemark: ci.packageRemark || '',
          addedBy: ci.addedBy,
          addedByLabel: addedByName || (ci.addedBy === currentUserId ? displayName : '') || ci.addedBy || '',
        };
        line.canEdit = canEditCartLine(line, isPi, currentUserId);
        return line;
      });
      const cartCount = cart.reduce(function (s, l) { return s + l.qty; }, 0);
      // 购物车实时总金额：只累加已定价的行；全车无定价时不显示
      const cartTotal = cart.reduce(function (s, l) {
        const v = Number(String(l.lineAmountText || '').replace('¥', ''));
        return s + (isFinite(v) ? v : 0);
      }, 0);
      const cartHasPrice = cart.some(function (l) { return !!l.lineAmountText; });
      // PI 是最终提交人，本人加购的行不必再走「提交给 PI」确认，直接纳入提交范围
      const ready = cart.filter(function (l) {
        return l.packageStatus === 'READY' || (self.data.isPi && l.addedBy === currentUserId);
      });
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
        cartTree: buildCartTree(cart, self.data.cartTreeMode),
        cartCount: cartCount,
        cartTotalText: cartHasPrice ? '¥' + cartTotal.toFixed(2) : '',
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
    api.fetchTimePolicy(categoryKey, this.data.campus).then(function (policy) {
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
    // 价格：物品开启价格后每个规格一个价；未开价格不显示金额
    const fd = item.fieldData || {};
    const priceEnabled = fd.priceEnabled === true;
    const specPrices = (fd.specPrices && typeof fd.specPrices === 'object') ? fd.specPrices : {};
    const flatRaw = fd.price;
    const flatNum = Number(flatRaw);
    const flatPrice = (flatRaw !== null && flatRaw !== undefined && flatRaw !== '' && isFinite(flatNum)) ? flatNum : null;

    const rows = [];
    this.data.specTemplates.forEach(function (tpl) {
      if (idList.indexOf(Number(tpl.id)) < 0) return;
      extractOptions(tpl.options).forEach(function (opt) {
        const priceKey = tpl.name + ': ' + opt;
        const p = specPrices[priceKey];
        rows.push({
          key: tpl.id + ':' + opt,
          templateName: tpl.name,
          label: opt,
          priceText: (priceEnabled && p != null && isFinite(Number(p))) ? '¥' + Number(p).toFixed(2) : (priceEnabled ? '待定' : ''),
        });
      });
    });
    // 房间树与领用人候选按需加载（失败不阻塞选购）
    if (!this.roomTreeRaw) this.loadRoomTree();
    if (!this.data.groupMembers.length) this.loadGroupMembers();
    // 领用人默认本人（显式记 id + 名字，便于订单留痕）
    const u = readUserInfo() || {};
    const selfId = u.id != null ? String(u.id) : (u.userId != null ? String(u.userId) : '');
    const selfName = (u.displayName || u.name || '').trim();
    this.setData({
      specItem: item,
      specOptionRows: rows,
      specQtys: {},
      specNoQty: 1,
      specSheetOpen: true,
      specPriceEnabled: priceEnabled,
      specFlatPriceText: priceEnabled ? (flatPrice != null ? '¥' + flatPrice.toFixed(2) : '待定') : '',
      specTotalText: priceEnabled
        ? (rows.length ? '待定' : (flatPrice != null ? '¥' + flatPrice.toFixed(2) : '待定'))
        : '',
      // 每次选购重新选房间；领用人保留上次选择，未选过则默认本人
      pickupRoomId: '',
      pickupRoomName: '',
      roomKeyword: '',
      collectorId: this.data.collectorId || selfId,
      collectorName: this.data.collectorName || selfName,
    });
  },

  /** 选购面板合计：有规格按各行单价×数量，无规格按单品价×数量；全无定价显示「待定」。 */
  _calcSpecTotalText() {
    if (!this.data.specPriceEnabled) return '';
    const rows = this.data.specOptionRows || [];
    const qtys = this.data.specQtys || {};
    let sum = 0;
    let any = false;
    if (rows.length) {
      const priceMap = {};
      rows.forEach(function (r) {
        const n = String(r.priceText || '').replace('¥', '');
        const v = Number(n);
        if (isFinite(v)) priceMap[r.key] = v;
      });
      rows.forEach(function (r) {
        const q = qtys[r.key] || 0;
        if (q <= 0) return;
        const p = priceMap[r.key];
        if (p == null) return;
        any = true;
        sum += p * q;
      });
    } else {
      const q = Number(this.data.specNoQty) || 0;
      if (q > 0) {
        const p = Number(String(this.data.specFlatPriceText || '').replace('¥', ''));
        if (isFinite(p)) { any = true; sum += p * q; }
      }
    }
    return any ? '¥' + sum.toFixed(2) : '待定';
  },

  closeSpec() {
    this.setData({ specSheetOpen: false, specItem: null, specOptionRows: [], specQtys: {}, specNoQty: 1 });
  },

  onNoSpecDec() {
    this.setData({ specNoQty: Math.max(1, (Number(this.data.specNoQty) || 1) - 1) }, this._recalcSpecTotal);
  },
  onNoSpecInc() {
    this.setData({ specNoQty: Math.min(999, (Number(this.data.specNoQty) || 1) + 1) }, this._recalcSpecTotal);
  },
  /** 数量变化后刷新合计（setData 回调里调，保证读到最新值） */
  _recalcSpecTotal() {
    if (!this.data.specPriceEnabled) return;
    this.setData({ specTotalText: this._calcSpecTotalText() });
  },
  onNoSpecInput(e) {
    const n = parseInt(e.detail.value || '1', 10);
    const q = isFinite(n) ? Math.min(999, Math.max(1, n)) : 1;
    this.setData({ specNoQty: q }, this._recalcSpecTotal);
  },

  onSpecDec(e) {
    const key = e.currentTarget.dataset.key;
    const cur = this.data.specQtys[key] || 0;
    const next = Math.max(0, cur - 1);
    const specQtys = Object.assign({}, this.data.specQtys);
    if (next <= 0) delete specQtys[key];
    else specQtys[key] = next;
    this.setData({ specQtys: specQtys }, this._recalcSpecTotal);
  },

  onSpecInc(e) {
    const key = e.currentTarget.dataset.key;
    const specQtys = Object.assign({}, this.data.specQtys);
    specQtys[key] = Math.min(999, (specQtys[key] || 0) + 1);
    this.setData({ specQtys: specQtys }, this._recalcSpecTotal);
  },

  // ── 领用方式/房间 + 领用人 ──

  /** 把房间树按展开状态展平成可见行，便于 wxml 直接遍历 */
  flattenRoomTree(nodes, depth, expanded, keyword, prefix) {
    const out = [];
    const k = (keyword || '').trim().toLowerCase();
    (nodes || []).forEach(function (n) {
      const children = n.children || [];
      const label = prefix ? (prefix + ' / ' + n.name) : n.name;
      const selfHit = !k || (n.name || '').toLowerCase().indexOf(k) >= 0;
      const childRows = children.length
        ? this.flattenRoomTree(children, depth + 1, expanded, keyword, label)
        : [];
      // 搜索态：只保留命中项及其祖先链
      if (k && !selfHit && !childRows.length) return;
      out.push({
        key: n.id,
        name: n.name,
        label: label,
        level: n.level,
        depth: depth,
        isRoom: n.level === 'ROOM',
        hasChildren: children.length > 0,
        expanded: !!expanded[n.id] || (!!k && childRows.length > 0),
        selected: n.level === 'ROOM' && label === this.data.pickupRoomName,
      });
      for (let i = 0; i < childRows.length; i++) out.push(childRows[i]);
    });
    return out;
  },

  loadRoomTree() {
    const self = this;
    api.fetchRoomTree().then(function (tree) {
      self.roomTreeRaw = tree;
      self.setData({ roomTree: self.flattenRoomTree(tree, 0, self.data.roomExpanded, self.data.roomKeyword, '') });
    }).catch(function () { /* 房间树拉取失败不阻塞下单，弹窗内会提示 */ });
  },

  loadGroupMembers() {
    const self = this;
    api.fetchGroupMembers().then(function (list) {
      self.setData({ groupMembers: list || [] });
    }).catch(function () { self.setData({ groupMembers: [] }); });
  },

  openRoomSheet() {
    if (!this.roomTreeRaw) this.loadRoomTree();
    this.setData({ roomSheetOpen: true });
  },
  closeRoomSheet() { this.setData({ roomSheetOpen: false }); },
  onRoomSearch(e) {
    const kw = e.detail.value || '';
    this.setData({
      roomKeyword: kw,
      roomTree: this.flattenRoomTree(this.roomTreeRaw || [], 0, this.data.roomExpanded, kw, ''),
    });
  },
  onRoomToggle(e) {
    const key = e.currentTarget.dataset.key;
    const expanded = Object.assign({}, this.data.roomExpanded);
    if (expanded[key]) delete expanded[key]; else expanded[key] = true;
    this.setData({
      roomExpanded: expanded,
      roomTree: this.flattenRoomTree(this.roomTreeRaw || [], 0, expanded, this.data.roomKeyword, ''),
    });
  },
  onRoomPick(e) {
    const d = e.currentTarget.dataset;
    if (!d.isroom) { this.onRoomToggle(e); return; }
    this.setData({ pickupRoomId: d.key, pickupRoomName: d.label, roomSheetOpen: false });
  },

  openCollectorSheet() { this.setData({ collectorSheetOpen: true }); },
  closeCollectorSheet() { this.setData({ collectorSheetOpen: false }); },
  onCollectorPick(e) {
    const d = e.currentTarget.dataset;
    if (d.id === '') {
      // 选回「本人」
      this.setData({ collectorId: '', collectorName: '', collectorSheetOpen: false });
      return;
    }
    this.setData({ collectorId: d.id, collectorName: d.name, collectorSheetOpen: false });
  },

  onSpecConfirm() {
    const self = this;
    const item = this.data.specItem;
    if (!item || !this.data.selectedAupId || !this.data.groupId) return;
    if (!this.data.pickupRoomId) {
      wx.showToast({ title: '请选择领用方式/房间', icon: 'none' });
      return;
    }
    // 有规格按规格数量，无规格走单品数量
    let entries = this.data.specOptionRows
      .filter(function (r) { return (self.data.specQtys[r.key] || 0) > 0; })
      .map(function (r) { return { optionLabel: r.templateName + ': ' + r.label, qty: self.data.specQtys[r.key] }; });
    if (!entries.length && !this.data.specOptionRows.length) {
      const q = Number(this.data.specNoQty) || 0;
      if (q <= 0) return;
      entries = [{ optionLabel: '', qty: q }];
    }
    if (!entries.length) return;

    this.setData({ submitting: true });
    const aupRecordId = Number(this.data.selectedAupId);
    const pickup = {
      pickupRoomId: this.data.pickupRoomId,
      pickupRoomName: this.data.pickupRoomName,
      collectorId: this.data.collectorId || undefined,
      collectorName: this.data.collectorName || undefined,
    };
    let chain = Promise.resolve();
    let ok = 0;
    entries.forEach(function (entry) {
      chain = chain.then(function () {
        const body = {
          refDataId: item.id,
          aupRecordId: aupRecordId,
          quantity: entry.qty,
          pickupRoomId: pickup.pickupRoomId,
          pickupRoomName: pickup.pickupRoomName,
        };
        // 无规格物品不写 spec_selections，服务端据此回退到物品自身的 price
        if (entry.optionLabel) body.specSelections = { option: entry.optionLabel };
        if (pickup.collectorId) body.collectorId = pickup.collectorId;
        if (pickup.collectorName) body.collectorName = pickup.collectorName;
        return api.addToCart(body, self.data.groupId).then(function () { ok += 1; });
      });
    });
    chain.then(function () {
      self.setData({
        submitting: false, specSheetOpen: false, specItem: null, specOptionRows: [], specQtys: {}, specNoQty: 1,
        pickupRoomId: '', pickupRoomName: '',
      });
      wx.showToast({ title: '已加入购物车 (' + ok + ' 项)', icon: 'success' });
      self.loadCart();
    }).catch(function (e) {
      self.setData({ submitting: false });
      wx.showToast({ title: (e && e.message) || '加入失败', icon: 'none' });
    });
  },

  // ── 购物车 ──
  openCartSheet() { this.setData({ cartSheetOpen: true }); },
  // 关购物车只是收起来继续选购，编辑态保留；退出拦截在返回/离开页面那一层
  closeCartSheet() { this.setData({ cartSheetOpen: false }); },

  // PI 才显示的分组切换；非 PI 固定 AUP→实验员
  onCartTreeMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode !== 'aup-user-spec' && mode !== 'spec-user') return;
    this.setData({ cartTreeMode: mode, cartTree: buildCartTree(this.data.cart, mode) });
  },

  /** 非 PI 只能改本人加购的行（与 PC/H5 的 canEditCartLine 同判定） */
  _canEditLine(line) {
    if (line && line.canEdit) return true;
    wx.showToast({ title: '只能修改本人加购的行', icon: 'none' });
    return false;
  },

  onCartDec(e) {
    const id = Number(e.currentTarget.dataset.id);
    const line = this.data.cart.find(function (l) { return l.id === id; });
    if (!line || !this._canEditLine(line)) return;
    if (line.qty <= 1) {
      this.removeCartLine(id);
    } else {
      this.updateCartQty(id, line.qty - 1);
    }
  },

  onCartInc(e) {
    const id = Number(e.currentTarget.dataset.id);
    const line = this.data.cart.find(function (l) { return l.id === id; });
    if (!line || !this._canEditLine(line)) return;
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
    if (this.data.editOrderId) { wx.showToast({ title: '编辑模式下不能清空，请先保存或放弃编辑', icon: 'none' }); return; }
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
    if (this.data.editOrderId) { wx.showToast({ title: '编辑模式下请用「保存」写回原单，不能另开新单', icon: 'none' }); return; }
    if (this.data.orderingBlocked) { wx.showToast({ title: (this.data.timePolicy && this.data.timePolicy.closedReason) || '当前不可购', icon: 'none' }); return; }
    if (!this.data.isPi) { wx.showToast({ title: '仅组长可正式提交申领单', icon: 'none' }); return; }
    if (!this.data.readyCount) { wx.showToast({ title: '没有可提交的行：本人加购的行，或实验员已提交给 PI 的订单包', icon: 'none' }); return; }
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
      campus: this.data.campus || undefined,
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

  // ── 订单记录（与 Web/H5 同款：页签 / 卡片表格 / 筛选 / 导出）──

  /** 默认近 3 个月：历史单上万条，不加区间首屏很慢 */
  _defaultOrderRange() {
    const now = new Date();
    const past = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    const fmt = function (d) {
      const p = function (n) { return n < 10 ? '0' + n : String(n); };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    };
    return { from: fmt(past), to: fmt(now) };
  },

  /** 明细取名：优先 ARO 结构化列，回退 hierarchy_chain */
  _lineNames(l) {
    const chain = Array.isArray(l.hierarchyChain) ? l.hierarchyChain : [];
    const byType = function (t) {
      const hit = chain.filter(function (n) { return n && n.refType === t; })[0];
      return (hit && hit.displayName ? String(hit.displayName) : '').trim();
    };
    return {
      supplier: String(l.supplierName || '').trim() || byType('SUPPLIER'),
      strain: String(l.strainName || '').trim() || byType('ANIMAL_STRAIN'),
      spec: String(l.specName || '').trim() || byType('GENOTYPE'),
    };
  },

  _specOption(l) {
    const raw = l.specSelections;
    if (!raw) return '';
    if (typeof raw === 'string') {
      try { const o = JSON.parse(raw); return o && o.option ? String(o.option) : raw; } catch (e) { return raw; }
    }
    return raw.option ? String(raw.option) : '';
  },

  /** 头+行两级 → 扁平展示行，字段与 Web/H5 完全一致 */
  buildOrderRow(o) {
    const self = this;
    const lines = Array.isArray(o.lines) ? o.lines : [];
    let male = 0, female = 0, total = 0;
    const suppliers = [], strains = [], collectors = [], rooms = [], arrivals = [], itemRows = [], remarks = [];
    lines.forEach(function (l) {
      const n = self._lineNames(l);
      if (n.supplier && suppliers.indexOf(n.supplier) < 0) suppliers.push(n.supplier);
      if (n.strain && strains.indexOf(n.strain) < 0) strains.push(n.strain);
      const opt = self._specOption(l);
      const qty = Number(l.quantity || 0);
      itemRows.push({
        label: n.strain || n.spec || '物品',
        spec: opt || n.spec,
        qty: qty,
      });
      if (opt.indexOf('雄性') >= 0) male += qty;
      else if (opt.indexOf('雌性') >= 0) female += qty;
      total += qty;
      if (l.collectorName && collectors.indexOf(l.collectorName) < 0) collectors.push(l.collectorName);
      if (l.pickupRoomName && rooms.indexOf(l.pickupRoomName) < 0) rooms.push(l.pickupRoomName);
      if (l.arrivalDate && arrivals.indexOf(l.arrivalDate) < 0) arrivals.push(l.arrivalDate);
      if (l.lineRemark) remarks.push(String(l.lineRemark).trim());
    });

    const source = o.source === 'ARO' ? 'ARO' : 'LOCAL';
    const dash = function (arr, join) { return arr.length ? arr.join(join || '、') : '—'; };
    const remark = String(o.submitRemark || '').trim() || remarks.join('；');
    return {
      key: source + '-' + o.id,
      orderId: o.id,
      no: String(o.sn || '').trim() || ('#' + o.id),
      source: source,
      sourceLabel: source === 'ARO' ? 'ARO' : '本地',
      projectGroup: String(o.projectGroupName || '').trim() || '—',
      // ARO 单的 submitterId 是合成键，没有真名宁可显示「—」
      submitter: String(o.submitterName || '').trim() || (source === 'ARO' ? '' : String(o.submitterId || '').trim()) || '—',
      items: itemRows,
      suppliers: dash(suppliers),
      strains: dash(strains),
      maleQty: male,
      femaleQty: female,
      totalQty: total,
      amountText: o.totalAmount != null ? '¥' + Number(o.totalAmount).toFixed(2) : '—',
      aup: String(o.registerNo || '').trim() || (o.aupRecordId != null ? 'AUP#' + o.aupRecordId : '—'),
      collector: dash(collectors),
      room: dash(rooms),
      // 本地单没有实际到货日，回退显示预计送达
      arrivalDate: dash(arrivals) !== '—' ? dash(arrivals) : (o.estimatedDeliveryDate ? '预计 ' + o.estimatedDeliveryDate : '—'),
      campus: String(o.campus || '').trim() || String(o.aroAreaName || '').trim() || '—',
      remark: remark || '—',
      status: o.status,
      statusLabel: ORDER_STATUS_LABELS[o.status] || o.status,
      time: o.submittedAt || o.createdAt || '',
    };
  },

  openOrders() {
    const self = this;
    if (!this.data.orderRangeInited) {
      const r = this._defaultOrderRange();
      this.setData({ orderFrom: r.from, orderTo: r.to, orderRangeInited: true });
    }
    this.setData({ orderHistoryOpen: true, orderPage: 1 });
    this.loadOrders();
    this.loadOrderFilterOptions();
  },

  loadOrders() {
    const self = this;
    if (this.data.orderLoading) return;
    const filter = {
      page: this.data.orderPage,
      pageSize: ORDER_PAGE_SIZE,
      from: this.data.orderFrom || undefined,
      to: this.data.orderTo || undefined,
      campus: this.data.orderCampus || undefined,
      aup: (this.data.orderAup || '').trim() || undefined,
      supplier: (this.data.orderSupplier || '').trim() || undefined,
      collector: (this.data.orderCollector || '').trim() || undefined,
      remark: (this.data.orderRemark || '').trim() || undefined,
    };
    if (this.data.orderTab === 'pending') filter.status = 'PENDING';
    else filter.statusNot = 'PENDING';

    this.setData({ orderLoading: true });
    api.fetchMyGroupOrders(filter).then(function (d) {
      const rows = (d.list || []).map(function (o) { return self.buildOrderRow(o); });
      self.setData({
        orderRows: rows,
        orderTotal: d.total || 0,
        orderTotalPages: Math.max(1, Math.ceil((d.total || 0) / ORDER_PAGE_SIZE)),
        orderLoading: false,
      });
    }).catch(function (e) {
      self.setData({ orderLoading: false });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    });
  },

  loadOrderFilterOptions() {
    const self = this;
    const want = [['supplier', 'supplier_name'], ['aup', 'register_no'], ['collector', 'collector_name']];
    want.forEach(function (pair) {
      if (self.data.orderFilterOptions[pair[0]]) return;
      api.fetchMyGroupOrderFilterOptions(pair[1]).then(function (list) {
        const patch = {};
        patch['orderFilterOptions.' + pair[0]] = list || [];
        self.setData(patch);
      }).catch(function () { /* 候选失败不影响手输筛选 */ });
    });
  },

  onOrderTab(e) {
    this.setData({ orderTab: e.currentTarget.dataset.tab, orderPage: 1 }, this.loadOrders);
  },
  onOrderView(e) {
    this.setData({ orderView: e.currentTarget.dataset.view });
  },
  toggleOrderFilters() {
    this.setData({ orderFiltersOpen: !this.data.orderFiltersOpen });
  },
  onOrderFilterInput(e) {
    const key = e.currentTarget.dataset.key;
    const patch = {};
    patch[key] = e.detail.value;
    this.setData(patch);
  },
  onOrderFilterPick(e) {
    const key = e.currentTarget.dataset.key;
    const patch = {};
    patch[key] = e.currentTarget.dataset.value;
    this.setData(patch);
  },
  applyOrderFilters() {
    this.setData({ orderPage: 1 }, this.loadOrders);
  },
  resetOrderFilters() {
    const r = this._defaultOrderRange();
    this.setData({
      orderFrom: r.from, orderTo: r.to, orderPage: 1,
      orderCampus: '', orderAup: '', orderSupplier: '', orderCollector: '', orderRemark: '',
    }, this.loadOrders);
  },
  prevOrderPage() {
    if (this.data.orderPage <= 1) return;
    this.setData({ orderPage: this.data.orderPage - 1 }, this.loadOrders);
  },
  nextOrderPage() {
    const max = Math.max(1, Math.ceil(this.data.orderTotal / ORDER_PAGE_SIZE));
    if (this.data.orderPage >= max) return;
    this.setData({ orderPage: this.data.orderPage + 1 }, this.loadOrders);
  },
  toggleOrderExpand(e) {
    const key = e.currentTarget.dataset.key;
    const expanded = Object.assign({}, this.data.orderExpanded);
    if (expanded[key]) delete expanded[key]; else expanded[key] = true;
    this.setData({ orderExpanded: expanded });
  },

  async onExportOrders() {
    const self = this;
    if (this.data.orderExporting) return;
    const params = {
      from: this.data.orderFrom || undefined,
      to: this.data.orderTo || undefined,
      campus: this.data.orderCampus || undefined,
      aup: (this.data.orderAup || '').trim() || undefined,
      supplier: (this.data.orderSupplier || '').trim() || undefined,
      collector: (this.data.orderCollector || '').trim() || undefined,
      remark: (this.data.orderRemark || '').trim() || undefined,
    };
    if (this.data.orderTab === 'pending') params.status = 'PENDING';
    else params.statusNot = 'PENDING';

    this.setData({ orderExporting: true });
    wx.showLoading({ title: '导出中…', mask: true });
    try {
      const buf = await orderExportApi.exportMyGroupOrdersExcel(params);
      await springAuth.saveAndOpenDocument(buf, '我的课题组订单-' + (params.from || 'all') + '_' + (params.to || 'now') + '.xlsx', 'xlsx');
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '导出失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      self.setData({ orderExporting: false });
    }
  },

  closeOrders() { this.setData({ orderHistoryOpen: false }); },

  // ── 编辑模式（待处理单）：编辑期间原单不动，保存才写回 ──
  /** 编辑态返回拦截：开启原生返回确认弹窗（基础库 ≥2.12.0） */
  _enableOrderEditExitGuard() {
    try {
      wx.enableAlertBeforeUnload({ message: '当前正在编辑订单，返回将丢失本次修改' });
    } catch (e) { /* 基础库 <2.12.0 降级：无拦截 */ }
  },
  _disableOrderEditExitGuard() {
    try { wx.disableAlertBeforeUnload({}); } catch (e) { /* ignore */ }
  },

  async onStartOrderEdit(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id || this.data.editBusy) return;
    if (this.data.editOrderId && this.data.editOrderId !== id) {
      wx.showToast({ title: '请先保存或放弃对订单 #' + this.data.editOrderId + ' 的修改', icon: 'none' });
      return;
    }
    this.setData({ editBusy: true });
    wx.showLoading({ title: '回填中…', mask: true });
    try {
      await api.loadOrderToCart(id);
      this.setData({ editOrderId: id, orderHistoryOpen: false, cartSheetOpen: true });
      this._enableOrderEditExitGuard();
      this.loadCart();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '回填购物车失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ editBusy: false });
    }
  },

  async onApplyOrderEdit() {
    const id = this.data.editOrderId;
    if (!id || this.data.editBusy) return false;
    this.setData({ editBusy: true });
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      await api.applyOrderEdit(id);
      this.setData({ editOrderId: null });
      this._disableOrderEditExitGuard();
      this.loadCart();
      wx.showToast({ title: '订单已保存', icon: 'success' });
      return true;
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      return false;
    } finally {
      wx.hideLoading();
      this.setData({ editBusy: false });
    }
  },

  onDiscardOrderEdit() {
    const self = this;
    const id = this.data.editOrderId;
    if (!id || this.data.editBusy) return;
    wx.showModal({
      title: '放弃编辑',
      content: '购物车里回填的内容会被清除，原订单保持不变。',
      success: async function (r) {
        if (!r.confirm) return;
        self.setData({ editBusy: true });
        wx.showLoading({ title: '处理中…', mask: true });
        try {
          await api.discardOrderEdit(id);
          self.setData({ editOrderId: null });
          self._disableOrderEditExitGuard();
          self.loadCart();
          wx.showToast({ title: '已放弃编辑', icon: 'success' });
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '放弃编辑失败', icon: 'none' });
        } finally {
          wx.hideLoading();
          self.setData({ editBusy: false });
        }
      },
    });
  },

  // ── 访客 ──
  goLogin() {
    wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/index/index' }); } });
  },
});
