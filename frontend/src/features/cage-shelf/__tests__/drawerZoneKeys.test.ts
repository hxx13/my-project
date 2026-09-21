import { describe, expect, it } from "vitest";
import {
  ALLOC_CANCEL_ZONE, allocZoneReject, parseStatusZone, previewStatusCodes, statusZoneKey,
  parseDetailZone, detailZoneKey, severityZoneKey, parseSeverityZone, SEVERITY_CLEAR_ZONE,
  CAGE_BOX_ACTIONS,
} from "../constants";

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

/**
 * 严重程度色区（互斥单选）：标记区**一档一个**，撤销区**只有一个**。
 * 与明细不同 —— 明细是多选，撤销得逐项配；严重程度撤销一档就是空操作，配三个撤销区只会多出无意义的卡。
 */
describe("severityZoneKey / parseSeverityZone", () => {
  it("往返一致：标记区带 itemCode，撤销区 itemCode 为 null（= 清空）", () => {
    expect(parseSeverityZone(severityZoneKey("MILD"))).toEqual({ itemCode: "MILD" });
    expect(parseSeverityZone(severityZoneKey("SEVERE"))).toEqual({ itemCode: "SEVERE" });
    expect(parseSeverityZone(SEVERITY_CLEAR_ZONE)).toEqual({ itemCode: null });
  });

  it("拖回缓冲区（null/空）不产生动作，而不是当成清空", () => {
    expect(parseSeverityZone(null)).toBeNull();
    expect(parseSeverityZone("")).toBeNull();
  });

  it("伪造的区键一律忽略（空 itemCode 也不行）", () => {
    expect(parseSeverityZone("sevadd:")).toBeNull();
    expect(parseSeverityZone("sevclear:X")).toBeNull();
    expect(parseSeverityZone("zone:sevadd:MILD")).toBeNull();
  });
});

/**
 * 三个前缀各认各的 —— 这是最容易出的错：`add:`/`del:`（状态）、`sfadd:`/`sfdel:`（明细）、
 * `sevadd:`（严重程度）。任一个解析器放宽了，拖进一个区就会同时改两种东西。
 */
describe("三种色区键互不误吞", () => {
  it("状态区解析器不认明细/严重程度区", () => {
    expect(parseStatusZone(detailZoneKey("NEED_FEED", true))).toBeNull();
    expect(parseStatusZone(severityZoneKey("MILD"))).toBeNull();
    expect(parseStatusZone(SEVERITY_CLEAR_ZONE)).toBeNull();
  });

  it("明细区解析器不认状态/严重程度区", () => {
    expect(parseDetailZone(statusZoneKey("DIVIDE", true))).toBeNull();
    expect(parseDetailZone(severityZoneKey("MILD"))).toBeNull();
    expect(parseDetailZone(SEVERITY_CLEAR_ZONE)).toBeNull();
  });

  it("严重程度区解析器不认状态/明细区", () => {
    expect(parseSeverityZone(statusZoneKey("HEALTH_CHECK", true))).toBeNull();
    expect(parseSeverityZone(detailZoneKey("NO_WATER", false))).toBeNull();
  });

  it("每个状态动作都能拼出唯一的两枚区键（标记 / 撤销）", () => {
    const keys = CAGE_BOX_ACTIONS.flatMap((a) => [statusZoneKey(a.action, true), statusZoneKey(a.action, false)]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("previewStatusCodes", () => {  it("目标全集 → 色码；撤销就是把动作从集合里去掉，颜色自然减得掉", () => {
    const all = new Set(["DIVIDE", "HEALTH_CHECK"] as const);
    expect(previewStatusCodes(all)).toEqual(["NEED_DIVIDE", "HEALTH_ABNORMAL"]);
    const afterCancel = new Set([...all].filter((a) => a !== "DIVIDE"));
    expect(previewStatusCodes(afterCancel)).toEqual(["HEALTH_ABNORMAL"]);
  });

  it("清空目标状态 → 无色码（网格该回到中性色，而不是留着服务端那层）", () => {
    expect(previewStatusCodes(new Set())).toEqual([]);
  });
});
