import { describe, expect, it } from "vitest";
import { buildOrderDisplay } from "./orderDisplay";
import type { RefOrder, RefOrderLine } from "@/api/domains/referenceData.api";

/**
 * 订单展示模型的「笼位」聚合。
 *
 * 回归点：订购→笼位预定上线后，卡片明细加了目标笼位，三端表格没跟上。
 * 表格列吃的是 `OrderDisplay.cage`，所以聚合规则必须在这里锁死。
 */

const line = (over: Partial<RefOrderLine> = {}): RefOrderLine =>
  ({ id: 1, orderId: 1, refDataId: 1, quantity: 1, ...over }) as RefOrderLine;

const order = (lines: RefOrderLine[]): RefOrder =>
  ({ id: 1, groupId: "g", submitterId: "u", status: "PENDING", lines }) as RefOrder;

describe("buildOrderDisplay 笼位聚合", () => {
  it("多行笼位去重后按「、」连接", () => {
    const d = buildOrderDisplay(order([
      line({ id: 1, targetCageLabel: "浦东 / A101 / 架3 (4,5)" }),
      line({ id: 2, targetCageLabel: "浦东 / A101 / 架3 (4,5)" }),
      line({ id: 3, targetCageLabel: "浦西 / B201 / 架1 (1,2)" }),
    ]));
    expect(d.cage).toBe("浦东 / A101 / 架3 (4,5)、浦西 / B201 / 架1 (1,2)");
  });

  it("已锁位但坐标串为空时退化成「已选笼位」，不漏掉", () => {
    expect(buildOrderDisplay(order([line({ targetAnimalCageId: 42 })])).cage).toBe("已选笼位");
  });

  it("没锁笼位时为「—」", () => {
    expect(buildOrderDisplay(order([line()])).cage).toBe("—");
    expect(buildOrderDisplay(order([])).cage).toBe("—");
  });
});
