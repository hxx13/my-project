import { describe, it, expect } from "vitest";
import { resolveCopy } from "./aiDrawerCopy";
import {
  MAX_FEEDBACK_IMAGES,
  appendFeedbackRows,
  buildCapRows,
  buildCapSavePayload,
  buildFeedbackPayload,
  feedbackListParams,
  moveCapRow,
  normalizeCapabilityGroups,
  normalizeFeedbackRows,
  normalizeAudience,
  normalizeRecommended,
  type FeedbackRow,
} from "./aiDrawerDetail.logic";

const row = (id: number): FeedbackRow => ({
  id,
  userName: `u${id}`,
  content: `c${id}`,
  imageUrls: [],
  status: "PENDING",
  replies: [],
  createdAt: "",
});

describe("兜底文案（详情视图用到的键取不到时回落界面原文）", () => {
  it("接口空表 / 空串 → 用调用点兜底原文", () => {
    expect(resolveCopy(null, "ai.copy.detail.back", "返回对话")).toBe("返回对话");
    expect(resolveCopy({}, "ai.copy.detail.desc", "点一句话即可填入输入框，你可以先改一改再发送。")).toBe(
      "点一句话即可填入输入框，你可以先改一改再发送。",
    );
    expect(resolveCopy({ "ai.copy.feedback.submit": "" }, "ai.copy.feedback.submit", "提交")).toBe("提交");
  });

  it("库里有值就以库为准，占位符由库值模板替换", () => {
    expect(
      resolveCopy(
        { "ai.copy.card.screenshot.fail": "「{name}」没截成" },
        "ai.copy.card.screenshot.fail",
        "没截成",
        { name: "首页" },
      ),
    ).toBe("「首页」没截成");
  });
});

describe("feedbackListParams —— 超管分支", () => {
  it("超管切「全部」才带 all=true", () => {
    expect(feedbackListParams(true, "all", 0, 20)).toEqual({ page: 0, size: 20, all: true });
  });

  it("超管在「我的」也不带 all", () => {
    expect(feedbackListParams(true, "mine", 1, 20)).toEqual({ page: 1, size: 20 });
  });

  it("非超管即便 scope=all 也绝不带 all（后端传 true 会直接拒）", () => {
    expect(feedbackListParams(false, "all", 0, 20)).toEqual({ page: 0, size: 20 });
  });
});

describe("buildFeedbackPayload —— 提交体拼装", () => {
  it("文字去空白后作为 content", () => {
    expect(buildFeedbackPayload("  有问题 \n", [])).toEqual({ content: "有问题", imageUrls: [] });
  });

  it("空文字/纯空白 → null（不发请求）", () => {
    expect(buildFeedbackPayload("", ["a"])).toBeNull();
    expect(buildFeedbackPayload("   ", ["a"])).toBeNull();
  });

  it("附图截到 6 张", () => {
    const urls = Array.from({ length: 9 }, (_, i) => `/api/upload/files/${i}`);
    const body = buildFeedbackPayload("x", urls);
    expect(body?.imageUrls).toHaveLength(MAX_FEEDBACK_IMAGES);
    expect(body?.imageUrls[0]).toBe("/api/upload/files/0");
  });
});

describe("appendFeedbackRows —— 追加不清空", () => {
  it("新一页拼在已有列表后面", () => {
    expect(appendFeedbackRows([row(1), row(2)], [row(3)])).toEqual([row(1), row(2), row(3)]);
  });

  it("原列表保持不变（纯函数，不改入参）", () => {
    const prev = [row(1)];
    appendFeedbackRows(prev, [row(2)]);
    expect(prev).toHaveLength(1);
  });
});

describe("normalizeFeedbackRows", () => {
  it("非数组给空表；解析填充缺省", () => {
    expect(normalizeFeedbackRows(null)).toEqual([]);
    const [r] = normalizeFeedbackRows([{ id: 7, content: "hi" }]);
    expect(r).toMatchObject({ id: 7, content: "hi", status: "PENDING", imageUrls: [], replies: [] });
  });

  it("状态只认 REPLIED，其余归 PENDING", () => {
    const [a, b] = normalizeFeedbackRows([{ id: 1, status: "REPLIED" }, { id: 2, status: "WAT" }]);
    expect(a.status).toBe("REPLIED");
    expect(b.status).toBe("PENDING");
  });

  it("图地址里的非字符串/空串被滤掉；回复串字段缺失时不报错", () => {
    const [r] = normalizeFeedbackRows([{ id: 1, imageUrls: ["/api/upload/files/a", 3, "", null] }]);
    expect(r.imageUrls).toEqual(["/api/upload/files/a"]);
    expect(r.replies).toEqual([]);
  });

  it("回复串逐条归一化（顺序不变）、丢掉没内容的条目", () => {
    const [r] = normalizeFeedbackRows([
      {
        id: 1,
        replies: [
          { content: "一", imageUrls: ["/api/upload/files/a"], repliedBy: "S", repliedByName: "石超管", repliedAt: "2026-10-11 10:00:00" },
          { content: "", imageUrls: [] },
          { content: "二", imageUrls: ["/api/upload/files/b", 3, ""] },
        ],
      },
    ]);
    expect(r.replies).toHaveLength(2);
    expect(r.replies[0]).toEqual({
      content: "一",
      imageUrls: ["/api/upload/files/a"],
      repliedBy: "S",
      repliedByName: "石超管",
      repliedAt: "2026-10-11 10:00:00",
    });
    expect(r.replies[1].content).toBe("二");
    expect(r.replies[1].imageUrls).toEqual(["/api/upload/files/b"]);
  });

  it("作者展示名：有 repliedByName 用它；缺了回落 repliedBy（原始 id）", () => {
    const [r] = normalizeFeedbackRows([
      {
        id: 1,
        replies: [
          { content: "一", repliedBy: "STAFF_abc", repliedByName: "王小明" },
          { content: "二", repliedBy: "STAFF_abc" },
          { content: "三", repliedBy: "STAFF_abc", repliedByName: "   " },
        ],
      },
    ]);
    expect(r.replies[0].repliedByName).toBe("王小明");
    expect(r.replies[0].repliedBy).toBe("STAFF_abc");
    expect(r.replies[1].repliedByName).toBe("STAFF_abc");
    expect(r.replies[2].repliedByName).toBe("STAFF_abc");
  });
});

describe("normalizeCapabilityGroups", () => {
  it("非数组给空表", () => {
    expect(normalizeCapabilityGroups(undefined)).toEqual([]);
  });

  it("丢掉空组与缺 promptText 的条目", () => {
    const groups = normalizeCapabilityGroups([
      { groupName: "A", items: [{ id: 1, title: "t", promptText: "p" }, { id: 2, title: "无提示词" }] },
      { groupName: "B", items: [] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].groupName).toBe("A");
    expect(groups[0].items).toEqual([{ id: 1, title: "t", promptText: "p", note: "" }]);
  });
});

// ── 编辑态（仅 ≥超管）─────────────────────────────────────────────────

describe("可见范围白名单与整份提交", () => {
  it("白名单外的值一律回落全员", () => {
    // 后端对不认识的值是「按全员放行」—— 这里不拦，保存后就等于放开给所有人且不报错
    expect(normalizeAudience("STAFF")).toBe("STAFF");
    expect(normalizeAudience("ADMIN")).toBe("ADMIN");
    expect(normalizeAudience("TEACHER")).toBe("");
    expect(normalizeAudience(undefined)).toBe("");
    expect(normalizeAudience(3)).toBe("");
  });

  it("整份读回来的停用行与可见范围都保留", () => {
    const rows = buildCapRows([
      { id: 7, groupName: "甲", title: "t", promptText: "p", sortOrder: 10, enabled: false, audience: "ADMIN" },
      { id: 8, groupName: "甲", title: "t2", promptText: "p2", sortOrder: 20, enabled: true, audience: "" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].enabled).toBe(false);
    expect(rows[0].audience).toBe("ADMIN");
    expect(rows[1].audience).toBe("");
  });

  it("上下移越界不动，返回同一个数组引用", () => {
    const rows = buildCapRows([{ id: 1, title: "a", promptText: "p" }, { id: 2, title: "b", promptText: "p" }]);
    expect(moveCapRow(rows, 0, -1)).toBe(rows);
    expect(moveCapRow(rows, 1, 1)).toBe(rows);
    const moved = moveCapRow(rows, 0, 1);
    expect(moved.map((r) => r.title)).toEqual(["b", "a"]);
    expect(rows.map((r) => r.title)).toEqual(["a", "b"]);
  });

  it("提交体按当前顺序重排序号，空行丢掉", () => {
    const rows = buildCapRows([
      { id: 1, groupName: "甲", title: "a", promptText: "p", enabled: true, audience: "SUPER_ADMIN" },
      { id: 2, groupName: "", title: "  ", promptText: "   ", enabled: true, audience: "" },
      { id: null, groupName: "乙", title: "c", promptText: "p3", enabled: false, audience: "X" },
    ]);
    const payload = buildCapSavePayload(rows);
    expect(payload).toHaveLength(2);
    expect(payload.map((r) => r.sortOrder)).toEqual([10, 20]);
    expect(payload[0].audience).toBe("SUPER_ADMIN");
    expect(payload[1].id).toBeNull();
    expect(payload[1].audience).toBe("");
  });
});

describe("normalizeRecommended —— 推荐指令条取数", () => {
  it("丢掉非对象、缺 id、缺正文的脏数据", () => {
    const out = normalizeRecommended([
      null,
      1,
      "x",
      { id: 1 },                       // 缺正文
      { id: "abc", promptText: "查" }, // id 不是数字
      { id: 2, promptText: "查库存" },  // 唯一一条合法的
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(2);
    expect(out[0].promptText).toBe("查库存");
  });

  it("非数组一律返回空（接口挂了不该让指令条炸掉）", () => {
    expect(normalizeRecommended(undefined)).toEqual([]);
    expect(normalizeRecommended(null)).toEqual([]);
    expect(normalizeRecommended({ a: 1 })).toEqual([]);
    expect(normalizeRecommended("[]")).toEqual([]);
  });

  it("title / note 缺失时回落空串，不产生 undefined", () => {
    const out = normalizeRecommended([{ id: 7, promptText: "看看库存" }]);
    expect(out[0].title).toBe("");
    expect(out[0].note).toBe("");
  });
});
