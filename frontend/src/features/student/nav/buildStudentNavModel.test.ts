import { describe, it, expect, vi } from "vitest";
import type { AdminNavConfigNode } from "@/api/domains/adminNavConfig.api";
import type { PublicPagePermissionNode } from "@/api/domains/pagePermission.api";
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

/** 侧栏 ENTRY 权限节点：enabled=0 会令对应 path 的 canShowWebEntry 返回 false */
const disablingPermNode: PublicPagePermissionNode = {
  nodeKey: "perm-disable-cage-shelf",
  platform: "WEB",
  nodeType: "ENTRY",
  pathOrRoute: "/student/cage-shelf",
  entrySource: "sidebar",
  minRole: "MEMBER",
  enabled: 0,
};

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

  it("drops an ITEM whose registry entry is hidden by sidebarVisible", () => {
    const nodes = [
      groupNode("g1", "空间", [
        itemNode("it1", "/student/cage-shelf", "LayoutGrid"),
        itemNode("it2", "/student/rooms", "DoorOpen"),
      ]),
    ];
    const ctx = { role: "MEMBER", permNodes: [disablingPermNode] };

    const groups = convertStudentConfigToModel(nodes, ctx);

    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((it) => it.to)).toEqual(["/student/rooms"]);
  });
});

describe("buildStudentNavModel fallback", () => {
  it("falls back to registry (6 groups / 9 items) when config is empty", async () => {
    const result = await buildStudentNavModel({ role: "MEMBER", permNodes: [] });

    expect(result.sidebarGroups).toHaveLength(6);
    expect(result.flatNavigableItems).toHaveLength(9);
  });

  it("excludes a hidden registry item from the fallback output", async () => {
    const result = await buildStudentNavModel({ role: "MEMBER", permNodes: [disablingPermNode] });

    expect(result.sidebarGroups).toHaveLength(6);
    expect(result.flatNavigableItems).toHaveLength(8);
    expect(result.flatNavigableItems.some((it) => it.path === "/student/cage-shelf")).toBe(false);
  });
});
