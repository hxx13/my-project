import { describe, expect, it } from "vitest";
import { groupKeyOf, resolveCageType } from "../components/CageCellOverlays";

/**
 * 批量转移的源准入：只有「饲养中(type 3)」且同课题组的笼位能参与。
 * 这两个判定必须是单一实现 —— 网格渲染和业务过滤共用，否则又会出现
 * 「界面看着能选、提交被后端拒」的错位。
 */

describe("resolveCageType", () => {
  it("直接给到 cageTypeCode 时用它", () => {
    expect(resolveCageType({ cageTypeCode: 3 })).toBe(3);
    expect(resolveCageType({ animalCageType: 2 })).toBe(2);
  });

  it("API 返回 0 时回退到 cageBoxInfo", () => {
    expect(resolveCageType({ animalCageType: 0, cageBoxInfo: { AnimalCageType: 3 } })).toBe(3);
  });

  it("合笼/特殊饲养视为饲养中（type 3）", () => {
    expect(resolveCageType({ specialStatuses: [{ code: "COHABITATION" } as any] })).toBe(3);
    expect(resolveCageType({ specialStatuses: [{ code: "SPECIAL_FEEDING" } as any] })).toBe(3);
  });

  it("从 stateLabel 兜底识别", () => {
    expect(resolveCageType({ stateLabel: "饲养中" })).toBe(3);
    expect(resolveCageType({ stateLabel: "空笼盒" })).toBe(2);
  });

  it("完全是空位时返回 undefined（不能当饲养中）", () => {
    expect(resolveCageType({ empty: true })).toBeUndefined();
  });
});

describe("groupKeyOf", () => {
  it("优先取 projectPiName", () => {
    expect(groupKeyOf({ projectPiName: "徐楠杰", projectGroup: "别的组" })).toBe("徐楠杰");
  });

  it("回退到 projectGroup / departmentName / detail", () => {
    expect(groupKeyOf({ projectGroup: "徐楠杰的课题组" })).toBe("徐楠杰的课题组");
    expect(groupKeyOf({ departmentName: "神经所" })).toBe("神经所");
    expect(groupKeyOf({ detail: { projectPiName: "detail里的PI" } })).toBe("detail里的PI");
  });

  it("取不到时返回空串 —— 调用方据此拒绝加入批量转移", () => {
    expect(groupKeyOf({})).toBe("");
    expect(groupKeyOf({ projectPiName: "   " })).toBe("");
  });

  it("同一课题组的笼位解析出同一个键（批量混组拦截的依据）", () => {
    const a = { projectPiName: "徐楠杰", cageTypeCode: 3 };
    const b = { projectPiName: "徐楠杰", projectGroup: "徐楠杰的课题组", cageTypeCode: 3 };
    const c = { projectPiName: "张三", cageTypeCode: 3 };
    expect(groupKeyOf(a)).toBe(groupKeyOf(b));
    expect(groupKeyOf(a)).not.toBe(groupKeyOf(c));
  });
});
