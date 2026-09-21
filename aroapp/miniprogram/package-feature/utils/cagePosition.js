/**
 * 笼位坐标的展示口径 —— 小程序侧唯一一份。
 *
 * **后端给的是原生数字坐标**（`positionX` 1..26 / `positionY`），界面上要的是映射坐标
 * 「字母-数字」（`1-4` → `A-4`）。两处各写一遍必然走形：2026-09-21 实测「我的申请」里的
 * 转移卡片直接印了原生 `4-4`，而同一个单子在审核页显示的是 `D-4`。
 *
 * 优先用后端给的 `positionLabel`（有就说明后端已经映射好了）；没有才自己映射。
 * x 超出 1..26 映射不出字母，返回空串让调用方自己兜底，别硬编一个假坐标。
 */
function cagePositionLabel(item) {
  if (!item) return '';
  if (item.positionLabel) return item.positionLabel;
  var x = Number(item.positionX);
  var y = Number(item.positionY);
  if (item.positionX == null || item.positionY == null) return '';
  if (isNaN(x) || isNaN(y) || x < 1 || x > 26) return '';
  return String.fromCharCode(64 + x) + '-' + y;
}

module.exports = { cagePositionLabel: cagePositionLabel };
