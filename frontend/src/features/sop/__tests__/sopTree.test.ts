import { describe, it, expect } from "vitest";
import type { SopDocument, SopNode } from "@/api/domains/sop.api";
import { buildSopTree, collectSopSubtreeIds, documentsOfNode, sopNodePath } from "../sopTree";

const node = (id: number, parentId: number | null, name: string): SopNode => ({
  id,
  parentId,
  name,
  sortOrder: 0,
});

/** A(1) → B(2) → C(3)，另有独立顶层 D(4) */
const NODES = [node(1, null, "A"), node(2, 1, "B"), node(3, 2, "C"), node(4, null, "D")];

describe("buildSopTree", () => {
  it("按 parentId 组装层级", () => {
    const tree = buildSopTree(NODES);
    expect(tree.map((n) => n.id)).toEqual([1, 4]);
    expect(tree[0].children.map((n) => n.id)).toEqual([2]);
    expect(tree[0].children[0].children.map((n) => n.id)).toEqual([3]);
  });

  it("父节点不存在的孤儿节点当顶层处理，不能整棵消失", () => {
    const tree = buildSopTree([node(9, 999, "孤儿")]);
    expect(tree.map((n) => n.id)).toEqual([9]);
  });

  it("自指的脏数据不会挂到自己下面", () => {
    const tree = buildSopTree([node(7, 7, "自环")]);
    expect(tree.map((n) => n.id)).toEqual([7]);
    expect(tree[0].children).toEqual([]);
  });
});

describe("sopNodePath", () => {
  it("拼出全路径", () => {
    expect(sopNodePath(NODES, 3)).toBe("A / B / C");
    expect(sopNodePath(NODES, 1)).toBe("A");
  });

  it("未分类与未知 id 都返回 null", () => {
    expect(sopNodePath(NODES, null)).toBeNull();
    expect(sopNodePath(NODES, 12345)).toBeNull();
  });
});

describe("collectSopSubtreeIds", () => {
  it("含自己与全部子孙", () => {
    expect([...collectSopSubtreeIds(NODES, 1)].sort()).toEqual([1, 2, 3]);
    expect([...collectSopSubtreeIds(NODES, 3)]).toEqual([3]);
  });

  it("成环的脏数据不会死循环", () => {
    const loop = [node(1, 2, "A"), node(2, 1, "B")];
    expect([...collectSopSubtreeIds(loop, 1)].sort()).toEqual([1, 2]);
  });
});

describe("documentsOfNode", () => {
  const doc = (id: number, nodeId: number | null): SopDocument =>
    ({ id, nodeId, fileId: "f", title: `t${id}`, sortOrder: 0 }) as SopDocument;

  it("只取直接挂在该分类下的，未分类用 null 查", () => {
    const docs = [doc(1, 1), doc(2, null), doc(3, 2)];
    expect(documentsOfNode(docs, null).map((d) => d.id)).toEqual([2]);
    expect(documentsOfNode(docs, 1).map((d) => d.id)).toEqual([1]);
    expect(documentsOfNode(docs, 9)).toEqual([]);
  });
});
