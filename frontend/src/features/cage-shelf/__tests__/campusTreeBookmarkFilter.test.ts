import { describe, expect, it } from "vitest";
import { roomIdOf, shelveIdOf, subtreeHasBookmarked, visibleShelfChildren } from "../components/campusTreeBookmarkFilter";
import type { TreeNode } from "../constants";

/**
 * 「收藏」视图的过滤（2026-09-19 口径：收藏可落房间、也可落笼架，视图按收藏自然生成）。
 *
 * 三个容易踩的点：
 *   1. 收藏集为空时**整棵树都不该画**（否则收藏页看着跟筛选页一样，用户以为没生效）；
 *   2. 非房间层要跟着剪 —— 只有 R2 被收藏时，C2 那条整支都得消失，不能留个空校区；
 *   3. 只收藏了某几架时，房间**只露那几架**（整间铺开等于收藏没生效）。
 */

const room = (id: string, shelves: string[] = []): TreeNode => ({
  key: `r:${id}`, label: id, type: "room", raw: { roomId: id },
  children: shelves.map((s) => ({ key: `s:${s}`, label: s, type: "shelf", raw: { shelveId: s, roomId: id }, children: [] } as unknown as TreeNode)),
} as unknown as TreeNode);
const wrap = (key: string, type: string, children: TreeNode[]): TreeNode => ({ key, label: key, type, children } as unknown as TreeNode);

const tree: TreeNode[] = [
  wrap("c:1", "campus", [
    wrap("a:1", "area", [wrap("f:1", "floor", [room("R1", ["S1", "S2"]), room("R2", ["S3"])])]),
    wrap("a:2", "area", [wrap("f:2", "floor", [room("R3", ["S4"])])]),
  ]),
  wrap("c:2", "campus", [wrap("a:3", "area", [wrap("f:3", "floor", [room("R4", ["S5"])])])]),
];
const empty = new Set<string>();

describe("roomIdOf / shelveIdOf", () => {
  it("优先取 raw，缺了退回 key", () => {
    expect(roomIdOf(room("R1"))).toBe("R1");
    expect(roomIdOf({ key: "r:R9", label: "R9", type: "room", children: [] } as unknown as TreeNode)).toBe("R9");
    expect(shelveIdOf(room("R1", ["S1"]).children[0])).toBe("S1");
    expect(shelveIdOf({ key: "s:S9", label: "S9", type: "shelf", children: [] } as unknown as TreeNode)).toBe("S9");
  });
});

describe("subtreeHasBookmarked", () => {
  it("两边都空：任何分支都不保留", () => {
    expect(subtreeHasBookmarked(tree[0], empty, empty)).toBe(false);
  });

  it("收藏了后代房间：祖先校区/区域/楼层都保留", () => {
    expect(subtreeHasBookmarked(tree[0], new Set(["R2"]), empty)).toBe(true);
  });

  it("只收藏了笼架：它所属分支保留，房间自己也保留", () => {
    expect(subtreeHasBookmarked(tree[0], empty, new Set(["S3"]))).toBe(true);
    expect(subtreeHasBookmarked(room("R2", ["S3"]), empty, new Set(["S3"]))).toBe(true);
  });

  it("兄弟分支没收藏：整支剪掉", () => {
    expect(subtreeHasBookmarked(tree[1], new Set(["R2"]), empty)).toBe(false);
    expect(subtreeHasBookmarked(tree[1], empty, new Set(["S3"]))).toBe(false);
  });
});

describe("visibleShelfChildren", () => {
  it("收藏了房间：整间照常展开", () => {
    const r = room("R1", ["S1", "S2"]);
    expect(visibleShelfChildren(r, new Set(["R1"]), empty).map(shelveIdOf)).toEqual(["S1", "S2"]);
  });

  it("只收藏了一架：只露那一架", () => {
    const r = room("R1", ["S1", "S2"]);
    expect(visibleShelfChildren(r, empty, new Set(["S2"])).map(shelveIdOf)).toEqual(["S2"]);
  });

  it("谁都没收藏：一架都不露", () => {
    const r = room("R1", ["S1", "S2"]);
    expect(visibleShelfChildren(r, empty, empty).map(shelveIdOf)).toEqual([]);
  });
});
