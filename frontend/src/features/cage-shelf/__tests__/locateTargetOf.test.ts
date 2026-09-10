import { describe, expect, it } from "vitest";
import { locateTargetOf, type CodeLookupResult } from "@/api/domains/cageShelf.api";

/**
 * 扫码结果的定位归一化。
 *
 * 回归点：学生端曾经自己读顶层字段，而笼盒码（CAGE_CELL）的定位信息嵌在 `cageCell` 里，
 * 于是扫笼盒码永远拿不到 shelveId，报「该编码未关联笼架」。
 * 三端必须走同一个归一化，不能各读各的。
 */

const cageCellResult = (): CodeLookupResult =>
  ({
    type: "CAGE_CELL",
    cageCell: {
      animalCageId: "100",
      shelveId: "s-1",
      shelveName: "架1",
      roomId: 7,
      campusName: "浦东",
      roomName: "201A",
      positionX: 3,
      positionY: 4,
      positionLabel: "C-7",
    },
  }) as CodeLookupResult;

const legacyResult = (): CodeLookupResult =>
  ({
    type: "LEGACY_CAGE_BOX",
    legacy: true,
    roomId: "8",
    roomName: "201B",
    shelveId: "s-2",
    shelveName: "架2",
    positionX: 1,
    positionY: 2,
  }) as CodeLookupResult;

describe("locateTargetOf", () => {
  it("CAGE_CELL：从 cageCell 里取，而不是顶层（本次修复的回归点）", () => {
    const t = locateTargetOf(cageCellResult());
    expect(t).not.toBeNull();
    expect(t!.shelveId).toBe("s-1");
    expect(t!.roomId).toBe("7");
    expect(t!.positionX).toBe(3);
    expect(t!.positionY).toBe(4);
  });

  it("LEGACY_CAGE_BOX：位置平铺在顶层", () => {
    const t = locateTargetOf(legacyResult());
    expect(t!.shelveId).toBe("s-2");
    expect(t!.roomName).toBe("201B");
    expect(t!.positionX).toBe(1);
  });

  it("两种形态归一后结构一致，调用方不用再分 type", () => {
    const a = locateTargetOf(cageCellResult());
    const b = locateTargetOf(legacyResult());
    expect(Object.keys(a!).sort()).toEqual(Object.keys(b!).sort());
  });

  it("不能定位的类型返回 null：ASSET / NOT_FOUND / 裸 CAGE_BOX", () => {
    expect(locateTargetOf({ type: "ASSET" } as CodeLookupResult)).toBeNull();
    expect(locateTargetOf({ type: "NOT_FOUND" } as CodeLookupResult)).toBeNull();
    expect(locateTargetOf({ type: "CAGE_BOX" } as CodeLookupResult)).toBeNull();
  });

  it("CAGE_CELL 缺坐标时不硬凑，返回 null", () => {
    const r = { type: "CAGE_CELL", cageCell: { shelveId: "s-1" } } as unknown as CodeLookupResult;
    expect(locateTargetOf(r)).toBeNull();
  });

  it("LEGACY 缺坐标时返回 null", () => {
    expect(locateTargetOf({ type: "LEGACY_CAGE_BOX", shelveId: "s-2" } as CodeLookupResult)).toBeNull();
  });
});
