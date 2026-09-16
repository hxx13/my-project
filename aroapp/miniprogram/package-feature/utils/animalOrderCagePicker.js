/**
 * 订购选笼位的纯逻辑（无 wx、无副作用），与 web 的 cageAllocation/cagePickerLogic 同口径。
 *
 * 三条硬规则（后端也复检，这里是前端提前拦）：
 *  1. 一笼一规格 —— 笼位已放入的性别与本次规格性别不符时不让点（认不出性别就不猜、不拦）
 *  2. 数量上限 = 已选笼位数 × 单笼上限（maxQuantityPerCage 由 reservable 接口带回）
 *  3. 分配按「选中顺序」铺满，每笼先放满上限，最后一笼拿余数
 */

/** 规格选项文字 → 性别。只认明确的字眼，认不出返回 ''（不猜）。 */
function sexOfSpecLabel(label) {
  const s = String(label == null ? '' : label).toLowerCase();
  if (/雌|母|female|♀/.test(s)) return 'female';
  if (/雄|公|male|♂/.test(s)) return 'male';
  return '';
}

/** 笼位里已有性别（可能是中文/英文）→ 归一。认不出返回 ''。 */
function normalizeCageSex(sex) {
  const s = String(sex == null ? '' : sex).toLowerCase();
  if (!s) return '';
  if (/雌|母|female|♀/.test(s)) return 'female';
  if (/雄|公|male|♂/.test(s)) return 'male';
  return '';
}

/**
 * 性别不符 → true（该格提前灰掉）。
 * 任一侧认不出就返回 false：这条规则宁可不拦，也不能把能点的格子误灰。
 */
function isSexMismatch(cageSex, specSex) {
  const a = normalizeCageSex(cageSex);
  const b = normalizeCageSex(specSex);
  if (!a || !b) return false;
  return a !== b;
}

/** 已选笼位数 × 单笼上限 = 可下单数量上限 */
function totalCapacity(cageCount, maxPerCage) {
  const n = Math.max(0, Number(cageCount) || 0);
  const cap = Math.max(1, Number(maxPerCage) || 1);
  return n * cap;
}

/**
 * 按选中顺序分配数量：每笼尽量放满 maxPerCage，最后一笼拿余数。
 * 返回数组长度 = 笼位数；总数超过总容量时抛错（调用方应先校验，别静默截断）。
 * @returns {number[]} 每笼分配数
 */
function allocateInOrder(total, cageCount, maxPerCage) {
  const n = Math.max(0, Number(cageCount) || 0);
  const cap = Math.max(1, Number(maxPerCage) || 1);
  const want = Math.max(0, Number(total) || 0);
  if (n === 0) {
    if (want > 0) throw new Error('没有选笼位，无法分配');
    return [];
  }
  if (want > n * cap) throw new Error('数量超过所选笼位的容量');
  const out = [];
  let left = want;
  for (let i = 0; i < n; i += 1) {
    const take = Math.min(cap, left);
    out.push(take);
    left -= take;
  }
  return out;
}

/** 把本课题组笼架按房间归并成 tab：[{ key, roomName, campusName, shelves: [] }]，保持后端顺序 */
function groupShelvesByRoom(shelves) {
  const out = [];
  const idx = {};
  (Array.isArray(shelves) ? shelves : []).forEach((s) => {
    if (!s) return;
    const roomName = s.roomName || '其他';
    const campusName = s.campusName || '';
    const key = campusName + '/' + roomName;
    if (!idx[key]) {
      idx[key] = { key, roomName, campusName, shelves: [] };
      out.push(idx[key]);
    }
    idx[key].shelves.push(s);
  });
  return out;
}

/**
 * 可提交行 = 实验员已提交给 PI 的 READY 行 + PI 本人加购的行（本人行不必再走一次「提交给 PI」）。
 * 与 web `MobileAnimalOrderView.readyLines` 是同一条口径：提交订单时带哪些行由它决定，
 * 两端算法飘了就会出现「同一份购物车，小程序下的单比 web 少几行」——所以只留这一份实现。
 */
function submittableLines(cart, isPi, currentUserId) {
  const me = currentUserId == null ? '' : String(currentUserId);
  return (Array.isArray(cart) ? cart : []).filter(function (l) {
    if (!l) return false;
    if (l.packageStatus === 'READY') return true;
    return !!isPi && me !== '' && String(l.addedBy == null ? '' : l.addedBy) === me;
  });
}

module.exports = {
  sexOfSpecLabel,
  normalizeCageSex,
  isSexMismatch,
  totalCapacity,
  allocateInOrder,
  groupShelvesByRoom,
  submittableLines,
};
