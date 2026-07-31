var springAuth = require('../../../utils/springAuth.js');
var pagePermission = require('../../../utils/pagePermission.js');
var { hasMinRole } = require('../../../utils/roleAccess.js');
var { readCustomNavMetrics } = require('../../../utils/customNavMetrics.js');

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

var STATUS_BG_PRIORITY = [
  "HEALTH_ABNORMAL", "NEED_DIVIDE", "ANIMAL_TRANSFER",
  "SPECIAL_FEEDING", "COHABITATION", "NORMAL"
];

var CAGE_TYPE_LABEL = { 1: "等待分配", 2: "已预约(空笼盒)", 3: "已预约(饲养中)", 4: "异常" };
var CAGE_TYPE_DOT_COLOR = { 1: "#f59e0b", 2: "#10b981", 3: "#f43f5e", 4: "#3b82f6" };
var CAGE_TYPE_ABBR = { 1: "待", 2: "空", 3: "饲", 4: "异" };

var STATUS_LABEL_MAP = {
  COHABITATION: "合笼/繁殖",
  SPECIAL_FEEDING: "特殊饲养",
  NEED_DIVIDE: "请分笼/密度超标",
  HEALTH_ABNORMAL: "动物健康异常",
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
    results.push({ code: "COHABITATION", label: "合笼/繁殖" });
  }
  if (yn("NeedFeedingYn")) {
    results.push({ code: "SPECIAL_FEEDING", label: "特殊饲养" });
  }
  if (yn("NeedDivideYn")) {
    results.push({ code: "NEED_DIVIDE", label: "请分笼/密度超标" });
  }
  if (yn("AbnormalHealthYn")) {
    results.push({ code: "HEALTH_ABNORMAL", label: "动物健康异常" });
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
    if (s.code !== "NORMAL" && DEFAULT_COLORS[s.code]) bgColors.push(DEFAULT_COLORS[s.code].bg);
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
  var c = DEFAULT_COLORS[code] || DEFAULT_COLORS["NORMAL"];
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
    return m ? (m[1] + '-' + (11 - parseInt(m[2]))) : p;
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
    if (bi["ClosingDate"]) parts.push("合笼");
    if (bi["NeedFeedingYn"] === 1) parts.push("特殊饲养");
    if (bi["NeedDivideYn"] === 1) parts.push("请分笼");
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

// 对齐 Web 端 CAGE_BOX_INFO_FIELD_ORDER：遍历 cageBoxInfo 全部字段
var DETAIL_FIELD_ORDER = [
  "AnimalCageType","PositionX","PositionY","AreaId","DepartmentName",
  "floorId","RoomName","ShelveName","ProjectPiName","MobilePhone",
  "AupNumber","CageBoxQrCode","createAdmin","CreateTime","UpdateTime",
  "SpecialBreedingName","specialBreedingDescription",
  "NeedDivideYn","NeedFeedingYn","NeedTransferYn","AbnormalHealthYn","ClosingDate",
  "State","StateName","HasPhysicalBox"
];

var DETAIL_FIELD_LABEL = {
  AnimalCageType:"笼位类型",PositionX:"X 坐标",PositionY:"Y 坐标",
  AreaId:"区域 ID",DepartmentName:"部门",floorId:"楼层 ID",
  RoomName:"房间名称",ShelveName:"笼架名称",ProjectPiName:"课题 PI",
  MobilePhone:"手机号",AupNumber:"AUP 编号",CageBoxQrCode:"笼盒卡号",
  createAdmin:"创建人",CreateTime:"创建时间",UpdateTime:"更新时间",
  SpecialBreedingName:"特殊饲养名称",specialBreedingDescription:"特殊饲养说明",
  NeedDivideYn:"请分笼",NeedFeedingYn:"特殊饲养",NeedTransferYn:"动物转移",
  AbnormalHealthYn:"健康异常",ClosingDate:"合笼日期",
  State:"状态值",StateName:"状态名称",HasPhysicalBox:"是否有实体笼盒"
};

function formatDetailValue(v) {
  if (v === null || v === undefined || v === '') return null; // 空值不展示
  if (typeof v === 'boolean') return v ? '是' : '否';
  return String(v);
}

function buildDetailFields(cell) {
  var source = cell.cageBoxInfo || cell.detail || {};
  var fields = [];
  for (var i = 0; i < DETAIL_FIELD_ORDER.length; i++) {
    var k = DETAIL_FIELD_ORDER[i];
    var v = source[k];
    var display = formatDetailValue(v);
    if (display === null) continue; // 跳过空值
    // 翻译 AnimalCageType 数字
    if (k === 'AnimalCageType') {
      var ct = Number(v);
      display = CAGE_TYPE_LABEL[ct] || display;
    }
    fields.push({ key: k, label: DETAIL_FIELD_LABEL[k] || k, value: display });
  }
  return fields;
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
    scanMode: false,
    scannedCellX: -1,
    scannedCellY: -1,
    scannedPosition: '',
    scannedCageBoxCode: '',
    legendOpen: false,
    scanCache: {},               // { "x:y": { cell, code, actions: {DIVIDE, SPECIAL_BREEDING, HEALTH_CHECK} } }
    scanCacheSize: 0,
    scanTotalActions: 0,
    lastScannedKey: '',
    lastScannedEntry: { position: '', code: '', act_DIVIDE: false, act_SPECIAL_BREEDING: false, act_HEALTH_CHECK: false },
    actionSubmitting: false,
    editMode: false,
    bindMode: false,
    bindScannedCode: '',
    bindSelectedKey: '',
    unbindActive: false,
    bindPairCache: [],       // [{ key: "x:y", cell, code }] 批量绑定缓存（数组）
    bindPairCacheSize: 0,
    bindSubmitting: false,
    navBarHeight: 64,

    // Cell detail（对齐 Web CellDetailPanel / MobileCageCellDetailDialog）
    selectedCell: null,
    cellDetailMeta: null,
    showCellDetail: false,
    detailRichText: "",
    detailImageUrls: "",
    detailImagePreviewUrls: [],
    detailAnnotationLoading: false,
    detailFields: [],
    detailSaving: false,
    detailSaveMsg: "",
    detailSaveMsgType: "",
    detailQrImageSrc: "",
    detailImageUploading: false,
    // 教职工详情弹窗动作
    detailActions: { DIVIDE: false, SPECIAL_BREEDING: false, HEALTH_CHECK: false },
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
      self.loadShelfDetail(self.data.selectedShelf ? self.data.selectedShelf.shelveId : '');
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
        // 反转显示坐标
        cages.forEach(function(c) {
          var m = /^([A-H])-(\d+)$/.exec(c.position || '');
          c._displayPosition = m ? (m[1] + '-' + (11 - parseInt(m[2]))) : (c.position || '');
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

  loadShelfDetail: function(shelveId) {
    var self = this;
    self.setData({ loading: true, error: '', screen: 'grid' });

    springAuth.springRequest({
      url: '/api/student/mobile/cage-shelves/' + shelveId + '/detail' + (self.data.editMode || self.data.bindMode ? '?realtime=true' : ''),
      method: 'GET',
      data: {}
    }).then(function(res) {
      var p = unwrap(res);
      if (!p.ok) {
        self.setData({ loading: false, error: p.message });
        return;
      }
      var data = p.data || {};
      var shelfMeta = data.shelfMeta || {};
      var gridCells = data.grid || [];
      var totalCells = data.totalCells || 80;
      var filledCells = data.filledCells || 0;
      var grid = buildGrid(gridCells);

      self.setData({
        loading: false,
        error: '',
        selectedShelf: shelfMeta,
        grid: grid,
        gridMeta: shelfMeta,
        filledCount: filledCells,
        totalCells: totalCells,
        showCellDetail: false,
        selectedCell: null
      });
    }).catch(function(e) {
      self.setData({ loading: false, error: (e && e.message) || '加载失败' });
    });
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
      scanMode: false,
      scannedCellX: -1,
      scannedCellY: -1,
      scannedPosition: '',
      scannedCageBoxCode: '',
      scanCache: {},
      lastScannedKey: '',
      editMode: false,
      bindMode: false,
      bindScannedCode: '',
      bindSelectedKey: '',
      unbindActive: false,
      showCellDetail: false,
      selectedCell: null,
      cellDetailMeta: null,
      detailRichText: "",
      detailImageUrls: "",
      detailImagePreviewUrls: [],
      detailQrImageSrc: ""
    });
  },

  /* ------------------------------------------------------------------ */
  /*  Cell Interaction                                                    */
  /* ------------------------------------------------------------------ */

  onCellTap: function(e) {
    var self = this;
    // 绑定模式：触发绑定流程，不打开详情
    if (self.data.bindMode) {
      self.onBindCellTap(e);
      return;
    }
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

    var detailMeta = buildCellDetailMeta(cell, self.data.gridMeta);
    // 1) 从缓存读取（diff 模型：initialActions=服务端快照，currentActions=用户修改后状态）
    var ck = x + ':' + y;
    var cacheEntry = (self.data.scanCache || {})[ck];
    var initialActions = { DIVIDE: false, SPECIAL_BREEDING: false, HEALTH_CHECK: false };
    var currentActions = { DIVIDE: false, SPECIAL_BREEDING: false, HEALTH_CHECK: false };
    if (cacheEntry && cacheEntry.initialActions && cacheEntry.currentActions) {
      // 缓存已有 diff 记录 → 分别读取基准和当前值（支持 1→0 反选三态显示）
      initialActions.DIVIDE = !!cacheEntry.initialActions.DIVIDE;
      initialActions.SPECIAL_BREEDING = !!cacheEntry.initialActions.SPECIAL_BREEDING;
      initialActions.HEALTH_CHECK = !!cacheEntry.initialActions.HEALTH_CHECK;
      currentActions.DIVIDE = !!cacheEntry.currentActions.DIVIDE;
      currentActions.SPECIAL_BREEDING = !!cacheEntry.currentActions.SPECIAL_BREEDING;
      currentActions.HEALTH_CHECK = !!cacheEntry.currentActions.HEALTH_CHECK;
    } else {
      // 2) 无缓存 → 从 cageBoxInfo 预选（兼容扁平 gridCache 和嵌套 snapshot 两种结构）
      var cbi = cell.cageBoxInfo || {};
      var cvo = cbi.cageBoxVo || cbi['cageBoxVo'] || {};
      if (cbi.NeedDivideYn === 1 || cbi.NeedDivideYn === "1" || cvo.needDivideYn === 1 || cvo.needDivideYn === "1") currentActions.DIVIDE = true;
      if (cbi.NeedFeedingYn === 1 || cbi.NeedFeedingYn === "1" || cvo.needFeedingYn === 1 || cvo.needFeedingYn === "1" || (typeof cbi.specialBreedingName === 'string' && cbi.specialBreedingName.trim()) || (typeof cvo.specialBreedingName === 'string' && cvo.specialBreedingName.trim())) currentActions.SPECIAL_BREEDING = true;
      if (cbi.AbnormalHealthYn === 1 || cbi.AbnormalHealthYn === "1" || cvo.abnormalHealthYn === 1 || cvo.abnormalHealthYn === "1" || cbi.animalHealthEntity != null || cvo.animalHealthEntity != null) currentActions.HEALTH_CHECK = true;
      initialActions = JSON.parse(JSON.stringify(currentActions));
    }

    this.initialDetailActions = JSON.parse(JSON.stringify(initialActions));

    self.setData({
      selectedCell: cell,
      cellDetailMeta: detailMeta,
      detailFields: buildDetailFields(cell),
      showCellDetail: true,
      detailRichText: "",
      detailImageUrls: "",
      detailImagePreviewUrls: [],
      detailAnnotationLoading: detailMeta.permitted,
      detailSaving: false,
      detailSaveMsg: "",
      detailSaveMsgType: "",
      detailQrImageSrc: "",
      detailActions: JSON.parse(JSON.stringify(currentActions)),
      initialDetailActions: JSON.parse(JSON.stringify(initialActions))
    });

    if (detailMeta.permitted) {
      self.loadCellAnnotation(cell);
      if (cell.cageBoxQrCode) {
        setTimeout(function() { self.drawCageQrCode(cell.cageBoxQrCode); }, 280);
      }
    }
  },

  loadCellAnnotation: function(cell) {
    var self = this;
    var shelveId = getActiveShelveId(self.data);
    if (!shelveId || !cell) {
      self.setData({ detailAnnotationLoading: false });
      return;
    }
    springAuth.springRequest({
      url: "/api/student/mobile/cage-shelves/" + shelveId + "/cells/" + cell.x + "/" + cell.y + "/annotation",
      method: "GET",
      data: {}
    }).then(function(res) {
      var p = unwrap(res);
      if (!p.ok) {
        self.setData({ detailAnnotationLoading: false });
        return;
      }
      var a = p.data;
      if (!a) {
        self.setData({ detailAnnotationLoading: false });
        return;
      }
      var imageUrls = "";
      var previews = [];
      if (a.images) {
        try {
          var arr = JSON.parse(a.images);
          if (Array.isArray(arr)) {
            imageUrls = arr.join("\n");
            previews = arr.slice();
          }
        } catch (err) {
          imageUrls = String(a.images);
          previews = parseImageUrlLines(imageUrls);
        }
      }
      self.setData({
        detailRichText: a.richText || "",
        detailImageUrls: imageUrls,
        detailImagePreviewUrls: previews,
        detailAnnotationLoading: false
      });
    }).catch(function() {
      self.setData({ detailAnnotationLoading: false });
    });
  },

  onDetailRichTextInput: function(e) {
    this.setData({ detailRichText: e.detail.value || "" });
  },

  onDetailImageUrlsInput: function(e) {
    var text = e.detail.value || "";
    this.setData({
      detailImageUrls: text,
      detailImagePreviewUrls: parseImageUrlLines(text)
    });
  },

  onDetailImageError: function(e) {
    var url = e.currentTarget.dataset.url;
    if (!url) return;
    var previews = (this.data.detailImagePreviewUrls || []).filter(function(u) { return u !== url; });
    this.setData({ detailImagePreviewUrls: previews });
  },

  /** 选择并上传图片（对齐 H5 MobileCageCellDetailDialog） */
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
              // 追加到已有 URL 列表
              var existing = parseImageUrlLines(self.data.detailImageUrls);
              var merged = existing.concat(uploaded);
              self.setData({
                detailImageUrls: merged.join('\n'),
                detailImagePreviewUrls: merged.slice()
              });
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
    var shelveId = getActiveShelveId(self.data);
    if (!cell || !shelveId || self.data.detailSaving) return;
    if (!self.data.cellDetailMeta || !self.data.cellDetailMeta.permitted) return;

    var imgArr = parseImageUrlLines(self.data.detailImageUrls);
    var payload = { position: cell.position };
    if (self.data.detailRichText) payload.richText = self.data.detailRichText;
    if (imgArr.length > 0) payload.images = JSON.stringify(imgArr);

    self.setData({ detailSaving: true, detailSaveMsg: "", detailSaveMsgType: "" });

    springAuth.springRequest({
      url: "/api/student/mobile/cage-shelves/" + shelveId + "/cells/" + cell.x + "/" + cell.y + "/annotation",
      method: "PUT",
      data: payload
    }).then(function(res) {
      var p = unwrap(res);
      if (!p.ok) {
        self.setData({
          detailSaving: false,
          detailSaveMsg: p.message || "保存失败",
          detailSaveMsgType: "err"
        });
        return;
      }
      // 保存后仅更新标注表单状态，禁止整表 load — post-save-no-full-refresh.mdc
      self.setData({
        detailSaving: false,
        detailSaveMsg: "保存成功",
        detailSaveMsgType: "ok",
        detailImagePreviewUrls: imgArr.slice()
      });
      setTimeout(function() {
        if (self.data.detailSaveMsgType === "ok") {
          self.setData({ detailSaveMsg: "", detailSaveMsgType: "" });
        }
      }, 2000);
    }).catch(function(e) {
      self.setData({
        detailSaving: false,
        detailSaveMsg: (e && e.message) || "保存失败",
        detailSaveMsgType: "err"
      });
    });
  },

  drawCageQrCode: function(qrText) {
    var self = this;
    if (!qrText) return;
    self.setData({ detailQrImageSrc: "" });
    try {
      var drawQrcode = require("../../../libs/weapp-qrcode.js");
      var dpr = Math.min(3, Math.max(1, (wx.getSystemInfoSync() && wx.getSystemInfoSync().pixelRatio) || 2));
      drawQrcode({
        width: 160,
        height: 160,
        canvasId: "cageQrCanvasOffscreen",
        text: String(qrText),
        _this: self,
        callback: function() {
          wx.canvasToTempFilePath({
            canvasId: "cageQrCanvasOffscreen",
            width: 160,
            height: 160,
            destWidth: Math.floor(160 * dpr),
            destHeight: Math.floor(160 * dpr),
            success: function(res) {
              if (res && res.tempFilePath) {
                self.setData({ detailQrImageSrc: res.tempFilePath });
              }
            }
          }, self);
        }
      });
    } catch (err) {
      console.warn("[studentCageShelf] qrcode", err);
    }
  },

  onCloseCellDetail: function() {
    this._closeDetail();
  },

  _closeDetail: function() {
    this.setData({
      showCellDetail: false,
      selectedCell: null,
      cellDetailMeta: null,
      detailRichText: "",
      detailImageUrls: "",
      detailImagePreviewUrls: [],
      detailAnnotationLoading: false,
      detailFields: [],
      detailSaving: false,
      detailSaveMsg: "",
      detailSaveMsgType: "",
      detailQrImageSrc: "",
      detailImageUploading: false,
      detailActions: { DIVIDE: false, SPECIAL_BREEDING: false, HEALTH_CHECK: false },
      initialDetailActions: { DIVIDE: false, SPECIAL_BREEDING: false, HEALTH_CHECK: false },
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
    var newActions = { DIVIDE: old.DIVIDE, SPECIAL_BREEDING: old.SPECIAL_BREEDING, HEALTH_CHECK: old.HEALTH_CHECK };
    newActions[act] = !newActions[act];
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
        newCache[ck] = { cell: cell, code: code, initialActions: { DIVIDE: this.initialDetailActions.DIVIDE, SPECIAL_BREEDING: this.initialDetailActions.SPECIAL_BREEDING, HEALTH_CHECK: this.initialDetailActions.HEALTH_CHECK }, currentActions: { DIVIDE: newActions.DIVIDE, SPECIAL_BREEDING: newActions.SPECIAL_BREEDING, HEALTH_CHECK: newActions.HEALTH_CHECK } };
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

  /** 教职工扫码：调用 wx.scanCode */
  onGridScanTap: function() {
    var self = this;
    if (!self.data.staffView) {
      wx.showToast({ title: '仅教职工可用', icon: 'none' });
      return;
    }
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode', 'barCode'],
      success: function(res) {
        self.handleScanResult(res.result);
      },
      fail: function(err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '扫码失败', icon: 'none' });
        }
      }
    });
  },

  /** 匹配扫码结果 → 加入缓存 */
  handleScanResult: function(code) {
    var grid = this.data.grid || [];
    var matched = null;
    for (var i = 0; i < grid.length; i++) {
      var cell = grid[i];
      if (!cell || cell.empty) continue;
      // 对齐 H5：顶层 cell.cageBoxCode → cageBoxInfo 扁平 → cageBoxVo 嵌套 三级回退
      var cellCode = cell.cageBoxCode || '';
      if (!cellCode) {
        var cbi = cell.cageBoxInfo;
        if (cbi) {
          cellCode = cbi.cageBoxCode || cbi['cageBoxCode'];
          if (!cellCode) {
            var cvo = (cbi.cageBoxVo || cbi['cageBoxVo']) || {};
            cellCode = cvo.cageBoxCode || cvo['cageBoxCode'] || '';
          }
        }
      }
      if (String(cellCode) === String(code)) {
        matched = cell;
        break;
      }
    }
    if (!matched) {
      wx.showToast({ title: '未找到笼盒 ' + code, icon: 'none' });
      return;
    }
    var key = matched.x + ':' + matched.y;
    var oldCache = this.data.scanCache || {};
    var newCache = {};
    for (var k in oldCache) { if (Object.prototype.hasOwnProperty.call(oldCache, k)) newCache[k] = oldCache[k]; }
    if (!newCache[key]) {
      // 预选：从 cageBoxInfo 读取当前状态（兼容扁平 gridCache 和嵌套 snapshot 结构）
      var cbi = matched.cageBoxInfo || {};
      var cvo = cbi.cageBoxVo || cbi['cageBoxVo'] || {};
      var preActions = {
        DIVIDE: !!(cbi.NeedDivideYn === 1 || cbi.NeedDivideYn === "1" || cvo.needDivideYn === 1 || cvo.needDivideYn === "1"),
        SPECIAL_BREEDING: !!(cbi.NeedFeedingYn === 1 || cbi.NeedFeedingYn === "1" || cvo.needFeedingYn === 1 || cvo.needFeedingYn === "1" || (typeof cbi.specialBreedingName === 'string' && cbi.specialBreedingName.trim()) || (typeof cvo.specialBreedingName === 'string' && cvo.specialBreedingName.trim())),
        HEALTH_CHECK: !!(cbi.AbnormalHealthYn === 1 || cbi.AbnormalHealthYn === "1" || cvo.abnormalHealthYn === 1 || cvo.abnormalHealthYn === "1" || cbi.animalHealthEntity != null || cvo.animalHealthEntity != null)
      };
      newCache[key] = { cell: matched, code: String(code), initialActions: { DIVIDE: preActions.DIVIDE, SPECIAL_BREEDING: preActions.SPECIAL_BREEDING, HEALTH_CHECK: preActions.HEALTH_CHECK }, currentActions: { DIVIDE: preActions.DIVIDE, SPECIAL_BREEDING: preActions.SPECIAL_BREEDING, HEALTH_CHECK: preActions.HEALTH_CHECK } };
    }
    var entry = newCache[key];
    this.setData({
      scanCache: newCache,
      scanCacheSize: Object.keys(newCache).length,
      lastScannedKey: key,
      lastScannedEntry: {
        position: matched._displayPosition || matched.position || '',
        code: String(code),
        act_DIVIDE: entry.currentActions.DIVIDE,
        act_SPECIAL_BREEDING: entry.currentActions.SPECIAL_BREEDING,
        act_HEALTH_CHECK: entry.currentActions.HEALTH_CHECK
      },
      scannedCellX: matched.x,
      scannedCellY: matched.y,
      legendOpen: false
    }, this.applyCacheToGrid.bind(this));
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
        if (curr.DIVIDE !== init.DIVIDE || curr.SPECIAL_BREEDING !== init.SPECIAL_BREEDING || curr.HEALTH_CHECK !== init.HEALTH_CHECK) {
          newCache[k] = e;
          hasKept = true;
        }
      }
    }
    this.setData({
      scanCache: newCache,
      scanCacheSize: Object.keys(newCache).length,
      lastScannedKey: '',
      lastScannedEntry: { position: '', code: '', act_DIVIDE: false, act_SPECIAL_BREEDING: false, act_HEALTH_CHECK: false },
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
      detailActions: { DIVIDE: false, SPECIAL_BREEDING: false, HEALTH_CHECK: false }
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
    self.setData({ editMode: next, bindMode: false, bindScannedCode: '', bindSelectedKey: '', unbindActive: false });
    if (next && self.data.selectedShelf && self.data.selectedShelf.shelveId) {
      // 进入编辑模式 → 刷新实时数据
      springAuth.springRequest({
        url: '/api/v1/cage-shelves/' + self.data.selectedShelf.shelveId + '/refresh',
        method: 'POST',
        data: {}
      }).then(function() {
        self.loadShelfDetail(self.data.selectedShelf.shelveId);
      }).catch(function() {
        self.loadShelfDetail(self.data.selectedShelf.shelveId);
      });
    } else {
      // 退出编辑模式 → 清除缓存、定位、交叉高亮
      self.setData({
        scanCache: {},
        lastScannedKey: '',
        scannedCellX: -1,
        scannedCellY: -1,
        detailActions: { DIVIDE: false, SPECIAL_BREEDING: false, HEALTH_CHECK: false }
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
      var hasCurrent = entry && (entry.currentActions.DIVIDE || entry.currentActions.SPECIAL_BREEDING || entry.currentActions.HEALTH_CHECK);
      patch['grid[' + i + ']._cached'] = hasCurrent || false;
      if (hasCurrent) {
        var cur = entry.currentActions;
        // 累计当前选中动作的颜色（逗号分隔，供 getCellStyle 分色）
        var bgParts = [];
        if (cur.DIVIDE) bgParts.push('#fef08a');
        if (cur.SPECIAL_BREEDING) bgParts.push('#fecaca');
        if (cur.HEALTH_CHECK) bgParts.push('#e9d5ff');
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
        if (curr.DIVIDE !== init.DIVIDE) totalDiffs++;
        if (curr.SPECIAL_BREEDING !== init.SPECIAL_BREEDING) totalDiffs++;
        if (curr.HEALTH_CHECK !== init.HEALTH_CHECK) totalDiffs++;
      }
    }
    patch.scanTotalActions = totalDiffs;
    patch.scanCacheSize = Object.keys(cache).length;
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

  // Action → CancelColor 映射
  ACTION_CANCEL_COLOR: { DIVIDE: 2, SPECIAL_BREEDING: 1, HEALTH_CHECK: 3 },

  /** 提交全部缓存 */
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
        if (curr.DIVIDE && !init.DIVIDE) addEntries.push({ key: key, code: e.code, action: 'DIVIDE' });
        if (curr.SPECIAL_BREEDING && !init.SPECIAL_BREEDING) addEntries.push({ key: key, code: e.code, action: 'SPECIAL_BREEDING' });
        if (curr.HEALTH_CHECK && !init.HEALTH_CHECK) addEntries.push({ key: key, code: e.code, action: 'HEALTH_CHECK' });
        if (!curr.DIVIDE && init.DIVIDE) removeEntries.push({ key: key, code: e.code, action: 'DIVIDE' });
        if (!curr.SPECIAL_BREEDING && init.SPECIAL_BREEDING) removeEntries.push({ key: key, code: e.code, action: 'SPECIAL_BREEDING' });
        if (!curr.HEALTH_CHECK && init.HEALTH_CHECK) removeEntries.push({ key: key, code: e.code, action: 'HEALTH_CHECK' });
      }
    }
    if (addEntries.length === 0 && removeEntries.length === 0) return;

    var meta = self.data.gridMeta || {};
    var roomId = String(meta.roomId || (self.data.selectedShelf && self.data.selectedShelf.roomId) || '');
    var shelveId = String((self.data.selectedShelf && self.data.selectedShelf.shelveId) || '');

    self.setData({ actionSubmitting: true });
    var okCount = 0, failCount = 0;
    var totalTasks = addEntries.concat(removeEntries.map(function(r) {
      return { key: r.key, code: r.code, action: r.action, cancel: true };
    }));

    var next = function(idx) {
      if (idx >= totalTasks.length) {
        self.setData({ actionSubmitting: false });
        if (failCount === 0) {
          wx.showToast({ title: '已完成 ' + okCount + ' 个操作', icon: 'success', duration: 3000 });
          self.onRetry(); // 先刷新实时数据（editMode 仍为 true）
          self.onExitScanMode(); // 再退出编辑模式
        } else {
          wx.showToast({ title: okCount + ' 成功 / ' + failCount + ' 失败', icon: 'none' });
        }
        return;
      }
      var entry = totalTasks[idx];
      var url, data;
      if (entry.cancel) {
        var color = self.ACTION_CANCEL_COLOR[entry.action];
        url = '/api/aro/cage-box/cancel';
        data = { roomId: roomId, shelveId: shelveId, cageBoxCode: entry.code, color: color };
      } else {
        url = '/api/aro/cage-box/action';
        data = { roomId: roomId, shelveId: shelveId, cageBoxCode: entry.code, action: entry.action };
      }
      springAuth.springRequest({ url: url, method: 'POST', data: data })
        .then(function(res) {
          var body = (res && typeof res.data === 'string') ? JSON.parse(res.data) : (res && res.data);
          if (body && body.success) { okCount++; } else { failCount++; }
          next(idx + 1);
        }).catch(function() { failCount++; next(idx + 1); });
    };
    next(0);
  },

  /* ── 绑定模式 ── */

  /** 进入绑定模式 */
  onEnterBindMode: function() {
    if (!this.data.staffView) {
      wx.showToast({ title: '仅教职工可用', icon: 'none' });
      return;
    }
    // 进入绑定模式 → 退出编辑 → 加载实时数据
    this.setData({ bindMode: true, editMode: false, bindScannedCode: '', bindSelectedKey: '', unbindActive: false, bindPairCache: [], bindPairCacheSize: 0, scanCache: {}, lastScannedKey: '' });
    this.loadShelfDetail(this.data.selectedShelf ? this.data.selectedShelf.shelveId : '');
  },

  /** 退出绑定模式 */
  onExitBindMode: function() {
    if (this.data.bindPairCacheSize > 0) {
      var self = this;
      wx.showModal({
        title: '未提交的绑定',
        content: '有 ' + self.data.bindPairCacheSize + ' 个未提交的绑定，是否放弃？',
        success: function(res) {
          if (res.confirm) {
            self.setData({ bindMode: false, bindScannedCode: '', bindSelectedKey: '', unbindActive: false, bindPairCache: [], bindPairCacheSize: 0 });
            self.loadShelfDetail(self.data.selectedShelf ? self.data.selectedShelf.shelveId : '');
          }
        }
      });
      return;
    }
    this.setData({ bindMode: false, bindScannedCode: '', bindSelectedKey: '', unbindActive: false, bindPairCache: [], bindPairCacheSize: 0 });
    this.loadShelfDetail(this.data.selectedShelf ? this.data.selectedShelf.shelveId : '');
  },

  /** 绑定扫码 */
  onBindScanTap: function() {
    var self = this;
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode', 'barCode'],
      success: function(res) {
        var code = res.result;
        console.log('[bind-scan] 扫码结果:', code);
        self.setData({ bindScannedCode: code, bindSelectedKey: '' });
        wx.showToast({ title: '已录入，请点击空笼盒格位', icon: 'success', duration: 3000 });
      },
      fail: function(err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '扫码失败', icon: 'none' });
        }
      }
    });
  },

  /** 切换解绑/取消（3态） */
  onToggleUnbind: function() {
    if (this.data.unbindActive) { this.setData({ unbindActive: false, bindSelectedKey: '' }); return; }
    if (this.data.bindScannedCode) { this.setData({ bindScannedCode: '', bindSelectedKey: '' }); return; }
    this.setData({ unbindActive: true, bindSelectedKey: '' });
    wx.showToast({ title: '请点击饲养中格位完成解绑', icon: 'none', duration: 3000 });
  },

  /** 绑定模式下点击笼位：case2=绑定 / case3=解绑 */
  onBindCellTap: function(e) {
    var self = this;
    var x = Number(e.currentTarget.dataset.x);
    var y = Number(e.currentTarget.dataset.y);
    var grid = self.data.grid;
    var cell = null;
    for (var i = 0; i < grid.length; i++) {
      if (Number(grid[i].x) === x && Number(grid[i].y) === y) {
        cell = grid[i];
        break;
      }
    }
    if (!cell || cell.empty) return;
    var animalCageType = cell.animalCageType || (cell.cageBoxInfo && cell.cageBoxInfo.AnimalCageType) || 0;

    // case 2: 绑定 → 加入批量缓存
    if (animalCageType === 2) {
      if (self.data.unbindActive) { wx.showToast({ title: '无需解绑', icon: 'none' }); return; }
      if (!self.data.bindScannedCode) { wx.showToast({ title: '请先扫码获取笼盒编号', icon: 'none' }); return; }
      var key2 = cell.x + ':' + cell.y;
      // 检查重复
      var dup = false;
      var arr = self.data.bindPairCache;
      for (var d = 0; d < arr.length; d++) { if (arr[d].key === key2) { dup = true; break; } }
      if (dup) { wx.showToast({ title: '该笼位已在缓存中', icon: 'none' }); return; }
      var displayPos = cell._displayPosition || cell.position || '';
      var newArr = arr.concat([{ key: key2, cell: cell, pos: displayPos, code: self.data.bindScannedCode }]);
      self.setData({ bindPairCache: newArr, bindPairCacheSize: newArr.length, bindScannedCode: '', bindSelectedKey: key2 });
      wx.showToast({ title: '已缓存（' + newArr.length + ' 个待提交）', icon: 'success' });
      return;
    }

    // case 3: 解绑
    if (animalCageType === 3) {
      if (!self.data.unbindActive) { wx.showToast({ title: '请先进入解绑模式', icon: 'none' }); return; }
      var key3 = cell.x + ':' + cell.y;
      self.setData({ bindSelectedKey: key3 });
      var pi3 = cell.piName || (cell.cageBoxInfo && cell.cageBoxInfo.ProjectPiName) || '';
      wx.showModal({
        title: '确认解绑',
        content: '目标笼位：' + (cell.position || '') + (pi3 ? '\n课题组 PI：' + pi3 : '') + '\n\n解绑后恢复空笼盒状态',
        success: function(res) {
          if (!res.confirm) { self.setData({ bindSelectedKey: '' }); return; }
          self.doUnbindCage(cell);
        }
      });
      return;
    }

    wx.showToast({ title: animalCageType === 1 ? '该笼位尚未预约' : '该笼位状态异常', icon: 'none' });
  },

  /** 批量绑定提交（并行调用） */
  onBatchBindSubmit: function() {
    var self = this;
    var arr = self.data.bindPairCache;
    if (arr.length === 0) return;
    self.setData({ bindSubmitting: true });
    var meta = self.data.gridMeta || {};
    var roomId = String(meta.roomId || (self.data.selectedShelf && self.data.selectedShelf.roomId) || '');
    var ok = 0, fail = 0, total = arr.length;
    var promises = [];
    for (var i = 0; i < arr.length; i++) {
      var entry = arr[i];
      var cageId = String(entry.cell.id || '');
      (function(cid, code, pos) {
        promises.push(new Promise(function(resolve) {
          springAuth.springRequest({
            url: '/aro/cage-box/bind',
            method: 'POST',
            data: { animalCageId: cid, cageBoxCode: code, roomId: roomId }
          }).then(function(res) {
            var body = (res && typeof res.data === 'string') ? JSON.parse(res.data) : (res && res.data);
            if (body && body.success) { ok++; } else { fail++; if (fail <= 3) wx.showToast({ title: pos + ' 失败', icon: 'none' }); }
            resolve();
          }).catch(function() { fail++; resolve(); });
        }));
      })(cageId, entry.code, entry.cell.position);
    }
    Promise.all(promises).then(function() {
      self.setData({ bindPairCache: [], bindPairCacheSize: 0, bindSubmitting: false, bindScannedCode: '', bindSelectedKey: '' });
      if (fail === 0) { wx.showToast({ title: total + ' 个绑定全部成功！', icon: 'success' }); }
      else { wx.showToast({ title: ok + ' 成功 / ' + fail + ' 失败', icon: 'none' }); }
      self.onRetry();
    });
  },

  /** 清空绑定缓存 */
  onClearBindCache: function() {
    this.setData({ bindPairCache: [], bindPairCacheSize: 0 });
    wx.showToast({ title: '已清空缓存', icon: 'none' });
  },

  /** 移除单个绑定缓存 */
  onRemoveBindPair: function(e) {
    var key = e.currentTarget.dataset.key;
    var arr = this.data.bindPairCache;
    var newArr = [];
    for (var i = 0; i < arr.length; i++) { if (arr[i].key !== key) newArr.push(arr[i]); }
    this.setData({ bindPairCache: newArr, bindPairCacheSize: newArr.length });
  },

  /** 执行绑定（单个，保留兼容） */
  doBindCage: function(cell, cageBoxCode) {
    var self = this;
    var meta = self.data.gridMeta || {};
    var cageId = String(cell.id || '');
    var cageName = String(cell.name || '');
    var roomId = String(meta.roomId || (self.data.selectedShelf && self.data.selectedShelf.roomId) || '');
    var shelveId = String((self.data.selectedShelf && self.data.selectedShelf.shelveId) || '');

    wx.showLoading({ title: '绑定中...' });
    springAuth.springRequest({
      url: '/aro/cage-box/bind',
      method: 'POST',
      data: { animalCageId: cageId, cageBoxCode: cageBoxCode }
    }).then(function(res) {
      var body = (res && typeof res.data === 'string') ? JSON.parse(res.data) : (res && res.data);
      if (!body || !body.success) {
        wx.hideLoading();
        wx.showToast({ title: '关联失败: ' + (body && body.message || ''), icon: 'none' });
        return Promise.reject('bind failed');
      }
      return springAuth.springRequest({
        url: '/api/v1/cage-shelves/cage/update',
        method: 'POST',
        data: { id: cageId, name: cageName, roomId: roomId, shelveId: shelveId, postionX: cell.x || 0, postionY: cell.y || 0, qrcode: cageBoxCode, state: 3 }
      });
    }).then(function(res) {
      wx.hideLoading();
      var body = (res && typeof res.data === 'string') ? JSON.parse(res.data) : (res && res.data);
      if (body && body.success) {
        wx.showToast({ title: '绑定成功！', icon: 'success' });
        self.onRetry(); // 先刷新（bindMode 仍为 true 拉实时）
        self.onExitBindMode();
      } else {
        wx.showToast({ title: '更新失败: ' + (body && body.message || ''), icon: 'none' });
      }
    }).catch(function(err) {
      wx.hideLoading();
      if (err !== 'bind failed') wx.showToast({ title: '绑定失败', icon: 'none' });
    });
  },

  /** 执行解绑：update state=2 + 清空 qrcode */
  doUnbindCage: function(cell) {
    var self = this;
    var meta = self.data.gridMeta || {};
    var cageId = String(cell.id || '');
    var cageName = String(cell.name || '');
    var roomId = String(meta.roomId || (self.data.selectedShelf && self.data.selectedShelf.roomId) || '');
    var shelveId = String((self.data.selectedShelf && self.data.selectedShelf.shelveId) || '');

    wx.showLoading({ title: '解绑中...' });
    springAuth.springRequest({
      url: '/api/v1/cage-shelves/cage/update',
      method: 'POST',
      data: { id: cageId, name: cageName, roomId: roomId, shelveId: shelveId, postionX: cell.x || 0, postionY: cell.y || 0, qrcode: '', state: 2 }
    }).then(function(res) {
      wx.hideLoading();
      var body = (res && typeof res.data === 'string') ? JSON.parse(res.data) : (res && res.data);
      if (body && body.success) {
        wx.showToast({ title: '解绑成功！', icon: 'success' });
        self.onRetry(); // 先刷新实时数据
        self.onExitBindMode();
      } else {
        wx.showToast({ title: '解绑失败: ' + (body && body.message || ''), icon: 'none' });
      }
    }).catch(function() {
      wx.hideLoading();
      wx.showToast({ title: '解绑失败', icon: 'none' });
    });
  }
});
