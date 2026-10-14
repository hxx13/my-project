/**
 * 网络广播：小程序端接口封装。
 *
 * 复用后台同一套接口（/api/admin/broadcast/**，ADMIN+），不另开后门。
 * 后端平台命令与「先选中分区再下发」那套机制都封在服务端，这里只做业务调用。
 *
 * 惯例：springRequest 业务失败是 **resolve**，所以每个函数都过 parseSpringResult
 * 强制校验 success，失败 throw，由页面 catch 后 toast。
 */
const springAuth = require('../../utils/springAuth.js');

const BASE = '/api/admin/broadcast';

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

// ---------------------------------------------------------------- 连接

function getStatus() {
  return call('/status', 'GET');
}

function reconnect() {
  return call('/reconnect', 'POST');
}

function relogin() {
  return call('/relogin', 'POST');
}

// ---------------------------------------------------------------- 分区与播放

async function listZones() {
  const d = await call('/zones', 'GET');
  return {
    connected: !!(d && d.connected),
    loggedIn: !!(d && d.loggedIn),
    zones: (d && Array.isArray(d.zones) ? d.zones : []),
  };
}

function setVolume(macs, volume) {
  return call('/zones/volume', 'PUT', { macs: macs, volume: volume });
}

function play(macs, songPath, volume) {
  return call('/play', 'POST', { macs: macs, songPath: songPath, volume: volume === undefined ? null : volume });
}

function stop(macs) {
  return call('/stop', 'POST', { macs: macs });
}

// ---------------------------------------------------------------- 曲库

async function listSongLists() {
  const d = await call('/song-lists', 'GET');
  return Array.isArray(d) ? d : [];
}

/** 拍平成 [{value:pathName, label:fileName}]，给选曲控件用 */
async function listSongOptions() {
  const lists = await listSongLists();
  const out = [];
  lists.forEach(function (l) {
    (l.songs || []).forEach(function (s) {
      out.push({
        value: s.pathName,
        label: s.fileName,
        desc: l.name,
        durationSeconds: s.durationSeconds,
        listId: l.id,
      });
    });
  });
  return out;
}

// ---------------------------------------------------------------- 曲库列表管理
//
// 后端一律**不删音频文件**（只摘列表条目）—— 平台上那个能连文件一起删的开关，
// 服务端固定传 0。删文件不经本系统。

async function createSongList(listName) {
  return call('/song-lists', 'POST', { listName: listName });
}

async function renameSongList(listId, listName) {
  return call('/song-lists/' + listId, 'PUT', { listName: listName });
}

async function removeSongList(listId) {
  return call('/song-lists/' + listId, 'DELETE');
}

async function removeSongFromList(listId, songPath) {
  return call('/song-lists/' + listId + '/songs?path=' + encodeURIComponent(songPath), 'DELETE');
}

async function moveSongToList(fromListId, toListId, songPath) {
  return call('/songs/move', 'POST', { fromListId: fromListId, toListId: toListId, songPath: songPath });
}

// ---------------------------------------------------------------- 定时方案

async function listPlans() {
  const d = await call('/plans', 'GET');
  return Array.isArray(d) ? d.map(decoratePlan) : [];
}

function createPlan(body) {
  return call('/plans', 'POST', body);
}

function updatePlan(id, body) {
  return call('/plans/' + id, 'PUT', body);
}

function removePlan(id) {
  return call('/plans/' + id, 'DELETE');
}

function togglePlan(id, enabled) {
  return call('/plans/' + id + '/toggle?enabled=' + (enabled ? 'true' : 'false'), 'POST');
}

function runPlan(id) {
  return call('/plans/' + id + '/run', 'POST');
}

// ---------------------------------------------------------------- 播放记录

function listPlayLogs(planId, limit) {
  const q = [];
  if (planId !== undefined && planId !== null && planId !== '') {
    q.push('planId=' + planId);
  }
  q.push('limit=' + (limit || 60));
  return call('/play-logs?' + q.join('&'), 'GET');
}

// ---------------------------------------------------------------- 小工具

/** 方案里的分区/曲目是 JSON 文本，拍成数组并补好人看的字段 */
function decoratePlan(p) {
  const plan = Object.assign({}, p);
  plan.zoneList = safeArray(p.zoneMacs);
  plan.songList = safeArray(p.songPaths);
  plan.zoneCount = plan.zoneList.length;
  plan.songCount = plan.songList.length;
  plan.weekText = weekText(p.weekDays);
  plan.windowText = (p.startTime || '').slice(0, 5) + '–' + (p.endTime || '').slice(0, 5);
  plan.periodText = Number(p.timeMode) === 1
    ? ((p.startDate || '') + ' ~ ' + (p.endDate || ''))
    : plan.weekText;
  return plan;
}

function safeArray(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

const WEEK_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

function weekText(days) {
  if (!days) return '—';
  if (String(days) === '1234567') return '每天';
  const picked = String(days).split('').filter(Boolean).map(function (d) {
    return WEEK_NAMES[Number(d) - 1] || '';
  });
  return '周' + picked.join('');
}

module.exports = {
  getStatus: getStatus,
  reconnect: reconnect,
  relogin: relogin,
  listZones: listZones,
  setVolume: setVolume,
  play: play,
  stop: stop,
  listSongLists: listSongLists,
  listSongOptions: listSongOptions,
  createSongList: createSongList,
  renameSongList: renameSongList,
  removeSongList: removeSongList,
  removeSongFromList: removeSongFromList,
  moveSongToList: moveSongToList,
  listPlans: listPlans,
  createPlan: createPlan,
  updatePlan: updatePlan,
  removePlan: removePlan,
  togglePlan: togglePlan,
  runPlan: runPlan,
  listPlayLogs: listPlayLogs,
  weekText: weekText,
};
