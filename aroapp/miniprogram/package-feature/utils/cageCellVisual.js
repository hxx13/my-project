'use strict';

/**
 * 笼位格子可视化纯函数簇（底色 / 类型灯 / 简称 / 角标 / 位号 …）。
 *
 * 从 package-feature/pages/studentCageShelf/index.js 原样抽出，供笼架信息页与卡牌打印页
 * 共用，避免两页各自漂移。函数体照搬，仅把两处页面级状态改为注入：
 *   - userColors      → setUserColors(colors)
 *   - currentAccountId→ setAccountId(id)
 * 本模块不得出现 wx. / this，全部为纯函数。
 */

/* ================================================================== */
/*  Color System (from H5 CageCellOverlays.tsx / CageColorContext.tsx) */
/* ================================================================== */

var DEFAULT_COLORS = {
  NORMAL:          { bg: "#f1f5f9", border: "#cbd5e1" },
  COHABITATION:    { bg: "#a7f3d0", border: "#10b981" },
  SPECIAL_FEEDING: { bg: "#fecaca", border: "#ef4444" },
  NEED_DIVIDE:     { bg: "#fef08a", border: "#eab308" },
  HEALTH_ABNORMAL: { bg: "#e9d5ff", border: "#a855f7" },
  ANIMAL_TRANSFER: { bg: "#cffafe", border: "#06b6d4" },
};

// 用户自定义配色（共享 /v1/cage-shelves/user-colors），加载后覆盖默认色；未加载/失败回退 DEFAULT_COLORS
var userColors = null;
function setUserColors(colors) { userColors = colors || null; }
function colorFor(code) {
  return (userColors && userColors[code]) || DEFAULT_COLORS[code] || DEFAULT_COLORS.NORMAL;
}

var STATUS_BG_PRIORITY = [
  "HEALTH_ABNORMAL", "NEED_DIVIDE", "ANIMAL_TRANSFER",
  "SPECIAL_FEEDING", "COHABITATION", "NORMAL"
];

var CAGE_TYPE_LABEL = { 1: "(等待分配)", 2: "(空笼位)", 3: "(饲养中)", 4: "(异常)" };

var CAGE_TYPE_DOT_COLOR = { 1: "#f59e0b", 2: "#10b981", 3: "#f43f5e", 4: "#3b82f6" };
var CAGE_TYPE_ABBR = { 1: "待", 2: "空", 3: "饲", 4: "异" };

var STATUS_LABEL_MAP = {
  COHABITATION: "合笼",
  SPECIAL_FEEDING: "需特殊饲养",
  NEED_DIVIDE: "需分笼",
  HEALTH_ABNORMAL: "健康异常",
  ANIMAL_TRANSFER: "动物转移",
  NORMAL: "正常"
};

var COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
var ROWS = 10;

// 当前登录账号 id（统一人员口径 accountId，与 divisionAssignees[].id 对齐），由页面 onLoad 注入
var currentAccountId = '';
function setAccountId(id) { currentAccountId = id == null ? '' : String(id); }

/* ================================================================== */
/*  Helpers                                                             */
/* ================================================================== */

function normalizeStatuses(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return []; }
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function computeStatusesFromCageBoxInfo(cageBoxInfo) {
  if (!cageBoxInfo) return [];
  var results = [];
  var yn = function(k) { return cageBoxInfo[k] === 1 || cageBoxInfo[k] === "1"; };
  var hasText = function(k) {
    return typeof cageBoxInfo[k] === "string" && (cageBoxInfo[k] || "").trim() !== "";
  };
  if (hasText("ClosingDate")) {
    results.push({ code: "COHABITATION", label: "合笼" });
  }
  if (yn("NeedFeedingYn")) {
    results.push({ code: "SPECIAL_FEEDING", label: "需特殊饲养" });
  }
  if (yn("NeedDivideYn")) {
    results.push({ code: "NEED_DIVIDE", label: "需分笼" });
  }
  if (yn("AbnormalHealthYn")) {
    results.push({ code: "HEALTH_ABNORMAL", label: "健康异常" });
  }
  if (yn("NeedTransferYn")) {
    results.push({ code: "ANIMAL_TRANSFER", label: "动物转移" });
  }
  if (results.length === 0) {
    results.push({ code: "NORMAL", label: "正常" });
  }
  return results;
}

function getDominantStatusCode(specialStatuses, cageBoxInfo) {
  var list = normalizeStatuses(specialStatuses);
  // Fallback: compute from cageBoxInfo if specialStatuses is empty or only NORMAL
  if (list.length === 0 || (list.length === 1 && list[0].code === "NORMAL")) {
    var fallback = computeStatusesFromCageBoxInfo(cageBoxInfo);
    if (fallback.length > 0 && !(fallback.length === 1 && fallback[0].code === "NORMAL")) {
      list = fallback;
    }
  }
  var codes = {};
  for (var i = 0; i < list.length; i++) {
    codes[list[i].code] = true;
  }
  var codeKeys = Object.keys(codes);
  // No status data at all → treat as NORMAL
  if (codeKeys.length === 0) return "NORMAL";
  // Only NORMAL flag → use NORMAL color
  if (codes["NORMAL"] && codeKeys.length === 1) return "NORMAL";
  for (var j = 0; j < STATUS_BG_PRIORITY.length; j++) {
    if (codes[STATUS_BG_PRIORITY[j]]) return STATUS_BG_PRIORITY[j];
  }
  return "NORMAL"; // fallback: unrecognized codes → use normal color
}

function getCellStyle(cell) {
  if (cell.empty) {
    return "background-color: #f1f5f9; border: 1px solid #cbd5e1;";
  }
  // 非本组笼位（visible=false）不再用黄色高亮，改走特殊状态色，与 admin 视图/Web/H5 一致；
  // 「受限」通过格子内的 *** 文本体现，颜色不再区分权限。
  // 合并已有状态 + 缓存动作 → 统一分色
  var bgColors = [];
  (cell.specialStatuses || []).forEach(function(s) {
    var sc = colorFor(s.code);
    if (s.code !== "NORMAL" && sc) bgColors.push(sc.bg);
  });
  // 缓存动作色（逗号分隔 → 逐个加入分色）
  if (cell._cachedBg) {
    var cacheColors = cell._cachedBg.split(',');
    for (var ci = 0; ci < cacheColors.length; ci++) {
      if (cacheColors[ci]) bgColors.push(cacheColors[ci]);
    }
  }
  if (bgColors.length >= 2) {
    var n = bgColors.length;
    var stops = [];
    for (var i = 0; i < n; i++) {
      var pct = Math.round((i / n) * 100);
      var pctNext = Math.round(((i + 1) / n) * 100);
      stops.push(bgColors[i] + " " + pct + "%, " + bgColors[i] + " " + pctNext + "%");
    }
    return "background: linear-gradient(to bottom, " + stops.join(", ") + "); border: 1px solid #cbd5e1;";
  }
  if (bgColors.length === 1) return "background-color: " + bgColors[0] + "; border: 1px solid #cbd5e1;";
  var code = cell._dominantCode || getDominantStatusCode(cell.specialStatuses, cell.cageBoxInfo);
  cell._dominantCode = code;
  var c = colorFor(code);
  return "background-color: " + c.bg + "; border: 1px solid " + c.border + ";";
}

function getDominantCodeLabel(code) {
  return STATUS_LABEL_MAP[code] || code || "正常";
}

/* ================================================================== */
/*  Grid Building（对齐 H5：后端 position 为 A-1…H-10，grid 已含 80 格） */
/* ================================================================== */

/**
 * 活跃预定 → 格子上的「订」标记（`_opMark`）。三档与 H5
 * `cagePickerLogic.mergeOrderReservationMarks` 同色同文案：
 *   紫 = 已随订单提交 / 蓝 = 已加进购物车 / 琥珀 = 只是被某人锁住。
 * 笼架页、订购抽屉、卡牌打印都读 /cage-reservations/active，映射只留这一份，
 * 免得三端各写一套颜色和标签文案。
 */
function buildReserveMarks(list) {
  var out = {};
  (Array.isArray(list) ? list : []).forEach(function (x) {
    if (!x || x.animalCageId == null || x.animalCageId === '') return;
    var ordered = !!x.orderId;
    var inCart = !ordered && !!x.cartId;
    out[String(x.animalCageId)] = {
      color: ordered ? '#8b5cf6' : (inCart ? '#0ea5e9' : '#f59e0b'),
      abbr: '订',
      label: ordered ? '已下单待审批' : (inCart ? '已在购物车' : '已被' + (x.reserverName || '他人') + '预订'),
    };
  });
  return out;
}

/** 把标记打到一批格子上（按 cell.id 查表）。没命中的显式置 null，不留上一次的残影。 */
function applyReserveMarks(gridCells, marks) {
  var m = marks || {};
  (gridCells || []).forEach(function (c) {
    if (!c) return;
    var cid = c.id == null ? '' : String(c.id);
    c._opMark = (cid && m[cid]) || null;
  });
  return gridCells;
}

function toPositionLabel(x, y) {
  var col = COLUMNS[Math.max(0, Math.min(7, Number(x) - 1))] || 'A';
  return col + '-' + y;
}

function resolveAnimalCageType(cell) {
  var ct = cell.animalCageType;
  if (ct != null && ct !== '') ct = Number(ct);
  if ((ct == null || isNaN(ct)) && cell.cageBoxInfo && cell.cageBoxInfo.AnimalCageType != null) {
    ct = Number(cell.cageBoxInfo.AnimalCageType);
  }
  // 回退：从 stateLabel 推断 cageType（animalCageType 为 null 时）
  if ((ct == null || isNaN(ct)) && cell.stateLabel) {
    var sl = String(cell.stateLabel);
    if (sl.indexOf('等待分配') >= 0) ct = 1;
    else if (sl.indexOf('空笼盒') >= 0) ct = 2;
    else if (sl.indexOf('饲养') >= 0) ct = 3;
    else if (sl.indexOf('异常') >= 0) ct = 4;
  }
  // 完全无法推断且非空位 → 有 PI 或 cageBoxCode 则至少是饲养中（对齐 admin/student/H5 页面逻辑）
  if ((ct == null || ct === 0 || isNaN(ct)) && !cell.empty) {
    var cbi = cell.cageBoxInfo || {};
    if (cell.projectPiName || cbi.cageBoxCode || cbi.CageBoxQrCode) ct = 3;
    else ct = 1;
  }
  return (ct == null || ct === 0 || isNaN(ct)) ? null : ct;
}

function enrichGridCell(cell) {
  if (!cell) return cell;
  var enriched = {};
  var key;
  for (key in cell) {
    if (Object.prototype.hasOwnProperty.call(cell, key)) {
      enriched[key] = cell[key];
    }
  }
  enriched._dominantCode = getDominantStatusCode(enriched.specialStatuses, enriched.cageBoxInfo);
  enriched._cellStyle = getCellStyle(enriched);
  enriched._piShort = truncateText(enriched.projectPiName, 4);
  enriched._deptShort = truncateText(enriched.departmentName, 5);
  enriched._experimenterShort = truncateText(enriched.experimenterName, 6);
  var ct = resolveAnimalCageType(enriched);
  // 待到位（locked）是「已预约(空笼盒)→已预约(饲养中)」之间的过渡态：
  // 左上角已有「未到位」徽标表意，右上角的「空」类型图标此时会误导，整体隐藏。
  var pendingArrival = enriched.claimStatus === 'locked' || enriched.claimStatus === 'pending_approval';
  enriched._cageTypeAbbr = pendingArrival ? '' : (CAGE_TYPE_ABBR[ct] || '');
  // 饲养中(type 3)不显示指示灯，对齐 H5 CageCellOverlays
  enriched._cageTypeDotColor = (pendingArrival || ct === 3) ? '' : (CAGE_TYPE_DOT_COLOR[ct] || '');
  enriched._cageTypeLabel = CAGE_TYPE_LABEL[ct] || enriched.stateLabel || '—';
  // 特殊饲养明细角标（右上角，形如 +食 / −水）。明细强绑定特殊饲养 → 该格必是 type 3 →
  // 类型指示灯本就不点，两枚徽标不会抢同一个角；底色跟父状态走，不另开一套配色。
  enriched._sfBadges = sfBadgesOf(normalizeStatuses(enriched.specialStatuses));
  enriched._sfBadgeColor = colorFor('SPECIAL_FEEDING').border;
  enriched._hasStatusCodes = computeStatusCodesForDisplay(enriched);
  // 认领徽标：未到位/待审批/待释放（对齐 H5 CellButton 左上角徽标）
  var cs = enriched.claimStatus;
  if (cs === 'locked') enriched._claimBadge = { text: '未到位', cls: 'gcell-badge--locked' };
  else if (cs === 'pending_approval') enriched._claimBadge = { text: '待审批', cls: 'gcell-badge--pending' };
  else if (cs === 'pending_release_approval') enriched._claimBadge = { text: '待释放', cls: 'gcell-badge--release' };
  // 划分名单：本人命中 → 专属标签；管家视角显示名单（wxml 按 isStaffView 渲染）
  var divs = enriched.divisionAssignees;
  enriched._divisionMine = false;
  enriched._divisionNames = '';
  if (Array.isArray(divs) && divs.length > 0) {
    var dNames = [];
    for (var di = 0; di < divs.length; di++) {
      var dRow = divs[di] || {};
      if (dRow.name) dNames.push(dRow.name);
      if (currentAccountId && String(dRow.id) === currentAccountId) enriched._divisionMine = true;
    }
    enriched._divisionNames = dNames.join('、');
  }
  // 显示坐标反转：A-1(顶)↔A-10(底)，内容不动仅编号反转
  enriched._displayPosition = (function(p) {
    var m = /^([A-H])-(\d+)$/.exec(p);
    if (m) return m[1] + '-' + (11 - parseInt(m[2]));
    var m2 = /^(\d+)-(\d+)$/.exec(p);
    if (m2) { var col = COLUMNS[Math.max(0, Math.min(7, Number(m2[1]) - 1))] || 'A'; return col + '-' + (11 - parseInt(m2[2])); }
    return p;
  })(enriched.position || '');
  return enriched;
}

function buildGrid(gridCells) {
  var source = gridCells || [];
  // 一律以 8x10 为骨架：后端只回「存在的笼位索引」，不满 80 时直接用它渲染会得到
  // 残缺网格（少的行/列直接没了、位号也对不齐）。缺的位置补空位占位，
  // 占位格同样走 enrichGridCell —— 状态底色与位号口径与真实格子完全一致。
  var bySlot = {};
  source.forEach(function (c) {
    var sx = Number(c.x);
    var sy = Number(c.y);
    if ((!sx || !sy) && typeof c.position === 'string') {
      var m = /^(\d+)-(\d+)$/.exec(c.position);
      if (m) { sx = Number(m[1]); sy = Number(m[2]); }
    }
    if (sx && sy) bySlot[sx + '-' + sy] = c;
  });
  var out = [];
  for (var y = 1; y <= ROWS; y++) {
    for (var x = 1; x <= COLUMNS.length; x++) {
      var hit = bySlot[x + '-' + y];
      out.push(enrichGridCell(hit || { x: x, y: y, position: x + '-' + y, empty: true, visible: true }));
    }
  }
  return out;
}
function truncateText(text, maxLen) {
  if (!text) return '';
  var s = String(text).trim();
  if (s.length > maxLen) return s.substring(0, maxLen) + '…';
  return s;
}

function computeStatusCodesForDisplay(cell) {
  var raw = cell.specialStatuses;
  if (!raw || (Array.isArray(raw) && raw.length === 0)) {
    var bi = cell.cageBoxInfo;
    if (!bi) return '';
    var parts = [];
    if (bi["ClosingDate"]) parts.push("合笼");
    if (bi["NeedFeedingYn"] === 1) parts.push("需特殊饲养");
    if (bi["NeedDivideYn"] === 1) parts.push("需分笼");
    if (bi["AbnormalHealthYn"] === 1) parts.push("健康异常");
    if (bi["NeedTransferYn"] === 1) parts.push("动物转移");
    return parts.length > 0 ? parts.join("+") : "";
  }
  if (Array.isArray(raw)) {
    var codes = [];
    for (var i = 0; i < raw.length; i++) {
      if (raw[i].code !== "NORMAL") codes.push(raw[i].code);
    }
    return codes.join("+");
  }
  return "";
}

function ynFlag(cageBoxInfo, key) {
  if (!cageBoxInfo) return false;
  var v = cageBoxInfo[key];
  return v === 1 || v === "1";
}

function getSpecialStatusList(cell) {
  var list = normalizeStatuses(cell.specialStatuses);
  if (list.length === 0 || (list.length === 1 && list[0].code === "NORMAL")) {
    list = computeStatusesFromCageBoxInfo(cell.cageBoxInfo);
  }
  var out = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].code !== "NORMAL") out.push(list[i]);
  }
  return out;
}

/**
 * 特殊饲养明细角标文案：需加食 → 「+食」、勿加水 → 「−水」。
 * 记法与 Web/H5 同源（features/cage-shelf/constants.ts compactDetailBadgeText）：
 * 首字「勿/不/禁/无」= 否定（−），其余为肯定（+），取末字为对象。改一处要同步三端。
 */
function sfBadgeText(label) {
  var t = String(label == null ? '' : label).trim();
  if (t.length < 2) return t;
  return (/^[勿不禁无]/.test(t) ? '−' : '+') + t.charAt(t.length - 1);
}

/**
 * 该格此刻的明细角标。强绑定「需特殊饲养」：父状态不在同一份状态列表里就一律不显示，
 * 所以不会出现「明细角标孤零零挂着」的情况。脱敏笼位后端已把 specialStatuses 置空 → 自然为空。
 */
function sfBadgesOf(list) {
  var sfOn = false;
  var picked = [];
  for (var i = 0; i < (list || []).length; i++) {
    var s = list[i];
    if (!s || !s.code) continue;
    if (s.code === 'SPECIAL_FEEDING') sfOn = true;
    else if (s.code.indexOf('SF_') === 0) picked.push(s);
  }
  if (!sfOn) return [];
  return picked.map(function(s) {
    var label = s.label || s.code.replace(/^SF_/, '');
    return { code: s.code, text: sfBadgeText(label), label: label };
  });
}

module.exports = {
  setUserColors: setUserColors,
  setAccountId: setAccountId,
  colorFor: colorFor,
  getCellStyle: getCellStyle,
  getDominantStatusCode: getDominantStatusCode,
  getDominantCodeLabel: getDominantCodeLabel,
  normalizeStatuses: normalizeStatuses,
  computeStatusesFromCageBoxInfo: computeStatusesFromCageBoxInfo,
  computeStatusCodesForDisplay: computeStatusCodesForDisplay,
  ynFlag: ynFlag,
  sfBadgeText: sfBadgeText,
  sfBadgesOf: sfBadgesOf,
  truncateText: truncateText,
  toPositionLabel: toPositionLabel,
  resolveAnimalCageType: resolveAnimalCageType,
  getSpecialStatusList: getSpecialStatusList,
  enrichGridCell: enrichGridCell,
  buildGrid: buildGrid,
  buildReserveMarks: buildReserveMarks,
  applyReserveMarks: applyReserveMarks,
  DEFAULT_COLORS: DEFAULT_COLORS,
  STATUS_LABEL_MAP: STATUS_LABEL_MAP,
  COLUMNS: COLUMNS,
  ROWS: ROWS,
  CAGE_TYPE_DOT_COLOR: CAGE_TYPE_DOT_COLOR,
  CAGE_TYPE_ABBR: CAGE_TYPE_ABBR,
  CAGE_TYPE_LABEL: CAGE_TYPE_LABEL,
};
