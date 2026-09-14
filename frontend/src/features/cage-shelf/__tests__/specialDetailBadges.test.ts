import { describe, it, expect } from "vitest";
import {
  compactDetailBadgeText,
  specialDetailItemsFor,
  regionWriteTargets,
  isNonViolationStatus,
  type CageBoxAction,
} from "@/features/cage-shelf/constants";

/**
 * 特殊饲养明细的三条口径：
 * ① 角标记法：首字「勿/不/禁/无」= 否定（−），末字是对象；
 * ② 角标取数：只认一个状态源（暂存优先），且强绑定「需特殊饲养」，父状态不在就不显示；
 * ③ 整层批量的写入目标：只写房间，绝不写楼层/校区自身的键。
 */

describe("compactDetailBadgeText", () => {
  it("需/勿 压成 +/− 加末字", () => {
    expect(compactDetailBadgeText("需加食")).toBe("+食");
    expect(compactDetailBadgeText("勿加水")).toBe("−水");
    expect(compactDetailBadgeText("不禁食")).toBe("−食");
  });

  it("名字太短就原样返回（不硬凑记号）", () => {
    expect(compactDetailBadgeText("食")).toBe("食");
    expect(compactDetailBadgeText("  ")).toBe("");
  });
});

describe("specialDetailItemsFor", () => {
  const withSf = (label = "需加食") => [
    { code: "SPECIAL_FEEDING", label: "需特殊饲养" },
    { code: "SF_NEED_FEED", label },
  ];
  /** 状态模式的暂存：目标动作全集 + 明细勾选集 */
  const staged = (actions: CageBoxAction[], details: string[]) => ({
    currentActions: new Set<CageBoxAction>(actions),
    currentDetails: new Set(details),
  });

  it("服务端状态：摘出 SF_ 项并去前缀", () => {
    expect(specialDetailItemsFor(withSf())).toEqual([{ code: "NEED_FEED", label: "需加食" }]);
  });

  it("强绑定：父状态「需特殊饲养」不在同一份状态里 → 一个都不显示", () => {
    expect(specialDetailItemsFor([{ code: "SF_NEED_FEED", label: "需加食" }])).toEqual([]);
    expect(specialDetailItemsFor([])).toEqual([]);
  });

  it("暂存优先：暂存里勾了别的项，不再看服务端", () => {
    expect(specialDetailItemsFor(withSf(), staged(["SPECIAL_BREEDING"], ["NO_WATER"])))
      .toEqual([{ code: "NO_WATER" }]);
  });

  it("暂存里把父状态关掉 → 明细也一律不显示（哪怕服务端还挂着）", () => {
    expect(specialDetailItemsFor(withSf(), staged([], ["NEED_FEED"]))).toEqual([]);
  });

  it("暂存里全取消 → 空集（预览=实提交：网格上角标跟着消失）", () => {
    expect(specialDetailItemsFor(withSf(), staged(["SPECIAL_BREEDING"], []))).toEqual([]);
  });
});

describe("isNonViolationStatus", () => {
  it("特殊饲养 / 合笼 / 明细都不是违规行为（阈值界面据此把违规档改说成通知档）", () => {
    expect(isNonViolationStatus("SPECIAL_FEEDING")).toBe(true);
    expect(isNonViolationStatus("COHABITATION")).toBe(true);
    expect(isNonViolationStatus("SF_NEED_FEED")).toBe(true);
  });

  it("其余状态照旧可以配违规", () => {
    expect(isNonViolationStatus("NEED_DIVIDE")).toBe(false);
    expect(isNonViolationStatus("HEALTH_ABNORMAL")).toBe(false);
    expect(isNonViolationStatus(null)).toBe(false);
  });
});

describe("regionWriteTargets", () => {
  it("楼层/校区当批量入口：只写可见房间，不写楼层键本身", () => {
    const extras = [{ regionType: "ROOM", regionId: "101" }, { regionType: "ROOM", regionId: "102" }];
    expect(regionWriteTargets("FLOOR", "10", extras)).toEqual(extras);
  });

  it("房间节点没有随行房间 → 就写自己", () => {
    expect(regionWriteTargets("ROOM", "101")).toEqual([{ regionType: "ROOM", regionId: "101" }]);
    expect(regionWriteTargets("ROOM", "101", [])).toEqual([{ regionType: "ROOM", regionId: "101" }]);
  });
});
