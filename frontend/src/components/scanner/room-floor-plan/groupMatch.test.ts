import { describe, it, expect } from "vitest";
import { normalizeGroupName, cellGroupName, rackMatchesGroup } from "./groupMatch";

describe("normalizeGroupName", () => {
  it("去掉「的课题组」后缀与空白", () => {
    expect(normalizeGroupName("卢令的课题组")).toBe("卢令");
    expect(normalizeGroupName(" 卢令 课题组 ")).toBe("卢令");
    expect(normalizeGroupName("卢令")).toBe("卢令");
  });
});

describe("cellGroupName", () => {
  it("优先 projectPiName，其次 piName，再次 cageBoxInfo", () => {
    expect(cellGroupName({ projectPiName: "卢令" })).toBe("卢令");
    expect(cellGroupName({ piName: "张伟" })).toBe("张伟");
    expect(cellGroupName({ cageBoxInfo: { ProjectPiName: "李娜" } })).toBe("李娜");
    expect(cellGroupName({})).toBe("");
  });
});

describe("rackMatchesGroup", () => {
  const cells = [{ projectPiName: "卢令" }, { piName: "张伟" }];

  it("任一笼位命中即算命中", () => {
    expect(rackMatchesGroup(cells, "卢令的课题组")).toBe(true);
    expect(rackMatchesGroup(cells, "张伟的课题组")).toBe(true);
  });

  it("不命中返回 false", () => {
    expect(rackMatchesGroup(cells, "王芳的课题组")).toBe(false);
  });

  it("空课题组名返回 false", () => {
    expect(rackMatchesGroup(cells, "")).toBe(false);
  });

  it("空笼位列表返回 false", () => {
    expect(rackMatchesGroup([], "卢令的课题组")).toBe(false);
  });
});
