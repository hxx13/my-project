// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  STUDENT_NAV_REGISTRY,
  collectStudentRegistryItems,
  createStudentNavContext,
  type StudentNavRegistryGroup,
  type StudentNavRegistryItem,
} from "./studentNavRegistry";
import { LayoutGrid } from "lucide-react";

describe("studentNavRegistry", () => {
  it("collectStudentRegistryItems flattens a group's items", () => {
    const items: StudentNavRegistryItem[] = [
      {
        id: "a",
        path: "/student/a",
        label: "A",
        icon: LayoutGrid,
        fallbackMinRole: "MEMBER",
        sidebarVisible: () => true,
      },
      {
        id: "b",
        path: "/student/b",
        label: "B",
        icon: LayoutGrid,
        fallbackMinRole: "MEMBER",
        sidebarVisible: () => true,
      },
    ];
    const group: StudentNavRegistryGroup = { id: "g", title: "G", items };
    expect(collectStudentRegistryItems(group)).toHaveLength(2);
  });

  it("STUDENT_NAV_REGISTRY has 6 groups, 9 items, and the exact ordered paths", () => {
    expect(STUDENT_NAV_REGISTRY).toHaveLength(6);
    const allItems = STUDENT_NAV_REGISTRY.flatMap((g) => g.items);
    expect(allItems).toHaveLength(9);
    expect(allItems.map((i) => i.path)).toEqual([
      "/student/cage-shelf",
      "/student/rooms",
      "/student/material",
      "/student/animal-order",
      "/student/aup",
      "/student/notifications",
      "/student/obligations",
      "/student/feedback",
      "/student/settings",
    ]);
  });

  it("createStudentNavContext builds a context object", () => {
    expect(createStudentNavContext("MEMBER", [])).toEqual({ role: "MEMBER", permNodes: [] });
  });
});
