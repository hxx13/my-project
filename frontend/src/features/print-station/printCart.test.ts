import { describe, it, expect } from "vitest";
import {
  createCart,
  templateKeyOf,
  type StorageLike,
  type PrintItem,
} from "./printCart";

/** 内存假 storage。Key 名由模块自己定，测试不假设，只按「有没有值」判断。 */
function memStorage() {
  const data: Record<string, string> = {};
  const storage: StorageLike = {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
  return { storage, data, allValues: () => Object.values(data).join("\n") };
}

/** 无论什么 key 都返回同一段脏数据，用来测坏 JSON / 结构不对。 */
function fixedStorage(raw: string | null): StorageLike {
  return { getItem: () => raw, setItem: () => {} };
}

// File 在 node 环境里不需要真货：模块只读 .name
const file = (name: string) => ({ name } as unknown as File);

const tpl = (
  sourceId: string,
  sourceType = "ADMIN_FILE",
  fileName = `${sourceId}.pdf`,
): PrintItem => ({ sourceType, sourceId, fileName });

describe("createCart 初始状态", () => {
  it("空 storage 下是空清单", () => {
    const cart = createCart(memStorage().storage);
    expect(cart.getState()).toEqual({ templateItems: [], localFiles: [], overrides: {} });
    expect(cart.count()).toBe(0);
  });
});

describe("addTemplateItems", () => {
  it("追加并返回新状态", () => {
    const cart = createCart(memStorage().storage);
    const state = cart.addTemplateItems([tpl("1"), tpl("2")]);
    expect(state.templateItems.map((i) => i.sourceId)).toEqual(["1", "2"]);
    expect(cart.count()).toBe(2);
  });

  it("同一个 sourceType+sourceId 加两次只有一条，且不报错", () => {
    const cart = createCart(memStorage().storage);
    cart.addTemplateItems([tpl("1")]);
    expect(() => cart.addTemplateItems([tpl("1")])).not.toThrow();
    expect(cart.getState().templateItems).toHaveLength(1);
  });

  it("同一批次内部重复也只留一条", () => {
    const cart = createCart(memStorage().storage);
    cart.addTemplateItems([tpl("1"), tpl("1"), tpl("1")]);
    expect(cart.getState().templateItems).toHaveLength(1);
  });

  it("sourceId 相同但 sourceType 不同算两条", () => {
    const cart = createCart(memStorage().storage);
    cart.addTemplateItems([tpl("1", "ADMIN_FILE"), tpl("1", "OTHER")]);
    expect(cart.getState().templateItems).toHaveLength(2);
  });
});

describe("addLocalFiles", () => {
  it("每条一个会话内唯一的 local:n key", () => {
    const cart = createCart(memStorage().storage);
    cart.addLocalFiles([file("a.pdf"), file("b.pdf"), file("c.pdf")]);
    const keys = cart.getState().localFiles.map((i) => i.key);
    expect(keys).toHaveLength(3);
    keys.forEach((k) => expect(k).toMatch(/^local:\d+$/));
    expect(new Set(keys).size).toBe(3);
  });

  it("同一个文件选两次就是两条", () => {
    const cart = createCart(memStorage().storage);
    const f = file("same.pdf");
    cart.addLocalFiles([f, f]);
    expect(cart.getState().localFiles).toHaveLength(2);
    expect(cart.getState().localFiles.map((i) => i.name)).toEqual(["same.pdf", "same.pdf"]);
  });

  it("name 取自 file.name", () => {
    const cart = createCart(memStorage().storage);
    cart.addLocalFiles([file("报告.pdf")]);
    expect(cart.getState().localFiles[0].name).toBe("报告.pdf");
  });
});

describe("remove", () => {
  it("模板项按 sourceType:sourceId 移除", () => {
    const cart = createCart(memStorage().storage);
    cart.addTemplateItems([tpl("1"), tpl("2")]);
    cart.remove(templateKeyOf(tpl("1")));
    expect(cart.getState().templateItems.map((i) => i.sourceId)).toEqual(["2"]);
  });

  it("本地文件按自身 key 移除", () => {
    const cart = createCart(memStorage().storage);
    cart.addLocalFiles([file("a.pdf"), file("b.pdf")]);
    const [first] = cart.getState().localFiles;
    cart.remove(first.key);
    expect(cart.getState().localFiles.map((i) => i.name)).toEqual(["b.pdf"]);
  });

  it("模板项被移除时，它的单条覆盖也跟着清掉", () => {
    const cart = createCart(memStorage().storage);
    cart.addTemplateItems([tpl("1")]);
    cart.setOverride(templateKeyOf(tpl("1")), { copies: 3 });
    cart.remove(templateKeyOf(tpl("1")));
    expect(cart.getState().overrides).not.toHaveProperty("ADMIN_FILE:1");
  });

  it("移除后重新加入同一条，不带回之前的覆盖", () => {
    const cart = createCart(memStorage().storage);
    cart.addTemplateItems([tpl("1")]);
    cart.setOverride(templateKeyOf(tpl("1")), { copies: 3 });
    cart.remove(templateKeyOf(tpl("1")));
    cart.addTemplateItems([tpl("1")]);
    expect(cart.getState().overrides["ADMIN_FILE:1"]).toBeUndefined();
  });

  it("本地文件被移除时，它的单条覆盖也跟着清掉", () => {
    const cart = createCart(memStorage().storage);
    cart.addLocalFiles([file("a.pdf")]);
    const [first] = cart.getState().localFiles;
    cart.setOverride(first.key, { urgent: true });
    cart.remove(first.key);
    expect(cart.getState().overrides).not.toHaveProperty(first.key);
  });

  it("key 不存在时不抛、状态不变", () => {
    const cart = createCart(memStorage().storage);
    cart.addTemplateItems([tpl("1")]);
    const before = JSON.stringify(cart.getState());
    expect(() => cart.remove("不存在")).not.toThrow();
    expect(JSON.stringify(cart.getState())).toBe(before);
  });
});

describe("setOverride", () => {
  it("首次设置后能读到", () => {
    const cart = createCart(memStorage().storage);
    cart.addTemplateItems([tpl("1")]);
    cart.setOverride(templateKeyOf(tpl("1")), { copies: 3, urgent: true });
    expect(cart.getState().overrides["ADMIN_FILE:1"]).toEqual({ copies: 3, urgent: true });
  });

  it("二次 patch 浅合并，保留未提及的字段", () => {
    const cart = createCart(memStorage().storage);
    cart.setOverride("ADMIN_FILE:1", { copies: 3, urgent: true });
    cart.setOverride("ADMIN_FILE:1", { copies: 5 });
    expect(cart.getState().overrides["ADMIN_FILE:1"]).toEqual({ copies: 5, urgent: true });
  });

  it("key 不存在时也不抛（覆盖可以先于条目到达）", () => {
    const cart = createCart(memStorage().storage);
    expect(() => cart.setOverride("local:99", { urgent: true })).not.toThrow();
    expect(cart.getState().overrides["local:99"]).toEqual({ urgent: true });
  });
});

describe("clear", () => {
  it("清空条目与 overrides", () => {
    const cart = createCart(memStorage().storage);
    cart.addTemplateItems([tpl("1")]);
    cart.addLocalFiles([file("a.pdf")]);
    cart.setOverride("ADMIN_FILE:1", { copies: 2 });
    cart.clear();
    expect(cart.getState()).toEqual({ templateItems: [], localFiles: [], overrides: {} });
    expect(cart.count()).toBe(0);
  });
});

describe("count", () => {
  it("等于模板项 + 本地文件", () => {
    const cart = createCart(memStorage().storage);
    cart.addTemplateItems([tpl("1"), tpl("2")]);
    cart.addLocalFiles([file("a.pdf")]);
    expect(cart.count()).toBe(3);
  });
});

describe("持久化", () => {
  it("模板项与 overrides 重建后还在", () => {
    const { storage } = memStorage();
    const first = createCart(storage);
    first.addTemplateItems([tpl("1"), tpl("2")]);
    first.setOverride("ADMIN_FILE:1", { copies: 4, urgent: true });

    const second = createCart(storage);
    expect(second.getState().templateItems.map((i) => i.sourceId)).toEqual(["1", "2"]);
    expect(second.getState().overrides["ADMIN_FILE:1"]).toEqual({ copies: 4, urgent: true });
  });

  it("localFiles 绝不写进 storage，重建后为空", () => {
    const { storage, allValues } = memStorage();
    const first = createCart(storage);
    first.addLocalFiles([file("机密报告.pdf")]);
    expect(allValues()).not.toContain("机密报告.pdf");
    expect(createCart(storage).getState().localFiles).toEqual([]);
  });

  it("每次改动都写回 storage", () => {
    const { storage, allValues } = memStorage();
    const cart = createCart(storage);
    expect(allValues()).toBe("");
    cart.addTemplateItems([tpl("1")]);
    expect(allValues()).toContain("1");
    cart.setOverride("ADMIN_FILE:1", { copies: 2 });
    expect(allValues()).toContain("copies");
  });
});

describe("坏数据的降级", () => {
  it("坏 JSON 不抛、返回空清单", () => {
    expect(() => createCart(fixedStorage("{不是 JSON"))).not.toThrow();
    expect(createCart(fixedStorage("{不是 JSON")).getState()).toEqual({
      templateItems: [],
      localFiles: [],
      overrides: {},
    });
  });

  it("合法 JSON 但整个是数组 → 空清单", () => {
    const cart = createCart(fixedStorage("[1,2,3]"));
    expect(cart.getState()).toEqual({ templateItems: [], localFiles: [], overrides: {} });
  });

  it("templateItems 是字符串 → 空清单", () => {
    const cart = createCart(fixedStorage('{"templateItems":"oops","overrides":{}}'));
    expect(cart.getState()).toEqual({ templateItems: [], localFiles: [], overrides: {} });
  });

  it("overrides 是 null → 空清单", () => {
    const cart = createCart(fixedStorage('{"templateItems":[],"overrides":null}'));
    expect(cart.getState()).toEqual({ templateItems: [], localFiles: [], overrides: {} });
  });

  it("overrides 是数组 → 空清单", () => {
    const cart = createCart(fixedStorage('{"templateItems":[],"overrides":[]}'));
    expect(cart.getState()).toEqual({ templateItems: [], localFiles: [], overrides: {} });
  });

  it("storage 读回来是 null → 空清单", () => {
    expect(createCart(fixedStorage(null)).getState()).toEqual({
      templateItems: [],
      localFiles: [],
      overrides: {},
    });
  });
});

describe("templateKeyOf", () => {
  it("拼成 sourceType:sourceId", () => {
    expect(templateKeyOf({ sourceType: "ADMIN_FILE", sourceId: "abc", fileName: "x" })).toBe(
      "ADMIN_FILE:abc",
    );
  });
});
