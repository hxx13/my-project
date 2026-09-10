// scripts/check-cage-form-tree.mjs
//
// 笼位表单分组构建的可运行自检（buildFormTree / flattenTemplateFields）。
// 纯函数、零依赖，是这块逻辑唯一的回归防线：分组错了弹窗会整片错位，
// 但 WXML 不会报错，只能靠这里挡住。
//
// 用法: node scripts/check-cage-form-tree.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  flattenTemplateFields, buildFormTree, buildEditableFormRows,
  isRowDirty, refreshDirty, applyDefaultCollapse, validateGroups,
  changedValues, revertGroups, SECTION_AUTO_EXPAND_MAX,
} = require(join(here, '..', 'aroapp', 'miniprogram', 'utils', 'cageForm.js'));

let passed = 0;
const it = (name, fn) => {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
};

const f = (canonical, extra = {}) => ({
  fieldId: 'id-' + canonical, canonical, label: canonical.toUpperCase(),
  fieldType: 'text', editable: true, ...extra,
});

console.log('flattenTemplateFields');
it('保留 section / subsection 归属', () => {
  const tpl = {
    sections: [
      { code: 'basic', label: '基本信息', subsections: [
        { code: 'own', label: '归属', fields: [f('pi'), f('aup')] },
      ], fields: [f('strain')] },
    ],
  };
  const flat = flattenTemplateFields(tpl);
  assert.equal(flat.length, 3);
  assert.equal(flat[0].section.code, 'basic');
  assert.equal(flat[0].subsection.code, 'own');
  assert.equal(flat[0].field.canonical, 'pi');
  assert.equal(flat[2].subsection, null, 'section 直挂的字段 subsection 应为 null');
  assert.equal(flat[2].field.canonical, 'strain');
});

console.log('buildFormTree · 分组');
it('按 section 分组、subsections 建子分组、count 正确', () => {
  const tpl = {
    sections: [
      { code: 'basic', label: '基本信息', subsections: [
        { code: 'own', label: '归属', fields: [f('pi'), f('aup')] },
        { code: 'animal', label: '动物', fields: [f('strain')] },
      ], fields: [f('box')] },
      { code: 'feed', label: '饲养管理', fields: [f('diet')] },
    ],
  };
  const { groups, rows } = buildFormTree(flattenTemplateFields(tpl), [], {});
  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, '基本信息');
  assert.equal(groups[0].count, 4);
  assert.equal(groups[0].subs.length, 3, '2 个子模块 + 1 个 section 直挂桶');
  assert.deepEqual(groups[0].subs.map((s) => s.rows.length), [2, 1, 1]);
  assert.equal(groups[1].title, '饲养管理');
  assert.equal(groups[1].count, 1);
  assert.equal(rows.length, 5, '扁平副本长度 = 各分组之和');
});

it('rows 与 groups 里是同一批行对象（扁平副本不是深拷贝）', () => {
  const tpl = { sections: [{ code: 'a', label: 'A', fields: [f('x'), f('y')] }] };
  const { groups, rows } = buildFormTree(flattenTemplateFields(tpl), [], {});
  assert.equal(rows[0], groups[0].subs[0].rows[0]);
  assert.equal(rows[1], groups[0].subs[0].rows[1]);
});

it('单个无标题子模块标记 _plain（不画小标题）', () => {
  const tpl = { sections: [{ code: 'a', label: 'A', fields: [f('x')] }] };
  const { groups } = buildFormTree(flattenTemplateFields(tpl), [], {});
  assert.equal(groups[0].subs.length, 1);
  assert.equal(groups[0].subs[0]._plain, true);
});

it('有标题的子模块不标 _plain', () => {
  const tpl = { sections: [{ code: 'a', label: 'A', subsections: [{ code: 's', label: '子', fields: [f('x')] }] }] };
  const { groups } = buildFormTree(flattenTemplateFields(tpl), [], {});
  assert.ok(!groups[0].subs[0]._plain);
});

it('模板无 sections（扁平）退化为单个分组', () => {
  const { groups, rows } = buildFormTree([], [], {});
  assert.equal(groups.length, 0);
  assert.equal(rows.length, 0);
});

console.log('buildFormTree · 值与脏值基准');
it('值按 canonical 对上，initRaw 与 raw 同源', () => {
  const tpl = { sections: [{ code: 'a', label: 'A', fields: [f('pi'), f('n', { dataType: 'INTEGER' })] }] };
  const values = [{ canonical: 'pi', value: '张三' }, { canonical: 'n', value: 3 }];
  const { rows } = buildFormTree(flattenTemplateFields(tpl), values, {});
  assert.equal(rows[0].raw, '张三');
  assert.equal(rows[0].initRaw, '张三');
  assert.equal(rows[0]._dirty, false);
  assert.equal(rows[0]._error, '');
  assert.equal(rows[1].raw, 3);
});

it('缺值字段 raw/initRaw 都是空串而非 undefined', () => {
  const tpl = { sections: [{ code: 'a', label: 'A', fields: [f('missing')] }] };
  const { rows } = buildFormTree(flattenTemplateFields(tpl), [], {});
  assert.equal(rows[0].raw, '');
  assert.equal(rows[0].initRaw, '');
});

console.log('buildFormTree · 码表与布尔');
it('select 展开 options，只读值映射成 label', () => {
  const tpl = { sections: [{ code: 'a', label: 'A', fields: [f('sex', { fieldType: 'select', dictKey: 'sex' })] }] };
  const dict = { sex: { M: '雄性', F: '雌性' } };
  const { rows } = buildFormTree(flattenTemplateFields(tpl), [{ canonical: 'sex', value: 'M' }], dict);
  assert.deepEqual(rows[0].options, [{ value: 'M', label: '雄性' }, { value: 'F', label: '雌性' }]);
  assert.equal(rows[0].value, '雄性', '只读展示用 label');
  assert.equal(rows[0].raw, 'M', 'raw 保留原码值，提交时用它');
});

it('checkbox 只读值转是/否', () => {
  const tpl = { sections: [{ code: 'a', label: 'A', fields: [f('iso', { fieldType: 'checkbox' })] }] };
  const { rows } = buildFormTree(flattenTemplateFields(tpl), [{ canonical: 'iso', value: '1' }], {});
  assert.equal(rows[0].value, '是');
});

it('纯空白值也显示 —（数据里出现过 " "，直接渲染是一片看不见的空白）', () => {
  const tpl = { sections: [{ code: 'a', label: 'A', fields: [f('blank'), f('sp')] }] };
  const { rows } = buildFormTree(flattenTemplateFields(tpl), [
    { canonical: 'blank', value: '' },
    { canonical: 'sp', value: '   ' },
  ], {});
  assert.equal(rows[0].value, '—');
  assert.equal(rows[1].value, '—');
});

console.log('buildEditableFormRows（确认弹窗用的扁平路径）');
it('仍接受裸字段数组，返回扁平行', () => {
  const rows = buildEditableFormRows([f('pi'), f('aup')], [{ canonical: 'pi', value: '张三' }], {});
  assert.equal(rows.length, 2);
  assert.equal(rows[0].canonical, 'pi');
  assert.equal(rows[0].raw, '张三');
});

console.log('脏值计算');
const groupsOf = (fields, values = []) =>
  buildFormTree(flattenTemplateFields({ sections: [{ code: 'a', label: 'A', fields }] }), values, {}).groups;

it('改了 raw 才算脏，未改不算', () => {
  const g = groupsOf([f('pi')], [{ canonical: 'pi', value: '张三' }]);
  const row = g[0].subs[0].rows[0];
  assert.equal(isRowDirty(row), false);
  row.raw = '李四';
  assert.equal(isRowDirty(row), true);
  row.raw = '张三';
  assert.equal(isRowDirty(row), false, '改回原值应恢复为不脏');
});

it('不可编辑字段永远不算脏', () => {
  const g = groupsOf([f('pi', { editable: false })], [{ canonical: 'pi', value: 'a' }]);
  const row = g[0].subs[0].rows[0];
  row.raw = 'b';
  assert.equal(isRowDirty(row), false);
});

it('布尔按真值比：空 → 关 不算改动', () => {
  const g = groupsOf([f('iso', { fieldType: 'checkbox' })]);   // initRaw = ''
  const row = g[0].subs[0].rows[0];
  row.raw = false;
  assert.equal(isRowDirty(row), false, "'' 与 false 同为假");
  row.raw = true;
  assert.equal(isRowDirty(row), true);
});

it('数字 3 与字符串 "3" 不算改动', () => {
  const g = groupsOf([f('n', { dataType: 'INTEGER' })], [{ canonical: 'n', value: 3 }]);
  const row = g[0].subs[0].rows[0];
  row.raw = '3';
  assert.equal(isRowDirty(row), false);
});

it('refreshDirty 汇总每个分区的 dirtyCount', () => {
  const tpl = { sections: [
    { code: 'a', label: 'A', fields: [f('p'), f('q')] },
    { code: 'b', label: 'B', fields: [f('r')] },
  ] };
  const { groups } = buildFormTree(flattenTemplateFields(tpl), [], {});
  groups[0].subs[0].rows[0].raw = 'x';
  groups[0].subs[0].rows[1].raw = 'y';
  groups[1].subs[0].rows[0].raw = 'z';
  refreshDirty(groups);
  assert.equal(groups[0].dirtyCount, 2);
  assert.equal(groups[1].dirtyCount, 1);
});

console.log('默认折叠');
it('字段数 > 阈值收起，≤ 阈值展开', () => {
  const many = Array.from({ length: SECTION_AUTO_EXPAND_MAX + 1 }, (_, i) => f('x' + i));
  const few = Array.from({ length: SECTION_AUTO_EXPAND_MAX }, (_, i) => f('y' + i));
  const tpl = { sections: [
    { code: 'big', label: '大', fields: many },
    { code: 'small', label: '小', fields: few },
  ] };
  const { groups } = buildFormTree(flattenTemplateFields(tpl), [], {});
  applyDefaultCollapse(groups);
  assert.equal(groups[0].collapsed, true);
  assert.equal(groups[1].collapsed, false);
});

it('有改动的分区即使超阈值也强制展开（不藏待保存的改动）', () => {
  const many = Array.from({ length: SECTION_AUTO_EXPAND_MAX + 3 }, (_, i) => f('x' + i));
  const { groups } = buildFormTree(flattenTemplateFields({ sections: [{ code: 'big', label: '大', fields: many }] }), [], {});
  groups[0].subs[0].rows[0].raw = 'changed';
  refreshDirty(groups);
  applyDefaultCollapse(groups);
  assert.equal(groups[0].collapsed, false);
});

it('命中 DEFAULT_COLLAPSED_SECTIONS 的分区即使字段少也默认收起', () => {
  const tpl = { sections: [
    { code: 'cage_status', label: '状态标记', fields: [f('a'), f('b')] },
    { code: 'animal', label: '动物信息', fields: [f('c'), f('d'), f('e')] },
    { code: 'basic', label: '基本信息', fields: [f('g')] },
  ] };
  const { groups } = buildFormTree(flattenTemplateFields(tpl), [], {});
  applyDefaultCollapse(groups);
  assert.equal(groups[0].collapsed, true, '按 label 命中');
  assert.equal(groups[1].collapsed, true, '按 label 命中');
  assert.equal(groups[2].collapsed, false, '未命中且字段少 → 展开');
});

it('按 code 命中同样生效（不依赖后台把分区名写成中文）', () => {
  const tpl = { sections: [{ code: '动物信息', label: 'Animal Info', fields: [f('a')] }] };
  const { groups } = buildFormTree(flattenTemplateFields(tpl), [], {});
  applyDefaultCollapse(groups);
  assert.equal(groups[0].collapsed, true);
});

it('强制收起的分区一旦有改动，仍然展开（改动优先于配置）', () => {
  const tpl = { sections: [{ code: 'x', label: '动物信息', fields: [f('a')] }] };
  const { groups } = buildFormTree(flattenTemplateFields(tpl), [], {});
  groups[0].subs[0].rows[0].raw = 'changed';
  refreshDirty(groups);
  applyDefaultCollapse(groups);
  assert.equal(groups[0].collapsed, false);
});

console.log('校验');
it('只校验「可编辑 + 必填 + 空」', () => {
  const tpl = { sections: [{ code: 'a', label: 'A', fields: [
    f('req', { required: 'YES' }),                       // 必填且空 → 报错
    f('req2', { required: 'YES' }),                      // 必填但只读 → 不报
    f('opt', { required: 'NO' }),                        // 非必填 → 不报
  ] }] };
  const { groups } = buildFormTree(flattenTemplateFields(tpl), [{ canonical: 'req2', value: 'x' }], {});
  groups[0].subs[0].rows[1].editable = false;
  const errors = validateGroups(groups);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].label, 'REQ');
  assert.match(groups[0].subs[0].rows[0]._error, /请填写/);
});

it('必填的布尔不算空（开关有开/关两态）', () => {
  const tpl = { sections: [{ code: 'a', label: 'A', fields: [f('iso', { fieldType: 'checkbox', required: 'YES' })] }] };
  const { groups } = buildFormTree(flattenTemplateFields(tpl), [], {});
  assert.equal(validateGroups(groups).length, 0);
});

it('每次校验先清上一次的 _error', () => {
  const tpl = { sections: [{ code: 'a', label: 'A', fields: [f('req', { required: 'YES' })] }] };
  const { groups } = buildFormTree(flattenTemplateFields(tpl), [], {});
  validateGroups(groups);
  assert.ok(groups[0].subs[0].rows[0]._error);
  groups[0].subs[0].rows[0].raw = '填上了';
  validateGroups(groups);
  assert.equal(groups[0].subs[0].rows[0]._error, '');
});

console.log('提交与回滚');
it('changedValues 只收有改动且可编辑的行', () => {
  const tpl = { sections: [{ code: 'a', label: 'A', fields: [
    f('p'), f('q'), f('ro', { editable: false }),
  ] }] };
  const { groups } = buildFormTree(flattenTemplateFields(tpl), [{ canonical: 'p', value: '1' }], {});
  const rows = groups[0].subs[0].rows;
  rows[1].raw = 'new';
  rows[2].raw = 'tampered';
  const out = changedValues(groups);
  assert.equal(out.length, 1);
  assert.equal(out[0].fieldId, 'id-q');
  assert.equal(out[0].raw, 'new');
});

it('revertGroups 把 raw 还原到 initRaw 并清掉脏值/错误', () => {
  const tpl = { sections: [{ code: 'a', label: 'A', fields: [f('p'), f('req', { required: 'YES' })] }] };
  const { groups } = buildFormTree(flattenTemplateFields(tpl), [{ canonical: 'p', value: '原值' }], {});
  const rows = groups[0].subs[0].rows;
  rows[0].raw = '改过';
  refreshDirty(groups);
  validateGroups(groups);
  assert.equal(groups[0].dirtyCount, 1);
  revertGroups(groups);
  assert.equal(rows[0].raw, '原值');
  assert.equal(rows[0]._dirty, false);
  assert.equal(rows[0]._error, '');
  assert.equal(groups[0].dirtyCount, 0);
});

console.log(`\n${passed} 项通过` + (process.exitCode ? '，有失败项' : ''));
