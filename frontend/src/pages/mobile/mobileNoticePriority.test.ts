import { describe, expect, it } from "vitest";
import type { MobileAlertItem } from "@/api/domains/mobileStudent.api";
import { sortMobileAnnouncementsForDisplay } from "./mobileExemptAlertHelpers";
import { alertKindColors, alertKindLabel } from "./mobileNoticePresentation";

/**
 * 回归（2026-09-22）：门户公告优先级在 H5 端也要体现。
 * 后端 /api/student/mobile/alerts 把 extension_json.priority 放在 item.priority 上，并要求重要置顶。
 * 只按时间倒序会把重要公告压下去，角标也会一律显示「公告」。
 */
const notice = (id: number, priority: string | undefined, publishAt: string): MobileAlertItem => ({
  id,
  kind: "general_notice",
  title: `公告${id}`,
  contentHtml: "",
  priority,
  publishAt,
  section: "GENERAL",
  interactiveRequired: false,
});

describe("sortMobileAnnouncementsForDisplay", () => {
  it("重要公告置顶，其余按发布时间倒序", () => {
    const sorted = sortMobileAnnouncementsForDisplay([
      notice(1, "routine", "2026-09-20T10:00:00"),
      notice(2, "important", "2026-09-01T10:00:00"),
      notice(3, "routine", "2026-09-21T10:00:00"),
    ]);
    expect(sorted.map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it("通知排在常规之前，但仍在重要之后", () => {
    const sorted = sortMobileAnnouncementsForDisplay([
      notice(1, "routine", "2026-09-21T10:00:00"),
      notice(2, "notice", "2026-09-02T10:00:00"),
      notice(3, "important", "2026-09-01T10:00:00"),
    ]);
    expect(sorted.map((i) => i.id)).toEqual([3, 2, 1]);
  });

  it("缺 priority 的当常规，且不改原数组", () => {
    const input = [notice(1, "routine", "2026-09-21T10:00:00"), notice(2, undefined, "2026-09-01T10:00:00")];
    expect(sortMobileAnnouncementsForDisplay(input).map((i) => i.id)).toEqual([1, 2]);
    expect(input.map((i) => i.id)).toEqual([1, 2]);
  });

  it("豁免 / 违规的既有档位没被公告优先级顶掉", () => {
    const sorted = sortMobileAnnouncementsForDisplay([
      notice(1, "important", "2026-09-01T10:00:00"),
      { id: 2, kind: "exempt", title: "豁免", contentHtml: "", publishAt: "2026-09-02T10:00:00", interactiveRequired: false },
      { id: 3, kind: "violation", title: "违规", contentHtml: "", publishAt: "2026-09-03T10:00:00", interactiveRequired: false },
    ]);
    expect(sorted.map((i) => i.id)).toEqual([1, 2, 3]);
  });
});

describe("alertKindLabel / alertKindColors", () => {
  it("通用公告角标按优先级走", () => {
    expect(alertKindLabel("general_notice", undefined, "important")).toBe("重要");
    expect(alertKindLabel("general_notice", undefined, "notice")).toBe("通知");
    expect(alertKindLabel("general_notice", undefined, "routine")).toBe("公告");
    expect(alertKindLabel("general_notice")).toBe("公告");
  });

  it("通用公告配色按优先级走，其他类型不受影响", () => {
    expect(alertKindColors("general_notice", "important").color).toBe("#dc2626");
    expect(alertKindColors("general_notice", "notice").color).toBe("#16a34a");
    expect(alertKindColors("general_notice", "routine").color).toBe("#2563eb");
    expect(alertKindColors("violation").color).toBe("#dc2626");
    expect(alertKindLabel("violation")).toBe("违规提醒");
  });
});
