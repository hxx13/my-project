import { describe, it, expect } from "vitest";
import type { AgvTag } from "@/api/domains/agvTag.api";
import {
  DEFAULT_TAG_COLOR,
  getAllTagOptions,
  getAllTagColors,
  getVisibleTags,
} from "./tagConfig";

const AGV_A = "172.22.159.16";
const AGV_B = "172.22.159.18";

function tag(over: Partial<AgvTag> & Pick<AgvTag, "name">): AgvTag {
  return {
    id: 1,
    color: "#22c55e",
    scope: "world",
    robotIp: null,
    builtin: false,
    sortOrder: 0,
    ...over,
  };
}

const TAGS: AgvTag[] = [
  tag({ id: 1, name: "充电", color: "#22c55e", builtin: true }),
  tag({ id: 2, name: "作业", color: "#f59e0b", builtin: true }),
  tag({ id: 3, name: "满载", color: "#a855f7", scope: "agv", robotIp: AGV_A }),
  tag({ id: 4, name: "待检", color: "#ef4444", scope: "agv", robotIp: AGV_B }),
];

describe("tagConfig — 标签派生", () => {
  it("内置标签与自定义标签同构，不再分两套体系", () => {
    expect(getAllTagOptions(TAGS)).toEqual(["充电", "作业", "满载", "待检"]);
  });

  it("颜色映射覆盖全部标签，内置标签的颜色同样来自数据而非硬编码", () => {
    expect(getAllTagColors(TAGS)).toEqual({
      充电: "#22c55e",
      作业: "#f59e0b",
      满载: "#a855f7",
      待检: "#ef4444",
    });
  });

  it("颜色缺失时回落到默认色", () => {
    expect(getAllTagColors([tag({ name: "无色", color: "" })])).toEqual({
      无色: DEFAULT_TAG_COLOR,
    });
  });

  it("agv 作用域标签只对绑定的那台车可见，world 标签对所有车可见", () => {
    expect(getVisibleTags(AGV_A, TAGS)).toEqual(["充电", "作业", "满载"]);
    expect(getVisibleTags(AGV_B, TAGS)).toEqual(["充电", "作业", "待检"]);
  });

  it("空标签集不炸", () => {
    expect(getAllTagOptions([])).toEqual([]);
    expect(getAllTagColors([])).toEqual({});
    expect(getVisibleTags(AGV_A, [])).toEqual([]);
  });
});
