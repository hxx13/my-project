import { describe, expect, it } from "vitest";
import { ALLOC_CANCEL_ZONE, allocZoneReject, parseStatusZone, previewStatusCodes, statusZoneKey } from "../constants";

/**
 * 抽屉落区规则回归。
 * 分配模式的撤销/AUP 两个区互斥，状态模式的 add/del 两个方向互斥 ——
 * 任一侧判错都会「拖得进去、提交时才炸」或把撤销变成标记。
 */

describe("allocZoneReject", () => {
  it("空笼盒（cancel）只能进撤销区", () => {
    expect(allocZoneReject(ALLOC_CANCEL_ZONE, "cancel")).toBeNull();
    expect(allocZoneReject("AUP-1", "cancel")).toBeTruthy();
  });

  it("等待分配（allocate）只能进 AUP 区", () => {
    expect(allocZoneReject("AUP-1", "allocate")).toBeNull();
    expect(allocZoneReject(ALLOC_CANCEL_ZONE, "allocate")).toBeTruthy();
  });

  it("kind 缺失（还没定型）时不误放行到撤销区", () => {
    expect(allocZoneReject(ALLOC_CANCEL_ZONE, null)).toBeTruthy();
    expect(allocZoneReject(ALLOC_CANCEL_ZONE, undefined)).toBeTruthy();
  });
});

describe("statusZoneKey / parseStatusZone", () => {
  it("往返一致：标记区与撤销区分得开", () => {
    expect(parseStatusZone(statusZoneKey("DIVIDE", true))).toEqual({ action: "DIVIDE", on: true });
    expect(parseStatusZone(statusZoneKey("DIVIDE", false))).toEqual({ action: "DIVIDE", on: false });
  });

  it("拖回缓冲区（null）不产生动作，而不是当成撤销", () => {
    expect(parseStatusZone(null)).toBeNull();
    expect(parseStatusZone("")).toBeNull();
  });

  it("未知/伪造的区键一律忽略", () => {
    expect(parseStatusZone("add:NOT_A_REAL_ACTION")).toBeNull();
    expect(parseStatusZone("zone:add:DIVIDE")).toBeNull();
  });
});

describe("previewStatusCodes", () => {
  it("目标全集 → 色码；撤销就是把动作从集合里去掉，颜色自然减得掉", () => {
    const all = new Set(["DIVIDE", "HEALTH_CHECK"] as const);
    expect(previewStatusCodes(all)).toEqual(["NEED_DIVIDE", "HEALTH_ABNORMAL"]);
    const afterCancel = new Set([...all].filter((a) => a !== "DIVIDE"));
    expect(previewStatusCodes(afterCancel)).toEqual(["HEALTH_ABNORMAL"]);
  });

  it("清空目标状态 → 无色码（网格该回到中性色，而不是留着服务端那层）", () => {
    expect(previewStatusCodes(new Set())).toEqual([]);
  });
});
