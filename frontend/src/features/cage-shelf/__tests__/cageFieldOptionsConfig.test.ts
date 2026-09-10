import { describe, expect, it } from "vitest";
import {
  hasOptionsType,
  mergeOptionsConfig,
  parseFieldConfig,
  readOptionsConfig,
  type OptionsConfigValues,
} from "../utils/cageFieldOptionsConfig";

/**
 * 回归：字段 config 的四个候选能力开关必须「只增删这四个键」，
 * 不能把结构化题型用的 choiceType / columns / fields 等既有键冲掉。
 */

const v = (over: Partial<OptionsConfigValues> = {}): OptionsConfigValues => ({
  optionsSource: "",
  restrictToAup: "YES",
  allowManualInput: "NO",
  allowAddOption: "NO",
  ...over,
});

describe("hasOptionsType", () => {
  it("选择类题型为真，纯输入/结构化题型为假", () => {
    expect(hasOptionsType("combo")).toBe(true);
    expect(hasOptionsType("select")).toBe(true);
    expect(hasOptionsType("text")).toBe(false);
    expect(hasOptionsType("table")).toBe(false);
  });
});

describe("parseFieldConfig / readOptionsConfig", () => {
  it("非法或非对象 JSON 回退空对象，不抛", () => {
    expect(parseFieldConfig("{oops")).toEqual({});
    expect(parseFieldConfig("[]")).toEqual({});
    expect(parseFieldConfig(null)).toEqual({});
    expect(readOptionsConfig("{oops")).toEqual(v());
  });

  it("restrictToAup 缺省按 true、其余缺省按 false 回退", () => {
    expect(readOptionsConfig('{"optionsSource":"AUP_ANIMAL_STRAIN"}')).toEqual(
      v({ optionsSource: "AUP_ANIMAL_STRAIN" }),
    );
    expect(readOptionsConfig('{"restrictToAup":false,"allowAddOption":true}')).toEqual(
      v({ restrictToAup: "NO", allowAddOption: "YES" }),
    );
  });
});

describe("mergeOptionsConfig", () => {
  it("合并保留 choiceType 等既有键，且等于默认值的开关不落键", () => {
    const out = mergeOptionsConfig('{"choiceType":"single"}', "combo", v({ optionsSource: "AUP_ANIMAL_STRAIN" }));
    expect(JSON.parse(out!)).toEqual({ choiceType: "single", optionsSource: "AUP_ANIMAL_STRAIN" });
  });

  it("restrictToAup=否 才落 false；allowAddOption/allowManualInput 只在开启时落 true", () => {
    const out = mergeOptionsConfig(
      null,
      "combo",
      v({ optionsSource: "AUP_ANIMAL_STRAIN", restrictToAup: "NO", allowManualInput: "YES", allowAddOption: "YES" }),
    );
    expect(JSON.parse(out!)).toEqual({
      optionsSource: "AUP_ANIMAL_STRAIN",
      restrictToAup: false,
      allowManualInput: true,
      allowAddOption: true,
    });
  });

  it("allowManualInput 对 select 无意义：切走 combo 后该键被清掉", () => {
    const out = mergeOptionsConfig('{"allowManualInput":true}', "select", v({ optionsSource: "AUP_ANIMAL_STRAIN" }));
    expect(JSON.parse(out!)).not.toHaveProperty("allowManualInput");
  });

  it("清空候选来源会连带去掉三个依赖键", () => {
    const out = mergeOptionsConfig(
      '{"optionsSource":"AUP_ANIMAL_STRAIN","restrictToAup":false,"allowAddOption":true}',
      "combo",
      v(),
    );
    expect(out).toBeNull();
  });

  it("非选择类题型原样回传 config，不做重写", () => {
    const raw = '{"columns":[ {"k":1} ]}';
    expect(mergeOptionsConfig(raw, "table", v({ optionsSource: "AUP_ANIMAL_STRAIN" }))).toBe(raw);
    expect(mergeOptionsConfig(null, "text", v())).toBeNull();
  });
});
