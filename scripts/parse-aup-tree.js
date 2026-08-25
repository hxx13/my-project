// 解析 aro-aup-form-tree.txt（真实站点 Vue render 树），提取 段→小节→字段(label/type/required)
// 输出结构化 JSON，供与 aup-seed.json 比对。
'use strict';
const fs = require('fs');
const lines = fs.readFileSync(process.argv[2] || 'aro-aup-form-tree.txt', 'utf8').split('\n');

function indentOf(l) { return l.match(/^\s*/)[0].length; }
function txtOf(l) {
  const m = l.match(/│"(.*)"\s*$/);
  return m ? m[1] : null;
}
function labelOf(l) {
  const t = txtOf(l);
  if (!t) return null;
  // 字段标签：以中文/英文冒号结尾，且不太长（描述说明会很长）
  const s = t.replace(/^\*+/, '').replace(/[：:]\s*$/, '').trim();
  if (!s || s.length > 30) return null;
  return /[：:]$/.test(t.replace(/^\*+/,'')) ? s : null;
}

const sections = [];
let curSec = null, curSub = null;
let pendingRequired = false; // 上一个 colorred 标记
let pendingLabel = null;     // 上一个字段标签

function pushField(type, options) {
  if (!curSub) return;
  if (!pendingLabel) return;
  curSub.fields.push({ label: pendingLabel, required: pendingRequired, type, ...(options ? { options } : {}) });
  pendingLabel = null; pendingRequired = false;
}

for (const line of lines) {
  const t = line.trim();
  // 段标题
  if (t.includes('part-title')) {
    // 下一行是标题文本，但这里简化：直接读当前行后的文本不可行；改为读相邻行
    continue;
  }
  const isSubtitle = t.includes('part-subtitle');
  const isColorRed = t.includes('colorred');
  const isSelect = t.startsWith('<el-select');
  const isCheckbox = t.startsWith('<el-checkbox');
  const isRadio = t.startsWith('<el-radio');
  const isTextarea = t.startsWith('<el-input') && t.includes('textarea');
  const isElInput = t.startsWith('<el-input') && !t.includes('textarea');
  const isNativeInput = t.startsWith('<input ');
  const isDatePicker = t.includes('el-date-picker') || t.includes('el-date-editor');

  const label = labelOf(line);
  const txt = txtOf(line);

  if (isSubtitle) {
    // 标题文本在下一行 │"..."
    // 不处理文本，靠后续 labelOf 关联；这里先占位，真正标题用 labelOf 无法区分，故用相邻行
    // 简化：把带 part-subtitle 的下一行文本作为小节标题
  }

  if (isColorRed) { pendingRequired = true; continue; }
  if (label) { pendingLabel = label; continue; }
  if (isSelect) { pushField('select'); continue; }
  if (isCheckbox) { pushField('choice', { choiceType: 'multiple' }); continue; }
  if (isRadio) { pushField('choice', { choiceType: 'single' }); continue; }
  if (isTextarea) { pushField('textarea'); continue; }
  if (isElInput || isNativeInput) { pushField('text'); continue; }
  if (isDatePicker) { pushField('date'); continue; }
}

// 输出
console.log(JSON.stringify(sections, null, 2));
