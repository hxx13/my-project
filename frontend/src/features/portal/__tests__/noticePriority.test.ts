import { describe, expect, it } from "vitest";
import { noticePriorityOf, portalExtension } from "../noticePriority";

describe("portalExtension", () => {
  it("把后端下发的字符串 extensionJson 解析成对象", () => {
    expect(portalExtension({ extensionJson: '{"priority":"important"}' })).toEqual({ priority: "important" });
  });

  it("对象形态原样吃", () => {
    expect(portalExtension({ extensionJson: { priority: "notice" } })).toEqual({ priority: "notice" });
  });

  it("脏数据不抛异常，退化成空对象", () => {
    expect(portalExtension({ extensionJson: "not json" })).toEqual({});
    expect(portalExtension({ extensionJson: "[1,2]" })).toEqual({});
    expect(portalExtension({ extensionJson: null })).toEqual({});
    expect(portalExtension({})).toEqual({});
  });
});

describe("noticePriorityOf", () => {
  // 回归：老代码直接读 item.extensionJson.priority，而接口下发的是字符串 → 恒 undefined → 全落「常规」
  it("字符串形态也能读出优先级（这是「优先级完全失效」的根因）", () => {
    expect(noticePriorityOf({ extensionJson: '{"priority":"important"}' })).toBe("important");
    expect(noticePriorityOf({ extensionJson: '{"priority":"notice"}' })).toBe("notice");
    expect(noticePriorityOf({ extensionJson: '{"priority":"routine"}' })).toBe("routine");
  });

  it("缺字段 / 乱七八糟的值一律当常规", () => {
    expect(noticePriorityOf({ extensionJson: '{"pinned":true}' })).toBe("routine");
    expect(noticePriorityOf({ extensionJson: '{"priority":"urgent"}' })).toBe("routine");
    expect(noticePriorityOf({})).toBe("routine");
  });
});
