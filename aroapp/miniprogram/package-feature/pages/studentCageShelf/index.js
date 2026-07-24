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
  return (ct == null || isNaN(ct)) ? null : ct;
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
  enriched._cageTypeDotColor = CAGE_TYPE_DOT_COLOR[ct] || '';
  enriched._cageTypeLabel = CAGE_TYPE_LABEL[ct] || enriched.stateLabel || '—';
  enriched._hasStatusCodes = computeStatusCodesForDisplay(enriched);
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

/** 校区 → 房间 → 笼架 两级分组 */
function groupShelvesByCampus(shelves) {
  var campusMap = {};
  var campusOrder = [];
  (shelves || []).forEach(function(s) {
    var cn = s.campusName || "其他";
    var rn = s.roomName || "其他";
    if (!campusMap[cn]) {
      campusMap[cn] = { campusName: cn, rooms: [], roomMap: {} };
      campusOrder.push(cn);
    }
    var cm = campusMap[cn];
    if (!cm.roomMap[rn]) {
      var room = { roomName: rn, shelves: [], hasHighlight: false };
      cm.roomMap[rn] = room;
      cm.rooms.push(room);
    }
    cm.roomMap[rn].shelves.push(s);
    if (s.highlight) cm.roomMap[rn].hasHighlight = true;
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

    // Cell detail（对齐 Web CellDetailPanel / MobileCageCellDetailDialog）
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

    // 特殊状态弹窗
    specialStatusOpen: false,
    specialStatusLoading: false,
    specialStatusError: '',
    specialStatusScannedAt: '',
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
      // 计算每个房间的聚合计数
      for (var ci = 0; ci < campusGroups.length; ci++) {
        var cg = campusGroups[ci];
        for (var ri = 0; ri < cg.rooms.length; ri++) {
          var rm = cg.rooms[ri];
          rm.c1 = 0; rm.c2 = 0; rm.c3 = 0; rm.c4 = 0;
          for (var sj = 0; sj < rm.shelves.length; sj++) {
            var s = rm.shelves[sj];
            rm.c1 += s.c1 || 0; rm.c2 += s.c2 || 0; rm.c3 += s.c3 || 0; rm.c4 += s.c4 || 0;
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
        roomOptions.push({
          text: allRooms[ai].roomName + ' (' + allRooms[ai].shelves.length + '架)',
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
        roomFilterOptions: roomOptions,
        searchQuery: '',
        roomFilter: '',
        roomFilterIndex: 0
      });
    }).catch(function(e) {
      self.setData({ loading: false, error: (e && e.message) || '加载失败' });
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
    var shelfCount = 0;
    for (var i = 0; i < allGroups.length; i++) {
      var campus = allGroups[i];
      var matchedRooms = [];
      for (var j = 0; j < campus.rooms.length; j++) {
        var room = campus.rooms[j];
        if (roomFilter && room.roomName !== roomFilter) continue;
        if (q && room.roomName.toLowerCase().indexOf(q) === -1) continue;
        matchedRooms.push({
          roomName: room.roomName,
          shelves: room.shelves.slice(),
          expanded: false,   // 默认折叠
          hasHighlight: room.hasHighlight,
          c1: room.c1, c2: room.c2, c3: room.c3, c4: room.c4
        });
        shelfCount += room.shelves.length;
      }
      if (matchedRooms.length > 0) {
        filtered.push({ campusName: campus.campusName, rooms: matchedRooms });
      }
    }
    this.setData({ shelfGroups: filtered, filteredShelfCount: shelfCount });
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
      groups[ci]._collapsed = next; // 展开全部时同时展开校区
      for (var ri = 0; ri < groups[ci].rooms.length; ri++) {
        groups[ci].rooms[ri].expanded = next;
      }
    }
    this.setData({ shelfGroups: groups, allExpanded: next });
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
      var groups = (data.groups || []).map(function(g) {
        var cages = g.cages || [];
        // 按校区 → 房间 分级
        var campusMap = {};
        cages.forEach(function(c) {
          var cn = c.campusName || '未知校区';
          var rn = c.roomName || '未知房间';
          if (!campusMap[cn]) campusMap[cn] = {};
          if (!campusMap[cn][rn]) campusMap[cn][rn] = [];
          campusMap[cn][rn].push(c);
        });
        var byCampus = Object.keys(campusMap).sort().map(function(cn) {
          var roomMap = campusMap[cn];
          var byRoom = Object.keys(roomMap).sort().map(function(rn) {
            return { roomName: rn, cages: roomMap[rn] };
          });
          return { campusName: cn, byRoom: byRoom };
        });
        // 颜色与现有 STATUS_COLOR 一致
        var colors = {
          COHABITATION:    { bg: '#a7f3d0', border: '#10b981' },
          SPECIAL_FEEDING: { bg: '#fecaca', border: '#ef4444' },
          NEED_DIVIDE:     { bg: '#fef08a', border: '#eab308' },
          HEALTH_ABNORMAL: { bg: '#e9d5ff', border: '#a855f7' },
          ANIMAL_TRANSFER: { bg: '#cffafe', border: '#06b6d4' },
        };
        var c = colors[g.statusCode] || { bg: '#f1f5f9', border: '#cbd5e1' };
        return {
          code: g.statusCode,
          label: g.statusLabel,
          count: cages.length,
          dotColor: c.bg,
          borderColor: c.border,
          expanded: true,
          byCampus: byCampus,
          cages: cages,
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
      detailQrImageSrc: ""
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
      detailQrImageSrc: ""
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
