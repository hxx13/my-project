import { describe, it, expect } from "vitest";
import {
  sexOf,
  groupShelvesByRoom,
  buildSelectablePool,
  mergeOrderReservationMarks,
  buildShelfIndex,
  adoptReservedCages,
  buildCartEntries,
} from "./cagePickerLogic";
import type { PickedCage } from "./cagePickerLogic";
import type { GroupShelf, ReservableCell, ActiveCageReservation } from "@/api/domains/animalOrderCage.api";
import type { CageShelfDetail, CageShelfCell } from "@/api/domains/cageShelf.api";
import type { CageOpMark } from "@/features/cage-shelf/useCageOpSelect";

// ---- 工厂 ----
const shelf = (shelfIndexId: string, over: Partial<GroupShelf> = {}): GroupShelf => ({
  shelfIndexId,
  ...over,
});

const cell = (animalCageId: string, over: Partial<ReservableCell> = {}): ReservableCell => ({
  animalCageId,
  selectable: true,
  ...over,
});

const res = (
  reservationId: string,
  animalCageId: string,
  over: Partial<ActiveCageReservation> = {},
): ActiveCageReservation => ({
  reservationId,
  animalCageId,
  reserverName: "张三",
  ...over,
});

const divideMark = (requestId: string): CageOpMark => ({
  requestId,
  kind: "divide",
  color: "#111111",
  label: "分笼审核中",
});

const shelfMeta = (over: Partial<CageShelfDetail["shelfMeta"]> = {}): CageShelfDetail["shelfMeta"] => ({
  campusName: "校区",
  areaName: "区域",
  floorName: "楼层",
  roomName: "房间A",
  shelveId: "shelve-1",
  shelveName: "架1",
  roomId: "room-1",
  ...over,
});

const gridCell = (id?: string | number, x = 1, y = 1): CageShelfCell => ({
  id,
  x,
  y,
  position: `${x}-${y}`,
  empty: true,
  stateLabel: "空位",
});

const detail = (meta: CageShelfDetail["shelfMeta"], grid: CageShelfCell[]): CageShelfDetail => ({
  shelfMeta: meta,
  grid,
  totalCells: grid.length,
  filledCells: 0,
});

const picked = (animalCageId: string, over: Partial<PickedCage> = {}): PickedCage => ({
  reservationId: `res-${animalCageId}`,
  animalCageId,
  label: `label-${animalCageId}`,
  ...over,
});

describe("sexOf", () => {
  it("中文「雌」「雄」分别映射到「雌性」「雄性」", () => {
    expect(sexOf("性别: 雌性")).toBe("雌性");
    expect(sexOf("性别: 雄性")).toBe("雄性");
  });

  it("英文 female/male 大小写不敏感", () => {
    expect(sexOf("Sex: female")).toBe("雌性");
    expect(sexOf("Sex: Male")).toBe("雄性");
  });

  it("认不出性别不猜，空/null/undefined 一律返回 null", () => {
    expect(sexOf("品系: C57BL/6")).toBeNull();
    expect(sexOf("")).toBeNull();
    expect(sexOf(null)).toBeNull();
    expect(sexOf(undefined)).toBeNull();
  });
});

describe("groupShelvesByRoom", () => {
  it("按房间分组，组顺序=首次出现顺序，组内保持入参顺序", () => {
    const groups = groupShelvesByRoom([
      shelf("1", { roomId: "r1", roomName: "房间A" }),
      shelf("2", { roomId: "r1", roomName: "房间A" }),
      shelf("3", { roomId: "r2", roomName: "房间B" }),
      shelf("4", { roomId: "r2", roomName: "房间B" }),
    ]);
    expect(groups).toEqual([
      { roomKey: "r1", roomName: "房间A", shelfIndexIds: ["1", "2"] },
      { roomKey: "r2", roomName: "房间B", shelfIndexIds: ["3", "4"] },
    ]);
  });

  it("roomId 为空时用 roomName 作 key；两者都空的行被跳过", () => {
    const groups = groupShelvesByRoom([
      shelf("1", { roomId: null, roomName: "房间X" }),
      shelf("2", { roomId: null, roomName: null }),
      shelf("3", { roomId: "", roomName: "" }),
    ]);
    expect(groups).toEqual([{ roomKey: "房间X", roomName: "房间X", shelfIndexIds: ["1"] }]);
  });

  it("同一房间的架子合并进同一组，不产生重复组", () => {
    const groups = groupShelvesByRoom([
      shelf("1", { roomId: "r1", roomName: "房间A" }),
      shelf("2", { roomId: "r2", roomName: "房间B" }),
      shelf("3", { roomId: "r1", roomName: "房间A" }),
    ]);
    expect(groups.map((g) => g.roomKey)).toEqual(["r1", "r2"]);
    expect(groups[0].shelfIndexIds).toEqual(["1", "3"]);
  });
});

describe("buildSelectablePool", () => {
  it("后端 selectable:false 一律不进池", () => {
    const pool = buildSelectablePool([
      cell("c1", { selectable: false }),
      cell("c2", { selectable: true }),
    ]);
    expect(pool.has("c1")).toBe(false);
    expect(pool.has("c2")).toBe(true);
  });

  it("规格认得出性别时，cell.sex 与规格不同 → 不进池", () => {
    const pool = buildSelectablePool(
      [
        cell("c1", { sex: "雄性" }),
        cell("c2", { sex: "雌性" }),
      ],
      "性别: 雌性",
    );
    expect(pool.has("c1")).toBe(false);
    expect(pool.has("c2")).toBe(true);
  });

  it("cell.sex 为空 → 进池", () => {
    const pool = buildSelectablePool(
      [
        cell("c1", { sex: null }),
        cell("c2", { sex: "" }),
      ],
      "性别: 雌性",
    );
    expect(pool.has("c1")).toBe(true);
    expect(pool.has("c2")).toBe(true);
  });

  it("规格认不出性别 → 不做性别过滤", () => {
    const pool = buildSelectablePool(
      [
        cell("c1", { sex: "雄性" }),
        cell("c2", { sex: "雌性" }),
      ],
      "品系: C57BL/6",
    );
    expect(pool.has("c1")).toBe(true);
    expect(pool.has("c2")).toBe(true);
  });
});

describe("mergeOrderReservationMarks", () => {
  it("base 已有该 cageId → 保留 base，不被预定标记覆盖", () => {
    const base = new Map<string, CageOpMark>([["c1", divideMark("r-div")]]);
    const out = mergeOrderReservationMarks(base, [res("r-res", "c1", { orderId: "o1" })]);
    expect(out.get("c1")).toEqual(divideMark("r-div"));
  });

  it("orderId 非空 → 紫色 #8b5cf6、label 已下单待审批", () => {
    const out = mergeOrderReservationMarks(new Map(), [res("r1", "c1", { orderId: "o1" })]);
    expect(out.get("c1")).toEqual({
      requestId: "r1",
      kind: "reserve",
      color: "#8b5cf6",
      label: "已下单待审批",
    });
  });

  it("cartId 非空且无 orderId → 蓝色 #0ea5e9、label 已在购物车", () => {
    const out = mergeOrderReservationMarks(new Map(), [res("r1", "c1", { cartId: "cart1", orderId: null })]);
    expect(out.get("c1")).toEqual({
      requestId: "r1",
      kind: "reserve",
      color: "#0ea5e9",
      label: "已在购物车",
    });
  });

  it("orderId/cartId 都空 → 琥珀 #f59e0b、label 已被X预订；reserverName 空时用「他人」", () => {
    const out = mergeOrderReservationMarks(new Map(), [
      res("r1", "c1", { reserverName: "李四", orderId: null, cartId: null }),
      res("r2", "c2", { reserverName: "", orderId: null, cartId: null }),
    ]);
    expect(out.get("c1")).toEqual({
      requestId: "r1",
      kind: "reserve",
      color: "#f59e0b",
      label: "已被李四预订",
    });
    expect(out.get("c2")).toEqual({
      requestId: "r2",
      kind: "reserve",
      color: "#f59e0b",
      label: "已被他人预订",
    });
  });

  it("生成的每项 kind 都是 reserve", () => {
    const out = mergeOrderReservationMarks(new Map(), [
      res("r1", "c1", { orderId: "o1" }),
      res("r2", "c2", { cartId: "cart1" }),
      res("r3", "c3", {}),
    ]);
    for (const [key, mark] of out) {
      expect(mark.kind, key).toBe("reserve");
    }
  });

  it("返回新 Map，原 base 未被修改", () => {
    const c0Mark: CageOpMark = {
      requestId: "r-pre",
      kind: "divide",
      color: "#111111",
      label: "分笼审核中",
    };
    const base = new Map<string, CageOpMark>([["c0", c0Mark]]);
    const out = mergeOrderReservationMarks(base, [res("r1", "c1", { orderId: "o1" })]);
    expect(out).not.toBe(base);
    // base 保持原样：仍只有 c0 一条，值未变
    expect(base.size).toBe(1);
    expect(base.get("c0")).toBe(c0Mark);
    // 新 Map 里 c0 与新增项都在
    expect(out.get("c0")).toBe(c0Mark);
    expect(out.get("c1")).toEqual({
      requestId: "r1",
      kind: "reserve",
      color: "#8b5cf6",
      label: "已下单待审批",
    });
    expect(out.size).toBe(2);
  });
});

describe("buildShelfIndex", () => {
  it("跨多个架子的格子都能查到，值含 shelfMeta 与 cell", () => {
    const idx = buildShelfIndex([
      detail(shelfMeta({ shelveId: "s1", shelfIndexId: 1 }), [gridCell("c1", 1, 1)]),
      detail(shelfMeta({ shelveId: "s2", shelfIndexId: 2 }), [gridCell("c2", 2, 2)]),
    ]);
    expect(idx.size).toBe(2);
    expect(idx.get("c1")).toMatchObject({
      shelfMeta: { shelveId: "s1" },
      cell: { id: "c1" },
    });
    expect(idx.get("c2")?.cell.x).toBe(2);
    expect(idx.get("c2")?.shelfMeta.shelfIndexId).toBe(2);
  });

  it("cell.id 为空的行被跳过", () => {
    const idx = buildShelfIndex([
      detail(shelfMeta(), [gridCell(undefined), gridCell(""), gridCell("c1")]),
    ]);
    expect(idx.size).toBe(1);
    expect(idx.has("c1")).toBe(true);
  });
});

describe("adoptReservedCages", () => {
  it("reservedByMe 且 active 里 cartId 为空 → 生成一条", () => {
    const add = adoptReservedCages({
      cells: [{ animalCageId: "c1", selectable: true, reservedByMe: true }],
      active: [{ reservationId: "r1", animalCageId: "c1", reserverName: "张三", cartId: null }],
      picked: [],
      shelfIndex: new Map([["c1", { shelfMeta: shelfMeta(), cell: gridCell("c1") }]]),
    });
    expect(add).toHaveLength(1);
    expect(add[0].animalCageId).toBe("c1");
    expect(add[0].reservationId).toBe("r1");
  });

  it("active 该项 cartId 非空 → 不接回", () => {
    const add = adoptReservedCages({
      cells: [{ animalCageId: "c1", selectable: true, reservedByMe: true }],
      active: [{ reservationId: "r1", animalCageId: "c1", reserverName: "张三", cartId: "cart1" }],
      picked: [],
      shelfIndex: new Map([["c1", { shelfMeta: shelfMeta(), cell: gridCell("c1") }]]),
    });
    expect(add).toHaveLength(0);
  });

  it("已在 picked 里 → 不重复添加", () => {
    const add = adoptReservedCages({
      cells: [{ animalCageId: "c1", selectable: true, reservedByMe: true }],
      active: [{ reservationId: "r1", animalCageId: "c1", reserverName: "张三", cartId: null }],
      picked: [picked("c1")],
      shelfIndex: new Map([["c1", { shelfMeta: shelfMeta(), cell: gridCell("c1") }]]),
    });
    expect(add).toHaveLength(0);
  });

  it("shelfIndex 查不到 → 照样接回，label 兜底「已锁定」、位置字段全 null", () => {
    const add = adoptReservedCages({
      cells: [{ animalCageId: "c1", selectable: true, reservedByMe: true }],
      active: [{ reservationId: "r1", animalCageId: "c1", reserverName: "张三", cartId: null }],
      picked: [],
      shelfIndex: new Map(),
    });
    expect(add).toEqual([
      {
        reservationId: "r1",
        animalCageId: "c1",
        label: "已锁定",
        roomId: null,
        roomName: null,
        shelveName: null,
        shelfIndexId: null,
      },
    ]);
  });

  it("生成的项字段齐全（含 shelfIndexId）", () => {
    const add = adoptReservedCages({
      cells: [{ animalCageId: "c1", selectable: true, reservedByMe: true }],
      active: [{ reservationId: "r1", animalCageId: "c1", reserverName: "张三" }],
      picked: [],
      shelfIndex: new Map([
        [
          "c1",
          {
            shelfMeta: shelfMeta({ roomName: "房间A", shelveName: "架1", roomId: "room-1", shelfIndexId: 9 }),
            cell: gridCell("c1", 3, 4),
          },
        ],
      ]),
    });
    expect(add).toEqual([
      {
        reservationId: "r1",
        animalCageId: "c1",
        label: "房间A 架1 (3,4)",
        roomId: "room-1",
        roomName: "房间A",
        shelveName: "架1",
        shelfIndexId: "9",
      },
    ]);
  });

  it("房间名与架名都为空时 label 只保留坐标（trim 掉前导空格）", () => {
    const add = adoptReservedCages({
      cells: [{ animalCageId: "c1", selectable: true, reservedByMe: true }],
      active: [{ reservationId: "r1", animalCageId: "c1", reserverName: "张三" }],
      picked: [],
      shelfIndex: new Map([
        ["c1", { shelfMeta: shelfMeta({ roomName: "", shelveName: "" }), cell: gridCell("c1", 3, 4) }],
      ]),
    });
    expect(add[0].label).toBe("(3,4)");
  });
});

describe("buildCartEntries", () => {
  const pickedCages: PickedCage[] = [
    { reservationId: "r1", animalCageId: "c1", label: "A", roomId: "room1", roomName: "房间一" },
    { reservationId: "r2", animalCageId: "c2", label: "B", roomId: "room2", roomName: "房间二" },
    { reservationId: "r3", animalCageId: "c3", label: "C", roomId: null, roomName: null },
  ];

  it("只保留 alloc > 0 的笼位", () => {
    const entries = buildCartEntries(pickedCages, { c1: 5, c2: 0, c3: 2 }, "规格: 雌性", "备注");
    expect(entries.map((e) => e.reservationId)).toEqual(["r1", "r3"]);
  });

  it("顺序与 picked 一致", () => {
    const entries = buildCartEntries(pickedCages, { c3: 2, c2: 3, c1: 5 }, "规格: 雌性", "备注");
    expect(entries.map((e) => e.reservationId)).toEqual(["r1", "r2", "r3"]);
  });

  it("每条带自己的 pickupRoomId/pickupRoomName，optionLabel 原样带上", () => {
    const entries = buildCartEntries(pickedCages, { c1: 5, c2: 3, c3: 2 }, "规格: 雌性", "备注");
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({
      optionLabel: "规格: 雌性",
      qty: 5,
      remark: "备注",
      reservationId: "r1",
      pickupRoomId: "room1",
      pickupRoomName: "房间一",
    });
    expect(entries[1].pickupRoomId).toBe("room2");
    expect(entries[1].pickupRoomName).toBe("房间二");
    expect(entries[1].optionLabel).toBe("规格: 雌性");
    expect(entries[2].pickupRoomId).toBeUndefined();
    expect(entries[2].pickupRoomName).toBeUndefined();
    expect(entries[2].optionLabel).toBe("规格: 雌性");
  });
});
