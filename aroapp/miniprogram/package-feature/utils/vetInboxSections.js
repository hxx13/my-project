/**
 * 兽医收件箱的纯计算部分：消息归一化 + 「待查看 / 已查看」两段分组。
 * 抽出来是为了能单独跑 check（tests/vetInboxSections.test.js）—— 组件那边只管取数与事件。
 *
 * 布局口径（用户 2026-09-19 定）：待查看段默认展开、已查看段默认折叠；段内再按笼架分组，
 * 组一律默认展开（折叠闸门只留「段」一层，组头仍可单独点收）。消息一多时，
 * 要处理的自然浮在上面，翻过的自然沉下去。
 */
var { CAGE_TYPE_LABEL } = require('./cageCellVisual.js');

/** 与 Web/H5 网格那圈紫色描边同色 */
var UNREAD_COLOR = '#a855f7';

/** 状态标签配色：与网格图例同一套；明细状态码（SF_ 前缀）归到「特殊饲养」那一色 */
var STATUS_COLOR = {
  COHABITATION: '#10b981',
  SPECIAL_FEEDING: '#ef4444',
  NEED_DIVIDE: '#eab308',
  HEALTH_ABNORMAL: '#a855f7',
  ANIMAL_TRANSFER: '#06b6d4',
};

function statusColor(code) {
  var c = String(code || '');
  if (STATUS_COLOR[c]) return STATUS_COLOR[c];
  return c.indexOf('SF_') === 0 ? STATUS_COLOR.SPECIAL_FEEDING : '#94a3b8';
}

function nonEmpty(x) {
  return x != null && String(x).trim() !== '';
}

/**
 * 「基本信息」六项：位置 / 笼盒编号 / AUP 注册号 / 课题组 / 实验员 / 笼位状态。
 * 空值直接不出现 —— 用户 2026-09-18 口径：要基本信息 + 当前实际状态，
 * 不是把整张表单字段（含一堆 false）铺出来。长值跨满两列。
 */
function buildBasicRows(m) {
  var loc = [m.campusName, m.floorName, m.roomName].filter(nonEmpty).join(' · ');
  var pairs = [
    ['位置', loc],
    ['笼盒编号', m.cageBoxCode],
    ['AUP 注册号', m.aupNumber],
    ['课题组', m.projectPiName],
    ['实验员', m.experimenterName],
    // 笼位类型复用网格那套标签，去掉括号（这里是「标签：值」的表述）
    ['笼位状态', m.cageTypeCode != null ? String(CAGE_TYPE_LABEL[m.cageTypeCode] || '').replace(/[()]/g, '') : ''],
  ];
  return pairs
    .filter(function (p) { return nonEmpty(p[1]); })
    .map(function (p) {
      var v = String(p[1]);
      return { label: p[0], value: v, wide: v.length > 12 };
    });
}

function fmtTime(v) {
  if (!v) return '';
  return String(v).replace('T', ' ').slice(0, 16);
}

/** 状态照片按状态分桶存（{action: [url]}），取详情的这一份就够用 */
function flattenStatusPhotos(raw) {
  if (!raw) return [];
  var sp = raw;
  if (typeof sp === 'string') {
    try {
      sp = JSON.parse(sp);
    } catch (e) {
      return [];
    }
  }
  if (!sp || typeof sp !== 'object') return [];
  var out = [];
  for (var k in sp) {
    if (Object.prototype.hasOwnProperty.call(sp, k) && Array.isArray(sp[k])) out = out.concat(sp[k]);
  }
  return out.filter(function (u) {
    return typeof u === 'string' && u;
  });
}

/** 清单/详情里直接要用的派生字段，一次算好 —— WXML 里不能调函数 */
function normalizeMessage(m) {
  var statuses = (m.statuses || []).map(function (s) {
    return {
      code: s.code,
      color: statusColor(s.code),
      // 健康异常那片顺带把严重程度带上（「健康异常·中度」）
      text: s.code === 'HEALTH_ABNORMAL' && m.healthSeverityLabel ? s.label + '·' + m.healthSeverityLabel : s.label,
    };
  });
  var hasHealth = statuses.some(function (s) { return s.code === 'HEALTH_ABNORMAL'; });
  var chips = statuses.slice();
  // 严重程度/瘙痒单独留着时也算「有状态」（健康异常关了但值还写着）
  if (!hasHealth && nonEmpty(m.healthSeverityLabel)) {
    chips.push({ code: '_SEV', color: statusColor('HEALTH_ABNORMAL'), text: '健康异常·' + m.healthSeverityLabel });
  }
  if (m.healthItch) {
    chips.push({ code: '_ITCH', color: statusColor('HEALTH_ABNORMAL'), text: '瘙痒' });
  }
  var adviceImages = Array.isArray(m.adviceImages) ? m.adviceImages : [];
  return Object.assign({}, m, {
    // 行键一律走字符串：id 是后端自增/雪花号，dataset 往返不保证还是数字
    _rid: String(m.id),
    posText: m.positionLabel || '—',
    statusDot: statusColor(m.statusCode),
    statusText: m.statusLabel || '',
    timeText: fmtTime(m.firedAt),
    whoText: m.projectPiName || m.experimenterName || '',
    hasAdvice: nonEmpty(m.adviceText) || adviceImages.length > 0,
    adviceImages: adviceImages,
    basicRows: buildBasicRows(m),
    chips: chips,
    read: m.read === true,
  });
}

/** 分组键：校区|楼层|房间|笼架，名字缺了也用空串占位，保证同一条消息键稳定 */
function groupKeyOf(m) {
  return [m.campusName, m.floorName, m.roomName, m.shelveName]
    .map(function (x) { return x == null ? '' : String(x); })
    .join('|');
}

function groupLocOf(m) {
  return [m.campusName, m.floorName, m.roomName].filter(nonEmpty).join(' · ') || '位置未标注';
}

/**
 * 筛选轴：按「回没回指导意见」分，与「段」的已读/未读是两条独立轴 ——
 * 可以看完还没回（待回意见），也可以没点已查看就先回了（已回意见）。
 */
var INBOX_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待回意见' },
  { key: 'replied', label: '已回意见' },
];

function matchesFilter(m, filterKey) {
  if (filterKey === 'replied') return m.hasAdvice === true;
  if (filterKey === 'pending') return m.hasAdvice !== true;
  return true;
}

/** 搜索命中的字段（与 Web 端 VetInboxModal 的 haystack 保持一致，两边同一个口径） */
var KEYWORD_FIELDS = [
  'positionLabel', 'shelveName', 'roomName', 'floorName', 'campusName',
  'projectPiName', 'experimenterName', 'aupNumber', 'cageBoxCode', 'statusLabel',
];

function matchesKeyword(m, keyword) {
  var k = keyword == null ? '' : String(keyword).trim().toLowerCase();
  if (!k) return true;
  for (var i = 0; i < KEYWORD_FIELDS.length; i += 1) {
    var v = m[KEYWORD_FIELDS[i]];
    if (v != null && String(v).toLowerCase().indexOf(k) >= 0) return true;
  }
  return false;
}

/** 各筛选下的条数（跟着关键字走，筛完只剩 0 的按钮自己就说明白了） */
function filterCounts(msgs, keyword) {
  var counts = { all: 0, pending: 0, replied: 0 };
  (msgs || []).forEach(function (m) {
    if (!matchesKeyword(m, keyword)) return;
    counts.all += 1;
    if (m.hasAdvice) counts.replied += 1;
    else counts.pending += 1;
  });
  return counts;
}

var SECTIONS = [
  { key: 'unread', title: '待查看', bar: UNREAD_COLOR, defOpen: true },
  { key: 'read', title: '已查看', bar: '#cbd5e1', defOpen: false },
];

/**
 * 消息列表 → 两段（待查看/已查看），段内按笼架分组，空段不出现。
 * @param msgs 已 normalize 的消息
 * @param isOpen (path, def) => bool，折叠状态由调用方记（放内存，别塞进 data 的动态键路径）
 * @param filterKey 'all' | 'pending' | 'replied'
 * @param keyword 关键字，空格串等于不筛
 */
function buildSections(msgs, isOpen, filterKey, keyword) {
  var open = isOpen || function (_p, def) { return def; };
  var list = (msgs || []).filter(function (m) {
    return matchesFilter(m, filterKey) && matchesKeyword(m, keyword);
  });
  var out = [];
  SECTIONS.forEach(function (def) {
    var items = list.filter(function (m) {
      return def.key === 'unread' ? !m.read : m.read;
    });
    if (!items.length) return;
    var byKey = {};
    var groups = [];
    items.forEach(function (m) {
      var k = groupKeyOf(m);
      if (!byKey[k]) {
        byKey[k] = {
          key: k,
          name: m.shelveName || '未命名笼架',
          loc: groupLocOf(m),
          count: 0,
          items: [],
        };
        groups.push(byKey[k]);
      }
      byKey[k].count += 1;
      byKey[k].items.push(m);
    });
    // 组默认展开：折叠闸门只放「段」一层。段展开却空空如也（组还收着）是个死胡同，
    // 而段本身默认收起已经挡住了「历史消息太多」。
    groups.forEach(function (g) {
      g.open = open('grp:' + def.key + ':' + g.key, true);
    });
    out.push({
      key: def.key,
      title: def.title,
      bar: def.bar,
      count: items.length,
      open: open('sec:' + def.key, def.defOpen),
      groups: groups,
    });
  });
  return out;
}

module.exports = {
  UNREAD_COLOR: UNREAD_COLOR,
  STATUS_COLOR: STATUS_COLOR,
  SECTIONS: SECTIONS,
  INBOX_FILTERS: INBOX_FILTERS,
  KEYWORD_FIELDS: KEYWORD_FIELDS,
  statusColor: statusColor,
  fmtTime: fmtTime,
  buildBasicRows: buildBasicRows,
  flattenStatusPhotos: flattenStatusPhotos,
  normalizeMessage: normalizeMessage,
  groupKeyOf: groupKeyOf,
  groupLocOf: groupLocOf,
  matchesFilter: matchesFilter,
  matchesKeyword: matchesKeyword,
  filterCounts: filterCounts,
  buildSections: buildSections,
};
