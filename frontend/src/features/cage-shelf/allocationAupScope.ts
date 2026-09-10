/**
 * 分配模式 AUP 下拉的纳入范围。
 *
 * 口径曾被收紧成「只显示当前房间笼架上已用的 AUP」（按 cage_cell_detail.aup_number），
 * 但预约模式给房间绑的 AUP 落在另一张表（cage_booking_room_aup.register_number），
 * 两者不通 —— 刚在预约里保存、还没分配到笼位的 AUP 就被这个过滤藏掉了。
 *
 * 现在取**并集**：网格已用的 ∪ 预约绑到本房间的。
 * 两边都为空时返回全量（房间还没任何 AUP，不该把用户堵死）。
 */
export function scopeAupsByRoom<T extends { registerNo: string }>(
  all: T[],
  gridRegisterNos: Iterable<string>,
  bookedRegisterNos: Iterable<string>,
): T[] {
  const scope = new Set<string>();
  for (const no of gridRegisterNos) if (no) scope.add(String(no));
  for (const no of bookedRegisterNos) if (no) scope.add(String(no));
  if (scope.size === 0) return all;
  return all.filter((a) => scope.has(a.registerNo));
}
