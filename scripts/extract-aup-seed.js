/**
 * 一次性提取脚本：把 AUP 内联模板种子里「字段内联 options / refDataSource」
 * 改写成「码表(codelists) + 字段(dictKey)」原子种子，产出 aup-seed.json。
 *
 * 输入：
 *   - src/main/resources/db/default-aup-template.json  (内联模板)
 *   - src/main/resources/db/default-aup-dict.json      (已有 3 个码表)
 * 输出：
 *   - src/main/resources/db/aup-seed.json              (codelists + sections)
 *
 * 可重复运行且幂等：同一输入必然产出同一输出。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DB_DIR = path.resolve(__dirname, '..', 'src', 'main', 'resources', 'db');
const TEMPLATE_PATH = path.join(DB_DIR, 'default-aup-template.json');
const DICT_PATH = path.join(DB_DIR, 'default-aup-dict.json');
const OUTPUT_PATH = path.join(DB_DIR, 'aup-seed.json');

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function lowerFirst(s) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function upperFirst(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * 由字段路径派生稳定码：按 "." 切分，首段首字母小写，后续段首字母大写。
 *   例：A2.unitType -> a2UnitType
 *       B5.blocks (嵌套子字段 basis，传入 B5.blocks.basis) -> b5BlocksBasis
 */
function deriveDictKey(pathKey) {
  return pathKey
    .split('.')
    .map((part, i) => (i === 0 ? lowerFirst(part) : upperFirst(part)))
    .join('');
}

/**
 * 把内联 options 规范化为 [{value,label}]：
 *   字符串数组 ["是","否"] -> [{value:"是",label:"是"},{value:"否",label:"否"}]
 *   对象数组         -> 只保留 value / label
 */
function normalizeOptions(options) {
  return options.map((o) => {
    if (typeof o === 'string') {
      return { value: o, label: o };
    }
    return { value: o.value, label: o.label };
  });
}

/** 按 value 升序排序后序列化，作为去重签名。 */
function signatureOf(items) {
  const sorted = [...items].sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
  return JSON.stringify(sorted);
}

// ---------------------------------------------------------------------------
// 读取输入
// ---------------------------------------------------------------------------

const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
const dictFile = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8'));

const codelists = [];
const usedDictKeys = new Set();

// ---------------------------------------------------------------------------
// 规则 A：已有码表（dictKey）—— 从 default-aup-dict.json 收进 codelists
// ---------------------------------------------------------------------------

for (const d of dictFile.dicts) {
  const items = (d.items || []).map((s) => ({ value: s, label: s }));
  codelists.push({
    dictKey: d.dictKey,
    name: d.name,
    folder: d.category,
    source: 'LOCAL',
    sourceRef: null,
    items,
  });
  usedDictKeys.add(d.dictKey);
}

// ---------------------------------------------------------------------------
// 规则 B：外部引用（refDataSource）—— 固定写入 3 个 EXTERNAL 码表头
// ---------------------------------------------------------------------------

const EXTERNAL_DEFS = [
  { dictKey: 'projectGroup', name: '课题组', sourceRef: 'projectGroup' },
  { dictKey: 'animalBreed', name: '动物品种', sourceRef: 'ANIMAL_BREED' },
  { dictKey: 'animalStrain', name: '动物品系', sourceRef: 'ANIMAL_STRAIN' },
];

const REF_TO_DICT_KEY = {
  projectGroup: 'projectGroup',
  ANIMAL_BREED: 'animalBreed',
  ANIMAL_STRAIN: 'animalStrain',
};

for (const def of EXTERNAL_DEFS) {
  codelists.push({
    dictKey: def.dictKey,
    name: def.name,
    folder: '外部引用',
    source: 'EXTERNAL',
    sourceRef: def.sourceRef,
    items: [],
  });
  usedDictKeys.add(def.dictKey);
}

// ---------------------------------------------------------------------------
// 规则 C：内联 options —— 规范化 + 按内容去重 + 派生 dictKey
// ---------------------------------------------------------------------------

const dedupeMap = new Map(); // signature -> { dictKey }
let optionFieldCount = 0;

function uniqueDictKey(base) {
  let key = base;
  let suffix = 2;
  while (usedDictKeys.has(key)) {
    key = base + suffix;
    suffix += 1;
  }
  return key;
}

/**
 * 递归处理单个字段（含 config.fields / config.columns 里的子字段）。
 * @param {object} field       已深拷贝、可原地修改的字段对象
 * @param {string} sectionCode 顶层 section.code（用作 folder）
 * @param {string|null} parentPath 父字段的完整路径（嵌套字段派生 dictKey 用）
 */
function processField(field, sectionCode, parentPath) {
  const fullPath = parentPath ? `${parentPath}.${field.fieldKey}` : field.fieldKey;

  if (field.dictKey) {
    // 规则 A：字段本身已带 dictKey，无需改动，码表已在上方收集。
  } else if (field.config && field.config.refDataSource) {
    // 规则 B：删掉 refDataSource，改为 dictKey 指向 EXTERNAL 码表头。
    const ds = field.config.refDataSource;
    delete field.config.refDataSource;
    field.dictKey = REF_TO_DICT_KEY[ds];
  } else if (Array.isArray(field.options) && field.options.length > 0) {
    // 规则 C：内联 options -> 去重后的 LOCAL 码表。
    optionFieldCount += 1;
    const items = normalizeOptions(field.options);
    const sig = signatureOf(items);

    let entry = dedupeMap.get(sig);
    if (!entry) {
      const dictKey = uniqueDictKey(deriveDictKey(fullPath));
      usedDictKeys.add(dictKey);
      entry = { dictKey };
      dedupeMap.set(sig, entry);

      codelists.push({
        dictKey,
        name: field.label,
        folder: sectionCode,
        source: 'LOCAL',
        sourceRef: null,
        items,
      });
    }

    delete field.options;
    field.dictKey = entry.dictKey;
  }

  // 递归进入嵌套子字段（repeatGroup/group 的 config.fields、table 的 config.columns）。
  if (field.config) {
    if (Array.isArray(field.config.fields)) {
      for (const child of field.config.fields) {
        processField(child, sectionCode, fullPath);
      }
    }
    if (Array.isArray(field.config.columns)) {
      for (const child of field.config.columns) {
        processField(child, sectionCode, fullPath);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 规则 E：sections 原样深拷贝，但字段按上述改写
// ---------------------------------------------------------------------------

const sections = JSON.parse(JSON.stringify(template.sections));

for (const section of sections) {
  const sectionCode = section.code;

  if (Array.isArray(section.fields)) {
    for (const field of section.fields) {
      processField(field, sectionCode, null);
    }
  }

  if (Array.isArray(section.subsections)) {
    for (const sub of section.subsections) {
      if (Array.isArray(sub.fields)) {
        for (const field of sub.fields) {
          processField(field, sectionCode, null);
        }
      }
    }
  }
}

const output = { codelists, sections };

// ---------------------------------------------------------------------------
// 写出 + 校验
// ---------------------------------------------------------------------------

const json = JSON.stringify(output, null, 2) + '\n';
JSON.parse(json); // 写出前先校验 JSON 合法
fs.writeFileSync(OUTPUT_PATH, json, 'utf8');

// ---------------------------------------------------------------------------
// 自检：统计 + 断言
// ---------------------------------------------------------------------------

const existingLocalCount = dictFile.dicts.length;
const externalCount = EXTERNAL_DEFS.length;
const newLocalCount = dedupeMap.size;
const dedupMerged = optionFieldCount - newLocalCount;

const LIST_TYPES = new Set(['choice', 'select', 'checkbox', 'cascade']);
const EXTERNAL_KEYS = new Set(['projectGroup', 'animalBreed', 'animalStrain']);
const missingDictKey = [];

function assertSections(fields) {
  for (const f of fields) {
    if (LIST_TYPES.has(f.type)) {
      const isBooleanCheckbox = f.type === 'checkbox' && !f.dictKey && !(f.config && f.config.refDataSource);
      // 独立布尔型 checkbox（无选项）无需码表，除此之外的列表型字段必须有 dictKey。
      if (!isBooleanCheckbox && !f.dictKey && !EXTERNAL_KEYS.has(f.dictKey)) {
        missingDictKey.push(`${f.fieldKey} (${f.type})`);
      }
    }
    if (f.config) {
      if (Array.isArray(f.config.fields)) assertSections(f.config.fields);
      if (Array.isArray(f.config.columns)) assertSections(f.config.columns);
    }
  }
}

function collectAllFields(sections) {
  const out = [];
  for (const s of sections) {
    if (Array.isArray(s.fields)) out.push(...s.fields);
    if (Array.isArray(s.subsections)) {
      for (const sub of s.subsections) {
        if (Array.isArray(sub.fields)) out.push(...sub.fields);
      }
    }
  }
  return out;
}

assertSections(collectAllFields(sections));

// 码表 dictKey 唯一性
const keys = codelists.map((c) => c.dictKey);
const dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i);

console.log('=== aup-seed 提取完成 ===');
console.log(`codelists 总数 : ${codelists.length}`);
console.log(`  已有 LOCAL    : ${existingLocalCount}`);
console.log(`  EXTERNAL 头   : ${externalCount}`);
console.log(`  新 LOCAL 码表 : ${newLocalCount}`);
console.log(`  内联 options 字段数 : ${optionFieldCount}`);
console.log(`  去重合并掉   : ${dedupMerged} 个重复组`);
console.log(`dictKey 冲突   : ${dupKeys.length === 0 ? '无' : dupKeys.join(', ')}`);
console.log(`缺 dictKey 字段: ${missingDictKey.length === 0 ? '无' : missingDictKey.join(', ')}`);
console.log(`输出文件       : ${OUTPUT_PATH}`);

if (dupKeys.length > 0 || missingDictKey.length > 0) {
  console.error('!!! 自检未通过，见上方输出');
  process.exit(1);
}
