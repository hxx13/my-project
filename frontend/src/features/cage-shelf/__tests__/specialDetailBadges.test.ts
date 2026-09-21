import { describe, it, expect } from "vitest";
import {
  compactDetailBadgeText,
  specialDetailItemsFor,
  healthBadgesFor,
  regionWriteTargets,
  isNonViolationStatus,
  detailZoneKey,
  parseDetailZone,
  parseStatusZone,
  detailParentsLast,
  CAGE_BOX_ACTIONS,
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

describe("healthBadgesFor（严重程度 + 瘙痒，最多两枚）", () => {
  /** 只带动作的暂存（抽屉里改了别的状态时就是这种形态，**没有** severity/itch 键） */
  const actionsOnly = (actions: CageBoxAction[]) => ({ currentActions: new Set<CageBoxAction>(actions) });

  it("没有暂存：直接读服务端带下来的值", () => {
    expect(healthBadgesFor("SEVERE", false)).toEqual([{ code: "SEVERE" }]);
    expect(healthBadgesFor("SEVERE", true)).toEqual([
      { code: "SEVERE" },
      { code: "ITCH", label: "瘙痒" },
    ]);
    expect(healthBadgesFor(null, false)).toEqual([]);
    expect(healthBadgesFor(undefined, undefined)).toEqual([]);
    expect(healthBadgesFor("", true)).toEqual([{ code: "ITCH", label: "瘙痒" }]);
  });

  it("核心回归：暂存里**没带**这两个键（改了别的状态）= 本次没动过 → 仍显示服务端的值", () => {
    expect(healthBadgesFor("MILD", true, actionsOnly(["HEALTH_CHECK"]))).toEqual([
      { code: "MILD" },
      { code: "ITCH", label: "瘙痒" },
    ]);
  });

  it("暂存里带了键 → 一律以暂存为准（覆盖服务端）", () => {
    expect(healthBadgesFor("MILD", false, { ...actionsOnly(["HEALTH_CHECK"]), currentSeverity: "SEVERE", currentItch: true }))
      .toEqual([{ code: "SEVERE" }, { code: "ITCH", label: "瘙痒" }]);
  });

  it("暂存里显式清空 → 不显示，哪怕服务端还挂着", () => {
    expect(healthBadgesFor("MILD", true, { ...actionsOnly(["HEALTH_CHECK"]), currentSeverity: null, currentItch: false }))
      .toEqual([]);
  });

  it("强绑定父状态：暂存里把「健康异常」关掉 → 两枚都不显示", () => {
    expect(healthBadgesFor("MILD", true, actionsOnly([]))).toEqual([]);
    expect(healthBadgesFor("MILD", true, actionsOnly(["DIVIDE"]))).toEqual([]);
  });

  it("父状态开着但还没选任何子值 → 不显示（没东西可标）", () => {
    expect(healthBadgesFor(null, false, actionsOnly(["HEALTH_CHECK"]))).toEqual([]);
  });
});

describe("isNonViolationStatus", () => {
  it("特殊饲养 / 合笼 / 明细 / 健康异常都不是违规行为（阈值界面据此把违规档改说成通知档）", () => {
    expect(isNonViolationStatus("SPECIAL_FEEDING")).toBe(true);
    expect(isNonViolationStatus("COHABITATION")).toBe(true);
    expect(isNonViolationStatus("SF_NEED_FEED")).toBe(true);
    // 2026-09-17 并入：健康异常到阈值只发兽医/所有者两条通知，不建违规。
    // 这条曾漏掉过一次（后端加了、前端没加 → 配置界面照旧显示「仅违规」），钉在这里防复发。
    expect(isNonViolationStatus("HEALTH_ABNORMAL")).toBe(true);
  });

  it("其余状态照旧可以配违规", () => {
    expect(isNonViolationStatus("NEED_DIVIDE")).toBe(false);
    expect(isNonViolationStatus("ANIMAL_TRANSFER")).toBe(false);
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

describe("明细色区键", () => {
  it("往返：键 → 明细项 + 方向", () => {
    expect(parseDetailZone(detailZoneKey("NEED_FEED", true))).toEqual({ itemCode: "NEED_FEED", on: true });
    expect(parseDetailZone(detailZoneKey("NO_WATER", false))).toEqual({ itemCode: "NO_WATER", on: false });
  });

  it("两个解析器各认各的前缀，互不误吞（`add:` 不当明细、`sfadd:` 不当状态）", () => {
    expect(parseDetailZone("add:DIVIDE")).toBeNull();
    expect(parseDetailZone("zone:DIVIDE")).toBeNull();
    expect(parseStatusZone("sfadd:NEED_FEED")).toBeNull();
    expect(parseDetailZone(null)).toBeNull();
    expect(parseDetailZone("sfadd:")).toBeNull();
  });
});

describe("detailParentsLast", () => {
  it("带子区的两张卡（特殊饲养 / 健康异常）挪到末尾，其余保持原序且两张卡之间固定先后", () => {
    expect(detailParentsLast(CAGE_BOX_ACTIONS).map((a) => a.action)).toEqual([
      "DIVIDE", "COHABITATION", "TRANSFER", "SPECIAL_BREEDING", "HEALTH_CHECK",
    ]);
  });

  it("列表里没有它们时原样返回（学生端按白名单过滤后可能没有）", () => {
    const only = CAGE_BOX_ACTIONS.filter((a) => a.action === "COHABITATION");
    expect(detailParentsLast(only).map((a) => a.action)).toEqual(["COHABITATION"]);
  });

  it("只有健康异常一个父状态时也排最后", () => {
    const only = CAGE_BOX_ACTIONS.filter((a) => a.action === "HEALTH_CHECK" || a.action === "TRANSFER");
    expect(detailParentsLast(only).map((a) => a.action)).toEqual(["TRANSFER", "HEALTH_CHECK"]);
  });
});
