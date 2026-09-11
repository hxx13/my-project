import { describe, it, expect } from "vitest";
import {
  EMPTY_BATCH,
  applyResults,
  batchOf,
  clearBatch,
  groupItems,
  moveItem,
  removeItem,
  setParams,
  summarize,
  upsertItem,
  type PendingBatch,
  type PendingItem,
} from "./pendingBatch";

const item = (cageId: string, over: Partial<PendingItem> = {}): PendingItem => ({
  cageId,
  label: `位置 ${cageId}`,
  shelveId: "s1",
  ...over,
});

const batch = (items: PendingItem[], failed: PendingBatch["failed"] = []): PendingBatch => ({
  items,
  params: {},
  failed,
});

describe("upsertItem", () => {
  it("新条目追加到末尾", () => {
    const b = upsertItem(batch([item("a")]), item("b"));
    expect(b.items.map((x) => x.cageId)).toEqual(["a", "b"]);
  });

  it("同一笼位重复加入时原地替换、不打乱顺序", () => {
    const b = upsertItem(batch([item("a"), item("b"), item("c")]), item("b", { form: { 1: "x" } }));
    expect(b.items.map((x) => x.cageId)).toEqual(["a", "b", "c"]);
    expect(b.items[1].form).toEqual({ 1: "x" });
  });

  it("重新加入会摘掉该笼位上次的失败记录", () => {
    const b = upsertItem(batch([], [{ cageId: "a", label: "位置 a", reason: "已被占用" }]), item("a"));
    expect(b.failed).toHaveLength(0);
  });
});

describe("removeItem / moveItem / setParams", () => {
  it("移除条目同时清掉它的失败记录", () => {
    const b = removeItem(batch([item("a"), item("b")], [{ cageId: "a", label: "位置 a", reason: "x" }]), "a");
    expect(b.items.map((x) => x.cageId)).toEqual(["b"]);
    expect(b.failed).toHaveLength(0);
  });

  it("调序就是提交顺序", () => {
    const b = moveItem(batch([item("a"), item("b"), item("c")]), 2, 0);
    expect(b.items.map((x) => x.cageId)).toEqual(["c", "a", "b"]);
  });

  it("越界调序返回原对象（不抛错）", () => {
    const src = batch([item("a")]);
    expect(moveItem(src, 0, 5)).toBe(src);
    expect(moveItem(src, 0, 0)).toBe(src);
  });

  it("参数是合并而不是覆盖", () => {
    const b = setParams(setParams(batch([item("a")]), { aupId: 1 }), { piName: "卢今" });
    expect(b.params).toEqual({ aupId: 1, piName: "卢今" });
  });
});

describe("applyResults —— 成功的移出、失败的留住并写明原因", () => {
  it("混合结果：1 成功 1 失败", () => {
    const b = applyResults(batch([item("a"), item("b")]), [
      { cageId: "a", ok: true },
      { cageId: "b", ok: false, reason: "该笼位已被他人占用" },
    ]);
    expect(b.items.map((x) => x.cageId)).toEqual(["b"]);
    expect(b.failed).toEqual([{ cageId: "b", label: "位置 b", reason: "该笼位已被他人占用" }]);
  });

  it("全成功则清空条目且无失败记录", () => {
    const b = applyResults(batch([item("a")]), [{ cageId: "a", ok: true }]);
    expect(b.items).toHaveLength(0);
    expect(b.failed).toHaveLength(0);
  });

  it("失败没给原因时给兜底文案", () => {
    const b = applyResults(batch([item("a")]), [{ cageId: "a", ok: false }]);
    expect(b.failed[0].reason).toBe("提交失败");
  });

  it("本轮没提交到的条目原样保留（不被当成失败）", () => {
    const b = applyResults(batch([item("a"), item("b")]), [{ cageId: "a", ok: true }]);
    expect(b.items.map((x) => x.cageId)).toEqual(["b"]);
    expect(b.failed).toHaveLength(0);
  });

  it("failed 只反映本次结果，不累积上次的", () => {
    const first = applyResults(batch([item("a"), item("b")]), [
      { cageId: "a", ok: false, reason: "第一次失败" },
      { cageId: "b", ok: false, reason: "第一次失败" },
    ]);
    const second = applyResults(first, [{ cageId: "a", ok: true }]);
    expect(second.items.map((x) => x.cageId)).toEqual(["b"]);
    expect(second.failed.map((f) => f.reason)).toEqual(["第一次失败"]);
  });
});

describe("按模式隔离 / 取值", () => {
  it("没有该模式时返回空批次", () => {
    expect(batchOf({}, "allocate")).toBe(EMPTY_BATCH);
  });

  it("两个模式的缓冲互不影响（切模式串味会让 A 的条目出现在 B 里）", () => {
    const all = { allocate: batch([item("a")]), division: batch([item("x")]) };
    expect(batchOf(all, "allocate").items.map((i) => i.cageId)).toEqual(["a"]);
    expect(batchOf(all, "division").items.map((i) => i.cageId)).toEqual(["x"]);
  });

  it("clearBatch 只清空自己那批", () => {
    expect(clearBatch()).toEqual({ items: [], params: {}, failed: [] });
  });
});

describe("summarize", () => {
  it("统计成功/失败条数", () => {
    expect(summarize([{ cageId: "a", ok: true }, { cageId: "b", ok: false }, { cageId: "c", ok: true }]))
      .toEqual({ ok: 2, failed: 1 });
  });
});

describe("groupItems", () => {
  const mk = (cageId: string, extra: Partial<PendingItem> = {}): PendingItem => ({
    cageId,
    label: cageId,
    shelveId: "s1",
    ...extra,
  });

  it("按 keyOf 分组，保持组内原顺序", () => {
    const items = [mk("a", { aupId: "A1" }), mk("b", { aupId: "A2" }), mk("c", { aupId: "A1" })];
    const g = groupItems(items, (it) => it.aupId ?? "");
    expect([...g.keys()]).toEqual(["A1", "A2"]);
    expect(g.get("A1")!.map((x) => x.cageId)).toEqual(["a", "c"]);
    expect(g.get("A2")!.map((x) => x.cageId)).toEqual(["b"]);
  });

  it("空 items 返回空 Map", () => {
    expect(groupItems([], () => "x").size).toBe(0);
  });
});

describe("归属字段覆盖语义", () => {
  it("upsertItem 就地覆盖归属、不换位置", () => {
    const mk = (cageId: string): PendingItem => ({ cageId, label: cageId, shelveId: "s1" });
    let b: PendingBatch = { items: [mk("a"), mk("b"), mk("c")], params: {}, failed: [] };
    b = upsertItem(b, { ...b.items[2]!, aupId: "A9" });
    expect(b.items.map((x) => x.cageId)).toEqual(["a", "b", "c"]);
    expect(b.items[2]!.aupId).toBe("A9");
    b = upsertItem(b, { ...b.items[2]!, aupId: undefined });
    expect(b.items[2]!.aupId).toBeUndefined();
    expect(b.items.map((x) => x.cageId)).toEqual(["a", "b", "c"]);
  });
});
