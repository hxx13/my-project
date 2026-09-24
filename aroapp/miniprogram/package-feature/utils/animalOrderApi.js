/*
 * 动物订购 API 封装（复用 /api/reference-data/* 后端接口）
 * 与 H5 frontend/src/api/domains/referenceData.api.ts 对齐，走 springRequest 鉴权。
 */
const springAuth = require('../../utils/springAuth.js');

// ── 类型树（对齐 H5 typeRegistry.ts）──
const TYPE_REGISTRY = {
  SUPPLIER: { typeKey: 'SUPPLIER', label: '供应商', childType: 'ANIMAL_BREED', hasPurchasable: false },
  ANIMAL_BREED: { typeKey: 'ANIMAL_BREED', label: '品种', parentType: 'SUPPLIER', childType: 'ANIMAL_STRAIN', hasPurchasable: false },
  ANIMAL_STRAIN: { typeKey: 'ANIMAL_STRAIN', label: '品系', parentType: 'ANIMAL_BREED', childType: 'GENOTYPE', hasPurchasable: true },
  GENOTYPE: { typeKey: 'GENOTYPE', label: '规格', parentType: 'ANIMAL_STRAIN', hasPurchasable: true },
};

function getTypeConfig(typeKey) {
  return TYPE_REGISTRY[typeKey] || null;
}

/** 解析统一响应 { code, success, message, data } */
function parseResponse(res) {
  const { statusCode, data } = res || {};
  let body = data;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = { success: false, message: body || '响应解析失败' }; }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || `请求失败(${statusCode})` };
  }
  return { ok: true, body };
}

function withQuery(path, params) {
  const keys = Object.keys(params || {}).filter(function (k) {
    const v = params[k];
    return v !== undefined && v !== null && v !== '';
  });
  if (!keys.length) return path;
  const qs = keys.map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  return path + '?' + qs;
}

function normalizeFieldData(item) {
  if (!item) return item;
  if (typeof item.fieldData === 'string') {
    try { item.fieldData = JSON.parse(item.fieldData); } catch (e) { /* keep */ }
  }
  return item;
}

function normalizeList(list) {
  return (list || []).map(normalizeFieldData);
}

// ── 参考数据树 ──
function listByType(typeKey, parentId) {
  const url = withQuery('/api/reference-data/' + encodeURIComponent(typeKey), { parentId: parentId });
  return springAuth.springRequest({ url: url, method: 'GET', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return normalizeList(p.body.data || []);
  });
}

function listSpecTemplates() {
  return springAuth.springRequest({ url: '/api/reference-data/spec-templates', method: 'GET', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data || [];
  });
}

// ── 已批准 AUP ──
function fetchApprovedAups() {
  return springAuth.springRequest({ url: '/api/aup/approved-for-order', method: 'GET', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data || [];
  });
}

/** 当前登录用户 AUP 角色（组长/秘书/专家） */
function fetchMyRoles() {
  return springAuth.springRequest({ url: '/api/aup/my-roles', method: 'GET', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data || { isPi: false };
  });
}

/** 领用人候选：仅本人课题组（服务端不接受课题组参数） */
function fetchGroupMembers() {
  return springAuth.springRequest({ url: '/api/reference-data/group-members', method: 'GET', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data || [];
  });
}

/** 到货周期：返回 [{ cycle: "yyyy-MM-dd", current }]，首项为当前周期。categoryKey 可空（跨品种默认周期） */
/**
 * 到货周期列表 → [{ cycle: 'yyyy-MM-dd', current: bool }]，第 1 个是当前周期。
 *
 * **必须在这里归一**：后端回的是 `{ current, cycles: [...] }`（对象，不是数组），
 * 早先原样返回，页面拿到后调 `.filter` 直接抛 —— 而异常被 catch 吞成「无未来周期」，
 * 表现是 picker 里只剩「本周期」、预约功能静默失效。契约不符只改这一处。
 */
function fetchCycles(campus, categoryKey) {
  const url = withQuery('/api/reference-data/cycles', { campus: campus, categoryKey: categoryKey });
  return springAuth.springRequest({ url: url, method: 'GET', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    const d = p.body.data;
    if (Array.isArray(d)) return d;
    const list = (d && Array.isArray(d.cycles)) ? d.cycles : [];
    const current = (d && d.current) || list[0] || '';
    return list.map(function (c) { return { cycle: c, current: c === current }; });
  });
}

/** 某规格在某周期的可用量：{ configured, cap, used, available }。configured=false=未配上限，available=null=尚未算出 */
function fetchQuota(params) {
  const url = withQuery('/api/reference-data/quota', {
    refDataId: (params && params.refDataId),
    spec: (params && params.spec),
    cycle: (params && params.cycle),
    campus: (params && params.campus),
  });
  return springAuth.springRequest({ url: url, method: 'GET', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data || null;
  });
}

/** 批量查各规格在当前周期的可用量（一次请求带全列表，不逐项/逐规格）。
 *  POST body { items:[{refDataId,spec}], campus, cycle } → { "refDataId|spec": { configured, cap, used, available } }。
 *  spec 空 = 无规格行；configured=false=未配上限；available=null=尚未算出（别当 0 或未配置）。 */
function fetchQuotaBatch(body) {
  return springAuth.springRequest({ url: '/api/reference-data/quota/batch', method: 'POST', data: body || {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data || {};
  });
}

// ── 购物车（服务端共享，非本地 storage）──
function fetchCart(groupId) {  const url = withQuery('/api/reference-data/cart', { groupId: groupId });
  return springAuth.springRequest({ url: url, method: 'GET', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data || [];
  });
}

function addToCart(body, groupId) {
  const url = withQuery('/api/reference-data/cart', { groupId: groupId });
  return springAuth.springRequest({ url: url, method: 'POST', data: body }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data;
  });
}

function updateCartItem(id, body) {
  return springAuth.springRequest({ url: '/api/reference-data/cart/' + id, method: 'PUT', data: body }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data;
  });
}

function removeCartItem(id) {
  return springAuth.springRequest({ url: '/api/reference-data/cart/' + id, method: 'DELETE', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data;
  });
}

function clearCart(groupId) {
  const url = withQuery('/api/reference-data/cart', { groupId: groupId });
  return springAuth.springRequest({ url: url, method: 'DELETE', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data;
  });
}

/** 清空本人「加购了但还没提交」的草稿行（READY 的不动）——任何身份可用，只作用于本人的行 */
function clearMyDraftCart(groupId) {
  const url = withQuery('/api/reference-data/cart/my-draft', { groupId: groupId });
  return springAuth.springRequest({ url: url, method: 'DELETE', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data;
  });
}

function markPackageReady(groupId, body) {
  const url = withQuery('/api/reference-data/cart/package-ready', { groupId: groupId });
  return springAuth.springRequest({ url: url, method: 'POST', data: body || {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data || [];
  });
}

function withdrawPackage(groupId) {
  const url = withQuery('/api/reference-data/cart/package-draft', { groupId: groupId });
  return springAuth.springRequest({ url: url, method: 'POST', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data || [];
  });
}

// ── 下单 / 订单 ──
function submitOrder(body) {
  return springAuth.springRequest({ url: '/api/reference-data/orders', method: 'POST', data: body }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data;
  });
}

function fetchOrders(groupId) {
  const url = withQuery('/api/reference-data/orders', { groupId: groupId });
  return springAuth.springRequest({ url: url, method: 'GET', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data || [];
  });
}

/**
 * 订单记录列表。走 `/orders/all` —— 它是**服务端自适应**的（ReferenceDataController.listAllOrders）：
 * 业务标签/超管拿到**全量订单**，其余身份由服务端强制收窄到本人课题组（客户端传的课题组一律被覆盖）。
 *
 * <p>所以这里**不需要前端判身份**，也不存在「传了别人的课题组就能看到别人单子」的口子；
 * 与 Web 审核页管理端走的是同一个接口。别改回 `/orders/my-group` —— 那条路会把超管也锁在本组。
 *
 * <p>支持 page/pageSize + 全字段筛选（status/statusNot/from/to/…），返回 { list, total }。
 */
function fetchAllOrders(params) {
  const url = withQuery('/api/reference-data/orders/all', params || {});
  return springAuth.springRequest({ url: url, method: 'GET', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    const d = p.body.data || {};
    return { list: Array.isArray(d.list) ? d.list : [], total: Number(d.total || 0) };
  });
}

/** 全量筛选候选（供应商/品系/领用人/房间）。**只有超管/业务该用**：它不按身份收窄，
 *  普通身份用它会看到别组的候选值。普通身份请用 fetchMyGroupOrderFilterOptions。 */
function fetchOrderFilterOptions(column) {
  const url = withQuery('/api/reference-data/orders/filter-options', { column: column });
  return springAuth.springRequest({ url: url, method: 'GET', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data || [];
  });
}

/** 筛选下拉候选，范围由服务端限定在本课题组（不给全量候选，避免泄露别组信息） */
function fetchMyGroupOrderFilterOptions(column) {
  const url = withQuery('/api/reference-data/orders/my-group/filter-options', { column: column });
  return springAuth.springRequest({ url: url, method: 'GET', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data || [];
  });
}

// ── 待处理订单编辑：回填购物车 → 改 → 保存回原单 ──

/** 把待处理订单回填到购物车（幂等，重入先清旧回填行） */
function loadOrderToCart(orderId) {
  return springAuth.springRequest({ url: '/api/reference-data/orders/' + orderId + '/edit/load', method: 'POST', data: {} })
    .then(function (res) {
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      return p.body.data || [];
    });
}

/** 放弃编辑：只清回填行，原单不受影响 */
function discardOrderEdit(orderId) {
  return springAuth.springRequest({ url: '/api/reference-data/orders/' + orderId + '/edit', method: 'DELETE', data: {} })
    .then(function (res) {
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      return true;
    });
}

/** 保存编辑：用回填内容整体替换原单明细，单号与状态不变 */
function applyOrderEdit(orderId) {
  return springAuth.springRequest({ url: '/api/reference-data/orders/' + orderId + '/edit', method: 'PUT', data: {} })
    .then(function (res) {
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      return p.body.data;
    });
}

// ── 时间窗口 ──
function fetchTimePolicy(categoryKey, campus) {
  const url = withQuery('/api/animal-order/time-policy', { categoryKey: categoryKey, campus: campus });
  return springAuth.springRequest({ url: url, method: 'GET', data: {} }).then(function (res) {
    const p = parseResponse(res);
    if (!p.ok) throw new Error(p.message);
    return p.body.data || null;
  });
}

/** 共享购物车 groupId：pg-{projectGroupId}，否则 pg-name-{归一化课题组名} */
function resolveGroupId(projectGroupId, projectGroupName) {
  if (projectGroupId != null && projectGroupId !== '' && isFinite(Number(projectGroupId))) {
    return 'pg-' + Number(projectGroupId);
  }
  const name = (projectGroupName || '').trim();
  if (!name) return '';
  return 'pg-name-' + name.replace(/\s+/g, '_');
}

/* ---- 订购选笼位（笼位预定）------------------------------------------
   链路照 web：点格子即锁（POST 建 reservation）→ 加购时把 reservationId 带进购物车行。
   竞态由后端 active_cage_id 唯一索引保证，前端不做「先查后插」。 */

/**
 * 本课题组占用的笼架：抽屉渲染哪些架子由它决定，与 AUP 无关。
 * campus（浦东/浦西）非空时只给本校区的 —— 本课题组的架子可能横跨两个校区，
 * 不过滤就会在浦东的单子里选到浦西的笼位。
 */
function fetchGroupShelves(campus) {
  const url = withQuery('/api/animal-order/cage-reservations/group-shelves', { campus: campus || undefined });
  return springAuth.springRequest({ url: url, method: 'GET', data: {} })
    .then(function (res) {
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      return p.body.data || [];
    });
}

/** 该 AUP 名下可点的笼位 + 单笼数量上限（maxQuantityPerCage） */
function fetchReservableCages(aupRecordId) {
  const url = withQuery('/api/animal-order/cage-reservations/reservable', { aupRecordId: aupRecordId });
  return springAuth.springRequest({ url: url, method: 'GET', data: {} })
    .then(function (res) {
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      return p.body.data || {};
    });
}

/**
 * 全部活跃预定（不分人）。网格上给「已被订购/预定」的格子打标记用 ——
 * 笼架页与 H5 都读这份数据，抽屉要标同一套东西就不能只靠 reservable 的 reason 文字。
 * 返回：{ reservationId, animalCageId, reserverName, quantity, orderId, cartId }
 */
function fetchActiveReservations() {
  const url = '/api/animal-order/cage-reservations/active';
  return springAuth.springRequest({ url: url, method: 'GET', data: {} })
    .then(function (res) {
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      return p.body.data || [];
    });
}

/** 锁一个笼位：点格子即调用，quantity 先传 0（等规格数量定了再加购） */
function reserveCage(body) {
  return springAuth.springRequest({ url: '/api/animal-order/cage-reservations', method: 'POST', data: body || {} })
    .then(function (res) {
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      return p.body.data || {};
    });
}

/** 某架的本地网格（每格带 animalCageId）：选笼位抽屉渲染用 */
function fetchShelfLocalGrid(shelveId) {
  const url = '/api/cage-cell-index/local-grid/by-shelve/' + encodeURIComponent(String(shelveId));
  return springAuth.springRequest({ url: url, method: 'GET', data: {} })
    .then(function (res) {
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      return p.body.data || {};
    });
}

/** 释放预定（取消选中该笼位 / 清空全部） */
function releaseCage(id) {
  const url = '/api/animal-order/cage-reservations/' + encodeURIComponent(String(id)) + '/release';
  return springAuth.springRequest({ url: url, method: 'POST', data: {} })
    .then(function (res) {
      const p = parseResponse(res);
      if (!p.ok) throw new Error(p.message);
      return p.body.data || {};
    });
}

module.exports = {
  TYPE_REGISTRY,
  getTypeConfig,
  parseResponse,
  normalizeFieldData,
  listByType,
  listSpecTemplates,
  fetchApprovedAups,
  fetchMyRoles,
  fetchGroupMembers,
  fetchCycles,
  fetchQuota,
  fetchQuotaBatch,
  fetchCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  clearMyDraftCart,
  markPackageReady,
  withdrawPackage,
  submitOrder,
  fetchOrders,
  fetchAllOrders,
  fetchOrderFilterOptions,
  fetchMyGroupOrderFilterOptions,
  loadOrderToCart,
  discardOrderEdit,
  applyOrderEdit,
  fetchTimePolicy,
  resolveGroupId,
  fetchGroupShelves,
  fetchReservableCages,
  fetchActiveReservations,
  reserveCage,
  releaseCage,
  fetchShelfLocalGrid,
};
