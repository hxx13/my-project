/*
 * 动物订购选购页（服务端共享购物车）
 * 对齐 H5 MobileAnimalOrderView + PC ReferenceDataManager 的下单逻辑。
 * 学生/教职工视角通用；isPi 决定「谁可正式提交订单」。
 */
const springAuth = require('../../../utils/springAuth.js');
const { hasMinRole } = require('../../../utils/roleAccess.js');
const personIdentity = require('../../../utils/personIdentity.js');
const beijingTime = require('../../utils/beijingTime.js');
const api = require('../../utils/animalOrderApi.js');
const orderExportApi = require('../../utils/orderExportApi.js');
const cageCellVisual = require('../../utils/cageCellVisual.js');
const picker = require('../../utils/animalOrderCagePicker.js');

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

/* 卡片价格标签：镜像 frontend/src/features/reference-data/ReferenceCard.tsx 的 refCardPrice。
 * 未开启价格返回 ''（不占位）；有规格价取区间；开启未配价返回「待定」。改那边必须同步这里。
 */
function cardPriceText(item) {
  const fd = item && item.fieldData;
  if (!fd || fd.priceEnabled !== true) return '';
  const nums = [];
  const sp = fd.specPrices;
  if (sp && typeof sp === 'object' && !Array.isArray(sp)) {
    Object.keys(sp).forEach(function (k) {
      const n = Number(sp[k]);
      if (isFinite(n)) nums.push(n);
    });
  }
  if (nums.length === 0) {
    const raw = fd.price;
    const n = Number(raw);
    if (raw !== null && raw !== undefined && raw !== '' && isFinite(n)) nums.push(n);
  }
  if (nums.length === 0) return '待定';
  const min = Math.min.apply(null, nums);
  const max = Math.max.apply(null, nums);
  return min === max ? '¥' + min.toFixed(2) : '¥' + min.toFixed(2) + ' ~ ¥' + max.toFixed(2);
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
    nextOpenText: '',     // nextOpenAt 的展示态（yyyy-MM-dd HH:mm 北京时间）
    orderingBlocked: false,

    groupId: '',
    cart: [],             // 服务端购物车行（已装饰）
    cartCount: 0,
    readyCount: 0,
    myDraftCount: 0,
    myReadyCount: 0,
    cartTreeMode: 'aup-user-spec',  // PI 分组视角；镜像 CartTree.tsx 的两种 mode
    cartTree: [],                   // buildCartTree 结果，购物车分组渲染用
    totalQtyByItem: {},   // refDataId → 总数量（「选择规格」按钮角标）
    cartTab: 'current',   // 购物车周期 tab：current=本周期 / preorder=预约
    cartCurrentCount: 0,  // 本周期 tab 数量（按 qty 合计）
    cartPreorderCount: 0, // 预约 tab 数量（按 qty 合计）
    currentCycle: '',     // 当前到货周期日（yyyy-MM-dd），购物车分区 + 规格弹窗默认
    futureCycles: [],     // 预约可选周期 [{ cycle }]，规格弹窗用（非当前周期）
    selectedCycle: '',    // 规格弹窗选的周期：'' = 本周期，否则为 ISO 日期
    cyclePickerLabels: ['本周期'],  // 到货周期 picker 文案（index 0 = 本周期）
    cyclePickerIndex: 0,

    specTemplates: [],
    specSheetOpen: false,
    specItem: null,
    specOptionRows: [],   // [{key, templateName, label}]
    specQtys: {},         // {key: qty}
    specRemarks: {},      // {key: remark} 每个规格选项各一行备注
    cartTotalText: '',
    specPriceEnabled: false,
    specFlatPriceText: '',
    specTotalText: '',

    // 笼位预定（一笼一规格）：抽屉里「规格 + 笼位」一起选
    cageRooms: [],          // 本课题组笼架按房间归并（房间 tab）
    cageTabIdx: 0,
    cageShelves: [],        // 当前房间各架 [{ shelveId, shelveName, grid }]，grid 已补满 80 格
    cageCells: {},          // animalCageId → { selectable, reason, sex }（后端可点性）
    cageMaxPerCage: 5,      // 单笼数量上限（reservable 带回，缺省 5）
    pickedCages: [],        // [{ reservationId, animalCageId, label, shelveId, shelveName }]，顺序=分配顺序
    pickupMode: 'FARM',     // 领用方式：饲养=预定笼位（默认），取走=不占笼位不选房间
    cageAllocPinned: {},    // 手改过的笼位：animalCageId → 数量（其余笼位自动吸收差额）
    cageAllocOpen: false,   // 分配浮层开合（浮层叠在网格上，网格不卸载）
    cageAllocRows: [],      // 分配浮层的行：[{ animalCageId, idx, pos, where, qty }]
    cageAllocEntry: false,  // 「分配」入口是否露出（有笼位且填了总数才有得调）
    cageLoading: false,     // 房间/架子整体加载（wxml 里 wx:if 会换掉整块网格，只在换内容时用）
    cageReserving: false,   // 单个笼位锁定中：不能复用 cageLoading，否则点一下就把网格卸载重建（滚动位置丢失）
    cageError: '',
    cageAllocText: '',      // 分配汇总文案（总数/已分配/还差）

    // 领用方式/房间（必选）+ 领用人（默认本人）
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
    /** 订单记录的数据范围是否全量（超管/业务）。**只用来决定筛选候选走哪条接口** ——
     *  列表与导出都走 /orders/all 与 /orders/export，由服务端按身份自适应，前端不参与判定。 */
    orderScopeAll: false,
    orderFiltersOpen: false,
    orderPage: 1,
    orderTotal: 0,
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
    /** 筛选下拉的可选值：第 0 项恒为「全部」= 不按该条件筛 */
    orderFilterRanges: { supplier: ['全部'], aup: ['全部'], collector: ['全部'] },
    orderFilterPicks: { supplier: 0, aup: 0, collector: 0 },
    /** 触底加载中（与首屏的 orderLoading 分开：首屏要盖住列表，追加只在底部提示） */
    orderLoadingMore: false,
    // 编辑模式
    editOrderId: null,
    editBusy: false,
  },

  _startQuotaTimer() {
    const self = this;
    if (this._quotaTimer) return;
    this._quotaTimer = setInterval(function () { self.loadQuota(); }, 30000);
  },

  _stopQuotaTimer() {
    if (this._quotaTimer) { clearInterval(this._quotaTimer); this._quotaTimer = null; }
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
      else { this.loadTimePolicy(); this.loadQuota(); }
    });
  },

  openCampusSheet() { this.setData({ campusSheetOpen: true }); },
  closeCampusSheet() { this.setData({ campusSheetOpen: false }); },

  onShow() {
    this._startQuotaTimer();
    // 从 AUP 选择等返回后刷新购物车
    if (this.data.pageGateOk && this.data.groupId) {
      this.loadCart();
    }
    if (this.data.pageGateOk) this.loadQuota();
  },

  onHide() {
    this._stopQuotaTimer();
  },

  onUnload() {
    this._stopQuotaTimer();
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
    const p4 = api.fetchCycles(this.data.campus).catch(function () { return []; });
    const p5 = this._resolveOrderScope();

    Promise.all([p1, p2, p3, p4, p5]).then(function (rs) {
      const aups = rs[0];
      const roles = rs[1];
      const templates = rs[2];
      const cycleArr = rs[3] || [];
      const currentCycle = cycleArr.length ? String(cycleArr[0].cycle) : '';
      // AUP 选择要记住（与校区同样的缓存惯例）：只在它仍在已批准名单里时才认，避免脏缓存
      let cachedAupId = '';
      try { cachedAupId = String(wx.getStorageSync('animal_order_aup_id') || ''); } catch (e) { cachedAupId = ''; }
      const cachedAupHit = cachedAupId && aups.some(function (a) { return String(a.id) === cachedAupId; });
      const selectedAupId = self.data.selectedAupId
        || (cachedAupHit ? cachedAupId : (aups.length === 1 ? String(aups[0].id) : ''));
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
        currentCycle: currentCycle,
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
        const imageUrl = fieldVal(it, 'imageUrl');
        const title = fieldVal(it, 'title') || ('ID ' + it.id);
        return {
          id: it.id,
          title: title,
          subtitle: fieldVal(it, 'subtitle'),
          description: fieldVal(it, 'description'),
          priceText: cardPriceText(it),
          purchasable: !!(it.fieldData && it.fieldData.purchasable),
          childCount: it.childCount || 0,
          specTemplateIds: specTemplateIds,
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
      self.loadQuota();
    }).catch(function (e) {
      self.setData({ loading: false, errorMsg: (e && e.message) || '加载失败' });
    });
  },

  /**
   * 物品的规格键与展示名（与 openSpec 的 specKey 同口径：模板名 + ': ' + 选项）。
   * 无规格模板（或模板全未命中）→ 单条 { key: '', label: '' }，对应后端的「无规格」行。
   */
  _specKeyLabels(item, templates) {
    const idList = Array.isArray(item.specTemplateIds) ? item.specTemplateIds.map(Number) : [];
    const out = [];
    (templates || []).forEach(function (tpl) {
      if (idList.indexOf(Number(tpl.id)) < 0) return;
      extractOptions(tpl.options).forEach(function (opt) {
        out.push({ key: tpl.name + ': ' + opt, label: opt });
      });
    });
    if (!out.length) out.push({ key: '', label: '' });
    return out;
  },

  /**
   * 列表行「剩余可订量」：一次批量查（非逐项/逐规格）。currentCycle 用 breed 级 categoryKey，
   * 与规格弹窗 loadCycles 同口径，保证数字与弹窗一致。失败/尚未算出静默，不显示「剩余 —」。
   */
  loadQuota() {
    const self = this;
    const items = this.data.items || [];
    const campus = this.data.campus;
    if (!campus || !items.length) return;
    const stack = this.data.drillStack;
    const breedSeg = stack.find(function (s) { return s.typeKey === 'ANIMAL_BREED'; });
    const categoryKey = breedSeg ? String(breedSeg.id) : undefined;
    api.fetchCycles(campus, categoryKey).then(function (arr) {
      const cycle = arr && arr.length ? String(arr[0].cycle) : '';
      if (!cycle) return;
      const templates = self.data.specTemplates || [];
      const batchItems = [];
      const rows = [];
      items.forEach(function (it, idx) {
        if (!it.purchasable) return;
        const specs = self._specKeyLabels(it, templates);
        rows.push({ idx: idx, id: it.id, specs: specs });
        specs.forEach(function (s) { batchItems.push({ refDataId: it.id, spec: s.key }); });
      });
      if (!batchItems.length) return;
      return api.fetchQuotaBatch({ items: batchItems, campus: campus, cycle: cycle }).then(function (map) {
        const patch = {};
        rows.forEach(function (r) {
          const segs = [];
          let grey = false;
          r.specs.forEach(function (s) {
            const q = map[String(r.id) + '|' + s.key];
            if (!q) return;   // 后端没回这个规格：跳过
            const label = s.label;
            const avail = q.available == null ? null : Number(q.available);
            if (q.configured === false) {
              grey = true;
              segs.push(label ? label + ' 未配置' : '未配置');
            } else if (avail === 0) {
              segs.push(label ? label + ' 已订满' : '已订满');
            } else if (avail != null && avail > 0) {
              segs.push(label ? label + ' 剩余 ' + avail : '剩余 ' + avail);
            }
            // configured=true 且 available=null = 尚未算出：跳过
          });
          patch['items[' + r.idx + '].quotaText'] = segs.join(' · ');
          patch['items[' + r.idx + '].quotaGrey'] = grey;
        });
        self.setData(patch);
      });
    }).catch(function () { /* 静默：失败不显示，不打断列表 */ });
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
          remark: ci.remark || '',
          deliveryCycle: ci.deliveryCycle || '',
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
      // 周期分区：deliveryCycle 晚于当前周期 = 预约；缺失/为空 = 本周期
      const currentCycle = self.data.currentCycle || '';
      const preLines = [];
      const curLines = [];
      cart.forEach(function (l) {
        l.isPreorder = !!(l.deliveryCycle && currentCycle && String(l.deliveryCycle) > currentCycle);
        if (l.isPreorder) preLines.push(l); else curLines.push(l);
      });
      const preQty = preLines.reduce(function (s, l) { return s + l.qty; }, 0);
      const curQty = curLines.reduce(function (s, l) { return s + l.qty; }, 0);
      // PI 是最终提交人，本人加购的行不必再走「提交给 PI」确认，直接纳入提交范围
      const ready = picker.submittableLines(cart, self.data.isPi, currentUserId);
      const myDraft = cart.filter(function (l) { return l.addedBy === currentUserId && l.packageStatus !== 'READY'; });
      const myReady = cart.filter(function (l) { return l.addedBy === currentUserId && l.packageStatus === 'READY'; });
      const totalQtyByItem = {};
      cart.forEach(function (l) {
        const rid = l.refDataId;
        if (rid == null) return;
        totalQtyByItem[rid] = (totalQtyByItem[rid] || 0) + l.qty;
      });
      self.setData({
        cart: cart,
        cartTree: buildCartTree(self.data.cartTab === 'preorder' ? preLines : curLines, self.data.cartTreeMode),
        cartCount: cartCount,
        cartCurrentCount: curQty,
        cartPreorderCount: preQty,
        cartTotalText: cartHasPrice ? '¥' + cartTotal.toFixed(2) : '',
        readyCount: ready.length,
        myDraftCount: myDraft.length,
        myReadyCount: myReady.length,
        totalQtyByItem: totalQtyByItem,
      });
      // 他人提交挤占周期上限后，收敛超额行（点名规格 + 弹窗提示，不静默改数）
      self._reconcileQuota(cart);
    }).catch(function () { /* 静默 */ });
  },

  loadTimePolicy() {
    const self = this;
    const stack = this.data.drillStack;
    const breedSeg = stack.find(function (s) { return s.typeKey === 'ANIMAL_BREED'; });
    const categoryKey = breedSeg ? String(breedSeg.id) : undefined;
    api.fetchTimePolicy(categoryKey, this.data.campus).then(function (policy) {
      const p = policy || {};
      self.setData({
        timePolicy: p,
        // 后端 nextOpenAt 是带时区的 ISO（2026-09-12T08:00:00+08:00），直接渲染太难看
        nextOpenText: p.nextOpenAt ? beijingTime.formatBeijingDateTimeMinute(p.nextOpenAt) : '',
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
    // 选购统一由卡片右侧的「选择规格」按钮触发（无规格的商品也走同一个抽屉）
  },

  onBuyTap(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.items.find(function (x) { return x.id === id; });
    if (item) this.openSpec(item);
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
          specKey: priceKey,   // 周期库存上限的键（与 specPrices 同构）
          priceText: (priceEnabled && p != null && isFinite(Number(p))) ? '¥' + Number(p).toFixed(2) : (priceEnabled ? '待定' : ''),
        });
      });
    });
    // 无规格模板：同样走这条抽屉路径，顶部给一行「数量」。空 optionLabel 就是「无规格」这个
    // 信号（不写 specSelections / specOptionLabel），与 H5 handleSpecConfirm 的 `entry.optionLabel ?`
    // 同口径 —— 后端据此回退到物品自身的 price。
    if (!rows.length) {
      rows.push({
        key: 'PLAIN',
        templateName: '',
        label: '数量',
        optionLabel: '',
        specKey: '',
        priceText: (priceEnabled && flatPrice != null) ? '¥' + flatPrice.toFixed(2) : (priceEnabled ? '待定' : ''),
      });
    }
    // 领用人候选按需加载（失败不阻塞选购）；领用房间由所选笼位决定，不需要预加载房间树
    if (!this.data.groupMembers.length) this.loadGroupMembers();
    // 领用人默认本人（显式记 id + 名字，便于订单留痕）
    const u = readUserInfo() || {};
    const selfId = u.id != null ? String(u.id) : (u.userId != null ? String(u.userId) : '');
    const selfName = (u.displayName || u.name || '').trim();
    // 进规格弹窗前确认这一单挂在哪个 AUP 下（登记号 · 课题组，与 web 口径一致）。
    // 回调用普通 function，里面没有 this —— 在回调里写 this.data 会抛 TypeError，
    // 而这里一抛，下面那句 setData({ specSheetOpen: true }) 就永远走不到，
    // 表现是「点选择规格毫无反应」（2026-09-23 踩过）。
    const aupId = String(this.data.selectedAupId || '');
    const curAup = (this.data.aups || []).find(function (a) {
      return String(a.id) === aupId;
    }) || null;
    wx.showToast({
      title: '当前AUP：' + (this.data.selectedAupNo || this.data.selectedAupId || '')
        + (curAup && curAup.projectGroupName ? ' · ' + curAup.projectGroupName : ''),
      icon: 'none',
    });
    this.setData({
      specItem: item,
      specOptionRows: rows,
      specQtys: {},
      specRemarks: {},
      specSheetOpen: true,
      specPriceEnabled: priceEnabled,
      specFlatPriceText: priceEnabled ? (flatPrice != null ? '¥' + flatPrice.toFixed(2) : '待定') : '',
      specTotalText: priceEnabled
        ? (rows.length ? '待定' : (flatPrice != null ? '¥' + flatPrice.toFixed(2) : '待定'))
        : '',
      // 每次选购重新选房间；领用人保留上次选择，未选过则默认本人
      pickupRoomId: '',
      pickupRoomName: '',
      pickupMode: 'FARM',
      selectedCycle: '',
      futureCycles: [],
      collectorId: this.data.collectorId || selfId,
      collectorName: this.data.collectorName || selfName,
    });
    // 抽屉里接着选笼位（一笼一规格）：并发拉本课题组笼架 + 可点集
    this.loadCagePicker();
    // 到货周期（本周期/预约）+ 每规格可用量：失败不阻塞选购
    this.loadCycles();
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
    }
    return any ? '¥' + sum.toFixed(2) : '待定';
  },

  closeSpec() {
    const picked = this.data.pickedCages || [];
    // 关抽屉 = 放弃这一轮：把锁住的笼位放掉，否则就是没人管的孤儿预定
    picked.forEach(function (c) {
      if (c && c.reservationId != null) api.releaseCage(c.reservationId).catch(function () {});
    });
    this.setData({
      specSheetOpen: false, specItem: null, specOptionRows: [], specQtys: {},
      specRemarks: {},
      pickedCages: [], cageShelves: [], cageRooms: [], cageCells: {},
      // 分配页/钉子一起清：不清的话下一次开抽屉会停在空的分配列表上
      cageAllocPinned: {}, cageAllocOpen: false, cageAllocRows: [], cageAllocEntry: false,
      cageAllocText: '', cageWarnText: '', cageError: '',
    });
  },

  /** 到货周期（本周期/预约到后续周期）：breed 级 categoryKey 与 loadTimePolicy 同口径；失败不阻塞 */
  loadCycles() {
    const self = this;
    const stack = this.data.drillStack;
    const breedSeg = stack.find(function (s) { return s.typeKey === 'ANIMAL_BREED'; });
    const categoryKey = breedSeg ? String(breedSeg.id) : undefined;
    api.fetchCycles(this.data.campus, categoryKey).then(function (list) {
      const arr = list || [];
      const currentCycle = arr.length ? String(arr[0].cycle) : '';
      const futureCycles = arr.filter(function (c) { return !c.current; }).map(function (c) {
        return { cycle: String(c.cycle || '') };
      });
      self.setData(Object.assign({
        currentCycle: currentCycle, futureCycles: futureCycles, selectedCycle: '',
      }, self._cyclePickerData('', futureCycles)), function () {
        self.loadSpecQuota();
      });
    }).catch(function () {
      // 失败默认本周期，不置灰不设上限（后端提交时权威校验）
      self.setData(Object.assign({ futureCycles: [], selectedCycle: '' }, self._cyclePickerData('', [])));
    });
  },

  /** 每个规格选项在当前周期的可用量：未配上限→置灰禁订；available 有限→步进上限 */
  loadSpecQuota() {
    const self = this;
    const item = this.data.specItem;
    const rows = this.data.specOptionRows || [];
    const cycle = this.data.selectedCycle || this.data.currentCycle || '';
    if (!item || !rows.length || !cycle) return;
    const campus = this.data.campus;
    Promise.all(rows.map(function (r, i) {
      const spec = r.specKey != null ? r.specKey : '';
      return api.fetchQuota({ refDataId: item.id, spec: spec, cycle: cycle, campus: campus })
        .then(function (q) {
          const qi = q || {};
          const configured = qi.configured === true;
          const availNum = Number(qi.available);
          const available = (configured && qi.available != null && isFinite(availNum)) ? availNum : null;
          return { i: i, key: r.key, noQuota: configured === false, available: available };
        })
        .catch(function () {
          return { i: i, key: r.key, noQuota: false, available: null };
        });
    })).then(function (rs) {
      const patch = {};
      const qs = Object.assign({}, self.data.specQtys);
      let dirty = false;
      rs.forEach(function (r) {
        patch['specOptionRows[' + r.i + ']._noQuota'] = r.noQuota;
        patch['specOptionRows[' + r.i + ']._quotaAvail'] = r.available;
        // 上限文案在这里拼好，wxml 只做展示：未配置走另一行提示，取不到（端点失败）不显示
        patch['specOptionRows[' + r.i + ']._quotaText'] = (r.noQuota || r.available == null)
          ? ''
          : (r.available > 0 ? '剩余 ' + r.available : '已订满');
        patch['specOptionRows[' + r.i + ']._quotaOut'] = !r.noQuota && r.available != null && r.available <= 0;
        if (r.noQuota && (qs[r.key] || 0) > 0) { delete qs[r.key]; dirty = true; }
      });
      if (dirty) patch.specQtys = qs;
      self.setData(patch);
      if (dirty) self._recalcSpecTotal();
    });
  },

  /**
   * 到货周期 picker 的选项文案：index 0 = 本周期，其后是未来各周期日期。
   *
   * 本周期也要把日期带出来（`2026-09-24（本周期）`）：光写「本周期」的话，用户没法把它和
   * 卡片上、订单里的具体日期对上，也不知道自己实际订的是哪天。
   *
   * 用 picker 而不是排一排按钮：周期数可配（K 个未来周期），按钮行必然换行、高度不定，
   * 而规格面板里笼位网格要占地方 —— 用户反馈过「抽屉被新增的按钮顶得过高」。
   */
  _cyclePickerData(selected, futureCycles) {
    const cur = this.data.currentCycle || '';
    const labels = [cur ? cur + '（本周期）' : '本周期']
      .concat((futureCycles || []).map(function (c) { return String(c.cycle || ''); }));
    // index 0 恒为「本周期」（selected 为空/'本周期' 都归它），其余按日期找
    let idx = 0;
    const want = selected && selected !== '本周期' ? String(selected) : '';
    if (want) {
      const hit = labels.indexOf(want);
      idx = hit < 0 ? 0 : hit;
    }
    return { cyclePickerLabels: labels, cyclePickerIndex: idx };
  },

  _setCycle(cycle) {
    const p = this._cyclePickerData(cycle, this.data.futureCycles);
    this.setData(Object.assign({ selectedCycle: cycle || '' }, p), function () { this.loadSpecQuota(); });
  },

  onCyclePick(e) {
    const i = Number(e.detail.value) || 0;
    const cycle = i === 0 ? '' : String((this.data.cyclePickerLabels || [])[i] || '');
    if (cycle === this.data.selectedCycle) return;
    this._setCycle(cycle);
  },

  _specRowByKey(key) {
    const rows = this.data.specOptionRows || [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].key === key) return rows[i];
    }
    return null;
  },

  /** 数量变化后刷新合计（setData 回调里调，保证读到最新值） */
  /**
   * 同一规格模板内互斥：某选项已填数量时，同模板其他选项置灰。
   * 典型是「性别」模板的 雌性 / 雄性 —— 一个笼位只能放一种性别，两行都填会导致
   * 锁笼位时只取第一行，第二行永远对不上笼位。与 Web 端 SpecSelectPanel 同规则。
   */
  _specBlocked(key) {
    const tpl = String(key || '').split(':')[0];
    if (!tpl) return false;
    const qs = this.data.specQtys || {};
    const rows = this.data.specOptionRows || [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (String(r.key).split(':')[0] !== tpl) continue;
      if (r.key === key) continue;
      if ((qs[r.key] || 0) > 0) return true;
    }
    return false;
  },

  _recalcSpecTotal() {
    // 互斥置灰随数量变化重算（放在这里，三个数量入口都以它作 setData 回调）
    const actives = {};
    const qs = this.data.specQtys || {};
    const rows = this.data.specOptionRows || [];
    for (let i = 0; i < rows.length; i++) {
      const k = rows[i].key;
      if ((qs[k] || 0) > 0) actives[String(k).split(':')[0]] = k;
    }
    const patch = {};
    for (let j = 0; j < rows.length; j++) {
      const t = String(rows[j].key).split(':')[0];
      patch['specOptionRows[' + j + ']._blocked'] = !!actives[t] && actives[t] !== rows[j].key;
      patch['specOptionRows[' + j + ']._on'] = (qs[rows[j].key] || 0) > 0;
    }
    if (this.data.specPriceEnabled) patch.specTotalText = this._calcSpecTotalText();
    this.setData(patch);
    // 数量一变，每笼分配数与容量提示都要跟着刷
    this.refreshCageMarks();
  },

  /* ---- 笼位选择（一笼一规格）--------------------------------------- */

  /** 当前唯一填了数量的规格选项（一笼一规格，所以最多一个） */
  _activeSpecOption() {
    const rows = this.data.specOptionRows || [];
    const qs = this.data.specQtys || {};
    for (let i = 0; i < rows.length; i += 1) {
      const k = rows[i].key;
      if ((qs[k] || 0) > 0) {
        const r = rows[i];
        // 行自带 optionLabel 时以它为准（无规格的合成行用空串表示「不带规格」）
        return { key: k, label: r.label, optionLabel: r.optionLabel != null ? r.optionLabel : (r.templateName + ': ' + r.label) };
      }
    }
    return null;
  },

  /** 本次要下单的总数量（只有一条路径：当前选项填的数量） */
  _specTotalQty() {
    const opt = this._activeSpecOption();
    return opt ? (Number(this.data.specQtys[opt.key]) || 0) : 0;
  },

  /** 容量上限 = 已选笼位数 x 单笼上限；取走不占笼位，无容量上限（对齐 web 的 cageCap=null → capMax 999） */
  _specCap() {
    if (this.data.pickupMode === 'TAKE') return 999;
    return picker.totalCapacity((this.data.pickedCages || []).length, this.data.cageMaxPerCage);
  },

  /** 填另一个选项时把之前那个清掉：笼位集合只属于一个规格 */
  _keepOnlySpecOption(keepKey) {
    const qs = this.data.specQtys || {};
    const others = Object.keys(qs).filter(function (k) {
      return k !== keepKey && (qs[k] || 0) > 0;
    });
    if (!others.length) return null;
    const next = Object.assign({}, qs);
    others.forEach(function (k) { delete next[k]; });
    return next;
  },

  /** 打开抽屉时拉笼位：本课题组笼架（渲染哪些架）+ 可点集（哪些格能点、单笼上限） */
  loadCagePicker() {
    const self = this;
    const aupRecordId = Number(this.data.selectedAupId);
    if (!aupRecordId) return;
    this.setData({ cageLoading: true, cageError: '', pickedCages: [], cageShelves: [], cageRooms: [], cageCells: {}, cageAllocPinned: {}, cageAllocOpen: false });
    Promise.all([
      api.fetchGroupShelves(self.data.campus),
      api.fetchReservableCages(aupRecordId),
      api.fetchActiveReservations().catch(function () { return []; }),
    ])
      .then(function (r) {
        const rooms = picker.groupShelvesByRoom(r[0] || []);
        const meta = r[1] || {};
        const cells = {};
        (meta.cells || []).forEach(function (c) {
          if (c && c.animalCageId != null) cells[String(c.animalCageId)] = c;
        });
        // 已被订购/预定/在别人购物车的格子：三档标记（与笼架页、卡牌打印共用一份映射）。
        // 抽屉原来只有 reason 文字，在紧凑格子上被截成一条红杠，看不出「已被订购」。
        self._reserveMarks = cageCellVisual.buildReserveMarks(r[2] || []);
        const cap = Number(meta.maxQuantityPerCage);
        self.setData({
          cageRooms: rooms,
          cageTabIdx: 0,
          cageCells: cells,
          cageMaxPerCage: cap > 0 ? cap : 5,
          cageLoading: false,
        });
        self.loadCageShelves(0);
      })
      .catch(function (e) {
        self.setData({ cageLoading: false, cageError: (e && e.message) || '加载笼位失败' });
      });
  },

  /** 拉某房间各架的本地网格（补满 80 格），再标注可点/已选 */
  loadCageShelves(idx) {
    const self = this;
    const room = (this.data.cageRooms || [])[idx];
    if (!room) { this.setData({ cageShelves: [] }); return; }
    this.setData({ cageShelves: [], cageLoading: true });
    Promise.all((room.shelves || []).map(function (sh) {
      const sid = sh && sh.shelveId != null ? String(sh.shelveId) : '';
      if (!sid) return Promise.resolve(null);
      return api.fetchShelfLocalGrid(sid)
        .then(function (data) {
          return {
            shelveId: sid,
            shelveName: (sh && sh.shelveName) || sid,
            // 笼位自带的房间：领用房间跟着笼位走（与 H5 CagePickerPanel 的 PickedCage.roomId 同口径），
            // 用户在抽屉里手选的那个只在没有笼位时兜底。
            roomId: sh && sh.roomId != null ? String(sh.roomId) : '',
            roomName: (sh && sh.roomName) || '',
            grid: cageCellVisual.buildGrid((data && data.grid) || []),
          };
        })
        .catch(function () { return null; });
    })).then(function (rows) {
      const out = [];
      rows.forEach(function (r) { if (r) out.push(r); });
      self.setData({ cageShelves: out, cageLoading: false });
      self.refreshCageMarks();
    });
  },

  /**
   * 只重拉「可点集 + 已被订购标记」，就地重打标记，不重建网格。
   * 用途：锁定笼位失败（多半是别人抢先锁了）后修正那一格的可点性 ——
   * 走 loadCagePicker 会把整块网格卸载重建、房间 tab 归零、滚动位置丢失。
   */
  refreshCageAvailability() {
    const self = this;
    const aupRecordId = Number(this.data.selectedAupId);
    if (!aupRecordId) return;
    return Promise.all([
      api.fetchReservableCages(aupRecordId),
      api.fetchActiveReservations().catch(function () { return []; }),
    ]).then(function (r) {
      const meta = r[0] || {};
      const cells = {};
      (meta.cells || []).forEach(function (c) {
        if (c && c.animalCageId != null) cells[String(c.animalCageId)] = c;
      });
      const cap = Number(meta.maxQuantityPerCage);
      self._reserveMarks = cageCellVisual.buildReserveMarks(r[1] || []);
      self.setData({
        cageCells: cells,
        cageMaxPerCage: cap > 0 ? cap : self.data.cageMaxPerCage,
      });
      self.refreshCageMarks();
    }).catch(function () { /* 刷新失败就维持现状，不打断选购 */ });
  },

  onCageTab(e) {
    const i = parseInt(e.currentTarget.dataset.index, 10);
    const idx = isNaN(i) || i < 0 ? 0 : i;
    this.setData({ cageTabIdx: idx });
    this.loadCageShelves(idx);
  },

  /**
   * 购物车变更（改数量/删行/清空）都会动到笼位预定：删行与清空后端会释放预定、
   * 并把预填进笼位表单的性别数量撤掉。抽屉已经加载过笼位时立刻对一次账 ——
   * 不然「已在购物车」标记与可点池停在旧快照，看起来像笼位还占着。
   * （web 端同一件事在 useReferenceData 里统一 invalidate。）
   */
  syncCageAfterCartChange() {
    if (!this.data.selectedAupId) return;
    if (!(this.data.cageShelves || []).length) return;
    this.refreshCageAvailability();
  },

  /** 点格子（来自 <cage-grid> 的 celltap）：已选 → 释放；未选 → 立即锁 */
  onCageCellTap(e) {
    const self = this;
    if (this.data.cageReserving) return;   // 上一笔还在飞，连点会重复占位
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const shelf = (this.data.cageShelves || [])[Number(ds.si)];
    const idx = Number(e && e.detail && e.detail.index);
    const cell = shelf && (shelf.grid || [])[idx];
    if (!cell) return;
    const cid = cell.id == null ? '' : String(cell.id);
    if (!cid) return;
    const label = cell._displayPosition || cell.position || '';
    const picked = this.data.pickedCages || [];
    const hit = picked.filter(function (x) { return String(x.animalCageId) === cid; })[0];
    if (hit) {
      api.releaseCage(hit.reservationId)
        .then(function () {
          // 释放的笼位顺手把它的手改钉子删掉（与 H5 handleCancel 同口径），不然它下次被选中还带着旧数
          const pins = Object.assign({}, self.data.cageAllocPinned);
          delete pins[cid];
          self.setData({
            pickedCages: picked.filter(function (x) { return String(x.animalCageId) !== cid; }),
            cageAllocPinned: pins,
          });
          self.refreshCageMarks();
        })
        .catch(function (err) { wx.showToast({ title: (err && err.message) || '释放失败', icon: 'none' }); });
      return;
    }
    const meta = this.data.cageCells[cid];
    // 已被订购/他人锁住：标记与可点性必须一致，标了「订」就不许再点。
    // 后端 reservable 是打开抽屉那一刻的快照，中间别人抢先锁走时这里会先拦住。
    const reserved = (this._reserveMarks || {})[cid];
    if (reserved) { wx.showToast({ title: reserved.label, icon: 'none' }); return; }
    if (!meta) { wx.showToast({ title: '该位置没有笼位', icon: 'none' }); return; }
    if (meta.selectable !== true) { wx.showToast({ title: meta.reason || '该笼位不可选', icon: 'none' }); return; }
    if (picker.isSexMismatch(meta.sex, this._specSex())) {
      wx.showToast({ title: '笼位性别与本次规格不符', icon: 'none' });
      return;
    }
    const opt = this._activeSpecOption();
    const body = {
      aupRecordId: Number(this.data.selectedAupId),
      animalCageId: cid,
      refDataId: (this.data.specItem && this.data.specItem.id) || undefined,
      quantity: 0,
    };
    if (opt && opt.optionLabel) body.specOptionLabel = opt.optionLabel;
    this.setData({ cageReserving: true });
    api.reserveCage(body)
      .then(function (r) {
        const next = picked.concat([{
          reservationId: r.id,
          animalCageId: cid,
          label: label,
          shelveId: ds.sid || '',
          shelveName: ds.sname || '',
          // 领用房间跟着笼位：一行一笼一房间，加购时按行下发（与 H5 的 entry.pickupRoomId 同口径）
          roomId: ds.rid != null ? String(ds.rid) : '',
          roomName: ds.rname || '',
        }]);
        self.setData({ pickedCages: next, cageReserving: false });
        self.refreshCageMarks();
      })
      .catch(function (err) {
        self.setData({ cageReserving: false });
        wx.showToast({ title: (err && err.message) || '锁定笼位失败', icon: 'none' });
        // 只刷可点集与标记：loadCagePicker 会把网格整块卸载重建，房间 tab 和滚动位置一起归零
        self.refreshCageAvailability();
      });
  },

  /** 清空笼位：逐个释放 */
  onClearPickedCages() {
    const self = this;
    const picked = this.data.pickedCages || [];
    if (!picked.length) return;
    Promise.all(picked.map(function (x) {
      return api.releaseCage(x.reservationId).catch(function () {});
    })).then(function () {
      self.setData({ pickedCages: [], cageAllocPinned: {}, cageAllocOpen: false });
      self.refreshCageMarks();
      wx.showToast({ title: '已清空笼位', icon: 'none' });
    });
  },

  /* ---- 按顺序分配（照 H5：独立浮层，不换抽屉内容）------------------- */

  /** 点「分配」入口开浮层：默认已按选中顺序自动分好，进去只做微调 */
  onOpenCageAlloc() {
    if (!this.data.cageAllocEntry) return;
    this.setData({ cageAllocOpen: true });
  },

  onCageAllocBack() {
    this.setData({ cageAllocOpen: false });
  },

  /** 钉住某笼的数量：其余笼位自动吸收差额（谁都没分到的，加购时会释放） */
  _pinAlloc(cid, next) {
    const cap = this.data.cageMaxPerCage || 5;
    const pinned = Object.assign({}, this.data.cageAllocPinned);
    pinned[cid] = Math.max(0, Math.min(cap, next));
    this.setData({ cageAllocPinned: pinned });
    this.refreshCageMarks();
  },

  /** 当前生效的分配量（可能是自动分的）：−/+ 都在它上面动，动完就变成钉子 */
  _allocQtyOf(cid) {
    return ((this._allocById || {})[cid]) || 0;
  },

  onAllocDec(e) {
    const cid = String(e.currentTarget.dataset.cid);
    this._pinAlloc(cid, this._allocQtyOf(cid) - 1);
  },

  onAllocInc(e) {
    const cid = String(e.currentTarget.dataset.cid);
    this._pinAlloc(cid, this._allocQtyOf(cid) + 1);
  },

  /**
   * 把「可点性 / 已选 / 每笼分配数」打到当前房间的格子上（路径 setData）。
   *
   * 数量默认按选中顺序自动分（每笼放满上限、末笼拿余数）；用户在「按顺序分配」页手改过的笼位
   * 记在 cageAllocPinned 里当起点，其余笼位自动吸收差额 —— 与 H5 抽屉第二页同一份算法，
   * 容量够就一定让 Σ分配===总数（分不下的余量落 overflow，交给底部提示拦）。
   */
  refreshCageMarks() {
    const self = this;
    const picked = this.data.pickedCages || [];
    const cap = this.data.cageMaxPerCage || 5;
    const total = this._specTotalQty();
    const alloc = picker.allocateInOrder(
      total,
      picked.map(function (x) { return String(x.animalCageId); }),
      cap,
      this.data.cageAllocPinned || {}
    );
    this._allocById = alloc.alloc;
    // 角标只挂在「当前已选」的格子上：被取消掉的那一格先掉角标
    const pickedSet = {};
    picked.forEach(function (x) { pickedSet[String(x.animalCageId)] = true; });
    const sex = this._specSex();
    const patch = {};
    (this.data.cageShelves || []).forEach(function (shelf, si) {
      (shelf.grid || []).forEach(function (cell, ci) {
        const cid = cell.id == null ? '' : String(cell.id);
        const meta = cid ? self.data.cageCells[cid] : null;
        let dis = true;
        let tip = '';
        const sel = cid ? !!pickedSet[cid] : false;
        // 已被订购/预定/在别人购物车：与笼架页、H5 同一个「订」标记。本抽屉刚锁的格子
        // 自己不标（选中环 + 数量角标已经说明），否则会跟 _sel 打架。
        const mark = (!sel && cid) ? (self._reserveMarks || {})[cid] || null : null;
        if (cid && meta) {
          if (mark) {
            dis = true;   // 已标「订」的不给点：可点性跟标记同口径，哪怕后端还说可以
          } else if (meta.selectable !== true) {
            tip = meta.reason || '不可选';
          } else if (picker.isSexMismatch(meta.sex, sex)) {
            tip = '性别不符';
          } else {
            dis = false;
          }
        }
        // 空位不挂原因（它自己有「空」字样），原因只给真正不可点的格子
        patch['cageShelves[' + si + '].grid[' + ci + ']._sel'] = sel;
        patch['cageShelves[' + si + '].grid[' + ci + ']._dis'] = dis;
        patch['cageShelves[' + si + '].grid[' + ci + ']._qty'] = sel ? (alloc.alloc[cid] || 0) : 0;
        patch['cageShelves[' + si + '].grid[' + ci + ']._tip'] = tip;
        patch['cageShelves[' + si + '].grid[' + ci + ']._opMark'] = mark;
      });
    });
    let allocated = 0;
    patch.cageAllocRows = picked.map(function (c, i) {
      const cid = String(c.animalCageId);
      const qty = alloc.alloc[cid] || 0;
      allocated += qty;
      return {
        animalCageId: cid,
        idx: i + 1,
        pos: c.label || '笼位',
        where: [c.roomName, c.shelveName].filter(Boolean).join(' '),
        qty: qty,
      };
    });
    const capNow = picker.totalCapacity(picked.length, cap);
    // 汇总文案：「分配」入口旁边 + 分配浮层标题下都用它
    patch.cageAllocText = '已选 ' + picked.length + ' 笼 · 已分配 ' + allocated + '/' + total;
    patch.cageAllocEntry = picked.length > 0 && total > 0;
    // 笼位删光时浮层里没内容了，自动收起
    if (picked.length === 0 && this.data.cageAllocOpen) patch.cageAllocOpen = false;
    patch.cageWarnText = total > capNow ? ('超出 ' + (total - capNow) + ' 只，请加笼位或减数量') : '';
    // 领用房间默认跟随笼位（与 web 的 CagePickerPanel/entry.pickupRoomId 同口径）：
    // 只剩一个房间就取它，跨房间则留空 id 只显示房名 —— 每行各自带自己的房间，不能合成一个。
    const rooms = this._pickedRooms();
    patch.pickupRoomId = rooms.length === 1 ? rooms[0].id : '';
    patch.pickupRoomName = rooms.map(function (r) { return r.name; }).filter(Boolean).join('、');
    this.setData(patch);
  },

  /** 已选笼位涉及的房间（去重，保序）：[ { id, name } ] */
  _pickedRooms() {
    const out = [];
    const seen = {};
    (this.data.pickedCages || []).forEach(function (c) {
      const id = c && c.roomId ? String(c.roomId) : '';
      const name = (c && c.roomName) || '';
      const key = id || name;
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push({ id: id, name: name || id });
    });
    return out;
  },

  /**
   * 当前规格的性别（从选项文字识别；认不出返回空 = 不拦格子）。
   * 注意不能只认「已填数量」的那个选项：数量要先有笼位才能填，会成死循环——
   * 所以规格只有一个选项时直接用它的字面量。
   */
  _specSex() {
    const opt = this._activeSpecOption();
    if (opt) return picker.sexOfSpecLabel(opt.optionLabel);
    const rows = this.data.specOptionRows || [];
    if (rows.length === 1) return picker.sexOfSpecLabel(rows[0].templateName + ': ' + rows[0].label);
    return '';
  },

  onSpecDec(e) {
    const key = e.currentTarget.dataset.key;
    if (this._specBlocked(key)) return;
    const cur = this.data.specQtys[key] || 0;
    const next = Math.max(0, cur - 1);
    const specQtys = Object.assign({}, this.data.specQtys);
    if (next <= 0) delete specQtys[key];
    else specQtys[key] = next;
    this.setData({ specQtys: specQtys }, this._recalcSpecTotal);
  },

  onSpecInc(e) {
    const key = e.currentTarget.dataset.key;
    if (this._specBlocked(key)) return;
    const row = this._specRowByKey(key);
    if (row && row._noQuota) { wx.showToast({ title: '该规格未配置订购上限，本周期不可订', icon: 'none' }); return; }
    const cap = this._specCap();
    if (cap <= 0) { wx.showToast({ title: '请先在下面选笼位', icon: 'none' }); return; }
    const cur = this.data.specQtys[key] || 0;
    const avail = row ? row._quotaAvail : null;
    if (avail != null && cur >= avail) { wx.showToast({ title: '本周期该规格仅剩 ' + avail + ' 只可订', icon: 'none' }); return; }
    if (cur >= cap) { wx.showToast({ title: '已到容量上限 ' + cap + '：加笼位或减数量', icon: 'none' }); return; }
    // 一笼一规格：填了另一个选项就把之前那个清掉
    const cleared = this._keepOnlySpecOption(key);
    const specQtys = cleared || Object.assign({}, this.data.specQtys);
    specQtys[key] = cur + 1;
    if (cleared) wx.showToast({ title: '一笼一规格：已清掉上一个选项的数量', icon: 'none' });
    this.setData({ specQtys: specQtys }, this._recalcSpecTotal);
  },

  /** 手动输入数量：购物车行（沿用 canEdit 判定） */
  onCartQtyInput(e) {
    const self = this;
    const id = Number(e.currentTarget.dataset.id);
    const line = this.data.cart.find(function (l) { return l.id === id; });
    if (!line || !this._canEditLine(line)) return;
    const raw = String((e.detail && e.detail.value) || '').trim();
    const num = Number(raw);
    if (!raw || !isFinite(num) || num <= 0) {
      api.removeCartItem(id).then(function () { self.loadCart(); }).catch(function () { self.loadCart(); });
      return;
    }
    const next = Math.min(999, Math.floor(num));
    if (next === line.qty) return;
    if (!this._checkCartQuota(line, next)) { self.loadCart(); return; }
    api.updateCartItem(id, { quantity: next }).then(function () { self.loadCart(); })
      .catch(function (err) {
        wx.showToast({ title: (err && err.message) || '更新失败', icon: 'none' });
        self.loadCart();
      });
  },

  /** 手动输入数量：规格弹窗逐规格（本地草稿，不发请求） */
  onSpecQtyInput(e) {
    const key = e.currentTarget.dataset.key;
    if (this._specBlocked(key)) return;
    const row = this._specRowByKey(key);
    if (row && row._noQuota) {
      const specQtys = Object.assign({}, this.data.specQtys);
      delete specQtys[key];
      this.setData({ specQtys: specQtys }, this._recalcSpecTotal);
      wx.showToast({ title: '该规格未配置订购上限，本周期不可订', icon: 'none' });
      return;
    }
    const raw = String((e.detail && e.detail.value) || '').trim();
    const num = Number(raw);
    if (!raw || !isFinite(num) || num <= 0) {
      const specQtys = Object.assign({}, this.data.specQtys);
      delete specQtys[key];
      this.setData({ specQtys: specQtys }, this._recalcSpecTotal);
      return;
    }
    const cap = this._specCap();
    if (cap <= 0) {
      wx.showToast({ title: '请先在下面选笼位', icon: 'none' });
      const specQtys = Object.assign({}, this.data.specQtys);
      delete specQtys[key];
      this.setData({ specQtys: specQtys }, this._recalcSpecTotal);
      return;
    }
    let v = Math.floor(num);
    const avail = row ? row._quotaAvail : null;
    if (avail != null && v > avail) {
      wx.showToast({ title: '本周期该规格仅剩 ' + avail + ' 只可订', icon: 'none' });
      v = avail;
    }
    if (v > cap) {
      wx.showToast({ title: '已到容量上限 ' + cap + '：加笼位或减数量', icon: 'none' });
      v = cap;
    }
    const cleared = this._keepOnlySpecOption(key);
    const specQtys = cleared || Object.assign({}, this.data.specQtys);
    specQtys[key] = v;
    this.setData({ specQtys: specQtys }, this._recalcSpecTotal);
  },

  /** 手动输入数量：规格弹窗·无规格（本地草稿，至少 1） */

  // ── 领用人（领用房间由笼位决定，不再手选）──

  /** 领用人候选（本课题组）；失败不阻塞选购 —— 删房间树那轮把它连带删掉了，openSpec 仍在调它 */
  loadGroupMembers() {
    const self = this;
    api.fetchGroupMembers().then(function (list) {
      self.setData({ groupMembers: list || [] });
    }).catch(function () { self.setData({ groupMembers: [] }); });
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

  onSpecRemarkInput(e) {
    const key = e.currentTarget.dataset.key;
    const specRemarks = Object.assign({}, this.data.specRemarks);
    specRemarks[key] = e.detail.value;
    this.setData({ specRemarks: specRemarks });
  },


  // ── 购物车 ──
  openCartSheet() { this.setData({ cartSheetOpen: true }); },
  // 关购物车只是收起来继续选购，编辑态保留；退出拦截在返回/离开页面那一层
  closeCartSheet() { this.setData({ cartSheetOpen: false }); },

  /** 领用方式切换：取走=不占笼位不选房间（放掉已锁笼位），饲养=回笼位路径重新选 */
  onPickupMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.pickupMode) return;
    if (mode === 'TAKE') {
      const picked = this.data.pickedCages || [];
      picked.forEach(function (c) {
        if (c && c.reservationId != null) api.releaseCage(c.reservationId).catch(function () {});
      });
      this.setData({
        pickupMode: 'TAKE',
        pickedCages: [],
        cageAllocPinned: {},
        cageAllocOpen: false,
        cageAllocRows: [],
        cageAllocEntry: false,
        cageAllocText: '',
        cageWarnText: '',
        cageError: '',
      });
      return;
    }
    this.setData({ pickupMode: 'FARM' });
    this.loadCagePicker();
  },

  /**
   * 取走：不锁笼位，按规格逐行加购。
   * 镜像 frontend/src/features/reference-data/SpecSelectPanel.tsx 的 handleConfirm 非笼位分支
   * （optionLabel 合成、无规格不写 specSelections、带 collector/remark/editingOrderId、无房间无预定）。
   * 小程序无打包通道只能内联，改那边必须同步这里。
   */
  _confirmTakeAway(item) {
    const self = this;
    const rows = (this.data.specOptionRows || []).filter(function (r) {
      return (self.data.specQtys[r.key] || 0) > 0;
    });
    if (!rows.length) {
      wx.showToast({ title: '请先选择规格并填数量', icon: 'none' });
      return;
    }
    const aupRecordId = Number(this.data.selectedAupId);
    this.setData({ submitting: true });
    let chain = Promise.resolve();
    let ok = 0;
    rows.forEach(function (r) {
      const qty = self.data.specQtys[r.key] || 0;
      chain = chain.then(function () {
        // specOptionRows 的真实结构是 { key, templateName, label, priceText }；optionLabel 这个键
        // 只有「无规格」那一行有、值为空串。与 web 同口径：无规格不写 specSelections，
        // 后端据此回退到物品自身的 price。
        const optLabel = (r.optionLabel !== undefined) ? r.optionLabel : (r.templateName + ': ' + r.label);
        const body = {
          refDataId: item.id,
          aupRecordId: aupRecordId,
          quantity: qty,
          // 取走：不占笼位也不选房间，靠这一列让审核页与导出能分辨
          pickupMode: 'TAKE',
        };
        if (self.data.selectedCycle) body.deliveryCycle = self.data.selectedCycle;
        if (optLabel) body.specSelections = { option: optLabel };
        const remark = (self.data.specRemarks[r.key] || '').trim();
        if (remark) body.remark = remark;
        if (self.data.collectorId) body.collectorId = self.data.collectorId;
        if (self.data.collectorName) body.collectorName = self.data.collectorName;
        if (self.data.editOrderId) body.editingOrderId = self.data.editOrderId;
        return api.addToCart(body, self.data.groupId).then(function () { ok += 1; });
      });
    });
    chain
      .then(function () {
        self.setData({
          submitting: false, specSheetOpen: false, specItem: null, specOptionRows: [],
          specQtys: {}, specRemarks: {}, pickupRoomId: '', pickupRoomName: '',
          pickedCages: [], cageShelves: [], cageRooms: [], cageCells: {},
          cageAllocPinned: {}, cageAllocOpen: false, cageAllocRows: [], cageAllocEntry: false,
          cageAllocText: '', cageWarnText: '', cageError: '', pickupMode: 'FARM',
        });
        wx.showToast({ title: '已加入清单（' + ok + ' 项）', icon: 'success' });
        self.loadCart();
      })
      .catch(function (e) {
        self.setData({ submitting: false });
        wx.showToast({ title: (e && e.message) || '加入失败', icon: 'none' });
      });
  },

  // PI 才显示的分组切换；非 PI 固定 AUP→实验员
  /** 加入清单：按笼位逐条（一条购物车行 = 一个笼位），数量按选中顺序铺满 */
  onSpecConfirm(e) {
    const self = this;
    const confirmed = !!(e && e.confirmed);   // 二次进入：上面那条确认弹窗已经点过「继续」
    const item = this.data.specItem;
    if (!item || !this.data.selectedAupId || !this.data.groupId) return;
    // 取走：不占笼位、不选房间，一个规格一行
    if (this.data.pickupMode === 'TAKE') return this._confirmTakeAway(item);
    const picked = this.data.pickedCages || [];
    if (!picked.length) {
      wx.showToast({ title: '请先在下面选笼位（一笼一规格）', icon: 'none' });
      return;
    }
    // 领用房间默认跟随笼位；只有当某格连房间都取不到、也没手选过时才拦
    const lackRoom = picked.filter(function (c) { return !(c.roomId || self.data.pickupRoomId); });
    if (lackRoom.length) {
      wx.showToast({ title: '请选择领用房间', icon: 'none' });
      return;
    }
    const opt = this._activeSpecOption();
    if (!opt) {
      wx.showToast({ title: '请先选择规格并填数量', icon: 'none' });
      return;
    }
    const total = this._specTotalQty();
    if (total <= 0) {
      wx.showToast({ title: '请填写数量', icon: 'none' });
      return;
    }
    const capNow = this._specCap();
    if (total > capNow) {
      wx.showToast({ title: '数量超出笼位容量，请加笼位或减数量', icon: 'none' });
      return;
    }
    // 复检性别（选笼位时可能还没定规格）
    const specSex = this._specSex();
    const sexBad = picked.filter(function (c) {
      const meta = self.data.cageCells[String(c.animalCageId)];
      return !!meta && picker.isSexMismatch(meta.sex, specSex);
    });
    if (sexBad.length) {
      wx.showToast({ title: '有 ' + sexBad.length + ' 个笼位性别与规格不符，请先取消它们', icon: 'none' });
      return;
    }
    // 与刷新角标同一份分配（含用户手改的钉子），不再各自算一遍
    const alloc = picker.allocateInOrder(
      total,
      picked.map(function (c) { return String(c.animalCageId); }),
      this.data.cageMaxPerCage,
      this.data.cageAllocPinned || {}
    ).alloc;

    /**
     * 一只都没分到的笼位 → 加购成功后会被释放（取消预定）。
     * 以前只在成事后 toast 一句「已加入清单（1 笼）」，用户以为选中的笼位都进去了，
     * 别的笼位却被静默清掉 —— 先弹确认，把「哪些会被清」点名说清楚。
     */
    const idleCages = picked.filter(function (c) { return (alloc[String(c.animalCageId)] || 0) <= 0; });
    if (idleCages.length && !confirmed) {
      const all = idleCages.map(function (c) {
        return (c.shelveName ? c.shelveName + ' ' : '') + (c.label || '笼位');
      });
      // showModal 内容长了会截断，只点名前几个，其余用「等」带过
      const names = all.slice(0, 6).join('、') + (all.length > 6 ? ' 等' : '');
      wx.showModal({
        title: idleCages.length + ' 个笼位没分配到老鼠',
        content: '这 ' + idleCages.length + ' 个笼位没分配到老鼠，继续会取消它们的笼位预定：\n'
          + names + '\n\n要留着就返回调整数量，或在分配页给它们分几只。',
        confirmText: '继续',
        cancelText: '返回调整',
        success: function (r) { if (r.confirm) self.onSpecConfirm({ confirmed: true }); },
      });
      return;
    }

    const remark = (this.data.specRemarks[opt.key] || '').trim();
    const aupRecordId = Number(this.data.selectedAupId);
    this.setData({ submitting: true });

    let chain = Promise.resolve();
    let ok = 0;
    const idle = [];   // 一格没分到数量：加购完成后释放，别留孤儿预定
    picked.forEach(function (c) {
      const qty = alloc[String(c.animalCageId)] || 0;
      if (qty <= 0) { idle.push(c); return; }
      chain = chain.then(function () {
        // 一行一笼一房间：房间取该笼位自己的，取不到才回退到抽屉里手选的那个（与 web 同序）
        const body = {
          refDataId: item.id,
          aupRecordId: aupRecordId,
          quantity: qty,
          reservationId: c.reservationId,
          pickupRoomId: c.roomId || self.data.pickupRoomId,
          pickupRoomName: c.roomName || self.data.pickupRoomName,
          // 饲养：房间随笼位带出；显式落一列，审核页与导出据此与取走区分
          pickupMode: 'FARM',
        };
        if (self.data.selectedCycle) body.deliveryCycle = self.data.selectedCycle;
        // 无规格（合成行 optionLabel 为空）不带 specSelections：后端据此回退到物品自身的 price
        if (opt && opt.optionLabel) body.specSelections = { option: opt.optionLabel };
        if (self.data.collectorId) body.collectorId = self.data.collectorId;
        if (self.data.collectorName) body.collectorName = self.data.collectorName;
        if (remark) body.remark = remark;
        if (self.data.editOrderId) body.editingOrderId = self.data.editOrderId;
        return api.addToCart(body, self.data.groupId).then(function () { ok += 1; });
      });
    });

    chain
      .then(function () {
        return Promise.all(idle.map(function (c) {
          return api.releaseCage(c.reservationId).catch(function () {});
        }));
      })
      .then(function () {
        self.setData({
          submitting: false, specSheetOpen: false, specItem: null, specOptionRows: [], specQtys: {},
          specRemarks: {}, pickupRoomId: '', pickupRoomName: '',
          pickedCages: [], cageShelves: [], cageRooms: [], cageCells: {},
          cageAllocPinned: {}, cageAllocOpen: false, cageAllocRows: [], cageAllocEntry: false,
          cageAllocText: '', cageWarnText: '', cageError: '',
        });
        wx.showToast({ title: '已加入清单（' + ok + ' 笼）', icon: 'success' });
        self.loadCart();
      })
      .catch(function (e) {
        // 失败不动抽屉与已锁笼位，用户可改完再试
        self.setData({ submitting: false });
        wx.showToast({ title: (e && e.message) || '加入清单失败', icon: 'none' });
      });
  },

  onCartTreeMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode !== 'aup-user-spec' && mode !== 'spec-user') return;
    this.setData({ cartTreeMode: mode, cartTree: buildCartTree(this._cartTabLines(), mode) });
  },

  onCartTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab !== 'current' && tab !== 'preorder') return;
    this.setData({ cartTab: tab, cartTree: buildCartTree(this._cartTabLines(), this.data.cartTreeMode) });
  },

  /** 当前 tab 下的购物车行（预约 = deliveryCycle 晚于当前周期） */
  _cartTabLines() {
    const currentCycle = this.data.currentCycle || '';
    const tab = this.data.cartTab || 'current';
    return (this.data.cart || []).filter(function (l) {
      const isPre = !!(l.deliveryCycle && currentCycle && String(l.deliveryCycle) > currentCycle);
      return tab === 'preorder' ? isPre : !isPre;
    });
  },

  /**
   * 购物车行的周期上限：一次算清两件事，口径与 web 的 `useCartQuotaConvergence` 完全一致。
   *
   * 1. 把「本行最多可订多少」写回行上（`_quotaMax`），购物车的 + 与手输拿它当闸门 ——
   *    以前购物车只受「单笼上限」约束，周期上限形同虚设，上限 3 也能加到 5。
   * 2. 全组确实超了才收敛，且只削超出部分（点名规格 + 弹窗，不静默改数）。
   *
   * **关键是 `available` 已经把本行算进「已用」了**（`SpecQuotaService.usedQty` 累加的是
   * 全部购物车行 + 未作废订单行）。所以：
   * - 本行天花板 = 本行数量 + 本组余量。直接拿 `available` 当上限就是自己减自己 ——
   *   上限 3 加满 3 会被判「超了」清零、加到 5 会写入 `3 - 5 = -2`，都是这么来的。
   * - 全组可保留总量 = `available + 全组数量`，且**下限取 0**：可用量本身可以是负的
   *   （别人把配额吃到超），负值一旦写回购物车就是负数行。
   */
  _reconcileQuota(lines) {
    const self = this;
    const currentCycle = this.data.currentCycle || '';
    const campus = this.data.campus;
    const seen = this._quotaToastSeen || (this._quotaToastSeen = {});
    const groups = [];
    const byKey = {};
    (lines || []).forEach(function (l, i) {
      const cycle = l.deliveryCycle || currentCycle;
      if (!(l.qty > 0) || !cycle) return;
      const key = [l.refDataId, l.specLabel || '', cycle].join('|');
      if (!byKey[key]) {
        byKey[key] = { refDataId: l.refDataId, spec: l.specLabel || '', cycle: cycle, rows: [] };
        groups.push(byKey[key]);
      }
      byKey[key].rows.push({ index: i, line: l });
    });
    if (!groups.length) return;

    // 同一 (物品, 规格, 周期) 只查一次；全组共用这一次查询算出来的可用量
    Promise.all(groups.map(function (g) {
      return api.fetchQuota({ refDataId: g.refDataId, spec: g.spec, cycle: g.cycle, campus: campus })
        .then(function (q) {
          if (!q || q.configured !== true || q.available == null) return null;
          const avail = Number(q.available);
          if (!isFinite(avail)) return null;
          return { group: g, avail: avail };
        })
        .catch(function () { return null; });
    })).then(function (rs) {
      const patch = {};
      const clamps = [];
      rs.filter(Boolean).forEach(function (r) {
        const g = r.group;
        const groupTotal = g.rows.reduce(function (s, row) { return s + row.line.qty; }, 0);
        const allowedTotal = Math.max(0, r.avail + groupTotal);  // 全组可保留的总量，不为负
        const headroom = Math.max(0, allowedTotal - groupTotal); // 还能再加多少（本行天花板 = 本行数量 + 它）
        let remaining = allowedTotal;
        g.rows.forEach(function (row) {
          const l = row.line;
          const keep = Math.min(l.qty, Math.max(0, remaining));  // 前面的行先占，后面的削
          remaining -= keep;
          // 不能改的行照占配额（上面 groupTotal 已算进去），但**不改写它**——
          // 改了会被服务端「只能修改本人加购的行」挡回来，弹窗还点了别人的名
          if (!self._canEditLine(l)) return;
          patch['cart[' + row.index + ']._quotaMax'] = l.qty + headroom;
          const key = String(l.id);
          if (keep >= l.qty) { delete seen[key]; return; }
          if (seen[key]) return;  // 本事件已收敛过一次，不重复改/弹（提交时后端权威校验）
          seen[key] = true;
          clamps.push({
            id: l.id,
            qty: keep,
            from: l.qty,
            label: (l.itemLabel || '') + (l.specLabel ? ' · ' + l.specLabel : ''),
          });
        });
      });
      self.setData(patch);
      if (!clamps.length) return;
      const msgs = clamps.map(function (c) {
        return c.label + '：' + c.from + ' → ' + c.qty + ' 只';
      });
      wx.showModal({
        title: '数量超出周期可用量，已收敛',
        content: msgs.join('\n'),
        showCancel: false,
      });
      Promise.all(clamps.map(function (c) {
        return api.updateCartItem(c.id, { quantity: c.qty }).catch(function () {});
      })).then(function () {
        self.loadCart();
      });
    });
  },

  /**
   * 购物车行加数量前的周期上限闸门。`_quotaMax` 由 {@link _reconcileQuota} 写入；
   * 还没取到（配额端点失败/未配上限）时不拦 —— 提交时后端仍是权威校验。
   */
  _checkCartQuota(line, nextQty) {
    const max = line._quotaMax;
    if (max == null || nextQty <= max) return true;
    const label = (line.itemLabel || '') + (line.specLabel ? ' · ' + line.specLabel : '');
    wx.showToast({ title: label + ' 本周期最多可订 ' + max + ' 只', icon: 'none' });
    return false;
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
    if (!this._checkCartQuota(line, line.qty + 1)) return;
    this.updateCartQty(id, line.qty + 1);
  },

  updateCartQty(id, qty) {
    const self = this;
    api.updateCartItem(id, { quantity: qty }).then(function () { self.loadCart(); self.syncCageAfterCartChange(); }).catch(function (e) {
      wx.showToast({ title: (e && e.message) || '更新失败', icon: 'none' });
    });
  },

  removeCartLine(id) {
    const self = this;
    api.removeCartItem(id).then(function () { self.loadCart(); self.syncCageAfterCartChange(); }).catch(function (e) {
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
        wx.showToast({ title: self.data.isPi ? '备注已保存' : '已提交给 PI', icon: 'success' });
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
          self.syncCageAfterCartChange();
        }).catch(function (e) { wx.showToast({ title: (e && e.message) || '清空失败', icon: 'none' }); });
      },
    });
  },

  /**
   * 清空本人「加购了但还没提交」的草稿行。任何身份都能用，只删本人的行。
   * 与 onClearCart（组长清整个共享购物车）是两件事：已提交给组长的行（READY）这里不动，
   * 那批已经进了组长的待办，撤销要走「撤回 READY」。
   */
  onClearMyDraft() {
    const self = this;
    if (this.data.editOrderId) { wx.showToast({ title: '编辑模式下不能清空，请先保存或放弃编辑', icon: 'none' }); return; }
    if (!this.data.myDraftCount) { wx.showToast({ title: '没有可清空的草稿行', icon: 'none' }); return; }
    wx.showModal({
      title: '清空我的草稿',
      content: '确认清空本人 ' + this.data.myDraftCount + ' 行未提交的草稿？此操作不可撤销。\n\n已提交给组长的订单包不受影响。',
      success: function (res) {
        if (!res.confirm) return;
        api.clearMyDraftCart(self.data.groupId).then(function () {
          self.loadCart();
          self.syncCageAfterCartChange();
          wx.showToast({ title: '已清空本人草稿', icon: 'success' });
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
    // 可提交行 = READY 的行 + PI 本人加购的行（本人行不必再走「提交给 PI」这一步）。
    // 与 web 的 readyLines 是同一条口径（共用 picker.submittableLines）：只取 READY
    // 会漏掉 PI 自己的草稿行，小程序下的单就比 web 少几行。
    const readyLines = picker.submittableLines(this.data.cart, this.data.isPi, currentUserId);
    if (!readyLines.length) {
      wx.showToast({ title: '没有可提交的行：本人加购的行或已提交给 PI 的行', icon: 'none' });
      return;
    }
    const cartIds = readyLines.map(function (l) { return l.id; });

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
    // 记住这次选择（下次进来直接用它；失效时按上面的白名单校验自动忽略）
    try { wx.setStorageSync('animal_order_aup_id', id); } catch (err) { /* ignore */ }
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
  /**
   * 笼位短串（给屏幕看）。
   *
   * <p>后端那串是「校区 / 房间 / 架 / (x,y)」，例如 `浦东 / 201A / 201A-1 / (3,4)` —— 校区和房间
   * 在相邻列/相邻字段里已经有了，在窄卡片上重复它们纯属占宽。这里优先用**结构化坐标**直接拼
   * 「架 (x,y)」，没有结构化坐标再从串里砍掉前两段；两者都没有返回空串（调用方决定退化显示）。
   */
  _cageShort(l) {
    const loc = l && l.targetCageLocation;
    if (loc && loc.shelveName) {
      const x = loc.positionX != null ? loc.positionX : '';
      const y = loc.positionY != null ? loc.positionY : '';
      return String(loc.shelveName) + ' (' + x + ',' + y + ')';
    }
    const raw = (l && l.targetCageLabel) ? String(l.targetCageLabel).trim() : '';
    if (!raw) return '';
    const parts = raw.split('/').map(function (s) { return s.trim(); }).filter(Boolean);
    return parts.length >= 2 ? parts.slice(-2).join(' ') : raw;
  },

  buildOrderRow(o) {
    const self = this;
    const lines = Array.isArray(o.lines) ? o.lines : [];
    let male = 0, female = 0, total = 0;
    const suppliers = [], strains = [], collectors = [], rooms = [], arrivals = [], cages = [], itemRows = [], remarks = [], lineRows = [];
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
      if (l.pickupMode === 'TAKE') { if (rooms.indexOf('取走') < 0) rooms.push('取走'); }
      else if (l.pickupRoomName && rooms.indexOf(l.pickupRoomName) < 0) rooms.push(l.pickupRoomName);
      // 笼位短串可能为空但已锁位，退化成「已选笼位」而不是漏掉
      const cageShort = self._cageShort(l);
      if (cageShort && cages.indexOf(cageShort) < 0) cages.push(cageShort);
      else if (!cageShort && l.targetAnimalCageId != null && cages.indexOf('已选笼位') < 0) cages.push('已选笼位');
      if (l.arrivalDate && arrivals.indexOf(l.arrivalDate) < 0) arrivals.push(l.arrivalDate);
      if (l.lineRemark) remarks.push(String(l.lineRemark).trim());

      // 表格拆成明细行用：一行一条明细，订单级字段只在首行渲染（flex 表做不了真合并）
      var lbl = n.strain || n.spec || '物品';
      var subParts = [];
      if (n.spec && n.spec !== lbl) subParts.push(n.spec);
      if (opt) subParts.push(opt);
      lineRows.push({
        key: String(l.id != null ? l.id : lineRows.length),
        label: lbl,
        sub: subParts.join(' · '),
        supplier: (n.supplier || '').trim() || '—',
        male: opt.indexOf('雄性') >= 0 ? qty : 0,
        female: opt.indexOf('雌性') >= 0 ? qty : 0,
        qty: qty,
        amountText: l.lineAmount != null ? '¥' + Number(l.lineAmount).toFixed(2) : '—',
        collector: (l.collectorName || '').trim() || '—',
        room: l.pickupMode === 'TAKE' ? '取走' : ((l.pickupRoomName || '').trim() || '—'),
        cage: self._cageShort(l) || '—',
        arrival: (l.arrivalDate || '').trim(),
        deliveryCycle: (l.deliveryCycle || '').trim() || '',
        lineRemark: (l.lineRemark || '').trim() || '—',
      });
    });

    const source = o.source === 'ARO' ? 'ARO' : 'LOCAL';
    const dash = function (arr, join) { return arr.length ? arr.join(join || '、') : '—'; };
    const orderRemark = String(o.submitRemark || '').trim();
    const remark = orderRemark || remarks.join('；');
    // 本地单没有实际到货日，回退显示预计送达；行级到货日沿用同一回退
    const arrivalDate = dash(arrivals) !== '—' ? dash(arrivals) : (o.estimatedDeliveryDate ? '预计 ' + o.estimatedDeliveryDate : '—');
    lineRows.forEach(function (lr) { if (!lr.arrival) lr.arrival = arrivalDate; });
    if (lineRows.length === 0) {
      lineRows.push({ key: 'none', label: '—', sub: '', supplier: '—', male: '—', female: '—', qty: '—',
        amountText: '—', collector: '—', room: '—', cage: '—', arrival: arrivalDate, lineRemark: '—' });
    }
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
      // 卡片收起态：明细压成**一行**。以前每条明细各占一个块，只有 2 条也要两行，
      // 再加「另有 N 项」又是一行 —— 卡片中段一大片空白，读起来也散。
      itemSummary: itemRows.length
        ? itemRows.slice(0, 2).map(function (it) {
            return it.label + (it.spec ? ' · ' + it.spec : '') + ' × ' + it.qty;
          }).join('、') + (itemRows.length > 2 ? ' 等 ' + itemRows.length + ' 项' : '')
        : '—',
      // 表格明细行（订单级字段在首行渲染）：flex 表没有 rowspan，只能首行填、后续留空
      lineRows: lineRows,
      suppliers: dash(suppliers),
      strains: dash(strains),
      maleQty: male,
      femaleQty: female,
      totalQty: total,
      amountText: o.totalAmount != null ? '¥' + Number(o.totalAmount).toFixed(2) : '—',
      aup: String(o.registerNo || '').trim() || (o.aupRecordId != null ? 'AUP#' + o.aupRecordId : '—'),
      collector: dash(collectors),
      room: dash(rooms),
      cage: dash(cages),
      // 本地单没有实际到货日，回退显示预计送达
      arrivalDate: dash(arrivals) !== '—' ? dash(arrivals) : (o.estimatedDeliveryDate ? '预计 ' + o.estimatedDeliveryDate : '—'),
      campus: String(o.campus || '').trim() || String(o.aroAreaName || '').trim() || '—',
      remark: remark || '—',
      // 整单备注单列：表格拆行后「整单备注」与「行备注」分列，这个不再回退拼接行备注
      orderRemark: orderRemark || '—',
      status: o.status,
      statusLabel: ORDER_STATUS_LABELS[o.status] || o.status,
      // 预约单是永久标记（含已完成），不能靠 estimatedDeliveryDate 推断
      isPreorder: !!o.isPreorder,
      // 服务端判定：本人是不是该单提交人（PI）且订单待处理 —— 只有他能进编辑
      editable: !!o.editable,
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

  /** 订单筛选参数：首屏与上拉加载共用一份，否则翻页会翻出不同的结果集 */
  _orderFilter(page) {
    const f = {
      page: page || 1,
      pageSize: ORDER_PAGE_SIZE,
      from: this.data.orderFrom || undefined,
      to: this.data.orderTo || undefined,
      campus: this.data.orderCampus || undefined,
      aup: (this.data.orderAup || '').trim() || undefined,
      supplier: (this.data.orderSupplier || '').trim() || undefined,
      collector: (this.data.orderCollector || '').trim() || undefined,
      remark: (this.data.orderRemark || '').trim() || undefined,
    };
    if (this.data.orderTab === 'pending') f.status = 'PENDING';
    else f.statusNot = 'PENDING';
    return f;
  },

  loadOrders() {
    const self = this;
    if (this.data.orderLoading) return;
    this.setData({ orderLoading: true });
    api.fetchAllOrders(this._orderFilter(1)).then(function (d) {
      const rows = (d.list || []).map(function (o) { return self.buildOrderRow(o); });
      self.setData({
        orderRows: rows,
        orderPage: 1,
        orderTotal: d.total || 0,
        orderLoading: false,
      });
    }).catch(function (e) {
      self.setData({ orderLoading: false });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    });
  },

  /**
   * 触底上拉加载。列表**不设翻页条**（仓库口径：一律 scroll-view 触底加载）。
   * 追加时不动 `orderExpanded`，否则用户展开的卡片会被翻页重置。
   */
  onOrdersScrollToLower() {
    const self = this;
    if (this.data.orderLoading || this.data.orderLoadingMore) return;
    if (this.data.orderRows.length >= this.data.orderTotal) return;
    const next = this.data.orderPage + 1;
    this.setData({ orderLoadingMore: true });
    api.fetchAllOrders(this._orderFilter(next)).then(function (d) {
      const rows = (d.list || []).map(function (o) { return self.buildOrderRow(o); });
      self.setData({
        orderRows: self.data.orderRows.concat(rows),
        orderPage: next,
        orderTotal: d.total || self.data.orderTotal,
        orderLoadingMore: false,
      });
    }).catch(function () { self.setData({ orderLoadingMore: false }); });
  },

  /**
   * 订单记录的数据范围：**列表与导出不用它**（那两个接口服务端自适应），
   * 只有**筛选候选值**需要 —— `/orders/filter-options` 不按身份收窄，普通身份用它就会看到别组的候选值，
   * 所以按身份在「全量候选」与「本课题组候选」之间挑一条。
   *
   * <p>判据与后端 {@code RefOrderAccessPolicy.canSeeAll} 同口径：超管 或 持「业务」标签。
   */
  _resolveOrderScope() {
    const self = this;
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (hasMinRole(role, 'SUPER_ADMIN')) {
      self.setData({ orderScopeAll: true });
      return Promise.resolve(true);
    }
    return personIdentity.fetchMyIdentityCodes().then(function (codes) {
      const all = !!(codes && codes.BUSINESS);
      self.setData({ orderScopeAll: all });
      return all;
    }).catch(function () { return false; });
  },

  loadOrderFilterOptions() {
    const self = this;
    const want = [['supplier', 'supplier_name'], ['aup', 'register_no'], ['collector', 'collector_name']];
    const fetchOptions = self.data.orderScopeAll ? api.fetchOrderFilterOptions : api.fetchMyGroupOrderFilterOptions;
    want.forEach(function (pair) {
      if (self.data.orderFilterOptions[pair[0]]) return;
      fetchOptions(pair[1]).then(function (list) {
        const opts = Array.isArray(list) ? list.filter(Boolean) : [];
        const patch = {};
        patch['orderFilterOptions.' + pair[0]] = opts;
        patch['orderFilterRanges.' + pair[0]] = ['全部'].concat(opts);
        self.setData(patch);
      }).catch(function () { /* 候选失败不影响手输筛选 */ });
    });
  },

  /** 筛选下拉选中：index 0 = 全部（清空该条件） */
  onOrderFilterSelect(e) {
    const key = e.currentTarget.dataset.key;
    const idx = Number(e.detail.value) || 0;
    const range = (this.data.orderFilterRanges && this.data.orderFilterRanges[key]) || [];
    const val = idx > 0 ? String(range[idx] || '') : '';
    const field = { aup: 'orderAup', supplier: 'orderSupplier', collector: 'orderCollector' }[key];
    if (!field) return;
    const patch = {};
    patch[field] = val;
    patch['orderFilterPicks.' + key] = idx;
    this.setData(patch);
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
      orderFilterPicks: { supplier: 0, aup: 0, collector: 0 },
    }, this.loadOrders);
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
      const buf = await orderExportApi.exportOrdersExcel(params);
      const prefix = this.data.orderScopeAll ? '全部课题组订单-' : '我的课题组订单-';
      await springAuth.saveAndOpenDocument(buf, prefix + (params.from || 'all') + '_' + (params.to || 'now') + '.xlsx', 'xlsx');
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
