/**
 * 视频上墙：小程序端接口封装。
 *
 * 复用后台同一套接口（/api/v1/dahua/tvwall/**，登录即可用），不另开后门。
 * 上墙方案 XML 的拼装、按屏下发、预设读写全封在服务端，这里只做业务调用。
 *
 * 惯例：springRequest 业务失败是 **resolve**，所以每个函数都过 parseSpringResult
 * 强制校验 success，失败 throw，由页面 catch 后 toast。
 */
const springAuth = require('../../utils/springAuth.js');

const BASE = '/api/v1/dahua/tvwall';

function parseSpringResult(res) {
  const statusCode = Number(res && res.statusCode);
  let body = res ? res.data : null;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false, message: body || '响应解析失败' };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限访问' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || `请求失败(${statusCode || 0})` };
  }
  return { ok: true, data: body.data };
}

async function call(url, method, data) {
  const res = await springAuth.springRequest({ url: BASE + url, method: method || 'GET', data: data || {} });
  const p = parseSpringResult(res);
  if (!p.ok) {
    throw new Error(p.message || '请求失败');
  }
  return p.data;
}

// ---------------------------------------------------------------- 查询

async function listWalls() {
  const d = await call('/list', 'GET');
  return Array.isArray(d) ? d : [];
}

/** 墙详情：screens 是物理屏（双屏墙就是两块），画布要按它画 */
async function getWall(tvWallId) {
  return call('/detail?tvWallId=' + encodeURIComponent(tvWallId), 'GET');
}

async function listChannels() {
  const d = await call('/channels', 'GET');
  return Array.isArray(d) ? d : [];
}

async function listTasks(tvWallId) {
  const d = await call('/tasks?tvWallId=' + encodeURIComponent(tvWallId), 'GET');
  return Array.isArray(d) ? d : [];
}

/** 预设详情：screens 里每个窗口都带自己的矩形，预览照它还原 */
async function getTask(tvWallId, taskId) {
  return call(
    '/task?tvWallId=' + encodeURIComponent(tvWallId) + '&taskId=' + encodeURIComponent(taskId),
    'GET'
  );
}

// ---------------------------------------------------------------- 操作

function applyTask(tvWallId, taskId) {
  return call('/apply', 'POST', { tvWallId: tvWallId, taskId: taskId });
}

/** 按屏上墙；screens = [{screenId, splitNum, windows:[{index, channelCode, channelName, left, top, width, height}]}] */
function pushLayout(tvWallId, screens) {
  return call('/layout', 'POST', { tvWallId: tvWallId, screens: screens });
}

function savePreset(tvWallId, taskId, taskName, screens) {
  return call('/preset/save', 'POST', {
    tvWallId: tvWallId,
    taskId: taskId || null,
    taskName: taskName,
    screens: screens,
  });
}

/** 重命名预设：保留方案内容，只换名字（后端按同一 taskId 重新保存） */
function renamePreset(tvWallId, taskId, taskName) {
  return call('/preset/rename', 'POST', { tvWallId: tvWallId, taskId: taskId, taskName: taskName });
}

function deletePreset(tvWallId, taskId) {
  return call('/preset/delete', 'POST', { tvWallId: tvWallId, taskId: taskId });
}

// ---------------------------------------------------------------- 参观模式的预设队列

/** 这面墙的参观顺序（预设 id 数组，顺序即播放顺序） */
async function listTour(tvWallId) {
  const d = await call('/tour?tvWallId=' + encodeURIComponent(tvWallId), 'GET');
  return Array.isArray(d) ? d : [];
}

/** 整队替换：taskIds 的顺序就是参观顺序 */
function saveTour(tvWallId, taskIds) {
  return call('/tour', 'PUT', { tvWallId: tvWallId, taskIds: taskIds || [] });
}

// ---------------------------------------------------------------- 通道分类树（独立于门禁那套备注分类）

async function listCategories() {
  const d = await call('/categories', 'GET');
  return Array.isArray(d) ? d : [];
}

function createCategory(parentId, name) {
  return call('/categories', 'POST', { parentId: parentId, name: name });
}

function renameCategory(id, name) {
  return call('/categories/' + id, 'PUT', { name: name });
}

function deleteCategory(id) {
  return call('/categories/' + id, 'DELETE');
}

/** categoryId 传 null = 移出到「未分类」 */
function assignChannelCategory(id, categoryId) {
  return call('/channels/' + id + '/category', 'PATCH', { categoryId: categoryId });
}

// ---------------------------------------------------------------- 小工具

/** 扁平节点拼成树，并按 sortOrder 排 */
function buildTree(flat) {
  const byId = {};
  const roots = [];
  (flat || []).forEach(function (n) {
    byId[n.id] = Object.assign({}, n, { children: [] });
  });
  (flat || []).forEach(function (n) {
    const self = byId[n.id];
    if (!self) return;
    const parent = n.parentId ? byId[n.parentId] : null;
    if (parent) parent.children.push(self);
    else roots.push(self);
  });
  const sortRec = function (list) {
    list.sort(function (a, b) {
      return (a.sortOrder || 0) - (b.sortOrder || 0) || a.id - b.id;
    });
    list.forEach(function (n) {
      sortRec(n.children);
    });
  };
  sortRec(roots);
  return roots;
}

/** 常用切分：均分走 gridRects；非均分直接写死矩形（与后台/网页端同一套口径） */
function gridRects(cols, rows) {
  const out = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      out.push({
        left: (c * 100) / cols,
        top: (r * 100) / rows,
        width: 100 / cols,
        height: 100 / rows,
      });
    }
  }
  return out;
}

const LAYOUTS = [
  { key: '1', label: '单画面', rects: gridRects(1, 1) },
  { key: '4', label: '4 格', rects: gridRects(2, 2) },
  {
    key: '5',
    label: '5 格（左1右4）',
    rects: [
      { left: 0, top: 0, width: 50, height: 100 },
      { left: 50, top: 0, width: 25, height: 50 },
      { left: 75, top: 0, width: 25, height: 50 },
      { left: 50, top: 50, width: 25, height: 50 },
      { left: 75, top: 50, width: 25, height: 50 },
    ],
  },
  { key: '6', label: '6 格', rects: gridRects(3, 2) },
  { key: '8', label: '8 格', rects: gridRects(4, 2) },
  { key: '9', label: '9 格', rects: gridRects(3, 3) },
  { key: '16', label: '16 格', rects: gridRects(4, 4) },
  { key: '36', label: '36 格', rects: gridRects(6, 6) },
  {
    key: 'bigLeft',
    label: '左大右小',
    rects: [
      { left: 0, top: 0, width: 60, height: 100 },
      { left: 60, top: 0, width: 20, height: 50 },
      { left: 80, top: 0, width: 20, height: 50 },
      { left: 60, top: 50, width: 20, height: 50 },
      { left: 80, top: 50, width: 20, height: 50 },
    ],
  },
  {
    key: 'bigTop',
    label: '上大下小',
    rects: [
      { left: 0, top: 0, width: 100, height: 60 },
      { left: 0, top: 60, width: 25, height: 40 },
      { left: 25, top: 60, width: 25, height: 40 },
      { left: 50, top: 60, width: 25, height: 40 },
      { left: 75, top: 60, width: 25, height: 40 },
    ],
  },
];

const DEFAULT_LAYOUT = LAYOUTS[0];

function layoutByKey(key) {
  for (let i = 0; i < LAYOUTS.length; i += 1) {
    if (LAYOUTS[i].key === key) return LAYOUTS[i];
  }
  return null;
}

/** 两个矩形是不是同一个位置（百分比，容忍浮点误差） */
function sameRect(a, b) {
  if (!a || !b) return false;
  return (
    Math.abs(a.left - b.left) < 0.05 &&
    Math.abs(a.top - b.top) < 0.05 &&
    Math.abs(a.width - b.width) < 0.05 &&
    Math.abs(a.height - b.height) < 0.05
  );
}

/** 矩形完全一样才算同一个布局 */
function layoutKeyOf(rects) {
  if (!rects || !rects.length) return '';
  for (let i = 0; i < LAYOUTS.length; i += 1) {
    const L = LAYOUTS[i];
    if (L.rects.length !== rects.length) continue;
    let same = true;
    for (let j = 0; j < rects.length; j += 1) {
      if (!sameRect(L.rects[j], rects[j])) {
        same = false;
        break;
      }
    }
    if (same) return L.key;
  }
  return '';
}

function layoutLabel(rects) {
  const key = layoutKeyOf(rects);
  if (!key) return '自定义切分';
  const L = layoutByKey(key);
  return L ? L.label : '自定义切分';
}

module.exports = {
  listWalls: listWalls,
  getWall: getWall,
  listChannels: listChannels,
  listTasks: listTasks,
  getTask: getTask,
  applyTask: applyTask,
  pushLayout: pushLayout,
  savePreset: savePreset,
  renamePreset: renamePreset,
  deletePreset: deletePreset,
  listTour: listTour,
  saveTour: saveTour,
  listCategories: listCategories,
  createCategory: createCategory,
  renameCategory: renameCategory,
  deleteCategory: deleteCategory,
  assignChannelCategory: assignChannelCategory,
  buildTree: buildTree,
  LAYOUTS: LAYOUTS,
  DEFAULT_LAYOUT: DEFAULT_LAYOUT,
  layoutByKey: layoutByKey,
  layoutKeyOf: layoutKeyOf,
  sameRect: sameRect,
  layoutLabel: layoutLabel,
};
