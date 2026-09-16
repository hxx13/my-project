/**
 * 移动端口径「动物订购选笼位」的纯逻辑层。
 *
 * 只做纯函数，不依赖 React / 网络 / 状态，可独立单测。
 *
 * 与 PC 的关系：`sexOf` 已收敛到这里（`CagePickerPanel.tsx` 反过来导入本模块），
 * 其余几个（房间分组、可点池、三档预定标记、接回、购物车组装）PC 那边仍是未导出的内联实现，
 * **两边语义必须一致**；将来整体收敛时以本模块为准。
 */
import type {
  ReservableCell,
  GroupShelf,
  ActiveCageReservation,
} from "@/api/domains/animalOrderCage.api";
import type { CageShelfDetail, CageShelfCell } from "@/api/domains/cageShelf.api";
import type { CageOpMark } from "@/features/cage-shelf/useCageOpSelect";
import type { PickedCage } from "@/features/reference-data/CagePickerPanel";

/**
 * 已锁笼位。定义在 PC 的 `CagePickerPanel`（它是这个类型的事实来源），这里只转出去，
 * 让移动端的消费方从一个地方导入。
 *
 * **必须是 type-only**：`CagePickerPanel` 反过来要从本模块运行时导入 `sexOf`，
 * 若这里变成值导入就会形成运行时循环依赖。
 */
export type { PickedCage };

/** 「雌性」「雄性」这类词只认明确写法，认不出不猜，交给后端再判一次 */
export function sexOf(label?: string | null): "雌性" | "雄性" | null {
  if (!label) return null;
  const lower = label.toLowerCase();
  if (label.includes("雌") || lower.includes("female")) return "雌性";
  if (label.includes("雄") || lower.includes("male")) return "雄性";
  return null;
}

/**
 * 按房间分组。组的顺序 = 入参首次出现顺序。
 *
 * `roomKey` 是分组键而非房间 id：`roomId` 缺失时**回退成房间名**（PC 同款口径），
 * 只用于分组与 React key。别与 `PickedCage.roomId`（取自 shelfMeta 的真 id）混用。
 */
export function groupShelvesByRoom(
  shelves: GroupShelf[],
): Array<{ roomKey: string; roomName: string; shelfIndexIds: string[] }> {
  const m = new Map<string, { roomKey: string; roomName: string; shelfIndexIds: string[] }>();
  for (const s of shelves) {
    const key = s.roomId != null && String(s.roomId) !== "" ? String(s.roomId) : String(s.roomName ?? "");
    if (!key) continue;
    if (!m.has(key)) m.set(key, { roomKey: key, roomName: s.roomName || key, shelfIndexIds: [] });
    m.get(key)!.shelfIndexIds.push(String(s.shelfIndexId));
  }
  return [...m.values()];
}

/** 能否点：后端说可点，且笼位没放不同规格的动物（一笼一规格） */
export function buildSelectablePool(
  cells: ReservableCell[],
  specOptionLabel?: string | null,
): Set<string> {
  const mySex = sexOf(specOptionLabel);
  const out = new Set<string>();
  for (const c of cells) {
    if (!c.selectable) continue;
    if (mySex && c.sex && c.sex !== mySex) continue;
    out.add(String(c.animalCageId));
  }
  return out;
}

/**
 * 把三档预定中间态叠到 `base`（分笼/转移在审）之上，返回新 Map、不改 `base`。
 * 待审分笼/转移优先：同一格已有操作类标记就不覆盖。
 *
 * 名字里的 `Order` 是为了与 `features/cage-shelf/useCageOpSelect.ts` 的 `mergeReservationMarks` 区分：
 * 那个是**笼架网格的单档版**（只画琥珀「已被X预订」，不分 cart/order 阶段），
 * 这个是**订购口径的三档版**（紫=已下单待审批 / 蓝=已在购物车 / 琥珀=已被X预订）。
 * 两者签名相似，别互相误用。
 */
export function mergeOrderReservationMarks(
  base: Map<string, CageOpMark>,
  active: ActiveCageReservation[],
): Map<string, CageOpMark> {
  const out = new Map(base);
  for (const r of active) {
    const key = String(r.animalCageId);
    if (out.has(key)) continue;
    const ordered = !!r.orderId;
    const inCart = !ordered && !!r.cartId;
    out.set(key, {
      requestId: String(r.reservationId),
      kind: "reserve",
      color: ordered ? "#8b5cf6" : inCart ? "#0ea5e9" : "#f59e0b",
      label: ordered ? "已下单待审批" : inCart ? "已在购物车" : `已被${r.reserverName || "他人"}预订`,
    });
  }
  return out;
}

/** 网格摊平成 cageId → { shelfMeta, cell }，跨多个架子的格子都能查到。 */
export function buildShelfIndex(
  grids: CageShelfDetail[],
): Map<string, { shelfMeta: CageShelfDetail["shelfMeta"]; cell: CageShelfCell }> {
  const m = new Map<string, { shelfMeta: CageShelfDetail["shelfMeta"]; cell: CageShelfCell }>();
  for (const d of grids) {
    for (const c of d.grid) {
      const id = String(c.id ?? "");
      if (id) m.set(id, { shelfMeta: d.shelfMeta, cell: c });
    }
  }
  return m;
}

/**
 * 算出「需要接回已选态」的项，返回待追加的数组（不拼进 picked）。
 * 预定是持久的，刷新页面后页面状态会丢；不接回来会显示成可点的空格子，点了反而撞唯一索引。
 */
export function adoptReservedCages(args: {
  cells: ReservableCell[];
  active: ActiveCageReservation[];
  picked: PickedCage[];
  shelfIndex: Map<string, { shelfMeta: CageShelfDetail["shelfMeta"]; cell: CageShelfCell }>;
}): PickedCage[] {
  const have = new Set(args.picked.map((r) => r.animalCageId));
  const add: PickedCage[] = [];
  for (const c of args.cells) {
    if (!c.reservedByMe) continue;
    const id = String(c.animalCageId);
    if (have.has(id)) continue;
    const active = args.active.find((r) => String(r.animalCageId) === id);
    if (!active) continue;
    // 已经挂到购物车行的属于「加购已完成」，不接回选择态 —— 否则加购完上次的选择又冒出来
    if (active.cartId) continue;
    // 本函数防的是「孤儿预留」：用户自己锁了笼位，但网格里定位不到时也必须接回来。
    // 直接丢弃这条锁定，它就既看不见也释放不掉，笼位被永久占住（别人也选不了）。
    // 所以查不到不是异常路径 —— 照样 push 一条，坐标/房间全空、label 落到「已锁定」，
    // 由消费方（抽屉分配页）渲染成虚线占位块，与 PC 同口径（CagePickerPanel.tsx 的 `where || "已锁定"`）。
    const entry = args.shelfIndex.get(id);
    const shelfMeta = entry?.shelfMeta;
    const cell = entry?.cell;
    const where = [shelfMeta?.roomName, shelfMeta?.shelveName].filter(Boolean).join(" ");
    add.push({
      reservationId: String(active.reservationId),
      animalCageId: id,
      label: cell ? `${where} (${cell.x},${cell.y})`.trim() : where || "已锁定",
      roomId: shelfMeta?.roomId != null ? String(shelfMeta.roomId) : null,
      roomName: shelfMeta?.roomName ?? null,
      shelveName: shelfMeta?.shelveName ?? null,
      shelfIndexId: shelfMeta?.shelfIndexId != null ? String(shelfMeta.shelfIndexId) : null,
    });
  }
  return add;
}

/** 组装加购行：一个笼位一条行，数量 = 该笼分到的量，房间取该笼自己的（多房间时后端按房间分单）。 */
export function buildCartEntries(
  picked: PickedCage[],
  alloc: Record<string, number>,
  optionLabel: string,
  remark: string,
): Array<{
  optionLabel: string;
  qty: number;
  remark: string;
  reservationId: string;
  pickupRoomId?: string;
  pickupRoomName?: string;
}> {
  return picked
    .map((c) => ({ cage: c, qty: alloc[c.animalCageId] || 0 }))
    .filter((x) => x.qty > 0)
    .map(({ cage, qty }) => ({
      optionLabel,
      qty,
      remark,
      reservationId: cage.reservationId,
      pickupRoomId: cage.roomId ?? undefined,
      pickupRoomName: cage.roomName ?? undefined,
    }));
}
