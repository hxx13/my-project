var springAuth = require('../../../utils/springAuth.js');
var pagePermission = require('../../../utils/pagePermission.js');
var { hasMinRole } = require('../../../utils/roleAccess.js');
var { readCustomNavMetrics } = require('../../../utils/customNavMetrics.js');
var { CAGE_FORM_KEY, flattenTemplateFields, buildCodelistDict, buildFormRows } = require('../../../utils/cageForm.js');
var cageStatus = require('../../../utils/cageStatus.js');
var CAGE_STATUS_ACTIONS = cageStatus.CAGE_STATUS_ACTIONS;
var assetApi = require('../../utils/assetApi.js');

var CAGE_SHELF_PAGE = '/package-feature/pages/studentCageShelf/index';

function canAccessCageShelfPage(role) {
  return (
    pagePermission.canShowMiniEntry('tabbar', CAGE_SHELF_PAGE, role, 'STUDENT') ||
    pagePermission.canShowMiniEntry('home', CAGE_SHELF_PAGE, role, 'STAFF') ||
    pagePermission.canAccessMiniPage(CAGE_SHELF_PAGE, role, 'STUDENT')
  );
}

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

var CAGE_TYPE_LABEL = { 1: "等待分配", 2: "已预约(空笼盒)", 3: "已预约(饲养中)", 4: "异常" };
var CAGE_TYPE_DOT_COLOR = { 1: "#f59e0b", 2: "#10b981", 3: "#f43f5e", 4: "#3b82f6" };
var CAGE_TYPE_ABBR = { 1: "待", 2: "空", 3: "饲", 4: "异" };

var STATUS_LABEL_MAP = {
  COHABITATION: "需合笼",
  SPECIAL_FEEDING: "需特殊饲养",
  NEED_DIVIDE: "需分笼",
  HEALTH_ABNORMAL: "健康异常",
  ANIMAL_TRANSFER: "动物转移",
  NORMAL: "正常"
};

var STATUS_ABBR = {
  COHABITATION: "合",
  SPECIAL_FEEDING: "饲",
  NEED_DIVIDE: "分",
  HEALTH_ABNORMAL: "疾",
  ANIMAL_TRANSFER: "迁"
};

var COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
var ROWS = 10;
var BRAND = "#ac1736";
var PAGE_BG = "#eef0f6";

/* ================================================================== */
/*  Helpers                                                             */
/* ================================================================== */

function parseBody(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return { _raw: raw }; }
  }
  return { _raw: String(raw) };
}

function unwrap(res) {
  var statusCode = Number(res && res.statusCode);
  var body = parseBody(res ? res.data : null);
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限访问' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || '请求失败(' + (statusCode || 0) + ')' };
  }
  return { ok: true, data: body.data };
}

function nonEmptyText(s) {
  return typeof s === 'string' && s.trim() !== '';
}

/* ================================================================== */
/*  getDominantStatusCode (ported from H5 CageCellOverlays.tsx)         */
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
    results.push({ code: "COHABITATION", label: "需合笼" });
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
  if (cell.visible === false) {
    return "background-color: #fff9c4; border: 1px solid #f59e0b;";
  }
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
  var ct = resolveAnimalCageType(enriched);
  enriched._cageTypeAbbr = CAGE_TYPE_ABBR[ct] || '';
  // 饲养中(type 3)不显示指示灯，对齐 H5 CageCellOverlays
  enriched._cageTypeDotColor = ct === 3 ? '' : (CAGE_TYPE_DOT_COLOR[ct] || '');
  enriched._cageTypeLabel = CAGE_TYPE_LABEL[ct] || enriched.stateLabel || '—';
  enriched._hasStatusCodes = computeStatusCodesForDisplay(enriched);
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
  // 与 H5 / MobileCageShelfTab 一致：优先直接使用后端返回的 80 格序列
  if (source.length > 0) {
    return source.map(enrichGridCell);
  }
  // 兜底：无数据时生成 8×10 空位占位（position 必须为 A-1 格式）
  var cells = [];
  var y, x, position;
  for (y = 1; y <= ROWS; y++) {
    for (x = 1; x <= COLUMNS.length; x++) {
      position = toPositionLabel(x, y);
      cells.push({
        x: x,
        y: y,
        position: position,
        empty: true,
        visible: true,
        _cellStyle: 'background-color: #f1f5f9; border: 1px solid #cbd5e1;'
      });
    }
  }
  return cells;
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
    if (bi["ClosingDate"]) parts.push("需合笼");
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

function parseImageUrlLines(text) {
  if (!text) return [];
  return String(text).split("\n").map(function(s) { return s.trim(); }).filter(Boolean);
}

/**
 * 从 cell.detail（本地笼位索引数据）构建详情卡片的「表外固定字段」。
 * PI / 部门 / AUP / 品系 / 性别 / 周龄 / 数量 / 来源等关键信息已由统一表单系统渲染
 * （见 loadCellFormValues），此处不再重复拼装。
 */
function buildCellDetailData(cell) {
  var detail = cell.detail || {};
  var ct = resolveAnimalCageType(cell);

  // 特殊状态标签：以表单(cage_info_value)为真相源，在 loadCellFormValues 里填 statusChips，此处先置空
  var chips = [];

  // 解析图片
  var images = [];
  try {
    if (typeof detail.imagesJson === 'string') {
      var parsed = JSON.parse(detail.imagesJson);
      images = Array.isArray(parsed) ? parsed : [];
    } else if (Array.isArray(detail.imagesJson)) {
      images = detail.imagesJson;
    }
  } catch (e) {
    images = [];
  }

  return {
    position: cell._displayPosition || cell.position,
    coords: '(' + cell.x + ',' + cell.y + ')',
    cageTypeAbbr: CAGE_TYPE_ABBR[ct] || '',
    cageTypeLabel: CAGE_TYPE_LABEL[ct] || cell.stateLabel || '—',
    cageTypeDotColor: ct === 3 ? '' : (CAGE_TYPE_DOT_COLOR[ct] || ''),
    statusChips: chips,
    images: images
  };
}

function buildCellDetailMeta(cell, gridMeta) {
  var bi = cell.cageBoxInfo || {};
  var chips = getSpecialStatusList(cell).map(function(s) {
    return {
      code: s.code,
      label: s.label || STATUS_LABEL_MAP[s.code] || s.code,
      abbr: STATUS_ABBR[s.code] || "?"
    };
  });
  var locationParts = [];
  if (gridMeta) {
    if (gridMeta.campusName) locationParts.push(gridMeta.campusName);
    if (gridMeta.areaName) locationParts.push(gridMeta.areaName);
    if (gridMeta.floorName) locationParts.push(gridMeta.floorName);
    if (gridMeta.roomName) locationParts.push(gridMeta.roomName);
  }
  var ct = resolveAnimalCageType(cell);
  return {
    permitted: cell.visible !== false,
    cageTypeLabel: CAGE_TYPE_LABEL[ct] || cell.stateLabel || "—",
    specialChips: chips,
    showNeedDivide: ynFlag(bi, "NeedDivideYn"),
    showNeedFeeding: ynFlag(bi, "NeedFeedingYn"),
    showNeedTransfer: ynFlag(bi, "NeedTransferYn"),
    showAbnormalHealth: ynFlag(bi, "AbnormalHealthYn"),
    closingDate: bi.ClosingDate ? String(bi.ClosingDate) : "",
    specialBreedingName: bi.SpecialBreedingName ? String(bi.SpecialBreedingName) : "",
    locationText: locationParts.join(" / ")
  };
}

function getActiveShelveId(pageData) {
  if (pageData.gridMeta && pageData.gridMeta.shelveId) return String(pageData.gridMeta.shelveId);
  if (pageData.selectedShelf && pageData.selectedShelf.shelveId) return String(pageData.selectedShelf.shelveId);
  return "";
}

/** 从 roomName 提取父房间 key（例：201A → 201；210A → 210） */
function extractParentRoomKey(roomName) {
  var m = /^(\d+)/.exec(roomName || '');
  return m ? m[1] : (roomName || '其他');
}

/** 校区 → 父房间 → 子房间(笼架组) → 笼架 三级分组 */
function groupShelvesByCampus(shelves) {
  var campusMap = {};
  var campusOrder = [];
  (shelves || []).forEach(function(s) {
    var cn = s.campusName || "其他";
    var rn = s.roomName || "其他";
    var pr = extractParentRoomKey(rn);   // 父房间：201A → 201
    if (!campusMap[cn]) {
      campusMap[cn] = { campusName: cn, rooms: [], roomMap: {} };
      campusOrder.push(cn);
    }
    var cm = campusMap[cn];
    if (!cm.roomMap[pr]) {
      var room = { roomName: pr, shelfGroups: [], groupMap: {}, hasHighlight: false };
      cm.roomMap[pr] = room;
      cm.rooms.push(room);
    }
    var rm = cm.roomMap[pr];
    if (!rm.groupMap[rn]) {
      var sg = { key: rn, name: rn, shelves: [], hasHighlight: false, expanded: false,
                 c1: 0, c2: 0, c3: 0, c4: 0 };
      rm.groupMap[rn] = sg;
      rm.shelfGroups.push(sg);
    }
    rm.groupMap[rn].shelves.push(s);
    if (s.highlight) {
      rm.hasHighlight = true;
      rm.groupMap[rn].hasHighlight = true;
    }
  });
  return campusOrder.map(function(k) { return campusMap[k]; });
}

/* ================================================================== */
/*  Page Definition                                                      */
/* ================================================================== */

Page({
  data: {
    loading: true,
    error: '',
    screen: 'list',           // 'list' | 'grid'
    shelves: [],
    shelfGroups: [],          // [{roomName, shelves:[], expanded:false}]
    allShelfGroups: [],       // unfiltered, for filter dropdown
    totalCount: 0,

    // Search & filter
    searchQuery: '',
    roomFilter: '',           // selected roomName filter value
    roomFilterIndex: 0,       // picker selected index
    roomFilterOptions: [],    // [{text, value}] for picker
    filteredShelfCount: 0,    // count of shelves in filtered view

    // Grid
    selectedShelf: null,      // shelfMeta from detail
    grid: [],                 // 80 cells
    gridMeta: null,
    filledCount: 0,
    totalCells: 80,

    // Scan mode (教职工视角)
    staffView: false,
    adminView: false,
    scannedCellX: -1,
    scannedCellY: -1,
    scannedPosition: '',
    scannedCageBoxCode: '',
    legendOpen: false,
    scanCache: {},               // { "x:y": { cell, code, actions: {DIVIDE, SPECIAL_BREEDING, HEALTH_CHECK} } }
    scanCacheSize: 0,
    scanTotalActions: 0,
    cachePreviews: [],
    lastScannedKey: '',
    lastScannedEntry: Object.assign({ position: '', code: '' }, cageStatus.newActionStateKeys()),
    // 状态动作表（供 wxml 遍历渲染，五个动作单一来源）
    CAGE_STATUS_ACTIONS: cageStatus.CAGE_STATUS_ACTIONS,
    actionSubmitting: false,
    editActionCell: null,       // 编辑模式弹出的 cell
    editActionPopup: false,     // 弹窗显隐
    editActionPhotos: [],       // 弹窗内上传的照片
    editActionNote: "",         // 弹窗内备注
    editActionUploading: false,
    editHistory: [],            // 弹窗内历史记录
    editHistoryLoading: false,
    editMode: false,
    confirmMode: false,
    confirmLookup: null,        // 扫码确认的 lookup 结果（含 cageCell + claim）
    confirmRows: [],            // 核对弹窗字段行
    showConfirmDialog: false,
    confirmSubmitting: false,
    navBarHeight: 64,

    // Cell detail（对齐 Web CellDetailPanel / MobileCageCellDetailDialog）
    selectedCell: null,
    cellDetailMeta: null,
    showCellDetail: false,
    cellDetail: null,
    experimentDesc: '',
    detailImages: [],
    detailStatusPhotos: {},
    detailAnnotationLoading: false,
    // 关键信息表单（统一表单系统动态渲染，取代原先硬编码的 PI/部门/AUP/动物信息几行）
    formRows: [],
    formLoading: false,
    formError: '',
    detailSaving: false,
    detailSaveMsg: "",
    detailSaveMsgType: "",
    detailQrImageSrc: "",
    detailImageUploading: false,
    // 教职工详情弹窗动作
    detailActions: cageStatus.newActionState(),
    detailActionSubmitting: false,

    // 特殊状态弹窗
    specialStatusOpen: false,
    specialStatusLoading: false,
    specialStatusError: '',
    specialStatusScannedAt: '',
    specialStatusGroups: [],
    allExpanded: false,
    anyExpanded: false,
    scannedAt: '',
    highlightTarget: null,  // { shelveId, x, y, campusName, roomName } 扫码跳转高亮
    scanLockHighlight: null, // { sid: shelveId, x, y } 扫码定位闪烁高亮
  },

  onLoad: function(options) {
    var self = this;
    var role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    var token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    if (!token || !canAccessCageShelfPage(role)) {
      wx.showToast({ title: '无权限', icon: 'none' });
      self._accessDenied = true;
      wx.navigateBack({ delta: 1 });
      return;
    }

    // 拉取用户自定义配色（与 web/H5 共享 /v1/cage-shelves/user-colors），失败回退默认色
    springAuth.springRequest({ url: '/api/v1/cage-shelves/user-colors', method: 'GET', data: {} }).then(function(res) {
      var up = unwrap(res);
      if (up.ok && up.data && typeof up.data === 'object') setUserColors(up.data);
    }).catch(function() { /* 保持默认色 */ });

    // 解析扫码跳转参数（微信可能不解码，手动 decodeURIComponent）
    var highlightTarget = null;
    console.log('[mp-jump] onLoad options:', JSON.stringify(options || {}));
    if (options && (options.shelveId || options.campusName || options.roomName)) {
      var decodedCampus = '';
      var decodedRoom = '';
      try { decodedCampus = decodeURIComponent(options.campusName || ''); } catch(e) { decodedCampus = options.campusName || ''; }
      try { decodedRoom = decodeURIComponent(options.roomName || ''); } catch(e) { decodedRoom = options.roomName || ''; }
      console.log('[mp-jump] decoded campus=' + decodedCampus + ' room=' + decodedRoom);
      highlightTarget = {
        shelveId: options.shelveId || '',
        x: parseInt(options.highlightX) || 0,
        y: parseInt(options.highlightY) || 0,
        campusName: decodedCampus,
        roomName: decodedRoom,
      };
      console.log('[mp-jump] parsed highlightTarget:', JSON.stringify(highlightTarget));
    }

    self.setData({
      staffView: hasMinRole(role, 'STAFF'),
      adminView: hasMinRole(role, 'ADMIN'),
      highlightTarget: highlightTarget,
      ...readCustomNavMetrics()
    });
    self.loadShelves();
  },

  /* ------------------------------------------------------------------ */
  /*  Data Loading                                                        */
  /* ------------------------------------------------------------------ */

  loadShelves: function() {
    var self = this;
    self.setData({ loading: true, error: '' });

    var p1 = springAuth.springRequest({
      url: '/api/student/mobile/cage-shelves/all',
      method: 'GET',
      data: {}
    });
    var p2 = springAuth.springRequest({
      url: '/api/cage-shelves/full-tree',
      method: 'GET',
      data: {}
    });

    Promise.all([p1, p2]).then(function(results) {
      var p = unwrap(results[0]);
      if (!p.ok) {
        self.setData({ loading: false, error: p.message });
        return;
      }
      var shelves = (p.data && p.data.shelves) || [];
      var totalCount = (p.data && p.data.totalCount) || shelves.length;
      var scannedAt = (p.data && p.data.scannedAt) || '';

      // 合并 full-tree 的类型计数到每个 shelf
      var treeResult = unwrap(results[1]);
      var treeData = treeResult.ok ? treeResult.data : [];
      var typeMap = {};
      for (var ti = 0; ti < (treeData || []).length; ti++) {
        var tn = treeData[ti];
        if (tn.shelveId) {
          typeMap[String(tn.shelveId)] = { t1: tn.type1 || 0, t2: tn.type2 || 0, t3: tn.type3 || 0, t4: tn.type4 || 0 };
        }
      }
      for (var si = 0; si < shelves.length; si++) {
        var sc = typeMap[String(shelves[si].shelveId)];
        if (sc) {
          shelves[si].c1 = sc.t1; shelves[si].c2 = sc.t2; shelves[si].c3 = sc.t3; shelves[si].c4 = sc.t4;
        }
      }

      var campusGroups = groupShelvesByCampus(shelves);
      // 计算房间 & 笼架组两级聚合计数
      for (var ci = 0; ci < campusGroups.length; ci++) {
        var cg = campusGroups[ci];
        for (var ri = 0; ri < cg.rooms.length; ri++) {
          var rm = cg.rooms[ri];
          rm.c1 = 0; rm.c2 = 0; rm.c3 = 0; rm.c4 = 0;
          for (var gi = 0; gi < rm.shelfGroups.length; gi++) {
            var grp = rm.shelfGroups[gi];
            grp.c1 = 0; grp.c2 = 0; grp.c3 = 0; grp.c4 = 0;
            for (var sj = 0; sj < grp.shelves.length; sj++) {
              var s = grp.shelves[sj];
              grp.c1 += s.c1 || 0; grp.c2 += s.c2 || 0; grp.c3 += s.c3 || 0; grp.c4 += s.c4 || 0;
            }
            rm.c1 += grp.c1; rm.c2 += grp.c2; rm.c3 += grp.c3; rm.c4 += grp.c4;
          }
          rm.shelfCount = 0;
          for (var gi2 = 0; gi2 < rm.shelfGroups.length; gi2++) {
            rm.shelfCount += rm.shelfGroups[gi2].shelves.length;
          }
        }
      }

      // Build room filter options
      var roomOptions = [{ text: '全部房间', value: '' }];
      var allRooms = [];
      for (var ci2 = 0; ci2 < campusGroups.length; ci2++) {
        for (var ri2 = 0; ri2 < campusGroups[ci2].rooms.length; ri2++) {
          allRooms.push(campusGroups[ci2].rooms[ri2]);
        }
      }
      for (var ai = 0; ai < allRooms.length; ai++) {
        var totalShelves = 0;
        for (var gi2 = 0; gi2 < allRooms[ai].shelfGroups.length; gi2++) {
          totalShelves += allRooms[ai].shelfGroups[gi2].shelves.length;
        }
        roomOptions.push({
          text: allRooms[ai].roomName + '房间 (' + totalShelves + '架)',
          value: allRooms[ai].roomName
        });
      }

      // 默认全部折叠
      for (var ci3 = 0; ci3 < campusGroups.length; ci3++) {
        campusGroups[ci3]._collapsed = true;
      }

      self.setData({
        loading: false,
        error: '',
        shelves: shelves,
        shelfGroups: campusGroups,
        allShelfGroups: JSON.parse(JSON.stringify(campusGroups)),
        totalCount: totalCount,
        filteredShelfCount: totalCount,
        scannedAt: scannedAt,
        anyExpanded: false,
        allExpanded: false,
        roomFilterOptions: roomOptions,
        searchQuery: '',
        roomFilter: '',
        roomFilterIndex: 0
      });

      // 扫码跳转：自动展开并导航到目标笼位
      if (self.data.highlightTarget) {
        console.log('[mp-jump] trigger from loadShelves, highlightTarget:', JSON.stringify(self.data.highlightTarget));
        self._autoJumpToHighlightTarget(self.data.highlightTarget, shelves, campusGroups);
      }
    }).catch(function(e) {
      self.setData({ loading: false, error: (e && e.message) || '加载失败' });
    });
  },

  /** 扫码跳转：用 campusName+roomName 在列表中找 shelf → 走 onShelfTap 正常链路 */
  _autoJumpToHighlightTarget: function(target, shelves, campusGroups) {
    var self = this;
    console.log('[mp-jump] target:', JSON.stringify(target));
    console.log('[mp-jump] shelves count:', shelves.length, 'campusGroups:', campusGroups.length);
    if (!target || (!target.campusName && !target.roomName)) {
      console.log('[mp-jump] SKIP: no campusName/roomName');
      return;
    }

    var campusName = target.campusName || '';
    // 后端返回完整房间名如 210A，但列表 room 组用父键如 210
    var roomName = target.roomName || '';
    var roomParentKey = extractParentRoomKey(roomName);
    console.log('[mp-jump] searching campus="' + campusName + '" room="' + roomName + '" parentKey="' + roomParentKey + '"');

    // 打印 campusGroups 结构用于调试
    for (var ci = 0; ci < campusGroups.length; ci++) {
      var cg2 = campusGroups[ci];
      console.log('[mp-jump] campus:', cg2.campusName, 'rooms:', (cg2.rooms || []).map(function(r) { return r.roomName; }));
    }

    // 展开 campus/room（用 parentKey 匹配列表 room 组）
    for (var ci = 0; ci < campusGroups.length; ci++) {
      var cg = campusGroups[ci];
      if (campusName && cg.campusName !== campusName) continue;
      cg._collapsed = false;
      for (var ri = 0; ri < cg.rooms.length; ri++) {
        var room = cg.rooms[ri];
        if (roomParentKey && room.roomName !== roomParentKey) continue;
        room.expanded = true;
        for (var gi = 0; gi < room.shelfGroups.length; gi++) {
          room.shelfGroups[gi].expanded = true;
        }
        break;
      }
      break;
    }

    // 在匹配到的 campus+room 范围内取第一个 shelf 的 shelveId
    var listShelveId = null;
    for (var ci2 = 0; ci2 < campusGroups.length && !listShelveId; ci2++) {
      if (campusName && campusGroups[ci2].campusName !== campusName) continue;
      var rooms2 = campusGroups[ci2].rooms;
      for (var ri2 = 0; ri2 < rooms2.length && !listShelveId; ri2++) {
        if (roomParentKey && rooms2[ri2].roomName !== roomParentKey) continue;
        var sgs = rooms2[ri2].shelfGroups;
        for (var gi2 = 0; gi2 < sgs.length && !listShelveId; gi2++) {
          if (sgs[gi2].shelves.length > 0) {
            listShelveId = sgs[gi2].shelves[0].shelveId;
            console.log('[mp-jump] found listShelveId:', listShelveId, 'from group:', sgs[gi2].name || sgs[gi2].key);
          }
        }
      }
    }
    if (!listShelveId) {
      console.error('[mp-jump] NOT FOUND: no shelf in matched room');
      wx.showToast({ title: '列表中未找到对应房间的笼架', icon: 'none' });
      self.setData({ highlightTarget: null });
      return;
    }

    console.log('[mp-jump] opening grid with listShelveId:', listShelveId, 'highlight:', target.x, target.y);
    self.setData({
      shelfGroups: campusGroups,
      scannedCellX: target.x,
      scannedCellY: target.y,
      lastScannedKey: target.x + ':' + target.y,
      highlightTarget: null
    });

    self.loadShelfDetail(listShelveId);
  },

  onRetry: function() {
    var self = this;
    if (self.data.screen === 'grid') {
      // 刷新按钮强制拉取实时数据，绕过快照
      self.loadShelfDetail(self.data.selectedShelf ? self.data.selectedShelf.shelveId : '', true);
    } else {
      self.loadShelves();
    }
  },

  onRefresh: function() {
    var self = this;
    self.setData({ searchQuery: '', roomFilter: '', roomFilterIndex: 0, allExpanded: false });
    self.loadShelves();
  },

  onScrollRefresh: function() {
    var self = this;
    self.loadShelves();
  },

  /* ------------------------------------------------------------------ */
  /*  List — Search & Filter                                              */
  /* ------------------------------------------------------------------ */

  onSearchInput: function(e) {
    var self = this;
    var query = (e.detail.value || '').trim();
    self.setData({ searchQuery: query });
    self.applyFilters(query, self.data.roomFilter, self.data.allShelfGroups);
  },

  onRoomFilterChange: function(e) {
    var self = this;
    var index = parseInt(e.detail.value);
    var roomName = '';
    if (index > 0) {
      var option = self.data.roomFilterOptions[index];
      roomName = option ? option.value : '';
    }
    self.setData({ roomFilter: roomName, roomFilterIndex: index });
    self.applyFilters(self.data.searchQuery, roomName, self.data.allShelfGroups);
  },

  applyFilters: function(query, roomFilter, allGroups) {
    var filtered = [];
    var q = query.toLowerCase();
    var totalShelfCount = 0;
    for (var i = 0; i < allGroups.length; i++) {
      var campus = allGroups[i];
      var matchedRooms = [];
      for (var j = 0; j < campus.rooms.length; j++) {
        var room = campus.rooms[j];
        if (roomFilter && room.roomName !== roomFilter) continue;
        if (q && room.roomName.toLowerCase().indexOf(q) === -1) continue;
        var clonedGroups = [];
        var roomShelfCount = 0;
        for (var gi = 0; gi < room.shelfGroups.length; gi++) {
          var src = room.shelfGroups[gi];
          clonedGroups.push({
            key: src.key, name: src.name, shelves: src.shelves.slice(),
            hasHighlight: src.hasHighlight, expanded: false,
            c1: src.c1, c2: src.c2, c3: src.c3, c4: src.c4
          });
          roomShelfCount += src.shelves.length;
        }
        totalShelfCount += roomShelfCount;
        matchedRooms.push({
          roomName: room.roomName,
          shelfGroups: clonedGroups,
          shelfCount: roomShelfCount,
          expanded: false,
          hasHighlight: room.hasHighlight,
          c1: room.c1, c2: room.c2, c3: room.c3, c4: room.c4
        });
      }
      if (matchedRooms.length > 0) {
        filtered.push({ campusName: campus.campusName, rooms: matchedRooms });
      }
    }
    this.setData({ shelfGroups: filtered, filteredShelfCount: totalShelfCount });
  },

  onToggleCampus: function(e) {
    var campusName = e.currentTarget.dataset.campusName;
    var groups = this.data.shelfGroups;
    for (var ci = 0; ci < groups.length; ci++) {
      if (groups[ci].campusName === campusName) {
        groups[ci]._collapsed = !groups[ci]._collapsed;
        break;
      }
    }
    this.setData({ shelfGroups: groups });
  },

  onToggleAllRooms: function() {
    var groups = this.data.shelfGroups;
    var next = !this.data.allExpanded;
    for (var ci = 0; ci < groups.length; ci++) {
      groups[ci]._collapsed = next;
      for (var ri = 0; ri < groups[ci].rooms.length; ri++) {
        var rm = groups[ci].rooms[ri];
        rm.expanded = next;
        for (var gi = 0; gi < rm.shelfGroups.length; gi++) {
          rm.shelfGroups[gi].expanded = next;
        }
      }
    }
    this.setData({ shelfGroups: groups, allExpanded: next, anyExpanded: next });
  },

  onOpenSpecialStatus: function() {
    var self = this;
    self.setData({ specialStatusOpen: true, specialStatusLoading: true, specialStatusError: '' });
    springAuth.springRequest({
      url: '/api/student/cage-shelves/special-status-overview',
      method: 'GET',
      data: {},
    }).then(function(res) {
      var body = res && res.data;
      if (!body || !body.success) {
        self.setData({ specialStatusLoading: false, specialStatusError: (body && body.message) || '加载失败' });
        return;
      }
      var data = body.data || {};
      var colors = {
        COHABITATION:    { bg: '#a7f3d0', border: '#10b981' },
        SPECIAL_FEEDING: { bg: '#fecaca', border: '#ef4444' },
        NEED_DIVIDE:     { bg: '#fef08a', border: '#eab308' },
        HEALTH_ABNORMAL: { bg: '#e9d5ff', border: '#a855f7' },
        ANIMAL_TRANSFER: { bg: '#cffafe', border: '#06b6d4' },
      };
      var groups = (data.groups || []).map(function(g) {
        var cages = g.cages || [];
        // 反转显示坐标（兼容数字格式 1-1 和字母格式 A-1）
        cages.forEach(function(c) {
          var p = c.position || '';
          var m = /^([A-H])-(\d+)$/.exec(p);
          if (m) { c._displayPosition = m[1] + '-' + (11 - parseInt(m[2])); }
          else {
            var m2 = /^(\d+)-(\d+)$/.exec(p);
            if (m2) { var col = COLUMNS[Math.max(0, Math.min(7, Number(m2[1]) - 1))] || 'A'; c._displayPosition = col + '-' + (11 - parseInt(m2[2])); }
            else { c._displayPosition = p; }
          }
        });
        // 对齐 H5 groupCagesByShelf：按 shelveId 分组（Status → Shelf → Cage）
        var shelfMap = {};
        var shelfOrder = [];
        cages.forEach(function(c) {
          var key = String(c.shelveId || (c.roomName + '-' + c.campusName));
          if (!shelfMap[key]) {
            shelfMap[key] = {
              key: key,
              title: (c.roomName || '—') + ' · ' + (c.shelveName || c.shelveId || '—'),
              meta: [c.campusName, c.floorName].filter(function(s) { return s && s.trim(); }).join(' '),
              cages: [],
            };
            shelfOrder.push(key);
          }
          shelfMap[key].cages.push(c);
        });
        // 排序：先按 meta 再按 title
        shelfOrder.sort(function(a, b) {
          var sa = shelfMap[a], sb = shelfMap[b];
          var mc = (sa.meta || '').localeCompare(sb.meta || '');
          if (mc !== 0) return mc;
          return (sa.title || '').localeCompare(sb.title || '');
        });
        var c = colors[g.statusCode] || { bg: '#f1f5f9', border: '#cbd5e1' };
        return {
          code: g.statusCode,
          label: g.statusLabel || STATUS_LABEL_MAP[g.statusCode] || g.statusCode,
          count: cages.length,
          dotColor: c.bg,
          borderColor: c.border,
          abbr: STATUS_ABBR[g.statusCode] || '?',
          expanded: false,
          shelfGroups: shelfOrder.map(function(k) {
            var sg = shelfMap[k];
            sg._expanded = false;
            return sg;
          }),
        };
      });
      self.setData({
        specialStatusLoading: false,
        specialStatusScannedAt: data.scannedAt || '',
        specialStatusGroups: groups,
      });
    }).catch(function(err) {
      self.setData({ specialStatusLoading: false, specialStatusError: (err && err.message) || '请求失败' });
    });
  },

  onCloseSpecialStatus: function() {
    this.setData({ specialStatusOpen: false });
  },

  onToggleSpecialGroup: function(e) {
    var code = e.currentTarget.dataset.code;
    var groups = this.data.specialStatusGroups;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].code === code) {
        groups[i].expanded = !groups[i].expanded;
        break;
      }
    }
    this.setData({ specialStatusGroups: groups });
  },

  onToggleSpecialShelf: function(e) {
    var code = e.currentTarget.dataset.code;
    var key = e.currentTarget.dataset.key;
    var groups = this.data.specialStatusGroups;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].code === code) {
        var sgs = groups[i].shelfGroups;
        for (var j = 0; j < sgs.length; j++) {
          if (sgs[j].key === key) {
            sgs[j]._expanded = !sgs[j]._expanded;
            break;
          }
        }
        break;
      }
    }
    this.setData({ specialStatusGroups: groups });
  },

  onClearFilter: function() {
    var self = this;
    self.setData({
      searchQuery: '',
      roomFilter: '',
      roomFilterIndex: 0,
      shelfGroups: JSON.parse(JSON.stringify(self.data.allShelfGroups)),
      filteredShelfCount: self.data.totalCount
    });
  },

  /* ------------------------------------------------------------------ */
  /*  List — Accordion                                                     */
  /* ------------------------------------------------------------------ */

  onToggleRoom: function(e) {
    var self = this;
    var roomName = e.currentTarget.dataset.roomName;
    var groups = self.data.shelfGroups;
    for (var ci = 0; ci < groups.length; ci++) {
      for (var ri = 0; ri < groups[ci].rooms.length; ri++) {
        if (groups[ci].rooms[ri].roomName === roomName) {
          groups[ci].rooms[ri].expanded = !groups[ci].rooms[ri].expanded;
          break;
        }
      }
    }
    self.setData({ shelfGroups: groups });
  },

  onToggleShelfGroup: function(e) {
    var self = this;
    var roomName = e.currentTarget.dataset.roomName;
    var groupKey = e.currentTarget.dataset.groupKey;
    var groups = self.data.shelfGroups;
    for (var ci = 0; ci < groups.length; ci++) {
      for (var ri = 0; ri < groups[ci].rooms.length; ri++) {
        var rm = groups[ci].rooms[ri];
        if (rm.roomName === roomName) {
          for (var gi = 0; gi < rm.shelfGroups.length; gi++) {
            if (rm.shelfGroups[gi].key === groupKey) {
              rm.shelfGroups[gi].expanded = !rm.shelfGroups[gi].expanded;
              break;
            }
          }
          break;
        }
      }
    }
    self.setData({ shelfGroups: groups });
  },

  /* ------------------------------------------------------------------ */
  /*  List → Grid                                                         */
  /* ------------------------------------------------------------------ */

  onShelfTap: function(e) {
    var self = this;
    var shelveId = e.currentTarget.dataset.shelveId;
    if (!shelveId) return;
    self.loadShelfDetail(shelveId);
  },

  /** 从本地DB加载笼架网格（秒加载） */
  loadShelfDetail: function(shelveId, opts) {
    var self = this;
    opts = opts || {};
    self.setData({ loading: true, error: '', screen: 'grid' });

    springAuth.springRequest({
      url: '/api/cage-cell-index/local-grid/by-shelve/' + shelveId,
      method: 'GET'
    }).then(function(res) {
      var p = unwrap(res);
      if (!p.ok) {
        self.setData({ loading: false, error: p.message });
        return;
      }
      var data = p.data || {};
      var shelfMeta = data.shelfMeta || {};
      var gridCells = data.grid || [];
      var grid = buildGrid(gridCells);

      var patch = {
        loading: false,
        error: '',
        selectedShelf: shelfMeta,
        grid: grid,
        gridMeta: shelfMeta,
        showCellDetail: false,
        selectedCell: null
      };

      // 扫码定位 → 设置十字交叉高亮 + 闪烁动画
      if (opts.locateX != null && opts.locateY != null) {
        patch.lastScannedKey = opts.locateX + ':' + opts.locateY;
        patch.scannedCellX = opts.locateX;
        patch.scannedCellY = opts.locateY;
        patch.scanLockHighlight = { sid: String(shelfMeta.shelveId || shelveId), x: opts.locateX, y: opts.locateY };
      }

      self.setData(patch);
    }).catch(function(e) {
      self.setData({ loading: false, error: (e && e.message) || '加载失败' });
    });
  },

  /* ------------------------------------------------------------------ */
  /*  扫码（单一常驻入口，按当前模式分派）                                */
  /* ------------------------------------------------------------------ */

  onScanLock: function() {
    var self = this;
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode', 'barCode'],
      success: function(res) {
        var code = (res.result || '').trim();
        if (!code) return;
        self.handleResidentScan(code);
      },
      fail: function(err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '扫码失败', icon: 'none' });
        }
      }
    });
  },

  /** 按当前模式分派扫码结果 */
  handleResidentScan: function(code) {
    if (this.data.editMode) { this.handleEditScan(code); return; }
    if (this.data.confirmMode) { this.handleConfirmScan(code); return; }
    this.handleViewScan(code);
  },

  /** 查看模式：扫码定位笼位 */
  handleViewScan: function(code) {
    var self = this;
    assetApi.lookupCode(code).then(function(r) {
      if (r.type === 'NOT_FOUND') { wx.showToast({ title: '未找到对应笼位', icon: 'none' }); return; }
      if (r.type === 'ASSET') { wx.showToast({ title: '该编码为资产编号，非笼位', icon: 'none' }); return; }
      self._locateLookup(r);
    }).catch(function() {
      wx.showToast({ title: '扫码查询失败', icon: 'none' });
    });
  },

  /** 从 lookup 结果提取坐标并定位高亮（CAGE_CELL / LEGACY_CAGE_BOX 均支持） */
  _locateLookup: function(r) {
    var self = this;
    var pos = null;
    var sid = '';
    var roomName = '';
    var shelveName = '';
    if (r.type === 'CAGE_CELL' && r.cageCell) {
      pos = { positionX: r.cageCell.positionX, positionY: r.cageCell.positionY };
      sid = String(r.cageCell.shelveId || '');
      roomName = r.cageCell.roomName || '';
      shelveName = r.cageCell.shelveName || '';
    } else if (r.type === 'LEGACY_CAGE_BOX') {
      if (r.positionX != null && r.positionY != null) {
        pos = { positionX: r.positionX, positionY: r.positionY };
      }
      sid = String(r.shelveId || '');
      roomName = r.roomName || '';
      shelveName = r.shelveName || '';
    }
    if (!pos || !sid) { wx.showToast({ title: '无笼架信息', icon: 'none' }); return; }
    self.loadShelfDetail(sid, { locateX: pos.positionX, locateY: pos.positionY });
    wx.showToast({ title: '已定位: ' + (roomName || '') + ' ' + (shelveName || '') + ' (' + pos.positionX + ',' + pos.positionY + ')', icon: 'success' });
  },

  /** 扫码确认模式：定位 → 判定认领状态 → 核对弹窗 */
  handleConfirmScan: function(code) {
    var self = this;
    assetApi.lookupCode(code).then(function(r) {
      if (r.type === 'NOT_FOUND') { wx.showToast({ title: '未找到对应笼位', icon: 'none' }); return; }
      if (r.type === 'ASSET') { wx.showToast({ title: '该编码为资产编号，非笼位', icon: 'none' }); return; }
      if (r.type === 'LEGACY_CAGE_BOX') {
        wx.showToast({ title: '旧盒码已废弃，请扫笼位码', icon: 'none' });
        self._locateLookup(r);
        return;
      }
      self._locateLookup(r);
      var claim = r.claim;
      if (!claim) { wx.showToast({ title: '该笼位未分配', icon: 'none' }); return; }
      if (claim.claimStatus === 'locked') {
        var cc = r.cageCell || {};
        var rows = [];
        if (cc.positionLabel || (cc.positionX != null && cc.positionY != null)) {
          rows.push({ label: '笼位', value: cc.positionLabel || (cc.positionX + '-' + cc.positionY), em: false });
        }
        if (cc.roomName) rows.push({ label: '房间', value: cc.roomName, em: false });
        if (claim.claimantName) rows.push({ label: '认领人', value: claim.claimantName, em: true });
        if (claim.projectPiName) rows.push({ label: '课题组 PI', value: claim.projectPiName, em: true });
        if (claim.aupNumber) rows.push({ label: 'AUP 编号', value: claim.aupNumber, em: false });
        if (claim.projectName) rows.push({ label: '项目', value: claim.projectName, em: false });
        rows.push({ label: '当前状态', value: claim.claimStatus === 'locked' ? '待确认' : (claim.claimStatus || '-'), em: true });
        self.setData({ confirmLookup: r, confirmRows: rows, showConfirmDialog: true });
        if (claim.hasInfo === false) {
          var animalCageId = cc.animalCageId || '';
          if (animalCageId) {
            self.loadCellFormValues({ id: animalCageId, animalCageId: animalCageId });
          } else {
            self.setData({ formRows: [], formLoading: false, formError: '' });
          }
        }
      } else if (claim.claimStatus === 'confirmed') {
        wx.showToast({ title: '该笼位已到位', icon: 'success' });
      } else if (claim.claimStatus === 'pending_approval') {
        wx.showToast({ title: '该笼位待审批', icon: 'none' });
      } else if (claim.claimStatus === 'pending_release_approval') {
        wx.showToast({ title: '该笼位待释放审批', icon: 'none' });
      } else {
        wx.showToast({ title: '该笼位状态：' + claim.claimStatus, icon: 'none' });
      }
    }).catch(function(e) {
      wx.showToast({ title: (e && e.message) || '扫码查询失败', icon: 'none' });
    });
  },

  /** 确认到位：调用学生端 confirm（后端校验本人） */
  handleConfirmArrival: function() {
    var self = this;
    var claim = self.data.confirmLookup && self.data.confirmLookup.claim;
    if (!claim || !claim.id || self.data.confirmSubmitting) return;
    self.setData({ confirmSubmitting: true });
    springAuth.springRequest({
      url: '/api/student/cage-claims/' + claim.id + '/confirm',
      method: 'POST',
      data: {}
    }).then(function(res) {
      var p = unwrap(res);
      if (!p.ok) {
        self.setData({ confirmSubmitting: false });
        wx.showToast({ title: p.message || '确认失败（仅本人可确认）', icon: 'none' });
        return;
      }
      self.setData({ confirmSubmitting: false, confirmLookup: null, confirmRows: [], showConfirmDialog: false });
      wx.showToast({ title: '已确认到位', icon: 'success' });
    }).catch(function(e) {
      self.setData({ confirmSubmitting: false });
      wx.showToast({ title: (e && e.message) || '确认失败（仅本人可确认）', icon: 'none' });
    });
  },

  onCloseConfirmDialog: function() {
    this.setData({ confirmLookup: null, confirmRows: [], showConfirmDialog: false });
  },

  /** 切回查看模式（默认态）：退出编辑/扫码确认，有未提交修改先确认 */
  onSelectViewMode: function() {
    var self = this;
    if (self.data.editMode && self.data.scanCache && Object.keys(self.data.scanCache).length > 0) {
      wx.showModal({
        title: '未提交修改',
        content: '有未提交的修改，是否放弃？',
        confirmText: '放弃',
        cancelText: '继续编辑',
        success: function(res) { if (res.confirm) self._resetToViewMode(); }
      });
      return;
    }
    self._resetToViewMode();
  },

  _resetToViewMode: function() {
    var self = this;
    self.setData({
      editMode: false,
      confirmMode: false,
      confirmLookup: null,
      confirmRows: [],
      showConfirmDialog: false,
      scanCache: {},
      scanCacheSize: 0,
      lastScannedKey: '',
      scannedCellX: -1,
      scannedCellY: -1,
      detailActions: cageStatus.newActionState()
    });
    self.loadShelfDetail(self.data.selectedShelf ? self.data.selectedShelf.shelveId : '');
  },

  /** 切换扫码确认模式（与编辑模式互斥） */
  onToggleConfirmMode: function() {
    var self = this;
    var next = !self.data.confirmMode;
    if (next) {
      self.setData({
        confirmMode: true,
        editMode: false,
        confirmLookup: null,
        confirmRows: [],
        showConfirmDialog: false,
        scanCache: {},
        lastScannedKey: '',
        scannedCellX: -1,
        scannedCellY: -1,
        detailActions: cageStatus.newActionState()
      });
    } else {
      self.setData({
        confirmMode: false,
        confirmLookup: null,
        confirmRows: [],
        showConfirmDialog: false
      });
      self.loadShelfDetail(self.data.selectedShelf ? self.data.selectedShelf.shelveId : '');
    }
  },

  /* ------------------------------------------------------------------ */
  /*  Grid → Back to List                                                 */
  /* ------------------------------------------------------------------ */

  onBackToList: function() {
    var self = this;
    var hasCache = self.data.scanCache && Object.keys(self.data.scanCache).length > 0;
    if (hasCache) {
      wx.showModal({
        title: '未提交修改',
        content: '有未提交的扫码修改，是否放弃？',
        confirmText: '放弃',
        cancelText: '继续编辑',
        success: function(res) {
          if (res.confirm) { self.onExitScanMode(); self._doBackToList(); }
        }
      });
    } else {
      self._doBackToList();
    }
  },

  _doBackToList: function() {
    this.setData({
      screen: 'list',
      loading: false,
      error: '',
      selectedShelf: null,
      grid: [],
      gridMeta: null,
      scannedCellX: -1,
      scannedCellY: -1,
      scannedPosition: '',
      scannedCageBoxCode: '',
      scanCache: {},
      lastScannedKey: '',
      editMode: false,
      confirmMode: false,
      confirmLookup: null,
      confirmRows: [],
      showConfirmDialog: false,
      confirmSubmitting: false,
      showCellDetail: false,
      selectedCell: null,
      cellDetailMeta: null,
      cellDetail: null,
      experimentDesc: "",
      detailImages: [],
    detailStatusPhotos: {},
      formRows: [],
      formLoading: false,
      formError: '',
      detailQrImageSrc: "",
      scanLockHighlight: null
    });
  },

  /* ------------------------------------------------------------------ */
  /*  Cell Interaction                                                    */
  /* ------------------------------------------------------------------ */

  onCellTap: function(e) {
    var self = this;
    var x = Number(e.currentTarget.dataset.x);
    var y = Number(e.currentTarget.dataset.y);
    var cell = null;
    var grid = self.data.grid;
    for (var i = 0; i < grid.length; i++) {
      if (Number(grid[i].x) === x && Number(grid[i].y) === y) {
        cell = grid[i];
        break;
      }
    }
    if (!cell || cell.empty) return;

    // 编辑模式：弹出操作选择窗口而非详情
    if (self.data.editMode && self.data.adminView) {
      var ck = cell.x + ':' + cell.y;
      var cacheEntry = (self.data.scanCache || {})[ck];
      // 优先从 scanCache 读取，否则空态（表单值到达后再用表单覆盖）
      var initAct = cacheEntry ? cacheEntry.initialActions : cageStatus.newActionState();
      var currAct = cacheEntry ? cacheEntry.currentActions : Object.assign({}, initAct);
      var animalCageId = cell.id || cell.animalCageId || '';
      self.setData({
        editActionCell: cell,
        editActionPopup: true,
        editActionPhotos: [],
        editActionNote: '',
        editHistory: [],
        editHistoryLoading: true,
        editFormValues: null,
        editActionInitial: Object.assign({}, initAct),
        editActionCurrent: Object.assign({}, currAct)
      });
      // 拉取表单值(cage_info_value)：状态标记唯一真相源，据此反向使能按钮
      if (animalCageId && !cacheEntry) {
        springAuth.springRequest({ url: '/api/admin/cage-info/values/' + animalCageId, method: 'GET', data: {} }).then(function(res) {
          var up = unwrap(res);
          if (!up.ok) return;
          self.setData({ editFormValues: up.data || [] });
          // 弹窗仍开着且用户尚未手动勾选时，用表单值覆盖初始/当前态
          if (self.data.editActionPopup && self.data.editActionCell === cell && !(self.data.scanCache || {})[ck]) {
            var fAct = cageStatus.actionsFromFormValues(up.data || []);
            self.setData({ editActionInitial: Object.assign({}, fAct), editActionCurrent: Object.assign({}, fAct) });
          }
        });
      }
      // 加载历史记录
      if (animalCageId) {
        springAuth.springRequest({ url: '/api/local/history/' + animalCageId, method: 'GET', data: {} }).then(function(res) {
          var hp = unwrap(res);
          var list = (hp.ok ? hp.data : []) || [];
          // 解析 imagesJson → _imgs 供模板渲染
          list.forEach(function(h) {
            try { h._imgs = JSON.parse(h.imagesJson || '[]'); } catch(e) { h._imgs = []; }
            if (h.createdAt) h.createdAt = (h.createdAt || '').substring(0, 16);
          });
          self.setData({ editHistory: list, editHistoryLoading: false });
        }).catch(function() { self.setData({ editHistoryLoading: false }); });
      }
      // 从 annotate 加载已有备注和状态照片（不能从 cell.detail 读取）
      if (animalCageId) {
        springAuth.springRequest({ url: '/api/local/annotate/' + animalCageId, method: 'GET', data: {} }).then(function(res) {
          var up = unwrap(res);
          if (up.ok && up.data) {
            var d = up.data;
            var note = '';
            var all = [];
            if (d.statusPhotos) {
              try {
                var sp = typeof d.statusPhotos === 'string' ? JSON.parse(d.statusPhotos) : d.statusPhotos;
                if (typeof sp._note === 'string') note = sp._note;
                // 合并所有 key 的照片（跳过 _note 字符串）
                for (var k in sp) { if (k !== '_note' && Object.prototype.hasOwnProperty.call(sp, k) && Array.isArray(sp[k])) all = all.concat(sp[k]); }
              } catch (e) {}
            }
            self.setData({ editActionNote: note, editActionPhotos: all });
          }
        });
      }
      return;
    }

    var cellDetail = buildCellDetailData(cell);
    var detailMeta = buildCellDetailMeta(cell, self.data.gridMeta);

    var ck = x + ':' + y;
    var cacheEntry = (self.data.scanCache || {})[ck];
    var initialActions = cageStatus.newActionState();
    var currentActions = cageStatus.newActionState();
    if (cacheEntry && cacheEntry.initialActions && cacheEntry.currentActions) {
      CAGE_STATUS_ACTIONS.forEach(function (a) {
        initialActions[a.action] = !!cacheEntry.initialActions[a.action];
        currentActions[a.action] = !!cacheEntry.currentActions[a.action];
      });
    } else {
      var cbi = cell.cageBoxInfo || {};
      var cvo = cbi.cageBoxVo || cbi['cageBoxVo'] || {};
      var fromBox = cageStatus.actionsFromCageBoxInfo(cbi, cvo);
      CAGE_STATUS_ACTIONS.forEach(function (a) {
        currentActions[a.action] = !!fromBox[a.action];
      });
      // ARO 侧的两个旁证字段：有特殊饲养名 / 有健康记录也视为已标记
      if ((typeof cbi.specialBreedingName === 'string' && cbi.specialBreedingName.trim()) || (typeof cvo.specialBreedingName === 'string' && cvo.specialBreedingName.trim())) currentActions.SPECIAL_BREEDING = true;
      if (cbi.animalHealthEntity != null || cvo.animalHealthEntity != null) currentActions.HEALTH_CHECK = true;
      initialActions = Object.assign({}, currentActions);
    }
    this.initialDetailActions = JSON.parse(JSON.stringify(initialActions));

    self.setData({
      selectedCell: cell,
      cellDetailMeta: detailMeta,
      cellDetail: cellDetail,
      showCellDetail: true,
      experimentDesc: (cell.detail && cell.detail.experimentDesc) || '',
      detailImages: cellDetail.images,
      detailAnnotationLoading: detailMeta.permitted,
      detailSaving: false,
      detailSaveMsg: '',
      detailSaveMsgType: '',
      detailQrImageSrc: '',
      detailActions: JSON.parse(JSON.stringify(currentActions)),
      initialDetailActions: JSON.parse(JSON.stringify(initialActions))
    });

    if (detailMeta.permitted) {
      self.loadCellFormValues(cell);
      self.loadCellAnnotation(cell);
      var cbCode = (cell.detail && cell.detail.cageBoxCode) || (cell.cageBoxInfo && cell.cageBoxInfo.cageBoxCode) || cell.cageBoxCode;
      // QR code rendering removed — local DB doesn't generate QR codes
    }
  },
  /**
   * 拉取已发布组合模板 cage_detail 及其码表。页面级只拉一次（模板极少变动），
   * 失败后清空缓存以便下次重试。
   */
  loadCageFormTemplate: function() {
    var self = this;
    if (self._cageFormPromise) return self._cageFormPromise;
    var p = springAuth.springRequest({
      url: '/api/admin/cage-info/templates/' + CAGE_FORM_KEY,
      method: 'GET',
      data: {}
    }).then(function(res) {
      var up = unwrap(res);
      if (!up.ok) throw new Error(up.message || '表单模板读取失败');
      var tpl = up.data || {};
      if (tpl.status !== 'FROZEN') throw new Error('表单未发布（当前状态：' + (tpl.status || '未知') + '）');
      var fields = flattenTemplateFields(tpl);
      // 码表只拉模板里实际出现过的 dictKey；单个码表失败不拖垮整张表单
      var keys = [];
      fields.forEach(function(f) {
        if (f.dictKey && keys.indexOf(f.dictKey) < 0) keys.push(f.dictKey);
      });
      return Promise.all(keys.map(function(k) {
        return springAuth.springRequest({
          url: '/api/admin/cage-info/codelists/' + k, method: 'GET', data: {}
        }).then(function(r) {
          var u = unwrap(r);
          return { key: k, items: (u.ok && u.data && u.data.items) || [] };
        }).catch(function() {
          return { key: k, items: [] };
        });
      })).then(function(lists) {
        return { fields: fields, dict: buildCodelistDict(lists) };
      });
    });
    p.catch(function() { self._cageFormPromise = null; });
    self._cageFormPromise = p;
    return p;
  },

  /** 读该笼位的表单值，与模板字段合并成只读展示行 */
  loadCellFormValues: function(cell) {
    var self = this;
    var animalCageId = cell.id || cell.animalCageId || '';
    if (!animalCageId) {
      self.setData({ formRows: [], formLoading: false, formError: '' });
      return;
    }
    self.setData({ formRows: [], formLoading: true, formError: '' });
    // 连点不同笼位时，只认最后一次请求的结果
    var seq = (self._formReqSeq || 0) + 1;
    self._formReqSeq = seq;
    Promise.all([
      self.loadCageFormTemplate(),
      springAuth.springRequest({
        url: '/api/admin/cage-info/values/' + animalCageId, method: 'GET', data: {}
      }).then(function(res) {
        var up = unwrap(res);
        if (!up.ok) throw new Error(up.message || '表单值读取失败');
        return up.data || [];
      })
    ]).then(function(arr) {
      if (seq !== self._formReqSeq) return;
      var tpl = arr[0];
      // 状态标记以表单(cage_info_value)为真相源：据表单值推导标题栏 chips
      var activeActions = cageStatus.actionsFromFormValues(arr[1]);
      var statusChips = cageStatus.CAGE_STATUS_ACTIONS
        .filter(function(a) { return activeActions[a.action]; })
        .map(function(a) { return { code: a.statusField, label: a.label, color: a.color, bg: a.bg, statusField: a.statusField }; });
      self.setData({
        formRows: buildFormRows(tpl.fields, arr[1], tpl.dict),
        'cellDetail.statusChips': statusChips,
        formLoading: false,
        formError: ''
      });
    }).catch(function(err) {
      if (seq !== self._formReqSeq) return;
      self.setData({
        formRows: [],
        formLoading: false,
        formError: (err && err.message) || '表单加载失败'
      });
    });
  },

loadCellAnnotation: function(cell) {
    var self = this;
    var animalCageId = cell.id || cell.animalCageId || '';
    if (!animalCageId) {
      self.setData({ detailAnnotationLoading: false });
      return;
    }
    springAuth.springRequest({
      url: '/api/local/annotate/' + animalCageId,
      method: 'GET',
      data: {}
    }).then(function(res) {
      var up = unwrap(res);
      if (!up.ok) {
        self.setData({ detailAnnotationLoading: false });
        return;
      }
      var a = up.data;
      if (!a) {
        self.setData({ detailAnnotationLoading: false });
        return;
      }
      var images = [];
      if (a.imagesJson) {
        try {
          var arr = typeof a.imagesJson === 'string' ? JSON.parse(a.imagesJson) : a.imagesJson;
          if (Array.isArray(arr)) images = arr;
        } catch (err2) {}
      }
      var statusPhotos = {};
      if (a.statusPhotos) {
        try { var sp = typeof a.statusPhotos === 'string' ? JSON.parse(a.statusPhotos) : a.statusPhotos; if (typeof sp === 'object' && !Array.isArray(sp)) statusPhotos = sp; } catch (err3) {}
      }
      self.setData({
        experimentDesc: a.experimentDesc || '',
        detailImages: images,
        detailStatusPhotos: statusPhotos,
        detailAnnotationLoading: false
      });
    }).catch(function() {
      self.setData({ detailAnnotationLoading: false });
    });
  },

  onDetailExperimentDescInput: function(e) {
    this.setData({ experimentDesc: e.detail.value || '' });
  },

  onDetailPreviewImage: function(e) {
    var url = e.currentTarget.dataset.url;
    var urls = this.data.detailImages || [];
    if (urls.length === 0) return;
    wx.previewImage({
      current: url,
      urls: urls
    });
  },

  onDetailRemoveImage: function(e) {
    var index = e.currentTarget.dataset.index;
    var images = (this.data.detailImages || []).slice();
    if (index >= 0 && index < images.length) {
      images.splice(index, 1);
      this.setData({ detailImages: images });
    }
  },

  onDetailRemoveStatusPhoto: function(e) {
    var field = e.currentTarget.dataset.field;
    var index = e.currentTarget.dataset.index;
    var sp = this.data.detailStatusPhotos || {};
    if (sp[field]) {
      var arr = sp[field].slice();
      if (index >= 0 && index < arr.length) {
        arr.splice(index, 1);
        var nsp = {}; for (var k in sp) { if (Object.prototype.hasOwnProperty.call(sp, k)) nsp[k] = sp[k]; }
        nsp[field] = arr;
        this.setData({ detailStatusPhotos: nsp });
      }
    }
  },

onDetailChooseImage: function() {
    var self = this;
    if (self.data.detailImageUploading) return;
    wx.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function(res) {
        if (!res.tempFilePaths || res.tempFilePaths.length === 0) return;
        self.setData({ detailImageUploading: true, detailSaveMsg: '', detailSaveMsgType: '' });
        var uploaded = [];
        var failed = 0;
        var next = function(idx) {
          if (idx >= res.tempFilePaths.length) {
            self.setData({ detailImageUploading: false });
            if (uploaded.length > 0) {
              var existing = self.data.detailImages || [];
              var merged = existing.concat(uploaded);
              self.setData({ detailImages: merged });
            }
            if (failed > 0) {
              self.setData({ detailSaveMsg: uploaded.length + ' 张上传成功 / ' + failed + ' 张失败', detailSaveMsgType: 'err' });
              setTimeout(function() { self.setData({ detailSaveMsg: '', detailSaveMsgType: '' }); }, 3000);
            }
            return;
          }
          springAuth.uploadFileDirect(res.tempFilePaths[idx], {}).then(function(url) {
            uploaded.push(url);
            next(idx + 1);
          }).catch(function() {
            failed++;
            next(idx + 1);
          });
        };
        next(0);
      }
    });
  },

onSaveCellAnnotation: function() {
    var self = this;
    var cell = self.data.selectedCell;
    if (!cell || self.data.detailSaving) return;
    if (!self.data.cellDetailMeta || !self.data.cellDetailMeta.permitted) return;

    var animalCageId = cell.id || cell.animalCageId || '';
    var payload = {
      animalCageId: animalCageId,
      experimentDesc: self.data.experimentDesc || '',
      imagesJson: JSON.stringify(self.data.detailImages || []),
      statusPhotos: JSON.stringify(self.data.detailStatusPhotos || {})
    };

    self.setData({ detailSaving: true, detailSaveMsg: '', detailSaveMsgType: '' });

    springAuth.springRequest({
      url: '/api/local/annotate',
      method: 'POST',
      data: payload
    }).then(function(res) {
      var up = unwrap(res);
      if (!up.ok) {
        self.setData({
          detailSaving: false,
          detailSaveMsg: up.message || '保存失败',
          detailSaveMsgType: 'err'
        });
        return;
      }
      self.setData({
        detailSaving: false,
        detailSaveMsg: '保存成功',
        detailSaveMsgType: 'ok'
      });
      setTimeout(function() {
        if (self.data.detailSaveMsgType === 'ok') {
          self.setData({ detailSaveMsg: '', detailSaveMsgType: '' });
        }
      }, 2000);
    }).catch(function(e) {
      self.setData({
        detailSaving: false,
        detailSaveMsg: (e && e.message) || '保存失败',
        detailSaveMsgType: 'err'
      });
    });
  },

onCloseCellDetail: function() { this._closeDetail(); },
_closeDetail: function() {
    this.setData({
      showCellDetail: false,
      selectedCell: null,
      cellDetailMeta: null,
      cellDetail: null,
      experimentDesc: '',
      detailImages: [],
    detailStatusPhotos: {},
      detailAnnotationLoading: false,
      formRows: [],
      formLoading: false,
      formError: '',
      detailSaving: false,
      detailSaveMsg: '',
      detailSaveMsgType: '',
      detailQrImageSrc: '',
      detailImageUploading: false,
      detailActions: cageStatus.newActionState(),
      initialDetailActions: cageStatus.newActionState(),
      detailActionSubmitting: false
    });
  },

  /* ------------------------------------------------------------------ */
  /*  WXS helpers for template use                                        */
  /* ------------------------------------------------------------------ */

getCellStyleWxs: function(cell) {
    return getCellStyle(cell);
  },

  getDominantCodeLabelWxs: function(code) {
    return getDominantCodeLabel(code);
  },

  /* ── 详情弹窗动作 ── */

  onToggleDetailAction: function(e) {
    var act = e.currentTarget.dataset.act;
    if (!act) return;
    var old = this.data.detailActions;
    var newActions = cageStatus.toggleAction(old, act);
    var cell = this.data.selectedCell;
    if (cell && this.data.editMode) {
      var ck = cell.x + ':' + cell.y;
      // 确保缓存条目存在（点击格子 vs 扫码 → 统一走同一条缓存系统）
      var cache = this.data.scanCache || {};
      var newCache = {};
      for (var k in cache) {
        if (Object.prototype.hasOwnProperty.call(cache, k)) newCache[k] = cache[k];
      }
      if (!newCache[ck]) {
        var cbi = cell.cageBoxInfo || {};
        var cvo = cbi.cageBoxVo || cbi['cageBoxVo'] || {};
        var code = String(cbi.cageBoxCode || cbi['cageBoxCode'] || cvo.cageBoxCode || cvo['cageBoxCode'] || '');
        // 创建条目时从弹窗当前状态全量初始化，避免丢失已预选的其他动作
        newCache[ck] = { cell: cell, code: code, initialActions: Object.assign({}, this.initialDetailActions), currentActions: Object.assign({}, newActions) };
      } else {
        newCache[ck].currentActions[act] = newActions[act];
      }
      this.setData({ detailActions: newActions, scanCache: newCache }, this.applyCacheToGrid.bind(this));
    } else {
      this.setData({ detailActions: newActions });
    }
  },

  onSubmitDetailActions: function() {
    // 提交已统一由页面顶栏处理，弹窗内不做提交
    return;
    /* 原提交逻辑保留但不执行
    var self = this;
    var actions = self.data.detailActions;
    var initial = this.initialDetailActions || {};
    // 仅提交新增的动作
    var toSubmit = [];
    if (actions.DIVIDE && !initial.DIVIDE) toSubmit.push('DIVIDE');
    if (actions.SPECIAL_BREEDING && !initial.SPECIAL_BREEDING) toSubmit.push('SPECIAL_BREEDING');
    if (actions.HEALTH_CHECK && !initial.HEALTH_CHECK) toSubmit.push('HEALTH_CHECK');
    // 反选数量
    var deselected = 0;
    if (initial.DIVIDE && !actions.DIVIDE) deselected++;
    if (initial.SPECIAL_BREEDING && !actions.SPECIAL_BREEDING) deselected++;
    if (initial.HEALTH_CHECK && !actions.HEALTH_CHECK) deselected++;
    if (toSubmit.length === 0 && deselected === 0) return;

    var cell = self.data.selectedCell;
    var cbi = cell && cell.cageBoxInfo;
    var code = (cbi && (cbi.cageBoxCode || cbi['cageBoxCode'])) || '';
    if (!code) {
      var cvo = (cbi && (cbi.cageBoxVo || cbi['cageBoxVo'])) || {};
      code = cvo.cageBoxCode || cvo['cageBoxCode'] || '';
    }
    var meta = self.data.gridMeta || {};
    var roomId = String(meta.roomId || (self.data.selectedShelf && self.data.selectedShelf.roomId) || '');
    var shelveId = String((self.data.selectedShelf && self.data.selectedShelf.shelveId) || '');

    self.setData({ detailActionSubmitting: true });
    var okCount = 0, failCount = 0;
    var next = function(idx) {
      if (idx >= toSubmit.length) {
        self.setData({ detailActionSubmitting: false });
        if (failCount === 0) {
          var msg = '已完成 ' + okCount + ' 个操作';
          if (deselected > 0) msg += '，' + deselected + ' 项标记移除';
          wx.showToast({ title: msg, icon: okCount > 0 ? 'success' : 'none', duration: 2500 });
          if (okCount > 0) self.onRetry();
        } else {
          wx.showToast({ title: okCount + ' 成功 / ' + failCount + ' 失败', icon: 'none' });
        }
        return;
      }
      springAuth.springRequest({
        url: '/api/aro/cage-box/action',
        method: 'POST',
        data: { roomId: roomId, shelveId: shelveId, cageBoxCode: code, action: toSubmit[idx] }
      }).then(function(res) {
        var body = (res && typeof res.data === 'string') ? JSON.parse(res.data) : (res && res.data);
        if (body && body.success) { okCount++; } else { failCount++; }
        next(idx + 1);
      }).catch(function() { failCount++; next(idx + 1); });
    };
    next(0);
    */
  },

  /* ── 扫码模式 ── */

  /** 编辑模式：匹配扫码结果 → 加入缓存（复用统一 lookupCode） */
  handleEditScan: function(code) {
    var self = this;
    var grid = self.data.grid || [];
    assetApi.lookupCode(code).then(function(r) {
      if (r.type === 'NOT_FOUND' || r.type === 'ASSET') {
        wx.showToast({ title: '未找到对应笼位: ' + code, icon: 'none' });
        return;
      }
      if (r.type === 'LEGACY_CAGE_BOX') {
        wx.showToast({ title: '旧盒码已废弃，请扫笼位码', icon: 'none' });
        return;
      }
      var cc = r.cageCell;
      if (!cc || cc.positionX == null || cc.positionY == null) {
        wx.showToast({ title: '未找到对应笼位坐标', icon: 'none' });
        return;
      }
      // 在 grid 中按坐标匹配
      var matched = null;
      for (var i = 0; i < grid.length; i++) {
        if (grid[i] && Number(grid[i].x) === Number(cc.positionX) && Number(grid[i].y) === Number(cc.positionY)) {
          matched = grid[i];
          break;
        }
      }
      if (!matched) {
        wx.showToast({ title: '当前笼架未找到坐标 (' + cc.positionX + ',' + cc.positionY + ')', icon: 'none' });
        return;
      }
      var key = matched.x + ':' + matched.y;
      var animalCageId = matched.id || matched.animalCageId || '';
      var finalize = function(rows) {
        var preActions = rows != null ? cageStatus.actionsFromFormValues(rows) : cageStatus.newActionState();
        var oldCache = self.data.scanCache || {};
        var newCache = {};
        for (var k in oldCache) { if (Object.prototype.hasOwnProperty.call(oldCache, k)) newCache[k] = oldCache[k]; }
        if (!newCache[key]) {
          newCache[key] = { cell: matched, code: String(code), initialActions: Object.assign({}, preActions), currentActions: Object.assign({}, preActions) };
        }
        var entry = newCache[key];
        var scanEntry = { position: matched._displayPosition || matched.position || '', code: String(code) };
        CAGE_STATUS_ACTIONS.forEach(function (a) { scanEntry['act_' + a.action] = entry.currentActions[a.action]; });
        self.setData({
          scanCache: newCache,
          scanCacheSize: Object.keys(newCache).length,
          lastScannedKey: key,
          lastScannedEntry: scanEntry,
          scannedCellX: matched.x,
          scannedCellY: matched.y,
          legendOpen: false
        }, self.applyCacheToGrid.bind(self));
      };
      if (animalCageId) {
        springAuth.springRequest({ url: '/api/admin/cage-info/values/' + animalCageId, method: 'GET', data: {} }).then(function(res) {
          var up = unwrap(res);
          finalize(up.ok ? up.data : null);
        }).catch(function() { finalize(null); });
      } else {
        finalize(null);
      }
    }).catch(function() {
      wx.showToast({ title: '扫码查询失败', icon: 'none' });
    });
  },

  /** 仅关闭十字交叉高亮（保留有 diff 的缓存条目） */
  onDismissCrosshair: function() {
    var cache = this.data.scanCache || {};
    var newCache = {};
    var hasKept = false;
    for (var k in cache) {
      if (Object.prototype.hasOwnProperty.call(cache, k)) {
        var e = cache[k];
        // 仅保留有实际差异的条目（新增或反选）
        var init = e.initialActions || {};
        var curr = e.currentActions || {};
        if (CAGE_STATUS_ACTIONS.some(function (a) { return curr[a.action] !== init[a.action]; })) {
          newCache[k] = e;
          hasKept = true;
        }
      }
    }
    var clearedScanEntry = { position: '', code: '' };
    CAGE_STATUS_ACTIONS.forEach(function (a) { clearedScanEntry['act_' + a.action] = false; });
    this.setData({
      scanCache: newCache,
      scanCacheSize: Object.keys(newCache).length,
      lastScannedKey: '',
      lastScannedEntry: clearedScanEntry,
      scannedCellX: -1,
      scannedCellY: -1,
      scannedCageBoxCode: ''
    }, this.applyCacheToGrid.bind(this));
    if (!hasKept && Object.keys(cache).length > 0) {
      wx.showToast({ title: '已关闭高亮，无待提交修改', icon: 'none', duration: 1500 });
    }
  },

  /** 清除全部缓存 */
  onExitScanMode: function() {
    this.setData({
      scanCache: {},
      scanCacheSize: 0,
      scanTotalActions: 0,
      lastScannedKey: '',
      scannedCellX: -1,
      scannedCellY: -1,
      scannedCageBoxCode: '',
      actionSubmitting: false
    }, this.applyCacheToGrid.bind(this));
  },

  /** 移除单条缓存 */
  onRemoveCacheEntry: function(e) {
    var key = e.currentTarget.dataset.key;
    if (!key) return;
    var cache = this.data.scanCache || {};
    delete cache[key];
    var lk = this.data.lastScannedKey === key ? '' : this.data.lastScannedKey;
    this.setData({ scanCache: cache, lastScannedKey: lk }, this.applyCacheToGrid.bind(this));
  },

  /** 切换图例 */
  _doExitEditMode: function() {
    this.setData({
      editMode: false,
      scanCache: {},
      scanCacheSize: 0,
      lastScannedKey: '',
      scannedCellX: -1,
      scannedCellY: -1,
      detailActions: cageStatus.newActionState()
    }, function() {
      this.applyCacheToGrid();
      this.loadShelfDetail(this.data.selectedShelf ? this.data.selectedShelf.shelveId : '');
    }.bind(this));
  },

  onToggleRealtime: function() {
    var self = this;
    var next = !self.data.editMode;
    // 退出编辑模式且有未提交修改 → 弹窗确认
    if (!next && self.data.scanCache && Object.keys(self.data.scanCache).length > 0) {
      wx.showModal({
        title: '未提交修改',
        content: '有未提交的修改，是否放弃？',
        confirmText: '放弃',
        cancelText: '继续编辑',
        success: function(res) {
          if (res.confirm) { self._doExitEditMode(); }
        }
      });
      return;
    }
    if (!next) {
      // 退出编辑模式（无缓存）→ 切回快照数据
      self._doExitEditMode();
      return;
    }
    self.setData({ editMode: next, confirmMode: false, confirmLookup: null, confirmRows: [], showConfirmDialog: false });
    if (next && self.data.selectedShelf && self.data.selectedShelf.shelveId) {
      // 进入编辑模式 → 从本地DB刷新
      self.loadShelfDetail(self.data.selectedShelf.shelveId);
    } else {
      // 退出编辑模式 → 清除缓存、定位、交叉高亮
      self.setData({
        scanCache: {},
        lastScannedKey: '',
        scannedCellX: -1,
        scannedCellY: -1,
        detailActions: cageStatus.newActionState()
      }, self.applyCacheToGrid.bind(self));
      self.loadShelfDetail(self.data.selectedShelf ? self.data.selectedShelf.shelveId : '');
    }
  },

  onToggleGridLegend: function() {
    this.setData({ legendOpen: !this.data.legendOpen });
  },

  /** 给 grid cell 附加缓存状态（底色覆盖 + 动作标签） */
  applyCacheToGrid: function() {
    var grid = this.data.grid || [];
    var cache = this.data.scanCache || {};
    var patch = {};
    var totalDiffs = 0;
    for (var i = 0; i < grid.length; i++) {
      var cell = grid[i];
      var ck = cell.x + ':' + cell.y;
      var entry = cache[ck];
      // 当前是否有选中动作（用于颜色叠加）
      var hasCurrent = entry && CAGE_STATUS_ACTIONS.some(function (a) { return !!entry.currentActions[a.action]; });
      patch['grid[' + i + ']._cached'] = hasCurrent || false;
      if (hasCurrent) {
        var cur = entry.currentActions;
        // 累计当前选中动作的颜色（逗号分隔，供 getCellStyle 分色）—— 每个状态一色，多状态多色叠加
        var bgParts = [];
        CAGE_STATUS_ACTIONS.forEach(function (a) { if (cur[a.action]) bgParts.push(a.bg); });
        var bg = bgParts.join(',');
        patch['grid[' + i + ']._cachedBg'] = bg;
        var tmpCell = Object.assign({}, cell, { _cachedBg: bg });
        patch['grid[' + i + ']._cellStyle'] = getCellStyle(tmpCell);
      } else {
        patch['grid[' + i + ']._cachedBg'] = '';
        // 重建干净对象：cell 可能残留之前 setData 写入的 _cachedBg，导致 getCellStyle 误读
        var cleanCell = Object.assign({}, cell);
        cleanCell._cachedBg = '';
        patch['grid[' + i + ']._cellStyle'] = getCellStyle(cleanCell);
      }
      patch['grid[' + i + ']._cachedLast'] = !!(ck === this.data.lastScannedKey);
      // 累计差异数（新增 + 反选）
      if (entry) {
        var init = entry.initialActions || {};
        var curr = entry.currentActions || {};
        CAGE_STATUS_ACTIONS.forEach(function (a) { if (curr[a.action] !== init[a.action]) totalDiffs++; });
      }
    }
    patch.scanTotalActions = totalDiffs;
    patch.scanCacheSize = Object.keys(cache).length;
    // 顶部编辑预览条：只列有 diff 的笼位坐标标签（对齐 Web 编辑历史预览 / H5 缓存预览）
    var previews = [];
    for (var k in cache) {
      if (!Object.prototype.hasOwnProperty.call(cache, k)) continue;
      var e = cache[k];
      var pinit = (e && e.initialActions) || {};
      var pcur = (e && e.currentActions) || {};
      var diff = 0;
      CAGE_STATUS_ACTIONS.forEach(function (a) { if (pcur[a.action] !== pinit[a.action]) diff++; });
      if (diff > 0) {
        previews.push({
          key: k,
          position: (e && e.cell && (e.cell._displayPosition || e.cell.position)) || k,
          diff: diff
        });
      }
    }
    patch.cachePreviews = previews;
    this.setData(patch);
  },

  /** 切换动作选择 */
  onToggleAction: function(e) {
    var key = e.currentTarget.dataset.key;
    if (!key) return;
    var act = e.currentTarget.dataset.act;
    if (!act) return;
    // 路径 setData 确保嵌套数据可靠更新
    var path = 'scanCache.' + key + '.currentActions.' + act;
    var current = this.data.scanCache && this.data.scanCache[key] && this.data.scanCache[key].currentActions && this.data.scanCache[key].currentActions[act];
    var newVal = !current;
    // 同时更新扁平 lastScannedEntry
    var lsePath = 'lastScannedEntry.act_' + act;
    var patch = {};
    patch[path] = newVal;
    patch[lsePath] = newVal;
    this.setData(patch, this.applyCacheToGrid.bind(this));
  },

  /** 切换状态选项 → 写入 scanCache（对齐 Desktop：不在弹窗内直接提交） */
  onEditActionToggle: function(e) {
    var a = e.currentTarget.dataset.action;
    var cell = this.data.editActionCell;
    if (!cell || !a) return;
    var key = cell.x + ':' + cell.y;
    var cache = this.data.scanCache || {};
    var newCache = {};
    for (var k in cache) { if (Object.prototype.hasOwnProperty.call(cache, k)) newCache[k] = cache[k]; }
    if (!newCache[key]) {
      // 首次创建缓存条目：以表单值为真相源
      var ld = cell.detail || {};
      var initAct = cageStatus.actionsFromFormValues(this.data.editFormValues);
      newCache[key] = {
        cell: cell,
        code: ld.cageBoxCode || '',
        initialActions: Object.assign({}, initAct),
        currentActions: Object.assign({}, initAct)
      };
    }
    // 切换动作
    newCache[key].currentActions[a] = !newCache[key].currentActions[a];
    // 如果 currentActions 已恢复为初始状态，移除缓存条目
    var init = newCache[key].initialActions;
    var cur = newCache[key].currentActions;
    if (!CAGE_STATUS_ACTIONS.some(function (x) { return cur[x.action] !== init[x.action]; })) {
      delete newCache[key];
    }
    // 同步更新 editActionCurrent（弹窗内显示用）
    var ec = newCache[key] ? Object.assign({}, newCache[key].currentActions) : cageStatus.newActionState();
    this.setData({ scanCache: newCache, editActionCurrent: ec }, this.applyCacheToGrid.bind(this));
  },

  onEditActionChoosePhoto: function() {
    var self = this;
    wx.chooseImage({
      count: 6,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function(res) {
        if (!res.tempFilePaths || res.tempFilePaths.length === 0) return;
        self.setData({ editActionUploading: true });
        var uploaded = [];
        var next = function(idx) {
          if (idx >= res.tempFilePaths.length) {
            self.setData({ editActionUploading: false });
            if (uploaded.length > 0) {
              var cur = self.data.editActionPhotos || [];
              var np = cur.concat(uploaded);
              self.setData({ editActionPhotos: np });
              // 不再自动保存，统一由「保存标注」按钮提交
            }
            return;
          }
          springAuth.uploadFileDirect(res.tempFilePaths[idx], {}).then(function(url) {
            uploaded.push(url);
            next(idx + 1);
          }).catch(function() { next(idx + 1); });
        };
        next(0);
      }
    });
  },

  onEditActionRemovePhoto: function(e) {
    var idx = e.currentTarget.dataset.index;
    var photos = (this.data.editActionPhotos || []).slice();
    if (idx >= 0 && idx < photos.length) { photos.splice(idx, 1); this.setData({ editActionPhotos: photos }); }
  },

  onEditActionNoteInput: function(e) {
    this.setData({ editActionNote: e.detail.value || '' });
  },

  onEditActionSave: function() {
    var self = this;
    var cell = self.data.editActionCell;
    if (!cell) return;
    var animalCageId = cell.id || cell.animalCageId || '';
    if (!animalCageId) { wx.showToast({ title: '无法获取笼位ID', icon: 'none' }); return; }
    // 合并后端已有 statusPhotos
    springAuth.springRequest({ url: '/api/local/annotate/' + animalCageId, method: 'GET', data: {} }).then(function(res) {
      var up = unwrap(res);
      var sp = {};
      if (up.ok && up.data && up.data.statusPhotos) {
        try { var ex = typeof up.data.statusPhotos === 'string' ? JSON.parse(up.data.statusPhotos) : up.data.statusPhotos; if (typeof ex === 'object' && !Array.isArray(ex)) sp = ex; } catch(e) {}
      }
      var photos = self.data.editActionPhotos || [];
      cageStatus.statusPhotoKeys(cageStatus.actionsFromFormValues(self.data.editFormValues)).forEach(function (k) { sp[k] = photos; });
      if (photos.length > 0) sp._status = photos;
      var note = (self.data.editActionNote || '').trim();
      if (note) sp._note = note; // 标注文本存入 statusPhotos，与实验记录分离
      var body = { animalCageId: animalCageId, statusPhotos: JSON.stringify(sp) };
      return springAuth.springRequest({ url: '/api/local/annotate', method: 'POST', data: body });
    }).then(function() {
      wx.showToast({ title: '标注已保存', icon: 'success' });
    }).catch(function(e) {
      wx.showToast({ title: '保存失败: ' + ((e && e.message) || ''), icon: 'none' });
    });
  },

  onEditActionNewVersion: function() {
    var self = this;
    var cell = self.data.editActionCell;
    if (!cell) return;
    var animalCageId = cell.id || cell.animalCageId || '';
    if (!animalCageId) { wx.showToast({ title: '无法获取笼位ID', icon: 'none' }); return; }
    // 先GET已有数据，合并后POST，然后清空表单
    springAuth.springRequest({ url: '/api/local/annotate/' + animalCageId, method: 'GET', data: {} }).then(function(res) {
      var up = unwrap(res);
      var sp = {};
      if (up.ok && up.data && up.data.statusPhotos) {
        try { var ex = typeof up.data.statusPhotos === 'string' ? JSON.parse(up.data.statusPhotos) : up.data.statusPhotos; if (typeof ex === 'object' && !Array.isArray(ex)) sp = ex; } catch(e) {}
      }
      var photos = self.data.editActionPhotos || [];
      cageStatus.statusPhotoKeys(cageStatus.actionsFromFormValues(self.data.editFormValues)).forEach(function (k) { sp[k] = photos; });
      if (photos.length > 0) sp._status = photos;
      var note = (self.data.editActionNote || '').trim();
      if (note) sp._note = note;
      var body = { animalCageId: animalCageId, statusPhotos: JSON.stringify(sp) };
      return springAuth.springRequest({ url: '/api/local/annotate', method: 'POST', data: body });
    }).then(function() {
      // 清空表单 + 刷新历史
      self.setData({ editActionPhotos: [], editActionNote: '' });
      if (animalCageId) {
        springAuth.springRequest({ url: '/api/local/history/' + animalCageId, method: 'GET', data: {} }).then(function(res2) {
          var hp = unwrap(res2);
          var list = (hp.ok ? hp.data : []) || [];
          list.forEach(function(h) {
            try { h._imgs = JSON.parse(h.imagesJson || '[]'); } catch(e) { h._imgs = []; }
            if (h.createdAt) h.createdAt = (h.createdAt || '').substring(0, 16);
          });
          self.setData({ editHistory: list });
        }).catch(function(){});
      }
      wx.showToast({ title: '已归档为新记录', icon: 'success', duration: 2000 });
    }).catch(function(e) {
      wx.showToast({ title: '保存失败: ' + ((e && e.message) || ''), icon: 'none' });
    });
  },

  onEditActionJustClose: function() {
    this.setData({ editActionPopup: false, editActionCell: null, editActionPhotos: [], editActionNote: '', editHistory: [] });
  },

  onEditHistoryDelete: function(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '删除确认',
      content: '确定删除该条历史记录？',
      success: function(res) {
        if (!res.confirm) return;
        springAuth.springRequest({ url: '/api/local/history/' + id, method: 'DELETE', data: {} }).then(function() {
          var list = (self.data.editHistory || []).filter(function(h) { return h.id !== id; });
          self.setData({ editHistory: list });
          wx.showToast({ title: '已删除', icon: 'success' });
        }).catch(function() { wx.showToast({ title: '删除失败', icon: 'none' }); });
      }
    });
  },

  onEditActionClose: function() {
    var self = this;
    var cell = self.data.editActionCell;
    // 保存照片和备注到 statusPhotos
    if (cell && (self.data.editActionPhotos.length > 0 || self.data.editActionNote.trim())) {
      var animalCageId = cell.id || cell.animalCageId || '';
      if (animalCageId) {
        var sp = {};
        cageStatus.statusPhotoKeys(cageStatus.actionsFromFormValues(self.data.editFormValues)).forEach(function (k) { sp[k] = self.data.editActionPhotos; });
        sp._status = self.data.editActionPhotos;  // 兜底
        springAuth.springRequest({
          url: '/api/local/annotate', method: 'POST',
          data: { animalCageId: animalCageId, experimentDesc: self.data.editActionNote, statusPhotos: JSON.stringify(sp) }
        });
      }
    }
    self.setData({ editActionPopup: false, editActionCell: null, editActionPhotos: [], editActionNote: '' });
  },

  onEditActionSubmit: function() {
    var self = this;
    var cell = self.data.editActionCell;
    if (!cell) return;
    // Save photos first
    var animalCageId = cell.id || cell.animalCageId || '';
    if (animalCageId && (self.data.editActionPhotos.length > 0 || self.data.editActionNote.trim())) {
      var sp = {};
      var cur = self.data.editActionCurrent || {};
      CAGE_STATUS_ACTIONS.forEach(function (a) { if (cur[a.action]) sp[a.statusField] = self.data.editActionPhotos; });
      sp._status = self.data.editActionPhotos;  // 兜底
      springAuth.springRequest({
        url: '/api/local/annotate', method: 'POST',
        data: { animalCageId: animalCageId, experimentDesc: self.data.editActionNote, statusPhotos: JSON.stringify(sp) }
      });
    }
    // Submit actions
    var init = self.data.editActionInitial || {};
    var cur2 = self.data.editActionCurrent || {};
    var toAdd = [], toRemove = [];
    CAGE_STATUS_ACTIONS.forEach(function (a) {
      if (cur2[a.action] && !init[a.action]) toAdd.push(a.action);
      if (!cur2[a.action] && init[a.action]) toRemove.push(a.action);
    });
    if (toAdd.length === 0 && toRemove.length === 0) {
      self.onEditActionClose();
      return;
    }
    self.setData({ actionSubmitting: true });
    var ok=0, fail=0, total=toAdd.length+toRemove.length;
    var tasks = [];
    for (var i=0;i<toAdd.length;i++) {
      (function(action){
        var toggle = cageStatus.statusField(action);
        tasks.push(springAuth.springRequest({url:'/api/local/edit',method:'POST',data:{animalCageId:animalCageId,toggle:toggle,enable:true,cageBoxCode:''}}).then(function(){ok++;}).catch(function(){fail++;}));
      })(toAdd[i]);
    }
    for (var j=0;j<toRemove.length;j++) {
      (function(action){
        var toggle = cageStatus.statusField(action);
        tasks.push(springAuth.springRequest({url:'/api/local/edit',method:'POST',data:{animalCageId:animalCageId,toggle:toggle,enable:false,cageBoxCode:''}}).then(function(){ok++;}).catch(function(){fail++;}));
      })(toRemove[j]);
    }
    Promise.all(tasks).then(function(){
      self.setData({ actionSubmitting: false, editActionPopup: false, editActionCell: null, editActionPhotos: [], editActionNote: '' });
      if(fail===0){wx.showToast({title:'已完成 '+ok+' 个操作（本地+异步投递）',icon:'success'});self.onRetry();}
      else{wx.showToast({title:ok+' 成功 / '+fail+' 失败',icon:'none'});}
    });
  },

  onSubmitScanActions: function() {
    var self = this;
    var cache = self.data.scanCache || {};
    var addEntries = [];
    var removeEntries = [];
    for (var key in cache) {
      if (Object.prototype.hasOwnProperty.call(cache, key)) {
        var e = cache[key];
        var init = e.initialActions || {};
        var curr = e.currentActions || {};
        CAGE_STATUS_ACTIONS.forEach(function (a) {
          if (curr[a.action] && !init[a.action]) addEntries.push({ key: key, code: e.code, action: a.action, cell: e.cell });
          if (!curr[a.action] && init[a.action]) removeEntries.push({ key: key, code: e.code, action: a.action, cell: e.cell });
        });
      }
    }
    if (addEntries.length === 0 && removeEntries.length === 0) return;

    self.setData({ actionSubmitting: true });
    var okCount = 0, failCount = 0;
    var totalTasks = addEntries.concat(removeEntries.map(function(r) {
      return { key: r.key, code: r.code, action: r.action, cancel: true, cell: r.cell };
    }));

    var next = function(idx) {
      if (idx >= totalTasks.length) {
        self.setData({ actionSubmitting: false });
        if (failCount === 0) {
          wx.showToast({ title: '已完成 ' + okCount + ' 个操作（本地+异步投递）', icon: 'success', duration: 3000 });
          self.onRetry();
          self.onExitScanMode();
        } else {
          wx.showToast({ title: okCount + ' 成功 / ' + failCount + ' 失败', icon: 'none' });
        }
        return;
      }
      var entry = totalTasks[idx];
      var cageId = String(entry.cell.id || (entry.cell.animalCageId) || '');
      var toggle = cageStatus.statusField(entry.action);
      var enable = !entry.cancel;
      var data = {
        animalCageId: cageId,
        toggle: toggle,
        enable: enable,
        cageBoxCode: entry.code || ''
      };
      springAuth.springRequest({ url: '/api/local/edit', method: 'POST', data: data })
        .then(function(res) {
          var body = (res && typeof res.data === 'string') ? JSON.parse(res.data) : (res && res.data);
          if (body && body.success) { okCount++; } else { failCount++; }
          next(idx + 1);
        }).catch(function() { failCount++; next(idx + 1); });
    };
    next(0);
  }
});
