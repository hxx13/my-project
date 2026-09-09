/**
 * 笼位关键信息表单（统一表单系统 cage_detail）的纯展示逻辑。
 * 与 frontend/src/features/cage-shelf/components/CageFormFill.tsx 的只读分支对齐。
 */

/** 组合模板 formKey，对齐 frontend/src/features/cage-shelf/cageFormConstants.ts */
var CAGE_FORM_KEY = 'cage_detail';

/**
 * 把模板三级结构（section → subsection → field）平铺成字段列表。
 * 一个 section 既可能挂 subsections，也可能直接挂 fields，两者都要收。
 */
function flattenTemplateFields(template) {
  var out = [];
  var sections = (template && template.sections) || [];
  for (var i = 0; i < sections.length; i++) {
    var s = sections[i] || {};
    var subs = s.subsections || [];
    for (var j = 0; j < subs.length; j++) {
      var subFields = (subs[j] || {}).fields || [];
      for (var k = 0; k < subFields.length; k++) out.push(subFields[k]);
    }
    var ownFields = s.fields || [];
    for (var m = 0; m < ownFields.length; m++) out.push(ownFields[m]);
  }
  return out;
}

/** 只读展示值：码表字段映射成 label，布尔转是/否，空值统一 — */
function formatFormValue(field, value, dict) {
  if (value === null || value === undefined || value === '') return '—';
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
function buildEditableFormRows(fields, valueRows, dict) {
  var byCanonical = {};
  (valueRows || []).forEach(function (r) { byCanonical[r.canonical] = r.value; });
  return (fields || []).map(function (f) {
    var raw = byCanonical[f.canonical];
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
      raw: (raw === undefined || raw === null) ? '' : raw,
      options: options
    };
  });
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
  flattenTemplateFields: flattenTemplateFields,
  formatFormValue: formatFormValue,
  buildCodelistDict: buildCodelistDict,
  buildFormRows: buildFormRows,
  buildEditableFormRows: buildEditableFormRows,
  toApiValue: toApiValue
};
