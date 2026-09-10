import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveMiniPreferences } = vi.hoisted(() => ({
  saveMiniPreferences: vi.fn(async (_prefs: unknown) => ({})),
}));

vi.mock("@/api/domains/me.api", () => ({
  fetchMiniPreferences: vi.fn(async () => null),
  saveMiniPreferences,
}));

import {
  appendStudentNavRecent,
  toggleStudentNavLock,
} from "./student-nav-personalization";

const flush = () => new Promise((r) => setTimeout(r, 0));

/**
 * 回归：学生端侧栏持久化曾经「读整包 → 改三个字段 → 回写整包」，
 * 而整包是页面级陈旧副本，且每次导航都触发 —— 会把刚切好的亮/暗色冲回旧值。
 * 现在只提交自己负责的字段，后端对未提交字段保留库内值。
 */
describe("学生端侧栏个性化持久化", () => {
  beforeEach(() => {
    saveMiniPreferences.mockClear();
  });

  it("只提交学生端侧栏字段，不带整包", async () => {
    appendStudentNavRecent("/student/rooms");
    await flush();

    expect(saveMiniPreferences).toHaveBeenCalledTimes(1);
    const payload = saveMiniPreferences.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "studentNavLock",
      "studentNavRecent",
      "studentNavStars",
    ]);
    expect(payload).not.toHaveProperty("appearanceSchedule");
    expect(payload).not.toHaveProperty("twinWebChromeTheme");
  });

  it("收藏/锁定同样走局部提交（node 环境无 localStorage，只校验字段集合）", async () => {
    toggleStudentNavLock("/student/cage-shelf");
    await flush();

    const payload = saveMiniPreferences.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "studentNavLock",
      "studentNavRecent",
      "studentNavStars",
    ]);
  });
});
