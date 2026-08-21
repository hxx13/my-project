var springAuth = require('../../../utils/springAuth.js');
var pagePermission = require('../../../utils/pagePermission.js');

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
var CAGE_TYPE_DOT_COLOR = { 1: "#f59e0b", 2: "#f43f5e", 4: "#3b82f6" };
var CAGE_TYPE_ABBR = { 1: "待", 2: "空", 4: "异" };

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
  if (codeKeys.length === 0) return "NORMAL";
  if (codes["NORMAL"] && codeKeys.length === 1) return "NORMAL";
  for (var j = 0; j < STATUS_BG_PRIORITY.length; j++) {
    if (codes[STATUS_BG_PRIORITY[j]]) return STATUS_BG_PRIORITY[j];
  }
  return "NORMAL";
}

function getCellStyle(cell) {
  if (cell.empty) {
    return "background-color: #f1f5f9; border: 1px solid #cbd5e1;";
  }
  if (cell.visible === false) {
    return "background-color: #fff9c4; border: 1px solid #f59e0b;";
  }
  var code = cell._dominantCode || getDominantStatusCode(cell.specialStatuses, cell.cageBoxInfo);
  cell._dominantCode = code;
  var c = DEFAULT_COLORS[code] || DEFAULT_COLORS["NORMAL"];
  return "background-color: " + c.bg + "; border: 1px solid " + c.border + ";";
}

function getDominantCodeLabel(code) {
  return STATUS_LABEL_MAP[code] || code || "正常";
}

/* ================================================================== */
/*  Grid Building                                                        */
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
  if ((ct == null || isNaN(ct)) && cell.stateLabel) {
    var sl = String(cell.stateLabel);
    if (sl.indexOf('等待分配') >= 0) ct = 1;
    else if (sl.indexOf('空笼盒') >= 0) ct = 2;
    else if (sl.indexOf('饲养') >= 0) ct = 3;
    else if (sl.indexOf('异常') >= 0) ct = 4;
  }
  return (ct == null || isNaN(ct)) ? null : ct;
}

function truncateText(text, maxLen) {
  if (!text) return '';
  var s = String(text).trim();
  if (s.length > maxLen) return s.substring(0, maxLen) + '…';
  return s;
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
  // 课题组名
  enriched._projectGroupShort = truncateText(enriched.projectGroup || (enriched.cageBoxInfo && enriched.cageBoxInfo.projectGroup), 5);
  var ct = resolveAnimalCageType(enriched);
  enriched._cageTypeAbbr = (ct === 3) ? '' : (CAGE_TYPE_ABBR[ct] || '');
  enriched._cageTypeDotColor = (ct === 3) ? '' : (CAGE_TYPE_DOT_COLOR[ct] || '');
  enriched._cageTypeLabel = CAGE_TYPE_LABEL[ct] || enriched.stateLabel || '—';
  enriched._cageTypeLabelShort = truncateText(CAGE_TYPE_LABEL[ct] || '', 6);
  enriched._hasStatusCodes = computeStatusCodesForDisplay(enriched);
  return enriched;
}

function buildGrid(gridCells) {
  var source = gridCells || [];
  if (source.length > 0) {
    return source.map(enrichGridCell);
  }
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

function formatSpecialStatusDisplayLabel(entries) {
  var nonNormal = [];
  for (var i = 0; i < (entries || []).length; i++) {
    if (entries[i].code !== "NORMAL") nonNormal.push(entries[i]);
  }
  if (nonNormal.length === 0) return "";
  return nonNormal.map(function(s) {
    return STATUS_LABEL_MAP[s.code] || s.label || s.code;
  }).join("·");
}

function parseImageUrlLines(text) {
  if (!text) return [];
  return String(text).split("\n").map(function(s) { return s.trim(); }).filter(Boolean);
}

/**
 * buildCellDetailMeta — 对齐 Web cageCellDetailHelpers.ts buildCageDetailSections()
 * 返回所有区块字段，由 WXML 按区块渲染。
 */
function buildCellDetailMeta(cell, gridMeta) {
  var bi = cell.cageBoxInfo || {};
  var chips = getSpecialStatusList(cell).map(function(s) {
    return {
      code: s.code,
      label: s.label || STATUS_LABEL_MAP[s.code] || s.code,
      abbr: STATUS_ABBR[s.code] || "?"
    };
  });
  var ct = resolveAnimalCageType(cell);
  var cageTypeLabel = CAGE_TYPE_LABEL[ct] || cell.stateLabel || "—";

  // 状态名称（与笼位类型去重）
  var stateName = (bi.StateName || bi.stateName || cell.stateLabel || "").trim();
  if (stateName === "空位" || stateName === cageTypeLabel) stateName = "";

  // 特殊状态摘要
  var statusList = cell.specialStatuses && cell.specialStatuses.length
    ? cell.specialStatuses
    : computeStatusesFromCageBoxInfo(bi);
  var specialStatusSummary = formatSpecialStatusDisplayLabel(statusList);

  // 课题信息
  var departmentName = cell.departmentName || bi.DepartmentName || bi.departmentName || "";
  var projectPiName = cell.projectPiName || bi.ProjectPiName || bi.projectPiName || bi.piName || "";
  var aupNumber = cell.aupNumber || bi.AupNumber || bi.aupNumber || "";
  var mobilePhone = bi.MobilePhone || bi.mobilePhone || "";
  var hasProjectInfo = !!(departmentName || projectPiName || aupNumber || mobilePhone);

  // 饲养与状态标记
  var showNeedDivide = ynFlag(bi, "NeedDivideYn");
  var showNeedFeeding = ynFlag(bi, "NeedFeedingYn");
  var showNeedTransfer = ynFlag(bi, "NeedTransferYn");
  var showAbnormalHealth = ynFlag(bi, "AbnormalHealthYn");
  var closingDate = bi.ClosingDate ? String(bi.ClosingDate) : "";
  var specialBreedingName = bi.SpecialBreedingName ? String(bi.SpecialBreedingName) : "";
  var specialBreedingDesc = bi.specialBreedingDescription ? String(bi.specialBreedingDescription) : "";
  var hasFlags = !!(showNeedDivide || showNeedFeeding || showNeedTransfer || showAbnormalHealth || closingDate || specialBreedingName || specialBreedingDesc);

  // 笼盒信息
  var cageBoxQrCode = cell.cageBoxQrCode || bi.CageBoxQrCode || bi.cageBoxQrCode || "";
  var hasPhysicalBox = bi.HasPhysicalBox !== undefined && bi.HasPhysicalBox !== null;
  var hasPhysicalBoxLabel = "";
  if (hasPhysicalBox) {
    var hb = bi.HasPhysicalBox;
    hasPhysicalBoxLabel = (hb === 1 || hb === "1" || hb === true) ? "是" : "否";
  }
  var hasBoxInfo = !!(cageBoxQrCode || hasPhysicalBox);

  // 位置
  var locationParts = [];
  if (gridMeta) {
    if (gridMeta.campusName) locationParts.push(gridMeta.campusName);
    if (gridMeta.areaName) locationParts.push(gridMeta.areaName);
    if (gridMeta.floorName) locationParts.push(gridMeta.floorName);
    if (gridMeta.roomName) locationParts.push(gridMeta.roomName);
  }
  var locationText = locationParts.join(" / ");

  // 系统信息
  var createAdmin = bi.createAdmin || "";
  var createTime = bi.CreateTime || bi.createTime || "";
  var updateTime = bi.UpdateTime || bi.updateTime || "";
  var hasSystemInfo = !!(createAdmin || createTime || updateTime);

  return {
    permitted: cell.visible !== false,
    cageTypeLabel: cageTypeLabel,
    stateName: stateName,
    specialStatusSummary: specialStatusSummary,
    specialChips: chips,
    // 课题
    departmentName: departmentName,
    projectPiName: projectPiName,
    aupNumber: aupNumber,
    mobilePhone: mobilePhone,
    hasProjectInfo: hasProjectInfo,
    // 标记
    showNeedDivide: showNeedDivide,
    showNeedFeeding: showNeedFeeding,
    showNeedTransfer: showNeedTransfer,
    showAbnormalHealth: showAbnormalHealth,
    closingDate: closingDate,
    specialBreedingName: specialBreedingName,
    specialBreedingDesc: specialBreedingDesc,
    hasFlags: hasFlags,
    // 笼盒
    cageBoxQrCode: cageBoxQrCode,
    hasPhysicalBox: hasPhysicalBox,
    hasPhysicalBoxLabel: hasPhysicalBoxLabel,
    hasBoxInfo: hasBoxInfo,
    // 位置
    locationText: locationText,
    // 系统
    createAdmin: createAdmin,
    createTime: createTime,
    updateTime: updateTime,
    hasSystemInfo: hasSystemInfo,
  };
}

function getActiveShelveId(pageData) {
  if (pageData.gridMeta && pageData.gridMeta.shelveId) return String(pageData.gridMeta.shelveId);
  if (pageData.selectedShelf && pageData.selectedShelf.shelveId) return String(pageData.selectedShelf.shelveId);
  return "";
}

var CAMPUS_ORDER = ['浦东', '浦西'];

var CAMPUS_HEADER_STYLES = {
  '浦东': 'background:linear-gradient(135deg,#0284c7,#0369a1);',
  '浦西': 'background:linear-gradient(135deg,#d97706,#b45309);'
};
var CAMPUS_HEADER_FALLBACK = 'background:#64748b;';

function campusHeaderStyle(campusName) {
  return CAMPUS_HEADER_STYLES[campusName] || CAMPUS_HEADER_FALLBACK;
}

/* ---- 笼位类型进度条（指示灯风格颜色，数据来自后端 cageTypeCounts）---- */
var TYPE_COLORS = { 1: '#f59e0b', 2: '#f43f5e', 3: '#10b981', 4: '#3b82f6' };
var TYPE_LABELS = { 1: '待分配', 2: '空笼盒', 3: '饲养中', 4: '异常' };
var TOTAL_CELLS = 80;

function enrichShelvesWithTypeBars(shelves) {
  (shelves || []).forEach(function(s) {
    var counts = s.cageTypeCounts || {};
    var bars = [];
    var filled = 0;
    [3, 1, 4, 2].forEach(function(ct) {
      var n = Number(counts[String(ct)] || 0);
      filled += n;
      bars.push({ type: ct, label: TYPE_LABELS[ct], count: n, pct: Math.round(n / TOTAL_CELLS * 100), color: TYPE_COLORS[ct] });
    });
    s._bars = bars.filter(function(b) { return b.count > 0; });
    s._filled = filled;
  });
}

/** 聚合房间级 bars */
function buildRoomBars(room) {
  var merged = { 1: 0, 2: 0, 3: 0, 4: 0 };
  var shelfCount = (room.shelves || []).length;
  (room.shelves || []).forEach(function(s) {
    var counts = s.cageTypeCounts || {};
    merged[1] += Number(counts['1'] || 0);
    merged[2] += Number(counts['2'] || 0);
    merged[3] += Number(counts['3'] || 0);
    merged[4] += Number(counts['4'] || 0);
  });
  var grandTotal = shelfCount * TOTAL_CELLS;
  var bars = [];
  [3, 1, 4, 2].forEach(function(ct) {
    var n = merged[ct];
    bars.push({ type: ct, label: TYPE_LABELS[ct], count: n, pct: grandTotal > 0 ? Math.round(n / grandTotal * 100) : 0, color: TYPE_COLORS[ct] });
  });
  return bars.filter(function(b) { return b.count > 0; });
}

function groupShelvesByCampus(shelves) {
  var campusMap = {};
  (shelves || []).forEach(function(s) {
    var cn = s.campusName || '其他校区';
    if (!campusMap[cn]) {
      campusMap[cn] = { campusName: cn, rooms: [], roomMap: {}, expanded: false, shelfCount: 0, _headerStyle: campusHeaderStyle(cn) };
    }
    var camp = campusMap[cn];
    var rn = s.roomName || '其他房间';
    if (!camp.roomMap[rn]) {
      var room = { roomName: rn, shelves: [], hasHighlight: false, expanded: false };
      camp.roomMap[rn] = room;
      camp.rooms.push(room);
    }
    camp.roomMap[rn].shelves.push(s);
    camp.shelfCount++;
    if (s.highlight) {
      camp.roomMap[rn].hasHighlight = true;
    }
  });
  var orderedCampuses = [];
  for (var i = 0; i < CAMPUS_ORDER.length; i++) {
    if (campusMap[CAMPUS_ORDER[i]]) {
      orderedCampuses.push(campusMap[CAMPUS_ORDER[i]]);
      delete campusMap[CAMPUS_ORDER[i]];
    }
  }
  var rest = Object.keys(campusMap).sort();
  for (var j = 0; j < rest.length; j++) {
    orderedCampuses.push(campusMap[rest[j]]);
  }
  // 计算每个房间的聚合进度条
  orderedCampuses.forEach(function(camp) {
    (camp.rooms || []).forEach(function(room) {
      room._bars = buildRoomBars(room);
    });
  });
  return orderedCampuses;
}

/* ================================================================== */
/*  Image Upload Helpers                                                */
/* ================================================================== */

var MAX_UPLOAD_IMAGES = 9;

function chooseImages(count) {
  return new Promise(function(resolve, reject) {
    wx.chooseImage({
      count: count,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function(res) { resolve(res.tempFilePaths || []); },
      fail: function(err) { reject(new Error((err && err.errMsg) || '选择图片失败')); }
    });
  });
}

function uploadSingleImage(tempFilePath, token) {
  return springAuth.refreshPublicRuntimeConfig().then(function() {
    var baseUrl = springAuth.getApiPublicBaseUrl().replace(/\/+$/, '');
    return new Promise(function(resolve, reject) {
      wx.uploadFile({
        url: baseUrl + '/api/upload',
      filePath: tempFilePath,
      name: 'file',
      header: {
        'Authorization': 'Bearer ' + token
      },
      success: function(res) {
        try {
          var body = JSON.parse(res.data);
          if (body && body.success && body.data) {
            resolve(body.data.publicUrl || body.data.url || '');
          } else {
            reject(new Error((body && body.message) || '上传失败'));
          }
        } catch (e) {
          reject(new Error('解析上传结果失败'));
        }
      },
      fail: function(err) {
        reject(new Error((err && err.errMsg) || '上传请求失败'));
      }
    });
    });
  });
}

/* ================================================================== */
/*  Page Definition                                                      */
/* ================================================================== */

Page({
  data: {
    loading: true,
    error: '',
    screen: 'list',
    shelves: [],
    campusGroups: [],
    allCampusGroups: [],
    totalCount: 0,

    searchQuery: '',
    roomFilter: '',
    roomFilterIndex: 0,
    filteredShelfCount: 0,
    allExpanded: false,

    // Grid
    selectedShelf: null,
    grid: [],
    gridMeta: null,
    filledCount: 0,
    totalCells: 80,

    // Cell detail
    selectedCell: null,
    cellDetailMeta: null,
    showCellDetail: false,
    detailRichText: "",
    detailImageUrls: "",
    detailImagePreviewUrls: [],
    detailAnnotationLoading: false,
    detailSaving: false,
    detailSaveMsg: "",
    detailSaveMsgType: "",
    detailQrImageSrc: "",
    detailUploading: false,

    // 特殊状态弹窗
    specialStatusOpen: false,
    specialStatusLoading: false,
    specialStatusError: '',
    specialStatusScannedAt: '',
    specialStatusTotal: 0,
    specialStatusGroups: [],
    allExpanded: false,
  },

  onLoad: function() {
    var self = this;
    var role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    var token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    if (!token || !canAccessCageShelfPage(role)) {
      wx.showToast({ title: '无权限', icon: 'none' });
      self._accessDenied = true;
      wx.navigateBack({ delta: 1 });
      return;
    }
    self.loadShelves();
  },

  /* ------------------------------------------------------------------ */
  /*  Pull-down Refresh                                                   */
  /* ------------------------------------------------------------------ */

  onPullDownRefresh: function() {
    var self = this;
    if (self.data.screen === 'grid') {
      self.loadShelfDetail(self.data.selectedShelf ? self.data.selectedShelf.shelveId : '');
    } else {
      self.loadShelves();
    }
  },

  /* ------------------------------------------------------------------ */
  /*  Data Loading                                                        */
  /* ------------------------------------------------------------------ */

  loadShelves: function() {
    var self = this;
    self.setData({ loading: true, error: '' });

    springAuth.springRequest({
      url: '/api/student/mobile/cage-shelves/all',
      method: 'GET',
      data: {}
    }).then(function(res) {
      var p = unwrap(res);
      if (!p.ok) {
        self.setData({ loading: false, error: p.message });
        wx.stopPullDownRefresh();
        return;
      }
      var shelves = (p.data && p.data.shelves) || [];
      var totalCount = (p.data && p.data.totalCount) || shelves.length;

      // 从后端响应直接读取 cageTypeCounts，计算进度条（指示灯风格）
      enrichShelvesWithTypeBars(shelves);

      var campusGroups = groupShelvesByCampus(shelves);

      self.setData({
        loading: false,
        error: '',
        shelves: shelves,
        campusGroups: campusGroups,
        allCampusGroups: JSON.parse(JSON.stringify(campusGroups)),
        totalCount: totalCount,
        filteredShelfCount: totalCount,
        searchQuery: '',
        roomFilter: '',
        roomFilterIndex: 0,
        allExpanded: false
      });
      wx.stopPullDownRefresh();
    }).catch(function(e) {
      self.setData({ loading: false, error: (e && e.message) || '加载失败' });
      wx.stopPullDownRefresh();
    });
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
    self.loadShelves();
  },

  onRefreshGrid: function() {
    var self = this;
    self.loadShelfDetail(self.data.selectedShelf ? self.data.selectedShelf.shelveId : '');
  },

  /* ------------------------------------------------------------------ */
  /*  List — Search & Filter                                              */
  /* ------------------------------------------------------------------ */

  onSearchInput: function(e) {
    var self = this;
    var query = (e.detail.value || '').trim();
    self.setData({ searchQuery: query });
    self.applyFilters(query, self.data.allCampusGroups);
  },

  applyFilters: function(query, allCampusGroups) {
    var q = query.toLowerCase();
    var deep = JSON.parse(JSON.stringify(allCampusGroups));
    var filtered = [];
    var shelfCount = 0;
    for (var i = 0; i < deep.length; i++) {
      var camp = deep[i];
      var matchingRooms = [];
      for (var j = 0; j < camp.rooms.length; j++) {
        var room = camp.rooms[j];
        if (q && room.roomName.toLowerCase().indexOf(q) === -1) continue;
        room._bars = buildRoomBars(room);
        matchingRooms.push(room);
        shelfCount += room.shelves.length;
      }
      if (matchingRooms.length > 0) {
        camp.rooms = matchingRooms;
        filtered.push(camp);
      }
    }
    this.setData({ campusGroups: filtered, filteredShelfCount: shelfCount });
  },

  onToggleAllRooms: function() {
    var groups = this.data.campusGroups;
    var next = !this.data.allExpanded;
    for (var i = 0; i < groups.length; i++) {
      groups[i].expanded = next;
      for (var j = 0; j < groups[i].rooms.length; j++) {
        groups[i].rooms[j].expanded = next;
      }
    }
    this.setData({ campusGroups: groups, allExpanded: next });
  },

  onClearFilter: function() {
    var self = this;
    self.setData({
      searchQuery: '',
      campusGroups: JSON.parse(JSON.stringify(self.data.allCampusGroups)),
      filteredShelfCount: self.data.totalCount
    });
  },

  /* ------------------------------------------------------------------ */
  /*  Special Status Popup                                                */
  /* ------------------------------------------------------------------ */

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
      var allCagesTotal = 0;
      var colors = {
        COHABITATION:    { bg: '#a7f3d0', border: '#10b981' },
        SPECIAL_FEEDING: { bg: '#fecaca', border: '#ef4444' },
        NEED_DIVIDE:     { bg: '#fef08a', border: '#eab308' },
        HEALTH_ABNORMAL: { bg: '#e9d5ff', border: '#a855f7' },
        ANIMAL_TRANSFER: { bg: '#cffafe', border: '#06b6d4' },
      };

      var groups = (data.groups || []).map(function(g) {
        var cages = g.cages || [];
        allCagesTotal += cages.length;
        var c = colors[g.statusCode] || { bg: '#f1f5f9', border: '#cbd5e1' };

        // 按校区+房间分组
        var roomMap = {};
        cages.forEach(function(cage, idx) {
          var cn = cage.campusName || '未知校区';
          var rn = cage.roomName || '未知房间';
          var key = cn + '||' + rn;
          if (!roomMap[key]) {
            roomMap[key] = { key: key, campusName: cn, roomName: rn, cages: [], _expanded: false };
          }
          roomMap[key].cages.push(cage);
        });
        var byRoom = Object.keys(roomMap).sort().map(function(k) { return roomMap[k]; });

        // 按课题组分组
        var groupMap = {};
        cages.forEach(function(cage, idx) {
          var gn = cage.projectPiName || cage.piName || '未知课题组';
          var key = gn;
          if (!groupMap[key]) {
            groupMap[key] = { key: key, groupName: gn, cages: [], _expanded: false };
          }
          groupMap[key].cages.push(cage);
        });
        var byGroup = Object.keys(groupMap).sort().map(function(k) { return groupMap[k]; });

        return {
          code: g.statusCode,
          label: g.statusLabel,
          count: cages.length,
          dotColor: c.bg,
          borderColor: c.border,
          expanded: true,
          _groupBy: 'room',
          byRoom: byRoom,
          byGroup: byGroup,
          cages: cages,
        };
      });

      self.setData({
        specialStatusLoading: false,
        specialStatusScannedAt: data.scannedAt || '',
        specialStatusTotal: data.totalAbnormal || allCagesTotal,
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

  onSwitchSpecialGroupDim: function(e) {
    var code = e.currentTarget.dataset.code;
    var dim = e.currentTarget.dataset.dim;
    var groups = this.data.specialStatusGroups;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].code === code) {
        groups[i]._groupBy = dim;
        break;
      }
    }
    this.setData({ specialStatusGroups: groups });
  },

  onToggleSpecialSubGroup: function(e) {
    var pkey = e.currentTarget.dataset.pkey;
    var skey = e.currentTarget.dataset.skey;
    var groups = this.data.specialStatusGroups;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].code === pkey) {
        var dim = groups[i]._groupBy;
        var list = dim === 'group' ? groups[i].byGroup : groups[i].byRoom;
        for (var j = 0; j < list.length; j++) {
          if (list[j].key === skey) {
            list[j]._expanded = list[j]._expanded === false ? true : false;
            break;
          }
        }
        break;
      }
    }
    this.setData({ specialStatusGroups: groups });
  },

  /* ------------------------------------------------------------------ */
  /*  List — Accordion                                                     */
  /* ------------------------------------------------------------------ */

  onToggleCampus: function(e) {
    var campusName = e.currentTarget.dataset.campusName;
    var groups = this.data.campusGroups;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].campusName === campusName) {
        groups[i].expanded = !groups[i].expanded;
        break;
      }
    }
    this.setData({ campusGroups: groups });
  },

  onToggleRoom: function(e) {
    var campusName = e.currentTarget.dataset.campusName;
    var roomName = e.currentTarget.dataset.roomName;
    var groups = this.data.campusGroups;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].campusName === campusName) {
        for (var j = 0; j < groups[i].rooms.length; j++) {
          if (groups[i].rooms[j].roomName === roomName) {
            groups[i].rooms[j].expanded = !groups[i].rooms[j].expanded;
            break;
          }
        }
        break;
      }
    }
    this.setData({ campusGroups: groups });
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
      url: '/api/student/mobile/cage-shelves/' + shelveId + '/detail',
      method: 'GET',
      data: {}
    }).then(function(res) {
      var p = unwrap(res);
      if (!p.ok) {
        self.setData({ loading: false, error: p.message });
        wx.stopPullDownRefresh();
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
      wx.stopPullDownRefresh();
    }).catch(function(e) {
      self.setData({ loading: false, error: (e && e.message) || '加载失败' });
      wx.stopPullDownRefresh();
    });
  },

  /* ------------------------------------------------------------------ */
  /*  Grid → Back to List                                                 */
  /* ------------------------------------------------------------------ */

  onBackToList: function() {
    var self = this;
    self.setData({
      screen: 'list',
      loading: false,
      error: '',
      selectedShelf: null,
      grid: [],
      gridMeta: null,
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
    self.setData({
      selectedCell: cell,
      cellDetailMeta: detailMeta,
      showCellDetail: true,
      detailRichText: "",
      detailImageUrls: "",
      detailImagePreviewUrls: [],
      detailAnnotationLoading: detailMeta.permitted,
      detailSaving: false,
      detailSaveMsg: "",
      detailSaveMsgType: "",
      detailQrImageSrc: "",
      detailUploading: false
    });

    if (detailMeta.permitted) {
      self.loadCellAnnotation(cell);
      if (detailMeta.cageBoxQrCode) {
        setTimeout(function() { self.drawCageQrCode(detailMeta.cageBoxQrCode); }, 280);
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

  /* ---- Image Upload ---- */

  onChooseAndUploadImage: function() {
    var self = this;
    if (self.data.detailUploading) return;

    var currentUrls = parseImageUrlLines(self.data.detailImageUrls);
    var remain = MAX_UPLOAD_IMAGES - currentUrls.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传' + MAX_UPLOAD_IMAGES + '张', icon: 'none' });
      return;
    }

    chooseImages(remain).then(function(files) {
      if (!files.length) return;
      self.setData({ detailUploading: true });

      var uploadedUrls = [];
      var token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';

      function uploadNext(index) {
        if (index >= files.length) {
          // All done — append to existing URLs
          var merged = currentUrls.concat(uploadedUrls.filter(Boolean));
          self.setData({
            detailImageUrls: merged.join("\n"),
            detailImagePreviewUrls: merged.slice(),
            detailUploading: false
          });
          return;
        }
        uploadSingleImage(files[index], token).then(function(url) {
          if (url) uploadedUrls.push(url);
          uploadNext(index + 1);
        }).catch(function(err) {
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' });
          uploadNext(index + 1);
        });
      }

      uploadNext(0);
    }).catch(function(err) {
      if (err && err.message && err.message.indexOf('cancel') === -1) {
        wx.showToast({ title: err.message, icon: 'none' });
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
    var self = this;
    self.setData({
      showCellDetail: false,
      selectedCell: null,
      cellDetailMeta: null,
      detailRichText: "",
      detailImageUrls: "",
      detailImagePreviewUrls: [],
      detailAnnotationLoading: false,
      detailSaving: false,
      detailSaveMsg: "",
      detailSaveMsgType: "",
      detailQrImageSrc: "",
      detailUploading: false
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
  }
});
