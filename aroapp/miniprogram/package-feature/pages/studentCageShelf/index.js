var springAuth = require('../../../utils/springAuth.js');
var pagePermission = require('../../../utils/pagePermission.js');
var { isStudentAccount } = require('../../../utils/roleAccess.js');
var personIdentity = require('../../../utils/personIdentity.js');
var { readCustomNavMetrics } = require('../../../utils/customNavMetrics.js');
var {
  CAGE_FORM_KEY, flattenTemplateFields, buildCodelistDict,
  buildFormTree, refreshDirty,
  validateGroups, changedValues, revertGroups, toApiValue
} = require('../../../utils/cageForm.js');
var cageStatus = require('../../../utils/cageStatus.js');
var cageOpSignatures = require('../../utils/cageOpSignatures.js');
var cagePosition = require('../../utils/cagePosition.js');
var cageTransferForm = require('../../utils/cageTransferForm.js');
var btLogic = require('../../utils/batchTransferLogic.js');
var CAGE_STATUS_ACTIONS = cageStatus.CAGE_STATUS_ACTIONS;

/* 状态子值字段的 canonical / 码表 code —— 与后端 CageInfoValueService 及 Web/学生端 constants.ts 一一对应。
   特殊饲养明细是多选；健康异常严重程度是互斥单选（挂在「健康异常」下，不产生状态码、不进告警折叠）。 */
var SPECIAL_DETAIL_CANONICAL = 'special_feeding_details';
var SPECIAL_DETAIL_DICT = 'special_feeding_detail';
var HEALTH_SEVERITY_CANONICAL = 'health_abnormality_severity';
var HEALTH_SEVERITY_DICT = 'health_abnormality_severity';
/* 健康异常「瘙痒」：布尔子值（落 value_bool）。写接口约定 itemCodes=['1'] = 打勾、[] = 取消。 */
var HEALTH_ITCH_CANONICAL = 'health_abnormality_itch';
var HEALTH_ITCH_LABEL = '瘙痒';
var HEALTH_ITCH_TRUE = '1';
/* 学生侧动作码：与后端 CageModeVisibilityService.STUDENT_EDIT_ACTIONS 的键一致 */
var HEALTH_CHECK_ACTION = 'HEALTH_CHECK';
var assetApi = require('../../utils/assetApi.js');
var beijingTime = require('../../../utils/beijingTime.js');
var cageShelfApi = require('../../utils/cageShelfApi.js');
var cageTreeGrouping = require('../../utils/cageTreeGrouping.js');
var cageCellVisual = require('../../utils/cageCellVisual.js');

/* 格子可视化统一走 util（与卡牌打印页共用同一套渲染口径，避免两页各留一份实现） */
var setUserColors = cageCellVisual.setUserColors;
var getCellStyle = cageCellVisual.getCellStyle;
var getDominantCodeLabel = cageCellVisual.getDominantCodeLabel;
var resolveAnimalCageType = cageCellVisual.resolveAnimalCageType;
var buildGrid = cageCellVisual.buildGrid;
var COLUMNS = cageCellVisual.COLUMNS;
var CAGE_TYPE_LABEL = cageCellVisual.CAGE_TYPE_LABEL;

var CAGE_SHELF_PAGE = '/package-feature/pages/studentCageShelf/index';

/**
 * 模式高亮色 —— 与 Web 端 CAGE_MODE_META 对齐（key/颜色同一套语义）。
 * 选中模式时按钮用它上色，网格容器用它做呼吸光晕；空串 = 不强调（查看模式）。
 */
var MODE_COLOR = {
  view: '',
  allocate: '#3b82f6',
  booking: '#06b6d4',
  edit: '#f59e0b',
  confirm: '#10b981',
  archive: '#64748b',
  reserve: '#8b5cf6',
  record: '#ec4899',
  studentClaim: '#0d9488',
  division: '#e11d48'
};

function canAccessCageShelfPage(role) {
  return (
    pagePermission.canShowMiniEntry('tabbar', CAGE_SHELF_PAGE, role, 'STUDENT') ||
    pagePermission.canShowMiniEntry('home', CAGE_SHELF_PAGE, role, 'STAFF') ||
    pagePermission.canAccessMiniPage(CAGE_SHELF_PAGE, role, 'STUDENT')
  );
}


/** 每个「源→目标」配对一色（直接抄 Web useCageOpSelect.ts 的 PAIR_COLORS，两端观感一致） */
var PAIR_COLORS = [
  "#8b5cf6", "#f97316", "#ec4899", "#0ea5e9",
  "#f59e0b", "#d946ef", "#6366f1", "#f43f5e"
];
function pairColorAt(index) { return PAIR_COLORS[index % PAIR_COLORS.length]; }

/** 分区编号：01 / 02 … */
function pad2(n) { return (n < 10 ? '0' : '') + n; }

/** 审计 changeType 原始枚举 → 中文（与 H5 CageHistoryModal 的 CHANGE_TYPE_LABEL 同源，两端改一处必须同步改另一处）
 *  覆盖范围 = 后端全部 logDataChange/logDataJson 调用点的字面量：BIND/UNBIND/UPDATE/RELEASE/TRANSFER，
 *  外加 CageFormAuditService 的 IN_TYPES/OUT_TYPES 里预留的迁移类枚举。
 *  注意 RELEASE 在 H5 的同名映射里也是缺的，那边同样会显示英文——补这边时记得一并补 H5。 */
var CHANGE_TYPE_LABEL = {
  UPDATE: '字段修改',
  TRANSFER: '转移笼位',
  TRANSFER_OUT: '转出到其他笼位',
  COPY: '复制占用',
  DIVIDE: '分笼',
  INHERIT: '分笼继承',
  BIND: '绑定笼盒',
  UNBIND: '解绑笼盒',
  RELEASE: '释放认领',
  ARCHIVE: '归档',
  EXIT: '退出',
  UNALLOCATE: '取消分配'
};

/** 事件性质 → 时间轴圆点色 + 标签（颜色与 H5 KIND_META 一致，避免三端对同一事件给出不同颜色） */
var KIND_META = {
  IN:   { label: '值迁入',   dot: '#10b981' },
  OUT:  { label: '值清出',   dot: '#ef4444' },
  EDIT: { label: '原地编辑', dot: '#8a91a0' }
};

/** 状态标注历史条目的图标与配色（原为 wxml 内的长三元表达式） */
var STATUS_HISTORY_LABEL = {
  needs_division: '需分笼',
  needs_special_feeding: '特殊饲养',
  _annotation: '标注记录'
};

/**
 * 状态标注历史条目归一：解析图片、截断时间、预计算标签与圆点色。
 * 有两条加载路径都会拿到这份数据（打开弹窗时、存为新记录后），必须共用，否则后一条路径的条目会没有标签。
 */
function normalizeStatusHistory(list) {
  if (!list) return [];
  list.forEach(function(h) {
    try { h._imgs = JSON.parse(h.imagesJson || '[]'); } catch (e) { h._imgs = []; }
    if (h.createdAt) h.createdAt = (h.createdAt || '').substring(0, 16);
    var isUnmarked = h.action === 'unmarked';
    var isAnnotated = h.action === 'annotated';
    h._dot = isUnmarked ? '#ef4444' : isAnnotated ? '#3b82f6' : '#10b981';
    h._label = (isUnmarked ? '✕ ' : isAnnotated ? '📝 ' : '✓ ') + (STATUS_HISTORY_LABEL[h.statusField] || '健康异常');
  });
  return list;
}

/** 笼位存在未决分笼/转移时的统一拦截文案 */
var PENDING_OP_REASON = '该笼位有待审的分笼/转移请求，请先等它审完';

/**
 * 分配模式笼位可选性判定。
 * 与 Web/H5 的 `features/cage-shelf/constants.ts → allocSelectVerdict` 是同一套规则，
 * 小程序是独立技术栈无法复用，改其中一处必须同步改另一处。
 * 第二参是**中间态拦截理由**（不是布尔）：待审分笼/转移和「已被订单预定」是两种不同的中间态，
 * 原先共用一个布尔只能吐同一句错话，现在由调用方给准确文案。
 */
function allocVerdict(cageTypeCode, busyReason) {
  if (busyReason) return { ok: false, reason: busyReason };
  var ct = Number(cageTypeCode);
  if (ct === 1) return { ok: true, kind: 'allocate' };
  if (ct === 2) return { ok: true, kind: 'cancel' };
  if (ct === 3 || ct === 4) {
    return { ok: false, reason: '该笼位为「' + CAGE_TYPE_LABEL[ct] + '」，需先归档当前笼位后才能分配' };
  }
  return { ok: false, reason: '该笼位状态未知，无法分配' };
}

// 文案照抄共享常量 constants.ts:228，不做改写
var ALLOC_MIXED_KIND_HINT = '不能同时勾选「等待分配」与「空笼位」笼位，请分两批操作';


var PAGE_BG = "#eef0f6";
// shelveId → cage_shelf_index.id（shelfIndexId），学生申请池接口用（来自 full-tree，非 local-grid）
var shelfIndexIdMap = {};

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

/** 从表单值里取「特殊饲养明细」选中集合 → {item_code: true}（与动作那套同形）。 */
function detailMapFromValues(rows) {
  var out = {};
  if (!rows || !rows.length) return out;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r && r.canonical === SPECIAL_DETAIL_CANONICAL && Array.isArray(r.value)) {
      for (var j = 0; j < r.value.length; j++) out[String(r.value[j])] = true;
    }
  }
  return out;
}

/** 从表单值里取「健康异常严重程度」当前值（互斥单选的 item_code）；没标/空串 → ''。 */
function severityFromValues(rows) {
  if (!rows || !rows.length) return '';
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r && r.canonical === HEALTH_SEVERITY_CANONICAL) {
      var v = r.value;
      return typeof v === 'string' ? v.trim() : '';
    }
  }
  return '';
}

/** 从表单值里取「瘙痒」布尔值；缺字段/非真值 → false。 */
function itchFromValues(rows) {
  if (!rows || !rows.length) return false;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r && r.canonical === HEALTH_ITCH_CANONICAL) {
      return r.value === true || r.value === 1 || r.value === '1';
    }
  }
  return false;
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

/** 笼位类型码：优先 cageTypeCode，回退 animalCageType / stateLabel 推断 */
function cageTypeOf(cell) {
  var ct = cell.cageTypeCode;
  if (ct == null || ct === '') ct = cell.animalCageType;
  if (ct == null || ct === '') return resolveAnimalCageType(cell);
  var n = Number(ct);
  return isNaN(n) ? null : n;
}

/** 是否处于活跃认领（待审批/未到位/已到位/待释放审批） */
function hasActiveClaim(status) {
  return status === 'pending_approval' || status === 'locked' || status === 'confirmed' || status === 'pending_release_approval';
}

/** 依视角生成模式选择器选项；命中后端下发的 visibleModes 才保留（label 用本地中文映射，key 不变） */
/**
 * 状态模式下可渲染的动作按钮。
 * allowed 为后端下发的 action code 列表（modeActions.edit）；空/未下发 = 不限制，返回全量（教职工路径）。
 */
function filterEditActions(allowed) {
  if (!allowed || !allowed.length) return cageStatus.CAGE_STATUS_ACTIONS;
  var set = {};
  for (var i = 0; i < allowed.length; i++) set[String(allowed[i])] = true;
  return cageStatus.CAGE_STATUS_ACTIONS.filter(function(a) { return !!set[a.action]; });
}

function buildModeOptions(isStaffView, visibleModes) {
  var base = isStaffView
    ? [
        { key: 'view', label: '查看' },
        { key: 'allocate', label: '分配' },
        { key: 'edit', label: '状态' },
        { key: 'confirm', label: '确认' },
        { key: 'archive', label: '归档' },
        { key: 'reserve', label: '预定' },
        { key: 'record', label: '记录' },
        { key: 'booking', label: '预约' },
        { key: 'division', label: '划分' }
      ]
    : [
        { key: 'view', label: '查看' },
        { key: 'studentClaim', label: '申请预约' },
        { key: 'confirm', label: '确认' },
        // 「划分」是管家（GROUP_STEWARD）专属，而管家多是学生账号（isStaffView 为 false），
        // 所以学生这张表也得登记它——Web 学生端一直有（islandModes 里的 canDivide），
        // 这里漏了就会把后端下发的能力位无声吃掉：下面按 visibleModes 过滤时只认 base 里的 key。
        { key: 'division', label: '划分' },
        // 学生侧状态模式：后端只放行部分动作（当前仅合笼），动作清单由 /api/cage-mode/visible
        // 的 modeActions.edit 下发，前端据此过滤渲染，不要在这里硬编码动作名。
        { key: 'edit', label: '状态' },
        // 归档：学生也能用，但**只能归档本人占用**的笼位（归属判定与门禁在后端
        // /api/local/archive）。这里必须登记：下面对 visibleModes 过滤只认 base 里的 key，
        // 漏一个就会把后端下发的能力位无声吃掉（划分那次就是这么踩的）。
        { key: 'archive', label: '归档' }
      ];
  if (visibleModes && visibleModes.length > 0) {
    var byKey = {};
    for (var i = 0; i < base.length; i++) byKey[base[i].key] = base[i];
    var out = [];
    for (var j = 0; j < visibleModes.length; j++) {
      if (byKey[visibleModes[j]]) out.push(byKey[visibleModes[j]]);
    }
    return withModeColors(out);
  }
  return withModeColors(base);
}

/** 给模式项补上高亮色（与 Web CAGE_MODE_META 同一套色）：顶栏与左下角模式坞共用一份 */
function withModeColors(list) {
  return (list || []).map(function (m) {
    return Object.assign({}, m, { color: MODE_COLOR[m.key] || '' });
  });
}

/** 认领状态中文标签（我的申请列表用） */
function claimStatusLabel(status) {
  var map = {
    pending_approval: '待审批',
    locked: '未到位',
    confirmed: '已到位',
    pending_release_approval: '待释放',
    rejected: '已驳回',
    released: '已释放',
    cancelled: '已取消'
  };
  return map[status] || status || '—';
}

/** 分笼/转移请求状态中文标签（我的转移单列表用） */
function transferOpStatusLabel(status) {
  var map = {
    pending: '审核中',
    approved: '已通过',
    rejected: '已驳回',
    cancelled: '已撤销'
  };
  return map[status] || status || '—';
}

/**
 * 给「我的转移申请」一行挂上展示字段：状态文案、三签进度、源位置、所在房间。
 *
 * <p>两处共用 —— 「我的转移单」弹窗与「我的申请」里的转移段。同一条数据在两处各拼一遍必然走形。
 */
function decorateMyTransfer(it) {
  if (!it) return it;
  it._statusLabel = transferOpStatusLabel(it.status);
  // 三签进度：归属地/目的地/兽医各自签了没有、谁签的。已通过的单也照留，方便回看是谁批的。
  it._sign = cageOpSignatures.signSlots(it.signatures);
  var pairs = it.pairs || [];
  var srcs = [];
  for (var pi = 0; pi < pairs.length; pi++) {
    var s = String((pairs[pi] && pairs[pi].source) || '');
    if (s && srcs.indexOf(s) === -1) srcs.push(s);
  }
  // 映射坐标（1-4 → A-4），不是原生数字 —— 后端给的是 positionX 数字，
  // 审核页那边一直显示 D-4，只有这里印 4-4 就对不上了
  var first = cagePosition.cagePositionLabel(it);
  // 多源批量单：位置只随单下发一份（第一个源的），其余的用数量交代。
  // 别把 source id 拼出来当标签 —— 那是 19 位雪花号，一行放不下也读不懂。
  if (srcs.length > 1) {
    it._posLabel = (first ? first + ' 等 ' : '') + srcs.length + ' 处';
  } else {
    // 位置查不到就给横杠。**别退回 sourceAnimalCageId** —— 那是 19 位雪花号，
    // 塞进位置栏既读不懂又把整行撑变形。
    it._posLabel = first || '—';
  }
  // 地点串：**笼架名自带房号时不再单列房号**（201B-1 属于 201B），与转移单的地点写法同一口径，
  // 否则会印成「浦东 201B 201B-1」这种同一件事说两遍。
  var place = [];
  if (it.campusName) place.push(it.campusName);
  var room = it.roomName ? String(it.roomName) : '';
  var shelve = it.shelveName ? String(it.shelveName) : '';
  if (shelve) {
    if (!room || shelve.indexOf(room) !== 0) {
      if (room) place.push(room);
    }
    place.push(shelve);
  } else if (room) {
    place.push(room);
  }
  it._place = place.join(' ');
  // 标题在 JS 里拼成一个字段再交给 wxml —— 单纯是让模板里只剩一处插值，
  // 不用在 wxml 里写相邻插值 + 条件空格的表达式。空坐标（'—'）时不拼，免得印出「浦东 201B-1 —」。
  it._title = (it._place && it._posLabel && it._posLabel !== '—')
    ? it._place + ' ' + it._posLabel
    : (it._place || it._posLabel);
  return it;
}

/** 本人转移请求：拉一次、滤出 transfer、逐行装饰。两个弹窗共用。 */
function fetchMyTransfers() {
  return springAuth.springRequest({ url: '/api/cage-op/my', method: 'GET', data: {} }).then(function(res) {
    var p = unwrap(res);
    if (!p.ok) throw new Error(p.message || '加载转移单列表失败');
    return (p.data || [])
      .filter(function(it) { return it && it.opType === 'transfer'; })
      .map(decorateMyTransfer);
  });
}


function parseImageUrlLines(text) {
  if (!text) return [];
  return String(text).split("\n").map(function(s) { return s.trim(); }).filter(Boolean);
}

/**
 * 从 cell.detail（本地笼位索引数据）构建详情卡片的「表外固定字段」。
 * PI / 部门 / AUP / 品系 / 性别 / 周龄 / 数量 / 来源等关键信息已由统一表单系统渲染
 * （见 loadCellFormValues），此处不再重复拼装 —— coords / cageBoxCode / cageTypeAbbr /
 * cageTypeLabel / cageTypeDotColor 这几个遗留字段 wxml 一个都没读，2026-09-17 清掉。
 */
function buildCellDetailData(cell) {
  var detail = cell.detail || {};

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
    statusChips: chips,
    images: images
  };
}

function getActiveShelveId(pageData) {
  if (pageData.gridMeta && pageData.gridMeta.shelveId) return String(pageData.gridMeta.shelveId);
  if (pageData.selectedShelf && pageData.selectedShelf.shelveId) return String(pageData.selectedShelf.shelveId);
  return "";
}

/* ================================================================== */
/*  Page Definition                                                      */
/* ================================================================== */

Page({
  data: {
    loading: true,
    error: '',
    refreshing: false,        // 仅驱动「正在刷新」提示，不走 loading 以免卸载列表
    gridLoading: false,       // grid 独立加载态，不共用 list 的 loading（避免切 grid 时销毁列表 DOM 丢滚动）
    gridError: '',
    screen: 'list',           // 'list' | 'grid'
    shelves: [],
    shelfGroups: [],          // [{roomName, shelves:[], expanded:false}]
    // 收藏（2026-09-19：房间级 + 笼架级并存；房间行是「按房号前缀聚合」的一行，收藏它=收藏它下面全部 roomId）
    favOpen: false,
    favItems: [],             // 弹层用：按收藏顺序平铺 [{kind,id,name,sub,roomName,campusName,shelveId}]
    favRoomIds: [],           // 已收藏房间 id
    favShelfIds: [],          // 已收藏笼架 id
    scrollIntoViewId: '',     // 收藏里点房间 → 滚到它
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
    // 分配批次动作类型：'allocate'=下发AUP / 'cancel'=撤回AUP / ''=未起头
    allocBatchKind: '',

    // 模式系统（三端对齐：pageMode 单一真相源）
    pageMode: 'view',             // view|allocate|edit|confirm|archive|reserve|record|booking|studentClaim
    /** 连续扫码：扫一台加入选中后自动重开扫码机（分配/状态/认领/预定四个模式） */
    scanContinuous: true,
    /** 当前模式的呼吸光晕色（由 switchMode 按 MODE_COLOR 同步） */
    modeColor: '',
    isStaffView: false,
    modeOptions: [],              // 依视角生成
    visibleModes: [],             // 后端下发的可见模式 key 列表（空=未返回，回退本地硬编码）
    selectedCells: {},            // { "x:y": animalCageId } 各模式选中集
    selectedCount: 0,
    // 分配
    aupList: [],
    aupOptions: [],
    selectedAupId: '',
    allocSubmitting: false,
    showAupDialog: false,
    // 教职工认领
    reservePersonOpen: false,
    reserveKeyword: '',
    reserveSearching: false,
    reserveResults: [],
    reserveGroups: [],      // 已选笼位所属 AUP 的课题组名，供弹窗提示
    reserveSubmitting: false,
    // 选人弹窗复用目的：'' = 预定；'claimOnBehalf' = 代认领；'division' = 划分
    personPickerPurpose: '',
    // 划分模式：弹窗内已选成员（accountId → {id,name}）与提交态
    divisionPicked: {},
    divisionPickedCount: 0,
    divisionSubmitting: false,
    // 分笼 / 转移（选位模式，对齐 Web 端 useCageOpSelect）
    opActive: false,
    opKind: '',                    // divide | transfer
    opBatch: false,                // 批量转移：确认弹窗按「对」而非「个」，一次提交多组源→目标
    opSourceCageId: '',
    opSourceLabel: '',
    opTargetMap: {},               // animalCageId → 目标行（selectable/reason/坐标）
    opSelectedCageIds: {},         // animalCageId → true
    opSelectedCount: 0,
    opLoading: false,
    opError: '',
    opConfirmOpen: false,
    opPicked: [],                  // 确认弹窗用的坐标清单
    opKeepSource: true,            // 分笼默认保留源笼位；不勾选才归档
    opReason: '',
    opSubmitting: false,
    // 转移单（仅 transfer）：自动值来自 /cage-op/transfer-form/prefill，学生改动另记一份（只发动过的值）
    opFormLoading: false,
    opFormReady: false,            // prefill 取到了没有（取不到不拦提交，学生手填）
    opFormAuto: {},                // 只读自动值 {piName, experimenterName, fromLocation, toLocation}
    opFormDate: '',                // 显示值（顶层三项）
    opFormUnit: '',
    opFormPhone: '',
    opFormRows: [],                // 显示值 [{strain,female,male}]，下标与 opPicked 对齐
    opFormEdits: {},               // 学生动过的值 {transferDate?,unitName?,phone?,rows?[]}，只装改动
    // 待审分笼/转移中间态：animalCageId → { color, label, kind, abbr }（源与目标同色，仅作选位拦截与叠层）
    cageOpMarkers: {},
    // ── 批量转移 / 分笼（跨房间缓冲抽屉）──
    btOpen: false,
    /**
     * transfer | divide。两者共用这套抽屉（树 / 单架网格 / 两屏 / 缓冲条全复用），差别在：
     *  - transfer：N 源 → 逐源配 1 个目标（`btTargets` 那张 1:1 配对表）+ 转移单表单
     *  - divide  ：**固定 1 源**（入口格）→ N 目标多选（`btDivTargets` 有序数组）、无转移单、有 keepSource
     * 两个模式的目标集合字段是分开的，别把转移那套改坏。
     */
    btMode: 'transfer',
    btKeepSource: true,       // 分笼：保留源笼位（后端默认也是保留；不保留则源笼位归档为空笼盒且不可逆）
    btDivTargets: [],         // 分笼：已选目标 animalCageId 有序数组
    btSourceLabel: '',        // 分笼：「源笼位」那一行显示的坐标
    btPhase: 'source',        // source | target
    btScreen: 'tree',         // tree | grid（「阶段」与「屏」是两件事，别混）
    btTree: [],               // [{ campusName, collapsed, rooms:[{ roomKey, roomName, collapsed, shelves:[{shelveId,shelveName,roomId,roomName,count}] }] }]
    btShelf: null,            // 屏 B 当前打开的那一个架 { shelveId, shelveName, roomId, roomName, loading, error, grid }
    btEmptyText: '',
    btAnchorId: '',           // 入口格（点「转移笼位」那一格）的 id：它被自动放进缓冲，提示文案要交代来历
    btHint: '',               // 当前该做什么（分阶段算，_btRebuildChrome 维护）
    btSources: [],            // [{ animalCageId, label, shelveId, shelveName, roomId, roomName }] 顺序即展示顺序
    btCursor: 0,              // 目标阶段：当前配到第几个源
    btPoolMap: {},            // sourceId -> { loading, error, pool: [], byCage: {}, rooms: [] }
    btTargets: {},            // sourceId -> targetAnimalCageId
    btPairTargetIds: [],       // 提交时按下标取的目标 id 列表（与 opPicked/opFormRows 对齐，不在提交时重算顺序）
    btRows: [],               // 配对条展示行（见 _btRebuildChrome）
    btCursorText: '',
    btBufferTitle: '',
    btConfirmOff: true,
    // 动作条/缓冲条的显隐与文案都由 _btRebuildChrome 算好，wxml 里不再塞三元表达式
    btShowNext: false,          // 「下一步」（仅转移的源阶段）
    btShowBackToSource: false,  // 「返回选源」（仅转移的目标阶段）
    btCanClear: false,          // 「清空」可见
    btChipRemovable: false,     // chip 上的 × 可见
    btSubmitLabel: '',          // 主按钮文案（不含「提交中…」那一档）
    btSubmitting: false,
    btChecking: false,        // 逐格 operable 校验的重入保护
    // 详情弹窗内的操作入口（/cage-op/operable 结果）
    detailOperable: false,
    detailOperableCode: '',
    detailOperableReason: '',
    detailCanClaimOnBehalf: false,
    detailGroupNames: [],
    detailClaiming: false,
    detailClearingDivision: false,   // 详情弹窗「清空划分」提交态
    // 归档
    archiveTarget: null,
    showArchiveDialog: false,
    archiveSubmitting: false,
    // 记录
    recordTarget: null,
    recordOpen: false,
    recordLoading: false,
    recordEvents: [],
    recordFieldCount: 0,
    // 预约
    bookingRooms: [],
    bookingLoading: false,
    bookingRoom: null,          // 当前笼架所在房间概览（含 remaining/bookedPct/usedPct）
    bookingAups: [],            // 房间内 AUP 分配明细
    bookingAupLoading: false,
    bookingAupOptions: [],      // AUP 字典 [{id, registerNo, projectGroupName, piName}]
    bookingPiNames: [],         // 去重后的课题组名（选择弹窗的数据源）
    // 选择弹窗（课题组 / AUP 编号共用）：课题组上百个、AUP 也可能几十条，原生 picker 滚不动
    bookingPickerOpen: false,
    bookingPickerTarget: '',    // 'pi' 选课题组 / 'aup' 选 AUP 编号
    bookingPickerTitle: '',
    bookingPickerKeyword: '',
    bookingPickerRows: [],      // [{ key, label }]，已按关键字过滤
    bookingPickerPicked: '',    // 当前值（打勾用）
    bookingEditingId: null,     // null | 'new' | aupId
    bookingEdit: { piName: '', aupId: '', rentNumber: 0, memo: '', registerNumber: '' },
    bookingEditAupOptions: [],  // 按所选课题组过滤后的 AUP 编号 [{id, registerNo}]
    bookingSaving: false,
    editingCapacity: false,
    capacityDraft: '',
    savingCapacity: false,
    // 学生申请
    poolByCageId: {},
    claimSubmitting: false,
    // 学生确认模式：本人待确认到位(locked)的 animalCageId 集合（网格琥珀高亮用）
    myClaimCageIds: {},
    // 我的申请（笼位认领）
    myClaimsOpen: false,
    myClaimsLoading: false,
    myClaims: [],
    // 我的申请里并进来的「转移申请」段：与「我的转移单」弹窗同一份数据、同一张卡片模板
    myTransfersLoading: false,
    myTransfers: [],
    // 我的转移单
    transferFormsOpen: false,
    transferFormsLoading: false,
    transferForms: [],
    scannedCellX: -1,
    scannedCellY: -1,
    scannedPosition: '',
    scannedCageBoxCode: '',
    legendOpen: false,
    scanCache: {},               // { "x:y": { cell, code, actions: {DIVIDE, SPECIAL_BREEDING, HEALTH_CHECK} } }
    scanCacheSize: 0,
    scanTotalActions: 0,
    /** 待选区（缓冲区）统一视图模型：{ key, label, meta }，选中类模式取自 selectedCells，状态模式取自 scanCache */
    stagedItems: [],
    lastScannedKey: '',
    lastScannedEntry: Object.assign({ position: '', code: '' }, cageStatus.newActionStateKeys()),
    // 状态动作表（供 wxml 遍历渲染，五个动作单一来源）
    CAGE_STATUS_ACTIONS: cageStatus.CAGE_STATUS_ACTIONS,
    /** 状态模式里**可渲染**的动作按钮：默认全量（教职工），学生视角按后端 modeActions.edit 过滤 */
    editActionOptions: cageStatus.CAGE_STATUS_ACTIONS,
    /** 「需特殊饲养」这个动作在不在上面的可选清单里（不在 = 本区/本身份没开放它，明细块整块不渲染） */
    editActionSfParentAvailable: true,
    /** 严重程度块的父开关（健康异常）是否在本区可选清单里 */
    editActionHaParentAvailable: true,
    /**
     * 特殊饲养明细（子状态）：
     *   specialDetailOptions —— 可选项，读码表（维护人可加项，所以不硬编码）
     *   editDetailInitial/Current —— 当前笼位的明细选中集（{item_code: true}，与动作那套同形）
     *   editActionSfOn —— 该笼位「需特殊饲养」当前是否开着（明细块强绑定判据）
     */
    specialDetailOptions: [],
    editDetailInitial: {},
    editDetailCurrent: {},
    /** 健康异常严重程度的可选项（码表维护，可增长）与当前值（互斥单选，'' = 未选） */
    severityOptions: [],
    editSeverityInitial: '',
    editSeverityCurrent: '',
    /** 健康异常「瘙痒」（布尔子值）：进弹窗时的服务端值 / 当前值 */
    editItchInitial: false,
    editItchCurrent: false,
    /** 健康异常父状态当前是否为 on —— 严重程度块的强绑定判据（与明细的 editActionSfOn 同款） */
    editActionHaOn: false,
    editActionSfOn: false,
    /** 后端下发的「模式 → 可用动作 code」矩阵（学生视角才有） */
    modeActions: {},
    actionSubmitting: false,
    editActionCell: null,       // 编辑模式弹出的 cell
    editActionPopup: false,     // 弹窗显隐
    editActionPhotos: [],       // 弹窗内上传的照片
    editActionNote: "",         // 弹窗内备注
    editActionUploading: false,
    editHistory: [],            // 弹窗内历史记录
    editHistoryLoading: false,
    confirmLookup: null,        // 扫码确认的 lookup 结果（含 cageCell + claim）
    confirmRows: [],            // 核对弹窗字段行
    showConfirmDialog: false,
    confirmSubmitting: false,
    navBarHeight: 64,

    // Cell detail（对齐 Web CellDetailPanel / MobileCageCellDetailDialog）
    selectedCell: null,
    cellDetailMeta: null,
    showCellDetail: false,
    // 弹窗分区折叠态（查看/状态弹窗共用；记录弹窗不使用）
    openSections: { info: true, status: true, exp: true, history: false },
    cellDetail: null,
    experimentDesc: '',
    detailImages: [],
    detailStatusPhotos: {},
    detailHasStatusBlock: false,
    detailAnnotationLoading: false,
    // 关键信息表单（统一表单系统动态渲染，取代原先硬编码的 PI/部门/AUP/动物信息几行）
    formRows: [],        // 扁平副本：扫码确认弹窗按平铺渲染，用这一份
    formGroups: [],      // 按模板分区分组：查看弹窗渲染与编辑用这一份
    formLoading: false,
    formError: '',
    formEditable: false,     // 服务端 /cage-op/editable 判定
    formEditableReason: '',  // 判定不通过的原因，展示给用户（不展示他就只看到按钮消失了）
    formEditing: false,
    formSaving: false,
    formSaveMsg: '',
    formSaveMsgType: '',
    detailSaving: false,
    detailSaveMsg: "",
    detailSaveMsgType: "",
    detailImageUploading: false,

    // 特殊状态弹窗
    allExpanded: false,
    anyExpanded: false,
    scannedAt: '',
    highlightTarget: null,  // { shelveId, x, y, campusName, roomName } 扫码跳转高亮
    scanLockHighlight: null, // { sid: shelveId, x, y } 扫码定位闪烁高亮
    /** 顶栏收件箱入口：能不能进由后端 canEnter 说了算；未读数字跟在按钮文字后面 */
    vetCanEnter: false,
    vetUnreadText: '',
    /** 收件箱弹窗（列表 + 笼位详情都收在组件内） */
    vetInboxOpen: false,
  },

  /** 顶栏收件箱入口：每次回到本页都重探一次（弹窗里点了「已查看」回来，角标要跟着变） */
  onShow: function() {
    this.loadVetEntry();
  },

  loadVetEntry: function() {
    var self = this;
    springAuth.springRequest({ url: '/api/cage-vet/entry', method: 'GET', data: {} })
      .then(function(res) {
        var up = unwrap(res);
        if (!up.ok || !up.data || up.data.canEnter !== true) {
          self.setData({ vetCanEnter: false, vetUnreadText: '' });
          return;
        }
        var n = Number(up.data.unreadCount || 0);
        self.setData({
          vetCanEnter: true,
          vetUnreadText: n > 99 ? '99+' : (n > 0 ? String(n) : ''),
        });
      })
      .catch(function() {
        self.setData({ vetCanEnter: false, vetUnreadText: '' });
      });
  },

  onOpenVetInbox: function() {
    this.setData({ vetInboxOpen: true });
  },

  onCloseVetInbox: function() {
    this.setData({ vetInboxOpen: false });
    // 弹窗不是页面，关掉不会触发 onShow —— 这里补一次入口角标的重探
    this.loadVetEntry();
  },

  /** 弹窗内未读数变了：立刻更新入口那枚数字，不等下次 onShow */
  onVetUnreadChange: function(e) {
    var n = Number((e.detail && e.detail.count) || 0);
    this.setData({ vetUnreadText: n > 99 ? '99+' : (n > 0 ? String(n) : '') });
  },

  onLoad: function(options) {
    var self = this;
    this._btShelfGridCache = {};  // 批量转移：shelveId → 已加载的网格，切回看过的架不重拉
    this._btNotOperable = {};     // 批量转移：点过后端说不能操作的笼位 id → 原因，用来把格子预先打上网纹
    var role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    var token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
    if (!token || !canAccessCageShelfPage(role)) {
      wx.showToast({ title: '无权限', icon: 'none' });
      self._accessDenied = true;
      wx.navigateBack({ delta: 1 });
      return;
    }

    // 当前账号 id + 本人课题组：划分名单比对与默认候选人来源
    var ui = null;
    try {
      var rawUi = wx.getStorageSync(springAuth.KEYS.USER_INFO);
      ui = rawUi ? (typeof rawUi === 'string' ? JSON.parse(rawUi) : rawUi) : null;
    } catch (e) { ui = null; }
    cageCellVisual.setAccountId(ui && ui.id != null ? ui.id : '');
    self._myGroupName = (ui && ui.projectGroupName) || '';

    // 拉取用户自定义配色（与 web/H5 共享 /v1/cage-shelves/user-colors），失败回退默认色
    springAuth.springRequest({ url: '/api/v1/cage-shelves/user-colors', method: 'GET', data: {} }).then(function(res) {
      var up = unwrap(res);
      if (up.ok && up.data && typeof up.data === 'object') setUserColors(up.data);
    }).catch(function() { /* 保持默认色 */ });

    // 特殊饲养明细的可选项：读码表（维护人可加项，所以不硬编码）；失败就不显示明细块
    springAuth.springRequest({ url: '/api/admin/cage-info/codelists/' + SPECIAL_DETAIL_DICT, method: 'GET', data: {} }).then(function(res) {
      var up = unwrap(res);
      if (up.ok && up.data && up.data.items) self.setData({ specialDetailOptions: up.data.items });
    }).catch(function() { /* 没配码表就不显示 */ });

    // 健康异常严重程度的可选项：同样读码表（加项不用改代码）；失败就不显示严重程度块
    springAuth.springRequest({ url: '/api/admin/cage-info/codelists/' + HEALTH_SEVERITY_DICT, method: 'GET', data: {} }).then(function(res) {
      var up = unwrap(res);
      if (up.ok && up.data && up.data.items) self.setData({ severityOptions: up.data.items });
    }).catch(function() { /* 没配码表就不显示 */ });

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

    // 视角统一收敛：教职工=!isStudentAccount()，学生=isStudentAccount()
    var isStaffView = !isStudentAccount();
    self.setData({
      isStaffView: isStaffView,
      pageMode: 'view',
      modeColor: '',
      modeOptions: buildModeOptions(isStaffView),
      highlightTarget: highlightTarget,
      ...readCustomNavMetrics()
    });
    self.loadShelves();

    self.loadVisibleModes();
  },

  /**
   * 拉后端下发的可见模式列表（身份由后端算好）；失败保留本地硬编码默认 modeOptions。
   *
   * **按当前房间拉**：区域饲养组长把某模式在本房关掉后，切到这个房间就不该再看到该模式入口。
   * 只带 roomId —— 楼层/校区由后端按房间反查补齐（gridMeta 里没有这两级）。
   */
  loadVisibleModes: function() {
    var self = this;
    var meta = self.data.gridMeta || {};
    var roomId = String(meta.roomId || '');
    springAuth.springRequest({
      url: '/api/cage-mode/visible', method: 'GET',
      data: roomId ? { roomId: roomId } : {}
    }).then(function(res) {
      var up = unwrap(res);
      var modes = (up.ok && up.data && up.data.modes) || [];
      // 与 Web 一致（student-cage-shelf.tsx:134 `isStudent ? modes : null`）：学生视角仅在后端确认是学生时才用其列表过滤，
      // 否则不过滤——镜像/高权限场景后端下发的是教职工模式，取交集会把「申请预约」滤掉。
      var backendIsStudent = !!(up.ok && up.data && up.data.isStudent);
      if (modes.length > 0 && (self.data.isStaffView || backendIsStudent)) {
        var modeActions = (up.ok && up.data && up.data.modeActions) || {};
        var editOptions = filterEditActions(modeActions.edit);
        self.setData({
          visibleModes: modes,
          modeActions: modeActions,
          modeOptions: buildModeOptions(self.data.isStaffView, modes),
          editActionOptions: editOptions,
          // 明细块的父开关在不在本区可选清单里 —— 不在就整块不渲染（开关都没有，子项不该出现）
          editActionSfParentAvailable: editOptions.some(function (a) { return a && a.action === 'SPECIAL_BREEDING'; }),
          // 严重程度块同理：健康异常这个父开关不在清单里就不渲染
          editActionHaParentAvailable: editOptions.some(function (a) { return a && a.action === HEALTH_CHECK_ACTION; })
        });
      }
    }).catch(function() { /* 保留默认硬编码 modeOptions */ });
  },

  /* ------------------------------------------------------------------ */
  /*  Data Loading                                                        */
  /* ------------------------------------------------------------------ */

  loadShelves: function(silent) {
    var self = this;
    // silent：下拉刷新走的静默路径，不碰 loading，列表不卸载、滚动位置不丢
    if (!silent) self.setData({ loading: true, error: '' });

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

    return Promise.all([p1, p2]).then(function(results) {
      var p = unwrap(results[0]);
      if (!p.ok) {
        if (silent) { wx.showToast({ title: p.message || '刷新失败', icon: 'none' }); return; }
        self.setData({ loading: false, error: p.message });
        return;
      }
      var shelves = (p.data && p.data.shelves) || [];
      var totalCount = (p.data && p.data.totalCount) || shelves.length;
      // 后端给的是 ISO（2026-09-11T15:00:01），直接怼在中文界面里很扎眼；这里统一成
      // 「09-11 15:00 扫描」（省掉年份，头部空间紧），秒对用户没有意义
      var scannedAtRaw = (p.data && p.data.scannedAt) || '';
      var scannedAtText = beijingTime.formatBeijingDateTimeMinute(scannedAtRaw);
      var scannedAt = scannedAtText ? (scannedAtText.slice(5) + ' 扫描') : '';

      // 合并 full-tree 的类型计数到每个 shelf
      var treeResult = unwrap(results[1]);
      var treeData = treeResult.ok ? treeResult.data : [];
      var typeMap = {};
      shelfIndexIdMap = {};
      for (var ti = 0; ti < (treeData || []).length; ti++) {
        var tn = treeData[ti];
        if (tn.shelveId) {
          typeMap[String(tn.shelveId)] = { t1: tn.type1 || 0, t2: tn.type2 || 0, t3: tn.type3 || 0, t4: tn.type4 || 0 };
        }
        if (tn.shelveId && tn.id != null) {
          shelfIndexIdMap[String(tn.shelveId)] = tn.id;
        }
      }
      for (var si = 0; si < shelves.length; si++) {
        var sc = typeMap[String(shelves[si].shelveId)];
        if (sc) {
          shelves[si].c1 = sc.t1; shelves[si].c2 = sc.t2; shelves[si].c3 = sc.t3; shelves[si].c4 = sc.t4;
        }
      }

      var campusGroups = cageTreeGrouping.groupShelvesByCampus(shelves);
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
            /* 收藏星标的粒度 = **真实房间**：组名本来就是真实房号（201A/201B/201C），
               行首那个 201 只是按房号前缀聚合出来的展示行。
               一个组一个 roomId —— 与 Web 树「一个房间节点 = 一个 roomId」（roomIdOf）对齐。
               原先星标挂在聚合行上、按「本行全部 roomId 全中才亮」算，那是聚合结构逼出来的补偿。 */
            grp.roomId = '';
            for (var sk = 0; sk < grp.shelves.length; sk += 1) {
              if (grp.shelves[sk].roomId) { grp.roomId = String(grp.shelves[sk].roomId); break; }
            }
            grp._fav = false;
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
      // 列表就绪后拉一次收藏（房间级 + 笼架级），把 ☆ 状态贴上去
      self.loadFavorites();

      // 扫码跳转：自动展开并导航到目标笼位
      if (self.data.highlightTarget) {
        console.log('[mp-jump] trigger from loadShelves, highlightTarget:', JSON.stringify(self.data.highlightTarget));
        self._autoJumpToHighlightTarget(self.data.highlightTarget, shelves, campusGroups);
      }
    }).catch(function(e) {
      if (silent) { wx.showToast({ title: (e && e.message) || '刷新失败', icon: 'none' }); return; }
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
    var roomParentKey = cageTreeGrouping.extractParentRoomKey(roomName);
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

    // 优先：用 target.shelveId 精确匹配（首页扫码 / 审核页跳转都传了 shelveId），
    // 避免多架房间里按 campus+room 取第一个笼架导致定位错。
    var listShelveId = null;
    if (target.shelveId) {
      for (var ciS = 0; ciS < campusGroups.length && !listShelveId; ciS++) {
        var roomsS = campusGroups[ciS].rooms || [];
        for (var riS = 0; riS < roomsS.length && !listShelveId; riS++) {
          var sgsS = roomsS[riS].shelfGroups || [];
          for (var giS = 0; giS < sgsS.length && !listShelveId; giS++) {
            var shelvesS = sgsS[giS].shelves || [];
            for (var siS = 0; siS < shelvesS.length; siS++) {
              if (String(shelvesS[siS].shelveId) === String(target.shelveId)) {
                listShelveId = shelvesS[siS].shelveId;
                console.log('[mp-jump] matched by shelveId:', listShelveId);
                break;
              }
            }
          }
        }
      }
    }
    // 回退：无 shelveId 或未精确命中时，取 campus+room 范围内第一个 shelf
    if (!listShelveId) {
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

  /* ── 列表下拉刷新（scroll-view 原生 refresher）────────────────────
     为什么不在页面级 onPullDownRefresh 上做：页面本身不滚（滚动在内层 scroll-view），
     页面级下拉**没有阈值可调**，于是在页面任意位置（连吸顶搜索框、导航栏上）稍微一拖
     就开始把整页往下拽 —— 手感就是「太敏感」，还连带把导航栏和吸顶头一起拉走。
     原生 refresher 只在列表自身拉到顶、再多拉一段时才触发，指示器也由列表自己画。 */
  onListRefresher: function () {
    var self = this;
    self.setData({ refreshing: true });
    // loadShelves(true) 是静默路径：不碰 loading、列表不卸载、滚动位置不丢；失败自己 toast
    self.loadShelves(true).then(function () {
      self.setData({ refreshing: false });
    }).catch(function () {
      // 兜一层：请求异常时别把指示器挂死
      self.setData({ refreshing: false });
    });
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
            c1: src.c1, c2: src.c2, c3: src.c3, c4: src.c4,
            /* 收藏要用：重建时把真实 roomId 与 ☆ 状态一起带上，否则过滤后星标就点不动了 */
            roomId: src.roomId || '',
            _fav: src._fav === true
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
    var self2 = this;
    this.setData({ shelfGroups: filtered, filteredShelfCount: totalShelfCount }, function() { self2.applyFavFlags(); });
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

  /* ═══════════════════════════════════════════════════════════
     收藏（2026-09-19）：房间级走新接口 /cage-shelves/room-bookmarks，
     笼架级走老接口 /cage-shelves/bookmarks；弹层平铺，点一条直达。
     房间行是「按房号前缀聚合」的一行 → 收藏它 = 收藏它下面全部 roomId，
     星标状态取「全中才亮」。
     ═══════════════════════════════════════════════════════════ */

  /** 拉两份收藏（失败就当空，不弹错）+ 把状态贴回列表 */
  loadFavorites: function() {
    var self = this;
    var done = 0, rooms = [], shelves = [];
    var finish = function() {
      done++;
      if (done < 2) return;
      self.setData({ favRoomIds: rooms, favShelfIds: shelves }, function() {
        self.applyFavFlags();
        self.buildFavItems();
      });
    };
    springAuth.springRequest({ url: '/api/cage-shelves/room-bookmarks', method: 'GET', data: {} }).then(function(res) {
      var up = unwrap(res);
      if (up.ok && up.data && up.data.roomIds) rooms = up.data.roomIds.map(String);
      finish();
    }).catch(function() { finish(); });
    springAuth.springRequest({ url: '/api/cage-shelves/bookmarks', method: 'GET', data: {} }).then(function(res) {
      var up = unwrap(res);
      if (up.ok && up.data) shelves = up.data.map(function(b) { return String(b.shelveId); });
      finish();
    }).catch(function() { finish(); });
  },

  /** 收藏状态贴回列表：房间行「全中才亮」，笼架行看自己的 shelveId */
  applyFavFlags: function() {
    var favRooms = this.data.favRoomIds || [];
    var favShelves = this.data.favShelfIds || [];
    var groups = this.data.shelfGroups || [];
    for (var ci = 0; ci < groups.length; ci++) {
      var rooms = groups[ci].rooms || [];
      for (var ri = 0; ri < rooms.length; ri++) {
        var grps = rooms[ri].shelfGroups || [];
        for (var gi = 0; gi < grps.length; gi++) {
          /* 房间星标挂在**真实房间**（组）上，一个组一个 roomId —— 不再按聚合行算「全中才亮」 */
          grps[gi]._fav = !!grps[gi].roomId && favRooms.indexOf(grps[gi].roomId) >= 0;
          var shs = grps[gi].shelves || [];
          for (var sj = 0; sj < shs.length; sj++) shs[sj]._fav = favShelves.indexOf(String(shs[sj].shelveId)) >= 0;
        }
      }
    }
    this.setData({ shelfGroups: groups });
  },

  /** 弹层数据：按收藏顺序平铺（房间一条、笼架一条），名字从当前列表里查。
      房间条目自带它下面的笼架列表 —— 收藏夹里点房间是**原地展开**看笼架，不再跳回列表。 */
  buildFavItems: function() {
    var favRooms = this.data.favRoomIds || [], favShelves = this.data.favShelfIds || [];
    var byRoomId = {}, byShelve = {};
    var groups = this.data.shelfGroups || [];
    for (var ci = 0; ci < groups.length; ci++) {
      var cg = groups[ci], rooms = cg.rooms || [];
      for (var ri = 0; ri < rooms.length; ri++) {
        var rm = rooms[ri], grps = rm.shelfGroups || [];
        for (var gi = 0; gi < grps.length; gi++) {
          var grp = grps[gi];
          // 房间显示名用**真实房号**（组的名字 201A）——聚合行名 201 不带后缀，点进去挑不准
          var roomName = grp.name || rm.roomName;
          var shs = grp.shelves || [];
          if (grp.roomId && !byRoomId[grp.roomId]) {
            byRoomId[grp.roomId] = {
              roomName: roomName,
              campusName: cg.campusName,
              shelves: shs.map(function(x) {
                return { shelveId: String(x.shelveId), shelveName: x.shelveName || String(x.shelveId) };
              })
            };
          }
          for (var sj = 0; sj < shs.length; sj++) {
            var s = shs[sj];
            byShelve[String(s.shelveId)] = {
              shelveName: s.shelveName || s.shelveId, roomName: roomName,
              campusName: cg.campusName, roomId: String(s.roomId || grp.roomId || '')
            };
          }
        }
      }
    }
    /* 展开状态跨重建保留：勾一个收藏 / 拉一次数据都会重建 favItems，
       不带上就是把用户刚展开的房间又收回去 */
    var prevOpen = {};
    var prevItems = this.data.favItems || [];
    for (var pi = 0; pi < prevItems.length; pi += 1) {
      if (prevItems[pi]._open) prevOpen[prevItems[pi].key] = true;
    }
    var items = [];
    for (var i = 0; i < favRooms.length; i++) {
      var r = byRoomId[favRooms[i]] || {};
      var roomKey = 'room:' + favRooms[i];
      items.push({
        key: roomKey,
        kind: 'room', id: favRooms[i], name: r.roomName || favRooms[i],
        sub: r.campusName || '', roomName: r.roomName || '', campusName: r.campusName || '',
        shelves: r.shelves || [], _open: !!prevOpen[roomKey]
      });
    }
    for (var j = 0; j < favShelves.length; j++) {
      var sh = byShelve[favShelves[j]] || {};
      items.push({
        key: 'shelf:' + favShelves[j],
        kind: 'shelf', id: favShelves[j], name: sh.shelveName || favShelves[j],
        sub: sh.roomName || '', roomName: sh.roomName || '', campusName: sh.campusName || '',
        roomId: sh.roomId || ''
      });
    }
    this.setData({ favItems: items });
  },

  /** 点收藏夹里的**房间**条目：原地展开/收起它下面的笼架，不跳列表 */
  onFavRoomTap: function(e) {
    var idx = Number((e.currentTarget.dataset || {}).index);
    var it = (this.data.favItems || [])[idx];
    if (!it) return;
    var patch = {};
    patch['favItems[' + idx + ']._open'] = !it._open;
    this.setData(patch);
  },

  onOpenFavorites: function() {
    this.setData({ favOpen: true });
    this.loadFavorites();
  },
  onCloseFavorites: function() { this.setData({ favOpen: false }); },

  /** 点「真实房间」那一行的 ☆：一个房间一个 roomId，直接切换（与 Web 的 toggleRoom(roomId) 同语义） */
  onToggleRoomFav: function(e) {
    var self = this;
    var id = String(e.currentTarget.dataset.roomId || '');
    if (!id) return;
    var next = (self.data.favRoomIds || []).slice();
    var idx = next.indexOf(id);
    if (idx >= 0) next.splice(idx, 1); else next.push(id);
    self.setData({ favRoomIds: next }, function() { self.applyFavFlags(); self.buildFavItems(); });
    self.putFavorite('/api/cage-shelves/rooms/' + encodeURIComponent(id) + '/bookmark');
  },

  /** 点「笼架卡」的 ☆ */
  onToggleShelfFav: function(e) {
    var self = this;
    var sid = String(e.currentTarget.dataset.shelveId || '');
    var rid = String(e.currentTarget.dataset.roomId || '');
    if (!sid || !rid) return;
    var favShelves = self.data.favShelfIds || [];
    var idx = favShelves.indexOf(sid);
    var next = favShelves.slice();
    if (idx >= 0) next.splice(idx, 1); else next.push(sid);
    self.setData({ favShelfIds: next }, function() { self.applyFavFlags(); self.buildFavItems(); });
    self.putFavorite('/api/cage-shelves/' + encodeURIComponent(rid) + '/' + encodeURIComponent(sid) + '/bookmark');
  },

  /** 收藏写盘（两个接口都是「切换」语义）：失败就重拉一次把界面拉回真值 */
  putFavorite: function(url) {
    var self = this;
    springAuth.springRequest({ url: url, method: 'PUT', data: {} }).then(function(res) {
      var up = unwrap(res);
      if (!up.ok) { wx.showToast({ title: up.message || '收藏失败', icon: 'none' }); self.loadFavorites(); }
    }).catch(function() { wx.showToast({ title: '收藏失败', icon: 'none' }); self.loadFavorites(); });
  },

  /** 点收藏夹里的**笼架**条目（直接收藏的那条，或房间展开后列出的那条）：
      关弹层、直接进那一架的网格。房间条目走 onFavRoomTap（原地展开），不再从这里跳列表。 */
  onJumpFavorite: function(e) {
    var self = this;
    var ds = e.currentTarget.dataset || {};
    self.setData({ favOpen: false });
    if (ds.kind === 'shelf' && ds.shelveId) {
      var groups = self.data.shelfGroups || [];
      for (var ci = 0; ci < groups.length; ci++) {
        var rooms = groups[ci].rooms || [];
        for (var ri = 0; ri < rooms.length; ri++) {
          var grps = rooms[ri].shelfGroups || [];
          for (var gi = 0; gi < grps.length; gi++) {
            var shs = grps[gi].shelves || [];
            for (var sj = 0; sj < shs.length; sj++) {
              if (String(shs[sj].shelveId) === String(ds.shelveId)) {
                self.onShelfTap({ currentTarget: { dataset: { shelveId: shs[sj].shelveId } } });
                return;
              }
            }
          }
        }
      }
      return;
    }
  },


  onClearFilter: function() {
    var self = this;
    self.setData({
      searchQuery: '',
      roomFilter: '',
      roomFilterIndex: 0,
      shelfGroups: JSON.parse(JSON.stringify(self.data.allShelfGroups)),
      filteredShelfCount: self.data.totalCount
    }, function() { self.applyFavFlags(); });
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
    if (!shelveId) {
      // 兜底：无有效 shelveId 时不发 404 请求，回到列表并提示
      self.setData({ loading: false, error: '未选择笼架', screen: 'list' });
      return;
    }
    self.setData({ gridLoading: true, gridError: '', screen: 'grid' });

    springAuth.springRequest({
      url: '/api/cage-cell-index/local-grid/by-shelve/' + shelveId,
      method: 'GET'
    }).then(function(res) {
      var p = unwrap(res);
      if (!p.ok) {
        self.setData({ gridLoading: false, gridError: p.message });
        return;
      }
      var data = p.data || {};
      var shelfMeta = data.shelfMeta || {};
      var gridCells = data.grid || [];
      var grid = buildGrid(gridCells);

      var patch = {
        gridLoading: false,
        gridError: '',
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
      // 网格重建后重新投影池内/选中标记（学生申请 & 各选中模式）
      self.applyPoolToGrid();
      self.applySelectionToGrid();
      self.applyMyClaimToGrid();
      // 选位模式下切架：不重投影 op 池高亮，绿色可选环会消失、要再点一次格子才回来
      self.applyOpToGrid();
      self.loadCageOpMarkers();
      // 换了房间 → 模式入口重算（区域组长可能把某些模式在本房关掉了）
      self.loadVisibleModes();
    }).catch(function(e) {
      self.setData({ gridLoading: false, gridError: (e && e.message) || '加载失败' });
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
    var mode = this.data.pageMode;
    if (mode === 'edit') { this.handleEditScan(code); this._maybeRescan(); return; }
    if (mode === 'confirm') { this.handleConfirmScan(code); return; }
    if (mode === 'archive') { this.handleArchiveScan(code); return; }
    // 选择类模式：扫码 = 把该笼位加入选中（走各模式自己的校验），不再退化成「仅定位」
    if (mode === 'allocate' || mode === 'reserve' || mode === 'studentClaim') {
      this.handleSelectScan(code);
      this._maybeRescan();
      return;
    }
    this.handleViewScan(code);
  },

  /** 连续扫码开关 */
  onToggleScanContinuous: function() {
    this.setData({ scanContinuous: !this.data.scanContinuous });
  },

  /** 只有这四个模式 + 开关打开时才自动重开；回调里再校验一次模式，换模式后不会误触发 */
  _maybeRescan: function() {
    if (!this.data.scanContinuous) return;
    var self = this;
    var inScope = function(m) {
      return m === 'allocate' || m === 'reserve' || m === 'studentClaim' || m === 'edit';
    };
    if (!inScope(this.data.pageMode)) return;
    if (this._rescanTimer) clearTimeout(this._rescanTimer);
    this._rescanTimer = setTimeout(function() {
      if (!self.data.scanContinuous || !inScope(self.data.pageMode)) return;
      self.onScanLock();
    }, 400);
  },

  /** 码 → 本架网格单元；坐标取不到或笼架对不上返回 null（两种编码形态与 _locateLookup 一致） */
  _cellFromLookup: function(r) {
    var pos = null;
    var sid = '';
    if (r.type === 'CAGE_CELL' && r.cageCell) {
      pos = { x: r.cageCell.positionX, y: r.cageCell.positionY };
      sid = String(r.cageCell.shelveId || '');
    } else if (r.type === 'LEGACY_CAGE_BOX') {
      if (r.positionX != null && r.positionY != null) pos = { x: r.positionX, y: r.positionY };
      sid = String(r.shelveId || '');
    }
    if (!pos) return null;
    var meta = this.data.gridMeta || {};
    var curSid = String(meta.shelveId || (this.data.selectedShelf && this.data.selectedShelf.shelveId) || '');
    if (sid && curSid && sid !== curSid) return null;
    var grid = this.data.grid || [];
    for (var i = 0; i < grid.length; i++) {
      if (Number(grid[i].x) === Number(pos.x) && Number(grid[i].y) === Number(pos.y)) return grid[i];
    }
    return null;
  },

  /** 扫码入选中：复用各模式已有的校验函数，避免绕过闸门把不合格笼位塞进来 */
  handleSelectScan: function(code) {
    var self = this;
    assetApi.lookupCode(code).then(function(r) {
      if (r.type === 'NOT_FOUND') { wx.showToast({ title: '未找到对应笼位', icon: 'none' }); return; }
      if (r.type === 'ASSET') { wx.showToast({ title: '该编码为资产编号，非笼位', icon: 'none' }); return; }
      var cell = self._cellFromLookup(r);
      if (!cell) { wx.showToast({ title: '该笼位不在当前笼架', icon: 'none' }); return; }
      var key = cell.x + ':' + cell.y;
      if ((self.data.selectedCells || {})[key]) { wx.showToast({ title: '该笼位已选中', icon: 'none' }); return; }
      var mode = self.data.pageMode;
      if (mode === 'allocate') self.toggleAllocateCell(cell);
      else if (mode === 'reserve') self.toggleReserveCell(cell);
      else if (mode === 'studentClaim') self.toggleStudentClaimCell(cell);
    }).catch(function() {
      wx.showToast({ title: '扫码查询失败', icon: 'none' });
    });
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
            self.setData({ formRows: [], formGroups: [], formLoading: false, formError: '' });
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
    // 教职工走管理端代确认，学生走本人确认（对齐 AdminCageShelfPage / student-cage-shelf）
    var url = self.data.isStaffView
      ? '/api/admin/cage-claims/' + claim.id + '/confirm'
      : '/api/student/cage-claims/' + claim.id + '/confirm';
    springAuth.springRequest({
      url: url,
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

  /** 模式选择器点击 */
  onSwitchMode: function(e) {
    var mode = e.currentTarget.dataset.mode;
    if (!mode) return;
    this.switchMode(mode);
  },

  /** 左下角模式坞选模式（组件抛 detail.mode，复用同一套 switchMode） */
  onDockMode: function(e) {
    var mode = e.detail && e.detail.mode;
    if (!mode) return;
    this.switchMode(mode);
  },

  /** 统一模式切换：清空选中集/扫码缓存/待提交态，避免模式间状态串味 */
  switchMode: function(mode) {
    var self = this;
    self.setData({
      pageMode: mode,
      modeColor: MODE_COLOR[mode] || '',
      selectedCells: {},
      selectedCount: 0,
      scanCache: {},
      scanCacheSize: 0,
      scanTotalActions: 0,
      lastScannedKey: '',
      lastScannedEntry: Object.assign({ position: '', code: '' }, cageStatus.newActionStateKeys()),
      scannedCellX: -1,
      scannedCellY: -1,
      scannedCageBoxCode: '',
      confirmLookup: null,
      confirmRows: [],
      showConfirmDialog: false,
      archiveTarget: null,
      showArchiveDialog: false,
      recordTarget: null,
      recordOpen: false,
      recordEvents: [],
      recordFieldCount: 0,
      editActionPopup: false,
      editActionCell: null,
      actionSubmitting: false,
      bookingEditingId: null,
      bookingEdit: { piName: '', aupId: '', rentNumber: 0, memo: '', registerNumber: '' },
      bookingEditAupOptions: [],
      bookingPickerOpen: false,
      bookingPickerTarget: '',
      bookingPickerKeyword: '',
      bookingPickerRows: [],
      editingCapacity: false,
      capacityDraft: '',
      divisionPicked: {},
      divisionPickedCount: 0,
      // 模式切换时收起详情弹窗（原先靠 loadShelfDetail 顺带做，现在不再重拉网格，这里显式清）
      selectedCell: null,
      showCellDetail: false
    }, function() {
      self.applyCacheToGrid();
      if (mode === 'allocate') self.loadAupList();
      else if (mode === 'booking') self.loadBookingAups();
      else if (mode === 'studentClaim') self.loadPoolCells();
      else if (mode === 'reserve') { self.loadAupList(); self.setData({ reserveKeyword: '', reserveResults: [], reserveGroups: [], reservePersonOpen: false }); }
      if (mode === 'confirm' && !self.data.isStaffView) self.loadMyClaimCageIds();
      else self.setData({ myClaimCageIds: {} });
      // 这里**不再**无条件调 loadShelfDetail 重拉笼架网格。
      // 网格数据（cage_cell_index + detail）与模式无关，各模式的额外数据已在上面分别加载；
      // 而 loadShelfDetail 开头的 setData({gridLoading:true}) 会让 wxml 里
      // wx:if="{{ !gridLoading && ... }}" 的整个网格节点被销毁重建 ——
      // 现象就是「每次切模式整页重新加载渲染一遍」，顺带把滚动位置也冲回顶部。
    });
  },

  /* ------------------------------------------------------------------ */
  /*  选中集（分配/认领/学生申请共用）                                     */
  /* ------------------------------------------------------------------ */

  onClearSelection: function() {
    this.setData({ selectedCells: {}, selectedCount: 0 }, this.applySelectionToGrid.bind(this));
  },

  /** 仅切换选中（不校验类型） */
  toggleCellInSelection: function(cell) {
    var key = cell.x + ':' + cell.y;
    var sel = this.data.selectedCells || {};
    var newSel = {};
    for (var k in sel) { if (Object.prototype.hasOwnProperty.call(sel, k)) newSel[k] = sel[k]; }
    if (newSel[key]) delete newSel[key];
    else newSel[key] = String(cell.id || cell.animalCageId || '');
    this.setData({ selectedCells: newSel, selectedCount: Object.keys(newSel).length }, this.applySelectionToGrid.bind(this));
  },

  /**
   * 分配模式选中：与 Web/H5 的 `allocSelectVerdict` 同一套规则。
   * 1 等待分配       → 可选，本批动作 = 分配（下发 AUP）
   * 2 已预约(空笼盒) → 可选，本批动作 = 取消分配（撤回 AUP，退回等待分配）
   * 3/4              → 不可选，须先归档腾空
   * 一批之内不允许混选两种动作，否则按钮语义不明。
   */
  toggleAllocateCell: function(cell) {
    var key = cell.x + ':' + cell.y;
    var sel = this.data.selectedCells || {};
    // 已选中的再点一次是取消勾选，不过闸门
    if (!sel[key]) {
      var v = allocVerdict(cageTypeOf(cell), this._busyReasonOf(cell));
      if (!v.ok) { wx.showToast({ title: v.reason, icon: 'none' }); return; }
      var batch = this.computeAllocBatchKind();
      if (batch && v.kind !== batch) { wx.showToast({ title: ALLOC_MIXED_KIND_HINT, icon: 'none' }); return; }
    }
    this.toggleCellInSelection(cell);
  },

  /** 本批已确定的分配动作类型（'allocate' / 'cancel'），空选返回 '' */
  computeAllocBatchKind: function() {
    var grid = this.data.grid || [];
    var sel = this.data.selectedCells || {};
    for (var i = 0; i < grid.length; i++) {
      if (!sel[grid[i].x + ':' + grid[i].y]) continue;
      var v = allocVerdict(cageTypeOf(grid[i]), this._busyReasonOf(grid[i]));
      if (v.ok) return v.kind;
    }
    return '';
  },

  /**
   * 预定模式（教职工）：与 H5 `handleReserveToggle`(MobileCageShelfTab.tsx:1870-1879) 同口径 ——
   * 只判 ct===2 与活跃认领，**不判中间态**（顺序也是先 ct 后 claimStatus，保证提示语一致）。
   */
  toggleReserveCell: function(cell) {
    if (cageTypeOf(cell) !== 2) { wx.showToast({ title: '只能选择「已预约空笼盒」状态的笼位', icon: 'none' }); return; }
    if (cell.claimStatus && hasActiveClaim(cell.claimStatus)) { wx.showToast({ title: '该笼位已有预定，不可重复选择', icon: 'none' }); return; }
    this.toggleCellInSelection(cell);
  },

  /**
   * 学生申请模式：后端下发的池是唯一依据，前端不重算。
   * 服务端 claim() 自己会做 reservationReason + 在审 + 课题组归属 + 划分拦截
   * （CageClaimService.claim:187 / assertClaimableByUser:254），前端再叠一层中间态只会挡住合法申请。
   */
  toggleStudentClaimCell: function(cell) {
    var cid = String(cell.id || cell.animalCageId || '');
    if (!this.data.poolByCageId[cid]) { wx.showToast({ title: '该笼位不在你的可申请范围内，无法申请。', icon: 'none' }); return; }
    this.toggleCellInSelection(cell);
  },

  /**
   * 划分模式（课题组管家）：不限笼位状态，但 type1（等待分配）除外 —— 未归属课题组，是底层约束。
   * 中间态不拦：服务端 /cage-division/save 是纯 delete+insert 零校验，
   * Web 的 eligible 也只有 cageTypeCode !== 1（AdminCageShelfPage.tsx:1033），
   * 划分后的后果由下游各自判（认领走 divisionService.isBlocked、状态标记走 busyReason）。
   */
  toggleDivisionCell: function(cell) {
    if (cageTypeOf(cell) === 1) { wx.showToast({ title: '待分配状态的笼位未归属课题组，不能划分', icon: 'none' }); return; }
    this.toggleCellInSelection(cell);
  },

  /** 把选中集投影到 grid 的 _selected 标记 */
  applySelectionToGrid: function() {
    var grid = this.data.grid || [];
    var sel = this.data.selectedCells || {};
    var patch = {};
    var list = [];
    for (var i = 0; i < grid.length; i++) {
      var ck = grid[i].x + ':' + grid[i].y;
      var on = !!sel[ck];
      patch['grid[' + i + ']._selected'] = on;
      if (!on) continue;
      var meta = [];
      if (grid[i]._cageTypeAbbr) meta.push(grid[i]._cageTypeAbbr);
      if (grid[i]._experimenterShort) meta.push(grid[i]._experimenterShort);
      else if (grid[i]._piShort) meta.push(grid[i]._piShort);
      list.push({
        key: ck,
        label: grid[i]._displayPosition || grid[i].position || ck,
        meta: meta.join(' · ')
      });
    }
    patch.stagedItems = list;
    // 分配模式操作条按批次类型二选一，需把结果落到 data 供 wxml 判断
    patch.allocBatchKind = this.computeAllocBatchKind();
    this.setData(patch);
  },

  /** 待选区里单独移除一项：状态模式撤单格缓存，选中类模式移出选中集 */
  onRemoveSelected: function(e) {
    var key = e.currentTarget.dataset.key;
    if (!key) return;
    if (this.data.pageMode === 'edit') { this.onRemoveCacheEntry(e); return; }
    var sel = this.data.selectedCells || {};
    if (!sel[key]) return;
    var newSel = {};
    for (var k in sel) {
      if (Object.prototype.hasOwnProperty.call(sel, k) && k !== key) newSel[k] = sel[k];
    }
    this.setData({ selectedCells: newSel, selectedCount: Object.keys(newSel).length }, this.applySelectionToGrid.bind(this));
  },

  /* ------------------------------------------------------------------ */
  /*  分配模式                                                            */
  /* ------------------------------------------------------------------ */

  loadAupList: function() {
    var self = this;
    springAuth.springRequest({ url: '/api/v1/cage-shelves/allocation/aups', method: 'GET', data: {} }).then(function(res) {
      var p = unwrap(res);
      var list = (p.ok && p.data) || [];
      var options = list.map(function(a) { return { text: a.registerNo + ' · ' + (a.projectGroupName || a.piName || ''), value: String(a.id) }; });
      self.setData({ aupList: list, aupOptions: options });
    }).catch(function() { /* AUP 字典加载失败，分配按钮无选项 */ });
  },

  onOpenAupDialog: function() {
    if (this.data.selectedCount === 0) { wx.showToast({ title: '请先选择笼位', icon: 'none' }); return; }
    this.setData({ showAupDialog: true });
  },

  onCloseAupDialog: function() {
    this.setData({ showAupDialog: false });
  },

  onAupSelect: function(e) {
    var value = e.currentTarget.dataset.value;
    if (value == null) return;
    this.setData({ selectedAupId: String(value) });
  },

  handleConfirmAssign: function() {
    var self = this;
    var sel = self.data.selectedCells || {};
    var cageIds = [];
    for (var k in sel) { if (Object.prototype.hasOwnProperty.call(sel, k) && sel[k]) cageIds.push(sel[k]); }
    if (!self.data.selectedAupId || cageIds.length === 0) { wx.showToast({ title: '请选择 AUP 与笼位', icon: 'none' }); return; }
    var meta = self.data.gridMeta || {};
    var aup = null;
    for (var i = 0; i < self.data.aupList.length; i++) { if (String(self.data.aupList[i].id) === String(self.data.selectedAupId)) { aup = self.data.aupList[i]; break; } }
    // 二次确认：批量写入前先核对笼位数与目标 AUP
    var aupLabel = (aup && aup.registerNo) || self.data.selectedAupId;
    if (aup && aup.piName) aupLabel += ' · ' + aup.piName;
    wx.showModal({
      title: '确认分配',
      content: '确定将 ' + cageIds.length + ' 个笼位分配给「' + aupLabel + '」？',
      success: function(res) {
        if (!res.confirm) return;
        self.setData({ allocSubmitting: true });
        springAuth.springRequest({
          url: '/api/v1/cage-shelves/allocation/assign',
          method: 'POST',
          data: { roomId: String(meta.roomId || ''), shelveId: String(meta.shelveId || ''), cageIds: cageIds, aupId: self.data.selectedAupId, registerNumber: aup ? aup.registerNo : '' }
        }).then(function(res2) {
          var p = unwrap(res2);
          if (!p.ok) { self.setData({ allocSubmitting: false }); wx.showToast({ title: p.message || '分配失败', icon: 'none' }); return; }
          self.setData({ allocSubmitting: false, selectedCells: {}, selectedCount: 0, selectedAupId: '', showAupDialog: false });
          wx.showToast({ title: '已分配 ' + cageIds.length + ' 个笼位', icon: 'success' });
          self.loadShelfDetail(self.data.selectedShelf ? self.data.selectedShelf.shelveId : '');
        }).catch(function(e) {
          self.setData({ allocSubmitting: false });
          wx.showToast({ title: (e && e.message) || '分配失败', icon: 'none' });
        });
      }
    });
  },

  handleCancelAssign: function() {
    var self = this;
    var sel = self.data.selectedCells || {};
    var cageIds = [];
    for (var k in sel) { if (Object.prototype.hasOwnProperty.call(sel, k) && sel[k]) cageIds.push(sel[k]); }
    if (cageIds.length === 0) return;
    var meta = self.data.gridMeta || {};
    // 二次确认：取消分配会清空笼位 AUP 并退回「等待分配」，不可一键撤销
    wx.showModal({
      title: '取消分配',
      content: '确定取消 ' + cageIds.length + ' 个笼位的分配？\n取消后笼位将清空 AUP，退回「等待分配」。',
      success: function(res) {
        if (!res.confirm) return;
        self.setData({ allocSubmitting: true });
        springAuth.springRequest({ url: '/api/v1/cage-shelves/allocation/cancel', method: 'POST', data: { cageIds: cageIds, roomId: String(meta.roomId || '') } }).then(function(res2) {
          var p = unwrap(res2);
          if (!p.ok) { self.setData({ allocSubmitting: false }); wx.showToast({ title: p.message || '取消分配失败', icon: 'none' }); return; }
          self.setData({ allocSubmitting: false, selectedCells: {}, selectedCount: 0 });
          wx.showToast({ title: '已取消 ' + cageIds.length + ' 个笼位分配', icon: 'success' });
          self.loadShelfDetail(self.data.selectedShelf ? self.data.selectedShelf.shelveId : '');
        }).catch(function(e) {
          self.setData({ allocSubmitting: false });
          wx.showToast({ title: (e && e.message) || '取消分配失败', icon: 'none' });
        });
      }
    });
  },

  /* ------------------------------------------------------------------ */
  /*  认领模式（教职工批量认领 + 人员检索）                                */
  /* ------------------------------------------------------------------ */

  /**
   * 打开选人弹窗，并自动预览「已选笼位所属 AUP 的课题组成员」。
   * 与 Web/H5 的 ReservePersonDialog 行为一致：不必先手输关键字，打开即有候选人。
   */
  openReservePerson: function() {
    if (this.data.selectedCount === 0) { wx.showToast({ title: '请先选择笼位', icon: 'none' }); return; }
    this.setData({ reservePersonOpen: true, reserveKeyword: '', reserveResults: [], reserveSearching: false });
    this.previewReserveCandidates();
  },

  /** 已选笼位的 aupNumber → 课题组名（去重）。依赖 aupList 字典。 */
  reserveGroupNames: function() {
    var byAup = {};
    var aups = this.data.aupList || [];
    for (var i = 0; i < aups.length; i++) {
      if (aups[i].registerNo && aups[i].projectGroupName) byAup[String(aups[i].registerNo)] = aups[i].projectGroupName;
    }
    var grid = this.data.grid || [];
    var sel = this.data.selectedCells || {};
    var seen = {}, names = [];
    for (var j = 0; j < grid.length; j++) {
      if (!sel[grid[j].x + ':' + grid[j].y]) continue;
      var no = grid[j].aupNumber || (grid[j].detail && grid[j].detail.aupNumber);
      var g = no ? byAup[String(no)] : '';
      if (g && !seen[g]) { seen[g] = 1; names.push(g); }
    }
    return names;
  },

  /** 按课题组批量拉成员作为默认候选；无课题组则留空等用户手搜。namesOverride 供代认领复用。 */
  previewReserveCandidates: function(namesOverride) {
    var self = this;
    var names = namesOverride || self.reserveGroupNames();
    self.setData({ reserveGroups: names });
    if (names.length === 0) return;
    self.setData({ reserveSearching: true });
    var tasks = names.map(function(g) {
      return springAuth.springRequest({ url: '/api/personnel', method: 'GET', data: { keyword: g, pageSize: 50 } })
        .then(function(res) {
          var p = unwrap(res);
          var list = (p.ok && p.data && p.data.list) || [];
          // 关键字检索是模糊匹配，需按课题组名精确过滤，避免混入他组人员
          return list.filter(function(x) { return x.projectGroupName === g; });
        })
        .catch(function() { return []; });
    });
    Promise.all(tasks).then(function(groups) {
      var all = [], seen = {};
      for (var i = 0; i < groups.length; i++) {
        for (var j = 0; j < groups[i].length; j++) {
          var person = groups[i][j];
          var accountId = person.staffId || person.aroUserId || '';
          if (!accountId || seen[accountId]) continue;
          seen[accountId] = 1;
          all.push({
            id: person.id,
            name: person.name || String(person.id),
            accountId: accountId,
            projectGroupName: person.projectGroupName || ''
          });
        }
      }
      self.setData({ reserveSearching: false, reserveResults: all });
    });
  },

  onCloseReservePerson: function() {
    this.setData({ reservePersonOpen: false, personPickerPurpose: '' });
  },

  onReserveKeywordInput: function(e) {
    this.setData({ reserveKeyword: e.detail.value || '' });
  },

  onReserveSearch: function() {
    var self = this;
    var kw = (self.data.reserveKeyword || '').trim();
    if (!kw) { wx.showToast({ title: '请输入姓名/工号', icon: 'none' }); return; }
    self.setData({ reserveSearching: true });
    springAuth.springRequest({ url: '/api/personnel', method: 'GET', data: { keyword: kw, pageSize: 10 } }).then(function(res) {
      var p = unwrap(res);
      var list = (p.ok && p.data && p.data.list) || [];
      var results = list.map(function(person) {
        return { id: person.id, name: person.name || String(person.id), accountId: person.staffId || person.aroUserId || '', projectGroupName: person.projectGroupName || '' };
      });
      self.setData({ reserveSearching: false, reserveResults: results });
      if (results.length === 0) wx.showToast({ title: '未找到人员', icon: 'none' });
    }).catch(function() {
      self.setData({ reserveSearching: false });
      wx.showToast({ title: '搜索失败', icon: 'none' });
    });
  },

  onReservePickPerson: function(e) {
    var purpose = this.data.personPickerPurpose;
    if (purpose === 'division') { this.toggleDivisionPerson(e); return; }
    var accountId = e.currentTarget.dataset.accountId;
    var name = e.currentTarget.dataset.name;
    if (!accountId) { wx.showToast({ title: '该人员无账号', icon: 'none' }); return; }
    this.setData({ reservePersonOpen: false, personPickerPurpose: '' });
    if (purpose === 'claimOnBehalf') {
      this.handleClaimOnBehalfConfirm({ name: name, accountId: accountId });
      return;
    }
    this.handleReserveConfirm({ name: name, accountId: accountId });
  },

  /* ── 划分模式（课题组管家）：选人弹窗内多选 → 全量覆盖这批笼位名单 ── */

  /** 打开选人弹窗，预览本人课题组成员（复用 /api/personnel 检索） */
  openDivisionPerson: function() {
    var self = this;
    if (self.data.selectedCount === 0) { wx.showToast({ title: '请先选择笼位', icon: 'none' }); return; }
    var names = self._myGroupName ? [self._myGroupName] : [];
    self.setData({
      personPickerPurpose: 'division',
      reservePersonOpen: true, reserveKeyword: '', reserveResults: [], reserveSearching: false,
      reserveGroups: names, divisionPicked: {}, divisionPickedCount: 0
    });
    self.previewReserveCandidates(names);
  },

  /** 弹窗内多选/取消选择成员（不关弹窗，累计后统一提交） */
  toggleDivisionPerson: function(e) {
    var accountId = e.currentTarget.dataset.accountId;
    var name = e.currentTarget.dataset.name;
    if (!accountId) { wx.showToast({ title: '该人员无账号', icon: 'none' }); return; }
    var picked = Object.assign({}, this.data.divisionPicked || {});
    if (picked[accountId]) delete picked[accountId];
    else picked[accountId] = { id: accountId, name: name || accountId };
    var count = 0;
    for (var k in picked) { if (picked[k]) count++; }
    this.setData({ divisionPicked: picked, divisionPickedCount: count });
  },

  /** 提交划分：所选成员全量覆盖所选笼位的名单 */
  handleDivisionSubmit: function() {
    var self = this;
    if (self.data.divisionSubmitting) return;
    var picked = self.data.divisionPicked || {};
    var assignees = [];
    for (var k in picked) { if (picked[k]) assignees.push({ id: picked[k].id, name: picked[k].name }); }
    if (assignees.length === 0) { wx.showToast({ title: '请先选择成员', icon: 'none' }); return; }
    var sel = self.data.selectedCells || {};
    var cageIds = [];
    for (var kk in sel) { if (Object.prototype.hasOwnProperty.call(sel, kk) && sel[kk]) cageIds.push(sel[kk]); }
    if (cageIds.length === 0) { wx.showToast({ title: '请先选择笼位', icon: 'none' }); return; }
    self.setData({ divisionSubmitting: true });
    springAuth.springRequest({
      url: '/api/cage-division/save',
      method: 'POST',
      data: { animalCageIds: cageIds, assignees: assignees, groupName: self._myGroupName || '' }
    }).then(function(res) {
      var p = unwrap(res);
      if (!p.ok) { self.setData({ divisionSubmitting: false }); wx.showToast({ title: p.message || '划分失败', icon: 'none' }); return; }
      self.setData({
        divisionSubmitting: false, reservePersonOpen: false, personPickerPurpose: '',
        divisionPicked: {}, divisionPickedCount: 0, selectedCells: {}, selectedCount: 0
      });
      wx.showToast({ title: '已划分 ' + cageIds.length + ' 个笼位', icon: 'success' });
      self.loadShelfDetail(self.data.selectedShelf ? self.data.selectedShelf.shelveId : '');
    }).catch(function(e) {
      self.setData({ divisionSubmitting: false });
      wx.showToast({ title: (e && e.message) || '划分失败', icon: 'none' });
    });
  },

  handleReserveConfirm: function(p) {
    var self = this;
    var sel = self.data.selectedCells || {};
    var cageIds = [];
    for (var k in sel) { if (Object.prototype.hasOwnProperty.call(sel, k) && sel[k]) cageIds.push(sel[k]); }
    if (cageIds.length === 0 || !p.accountId) return;
    self.setData({ reserveSubmitting: true });
    springAuth.springRequest({ url: '/api/admin/cage-claims/assign-batch', method: 'POST', data: { animalCageIds: cageIds, studentUserId: p.accountId } }).then(function(res) {
      var up = unwrap(res);
      if (!up.ok) { self.setData({ reserveSubmitting: false }); wx.showToast({ title: up.message || '预定失败', icon: 'none' }); return; }
      var results = up.data || [];
      var failed = 0;
      for (var i = 0; i < results.length; i++) { if (!results[i].ok) failed++; }
      self.setData({ reserveSubmitting: false, selectedCells: {}, selectedCount: 0 });
      if (failed > 0) wx.showToast({ title: '已预定 ' + (cageIds.length - failed) + ' 个，' + failed + ' 个失败', icon: 'none' });
      else wx.showToast({ title: '已预定 ' + cageIds.length + ' 个笼位给 ' + (p.name || ''), icon: 'success' });
      self.loadShelfDetail(self.data.selectedShelf ? self.data.selectedShelf.shelveId : '');
    }).catch(function(e) {
      self.setData({ reserveSubmitting: false });
      wx.showToast({ title: (e && e.message) || '预定失败', icon: 'none' });
    });
  },

  /* ------------------------------------------------------------------ */
  /*  归档模式                                                            */
  /* ------------------------------------------------------------------ */

  openArchiveDialog: function(cell) {
    if (cageTypeOf(cell) !== 3) { wx.showToast({ title: '该笼位当前无笼盒/未占用，无需归档', icon: 'none' }); return; }
    // 学生只能归档本人占用的笼位（mine 由后端判定并下发；教职工视角不下发该字段）
    if (!this.data.isStaffView && !cell.mine) { wx.showToast({ title: '只能归档本人使用中的笼位', icon: 'none' }); return; }
    var detail = cell.detail || {};
    this.setData({
      archiveTarget: {
        animalCageId: String(cell.id || cell.animalCageId || ''),
        positionLabel: cell._displayPosition || cell.position || '',
        occupantName: cell.occupantName || '',
        projectPiName: detail.projectPiName || cell.projectPiName || '',
        aupNumber: detail.aupNumber || cell.aupNumber || ''
      },
      showArchiveDialog: true
    });
  },

  /** 归档模式扫码：定位 → 开归档弹窗 */
  handleArchiveScan: function(code) {
    var self = this;
    assetApi.lookupCode(code).then(function(r) {
      if (r.type === 'NOT_FOUND') { wx.showToast({ title: '未识别笼位', icon: 'none' }); return; }
      if (r.type === 'ASSET') { wx.showToast({ title: '该编码为资产编号，非笼位', icon: 'none' }); return; }
      if (r.type === 'LEGACY_CAGE_BOX') { wx.showToast({ title: '旧盒码已废弃，请扫笼位码', icon: 'none' }); self._locateLookup(r); return; }
      self._locateLookup(r);
      if (r.claim) {
        var cc = r.cageCell || {};
        self.setData({
          archiveTarget: { animalCageId: String(cc.animalCageId || ''), positionLabel: cc.positionLabel || '', occupantName: r.claim.claimantName || '', projectPiName: r.claim.projectPiName || '', aupNumber: r.claim.aupNumber || '' },
          showArchiveDialog: true
        });
      } else {
        wx.showToast({ title: '该笼位无占用记录，无需归档', icon: 'none' });
      }
    }).catch(function(e) {
      wx.showToast({ title: (e && e.message) || '扫码查询失败', icon: 'none' });
    });
  },

  onCloseArchiveDialog: function() {
    this.setData({ showArchiveDialog: false, archiveTarget: null });
  },

  handleArchiveConfirm: function() {
    var self = this;
    var t = self.data.archiveTarget;
    if (!t || !t.animalCageId || self.data.archiveSubmitting) return;
    self.setData({ archiveSubmitting: true });
    // 学生走 /api/local/archive（后端按身份判「只能归档本人占用」），教职工走原来的管理端接口
    var archiveUrl = self.data.isStaffView
      ? '/api/admin/cage-info/occupancy/archive'
      : '/api/local/archive';
    springAuth.springRequest({ url: archiveUrl, method: 'POST', data: { animalCageId: t.animalCageId, reason: '' } }).then(function(res) {
      var p = unwrap(res);
      if (!p.ok) { self.setData({ archiveSubmitting: false }); wx.showToast({ title: p.message || '归档失败', icon: 'none' }); return; }
      self.setData({ archiveSubmitting: false, showArchiveDialog: false, archiveTarget: null });
      wx.showToast({ title: '已归档', icon: 'success' });
      self.loadShelfDetail(self.data.selectedShelf ? self.data.selectedShelf.shelveId : '');
    }).catch(function(e) {
      self.setData({ archiveSubmitting: false });
      wx.showToast({ title: (e && e.message) || '归档失败', icon: 'none' });
    });
  },

  /* ------------------------------------------------------------------ */
  /*  记录模式（笼位历史记录）                                            */
  /* ------------------------------------------------------------------ */

  openRecordDialog: function(cell) {
    var self = this;
    var cid = String(cell.id || cell.animalCageId || '');
    if (!cid) { wx.showToast({ title: '该笼位无 ID', icon: 'none' }); return; }
    self.setData({ recordTarget: { animalCageId: cid, positionLabel: cell._displayPosition || cell.position || '' }, recordOpen: true, recordLoading: true, recordEvents: [], recordLabel: '', recordFieldCount: 0 });
    springAuth.springRequest({ url: '/api/admin/cage-form/cage-history/' + cid, method: 'GET', data: {} }).then(function(res) {
      var p = unwrap(res);
      // 后端返回 { animalCageId, cageLabel, fieldLabels, current, hasStructural,
      //            events:[{changeType, kind, at, operator, changes:[{canonical,label,before,after}]}] }
      // 早先这里读的是 p.data.groups —— 那个字段不存在，于是永远落到空数组、显示「暂无历史记录」。
      var data = (p.ok && p.data) || {};
      var events = data.events || [];
      var fieldSet = {};
      events.forEach(function(ev) {
        var meta = KIND_META[ev.kind] || KIND_META.EDIT;
        ev._dot = meta.dot;
        ev._kindLabel = meta.label;
        ev._typeLabel = CHANGE_TYPE_LABEL[ev.changeType] || ev.changeType || '';
        // 前后同值的变更行是噪声（审计日志理论上不该有，但历史数据里出现过），过滤掉
        ev.changes = (ev.changes || []).filter(function(c) {
          if ((c.before || '') === (c.after || '')) return false;
          if (c.canonical) fieldSet[c.canonical] = true;
          return true;
        });
      });
      self.setData({
        recordLoading: false,
        recordEvents: events,
        recordLabel: data.cageLabel || '',
        recordFieldCount: Object.keys(fieldSet).length
      });
    }).catch(function(e) {
      self.setData({ recordLoading: false });
      wx.showToast({ title: (e && e.message) || '加载历史失败', icon: 'none' });
    });
  },

  onCloseRecordDialog: function() {
    this.setData({ recordOpen: false, recordTarget: null });
  },

  /** 折叠分区开关：分区体级 wx:if 切换，不触碰外层 .cs-body 滚动容器 */
  onToggleSection: function(e) {
    var key = e.currentTarget.dataset.key;
    if (!key) return;
    var next = Object.assign({}, this.data.openSections);
    next[key] = !next[key];
    this.setData({ openSections: next });
  },

  /* ------------------------------------------------------------------ */
  /*  扫码确认模式：点格子直接开核对弹窗（对齐 H5 handleConfirmCell）      */
  /* ------------------------------------------------------------------ */

  openConfirmDialogFromCell: function(cell) {
    var status = cell.claimStatus;
    if (!status) { wx.showToast({ title: '该笼位未分配', icon: 'none' }); return; }
    if (status === 'locked') {
      var cc = {
        animalCageId: String(cell.id || cell.animalCageId || ''),
        positionLabel: cell._displayPosition || cell.position || '',
        positionX: cell.x,
        positionY: cell.y,
        roomName: (this.data.gridMeta && this.data.gridMeta.roomName) || '',
        shelveId: String((this.data.gridMeta && this.data.gridMeta.shelveId) || '')
      };
      var claim = { id: Number(cell.activeClaimId), claimStatus: status, claimantName: cell.occupantName || '', projectPiName: cell.projectPiName || '', aupNumber: cell.aupNumber || '', projectName: cell.projectGroup || '', hasInfo: true };
      var rows = [];
      if (cc.positionLabel) rows.push({ label: '笼位', value: cc.positionLabel, em: false });
      if (cc.roomName) rows.push({ label: '房间', value: cc.roomName, em: false });
      if (claim.claimantName) rows.push({ label: '认领人', value: claim.claimantName, em: true });
      if (claim.projectPiName) rows.push({ label: '课题组 PI', value: claim.projectPiName, em: true });
      if (claim.aupNumber) rows.push({ label: 'AUP 编号', value: claim.aupNumber, em: false });
      if (claim.projectName) rows.push({ label: '项目', value: claim.projectName, em: false });
      rows.push({ label: '当前状态', value: '待确认', em: true });
      this.setData({ confirmLookup: { type: 'CAGE_CELL', cageCell: cc, claim: claim }, confirmRows: rows, showConfirmDialog: true });
      return;
    }
    if (status === 'confirmed') { wx.showToast({ title: '该笼位已到位', icon: 'success' }); return; }
    if (status === 'pending_approval') { wx.showToast({ title: '该笼位待审批', icon: 'none' }); return; }
    if (status === 'pending_release_approval') { wx.showToast({ title: '该笼位待释放审批', icon: 'none' }); return; }
    wx.showToast({ title: '该笼位状态：' + status, icon: 'none' });
  },

  /* ------------------------------------------------------------------ */
  /*  预约模式（房间概览 + 同步）                                         */
  /* ------------------------------------------------------------------ */

  loadBookingRooms: function() {
    var self = this;
    self.setData({ bookingLoading: true });
    return springAuth.springRequest({ url: '/api/v1/cage-shelves/booking/rooms', method: 'GET', data: { pageNum: 1, pageSize: 200 } }).then(function(res) {
      var p = unwrap(res);
      var list = [];
      if (p.ok && p.data && p.data.data && p.data.data.list) list = p.data.data.list;
      else if (p.ok && p.data && p.data.list) list = p.data.list;
      self.setData({ bookingLoading: false, bookingRooms: list });
      return list;
    }).catch(function() { self.setData({ bookingLoading: false, bookingRooms: [] }); return []; });
  },

  /** 当前房间概览（bookingRooms 里找 roomId 命中，否则用 gridMeta 兜底） */
  buildBookingRoom: function(room, meta) {
    var r = room || {};
    var total = Number(r.animalCageNumber) || 0;
    var booked = Number(r.rentAnimalCageNumber) || 0;
    var used = Number(r.usedAnimalCageNumber) || 0;
    return {
      name: r.name || (meta && meta.roomName) || '',
      description: r.description || '',
      animalCageNumber: total,
      rentAnimalCageNumber: booked,
      usedAnimalCageNumber: used,
      memo: r.memo || '',
      remaining: Math.max(0, total - booked),
      bookedPct: total > 0 ? Math.round((booked / total) * 100) : 0,
      usedPct: total > 0 ? Math.round((used / total) * 100) : 0
    };
  },

  loadBookingAupDict: function() {
    var self = this;
    return springAuth.springRequest({ url: '/api/v1/cage-shelves/booking/aups/dict', method: 'GET', data: {} }).then(function(res) {
      var p = unwrap(res);
      var list = (p.ok && p.data) || [];
      if (!Array.isArray(list)) list = [];
      var names = [], seen = {};
      for (var i = 0; i < list.length; i++) {
        var g = list[i].projectGroupName;
        if (g && !seen[g]) { seen[g] = 1; names.push(g); }
      }
      names.sort(function(a, b) { return a.localeCompare(b, 'zh'); });
      self.setData({ bookingAupOptions: list, bookingPiNames: names });
      return list;
    }).catch(function() { return []; });
  },

  filterBookingAupOptionsByPi: function(piName) {
    var dict = this.data.bookingAupOptions || [];
    var out = [];
    for (var i = 0; i < dict.length; i++) {
      if (dict[i].projectGroupName === piName) {
        out.push({ id: String(dict[i].id), registerNo: dict[i].registerNo || '' });
      }
    }
    return out;
  },

  /** 房间概览 + AUP 分配明细（按当前笼架所在房间 roomId） */
  loadBookingAups: function() {
    var self = this;
    var meta = self.data.gridMeta || {};
    var roomId = String(meta.roomId || '');
    if (!roomId) {
      self.setData({ bookingRoom: null, bookingAups: [], bookingAupLoading: false });
      return;
    }
    self.setData({ bookingAupLoading: true });
    self.loadBookingRooms().then(function(rooms) {
      var found = null;
      for (var i = 0; i < (rooms || []).length; i++) {
        if (String(rooms[i].roomId) === roomId) { found = rooms[i]; break; }
      }
      self.setData({ bookingRoom: self.buildBookingRoom(found, meta) });
      return springAuth.springRequest({ url: '/api/v1/cage-shelves/booking/rooms/' + roomId + '/aups', method: 'GET', data: {} });
    }).then(function(res) {
      var p = unwrap(res);
      var list = (p.ok && p.data && p.data.data) || (p.ok && p.data) || [];
      if (!Array.isArray(list)) list = [];
      self.setData({ bookingAups: list, bookingAupLoading: false });
    }).catch(function() {
      self.setData({ bookingAupLoading: false, bookingAups: [] });
    });

    if (!self.data.bookingAupOptions || self.data.bookingAupOptions.length === 0) {
      self.loadBookingAupDict();
    }
  },

  startBookingNew: function() {
    var self = this;
    self.setData({
      bookingEditingId: 'new',
      bookingEdit: { piName: '', aupId: '', rentNumber: 0, memo: '', registerNumber: '' },
      bookingEditAupOptions: []
    });
    if ((self.data.bookingAupOptions || []).length === 0) self.loadBookingAupDict();
  },

  startBookingEdit: function(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    var aups = self.data.bookingAups || [];
    var aup = null;
    for (var i = 0; i < aups.length; i++) {
      if (String(aups[i].id) === String(id)) { aup = aups[i]; break; }
    }
    if (!aup) return;
    if ((self.data.bookingAupOptions || []).length === 0) self.loadBookingAupDict();
    var piName = aup.piName || '';
    var options = self.filterBookingAupOptionsByPi(piName);
    self.setData({
      bookingEditingId: String(id),
      bookingEdit: { piName: piName, aupId: aup.aupId || '', rentNumber: Number(aup.rentNumber) || 0, memo: aup.memo || '', registerNumber: aup.registerNumber || '' },
      bookingEditAupOptions: options
    });
  },

  cancelBookingEdit: function() {
    this.setData({
      bookingEditingId: null,
      bookingEdit: { piName: '', aupId: '', rentNumber: 0, memo: '', registerNumber: '' },
      bookingEditAupOptions: []
    });
  },

  /**
   * 选择弹窗（课题组 / AUP 编号共用一张）：候选项本地过滤，不打接口。
   * 课题组走 AUP 字典里去重后的课题组名，AUP 编号走当前课题组过滤后的选项。
   */
  _bookingPickerSource: function(target) {
    var rows = [];
    if (target === 'aup') {
      var opts = this.data.bookingEditAupOptions || [];
      for (var i = 0; i < opts.length; i++) {
        rows.push({ key: String(opts[i].id), label: opts[i].registerNo || ('AUP ' + opts[i].id) });
      }
      return rows;
    }
    var names = this.data.bookingPiNames || [];
    for (var j = 0; j < names.length; j++) rows.push({ key: names[j], label: names[j] });
    return rows;
  },

  /** 重画弹窗列表：标题带全量个数，列表按关键字过滤 */
  _paintBookingPicker: function() {
    var target = this.data.bookingPickerTarget;
    var kw = String(this.data.bookingPickerKeyword || '').trim().toLowerCase();
    var all = this._bookingPickerSource(target);
    var rows = kw ? all.filter(function(r) { return r.label.toLowerCase().indexOf(kw) >= 0; }) : all;
    this.setData({
      bookingPickerRows: rows,
      bookingPickerTitle: (target === 'aup' ? '选择 AUP 编号 · 共 ' : '选择课题组 · 共 ') + all.length + ' 个',
    });
  },

  openBookingPicker: function(e) {
    var self = this;
    var target = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.target) || 'pi';
    if (target === 'aup' && !this.data.bookingEdit.piName) {
      wx.showToast({ title: '先选课题组', icon: 'none' });
      return;
    }
    var open = function() {
      self.setData({
        bookingPickerOpen: true,
        bookingPickerTarget: target,
        bookingPickerKeyword: '',
        bookingPickerPicked: target === 'aup'
          ? String(self.data.bookingEdit.aupId || '')
          : String(self.data.bookingEdit.piName || ''),
      });
      self._paintBookingPicker();
    };
    // 课题组字典还没取到时先补一次（进页面就点「新增分配」的路径）
    if (target === 'pi' && (this.data.bookingPiNames || []).length === 0) this.loadBookingAupDict().then(open);
    else open();
  },

  closeBookingPicker: function() {
    this.setData({ bookingPickerOpen: false, bookingPickerTarget: '', bookingPickerKeyword: '' });
  },

  onBookingPickerKeywordInput: function(e) {
    this.setData({ bookingPickerKeyword: e.detail.value || '' });
    this._paintBookingPicker();
  },

  clearBookingPickerKeyword: function() {
    this.setData({ bookingPickerKeyword: '' });
    this._paintBookingPicker();
  },

  onBookingPickerPick: function(e) {
    var key = e.currentTarget.dataset.key || '';
    var target = this.data.bookingPickerTarget;
    if (!target || !key) return;
    var close = { bookingPickerOpen: false, bookingPickerTarget: '', bookingPickerKeyword: '' };
    if (target === 'aup') {
      var opts = this.data.bookingEditAupOptions || [];
      var hit = null;
      for (var i = 0; i < opts.length; i++) {
        if (String(opts[i].id) === String(key)) { hit = opts[i]; break; }
      }
      this.setData(Object.assign({
        'bookingEdit.aupId': String(key),
        'bookingEdit.registerNumber': hit ? (hit.registerNo || '') : '',
      }, close));
      return;
    }
    // 换课题组：原来选的 AUP 作废，按新课题组重算候选
    this.setData(Object.assign({
      'bookingEdit.piName': key,
      'bookingEdit.aupId': '',
      'bookingEdit.registerNumber': '',
      bookingEditAupOptions: this.filterBookingAupOptionsByPi(key),
    }, close));
  },

  onBookingRentInput: function(e) {
    this.setData({ 'bookingEdit.rentNumber': Number(e.detail.value) || 0 });
  },

  onBookingMemoInput: function(e) {
    this.setData({ 'bookingEdit.memo': e.detail.value || '' });
  },

  saveBookingAup: function() {
    var self = this;
    var meta = self.data.gridMeta || {};
    var roomId = String(meta.roomId || '');
    var editingId = self.data.bookingEditingId;
    var edit = self.data.bookingEdit || {};
    if (!roomId) { wx.showToast({ title: '无法获取房间ID', icon: 'none' }); return; }
    if (editingId === 'new' && !edit.aupId) { wx.showToast({ title: '请选择 AUP', icon: 'none' }); return; }
    var body = { rentNumber: Number(edit.rentNumber) || 0, memo: edit.memo || '', registerNumber: edit.registerNumber || '' };
    if (editingId === 'new') body.aupId = edit.aupId;
    else { body.id = editingId; body.aupId = edit.aupId; }
    self.setData({ bookingSaving: true });
    springAuth.springRequest({ url: '/api/v1/cage-shelves/booking/rooms/' + roomId + '/aups', method: 'POST', data: body }).then(function(res) {
      var p = unwrap(res);
      if (!p.ok) { self.setData({ bookingSaving: false }); wx.showToast({ title: p.message || '保存失败', icon: 'none' }); return; }
      self.setData({ bookingSaving: false });
      wx.showToast({ title: editingId === 'new' ? '新增成功' : '保存成功', icon: 'success' });
      self.cancelBookingEdit();
      self.loadBookingAups();
    }).catch(function(e) {
      self.setData({ bookingSaving: false });
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
    });
  },

  deleteBookingAup: function(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '删除确认',
      content: '确定删除此分配记录？',
      success: function(res) {
        if (!res.confirm) return;
        springAuth.springRequest({ url: '/api/v1/cage-shelves/booking/aups/' + id + '/delete', method: 'POST', data: {} }).then(function(res2) {
          var p = unwrap(res2);
          if (!p.ok) { wx.showToast({ title: p.message || '删除失败', icon: 'none' }); return; }
          wx.showToast({ title: '已删除', icon: 'success' });
          self.loadBookingAups();
        }).catch(function() { wx.showToast({ title: '删除失败', icon: 'none' }); });
      }
    });
  },

  startCapacityEdit: function() {
    var room = this.data.bookingRoom || {};
    this.setData({ editingCapacity: true, capacityDraft: String(room.animalCageNumber || 0) });
  },

  cancelCapacityEdit: function() {
    this.setData({ editingCapacity: false, capacityDraft: '' });
  },

  onCapacityDraftInput: function(e) {
    this.setData({ capacityDraft: e.detail.value || '' });
  },

  saveCapacity: function() {
    var self = this;
    var meta = self.data.gridMeta || {};
    var roomId = String(meta.roomId || '');
    var cap = parseInt(self.data.capacityDraft) || 0;
    if (cap < 0) { wx.showToast({ title: '上限不能为负数', icon: 'none' }); return; }
    if (!roomId) { wx.showToast({ title: '无法获取房间ID', icon: 'none' }); return; }
    self.setData({ savingCapacity: true });
    springAuth.springRequest({ url: '/api/v1/cage-shelves/booking/rooms/' + roomId + '/capacity', method: 'POST', data: { capacity: cap } }).then(function(res) {
      var p = unwrap(res);
      if (!p.ok) { self.setData({ savingCapacity: false }); wx.showToast({ title: p.message || '保存失败', icon: 'none' }); return; }
      self.setData({ savingCapacity: false, editingCapacity: false });
      wx.showToast({ title: '房间上限已保存', icon: 'success' });
      self.loadBookingAups();
    }).catch(function(e) {
      self.setData({ savingCapacity: false });
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
    });
  },


  onCloseBooking: function() {
    this.switchMode('view');
  },

  /* ------------------------------------------------------------------ */
  /*  学生申请（认领）+ 我的申请                                          */
  /* ------------------------------------------------------------------ */

  loadPoolCells: function() {
    var self = this;
    var meta = self.data.gridMeta || {};
    var shelveId = String(meta.shelveId || (self.data.selectedShelf && self.data.selectedShelf.shelveId) || '');
    var sid = shelfIndexIdMap[shelveId];
    if (sid == null || sid === '') { self.setData({ poolByCageId: {} }); return; }
    springAuth.springRequest({ url: '/api/student/cage-claims/pool', method: 'GET', data: { shelfIndexId: sid } }).then(function(res) {
      var p = unwrap(res);
      var pool = (p.ok && p.data) || [];
      var map = {};
      for (var i = 0; i < pool.length; i++) { map[String(pool[i].animalCageId)] = true; }
      self.setData({ poolByCageId: map }, self.applyPoolToGrid.bind(self));
    }).catch(function() { self.setData({ poolByCageId: {} }); });
  },

  applyPoolToGrid: function() {
    var grid = this.data.grid || [];
    var map = this.data.poolByCageId || {};
    var patch = {};
    for (var i = 0; i < grid.length; i++) {
      var cid = String(grid[i].id || grid[i].animalCageId || '');
      patch['grid[' + i + ']._inPool'] = !!cid && !!map[cid];
    }
    this.setData(patch);
  },

  /** 学生确认模式：拉取本人待确认到位(locked)的笼位 id，供网格琥珀高亮（教职工不加载） */
  loadMyClaimCageIds: function() {
    var self = this;
    springAuth.springRequest({ url: '/api/student/cage-claims/my', method: 'GET', data: {} }).then(function(res) {
      if (self.data.pageMode !== 'confirm' || self.data.isStaffView) return;
      var p = unwrap(res);
      var list = (p.ok && p.data) || [];
      var map = {};
      for (var i = 0; i < list.length; i++) {
        if (list[i].claimStatus === 'locked') map[String(list[i].animalCageId)] = true;
      }
      self.setData({ myClaimCageIds: map }, self.applyMyClaimToGrid.bind(self));
    }).catch(function() {
      if (self.data.pageMode !== 'confirm') return;
      self.setData({ myClaimCageIds: {} }, self.applyMyClaimToGrid.bind(self));
    });
  },

  /** 把本人待确认集合投影到 grid 的 _myClaim 标记 */
  applyMyClaimToGrid: function() {
    var grid = this.data.grid || [];
    var map = this.data.myClaimCageIds || {};
    var patch = {};
    for (var i = 0; i < grid.length; i++) {
      var cid = String(grid[i].id || grid[i].animalCageId || '');
      patch['grid[' + i + ']._myClaim'] = !!cid && !!map[cid];
    }
    this.setData(patch);
  },

  /** 该笼位若有未决分笼/转移则返回其标记，否则 null（源与目标都在标记表内） */
  _pendingOpOf: function(cell) {
    if (!cell) return null;
    var cid = String(cell.id || cell.animalCageId || '');
    return (cid && (this.data.cageOpMarkers || {})[cid]) || null;
  },

  /**
   * 中间态拦截理由，空串 = 可操作。
   * cageOpMarkers 是**一个** map 装了两种语义的标记：待审分笼/转移(kind divide|transfer)
   * 与「已被订单预定」(kind reserve)。原先两处共用 PENDING_OP_REASON 一句话，
   * 于是被订单预定的笼位会被告知「有待审的分笼/转移请求」。
   */
  _busyReasonOf: function(cell) {
    var m = this._pendingOpOf(cell);
    if (!m) return '';
    return m.kind === 'reserve'
      ? ((m.label || '该笼位已被订单预定') + '，请等它结束')
      : PENDING_OP_REASON;
  },

  /** 拉待审分笼/转移 + 已被订单预定 两类标记，摊平成 animalCageId → 标记（同一请求源与目标同色） */
  loadCageOpMarkers: function() {
    var self = this;
    cageShelfApi.fetchCageOpMarkers().then(function(list) {
      var map = {};
      for (var i = 0; i < list.length; i++) {
        var r = list[i] || {};
        var isDivide = r.opType === 'divide';
        var m = {
          requestId: String(r.id || ''),
          kind: r.opType,
          color: pairColorAt(i),
          label: isDivide ? '分笼审核中' : '转移审核中',
          abbr: isDivide ? '分' : '移'
        };
        var pairs = r.pairs || [];
        var ids;
        if (pairs.length > 0) {
          ids = [];
          for (var pi = 0; pi < pairs.length; pi++) {
            ids.push((pairs[pi] && pairs[pi].source) || '');
            ids.push((pairs[pi] && pairs[pi].target) || '');
          }
        } else {
          ids = [String(r.sourceAnimalCageId || '')].concat(r.targetAnimalCageIds || []);
        }
        for (var j = 0; j < ids.length; j++) {
          var cid = String(ids[j] || '');
          if (cid) map[cid] = m;
        }
      }
      // 已被订单预定、还没落定的笼位：外观仍是空笼位，标出来免得别的模式误选。
      // 待审分笼/转移优先，同一格不覆盖（与 Web 端 mergeReservationMarks 同口径）。
      return cageShelfApi.fetchActiveCageReservations().then(function(rs) {
        for (var k = 0; k < rs.length; k++) {
          var res = rs[k] || {};
          var rid = String(res.animalCageId || '');
          if (!rid || map[rid]) continue;
          map[rid] = {
            requestId: String(res.reservationId || ''),
            kind: 'reserve',
            color: '#f59e0b',
            label: '已被' + (res.reserverName || '他人') + '预订',
            abbr: '订'
          };
        }
        return map;
      }).catch(function() { return map; });
    }).then(function(map) {
      self.setData({ cageOpMarkers: map }, self.applyCageOpMarkersToGrid.bind(self));
    }).catch(function() { /* 标记拉取失败不阻塞网格 */ });
  },

  /** 待审标记 → grid 的 _opMark（配色环 + 底部色条 + 正中图标） */
  applyCageOpMarkersToGrid: function() {
    var grid = this.data.grid || [];
    var map = this.data.cageOpMarkers || {};
    var patch = {};
    for (var i = 0; i < grid.length; i++) {
      var cid = String(grid[i].id || grid[i].animalCageId || '');
      patch['grid[' + i + ']._opMark'] = (cid && map[cid]) || null;
    }
    this.setData(patch);
  },

  handleStudentClaim: function() {
    var self = this;
    var sel = self.data.selectedCells || {};
    var ids = Object.keys(sel).map(function(k) { return sel[k]; }).filter(function(v) { return !!v; });
    if (ids.length === 0) { wx.showToast({ title: '请先选择笼位', icon: 'none' }); return; }
    var meta = self.data.gridMeta || {};
    var shelveId = String(meta.shelveId || (self.data.selectedShelf && self.data.selectedShelf.shelveId) || '');
    var sid = shelfIndexIdMap[shelveId];
    if (sid == null || sid === '') { wx.showToast({ title: '无法获取笼位ID', icon: 'none' }); return; }
    self.setData({ claimSubmitting: true });
    // 后端只有单笼位端点，逐个提交；此前只提交 sel[keys[0]]，其余被静默丢弃
    var okCount = 0;
    var failed = [];
    var needApproval = false;
    var step = function(i) {
      if (i >= ids.length) {
        self.setData({ claimSubmitting: false, selectedCells: {}, selectedCount: 0 }, self.applySelectionToGrid.bind(self));
        if (failed.length === 0) {
          wx.showToast({ title: needApproval ? '已提交申请，待审批' : '申请成功', icon: 'success' });
        } else if (okCount > 0) {
          wx.showToast({ title: '成功 ' + okCount + ' 个，失败 ' + failed.length + ' 个：' + failed[0], icon: 'none' });
        } else {
          wx.showToast({ title: failed[0] || '申请失败', icon: 'none' });
        }
        self.loadShelfDetail(self.data.selectedShelf ? self.data.selectedShelf.shelveId : '');
        return;
      }
      springAuth.springRequest({ url: '/api/student/cage-claims', method: 'POST', data: { animalCageId: ids[i], shelfIndexId: sid } })
        .then(function(res) {
          var p = unwrap(res);
          if (p.ok) {
            okCount++;
            if (p.data && p.data.needApproval) needApproval = true;
          } else {
            failed.push(p.message || '申请失败');
          }
          step(i + 1);
        })
        .catch(function(e) {
          failed.push((e && e.message) || '申请失败');
          step(i + 1);
        });
    };
    step(0);
  },

  /**
   * 「我的申请」：笼位认领 + 转移申请两段。
   *
   * <p>合并的理由是入口 —— 列表视图那边原来只有一个口子，分两个弹窗要点两次。
   * 两段的卡片各自复用现成模板（认领行内联、转移行走 transferAppCard），不另拼一套。
   */
  onOpenMyClaims: function() {
    var self = this;
    self.setData({ myClaimsOpen: true, myClaimsLoading: true, myClaims: [], myTransfersLoading: true, myTransfers: [] });
    springAuth.springRequest({ url: '/api/student/cage-claims/my', method: 'GET', data: {} }).then(function(res) {
      var p = unwrap(res);
      var list = (p.ok && p.data) || [];
      list.forEach(function(it) { it._statusLabel = claimStatusLabel(it.claimStatus); });
      self.setData({ myClaimsLoading: false, myClaims: list });
    }).catch(function() {
      self.setData({ myClaimsLoading: false });
      wx.showToast({ title: '加载申请列表失败', icon: 'none' });
    });
    // 转移段独立成败：它挂了不该把认领那段也拖成空列表
    fetchMyTransfers().then(function(list) {
      self.setData({ myTransfersLoading: false, myTransfers: list });
    }).catch(function() {
      self.setData({ myTransfersLoading: false });
    });
  },

  onCloseMyClaims: function() {
    this.setData({ myClaimsOpen: false });
  },

  /** 「我的转移单」列表：本人提交的转移请求（含已通过/已驳回，网格标记消失后仍可回看）。 */
  onOpenTransferForms: function() {
    var self = this;
    self.setData({ transferFormsOpen: true, transferFormsLoading: true, transferForms: [] });
    fetchMyTransfers().then(function(list) {
      self.setData({ transferFormsLoading: false, transferForms: list });
    }).catch(function(e) {
      self.setData({ transferFormsLoading: false });
      wx.showToast({ title: (e && e.message) || '加载转移单列表失败', icon: 'none' });
    });
  },

  onCloseTransferForms: function() {
    this.setData({ transferFormsOpen: false });
  },

  /** 「我的转移单」列表行点「查看转移单」 */
  onViewTransferFormFromList: function(e) {
    this._openTransferForm(e.currentTarget.dataset.id);
  },

  /** 取消申请：仅 claimStatus === 'pending_approval' 时由 wxml 显示入口 */
  onCancelClaim: function(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '取消申请',
      content: '确定取消该申请？',
      success: function(res) {
        if (!res.confirm) return;
        springAuth.springRequest({ url: '/api/student/cage-claims/' + id + '/cancel', method: 'POST', data: {} }).then(function(res2) {
          var p = unwrap(res2);
          if (!p.ok) { wx.showToast({ title: p.message || '取消失败', icon: 'none' }); return; }
          wx.showToast({ title: '已取消申请', icon: 'success' });
          self.onOpenMyClaims();
        }).catch(function() { wx.showToast({ title: '取消失败', icon: 'none' }); });
      }
    });
  },

  /** 我的申请列表里「确认到位」：种子 confirmLookup 后复用 handleConfirmArrival */
  onConfirmClaimFromList: function(e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    var self = this;
    this.setData({ confirmLookup: { claim: { id: Number(id) } } });
    this.handleConfirmArrival();
    // 确认后刷新列表（handleConfirmArrival 为 fire-and-forget，稍后重拉）
    setTimeout(function() { if (self.data.myClaimsOpen) self.onOpenMyClaims(); }, 800);
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
      gridLoading: false,
      gridError: '',
      selectedShelf: null,
      grid: [],
      gridMeta: null,
      scannedCellX: -1,
      scannedCellY: -1,
      scannedPosition: '',
      scannedCageBoxCode: '',
      scanCache: {},
      lastScannedKey: '',
      pageMode: 'view',
      modeColor: '',
      selectedCells: {},
      selectedCount: 0,
      archiveTarget: null,
      showArchiveDialog: false,
      recordTarget: null,
      recordOpen: false,
      recordEvents: [],
      recordFieldCount: 0,
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
      formGroups: [],
      formLoading: false,
      formError: '',
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

    // 分笼/转移选位模式：点击切换目标选中（优先于其它模式分派）
    if (self.data.opActive) { self.toggleOpTarget(cell); return; }

    // 依当前模式分派点击（选中/归档/记录/确认/申请 → 各自处理，其余落到详情）
    var mode = self.data.pageMode;
    if (mode === 'allocate') { self.toggleAllocateCell(cell); return; }
    if (mode === 'reserve') { self.toggleReserveCell(cell); return; }
    if (mode === 'archive') { self.openArchiveDialog(cell); return; }
    if (mode === 'record') { self.openRecordDialog(cell); return; }
    if (mode === 'confirm') { self.openConfirmDialogFromCell(cell); return; }
    if (mode === 'studentClaim') { self.toggleStudentClaimCell(cell); return; }
    if (mode === 'division') { self.toggleDivisionCell(cell); return; }

    // 编辑模式：弹出操作选择窗口而非详情
    if (mode === 'edit') {
      // 与 H5 `handleCellClick`(MobileCageShelfTab.tsx:1961-1966) 同口径：只有饲养中/异常笼位可标记。
      // 此前这里没有任何准入判定，无笼盒的格（ct1/2）也能打开弹窗并被授予状态。
      var markCt = cageTypeOf(cell);
      if (markCt !== 3 && markCt !== 4) { wx.showToast({ title: '该笼位不可标记状态', icon: 'none' }); return; }
      // 学生视角再叠一层归属：只能标本人使用中的笼位。mine 由后端 markMine 按
      // 「认领人是本人 或 表单实验员是本人」判定（双 id 已在服务端折叠），前端不自己比姓名。
      if (!self.data.isStaffView && !cell.mine) {
        wx.showToast({ title: '只能标记本人使用中的笼位', icon: 'none' });
        return;
      }
      var ck = cell.x + ':' + cell.y;
      var cacheEntry = (self.data.scanCache || {})[ck];
      // 优先从 scanCache 读取，否则空态（表单值到达后再用表单覆盖）
      var initAct = cacheEntry ? cacheEntry.initialActions : cageStatus.newActionState();
      var currAct = cacheEntry ? cacheEntry.currentActions : Object.assign({}, initAct);
      var animalCageId = cell.id || cell.animalCageId || '';
      // 特殊饲养明细：初值取缓存，没有就用空（表单值到达后覆盖）；强绑定判据看「需特殊饲养」这一位
      var initDet = cacheEntry && cacheEntry.initialDetails ? cacheEntry.initialDetails : {};
      var currDet = cacheEntry && cacheEntry.currentDetails ? cacheEntry.currentDetails : Object.assign({}, initDet);
      // 健康异常严重程度：初值同样取缓存，没有就用空（表单值到达后覆盖）
      var initSev = cacheEntry && cacheEntry.initialSeverity ? cacheEntry.initialSeverity : '';
      var currSev = cacheEntry && cacheEntry.currentSeverity ? cacheEntry.currentSeverity : initSev;
      // 瘙痒（布尔）：同样初值取缓存
      var initItch = cacheEntry && cacheEntry.initialItch ? !!cacheEntry.initialItch : false;
      var currItch = cacheEntry && cacheEntry.currentItch !== undefined ? !!cacheEntry.currentItch : initItch;
      self.setData({
        editActionCell: cell,
        editActionPopup: true,
        editActionPhotos: [],
        editActionNote: '',
        editHistory: [],
        editHistoryLoading: true,
        editFormValues: null,
        editActionInitial: Object.assign({}, initAct),
        editActionCurrent: Object.assign({}, currAct),
        editDetailInitial: Object.assign({}, initDet),
        editDetailCurrent: Object.assign({}, currDet),
        editActionSfOn: !!currAct.SPECIAL_BREEDING,
        editSeverityInitial: initSev,
        editSeverityCurrent: currSev,
        editItchInitial: initItch,
        editItchCurrent: currItch,
        editActionHaOn: !!currAct.HEALTH_CHECK
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
            var fDet = detailMapFromValues(up.data || []);
            var fSev = severityFromValues(up.data || []);
            var fItch = itchFromValues(up.data || []);
            self.setData({
              editActionInitial: Object.assign({}, fAct),
              editActionCurrent: Object.assign({}, fAct),
              editDetailInitial: Object.assign({}, fDet),
              editDetailCurrent: Object.assign({}, fDet),
              editActionSfOn: !!fAct.SPECIAL_BREEDING,
              editSeverityInitial: fSev,
              editSeverityCurrent: fSev,
              editItchInitial: fItch,
              editItchCurrent: fItch,
              editActionHaOn: !!fAct.HEALTH_CHECK
            });
          }
        });
      }
      // 加载历史记录
      if (animalCageId) {
        springAuth.springRequest({ url: '/api/local/history/' + animalCageId, method: 'GET', data: {} }).then(function(res) {
          var hp = unwrap(res);
          var list = (hp.ok ? hp.data : []) || [];
          self.setData({ editHistory: normalizeStatusHistory(list), editHistoryLoading: false });
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
    // 详情弹窗对外的唯一权限位。原先还有个 buildCellDetailMeta 挂了一堆「表外固定字段」，
    // wxml 只读 permitted，2026-09-17 清掉。
    var detailMeta = { permitted: cell.visible !== false };

    self.setData({
      selectedCell: cell,
      cellDetailMeta: detailMeta,
      cellDetail: cellDetail,
      showCellDetail: true,
      experimentDesc: (cell.detail && cell.detail.experimentDesc) || '',
      detailImages: cellDetail.images,
      // 换笼位必须清空上一只的标注照片：loadCellAnnotation 在「无标注」时提前 return，不会覆盖
      detailStatusPhotos: {},
      detailHasStatusBlock: false,
      detailAnnotationLoading: detailMeta.permitted,
      detailSaving: false,
      detailSaveMsg: '',
      detailSaveMsgType: '',
      detailOpMark: self._pendingOpOf(cell)   // 未决分笼/转移 → 详情一句话提示
    });

    // 分笼/转移/认领入口：后端按「认领记录 + 实验员字段 + 操作身份」给出三态
    var detailCageId = String(cell.id || cell.animalCageId || '');
    self.setData({
      detailOperable: false, detailOperableCode: '', detailOperableReason: '',
      detailCanClaimOnBehalf: false, detailGroupNames: []
    });
    if (detailCageId) {
      springAuth.springRequest({ url: '/api/cage-op/operable', method: 'GET', data: { animalCageId: detailCageId } }).then(function(res) {
        var p = unwrap(res);
        var d = (p.ok && p.data) || {};
        // 用 id 比对而非对象引用：setData 之后 data.selectedCell 未必是同一个对象
        var cur = self.data.selectedCell || {};
        var curId = String(cur.id || cur.animalCageId || '');
        if (curId !== detailCageId) return; // 弹窗已切换到别的笼位
        self.setData({
          detailOperable: !!d.operable,
          detailOperableCode: d.code || '',
          detailOperableReason: d.reason || '',
          detailCanClaimOnBehalf: !!d.canClaimOnBehalf,
          detailGroupNames: d.groupNames || []
        });
      }).catch(function() { /* 取不到就只显示详情 */ });
    }

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
      var entries = flattenTemplateFields(tpl);
      // 码表只拉模板里实际出现过的 dictKey；单个码表失败不拖垮整张表单
      var keys = [];
      entries.forEach(function(e) {
        var f = (e && e.field) || {};
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
        return { entries: entries, dict: buildCodelistDict(lists) };
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
      self.setData({ formRows: [], formGroups: [], formLoading: false, formError: '' });
      return;
    }
    self.setData({ formRows: [], formGroups: [], formEditable: false, formEditableReason: '', formLoading: true, formError: '', formEditing: false, formSaveMsg: '', formSaveMsgType: '' });
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
      }),
      // 编辑权限与 Web/H5 同源：后端按「认领记录 + 实验员字段 + 操作身份」判定。
      // 判定不通过时后端会给出 reason（如「该笼位由「林安顺」占用，无编辑权限」），
      // 必须带回来：光把按钮藏掉，用户只会觉得按钮"没了"，不知道为什么。
      springAuth.springRequest({
        url: '/api/cage-op/editable', method: 'GET', data: { animalCageId: animalCageId }
      }).then(function(res) {
        var up = unwrap(res);
        if (!up.ok || !up.data) return { editable: false, reason: '' };
        return { editable: !!up.data.editable, reason: up.data.reason || '' };
      }).catch(function() { return { editable: false, reason: '' }; }),
      // 身份标签（带缓存）。Web 端的编辑权是「客户端授权 ‖ 服务端按笼位判定」，
      // 小程序原先只有后一半，同一个账号就会出现 Web 能编、小程序不能。
      personIdentity.fetchMyIdentityCodes()
    ]).then(function(arr) {
      if (seq !== self._formReqSeq) return;
      var tpl = arr[0];
      // 状态标记以表单(cage_info_value)为真相源：据表单值推导标题栏 chips
      var activeActions = cageStatus.actionsFromFormValues(arr[1]);
      var statusChips = cageStatus.CAGE_STATUS_ACTIONS
        .filter(function(a) { return activeActions[a.action]; })
        .map(function(a) { return { code: a.statusField, label: a.label, abbr: a.abbr, color: a.color, bg: a.bg, statusField: a.statusField }; });
      // 按模板分区建树：弹窗按分区渲染；formRows 是扁平副本，扫码确认弹窗仍按平铺渲染
      var tree = buildFormTree(tpl.entries, arr[1], tpl.dict);
      refreshDirty(tree.groups);
      // 编辑权**只认服务端**（cageEditInfo，读矩阵能力 cage.edit.form）。
      // 原先客户端还有一道「角色≥ADMIN 或身份含饲养组长」并与服务端取或——那是旁路，
      // 会让被服务端拦住的账号在小程序里照样能编。2026-09-15 编辑权进矩阵后移除。
      var serverEditable = !!(arr[2] && arr[2].editable);
      var canEditForm = serverEditable;
      /* 详情弹窗按「不分类别」的平铺两列卡网格渲染（对齐 web），所以走扁平副本；
         但**编辑回写仍按分区树寻址**，这里给每行标上它在树里的 (g,s,r) 下标，行为不变。 */
      var flatRows = [];
      for (var fg = 0; fg < tree.groups.length; fg++) {
        var fgrp = tree.groups[fg];
        for (var fs = 0; fs < fgrp.subs.length; fs++) {
          var fsub = fgrp.subs[fs];
          for (var fr = 0; fr < fsub.rows.length; fr++) {
            var frow = fsub.rows[fr];
            frow._g = fg; frow._s = fs; frow._r = fr;
            flatRows.push(frow);
          }
        }
      }
      self.setData({
        formRows: flatRows,
        formGroups: tree.groups,
        formEditable: canEditForm,
        // 只在确实没有编辑权时展示服务端原因；被客户端授权放行时不该显示「无权限」
        formEditableReason: canEditForm ? '' : ((arr[2] && arr[2].reason) || ''),
        'cellDetail.statusChips': statusChips,
        formLoading: false,
        formError: ''
      });
      self._refreshSectionNos();
    }).catch(function(err) {
      if (seq !== self._formReqSeq) return;
      self.setData({
        formRows: [],
        formGroups: [],
        formEditable: false,
        formEditableReason: '',
        formLoading: false,
        formError: (err && err.message) || '表单加载失败'
      });
    });
  },

  /* ── 关键信息编辑态：行按 g/s/r 寻址 formGroups[g].subs[s].rows[r] ── */

  onFormEditStart: function() { this.setData({ formEditing: true, formSaveMsg: '', formSaveMsgType: '' }); },

  /** 取消编辑：raw 还原到 initRaw，清掉脏值与行级错误 */
  onFormEditCancel: function() {
    var groups = this.data.formGroups || [];
    revertGroups(groups);
    this.setData({ formGroups: groups, formEditing: false, formSaveMsg: '', formSaveMsgType: '' });
  },

  onFormSaveMsgClear: function() { this.setData({ formSaveMsg: '', formSaveMsgType: '' }); },

  /** 改一行的统一入口：写 raw → 重算脏值 → 清该行错误 */
  _patchFormRow: function(e, nextRaw, nextValue) {
    var ds = e.currentTarget.dataset;
    var gi = Number(ds.g), si = Number(ds.s), ri = Number(ds.r);
    var groups = this.data.formGroups || [];
    var g = groups[gi];
    var row = g && g.subs[si] && g.subs[si].rows[ri];
    if (!row) return;

    row.raw = nextRaw;
    row._error = '';
    refreshDirty(groups);

    var base = 'formGroups[' + gi + '].subs[' + si + '].rows[' + ri + ']';
    var patch = {};
    patch[base + '.raw'] = nextRaw;
    if (nextValue !== undefined) patch[base + '.value'] = nextValue;
    patch[base + '._error'] = '';
    patch[base + '._dirty'] = !!row._dirty;
    patch['formGroups[' + gi + '].dirtyCount'] = g.dirtyCount;
    this.setData(patch);
  },

  onFormInput: function(e) { this._patchFormRow(e, e.detail.value); },

  /** 布尔：自绘开关（原生 switch 只有 color 一个可调项，撑不起设计稿）。取反当前 raw。 */
  onFormToggleBool: function(e) {
    var ds = e.currentTarget.dataset;
    var groups = this.data.formGroups || [];
    var g = groups[Number(ds.g)];
    var row = g && g.subs[Number(ds.s)] && g.subs[Number(ds.s)].rows[Number(ds.r)];
    if (!row) return;
    var next = !(row.raw === true || row.raw === 1 || row.raw === '1');
    this._patchFormRow(e, next);
  },

  /**
   * 给模板分区编号（状态与照片、实验记录两节不编号，排在分区之后）。
   * 表单与标注是两条异步加载路径，任一条落地后都要重算，否则编号会错位。
   */
  _refreshSectionNos: function() {
    var groups = this.data.formGroups || [];
    var patch = {};
    for (var i = 0; i < groups.length; i++) {
      patch['formGroups[' + i + ']._no'] = pad2(i + 1);
    }
    this.setData(patch);
  },

  onFormSwitch: function(e) { this._patchFormRow(e, !!e.detail.value); },

  /** 码表/日期 picker：raw 存码值（提交用），value 存展示值 */
  onFormPicker: function(e) {
    var ds = e.currentTarget.dataset;
    var groups = this.data.formGroups || [];
    var g = groups[Number(ds.g)];
    var si = Number(ds.s);
    var row = g && g.subs[si] && g.subs[si].rows[Number(ds.r)];
    if (!row) return;
    if (row.fieldType === 'select' || row.fieldType === 'choice') {
      var opt = row.options[Number(e.detail.value)] || {};
      this._patchFormRow(e, opt.value === undefined ? '' : opt.value, opt.label === undefined ? '' : opt.label);
    } else {
      this._patchFormRow(e, e.detail.value, e.detail.value);
    }
  },

  /** 保存关键信息：先校验必填，再只提交有改动的字段 */
  onFormSave: function() {
    var self = this;
    var cell = self.data.selectedCell;
    var animalCageId = cell ? String(cell.id || cell.animalCageId || '') : '';
    if (!animalCageId) return;

    var groups = self.data.formGroups || [];
    var errors = validateGroups(groups);
    if (errors.length) {
      // 不弹 toast——错误已经挂在行上了
      self.setData({
        formGroups: groups,
        formSaveMsg: errors.length + ' 处待修正',
        formSaveMsgType: 'err'
      });
      return;
    }

    var changed = changedValues(groups);
    if (changed.length === 0) {
      wx.showToast({ title: '没有改动', icon: 'none' });
      self.setData({ formEditing: false, formSaveMsg: '', formSaveMsgType: '' });
      return;
    }
    var values = changed.map(function(r) {
      return { fieldId: r.fieldId, value: toApiValue(r.dataType, r.raw) };
    });

    self.setData({ formGroups: groups, formSaving: true, formSaveMsg: '', formSaveMsgType: '' });
    springAuth.springRequest({
      url: '/api/admin/cage-info/values/' + animalCageId, method: 'PUT', data: { values: values }
    }).then(function(res) {
      var up = unwrap(res);
      self.setData({ formSaving: false });
      if (!up.ok) {
        self.setData({ formSaveMsg: up.message || '保存失败', formSaveMsgType: 'err' });
        return;
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      self.setData({ formEditing: false });
      // 重新拉一次：initRaw 要跟着新值走，否则保存完那些行仍显示「已改动」
      self.loadCellFormValues(cell);
    }).catch(function(err) {
      self.setData({ formSaving: false, formSaveMsg: (err && err.message) || '保存失败', formSaveMsgType: 'err' });
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
      // 有 key 不等于有内容：状态标了但没传图时 statusPhotos 是空数组，整节渲染出来就是一个空盒子
      var hasStatusContent = !!statusPhotos._note || Object.keys(statusPhotos).some(function (k) {
        return k !== '_note' && Array.isArray(statusPhotos[k]) && statusPhotos[k].length > 0;
      });
      self.setData({
        experimentDesc: a.experimentDesc || '',
        detailImages: images,
        detailStatusPhotos: statusPhotos,
        detailHasStatusBlock: hasStatusContent,
        detailAnnotationLoading: false
      });
      self._refreshSectionNos();
    }).catch(function() {
      self.setData({ detailAnnotationLoading: false });
    });
  },

  onDetailExperimentDescInput: function(e) {
    this.setData({ experimentDesc: e.detail.value || '' });
  },

  /**
   * 照片预览：把当前弹窗里所有可见图片汇成一个可左右滑动的大图列表。
   * 原先只取 detailImages，导致点状态专属照片或状态弹窗里的照片时列表为空/串到别的笼位。
   */
  onDetailPreviewImage: function(e) {
    var url = e.currentTarget.dataset.url;
    if (!url) return;
    var urls = [];
    var push = function(u) { if (u && urls.indexOf(u) < 0) urls.push(u); };

    (this.data.detailImages || []).forEach(push);
    var sp = this.data.detailStatusPhotos || {};
    Object.keys(sp).forEach(function(k) {
      if (Array.isArray(sp[k])) sp[k].forEach(push);
    });
    (this.data.editActionPhotos || []).forEach(push);
    (this.data.editHistory || []).forEach(function(h) {
      (h._imgs || []).forEach(push);
    });
    push(url); // 兜底：无论图片来自哪个字段，被点的那张一定在列表里
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
    // 只发这条通道真正会改的两个字段。statusPhotos 归「状态模式」管，本弹窗里是只读的，
    // 回传它等于向服务端声明「我要写状态照片」——那道闸只开给饲养员/饲养组长，
    // 会把「实验员本人存实验记录」一并拦死。
    var payload = {
      animalCageId: animalCageId,
      experimentDesc: self.data.experimentDesc || '',
      imagesJson: JSON.stringify(self.data.detailImages || [])
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
    // 注意：这里**不能**清 formRows / formGroups。
    // van-popup 的离场动画有 ~300ms，而 setData 是和「隐藏」在同一次里生效的 ——
    // 清掉之后那 300ms 里弹窗还挂在屏幕上，表单区会渲染成「表单无字段」闪一下
    //（用户 2026-09-22 报的就是这个）。打开路径（onCellTap → :3283）本来就会重置这两个字段，
    // 所以关着的时候留着旧值不会串到下一个人。
    this.setData({
      showCellDetail: false,
      selectedCell: null,
      cellDetailMeta: null,
      cellDetail: null,
      experimentDesc: '',
      detailImages: [],
      detailStatusPhotos: {},
      detailHasStatusBlock: false,
      detailAnnotationLoading: false,
      formLoading: false,
      formError: '',
      detailSaving: false,
      detailSaveMsg: '',
      detailSaveMsgType: '',
      detailOpMark: null,
      detailImageUploading: false,
      formEditable: false, formEditableReason: '', formEditing: false, formSaving: false, formSaveMsg: '', formSaveMsgType: '',
      detailOperable: false, detailOperableCode: '', detailOperableReason: '',
      detailCanClaimOnBehalf: false, detailGroupNames: [], detailClaiming: false,
      detailClearingDivision: false
    });
  },

  /* ------------------------------------------------------------------ */
  /*  分笼 / 转移（选位模式） + 认领                                        */
  /* ------------------------------------------------------------------ */

  /** 详情弹窗点「分笼」/「转移笼位」：拉目标池 → 关详情 → 进入选位模式 */
  onStartOp: function(e) {
    var self = this;
    var kind = e.currentTarget.dataset.kind;
    var cell = self.data.selectedCell;
    var cageId = cell ? String(cell.id || cell.animalCageId || '') : '';
    if (!kind || !cageId) return;
    if (self._pendingOpOf(cell)) { wx.showToast({ title: self._busyReasonOf(cell), icon: 'none' }); return; }
    var label = (cell && (cell._displayPosition || cell.position)) || '';
    self._closeDetail();
    self.setData({
      opActive: true, opKind: kind, opSourceCageId: cageId, opSourceLabel: label,
      opTargetMap: {}, opSelectedCageIds: {}, opSelectedCount: 0,
      opLoading: true, opError: '', opConfirmOpen: false, opKeepSource: true, opReason: ''
    });
    springAuth.springRequest({ url: '/api/cage-op/targets', method: 'GET', data: { sourceAnimalCageId: cageId } }).then(function(res) {
      var p = unwrap(res);
      if (!p.ok) { self.setData({ opLoading: false, opError: p.message || '加载可选笼位失败' }); return; }
      var map = {};
      var list = p.data || [];
      for (var i = 0; i < list.length; i++) map[String(list[i].animalCageId)] = list[i];
      self.setData({ opLoading: false, opTargetMap: map }, self.applyOpToGrid.bind(self));
    }).catch(function() {
      self.setData({ opLoading: false, opError: '加载可选笼位失败' });
    });
  },

  /** 选位模式：点击格子切换目标（分笼多选、转移单选） */
  toggleOpTarget: function(cell) {
    var cid = String(cell.id || cell.animalCageId || '');
    // 与 H5 `opSel.toggle`(useCageOpSelect.ts:271-276) 同口径：只认后端下发的 selectable，
    // 前端不再叠一层中间态判定——那会把后端已经判为可选的目标挡掉，还会盖掉后端给的具体 reason。
    var t = (this.data.opTargetMap || {})[cid];
    if (!t || !t.selectable) { wx.showToast({ title: '该笼位不在可选范围内', icon: 'none' }); return; }
    var sel = Object.assign({}, this.data.opSelectedCageIds || {});
    if (this.data.opKind === 'divide') {
      if (sel[cid]) delete sel[cid]; else sel[cid] = true;
    } else {
      var next = {};
      if (!sel[cid]) next[cid] = true;
      sel = next;
    }
    var count = 0;
    for (var k in sel) { if (sel[k]) count++; }
    this.setData({ opSelectedCageIds: sel, opSelectedCount: count }, this.applyOpToGrid.bind(this));
  },

  /** 可选池 → _inPool（绿环），已选 → _selected */
  applyOpToGrid: function() {
    var grid = this.data.grid || [];
    var tmap = this.data.opTargetMap || {};
    var sel = this.data.opSelectedCageIds || {};
    var patch = {};
    for (var i = 0; i < grid.length; i++) {
      var cid = String(grid[i].id || grid[i].animalCageId || '');
      patch['grid[' + i + ']._inPool'] = !!cid && !!(tmap[cid] && tmap[cid].selectable);
      patch['grid[' + i + ']._selected'] = !!cid && !!sel[cid];
    }
    this.setData(patch);
  },

  onOpCancel: function() {
    this.setData({
      opActive: false, opKind: '', opSourceCageId: '', opSourceLabel: '',
      opTargetMap: {}, opSelectedCageIds: {}, opSelectedCount: 0,
      opLoading: false, opError: '', opConfirmOpen: false, opPicked: [],
      opKeepSource: true, opReason: ''
    }, this.applyOpToGrid.bind(this));
  },

  /**
   * 打开确认弹窗。转移要顺带拉一次转移单预填（自动值只在弹窗里展示，落库只落学生动过的值），
   * 分笼没有转移单，不拉。取不到不拦提交 —— 学生手填，后端本来就有「缺则用笼位值」的兜底。
   */
  onOpOpenConfirm: function() {
    var self = this;
    if (this.data.opSelectedCount === 0) { wx.showToast({ title: '请先选择目标笼位', icon: 'none' }); return; }
    var picked = [];
    var sel = this.data.opSelectedCageIds || {};
    var tmap = this.data.opTargetMap || {};
    for (var k in sel) { if (sel[k] && tmap[k]) picked.push(tmap[k]); }
    picked = picked.map(function(t) {
      return Object.assign({}, t, { _posLabel: cagePosition.cagePositionLabel(t) || '—' });
    });
    var ids = picked.map(function(t) { return String(t.animalCageId); });
    var isTransfer = this.data.opKind === 'transfer';
    this.setData({
      opConfirmOpen: true, opPicked: picked,
      opFormLoading: isTransfer, opFormReady: false, opFormAuto: {},
      opFormDate: '', opFormUnit: '', opFormPhone: '',
      opFormRows: picked.map(function() { return { strain: '', female: '', male: '' }; }),
      opFormEdits: {}
    });
    if (!isTransfer) return;
    // 数组参数按本仓库惯例拼逗号：`key[]=` 后端 List 收不到（同 Web 端 fetchTransferFormPrefill）
    springAuth.springRequest({
      url: '/api/cage-op/transfer-form/prefill', method: 'GET',
      data: { sourceAnimalCageId: self.data.opSourceCageId, targetAnimalCageIds: ids.join(',') }
    }).then(function(res) {
      var p = unwrap(res);
      if (!p.ok) { self.setData({ opFormLoading: false, opFormReady: false }); return; }
      self._applyOpFormPrefill(p.data || {});
    }).catch(function() {
      self.setData({ opFormLoading: false, opFormReady: false });
    });
  },

  /** prefill → 自动值 + 显示初值（显示值 = 未改动时用自动值，与 Web 的 showTop/showRow 同口径） */
  _applyOpFormPrefill: function(pf) {
    var rows = (pf.rows || []);
    var display = [];
    for (var i = 0; i < this.data.opPicked.length; i++) {
      var r = rows[i] || {};
      display.push({
        strain: r.strain == null ? '' : String(r.strain),
        female: r.female == null ? '' : String(r.female),
        male: r.male == null ? '' : String(r.male)
      });
    }
    this.setData({
      opFormLoading: false, opFormReady: true, opFormAuto: pf,
      opFormDate: pf.transferDate == null ? '' : String(pf.transferDate),
      opFormUnit: pf.unitName == null ? '' : String(pf.unitName),
      opFormPhone: pf.phone == null ? '' : String(pf.phone),
      opFormRows: display, opFormEdits: {}
    });
  },

  _opFormAutoTop: function(field) {
    var v = (this.data.opFormAuto || {})[field];
    return v == null ? '' : String(v);
  },

  _opFormAutoRow: function(idx, field) {
    var rows = (this.data.opFormAuto || {}).rows || [];
    var v = (rows[idx] || {})[field];
    return v == null ? '' : String(v);
  },

  /** 顶层三项：显示值与「学生动过的值」同时更新；改回自动值 = 没动过（不会把自动值冻进单子） */
  _setOpFormTop: function(field, dataKey, value) {
    var edits = Object.assign({}, this.data.opFormEdits || {});
    if (value === this._opFormAutoTop(field)) delete edits[field]; else edits[field] = value;
    var patch = { opFormEdits: edits };
    patch[dataKey] = value;
    this.setData(patch);
  },

  /** 日期选择器：e.detail.value 就是 yyyy-MM-dd，与手填同一个出口 */
  onOpFormDateChange: function(e) { this._setOpFormTop('transferDate', 'opFormDate', (e.detail && e.detail.value) || ''); },
  onOpFormUnitInput: function(e) { this._setOpFormTop('unitName', 'opFormUnit', e.detail.value || ''); },
  onOpFormPhoneInput: function(e) { this._setOpFormTop('phone', 'opFormPhone', e.detail.value || ''); },

  /** 目标行（下标与 opPicked 对齐，不拿雪花 id 当 setData 路径的键） */
  onOpFormRowInput: function(e) {
    var idx = parseInt(e.currentTarget.dataset.index, 10);
    var field = e.currentTarget.dataset.field;
    if (!(idx >= 0) || ['strain', 'female', 'male'].indexOf(field) < 0) return;
    var value = e.detail.value || '';
    var edits = Object.assign({}, this.data.opFormEdits || {});
    var rows = Object.assign({}, edits.rows || {});
    var row = Object.assign({}, rows[idx] || {});
    if (value === this._opFormAutoRow(idx, field)) delete row[field]; else row[field] = value;
    if (Object.keys(row).length === 0) delete rows[idx]; else rows[idx] = row;
    edits.rows = rows;
    var patch = { opFormEdits: edits };
    patch['opFormRows[' + idx + '].' + field] = value;
    this.setData(patch);
  },

  onOpCloseConfirm: function() { this.setData({ opConfirmOpen: false, opBatch: false }); },
  onOpKeepSourceChange: function(e) { this.setData({ opKeepSource: !!e.detail.value }); },
  onOpReasonInput: function(e) { this.setData({ opReason: e.detail.value || '' }); },

  onOpSubmit: function() {
    var self = this;
    // 重入闸：确认弹窗那个「提交」按钮没有 pointer-events 拦截，只把文案换成「提交中…」。
    // 快速连点会发两次请求 —— 转移那条是**两张转移单**（各自一次三签），代价很大。
    if (self.data.opSubmitting) return;
    // 批量转移：一次请求多组源→目标 = 一张单、一次三签（放在下面那个空目标检查之前，
    // 批量流程的 opSelectedCageIds 本来就是空的）
    if (self.data.opBatch) {
      var pairTargets = self.data.btPairTargetIds || [];
      var picked = self.data.opPicked || [];
      if (picked.length !== pairTargets.length) { wx.showToast({ title: '配对数据不一致，请重开抽屉', icon: 'none' }); return; }
      var pairs = picked.map(function (row, i) { return { source: row.animalCageId, target: String(pairTargets[i]) }; });
      var body = { pairs: pairs, reason: self.data.opReason || '' };
      var form = cageTransferForm.buildTransferForm(self.data.opFormEdits, pairTargets);
      if (form) body.transferForm = form;
      self.setData({ opSubmitting: true, btSubmitting: true });
      springAuth.springRequest({ url: '/api/cage-op/transfer', method: 'POST', data: body }).then(function (res) {
        var p = unwrap(res);
        self.setData({ opSubmitting: false, btSubmitting: false });
        if (!p.ok) { wx.showToast({ title: p.message || '操作失败', icon: 'none' }); return; }
        var r = p.data || {};
        wx.showToast({ title: r.needApproval ? '已提交，等待审核' : '操作已完成', icon: 'success' });
        self.setData({ opBatch: false, opConfirmOpen: false });
        self.onOpCancel();
        self.onBtClose();     // 抽屉还在确认弹窗后面开着，必须一起关（它没锁任何服务端占用，只清本地状态）
        self.onRetry();
      }).catch(function () {
        self.setData({ opSubmitting: false, btSubmitting: false });
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
      return;
    }
    var sel = self.data.opSelectedCageIds || {};
    var ids = [];
    for (var k in sel) { if (sel[k]) ids.push(k); }
    if (ids.length === 0) { wx.showToast({ title: '请先选择目标笼位', icon: 'none' }); return; }
    self.setData({ opSubmitting: true });
    var isDivide = self.data.opKind === 'divide';
    var url = isDivide ? '/api/cage-op/divide' : '/api/cage-op/transfer';
    var data;
    if (isDivide) {
      data = { sourceAnimalCageId: self.data.opSourceCageId, targetAnimalCageIds: ids, keepSource: !!self.data.opKeepSource, reason: self.data.opReason };
    } else {
      // 转移：全部目标都发（旧代码只取 ids[0]，多目标被丢掉）；转移单只发学生动过的值，没动过整份不发
      data = { fromAnimalCageId: self.data.opSourceCageId, targetAnimalCageIds: ids, reason: self.data.opReason };
      var form = cageTransferForm.buildTransferForm(self.data.opFormEdits, ids);
      if (form) data.transferForm = form;
    }
    springAuth.springRequest({ url: url, method: 'POST', data: data }).then(function(res) {
      var p = unwrap(res);
      self.setData({ opSubmitting: false });
      if (!p.ok) { wx.showToast({ title: p.message || '操作失败', icon: 'none' }); return; }
      var r = p.data || {};
      wx.showToast({ title: r.needApproval ? '已提交，等待审核' : '操作已完成', icon: 'success' });
      self.onOpCancel();
      self.onRetry();
    }).catch(function() {
      self.setData({ opSubmitting: false });
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  /* ------------------------------------------------------------------ */
  /*  批量转移（跨房间缓冲抽屉）                                           */
  /* ------------------------------------------------------------------ */

  /** 目标阶段当前光标所指的源（btCursor 越界时兜 null，调用方自行判空） */
  _btCurSource: function () {
    var sources = this.data.btSources || [];
    return sources[this.data.btCursor] || null;
  },

  /**
   * 批量转移的源侧房间列表：直接把页面已有的 shelfGroups（校/父房间/真实房间/架）
   * 拍平成「真实房号 → 架」，不新增接口。
   * key 用 campus/真实房号，与 H5 groupPoolByRoom 的 roomKey 同构。
   */
  _btBuildRooms: function () {
    var out = [];
    var idx = {};
    var groups = this.data.shelfGroups || [];
    for (var c = 0; c < groups.length; c++) {
      var campus = groups[c] || {};
      var rooms = campus.rooms || [];
      for (var r = 0; r < rooms.length; r++) {
        var sgs = (rooms[r] || {}).shelfGroups || [];
        for (var g = 0; g < sgs.length; g++) {
          var sg = sgs[g] || {};
          var roomName = sg.name || '其他';
          var key = (campus.campusName || '') + '/' + roomName;
          if (!idx[key]) {
            idx[key] = { key: key, roomName: roomName, campusName: campus.campusName || '', shelves: [] };
            out.push(idx[key]);
          }
          (sg.shelves || []).forEach(function (sh) {
            if (sh && sh.shelveId != null) {
              idx[key].shelves.push({ shelveId: String(sh.shelveId), shelveName: sh.shelveName || String(sh.shelveId) });
            }
          });
        }
      }
    }
    return out;
  },

  /**
   * 源侧树：校区 → 房号 → 架（在 _btBuildRooms 的平铺结果上按 campusName 再归一层）。
   * 架行不挂计数 —— 源阶段用户本就知道自己笼位在哪，要看的是房间与架名，不是「还剩几个空位」。
   */
  _btBuildTree: function () {
    var rooms = this._btBuildRooms();
    var out = [];
    var byCampus = {};
    rooms.forEach(function (r) {
      var campusName = r.campusName || '';
      var campus = byCampus[campusName];
      if (!campus) {
        campus = { campusName: campusName, collapsed: false, rooms: [] };
        byCampus[campusName] = campus;
        out.push(campus);
      }
      campus.rooms.push({
        roomKey: r.key,
        roomName: r.roomName,
        collapsed: false,
        shelves: (r.shelves || []).map(function (sh) {
          return { shelveId: sh.shelveId, shelveName: sh.shelveName, roomId: '', roomName: r.roomName, count: 0 };
        })
      });
    });
    return out;
  },

  /**
   * 详情弹窗点「批量转移」：把当前格作为第一个源带进抽屉。
   * 与 onStartOp 的区别：不进主网格选位模式（批量全程在抽屉里完成，主网格不动）。
   */
  onStartBatchTransfer: function () {
    var self = this;
    var cell = self.data.selectedCell;
    var cageId = cell ? String(cell.id || cell.animalCageId || '') : '';
    if (!cageId) return;
    if (self._pendingOpOf(cell)) { wx.showToast({ title: self._busyReasonOf(cell), icon: 'none' }); return; }
    var tree = self._btBuildTree();
    if (!tree.length) { wx.showToast({ title: '没有可转移的笼架', icon: 'none' }); return; }
    var meta = self.data.gridMeta || self.data.selectedShelf || {};
    var anchor = {
      animalCageId: cageId,
      label: (cell && (cell._displayPosition || cell.position)) || '',
      shelveId: String((meta && meta.shelveId) || ''),
      shelveName: String((meta && meta.shelveName) || ''),
      roomId: String((meta && meta.roomId) || ''),
      roomName: String((meta && meta.roomName) || '')
    };
    self._closeDetail();
    // 打开抽屉落到屏 A（树），不自动拉任何架 —— 一次只渲染一个架是本次改动的核心口径
    self.setData({
      btOpen: true, btMode: 'transfer', btPhase: 'source', btScreen: 'tree',
      btTree: tree, btShelf: null,
      // 入口格当第一个源带进来（「转移笼位」点的就是它），同时记下它的 id 好让提示文案交代来历
      btAnchorId: cageId,
      btSources: [anchor], btTargets: {}, btPoolMap: {}, btCursor: 0,
      btSubmitting: false, btEmptyText: '',
      // 分笼那两个字段一起复位，免得切模式时带过来
      btDivTargets: [], btKeepSource: true, btSourceLabel: ''
    }, function () {
      self._btRebuildChrome();
    });
  },

  /**
   * 详情弹窗点「分笼」：同一个抽屉、divide 模式。
   *
   * 分笼是**一对多**，与转移的差别（也是这里少做什么的原因）：
   *  - 源固定 = 入口格，不再选源、没有配对、没有 cursor → 直接进目标阶段
   *  - 目标**多选**（`btDivTargets` 有序数组），点一下加到集合、再点一下移除
   *  - **没有转移单**：不拉 prefill、不弹表单；只在「不保留源笼位」时给一个纯摘要确认
   *  - `keepSource` 是唯一的关键分岔（保留=净增占用要卡配额；归档=清空源笼位且不可逆），
   *    所以把它提到抽屉里常驻可见（见 wxml 的「源笼位」那一行），不再埋进确认弹窗
   */
  onStartDivide: function () {
    var self = this;
    var cell = self.data.selectedCell;
    var cageId = cell ? String(cell.id || cell.animalCageId || '') : '';
    if (!cageId) return;
    if (self._pendingOpOf(cell)) { wx.showToast({ title: self._busyReasonOf(cell), icon: 'none' }); return; }
    var tree = self._btBuildTree();
    if (!tree.length) { wx.showToast({ title: '没有可分笼的笼架', icon: 'none' }); return; }
    var meta = self.data.gridMeta || self.data.selectedShelf || {};
    var anchor = {
      animalCageId: cageId,
      label: (cell && (cell._displayPosition || cell.position)) || '',
      shelveId: String((meta && meta.shelveId) || ''),
      shelveName: String((meta && meta.shelveName) || ''),
      roomId: String((meta && meta.roomId) || ''),
      roomName: String((meta && meta.roomName) || '')
    };
    self._closeDetail();
    self._btNotOperable = {};
    self.setData({
      btOpen: true, btMode: 'divide', btPhase: 'target', btScreen: 'tree',
      btAnchorId: cageId, btSourceLabel: anchor.label + (anchor.shelveName ? ' · ' + anchor.shelveName : ''),
      // 源就这一个（`_btCurSource()` 取 sources[cursor]，所以正常走目标阶段那套池子/打标逻辑）
      btSources: [anchor], btTargets: {}, btDivTargets: [], btKeepSource: true,
      btPoolMap: {}, btCursor: 0, btSubmitting: false, btEmptyText: '',
      btTree: [], btShelf: null, btRows: []
    }, function () {
      // 先**立刻**算一遍文案/按钮态再拉池：`_btRebuildChromeDivide` 不依赖池子（空目标集合也能算出
      // 正确文案），而池子是网络请求 —— 不先算的话，池子返回前抽屉会顶着**上一个模式**残留的
      // 提示与按钮文案（比如上次转移留下的「请继续点格子添加源笼位」/「提交转移（2）」）。
      self._btRebuildChrome();
      // 分笼只有当前源一个池子，进抽屉就把它的目标池拉好并建树
      self._btEnsurePool(anchor, function () {
        self._btApplyTargetTree();
        self._btRebuildChrome();
      });
    });
  },

  onBtCampusTap: function (e) {
    var name = String(e.currentTarget.dataset.campusName || '');
    var tree = (this.data.btTree || []).map(function (c) {
      if (c.campusName === name) return Object.assign({}, c, { collapsed: !c.collapsed });
      return c;
    });
    this.setData({ btTree: tree });
  },

  onBtRoomTap: function (e) {
    var key = String(e.currentTarget.dataset.roomKey || '');
    var tree = (this.data.btTree || []).map(function (c) {
      var rooms = (c.rooms || []).map(function (r) {
        if (r.roomKey === key) return Object.assign({}, r, { collapsed: !r.collapsed });
        return r;
      });
      return Object.assign({}, c, { rooms: rooms });
    });
    this.setData({ btTree: tree });
  },

  onBtShelfRowTap: function (e) {
    var d = e.currentTarget.dataset;
    this._btLoadShelf(String(d.shelveId || ''), String(d.shelveName || ''), String(d.roomId || ''), String(d.roomName || ''));
  },

  /** 屏 B → 屏 A：只翻屏、不拉不画；树与阶段都不变（切回已看过的架直接吃缓存） */
  onBtBackToTree: function () {
    this.setData({ btScreen: 'tree', btShelf: null });
  },

  /**
   * 拉**一个**架的本地网格（一次只渲染一个架，屏高全给网格）。
   * 失败只影响这一架，就地显示原因，不回屏 A、不关抽屉；失败的那一架不写缓存，重进仍会重试。
   */
  _btLoadShelf: function (shelveId, shelveName, roomId, roomName) {
    var self = this;
    self._btShelfGridCache = self._btShelfGridCache || {};
    var cached = self._btShelfGridCache[shelveId];
    self.setData({
      btScreen: 'grid',
      btShelf: {
        shelveId: shelveId, shelveName: shelveName, roomId: roomId || '', roomName: roomName || '',
        loading: !cached, error: '', grid: cached ? cached.grid : []
      }
    });
    if (cached) { self._btPaintPhase(); return; }
    springAuth.springRequest({
      url: '/api/cage-cell-index/local-grid/by-shelve/' + String(shelveId), method: 'GET', data: {}
    }).then(function (res) {
      var p = unwrap(res);
      if (!p.ok) throw new Error(p.message || '加载笼位失败');
      var d = p.data || {};
      var grid = buildGrid(d.grid || []);
      self._btShelfGridCache[shelveId] = { grid: grid };
      self.setData({ 'btShelf.loading': false, 'btShelf.error': '', 'btShelf.grid': grid }, function () { self._btPaintPhase(); });
    }).catch(function (e) {
      self.setData({ 'btShelf.loading': false, 'btShelf.error': (e && e.message) || '加载笼位失败' });
    });
  },

  /**
   * 给当前这一个架的格子打标。源阶段与目标阶段共用，只换判据：
   *   源阶段：饲养中(type3) 且不在缓冲里 → 可点；已在缓冲 → _sel
   *   目标阶段：池里 selectable → 可点（_sel 已选）；池里存在但不可选 → _dis + _tip=后端 reason
   * 口径与主网格一致：只认后端下发的 selectable/reason，前端不再叠一层判定。
   */
  _btPaintPhase: function () {
    var self = this;
    var shelf = self.data.btShelf;
    if (!shelf || !shelf.grid || !shelf.grid.length) return;
    var isTarget = self.data.btPhase === 'target';
    var cur = self._btCurSource();
    var pool = {};
    /** 池子是否已就绪（拿到过数据且没失败）。没就绪时**不要**按池子判「不在可选范围」，
        否则整屏都会被打上网纹、看着像「一个都不能选」—— 树那边的空态/错误文案已经说明了情况。 */
    var poolUsable = false;
    if (isTarget && cur) {
      var cached = (self.data.btPoolMap || {})[cur.animalCageId] || {};
      pool = cached.byCage || {};
      poolUsable = !cached.loading && !cached.error;
    }
    var sources = self.data.btSources || [];
    var picked = {};
    sources.forEach(function (s) { if (s.animalCageId) picked[String(s.animalCageId)] = true; });
    var chosen = self.data.btTargets || {};
    var chosenTargetId = (isTarget && cur) ? String(chosen[cur.animalCageId] || '') : '';
    /** 分笼模式：目标多选（有序数组）→ 建个查表用；与转移的 1:1 配对表 `btTargets` 分开 */
    var isDivide = self.data.btMode === 'divide';
    var divSet = {};
    (self.data.btDivTargets || []).forEach(function (id) { divSet[String(id)] = true; });
    /** 点过、后端说不能操作的笼位（id → 原因）：记住它，下次进抽屉就直接打网纹，不用再点一次 */
    var notOperable = self._btNotOperable || {};

    var grid = (shelf.grid || []).map(function (c) {
      var cid = c && c.animalCageId != null ? String(c.animalCageId) : '';
      var next = Object.assign({}, c);
      next._sel = false;
      next._dis = false;
      next._tip = '';
      if (!cid) { return next; }
      if (!isTarget) {
        // 源阶段：非饲养中的格子永远不能作为源 → 网纹禁用（_dis 就是网纹 + 底部原因标签）。
        // 「饲养中但我不能操作」只有点过才知道，所以靠 notOperable 记住后回填。
        var isOccupied = resolveAnimalCageType(c) === 3;
        if (picked[cid]) next._sel = true;
        else if (!isOccupied) { next._dis = true; next._tip = '非饲养中'; }
        else if (notOperable[cid]) { next._dis = true; next._tip = notOperable[cid]; }
      } else if (isDivide) {
        // 分笼：一对多，只判「在不在池子里 + 后端 selectable」——没有「配给哪个源」这回事
        if (divSet[cid]) next._sel = true;
        else if (!poolUsable) { /* 池子还在拉/拉失败：不按池子判，别把整屏都打成「不在可选范围」 */ }
        else if (!pool[cid]) { next._dis = true; next._tip = '不在可选范围'; }
        else if (!pool[cid].selectable) { next._dis = true; next._tip = pool[cid].reason || '不可选'; }
      } else {
        var t = pool[cid];
        // 已被**别的源**配走的格子：置灰。一个目标只能接收一次转移，后端要到执行时
        //（三签都签完之后）才会撞上并整批回滚 —— 所以必须在这里就拦住。
        var owner = btLogic.targetOwnerExcept(chosen, cid, cur ? cur.animalCageId : null);
        if (chosenTargetId && cid === chosenTargetId) next._sel = true;
        else if (owner) { next._dis = true; next._tip = '已配给别的源'; }
        else if (!poolUsable) { /* 池子还在拉/拉失败：不按池子判，别把整屏都打成「不在可选范围」 */ }
        else if (!t) { next._dis = true; next._tip = '不在可选范围'; }
        else if (!t.selectable) { next._dis = true; next._tip = t.reason || '不可选'; }
      }
      return next;
    });
    self.setData({ 'btShelf.grid': grid });
  },

  /** 抽屉的状态文案与配对条：每处 setData 后调一次，避免散在各 handler 里各算一半 */
  _btRebuildChrome: function () {
    var self = this;
    if (self.data.btMode === 'divide') { self._btRebuildChromeDivide(); return; }
    var sources = self.data.btSources || [];
    var targets = self.data.btTargets || {};
    var isTarget = self.data.btPhase === 'target';
    var cur = self._btCurSource();
    var poolByCage = {};
    if (isTarget && cur) {
      var cached = (self.data.btPoolMap || {})[cur.animalCageId] || {};
      poolByCage = cached.byCage || {};
    }
    var rows = btLogic.pairRows(sources, targets, poolByCage).map(function (r) {
      return Object.assign({}, r, { active: isTarget && cur && r.sourceId === cur.animalCageId });
    });
    var paired = rows.filter(function (r) { return r.paired; }).length;
    var unpaired = sources.length - paired;
    // 抽屉是「一步一步引导」的：每个阶段都留一句「下一步该做什么」，别让用户对着空网格猜。
    // 源阶段还要交代锚点的来历 —— 否则用户会纳闷「我还没开始选，怎么已经有一个了」。
    var hint = '';
    if (isTarget) {
      hint = (cur && targets[cur.animalCageId])
        ? '这个源已配好，点上面的配对条可换下一个源'
        : '请在下面点一个空笼位，作为它的目标';
    } else if (sources.length === 0) {
      hint = '请点格子选择要转移的源笼位';
    } else {
      var hasAnchor = false;
      for (var i = 0; i < sources.length; i++) {
        if (self.data.btAnchorId && sources[i].animalCageId === self.data.btAnchorId) { hasAnchor = true; break; }
      }
      hint = hasAnchor
        ? '已把刚才那一格作为第一个源，请继续点格子添加；点 × 可移除'
        : '请继续点格子添加源笼位；选完点「下一步」';
    }
    self.setData({
      btRows: rows,
      btHint: hint,
      btCursorText: cur ? ('第 ' + (self.data.btCursor + 1) + '/' + sources.length + ' 个源 · ' + cur.label + ' · ' + cur.shelveName) : '',
      btBufferTitle: isTarget ? ('配对 ' + paired + '/' + sources.length) : ('已选 ' + sources.length + ' 个源笼位'),
      btConfirmOff: sources.length === 0 || unpaired > 0 || self.data.btSubmitting,
      btShowNext: !isTarget && sources.length > 0,
      btShowBackToSource: isTarget,
      btCanClear: !isTarget && sources.length > 0,
      btChipRemovable: !isTarget,
      btSubmitLabel: '提交转移（' + sources.length + '）',
    });
  },

  /**
   * 分笼模式的文案/缓冲条：一对多，所以没有配对、没有 cursor、没有「已配几个」。
   *
   * 目标 chip **复用转移那套行结构**，注意这里是**借字段当键**：`sourceId` 装的是目标 id
   *（它只当行的唯一键用，`wx:key` 与 `data-source-id` 都靠它），这样 wxml 一个字都不用改。
   */
  _btRebuildChromeDivide: function () {
    var self = this;
    var src = (self.data.btSources || [])[0] || null;
    var ids = self.data.btDivTargets || [];
    var byCage = src ? (((self.data.btPoolMap || {})[src.animalCageId] || {}).byCage || {}) : {};
    var rows = ids.map(function (id) {
      var t = byCage[String(id)];
      var label = (t && t.positionX != null && t.positionY != null)
        ? btLogic.displayLabelOf(t.positionX, t.positionY) : '—';
      return { sourceId: String(id), text: label, paired: true, active: false };
    });
    self.setData({
      btRows: rows,
      btHint: ids.length
        ? '继续点空笼位加目标；选完点「确认分笼」'
        : '请点空笼位选择分笼目标（可多选、可跨房间）',
      btCursorText: '',
      btBufferTitle: '已选 ' + ids.length + ' 个目标笼位',
      btConfirmOff: ids.length === 0 || self.data.btSubmitting,
      btShowNext: false,
      btShowBackToSource: false,
      btCanClear: ids.length > 0,
      btChipRemovable: true,
      btSubmitLabel: '确认分笼（' + ids.length + '）',
    });
  },

  onBtCellTap: function (e) {
    var self = this;
    var idx = Number(e.detail && e.detail.index);
    var shelf = self.data.btShelf;
    if (!shelf || isNaN(idx) || !shelf.grid || !shelf.grid[idx]) return;
    var cell = shelf.grid[idx];
    var cageId = cell.animalCageId != null ? String(cell.animalCageId) : '';
    if (!cageId) return;
    if (self.data.btPhase === 'target') { self._btPickTarget(cageId, cell); return; }
    self._btToggleSource(cageId, cell, shelf);
  },

  /**
   * 源：已在缓冲则移出；否则先问后端能不能操作（/cage-op/operable 是**单笼位**接口，
   * 没有批量版，所以这里逐格校验；后端提交时仍会复检）。
   * ponytail: 逐格校验 operable，N 次请求；若源侧房间普遍十几架再考虑加批量 operable 接口。
   */
  _btToggleSource: function (cageId, cell, shelf) {
    var self = this;
    var sources = (self.data.btSources || []).slice();
    var hit = -1;
    for (var i = 0; i < sources.length; i++) if (sources[i].animalCageId === cageId) { hit = i; break; }
    if (hit >= 0) {
      // 已在缓冲 → 移出（配对挂在源 id 上，连带删它的目标）
      var nextTargets = Object.assign({}, self.data.btTargets || {});
      delete nextTargets[cageId];
      sources.splice(hit, 1);
      self.setData({ btSources: sources, btTargets: nextTargets }, function () {
        self._btPaintPhase(); self._btRebuildChrome();
      });
      return;
    }
    if (self.data.btChecking) return;
    self.setData({ btChecking: true });
    springAuth.springRequest({ url: '/api/cage-op/operable', method: 'GET', data: { animalCageId: cageId } })
      .then(function (res) {
        var p = unwrap(res);
        // 抽屉可能在请求在飞的时候被关了（或关了又重开）。此时既不该写缓冲，
        // 也不该用**关抽屉前捕获的 sources 快照**去 concat —— 那会把重开后新选的源冲掉。
        if (!self.data.btOpen) return;
        self.setData({ btChecking: false });
        var d = p.ok ? (p.data || {}) : {};
        if (!d.operable) {
          // 记住它：这一格这次就打成网纹禁用，下次再进抽屉也不用重新点一次才知道
          self._btNotOperable = self._btNotOperable || {};
          self._btNotOperable[cageId] = d.reason || '该笼位不能转移';
          wx.showToast({ title: d.reason || '该笼位不能转移', icon: 'none' });
          self._btPaintPhase();
          return;
        }
        // 用回包时的最新缓冲重算，且再查一次重（校验期间同一个格子可能已被点掉）
        var fresh = (self.data.btSources || []).slice();
        for (var i = 0; i < fresh.length; i++) if (fresh[i].animalCageId === cageId) return;
        var add = {
          animalCageId: cageId,
          label: cell._displayPosition || cell.position || '',
          shelveId: shelf.shelveId,
          shelveName: shelf.shelveName,
          roomId: String(shelf.roomId || ''),
          roomName: shelf.roomName || ''
        };
        self.setData({ btSources: fresh.concat([add]) }, function () {
          self._btPaintPhase(); self._btRebuildChrome();
        });
      })
      .catch(function () {
        if (!self.data.btOpen) return;
        self.setData({ btChecking: false });
        wx.showToast({ title: '校验失败，请重试', icon: 'none' });
      });
  },

  /** 「下一步」：进目标阶段，光标落到第一个没配的源，并保证它的池子已拉 */
  onBtToTarget: function () {
    var self = this;
    var sources = self.data.btSources || [];
    if (!sources.length) { wx.showToast({ title: '请先选择源笼位', icon: 'none' }); return; }
    var cursor = btLogic.nextUnpairedIdx(sources, self.data.btTargets || {}, 0);
    if (cursor < 0) cursor = 0;
    // 切阶段 → 回屏 A，并按新阶段重建树（见设计 §3 切换规则）
    self.setData({ btPhase: 'target', btScreen: 'tree', btShelf: null, btCursor: cursor }, function () {
      self._btEnsurePool(sources[cursor], function () {
        self._btApplyTargetTree(); self._btRebuildChrome();
      });
    });
  },

  onBtBackToSource: function () {
    var self = this;
    // 目标阶段的树是「当前源的目标池」推出来的子集（_btApplyTargetTree）。
    // 只翻 btPhase 的话源阶段会停留在那个子集上 —— 用户连自己房间的架子都找不到。
    // 所以必须换回页面那棵完整树，并回屏 A。
    var tree = self._btBuildTree();
    self.setData({
      btPhase: 'source', btScreen: 'tree', btShelf: null, btTree: tree, btEmptyText: ''
    }, function () { self._btRebuildChrome(); });
  },

  /** 拉某个源的目标池（全库：不传 shelfIndexId）。按源缓存，来回跳不重拉。 */
  _btEnsurePool: function (source, done) {
    var self = this;
    if (!source) { if (done) done(); return; }
    var map = Object.assign({}, self.data.btPoolMap || {});
    if (map[source.animalCageId] && !map[source.animalCageId].error) { if (done) done(); return; }
    map[source.animalCageId] = { loading: true, error: '', pool: [], byCage: {}, rooms: [] };
    self.setData({ btPoolMap: map });
    springAuth.springRequest({ url: '/api/cage-op/targets', method: 'GET', data: { sourceAnimalCageId: source.animalCageId } })
      .then(function (res) {
        var p = unwrap(res);
        if (!p.ok) throw new Error(p.message || '加载可选笼位失败');
        var pool = p.data || [];
        var byCage = {};
        pool.forEach(function (t) { if (t && t.animalCageId != null) byCage[String(t.animalCageId)] = t; });
        var next = Object.assign({}, self.data.btPoolMap || {});
        next[source.animalCageId] = { loading: false, error: '', pool: pool, byCage: byCage, rooms: btLogic.groupPoolByRoom(pool) };
        self.setData({ btPoolMap: next }, function () { if (done) done(); });
      })
      .catch(function (e) {
        var next = Object.assign({}, self.data.btPoolMap || {});
        next[source.animalCageId] = { loading: false, error: (e && e.message) || '加载可选笼位失败', pool: [], byCage: {}, rooms: [] };
        self.setData({ btPoolMap: next }, function () { if (done) done(); });
      });
  },

  /**
   * 目标阶段的树：从当前源的池子推（池条目自带校/房/架），**只列有可选目标的架**，
   * 架行右侧给「可选 N」（= 该架上 selectable 的格子数）。打开某一架仍拉真实网格（屏 B）。
   */
  _btApplyTargetTree: function () {
    var self = this;
    var cur = self._btCurSource();
    if (!cur) { self.setData({ btTree: [], btEmptyText: '' }); return; }
    var cached = (self.data.btPoolMap || {})[cur.animalCageId] || {};
    var pool = cached.pool || [];
    var out = [];
    var byCampus = {};
    (pool || []).forEach(function (t) {
      if (!t || !t.selectable) return;   // 只有可选的进树，别的架不列
      var shelveId = t.shelveId == null ? '' : String(t.shelveId);
      if (!shelveId) return;
      var campusName = t.campusName || '';
      var roomName = t.roomName || '其他';
      var campus = byCampus[campusName];
      if (!campus) {
        campus = { campusName: campusName, collapsed: false, rooms: [], _rooms: {} };
        byCampus[campusName] = campus;
        out.push(campus);
      }
      var room = campus._rooms[roomName];
      if (!room) {
        room = { roomKey: campusName + '/' + roomName, roomName: roomName, collapsed: false, shelves: [], _shelves: {} };
        campus._rooms[roomName] = room;
        campus.rooms.push(room);
      }
      var shelf = room._shelves[shelveId];
      if (!shelf) {
        shelf = { shelveId: shelveId, shelveName: t.shelveName || shelveId, roomId: '', roomName: roomName, count: 0 };
        room._shelves[shelveId] = shelf;
        room.shelves.push(shelf);
      }
      shelf.count += 1;
    });
    // 清掉内部索引（_rooms/_shelves），别把中间结构暴露进渲染数据
    out.forEach(function (campus) {
      delete campus._rooms;
      campus.rooms.forEach(function (room) { delete room._shelves; });
    });
    self.setData({ btTree: out, btScreen: 'tree', btShelf: null, btEmptyText: out.length ? '' : '该源暂无可用目标笼位' });
  },

  /**
   * 目标：只认后端 selectable。点中 → 记到 btTargets，**就地重画**。
   *
   * 刻意**不**自动换源、**不**回屏 A（用户 2026-09-22 口径：由用户自行操作）。
   * 以前这里是「配对 + nextUnpairedIdx 前进 + _btApplyTargetTree 回树屏」，
   * 表现就是「点一下就退出」—— 想接着看这一架还得重新进。
   * 换源改为用户主动点配对条上的 chip（那时才回屏 A，因为不同源的池子可能落在不同的架）。
   */
  _btPickTarget: function (cageId, cell) {
    var self = this;
    var cur = self._btCurSource();
    if (!cur) return;
    var cached = (self.data.btPoolMap || {})[cur.animalCageId] || {};
    var t = (cached.byCage || {})[cageId];
    if (!t || !t.selectable) { wx.showToast({ title: (t && t.reason) || '该笼位不在可选范围内', icon: 'none' }); return; }
    if (self.data.btMode === 'divide') {
      // 分笼是一对多：同一个源多选目标，再点一下取消；没有「配给别的源」的问题
      var arr = (self.data.btDivTargets || []).slice();
      var at = arr.indexOf(cageId);
      if (at >= 0) arr.splice(at, 1); else arr.push(cageId);
      self.setData({ btDivTargets: arr }, function () {
        self._btPaintPhase();
        self._btRebuildChrome();
      });
      return;
    }
    // 一个目标笼位只能接收一次转移。格子已置灰，这里再挡一道（防止别的入口/路径绕过来）
    if (btLogic.targetOwnerExcept(self.data.btTargets || {}, cageId, cur.animalCageId)) {
      wx.showToast({ title: '该笼位已配给别的源，一个笼位只能接收一次转移', icon: 'none' });
      return;
    }
    var targets = Object.assign({}, self.data.btTargets || {});
    if (targets[cur.animalCageId] === cageId) delete targets[cur.animalCageId];
    else targets[cur.animalCageId] = cageId;
    self.setData({ btTargets: targets }, function () {
      // 就地重画：本格变/取消选中，别的格可能从「已配给别的源」解开
      self._btPaintPhase();
      self._btRebuildChrome();
    });
  },

  /** 配对条上点一条：光标跳到它（目标阶段）/ 无动作（源阶段，删除由 × 走 onBtRemoveSource） */
  onBtChipTap: function (e) {
    var self = this;
    // 分笼：chip 就是已选目标，没有「跳到哪个源」这回事（只有一个源）
    if (self.data.btMode === 'divide') return;
    if (self.data.btPhase !== 'target') return;
    var sid = String(e.currentTarget.dataset.sourceId || '');
    var sources = self.data.btSources || [];
    var idx = -1;
    for (var i = 0; i < sources.length; i++) if (sources[i].animalCageId === sid) { idx = i; break; }
    if (idx < 0) return;
    self.setData({ btCursor: idx }, function () {
      self._btEnsurePool(sources[idx], function () { self._btApplyTargetTree(); self._btRebuildChrome(); });
    });
  },

  /** chip 上的 ×：转移=移出这个源（连带删它的目标）；分笼=移除这个已选目标 */
  onBtRemoveSource: function (e) {
    var self = this;
    var sid = String(e.currentTarget.dataset.sourceId || '');
    if (self.data.btMode === 'divide') {
      var arr = (self.data.btDivTargets || []).filter(function (id) { return String(id) !== sid; });
      self.setData({ btDivTargets: arr }, function () {
        self._btPaintPhase(); self._btRebuildChrome();
      });
      return;
    }
    var out = btLogic.removeSource(self.data.btSources || [], self.data.btTargets || {}, sid);
    var cursor = self.data.btCursor;
    if (self.data.btPhase === 'target') {
      var next = btLogic.nextUnpairedIdx(out.sources, out.targets, cursor);
      cursor = next < 0 ? 0 : next;
    }
    self.setData({ btSources: out.sources, btTargets: out.targets, btCursor: cursor }, function () {
      self._btPaintPhase(); self._btRebuildChrome();
    });
  },

  /** 分笼：切换「保留源笼位」。true=源笼位原样保留（净增占用，会卡配额）；false=源笼位归档为空笼盒 */
  onBtKeepSourceChange: function (e) {
    this.setData({ btKeepSource: !!(e.detail && e.detail.value) });
  },

  onBtClearSources: function () {
    var self = this;
    // 分笼：清的是已选目标集合；**源笼位不清**（它就是入口那一格，清了这个操作就没意义了）
    if (self.data.btMode === 'divide') {
      self.setData({ btDivTargets: [] }, function () {
        self._btPaintPhase(); self._btRebuildChrome();
      });
      return;
    }
    self.setData({ btSources: [], btTargets: {}, btCursor: 0 }, function () {
      self._btPaintPhase(); self._btRebuildChrome();
    });
  },

  onBtClose: function () {
    var self = this;
    // 抽屉里没有锁任何服务端占用（与订购抽屉不同），关掉只需清本地状态。
    // btChecking 必须一起清：它是在飞的 /cage-op/operable 校验的重入保护，
    // 留着 true 的话重开抽屉后点任何源格子都会被静默吃掉（连 toast 都没有）。
    self.setData({
      btOpen: false, btMode: 'transfer', btPhase: 'source', btScreen: 'tree', btTree: [], btShelf: null,
      btSources: [], btTargets: {}, btPoolMap: {}, btCursor: 0,
      btSubmitting: false, btChecking: false, btEmptyText: '', btRows: [], btConfirmOff: true,
      // 锚点与提示都跟着这次会话走：不清的话重开抽屉会拿上一次的入口格去比对提示文案
      btAnchorId: '', btHint: '',
      // 分笼那两个字段：不清的话下次开转移抽屉会带着上一次的目标集合
      btDivTargets: [], btKeepSource: true, btSourceLabel: ''
    });
    self._btShelfGridCache = {};
    self._btNotOperable = {};
  },

  onBtConfirm: function () {
    var self = this;
    if (self.data.btMode === 'divide') { self._btSubmitDivide(); return; }
    var sources = self.data.btSources || [];
    var targets = self.data.btTargets || {};
    if (!sources.length) return;
    var missing = sources.filter(function (s) { return !targets[s.animalCageId]; });
    if (missing.length) { wx.showToast({ title: '还有 ' + missing.length + ' 个源没选目标', icon: 'none' }); return; }
    self._btOpenConfirm();
  },

  /**
   * 分笼提交：**没有转移单、没有表单**，直接把「源 + 目标集 + keepSource」发出去。
   *
   * 「不保留源笼位」要拦一下：那是把源笼位**归档** —— 释放认领 + 清占用/动物/状态 + 回空笼盒，
   * 不可撤销。保留时是净增占用（后端会按「房间 + AUP 配额」校验），不打扰。
   */
  _btSubmitDivide: function () {
    var self = this;
    var src = (self.data.btSources || [])[0] || null;
    var targets = (self.data.btDivTargets || []).slice();
    if (!src || !targets.length) { wx.showToast({ title: '请先选择分笼目标笼位', icon: 'none' }); return; }
    var keep = !!self.data.btKeepSource;
    var doSubmit = function () {
      // 重入闸：主按钮的「禁用态」只是灰色类，没有 pointer-events 拦截，快速连点会发两次请求
      //（分笼是两次 POST /divide；转移那条更贵 —— 两张转移单）。所以每个提交入口都得自己挡一道。
      if (self.data.btSubmitting) return;
      // 一并置 btConfirmOff：让按钮立刻变灰，别只靠「提交中…」文案
      self.setData({ btSubmitting: true, btConfirmOff: true });
      springAuth.springRequest({
        url: '/api/cage-op/divide', method: 'POST',
        data: {
          sourceAnimalCageId: src.animalCageId,
          targetAnimalCageIds: targets,
          keepSource: keep,
          reason: ''
        }
      }).then(function (res) {
        var p = unwrap(res);
        self.setData({ btSubmitting: false });
        if (!p.ok) { wx.showToast({ title: p.message || '分笼失败', icon: 'none' }); return; }
        var r = p.data || {};
        wx.showToast({ title: r.needApproval ? '已提交，等待审核' : '分笼已完成', icon: 'success' });
        self.onBtClose();
        self.onRetry();
      }).catch(function () {
        self.setData({ btSubmitting: false });
        wx.showToast({ title: '分笼失败', icon: 'none' });
      });
    };
    if (keep) { doSubmit(); return; }
    wx.showModal({
      title: '源笼位将被归档',
      content: '不保留源笼位时，' + (src.label || '源笼位') + ' 上的动物、占用与状态信息会被清空并回空笼盒，不可撤销。确认分笼到 ' + targets.length + ' 个目标笼位？',
      confirmText: '确认分笼',
      success: function (r) { if (r.confirm) doSubmit(); }
    });
  },

  /**
   * 批量确认：复用既有「确认转移笼位」弹窗（连同它的 op-form 表单），
   * 只把 opPicked 换成「pair 列表」、opFormRows 换成各对拼起来的一行。
   * 转移单自动值 = 每对调一次既有 prefill（一源一目标），顶层取第 1 对 ——
   * 后端 buildInput 的表外单位/负责人本来就取 pairs[0].source，两端天然一致。
   */
  _btOpenConfirm: function () {
    var self = this;
    var sources = self.data.btSources || [];
    var targets = self.data.btTargets || {};
    var btPoolMap = self.data.btPoolMap || {};

    // 批次令牌：prefill 是并发拉的，回来时可能已经开了**另一次**批量确认
    //（关掉 → 改源 → 再提交）。只有本次批次的回包才准写表单，
    // 否则上一批的 rows/自动值会盖到新批次上（下标仍对齐，所以只会显示错值，不会错发 pair，
    // 但那已经够让人以为「核对过了」）。
    var token = (self._btConfirmToken || 0) + 1;
    self._btConfirmToken = token;

    // 逐源取目标条目：配对挂在源 id 上、与顺序解耦，这里按 sources 顺序铺平
    var pairs = sources.map(function (s) {
      var cached = btPoolMap[s.animalCageId] || {};
      var t = (cached.byCage || {})[targets[s.animalCageId]] || {};
      return { source: s, targetId: String(targets[s.animalCageId]), target: t };
    });

    self.setData({
      opBatch: true, opKind: 'transfer', opConfirmOpen: true,
      opSubmitting: false, btSubmitting: false,
      // 每对一行：源 id 唯一可当 wx:key；目标坐标用 displayLabelOf 保证与网格位号一致（含顶↔底翻转）
      opPicked: pairs.map(function (p) {
        var tl = (p.target.positionX != null && p.target.positionY != null)
          ? btLogic.displayLabelOf(p.target.positionX, p.target.positionY) : '—';
        return {
          animalCageId: p.source.animalCageId,
          _posLabel: p.source.label + ' → ' + tl,
          campusName: p.target.campusName || '',
          roomName: p.target.roomName || '',
          shelveName: p.target.shelveName || '',
          aupNumber: p.target.aupNumber || ''
        };
      }),
      // 提交时按下标取它对齐 opFormRows，别在提交时再从池里重算顺序
      btPairTargetIds: pairs.map(function (p) { return p.targetId; }),
      opFormLoading: true, opFormReady: false,
      opFormAuto: {}, opFormRows: [], opFormEdits: { rows: [] },
      opFormDate: '', opFormUnit: '', opFormPhone: '',
      opReason: ''
    });

    // 每对一次 prefill，顶层取第 1 对，rows 按下标拼接（与后端 rows[i] ↔ pairs[i] 对齐同口径）
    Promise.all(pairs.map(function (p) {
      return springAuth.springRequest({
        url: '/api/cage-op/transfer-form/prefill', method: 'GET',
        data: { sourceAnimalCageId: p.source.animalCageId, targetAnimalCageIds: p.targetId }
      }).then(function (res) {
        var q = unwrap(res);
        return q.ok ? (q.data || null) : null;
      }).catch(function () { return null; });
    })).then(function (list) {
      // 弹窗已关、已经不是批量、或者期间又开了新的一次批量确认 → 早退，别写已经过期的表单
      if (token !== self._btConfirmToken) return;
      if (!self.data.opConfirmOpen || !self.data.opBatch) return;
      var first = list[0] || {};
      var rows = list.map(function (pf) {
        var r = (pf && pf.rows && pf.rows[0]) || {};
        return {
          strain: r.strain == null ? '' : String(r.strain),
          female: r.female == null ? '' : String(r.female),
          male: r.male == null ? '' : String(r.male)
        };
      });
      /**
       * 汇总表外的「转出/接收地点」：
       * 单个流程一次就把「源 + 全部目标」交给 prefill，所以它拿到的 fromLocation/toLocation 天然是全量。
       * 批量是**每对一次** prefill，只看第 1 对就漏了后面几对被搬的笼位 —— 复核时看着像只搬一个。
       * 所以这里按对拼起来。后端 `pairLocations` 排印时是一对一行的编号列表，弹窗这块是单行灰字，
       * 换成「；」连接（内容一致、只是分隔符不同），避免这一段在弹窗里撑成多行。
       */
      var joinLocs = function (key) {
        var seen = {}, out = [];
        list.forEach(function (pf) {
          var v = pf && pf[key];
          if (!v || seen[v]) return;
          seen[v] = true;
          out.push(v);
        });
        return out.join('；');
      };
      var fromLocation = joinLocs('fromLocation');
      var toLocation = joinLocs('toLocation');
      self.setData({
        opFormLoading: false, opFormReady: !!list[0],
        // 与单个流程同口径：opFormAuto 装整份自动值 —— 弹窗读 piName/…，
        // _opFormAutoTop 读 transferDate/unitName/phone，_opFormAutoRow 读 rows[idx][field]。
        // rows 必须是**拼接后的全量**，否则第 2 对起「改了没有」比对不上，
        // 学生填了跟自动值一样的数也会被当成改动发出去。
        opFormAuto: Object.assign({}, first, {
          rows: rows,
          fromLocation: fromLocation || first.fromLocation || '',
          toLocation: toLocation || first.toLocation || ''
        }),
        // 顶层三项的显示初值 = 自动值（与单个流程的 _applyOpFormPrefill 同口径）
        opFormDate: first.transferDate == null ? '' : String(first.transferDate),
        opFormUnit: first.unitName == null ? '' : String(first.unitName),
        opFormPhone: first.phone == null ? '' : String(first.phone),
        opFormRows: rows,
        // 还没动过任何字段：与单个流程一致，空对象 = 整份走后端自动值
        opFormEdits: {}
      });
    });
  },

  /**
   * 查看本人转移单 PDF。两个入口共用：未决转移条（detailOpMark）与「我的转移单」列表。
   * /api/cage-op/transfer-form/{id} 回的是**裸字节流**不是 Result 信封，
   * 所以走 springRequestBinary（JSON 那条会把 PDF 当字符串解析坏）；
   * 落盘 + wx.openDocument 复用 springAuth.saveAndOpenDocument，不自己写一份。
   */
  _openTransferForm: function(rid) {
    rid = String(rid || '').trim();
    if (!rid) return;
    wx.showLoading({ title: '加载中…' });
    springAuth.springRequestBinary('/api/cage-op/transfer-form/' + encodeURIComponent(rid), {
      errorMessage: '转移单加载失败',
      forbiddenMessage: '无权查看该转移单'
    }).then(function(res) {
      wx.hideLoading();
      return springAuth.saveAndOpenDocument(res.data, '转移单-' + rid + '.pdf', 'pdf');
    }).catch(function(err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '转移单加载失败', icon: 'none' });
    });
  },

  onViewTransferForm: function() {
    var mark = this.data.detailOpMark || {};
    this._openTransferForm(mark.requestId);
  },

  /** 本人一键认领（实验员为空且无认领记录时可用） */
  onSelfClaim: function() {
    var self = this;
    var cell = self.data.selectedCell;
    var cageId = cell ? String(cell.id || cell.animalCageId || '') : '';
    if (!cageId) return;
    self.setData({ detailClaiming: true });
    springAuth.springRequest({ url: '/api/cage-op/claim', method: 'POST', data: { animalCageId: cageId } }).then(function(res) {
      var p = unwrap(res);
      self.setData({ detailClaiming: false });
      if (!p.ok) { wx.showToast({ title: p.message || '认领失败', icon: 'none' }); return; }
      wx.showToast({ title: '已认领', icon: 'success' });
      self._closeDetail();
      self.onRetry();
    }).catch(function() {
      self.setData({ detailClaiming: false });
      wx.showToast({ title: '认领失败', icon: 'none' });
    });
  },

  /** 教职工代认领：复用选人弹窗（按笼位课题组预览成员） */
  onOpenClaimOnBehalf: function() {
    var names = this.data.detailGroupNames || [];
    this.setData({
      personPickerPurpose: 'claimOnBehalf',
      reservePersonOpen: true, reserveKeyword: '', reserveResults: [], reserveSearching: false,
      reserveGroups: names
    });
    this.previewReserveCandidates(names);
  },

  handleClaimOnBehalfConfirm: function(p) {
    var self = this;
    var cell = self.data.selectedCell;
    var cageId = cell ? String(cell.id || cell.animalCageId || '') : '';
    if (!cageId || !p || !p.accountId) return;
    self.setData({ detailClaiming: true });
    springAuth.springRequest({ url: '/api/cage-op/claim-on-behalf', method: 'POST', data: { animalCageId: cageId, accountId: p.accountId } }).then(function(res) {
      var r = unwrap(res);
      self.setData({ detailClaiming: false });
      if (!r.ok) { wx.showToast({ title: r.message || '代认领失败', icon: 'none' }); return; }
      var nm = (r.data && r.data.claimantName) || p.name;
      wx.showToast({ title: '已认领给 ' + nm, icon: 'success' });
      self._closeDetail();
      self.onRetry();
    }).catch(function() {
      self.setData({ detailClaiming: false });
      wx.showToast({ title: '代认领失败', icon: 'none' });
    });
  },

  /** 详情弹窗「清空划分」：只清单个笼位（不传 assigneeIds → 清空该笼位全部划分） */
  onClearDivision: function() {
    var self = this;
    var cell = self.data.selectedCell;
    var cageId = cell ? String(cell.id || cell.animalCageId || '') : '';
    if (!cageId || self.data.detailClearingDivision) return;
    self.setData({ detailClearingDivision: true });
    springAuth.springRequest({ url: '/api/cage-division/clear', method: 'POST', data: { animalCageIds: [cageId] } }).then(function(res) {
      var p = unwrap(res);
      self.setData({ detailClearingDivision: false });
      if (!p.ok) { wx.showToast({ title: p.message || '清空划分失败', icon: 'none' }); return; }
      wx.showToast({ title: '已清空划分', icon: 'success' });
      self._closeDetail();
      self.onRetry();
    }).catch(function(e) {
      self.setData({ detailClearingDivision: false });
      wx.showToast({ title: (e && e.message) || '清空划分失败', icon: 'none' });
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
      // 状态标记只对「饲养中/异常」开放（与 Web 管理端同一口径）：空笼位/等待分配没有动物可标记。
      var editCt = cageTypeOf(matched);
      if (editCt !== 3 && editCt !== 4) {
        wx.showToast({ title: '当前状态不可标记（仅饲养中/异常笼位）', icon: 'none' });
        return;
      }
      // 扫码路径同样要过学生归属闸门（与点击路径同口径）
      if (!self.data.isStaffView && !matched.mine) {
        wx.showToast({ title: '只能标记本人使用中的笼位', icon: 'none' });
        return;
      }
      // 扫码路径额外两道闸门，文案照抄 H5 `handleEditScan`(MobileCageShelfTab.tsx:2082-2088)
      if (self._pendingOpOf(matched)) {
        wx.showToast({ title: '该笼位有进行中的流程，不能标记饲养状态', icon: 'none' });
        return;
      }
      if (hasActiveClaim(matched.claimStatus)) {
        wx.showToast({ title: '该笼位有认领申请在处理中，不能标记饲养状态', icon: 'none' });
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

  /**
   * 「取消」退出当前模式 → 回查看模式。五个带横幅的模式共用（分配/预定/申请预约/划分/状态）。
   * 只有状态模式会把标记攒进 scanCache（那是准备写给服务端的东西），所以只有它会拦一下；
   * 选中类模式的选中集纯粹是本地缓冲区，丢弃无副作用，直接退。
   */
  onExitMode: function() {
    var self = this;
    var hasCache = self.data.scanCache && Object.keys(self.data.scanCache).length > 0;
    if (!hasCache) { self.switchMode('view'); return; }
    wx.showModal({
      title: '未提交修改',
      content: '有未提交的扫码修改，是否放弃？',
      confirmText: '放弃',
      cancelText: '继续编辑',
      success: function(res) { if (res.confirm) self.switchMode('view'); }
    });
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
        // 特殊饲养明细按项计差异（与动作同一口径，提交按钮上的数字才诚实）
        var dInit = entry.initialDetails || {};
        var dCurr = entry.currentDetails || {};
        Object.keys(dCurr).forEach(function (c) { if (!!dCurr[c] !== !!dInit[c]) totalDiffs++; });
        Object.keys(dInit).forEach(function (c) { if (!!dCurr[c] !== !!dInit[c]) totalDiffs++; });
      }
    }
    patch.scanTotalActions = totalDiffs;
    patch.scanCacheSize = Object.keys(cache).length;
    // 待选区：只列有变更的笼位，摘要把每个状态写成「需分笼 +1 · 健康异常 −1」
    var staged = [];
    for (var k in cache) {
      if (!Object.prototype.hasOwnProperty.call(cache, k)) continue;
      var e = cache[k];
      var pinit = (e && e.initialActions) || {};
      var pcur = (e && e.currentActions) || {};
      var parts = [];
      CAGE_STATUS_ACTIONS.forEach(function (a) {
        if (pcur[a.action] === pinit[a.action]) return;
        // 用单字缩写而非全名，胶囊才不会被撑长（分+1 异−1）
        parts.push(a.abbr + (pcur[a.action] ? '+1' : '−1'));
      });
      if (!parts.length) continue;
      staged.push({
        key: k,
        label: (e && e.cell && (e.cell._displayPosition || e.cell.position)) || k,
        meta: parts.join(' · ')
      });
    }
    patch.stagedItems = staged;
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
    /*
      整条缓存只在「动作 + 明细 + 严重程度」都没差异时才移除 —— 只看动作会把
      「只改了明细/严重程度」的条目整条丢掉，用户勾的子值就静默没了。
    */
    var e0 = newCache[key];
    var init = e0.initialActions;
    var cur = e0.currentActions;
    var sameAct = !CAGE_STATUS_ACTIONS.some(function (x) { return cur[x.action] !== init[x.action]; });
    var det0 = e0.initialDetails || {}, det1 = e0.currentDetails || {};
    var sameDet = Object.keys(det0).every(function (c) { return !!det0[c] === !!det1[c]; })
      && Object.keys(det1).every(function (c) { return !!det0[c] === !!det1[c]; });
    var sameSev = (e0.initialSeverity || '') === (e0.currentSeverity || '');
    if (sameAct && sameDet && sameSev) delete newCache[key];
    // 同步更新 editActionCurrent（弹窗内显示用）；明细/严重程度块的强绑定判据各跟自己的父状态位走
    var ec = newCache[key] ? Object.assign({}, newCache[key].currentActions) : cageStatus.newActionState();
    this.setData({
      scanCache: newCache,
      editActionCurrent: ec,
      editActionSfOn: !!ec.SPECIAL_BREEDING,
      editActionHaOn: !!ec.HEALTH_CHECK
    }, this.applyCacheToGrid.bind(this));
  },

  /**
   * 特殊饲养明细：勾/取消一项 → 入缓存，与状态动作同一套「暂存 → 提交」。
   * 明细项的选中态用 {item_code: true/false} 存（与动作那套同形，false 也算一个键，方便数差异）。
   */
  onDetailToggle: function(e) {
    var code = e.currentTarget.dataset.code;
    var cell = this.data.editActionCell;
    if (!cell || !code) return;
    var key = cell.x + ':' + cell.y;
    var cache = this.data.scanCache || {};
    var newCache = {};
    for (var k in cache) { if (Object.prototype.hasOwnProperty.call(cache, k)) newCache[k] = cache[k]; }
    if (!newCache[key]) {
      var initAct = this.data.editActionInitial || cageStatus.newActionState();
      var currAct = this.data.editActionCurrent || Object.assign({}, initAct);
      var initDet = this.data.editDetailInitial || {};
      newCache[key] = {
        cell: cell, code: '',
        initialActions: Object.assign({}, initAct), currentActions: Object.assign({}, currAct),
        initialDetails: Object.assign({}, initDet), currentDetails: Object.assign({}, initDet)
      };
    }
    var entry = newCache[key];
    if (!entry.initialDetails) entry.initialDetails = {};
    if (!entry.currentDetails) entry.currentDetails = Object.assign({}, entry.initialDetails);
    entry.currentDetails[code] = !entry.currentDetails[code];
    // 动作/明细/严重程度都没差 → 移除缓存条目（与 onEditActionToggle 同口径）
    var sameDet = Object.keys(entry.initialDetails).every(function (c) {
      return !!entry.currentDetails[c] === !!entry.initialDetails[c];
    }) && Object.keys(entry.currentDetails).every(function (c) {
      return !!entry.currentDetails[c] === !!entry.initialDetails[c];
    });
    var sameAct = CAGE_STATUS_ACTIONS.every(function (a) {
      return !!entry.currentActions[a.action] === !!entry.initialActions[a.action];
    });
    var sameSev = (entry.initialSeverity || '') === (entry.currentSeverity || '');
    if (sameDet && sameAct && sameSev) delete newCache[key];
    this.setData({
      scanCache: newCache,
      editDetailCurrent: Object.assign({}, entry.currentDetails)
    }, this.applyCacheToGrid.bind(this));
  },

  /**
   * 健康异常严重程度 + 瘙痒：一起落进缓存（严重程度**互斥单选**、瘙痒是布尔子值）。
   * 界面上勾选框画在每一档旁边（勾上 = 该档 + 瘙痒），所以两者一起写；
   * 三样（动作 / 明细 / 严重程度+瘙痒）都没差 → 移除缓存条目，别把子值差异丢了。
   */
  applySeverityValue: function(value, itchy) {
    var cell = this.data.editActionCell;
    if (!cell) return;
    var key = cell.x + ':' + cell.y;
    var cache = this.data.scanCache || {};
    var newCache = {};
    for (var k in cache) { if (Object.prototype.hasOwnProperty.call(cache, k)) newCache[k] = cache[k]; }
    if (!newCache[key]) {
      var initAct = this.data.editActionInitial || cageStatus.newActionState();
      var currAct = this.data.editActionCurrent || Object.assign({}, initAct);
      var initDet = this.data.editDetailInitial || {};
      newCache[key] = {
        cell: cell, code: '',
        initialActions: Object.assign({}, initAct), currentActions: Object.assign({}, currAct),
        initialDetails: Object.assign({}, initDet), currentDetails: Object.assign({}, initDet)
      };
    }
    var entry = newCache[key];
    if (entry.initialSeverity === undefined) entry.initialSeverity = this.data.editSeverityInitial || '';
    if (entry.initialItch === undefined) entry.initialItch = !!this.data.editItchInitial;
    entry.currentSeverity = value || '';
    entry.currentItch = !!itchy;
    var sameSev = (entry.currentSeverity || '') === (entry.initialSeverity || '');
    var sameItch = !!entry.currentItch === !!entry.initialItch;
    var d0 = entry.initialDetails || {}, d1 = entry.currentDetails || {};
    var sameDet = Object.keys(d0).every(function (c) { return !!d0[c] === !!d1[c]; })
      && Object.keys(d1).every(function (c) { return !!d0[c] === !!d1[c]; });
    var sameAct = CAGE_STATUS_ACTIONS.every(function (a) {
      return !!entry.currentActions[a.action] === !!entry.initialActions[a.action];
    });
    if (sameSev && sameItch && sameDet && sameAct) delete newCache[key];
    this.setData({
      scanCache: newCache,
      editSeverityCurrent: entry.currentSeverity,
      editItchCurrent: entry.currentItch
    }, this.applyCacheToGrid.bind(this));
  },

  /** 点档位本体：选中该档；再点同一档 = 连瘙痒一起清掉。 */
  onSeverityToggle: function(e) {
    var code = e.currentTarget.dataset.code;
    if (!code) return;
    var on = (this.data.editSeverityCurrent || '') === code;
    this.applySeverityValue(on ? '' : code, on ? false : !!this.data.editItchCurrent);
  },

  /** 点档位右上角的勾选框：勾上 = 该档 + 瘙痒；已是「该档 + 瘙痒」再点 = 只取消瘙痒。 */
  onSeverityItchToggle: function(e) {
    var code = e.currentTarget.dataset.code;
    if (!code) return;
    var on = (this.data.editSeverityCurrent || '') === code && !!this.data.editItchCurrent;
    this.applySeverityValue(code, !on);
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
    }).then(function(res2) {
      // 业务错误是 HTTP 200 + {success:false}，不解包会把「被服务端拦下」显示成「已保存」
      var up2 = unwrap(res2);
      if (!up2.ok) { wx.showToast({ title: up2.message || '保存失败', icon: 'none' }); return; }
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
    }).then(function(res2) {
      // 业务错误是 HTTP 200 + {success:false}，不解包会把「被服务端拦下」显示成「已归档」
      var up2 = unwrap(res2);
      if (!up2.ok) { wx.showToast({ title: up2.message || '保存失败', icon: 'none' }); return; }
      // 清空表单 + 刷新历史
      self.setData({ editActionPhotos: [], editActionNote: '' });
      if (animalCageId) {
        springAuth.springRequest({ url: '/api/local/history/' + animalCageId, method: 'GET', data: {} }).then(function(hres) {
          var hp = unwrap(hres);
          var list = (hp.ok ? hp.data : []) || [];
          self.setData({ editHistory: normalizeStatusHistory(list) });
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

  onSubmitScanActions: function() {
    var self = this;
    var cache = self.data.scanCache || {};
    var addEntries = [];
    var removeEntries = [];
    var detailTasks = [];
    for (var key in cache) {
      if (Object.prototype.hasOwnProperty.call(cache, key)) {
        var e = cache[key];
        var init = e.initialActions || {};
        var curr = e.currentActions || {};
        CAGE_STATUS_ACTIONS.forEach(function (a) {
          if (curr[a.action] && !init[a.action]) addEntries.push({ key: key, code: e.code, action: a.action, cell: e.cell });
          if (!curr[a.action] && init[a.action]) removeEntries.push({ key: key, code: e.code, action: a.action, cell: e.cell });
        });
        // 特殊饲养明细：有差异就整体覆盖写一次（只带「当前为真」的项）
        var dInit = e.initialDetails || {};
        var dCurr = e.currentDetails || {};
        var changedDet = false, codes = [];
        Object.keys(dCurr).forEach(function (c) {
          if (!!dCurr[c]) codes.push(c);
          if (!!dCurr[c] !== !!dInit[c]) changedDet = true;
        });
        Object.keys(dInit).forEach(function (c) { if (!!dInit[c] !== !!dCurr[c]) changedDet = true; });
        if (changedDet) {
          detailTasks.push({ kind: 'detail', canonical: SPECIAL_DETAIL_CANONICAL, cell: e.cell, itemCodes: codes });
        }
        // 健康异常严重程度：互斥单选，有差异就整体覆盖写一次（空数组 = 清空）
        var sInit = e.initialSeverity || '';
        var sCurr = e.currentSeverity || '';
        if (sCurr !== sInit) {
          detailTasks.push({ kind: 'detail', canonical: HEALTH_SEVERITY_CANONICAL, cell: e.cell,
            itemCodes: sCurr ? [sCurr] : [] });
        }
        // 瘙痒（布尔子值）：有差异就整体覆盖写一次（['1'] = 打勾、[] = 取消）
        if (!!e.currentItch !== !!e.initialItch) {
          detailTasks.push({ kind: 'detail', canonical: HEALTH_ITCH_CANONICAL, cell: e.cell,
            itemCodes: e.currentItch ? [HEALTH_ITCH_TRUE] : [] });
        }
      }
    }
    if (addEntries.length === 0 && removeEntries.length === 0 && detailTasks.length === 0) return;

    self.setData({ actionSubmitting: true });
    var okCount = 0, failCount = 0, lastErr = '';
    var totalTasks = detailTasks.concat(addEntries, removeEntries.map(function(r) {
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
          wx.showToast({ title: lastErr || (okCount + ' 成功 / ' + failCount + ' 失败'), icon: 'none', duration: 3000 });
        }
        return;
      }
      var entry = totalTasks[idx];
      var cageId = String(entry.cell.id || (entry.cell.animalCageId) || '');
      var req;
      if (entry.kind === 'detail') {
        // 状态子值（特殊饲养明细多选 / 健康异常严重程度单选）：整体覆盖
        // （itemCodes 里只带当前为真的项；空数组 = 清空；canonical 由任务带下来）
        req = springAuth.springRequest({
          url: '/api/local/status-detail', method: 'POST',
          data: { animalCageId: cageId, canonical: entry.canonical, itemCodes: entry.itemCodes || [] }
        });
      } else {
        var toggle = cageStatus.statusField(entry.action);
        var enable = !entry.cancel;
        req = springAuth.springRequest({
          url: '/api/local/edit', method: 'POST',
          data: { animalCageId: cageId, toggle: toggle, enable: enable, cageBoxCode: entry.code || '' }
        });
      }
      req.then(function(res) {
          // 业务错误是 HTTP 200 + {success:false}（服务端拦中间态就是这种），解包后再计数并留原因
          var p = unwrap(res);
          if (p.ok) { okCount++; } else { failCount++; if (!lastErr) lastErr = p.message || ''; }
          next(idx + 1);
        }).catch(function() { failCount++; next(idx + 1); });
    };
    next(0);
  }
});
