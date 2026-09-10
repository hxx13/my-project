import { describe, it, expect } from "vitest";
import type { MaterialRequest } from "@/api/domains/material.api";
import {
  groupBySpec,
  initiallyCollapsedItems,
  initiallyCollapsedSpecs,
  NO_SPEC_KEY,
} from "./materialReviewGrouping";

function req(item: string, spec: string | undefined, status: string): MaterialRequest {
  return {
    id: `${item}::${spec ?? "none"}::${status}`,
    status,
    lines: [{ snapshotName: item, specSnapshot: spec }],
  } as unknown as MaterialRequest;
}

describe("initiallyCollapsedSpecs", () => {
  it("含待审请求的规格保持展开，无待审的规格折叠", () => {
    const collapsed = initiallyCollapsedSpecs([
      req("手套", "S", "PENDING"),
      req("手套", "M", "FULFILLED"),
      req("手套", "L", "FIRST_OK"),
    ]);

    expect(collapsed.has("手套::M")).toBe(true);
    expect(collapsed.has("手套::S")).toBe(false);
    expect(collapsed.has("手套::L")).toBe(false);
  });

  it("单品规物品不折叠", () => {
    expect(initiallyCollapsedSpecs([req("手套", "S", "FULFILLED")]).size).toBe(0);
  });

  it("同一物品的规格互不影响，按物品+规格分别判断", () => {
    const collapsed = initiallyCollapsedSpecs([
      req("手套", "S", "FULFILLED"),
      req("手套", "M", "FULFILLED"),
      req("口罩", "S", "FULFILLED"),
      req("口罩", "M", "PENDING"),
    ]);

    expect([...collapsed].sort()).toEqual(["口罩::S", "手套::M", "手套::S"]);
  });

  it("无规格快照的行归入 __no_spec__ 分组", () => {
    const collapsed = initiallyCollapsedSpecs([
      req("手套", undefined, "PENDING"),
      req("手套", "S", "FULFILLED"),
    ]);

    expect(groupBySpec([req("手套", undefined, "FULFILLED")]).has(NO_SPEC_KEY)).toBe(true);
    expect(collapsed.has(`手套::${NO_SPEC_KEY}`)).toBe(false);
    expect(collapsed.has("手套::S")).toBe(true);
  });
});

describe("initiallyCollapsedItems", () => {
  it("无待审请求的物品折叠，含待审的展开", () => {
    const collapsed = initiallyCollapsedItems([
      req("手套", "S", "FULFILLED"),
      req("口罩", "S", "PENDING"),
      req("鞋套", "S", "FIRST_OK"),
    ]);

    expect([...collapsed]).toEqual(["手套"]);
  });
});
