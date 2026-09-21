'use strict';
/**
 * 转移单提交载荷的组装 —— Web 版 frontend/src/features/cage-shelf/cageTransferForm.ts 的 JS 移植。
 *
 * <p>核心口径：**只发学生动过的值**。自动值不落库、每次可重算，多发一个自动值
 * 就等于把那一刻的自动值冻进单子；后端对每个缺失字段各自回退到自动值。
 *
 * <p>行按**下标**与目标列表对齐（后端按下标取行），所以只要有任意一行动过，
 * 就要发等长的数组，没动的那些行留空对象 `{}`。
 * <p>本页的 edits.rows 用**下标作键**而不是雪花 id —— 19 位 id 当 setData 路径的键容易踩坑；
 * 数组和「下标字符串作键的对象」都能被本函数按下标取到。
 */

/** 数量格的防呆上界：夸张的数会让后端 Integer 解析炸掉整份 transferForm，学生填的会被静默丢掉。 */
var MAX_COUNT = 100000;

/**
 * 组装提交载荷。
 * @param {{transferDate?: string, unitName?: string, phone?: string, rows?: Array<object>}} edits 学生**动过**的字段
 * @param {Array<string|number>} targetIds 目标笼位 id（下标与 edits.rows 对齐）
 * @returns {object|undefined} 一个字段都没动过就返回 undefined（= 整份都用自动值）
 */
function buildTransferForm(edits, targetIds) {
  edits = edits || {};
  targetIds = targetIds || [];
  var out = {};
  var topFields = ['transferDate', 'unitName', 'phone'];
  for (var t = 0; t < topFields.length; t++) {
    var k = topFields[t];
    if (edits[k] !== undefined) out[k] = String(edits[k]).trim();
  }

  var rows = [];
  var anyRow = false;
  for (var i = 0; i < targetIds.length; i++) {
    var e = (edits.rows || [])[i];
    var row = {};
    if (e) {
      if (e.strain !== undefined) row.strain = String(e.strain).trim();
      var numFields = ['female', 'male'];
      for (var j = 0; j < numFields.length; j++) {
        var f = numFields[j];
        if (e[f] === undefined) continue;
        var raw = String(e[f]).trim();
        if (raw === '') continue;
        var n = Number(raw);
        if (Number.isFinite(n) && n >= 0 && n < MAX_COUNT) row[f] = Math.floor(n);
      }
      if (Object.keys(row).length > 0) anyRow = true;
    }
    rows.push(row);
  }
  if (anyRow) out.rows = rows;

  return Object.keys(out).length > 0 ? out : undefined;
}

module.exports = { buildTransferForm: buildTransferForm, MAX_COUNT: MAX_COUNT };
