import { describe, expect, it } from "vitest";
import { sourceColumnText } from "../pages/CageOccupancyRecordsPage";
import type { CageOpRequestView } from "@/api/domains/cageShelf.api";

/**
 * 占用记录表的「源」列文案。
 *
 * 回归的是：`toView` 开始下发 `pairs` 之后，多源行会走进「多源」分支 ——
 * 那个分支原来**把 19 位雪花 id 直接打到列里**（`#2005810834109890580、#…`），
 * 既读不懂又把列撑爆。改成「首个源位置 等 N 处」。
 */
const base = {
  sourceAnimalCageId: "2005810834109890580",
  targetAnimalCageIds: [],
} as unknown as CageOpRequestView;

describe("sourceColumnText", () => {
  it("单源：房间/笼架/坐标", () => {
    const r = { ...base, roomName: "201A", shelveName: "201A-1", positionX: 6, positionY: 4 };
    expect(sourceColumnText(r)).toBe("201A/201A-1/F-4");
  });

  it("多源：首个源 + 等 N 处，绝不出 id", () => {
    const r = {
      ...base,
      roomName: "201B-1",
      shelveName: "201B-1",
      positionX: 1,
      positionY: 10,
      pairs: [
        { source: "2005810834109890580", target: "2005810834109890564" },
        { source: "2005810834109890565", target: "2005810834109890572" },
      ],
    } as unknown as CageOpRequestView;
    const text = sourceColumnText(r);
    expect(text).toBe("201B-1/201B-1/A-10 等 2 处");
    expect(text).not.toMatch(/2005810834/);
  });

  it("多源但同源重复（单源多目标）：算一处", () => {
    const r = {
      ...base,
      roomName: "201A",
      shelveName: "201A-1",
      positionX: 6,
      positionY: 4,
      pairs: [
        { source: "2005810834109890580", target: "1" },
        { source: "2005810834109890580", target: "2" },
      ],
    } as unknown as CageOpRequestView;
    expect(sourceColumnText(r)).toBe("201A/201A-1/F-4");
  });

  it("位置全缺给横杠，不把 19 位笼位 id 打出来", () => {
    expect(sourceColumnText(base)).toBe("-");
    expect(sourceColumnText(base)).not.toMatch(/2005810834/);
  });

  it("什么都没有给横杠", () => {
    expect(sourceColumnText({} as unknown as CageOpRequestView)).toBe("-");
  });
});
