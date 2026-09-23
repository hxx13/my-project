const springAuth = require('../../utils/springAuth.js');

const CART_STORAGE_VER = 'aroapp_material_cart_v1';

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

function cartStorageKey() {
  return `${CART_STORAGE_VER}_${readSpringUserId() || 'local'}`;
}

function loadLocalCart() {
  try {
    const raw = wx.getStorageSync(cartStorageKey());
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

function persistLocalCart(cart) {
  try {
    wx.setStorageSync(cartStorageKey(), cart || {});
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

function resolveApplicantGroup() {
  try {
    const raw = wx.getStorageSync(springAuth.KEYS.USER_INFO);
    if (!raw) return undefined;
    const u = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const dept = u && (u.departmentName != null ? u.departmentName : u.department_name);
    const s = dept != null ? String(dept).trim() : '';
    return s || undefined;
  } catch (e) {
    return undefined;
  }
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

function decorateRequestLines(lines) {
  return (lines || []).map((l) => {
    const name = l.snapshotName != null ? String(l.snapshotName) : '';
    const ch = name.trim().charAt(0) || '?';
    return {
      ...l,
      coverAbsUrl: springAuth.toAbsoluteMediaUrl(l.coverUrl),
      nameInitial: ch,
    };
  });
}

async function fetchRemoteCart() {
  const res = await springAuth.springRequest({ url: '/api/material/cart', method: 'GET', data: {} });
  const p = parseResponse(res);
  if (!p.ok) return null;
  const lines = (p.body.data && p.body.data.lines) || {};
  return mergeRemoteCartLines(lines);
}

async function saveRemoteCart(cart) {
  const lines = {};
  Object.keys(cart || {}).forEach((k) => {
    const qty = cart[k];
    if (!Number.isFinite(qty) || qty <= 0) return;
    lines[k] = Math.min(Math.floor(qty), 999);
  });
  const res = await springAuth.springRequest({ url: '/api/material/cart', method: 'PUT', data: { lines } });
  return parseResponse(res).ok;
}

function parseSpecCartKey(key) {
  if (!key || !key.includes('::')) return { itemId: Number(key), specLabel: '', specSnapshot: null };
  const [idStr, specStr] = key.split('::');
  const pairs = specStr.split('|').map(function (p) { return p.split('='); });
  const specLabel = pairs.map(function (p) { return p[1]; }).join('·');
  var specSnapshot = {};
  pairs.forEach(function (p) { specSnapshot[p[0]] = p[1]; });
  return { itemId: Number(idStr), specLabel: specLabel, specSnapshot: specSnapshot };
}

function itemIdFromCartKey(key) {
  if (!key) return 0;
  if (key.includes('::')) return Number(key.split('::')[0]);
  return Number(key);
}

function formatSpecLabel(specJson) {
  if (!specJson) return '';
  try {
    var obj = typeof specJson === 'string' ? JSON.parse(specJson) : specJson;
    return Object.values(obj).join('·');
  } catch (e) {
    return '';
  }
}

function buildCartLines(cart, items) {
  var out = [];
  Object.keys(cart || {}).forEach(function (k) {
    var qty = cart[k] || 0;
    if (qty <= 0) return;
    var parsed = parseSpecCartKey(k);
    var it = (items || []).find(function (x) { return x.id === parsed.itemId; });
    out.push({
      id: k,
      itemId: parsed.itemId,
      name: it ? it.name : '物品',
      coverAbsUrl: it ? it.coverAbsUrl : '',
      nameInitial: it ? it.nameInitial : '?',
      qty: qty,
      specLabel: parsed.specLabel,
      specSnapshot: parsed.specSnapshot,
    });
  });
  return out;
}

function stockLineText(item) {
  if (!item) return '';
  if (item.stockMode === 'UNLIMITED') return '无限';
  if (item.stockMode === 'FLAG') return Number(item.stockQty) >= 1 ? '有货' : '缺货';
  if (item.showStockQty === 0) return '有货';
  return `库存 ${item.stockQty != null ? item.stockQty : 0}`;
}

const REQUEST_STATUS_ZH = {
  DRAFT: '草稿',
  PENDING: '待审核',
  FIRST_OK: '初审通过',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  FULFILLED: '待领取',
  RECEIVED: '已完成',
};

function requestStatusText(s) {
  const key = String(s || '').toUpperCase();
  return REQUEST_STATUS_ZH[key] || s || '-';
}

function toTime(v) {
  if (!v) return '-';
  return String(v).replace('T', ' ').slice(0, 16);
}

async function submitRequest(lines, applicantGroup, scheduledPickupTime) {
  const payload = { lines: lines };
  if (applicantGroup) payload.applicantGroup = applicantGroup;
  if (scheduledPickupTime != null && scheduledPickupTime !== '') {
    payload.scheduledPickupTime = scheduledPickupTime;
  }
  const res = await springAuth.springRequest({
    url: '/api/material/requests',
    method: 'POST',
    data: payload,
  });
  return parseResponse(res);
}

module.exports = {
  parseResponse: parseResponse,
  loadLocalCart: loadLocalCart,
  persistLocalCart: persistLocalCart,
  cartTotalQty: cartTotalQty,
  fetchRemoteCart: fetchRemoteCart,
  saveRemoteCart: saveRemoteCart,
  buildCartLines: buildCartLines,
  decorateItems: decorateItems,
  decorateRequestLines: decorateRequestLines,
  resolveApplicantGroup: resolveApplicantGroup,
  stockLineText: stockLineText,
  requestStatusText: requestStatusText,
  toTime: toTime,
  formatSpecLabel: formatSpecLabel,
  itemIdFromCartKey: itemIdFromCartKey,
  parseSpecCartKey: parseSpecCartKey,
  submitRequest: submitRequest,
};
