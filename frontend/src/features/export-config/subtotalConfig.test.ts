import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  emptyConfig,
  loadConfig,
  saveConfig,
  toQuery,
  blockIncluded,
  toggleBlock,
  toggleLevel,
  resetConfig,
  type SubtotalConfigState,
} from "./subtotalConfig";

const KEY = "test-export-config";

/** 内存版 localStorage，供 node 环境使用。 */
function makeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", makeStorage());
});

describe("emptyConfig / resetConfig", () => {
  it("两者都返回空配置（全保留、不排除板块）", () => {
    expect(emptyConfig()).toEqual({ offLevels: [], excludeBlocks: [] });
    expect(resetConfig()).toEqual({ offLevels: [], excludeBlocks: [] });
  });
});

describe("loadConfig 回落规则", () => {
  it("键不存在 → 空配置", () => {
    expect(loadConfig(KEY)).toEqual(emptyConfig());
  });

  it("非法 JSON → 空配置", () => {
    vi.stubGlobal("localStorage", makeStorage({ [KEY]: "{not json" }));
    expect(loadConfig(KEY)).toEqual(emptyConfig());
  });

  it("缺字段 → 空配置", () => {
    vi.stubGlobal("localStorage", makeStorage({ [KEY]: JSON.stringify({ offLevels: [] }) }));
    expect(loadConfig(KEY)).toEqual(emptyConfig());
  });

  it("字段类型错误（offLevels 是字符串） → 空配置", () => {
    vi.stubGlobal(
      "localStorage",
      makeStorage({ [KEY]: JSON.stringify({ offLevels: "lv1", excludeBlocks: [] }) }),
    );
    expect(loadConfig(KEY)).toEqual(emptyConfig());
  });

  it("数组元素类型错误 → 空配置", () => {
    vi.stubGlobal(
      "localStorage",
      makeStorage({ [KEY]: JSON.stringify({ offLevels: [1, 2], excludeBlocks: [] }) }),
    );
    expect(loadConfig(KEY)).toEqual(emptyConfig());
  });

  it("没有 localStorage 环境 → 空配置且不抛错", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => loadConfig(KEY)).not.toThrow();
    expect(loadConfig(KEY)).toEqual(emptyConfig());
  });

  it("合法结构 → 原样读出", () => {
    const state: SubtotalConfigState = { offLevels: ["lv2"], excludeBlocks: ["A组"] };
    vi.stubGlobal("localStorage", makeStorage({ [KEY]: JSON.stringify(state) }));
    expect(loadConfig(KEY)).toEqual(state);
  });
});

describe("saveConfig", () => {
  it("写入后可 loadConfig 读回", () => {
    const state: SubtotalConfigState = { offLevels: ["lv1"], excludeBlocks: ["B组"] };
    saveConfig(KEY, state);
    expect(loadConfig(KEY)).toEqual(state);
  });

  it("没有 localStorage 环境时不抛错", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => saveConfig(KEY, emptyConfig())).not.toThrow();
  });
});

describe("toQuery", () => {
  const allLevels = ["total", "lv1", "lv2"];

  it("关掉 lv2 → levels 只保留 total,lv1", () => {
    const q = toQuery({ offLevels: ["lv2"], excludeBlocks: [] }, allLevels);
    expect(q.levels).toBe("total,lv1");
  });

  it("全部关掉 → levels='none'（不能是空串）", () => {
    const q = toQuery({ offLevels: ["total", "lv1", "lv2"], excludeBlocks: [] }, allLevels);
    expect(q.levels).toBe("none");
  });

  it("一个都没关 → 显式列出全部，且 excludeBlocks 为空串", () => {
    const q = toQuery(emptyConfig(), allLevels);
    expect(q.levels).toBe("total,lv1,lv2");
    expect(q.excludeBlocks).toBe("");
  });

  it("state 里关掉摘要中不存在的层级 → 不影响输出", () => {
    const q = toQuery({ offLevels: ["lv3"], excludeBlocks: [] }, allLevels);
    expect(q.levels).toBe("total,lv1,lv2");
  });

  it("excludeBlocks 逗号拼接", () => {
    const q = toQuery({ offLevels: [], excludeBlocks: ["A组", "B组"] }, allLevels);
    expect(q.excludeBlocks).toBe("A组,B组");
  });
});

describe("toggleBlock / toggleLevel", () => {
  it("toggleBlock 可逆：连按两次回到原状且不改原对象", () => {
    const base = emptyConfig();
    const once = toggleBlock(base, "A组");
    expect(once.excludeBlocks).toEqual(["A组"]);
    expect(blockIncluded(once, "A组")).toBe(false);
    const twice = toggleBlock(once, "A组");
    expect(twice).toEqual(base);
    expect(base.excludeBlocks).toEqual([]);
  });

  it("toggleLevel 可逆且不改原对象", () => {
    const base = emptyConfig();
    const once = toggleLevel(base, "lv2");
    expect(once.offLevels).toEqual(["lv2"]);
    const twice = toggleLevel(once, "lv2");
    expect(twice).toEqual(base);
    expect(base.offLevels).toEqual([]);
  });
});

describe("blockIncluded", () => {
  it("未在 excludeBlocks 里的 key → true", () => {
    expect(blockIncluded(emptyConfig(), "任意板块")).toBe(true);
  });

  it("在 excludeBlocks 里的 key → false", () => {
    expect(blockIncluded({ offLevels: [], excludeBlocks: ["X"] }, "X")).toBe(false);
  });
});
