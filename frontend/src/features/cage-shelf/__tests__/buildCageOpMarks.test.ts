import { describe, expect, it } from "vitest";
import { buildCageOpMarks, type CageOpMark } from "../useCageOpSelect";

describe("buildCageOpMarks", () => {
  it("多源转移：每个源与每个目标都被标记，同一请求共用一个标记", () => {
    const m = buildCageOpMarks([
      {
        id: "r1",
        opType: "transfer",
        sourceAnimalCageId: "s1",
        targetAnimalCageIds: ["t1", "t2"],
        pairs: [
          { source: "s1", target: "t1" },
          { source: "s2", target: "t2" },
        ],
      },
    ]);
    expect(m.get("s1")).toBeDefined();
    expect(m.get("s2")).toBeDefined();
    expect(m.get("t1")).toBeDefined();
    expect(m.get("t2")).toBeDefined();
    // 同一请求同色/同 label：s2 与 s1 指向同一个标记对象
    expect(m.get("s2")).toBe(m.get("s1"));
    expect(m.get("t2")).toBe(m.get("t1"));
    expect(m.size).toBe(4);
  });

  it("单源多目标（无 pairs）：源只标记一次，每个目标各一个", () => {
    const m = buildCageOpMarks([
      {
        id: "r2",
        opType: "transfer",
        sourceAnimalCageId: "s1",
        targetAnimalCageIds: ["t1", "t2", "t3"],
      },
    ]);
    expect(m.get("s1")).toBeDefined();
    expect(m.get("t1")).toBeDefined();
    expect(m.get("t2")).toBeDefined();
    expect(m.get("t3")).toBeDefined();
    expect(m.size).toBe(4);
  });

  it("分笼（无 pairs）仍走旧路径：源 + 全部目标", () => {
    const m = buildCageOpMarks([
      {
        id: "r3",
        opType: "divide",
        sourceAnimalCageId: "s1",
        targetAnimalCageIds: ["t1", "t2"],
      },
    ]);
    const mark = m.get("s1") as CageOpMark;
    expect(mark.kind).toBe("divide");
    expect(mark.label).toBe("分笼审核中");
    expect(m.get("t1")).toBe(mark);
    expect(m.get("t2")).toBe(mark);
    expect(m.size).toBe(3);
  });
});
