import { describe, it, expect } from "vitest";
import {
  splitGroups,
  extractPiPrefixFromGroupName,
  groupTokenMatches,
  belongsToGroup,
  cellGroupName,
  rackMatchesGroup,
} from "./groupMatch";

describe("splitGroups", () => {
  it("按逗号/顿号/分号拆分并去空去重", () => {
    expect(splitGroups("卢令的课题组, 张伟的课题组")).toEqual(["卢令的课题组", "张伟的课题组"]);
    expect(splitGroups("A、B；C;D，E")).toEqual(["A", "B", "C", "D", "E"]);
    expect(splitGroups("A,A")).toEqual(["A"]);
    expect(splitGroups("  ")).toEqual([]);
    expect(splitGroups(null)).toEqual([]);
  });
});

describe("extractPiPrefixFromGroupName", () => {
  it("剥「的课题组」/「课题组」后缀，或取「的」前段", () => {
    expect(extractPiPrefixFromGroupName("卢令的课题组")).toBe("卢令");
    expect(extractPiPrefixFromGroupName("卢令课题组")).toBe("卢令");
    expect(extractPiPrefixFromGroupName("卢令的团队")).toBe("卢令");
    expect(extractPiPrefixFromGroupName("卢令")).toBe("");
  });
});

describe("groupTokenMatches", () => {
  it("精确匹配", () => {
    expect(groupTokenMatches("卢令", "卢令")).toBe(true);
  });
  it("双向包含", () => {
    expect(groupTokenMatches("卢令组", "卢令")).toBe(true);
    expect(groupTokenMatches("卢令", "卢令的课题组")).toBe(true);
  });
  it("PI 前缀提取后匹配", () => {
    expect(groupTokenMatches("卢令的课题组", "卢令")).toBe(true);
  });
  it("单字符不参与包含匹配", () => {
    expect(groupTokenMatches("王", "李")).toBe(false);
  });
  it("空值不匹配", () => {
    expect(groupTokenMatches("", "卢令")).toBe(false);
    expect(groupTokenMatches("卢令", "")).toBe(false);
  });
  it("提取出的 PI 前缀为单字符时不参与匹配（>=2 阈值）", () => {
    expect(groupTokenMatches("王的课题组", "王")).toBe(false);
  });
});

describe("cellGroupName", () => {
  it("优先 projectPiName，其次 piName，再次 cageBoxInfo 三档", () => {
    expect(cellGroupName({ projectPiName: "卢令" })).toBe("卢令");
    expect(cellGroupName({ piName: "张伟" })).toBe("张伟");
    expect(cellGroupName({ cageBoxInfo: { ProjectPiName: "李娜" } })).toBe("李娜");
    expect(cellGroupName({ cageBoxInfo: { projectPiName: "王芳" } })).toBe("王芳");
    expect(cellGroupName({ cageBoxInfo: { piName: "赵敏" } })).toBe("赵敏");
    expect(cellGroupName({})).toBe("");
  });
});

describe("belongsToGroup", () => {
  it("多课题组字段中任一命中", () => {
    expect(belongsToGroup("卢令的课题组, 张伟的课题组", "张伟")).toBe(true);
    expect(belongsToGroup("卢令的课题组、张伟的课题组", "卢令")).toBe(true);
    expect(belongsToGroup("卢令的课题组; 张伟的课题组", "王芳")).toBe(false);
  });
  it("空目标或空字段返回 false", () => {
    expect(belongsToGroup("卢令的课题组", "")).toBe(false);
    expect(belongsToGroup("", "卢令")).toBe(false);
  });
});

describe("rackMatchesGroup", () => {
  const cells = [{ projectPiName: "卢令" }, { piName: "张伟" }];

  it("任一笼位命中即算命中", () => {
    expect(rackMatchesGroup(cells, "卢令的课题组")).toBe(true);
    expect(rackMatchesGroup(cells, "张伟的课题组")).toBe(true);
  });
  it("多课题组字段命中", () => {
    expect(rackMatchesGroup(cells, "王芳的课题组, 张伟的课题组")).toBe(true);
  });
  it("不命中返回 false", () => {
    expect(rackMatchesGroup(cells, "陈静")).toBe(false);
  });
  it("空课题组名返回 false", () => {
    expect(rackMatchesGroup(cells, "")).toBe(false);
  });
  it("空笼位列表返回 false", () => {
    expect(rackMatchesGroup([], "卢令的课题组")).toBe(false);
  });
});
