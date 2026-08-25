/**
 * 笼位关键信息表单（统一表单系统 cage_detail）的纯展示逻辑。
 * 与 frontend/src/features/cage-shelf/components/CageFormFill.tsx 的只读分支对齐。
 *
 * 单独成文件是为了能脱离小程序运行时跑自检：`node utils/cageForm.js`。
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

module.exports = {
  CAGE_FORM_KEY: CAGE_FORM_KEY,
  flattenTemplateFields: flattenTemplateFields,
  formatFormValue: formatFormValue,
  buildCodelistDict: buildCodelistDict,
  buildFormRows: buildFormRows
};

/* ------------------------------ 自检 ------------------------------ */
/* 小程序运行时没有 require.main，这段只在 `node utils/cageForm.js` 时执行。 */
if (typeof require !== 'undefined' && require.main === module) {
  var assert = require('assert');

  // 平铺：subsection 字段与 section 直挂字段都要收，顺序为 先 subsection 后直挂
  var tpl = {
    sections: [
      {
        code: 'D1',
        subsections: [{ code: 'S1', fields: [{ fieldId: 1, canonical: 'pi_name', label: 'PI' }] }],
        fields: [{ fieldId: 2, canonical: 'aup_number', label: 'AUP' }]
      },
      { code: 'D2', fields: [{ fieldId: 3, canonical: 'animal_sex', label: '性别', dictKey: 'sex' }] }
    ]
  };
  var fields = flattenTemplateFields(tpl);
  assert.deepStrictEqual(fields.map(function (f) { return f.fieldId; }), [1, 2, 3]);

  // 结构缺失不应抛错，返回空表（历史上这类静默空会伪装成「表单无字段」）
  assert.deepStrictEqual(flattenTemplateFields(null), []);
  assert.deepStrictEqual(flattenTemplateFields({}), []);
  assert.deepStrictEqual(flattenTemplateFields({ sections: [{}, { subsections: [{}] }] }), []);

  // 码表查表
  var dict = buildCodelistDict([{ key: 'sex', items: [{ itemCode: 'M', itemLabel: '雄' }] }]);
  assert.strictEqual(dict.sex.M, '雄');

  // 值格式化
  assert.strictEqual(formatFormValue({ dictKey: 'sex' }, 'M', dict), '雄');
  assert.strictEqual(formatFormValue({ dictKey: 'sex' }, 'X', dict), 'X', '码表缺项回落原值');
  assert.strictEqual(formatFormValue({ fieldType: 'checkbox' }, 1, dict), '是');
  assert.strictEqual(formatFormValue({ fieldType: 'checkbox' }, false, dict), '否');
  assert.strictEqual(formatFormValue({}, '', dict), '—');
  assert.strictEqual(formatFormValue({}, null, dict), '—');
  assert.strictEqual(formatFormValue({}, 0, dict), '0', '数字 0 是有效值，不能当空');

  // 合并：没有值的字段也出现在表里（与 H5 一致，缺值显示 —）
  var rows = buildFormRows(fields, [{ canonical: 'pi_name', value: '张三' }], dict);
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(rows[0], { key: 1, label: 'PI', value: '张三' });
  assert.strictEqual(rows[1].value, '—');

  console.log('cageForm self-check OK');
}
