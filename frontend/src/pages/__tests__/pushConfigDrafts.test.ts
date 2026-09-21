import { describe, expect, it } from "vitest";
import { mergeChannelDrafts, toChannelDraft, type ChannelDraft, type ChannelDraftSource } from "../pushConfigDrafts";

function ch(id: number, enabled: boolean, titleTpl = ""): ChannelDraftSource {
  return {
    id,
    enabled,
    titleTpl,
    contentTpl: "",
    quietStart: null,
    quietEnd: null,
    rateLimitSeconds: 300,
  };
}

/**
 * 渠道草稿合并：保存→重新拉列表后，本地未保存的改动必须原样留下。
 *
 * 回归背景：整体重建草稿会让「保存一个渠道」把其它渠道刚拨动的开关全部打回服务端默认值。
 */
describe("mergeChannelDrafts", () => {
  it("服务端刷新不会覆盖本地未保存的开关/模板改动", () => {
    const local: Record<number, Record<number, ChannelDraft>> = {
      13: { 1: { ...toChannelDraft(ch(1, true)), enabled: false, titleTpl: "改过" } },
    };
    // 服务端里 13 号源的 1 号渠道仍然是开启、模板为空
    const merged = mergeChannelDrafts(local, [{ sourceId: 13, channels: [ch(1, true)] }]);
    expect(merged[13][1].enabled).toBe(false);
    expect(merged[13][1].titleTpl).toBe("改过");
  });

  it("新出现的渠道补上服务端值，消失的渠道被剔除", () => {
    const local: Record<number, Record<number, ChannelDraft>> = {
      13: { 1: { ...toChannelDraft(ch(1, true)), enabled: false } },
    };
    const merged = mergeChannelDrafts(local, [{ sourceId: 13, channels: [ch(2, false)] }]);
    expect(Object.keys(merged[13])).toEqual(["2"]);
    expect(merged[13][2].enabled).toBe(false);
  });

  it("没见过的源从服务端建草稿", () => {
    const merged = mergeChannelDrafts({}, [{ sourceId: 99, channels: [ch(5, false, "hi")] }]);
    expect(merged[99][5].enabled).toBe(false);
    expect(merged[99][5].titleTpl).toBe("hi");
  });

  it("服务端为空字段落成草稿默认值（静默时间为空串、频率兜底 300）", () => {
    expect(toChannelDraft(ch(1, true))).toMatchObject({
      quietStart: "",
      quietEnd: "",
      rateLimitSeconds: 300,
    });
  });
});
