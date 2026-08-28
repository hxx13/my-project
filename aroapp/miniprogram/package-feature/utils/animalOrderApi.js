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

// ── 购物车（服务端共享，非本地 storage）──
function fetchCart(groupId) {
  const url = withQuery('/api/reference-data/cart', { groupId: groupId });
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

// ── 时间窗口 ──
function fetchTimePolicy(categoryKey) {
  const url = withQuery('/api/animal-order/time-policy', { categoryKey: categoryKey });
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

module.exports = {
  TYPE_REGISTRY,
  getTypeConfig,
  parseResponse,
  normalizeFieldData,
  listByType,
  listSpecTemplates,
  fetchApprovedAups,
  fetchMyRoles,
  fetchCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  markPackageReady,
  withdrawPackage,
  submitOrder,
  fetchOrders,
  fetchTimePolicy,
  resolveGroupId,
};
