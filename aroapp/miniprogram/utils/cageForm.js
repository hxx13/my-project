/**
 * 笼位关键信息表单（统一表单系统 cage_detail）的纯展示逻辑。
 * 与 frontend/src/features/cage-shelf/components/CageFormFill.tsx 的只读分支对齐。
 */

/** 组合模板 formKey，对齐 frontend/src/features/cage-shelf/cageFormConstants.ts */
var CAGE_FORM_KEY = 'cage_detail';

/**
 * 把模板三级结构（section → subsection → field）平铺成带归属的字段列表。
 * 一个 section 既可能挂 subsections，也可能直接挂 fields，两者都要收。
 * 保留 section/subsection 供弹窗分组渲染 —— 与 H5 CageFormFill.flattenFields 同形，
 * 两端都靠它拿分组，改这里必须同步改那边。
 */
function flattenTemplateFields(template) {
  var out = [];
  var sections = (template && template.sections) || [];
  for (var i = 0; i < sections.length; i++) {
    var s = sections[i] || {};
    var subs = s.subsections || [];
    for (var j = 0; j < subs.length; j++) {
      var sub = subs[j] || {};
      var subFields = sub.fields || [];
      for (var k = 0; k < subFields.length; k++) {
        out.push({ section: s, subsection: sub, field: subFields[k] });
      }
    }
    var ownFields = s.fields || [];
    for (var m = 0; m < ownFields.length; m++) {
      out.push({ section: s, subsection: null, field: ownFields[m] });
    }
  }
  return out;
}

/** 只读展示值：码表字段映射成 label，布尔转是/否，空值统一 — */
function formatFormValue(field, value, dict) {
  if (value === null || value === undefined) return '—';
  // 纯空白也算空：数据里出现过 ' ' 这种值，直接显示会是一片看不见的空白
  if (typeof value === 'string' && value.trim() === '') return '—';
  var ft = field.fieldType || (field.dictKey ? 'select' : 'text');
  if (ft === 'checkbox') return (value === true || value === 1 || value === '1') ? '是' : '否';
  if (field.dictKey && dict && dict[field.dictKey]) {
    var label = dict[field.dictKey][String(value)];
    if (label) return label;
  }
  return String(value);
}

/** 码表接口返回的 items 转成 {itemCode: itemLabel} 查表 */
function buildCodelistDict(lists) {
  var dict = {};
  (lists || []).forEach(function (l) {
    var map = {};
    ((l && l.items) || []).forEach(function (it) { map[String(it.itemCode)] = it.itemLabel; });
    dict[l.key] = map;
  });
  return dict;
}

/** 模板字段 + 值接口返回行 → 弹窗展示行 */
function buildFormRows(fields, valueRows, dict) {
  var byCanonical = {};
  (valueRows || []).forEach(function (r) { byCanonical[r.canonical] = r.value; });
  return (fields || []).map(function (f) {
    return {
      key: f.fieldId,
      label: f.label || f.canonical,
      value: formatFormValue(f, byCanonical[f.canonical], dict)
    };
  });
}

/**
 * 可编辑行：在只读行基础上补编辑态需要的元数据（fieldId/canonical/dataType/可编辑标记/原始值/码表选项）。
 * 与 Web 端 CageFormFill 同源：能否编辑只看字段快照的 editable。
 */
/** 单个字段 → 可编辑行。initRaw 留作脏值基准，raw 与它不等即视为「本次改过」。 */
function buildRow(f, byCanonical, dict) {
  var raw = byCanonical[f.canonical];
  var initRaw = (raw === undefined || raw === null) ? '' : raw;
  var ft = f.fieldType || (f.dictKey ? 'select' : 'text');
  var options = [];
  var map = f.dictKey && dict ? dict[f.dictKey] : null;
  if (map) {
    for (var code in map) {
      if (Object.prototype.hasOwnProperty.call(map, code)) options.push({ value: code, label: map[code] });
    }
  }
  return {
    key: f.fieldId,
    fieldId: f.fieldId,
    canonical: f.canonical,
    label: f.label || f.canonical,
    dataType: f.dataType || 'STRING',
    fieldType: ft,
    editable: !!f.editable,
    required: f.required === 'YES',
    value: formatFormValue(f, raw, dict),
    raw: initRaw,
    initRaw: initRaw,
    options: options,
    _dirty: false,
    _error: ''
  };
}

function indexValues(valueRows) {
  var byCanonical = {};
  (valueRows || []).forEach(function (r) { byCanonical[r.canonical] = r.value; });
  return byCanonical;
}

/** 扁平行列表（模板字段数组直接传入，不经过 flattenTemplateFields） */
function buildEditableFormRows(fields, valueRows, dict) {
  var byCanonical = indexValues(valueRows);
  return (fields || []).map(function (f) { return buildRow(f, byCanonical, dict); });
}

/**
 * 带分组的表单树：弹窗按「模板分区」渲染，而不是一条长列表。
 * 返回值两份：
 *   groups — 嵌套结构，驱动查看弹窗（section → subsection → rows）
 *   rows   — 扁平副本，扫码确认弹窗仍按平铺渲染，保持它不受影响
 * 模板没有 sections（扁平模板）时退化成单个分组，行为与之前一致。
 */
function buildFormTree(entries, valueRows, dict) {
  var byCanonical = indexValues(valueRows);
  var groups = [];
  var rows = [];
  var byKey = {};

  (entries || []).forEach(function (e) {
    var s = (e && e.section) || {};
    var skey = String(s.code || s.label || 'default');
    var g = byKey[skey];
    if (!g) {
      g = {
        key: skey,
        title: s.label || s.code || '关键信息',
        subs: [],
        count: 0,
        dirtyCount: 0,
        collapsed: false,
        _subByKey: {}
      };
      byKey[skey] = g;
      groups.push(g);
    }
    var sub = e.subsection;
    var subKey = sub ? String(sub.code || sub.label || 'sub') : '__own';
    var target = g._subByKey[subKey];
    if (!target) {
      target = { key: subKey, title: sub ? (sub.label || sub.code || '') : '', rows: [] };
      g._subByKey[subKey] = target;
      g.subs.push(target);
    }
    var row = buildRow((e && e.field) || {}, byCanonical, dict);
    target.rows.push(row);
    rows.push(row);
    g.count++;
  });

  groups.forEach(function (g) {
    delete g._subByKey;
    // 单个无标题子模块：不画小标题，直接铺行
    if (g.subs.length === 1 && !g.subs[0].title) g.subs[0]._plain = true;
  });

  return { groups: groups, rows: rows };
}

/** 分区字段数超过这个值就默认收起 —— 打开弹窗时高度可控。调密度就调这一个常量。 */
var SECTION_AUTO_EXPAND_MAX = 8;

/**
 * 无条件默认收起的分区，按 section 的 code 或 label 匹配。
 * 用于「状态标记」「动物信息」这类查阅频率低、篇幅又占位的分区 —— 光靠字段数阈值区分不出来
 * （它俩字段数可能和主要分区一样多）。改这里即可，不需要动数据库。
 * 注意：按名字匹配，后台改了分区名就要同步改这里。
 */
var DEFAULT_COLLAPSED_SECTIONS = ['状态标记', '动物信息'];

/** 布尔字段的宽松真值：'' / '0' / 'false' / false 都算 false */
function truthyScalar(v) {
  if (v === true || v === 1) return true;
  var s = String(v === null || v === undefined ? '' : v).toLowerCase();
  return s !== '' && s !== '0' && s !== 'false';
}

/**
 * 该行是否被本次编辑改过。布尔字段按真值比，避免「本来是空、开关拨到关」被误判为改动。
 */
function isRowDirty(row) {
  if (!row || !row.editable) return false;
  if (row.fieldType === 'checkbox') return truthyScalar(row.raw) !== truthyScalar(row.initRaw);
  var a = row.raw === null || row.raw === undefined ? '' : String(row.raw);
  var b = row.initRaw === null || row.initRaw === undefined ? '' : String(row.initRaw);
  return a !== b;
}

/** 重算所有行的 _dirty 与分组的 dirtyCount（收起的分区靠它挂红色计数，否则会盲存） */
function refreshDirty(groups) {
  (groups || []).forEach(function (g) {
    var n = 0;
    (g.subs || []).forEach(function (sub) {
      (sub.rows || []).forEach(function (r) {
        r._dirty = isRowDirty(r);
        if (r._dirty) n++;
      });
    });
    g.dirtyCount = n;
  });
  return groups;
}

/**
 * 默认展开规则：字段数 > maxExpanded 的收起；命中 DEFAULT_COLLAPSED_SECTIONS 的也收起。
 * 有改动计数的分区强制展开，避免把待保存的改动藏起来。
 */
function applyDefaultCollapse(groups, maxExpanded) {
  var max = maxExpanded === undefined ? SECTION_AUTO_EXPAND_MAX : maxExpanded;
  (groups || []).forEach(function (g) {
    var forced = DEFAULT_COLLAPSED_SECTIONS.indexOf(g.key) >= 0 ||
                 DEFAULT_COLLAPSED_SECTIONS.indexOf(g.title) >= 0;
    g.collapsed = (g.dirtyCount > 0) ? false : (forced || (g.count || 0) > max);
  });
  return groups;
}

/** 保存前校验：只查「可编辑 + 必填 + 空值」。不可编辑的必填字段用户改不了，校验它会把人卡死。 */
function validateGroups(groups) {
  var errors = [];
  (groups || []).forEach(function (g, gi) {
    (g.subs || []).forEach(function (sub, si) {
      (sub.rows || []).forEach(function (r, ri) {
        r._error = '';
        if (!r.editable || !r.required) return;
        var empty = r.fieldType === 'checkbox' ? false : (r.raw === '' || r.raw === null || r.raw === undefined);
        if (empty) {
          r._error = '请填写' + (r.label || '该项');
          errors.push({ gi: gi, si: si, ri: ri, label: r.label });
        }
      });
    });
  });
  return errors;
}

/** 收集要提交的值：只提交有改动且可编辑的行 */
function changedValues(groups) {
  var out = [];
  (groups || []).forEach(function (g) {
    (g.subs || []).forEach(function (sub) {
      (sub.rows || []).forEach(function (r) {
        if (!r.editable || !r.fieldId || !isRowDirty(r)) return;
        out.push({ fieldId: r.fieldId, dataType: r.dataType, raw: r.raw });
      });
    });
  });
  return out;
}

/** 取消编辑：把 raw 还原到 initRaw，清掉脏值与错误 */
function revertGroups(groups) {
  (groups || []).forEach(function (g) {
    (g.subs || []).forEach(function (sub) {
      (sub.rows || []).forEach(function (r) {
        r.raw = r.initRaw;
        r._dirty = false;
        r._error = '';
      });
    });
    g.dirtyCount = 0;
  });
  return groups;
}

/**
 * 收起态的行尾摘要：取分区内前 max 个「有值」的字段，拼成「标签 值 · 标签 值」。
 * 折叠最怕变成「藏起来」——有这条摘要，扫一眼就知道要不要展开。
 */
function summarizeGroups(groups, max) {
  var limit = max === undefined ? 2 : max;
  (groups || []).forEach(function (g) {
    var parts = [];
    (g.subs || []).forEach(function (sub) {
      (sub.rows || []).forEach(function (r) {
        if (parts.length >= limit) return;
        var v = r.value;
        if (v === null || v === undefined || v === '' || v === '—') return;
        parts.push({ label: r.label, value: String(v) });
      });
    });
    g.summary = parts;
    g.summaryText = parts.map(function (p) { return p.label + ' ' + p.value; }).join(' · ');
  });
  return groups;
}

/** 提交给后端的值：按 dataType 归一（整数/小数→数字，布尔→bool，其余→字符串，空→null） */
function toApiValue(dataType, v) {
  var dt = String(dataType || '').toUpperCase();
  if (dt === 'INTEGER' || dt === 'DECIMAL') {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }
  if (dt === 'BOOLEAN') return !!v;
  return (v === '' || v === null || v === undefined) ? null : v;
}

module.exports = {
  CAGE_FORM_KEY: CAGE_FORM_KEY,
  SECTION_AUTO_EXPAND_MAX: SECTION_AUTO_EXPAND_MAX,
  DEFAULT_COLLAPSED_SECTIONS: DEFAULT_COLLAPSED_SECTIONS,
  flattenTemplateFields: flattenTemplateFields,
  formatFormValue: formatFormValue,
  buildCodelistDict: buildCodelistDict,
  buildFormRows: buildFormRows,
  buildEditableFormRows: buildEditableFormRows,
  buildFormTree: buildFormTree,
  isRowDirty: isRowDirty,
  refreshDirty: refreshDirty,
  applyDefaultCollapse: applyDefaultCollapse,
  validateGroups: validateGroups,
  changedValues: changedValues,
  revertGroups: revertGroups,
  summarizeGroups: summarizeGroups,
  toApiValue: toApiValue
};
