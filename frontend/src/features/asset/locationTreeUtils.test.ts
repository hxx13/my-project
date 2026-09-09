import { describe, it, expect } from "vitest";
import type { AssetLocationNode } from "@/api/domains/assetLocation.api";
import { filterTree, findPath, collectDescendantIds } from "./locationTreeUtils";

/** 三层树：实验楼A(1) > 三层(2) > Animal Room 301(3) / 仪器室(4)；实验楼A > 四层(5)；实验楼B(6) */
const TREE: AssetLocationNode[] = [
  {
    id: 1,
    parentId: null,
    name: "实验楼A",
    children: [
      {
        id: 2,
        parentId: 1,
        name: "三层",
        children: [
          { id: 3, parentId: 2, name: "Animal Room 301" },
          { id: 4, parentId: 2, name: "仪器室" },
        ],
      },
      { id: 5, parentId: 1, name: "四层", children: [] },
    ],
  },
  { id: 6, parentId: null, name: "实验楼B" },
];

/** 只取 id 形状，便于断言祖先链是否保留 */
function idShape(nodes: AssetLocationNode[]): unknown {
  return nodes.map((n) => ({ id: n.id, children: idShape(n.children ?? []) }));
}

describe("filterTree — 按名称过滤并保留祖先链", () => {
  it("命中三层树的叶子，祖先链全部保留", () => {
    expect(idShape(filterTree(TREE, "animal"))).toEqual([
      { id: 1, children: [{ id: 2, children: [{ id: 3, children: [] }] }] },
    ]);
  });

  it("不区分大小写", () => {
    expect(idShape(filterTree(TREE, "ANIMAL room"))).toEqual(idShape(filterTree(TREE, "animal room")));
  });

  it("命中中间层节点时同样保留其祖先", () => {
    expect(idShape(filterTree(TREE, "三层"))).toEqual([
      { id: 1, children: [{ id: 2, children: [] }] },
    ]);
  });

  it("搜不到返回空数组", () => {
    expect(filterTree(TREE, "不存在的房间")).toEqual([]);
  });

  it("空 keyword 原样返回（同一引用）", () => {
    expect(filterTree(TREE, "")).toBe(TREE);
    expect(filterTree(TREE, "   ")).toBe(TREE);
  });
});

describe("findPath — 根到目标节点的路径", () => {
  it("根节点路径长度为 1", () => {
    expect(findPath(TREE, 1)).toHaveLength(1);
    expect(findPath(TREE, 1)[0].id).toBe(1);
  });

  it("叶子节点返回完整路径", () => {
    expect(findPath(TREE, 3).map((n) => n.id)).toEqual([1, 2, 3]);
  });

  it("找不到返回空数组", () => {
    expect(findPath(TREE, 999)).toEqual([]);
    expect(findPath([], 1)).toEqual([]);
  });
});

describe("collectDescendantIds — 含自身的后代 id", () => {
  it("含自身，递归收集所有后代", () => {
    expect(collectDescendantIds(TREE[0]).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("叶子节点只有自身", () => {
    expect(collectDescendantIds(TREE[0].children![0].children![0])).toEqual([3]);
  });
});
