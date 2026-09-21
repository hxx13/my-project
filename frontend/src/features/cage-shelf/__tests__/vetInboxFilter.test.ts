import { describe, expect, it } from "vitest";
import {
  hasVetAdvice,
  matchesInboxFilter,
  matchesInboxKeyword,
  vetInboxFilterCounts,
} from "../vetInboxFilter";
import type { CageVetMessage } from "@/api/domains/cageShelf.api";

/**
 * 兽医收件箱的筛选 / 搜索回归。
 *
 * 这批用例与小程序的 `aroapp/tests/vetInboxSections.test.js` 是**同一批** ——
 * 两端的口径必须逐字一致，否则同一批消息在 Web 和小程序上筛出来的结果不一样，
 * 用户会认为其中一端坏了。加了新用例请两边一起加。
 */

function msg(over: Partial<CageVetMessage> = {}): CageVetMessage {
  return {
    id: 1,
    animalCageId: "9001",
    statusCode: "HEALTH_ABNORMAL",
    statusLabel: "健康异常",
    firedAt: "2026-09-19T10:20:30",
    read: false,
    campusName: "B栋",
    floorName: "3F",
    roomName: "301房间",
    shelveName: "架A",
    positionLabel: "1-2",
    projectPiName: "张课题组",
    ...over,
  };
}

describe("hasVetAdvice", () => {
  it("认文字也认图片；纯空白不算已回意见", () => {
    expect(hasVetAdvice(msg({ adviceText: "" }))).toBe(false);
    expect(hasVetAdvice(msg({ adviceText: "  " }))).toBe(false);
    expect(hasVetAdvice(msg({ adviceText: "已换水" }))).toBe(true);
    expect(hasVetAdvice(msg({ adviceText: "", adviceImages: ["u1"] }))).toBe(true);
  });
});

describe("matchesInboxFilter", () => {
  it("回没回意见与已读未读是两条轴", () => {
    const repliedButUnread = msg({ read: false, adviceText: "已换水" });
    const readButPending = msg({ read: true, adviceText: "" });

    expect(matchesInboxFilter(repliedButUnread, "all")).toBe(true);
    expect(matchesInboxFilter(repliedButUnread, "replied")).toBe(true);
    expect(matchesInboxFilter(repliedButUnread, "pending")).toBe(false);
    expect(matchesInboxFilter(readButPending, "pending")).toBe(true);
    expect(matchesInboxFilter(readButPending, "replied")).toBe(false);
  });
});

describe("matchesInboxKeyword", () => {
  const m = msg({ aupNumber: "AUP-2026-001", cageBoxCode: "CB-00123" });

  it("命中位号/笼架/房间/校区/课题组/AUP/笼盒编号/状态", () => {
    expect(matchesInboxKeyword(m, "1-2")).toBe(true);
    expect(matchesInboxKeyword(m, "架A")).toBe(true);
    expect(matchesInboxKeyword(m, "301")).toBe(true);
    expect(matchesInboxKeyword(m, "B栋")).toBe(true);
    expect(matchesInboxKeyword(m, "张课题组")).toBe(true);
    expect(matchesInboxKeyword(m, "aup-2026")).toBe(true); // 大小写不敏感
    expect(matchesInboxKeyword(m, "cb-001")).toBe(true);
    expect(matchesInboxKeyword(m, "健康异常")).toBe(true);
    expect(matchesInboxKeyword(m, "  架A  ")).toBe(true); // 首尾空格裁掉
    expect(matchesInboxKeyword(m, "不存在的关键字")).toBe(false);
  });

  it("空关键字 / 纯空格当不筛", () => {
    expect(matchesInboxKeyword(m, "")).toBe(true);
    expect(matchesInboxKeyword(m, "   ")).toBe(true);
  });
});

describe("vetInboxFilterCounts", () => {
  it("计数跟着关键字走，全部 = 待回 + 已回", () => {
    const list = [
      msg({ id: 1, positionLabel: "1-2", adviceText: "" }),
      msg({ id: 2, positionLabel: "2-4", adviceText: "已换水" }),
      msg({ id: 3, positionLabel: "9-9", adviceText: "" }),
    ];
    expect(vetInboxFilterCounts(list, "")).toEqual({ all: 3, pending: 2, replied: 1 });
    expect(vetInboxFilterCounts(list, "9-9")).toEqual({ all: 1, pending: 1, replied: 0 });
    expect(vetInboxFilterCounts(list, "搜不到")).toEqual({ all: 0, pending: 0, replied: 0 });
    expect(vetInboxFilterCounts([], "")).toEqual({ all: 0, pending: 0, replied: 0 });
  });
});
