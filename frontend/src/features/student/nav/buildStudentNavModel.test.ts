import { describe, it, expect, vi } from "vitest";
import type { AdminNavConfigNode } from "@/api/domains/adminNavConfig.api";
import { convertStudentConfigToModel, buildStudentNavModel } from "./buildStudentNavModel";

vi.mock("@/api/domains/adminNavConfig.api", () => ({
  fetchAdminNavConfig: vi.fn().mockResolvedValue([]),
  ensureNavItems: vi.fn().mockResolvedValue({ created: 0, existed: 0 }),
}));

function itemNode(id: string, itemPath: string, itemIcon: string, visible = true): AdminNavConfigNode {
  return {
    id,
    parentId: "g1",
    type: "ITEM",
    title: id,
    itemPath,
    itemIcon,
    itemBadgeKey: null,
    sortOrder: 0,
    visible,
    children: [],
  };
}

function groupNode(id: string, title: string, children: AdminNavConfigNode[]): AdminNavConfigNode {
  return {
    id,
    parentId: null,
    type: "GROUP",
    title,
    itemPath: null,
    itemIcon: null,
    itemBadgeKey: null,
    sortOrder: 0,
    visible: true,
    children,
  };
}

describe("convertStudentConfigToModel", () => {
  it("maps a GROUP with 2 visible ITEMs into 1 group with 2 items", () => {
    const nodes = [
      groupNode("g1", "空间", [
        itemNode("it1", "/student/cage-shelf", "LayoutGrid"),
        itemNode("it2", "/student/rooms", "DoorOpen"),
      ]),
    ];
    const ctx = { role: "MEMBER", permNodes: [] };

    const groups = convertStudentConfigToModel(nodes, ctx);

    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("g1");
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].items.map((it) => it.to)).toEqual(["/student/cage-shelf", "/student/rooms"]);
    expect(groups[0].items.map((it) => it.key)).toEqual(["it1", "it2"]);
  });

  it("skips ITEMs with visible=false", () => {
    const nodes = [
      groupNode("g1", "空间", [
        itemNode("it1", "/student/cage-shelf", "LayoutGrid"),
        itemNode("it2", "/student/rooms", "DoorOpen", false),
      ]),
    ];
    const ctx = { role: "MEMBER", permNodes: [] };

    const groups = convertStudentConfigToModel(nodes, ctx);

    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0].to).toBe("/student/cage-shelf");
  });
});

describe("buildStudentNavModel fallback", () => {
  it("falls back to registry (6 groups / 8 items) when config is empty", async () => {
    const result = await buildStudentNavModel({ role: "MEMBER", permNodes: [] });

    expect(result.sidebarGroups).toHaveLength(6);
    expect(result.flatNavigableItems).toHaveLength(8);
  });
});
