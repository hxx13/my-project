import { describe, expect, it } from "vitest";
import { shouldShowAdminShellBack } from "./adminShellNavigation";
import { createAdminNavContext } from "./buildAdminNavModel";

const ctx = (role: string) => createAdminNavContext(role, []);
const none = new Set<string>();

describe("shouldShowAdminShellBack", () => {
  it("后台根与个人中心不出返回", () => {
    expect(shouldShowAdminShellBack("/admin", none, ctx("SUPER_ADMIN"))).toBe(false);
    expect(shouldShowAdminShellBack("/admin/profile-security", none, ctx("SUPER_ADMIN"))).toBe(false);
  });

  it("注册表一级入口在 ADMIN 及以上不出返回", () => {
    expect(shouldShowAdminShellBack("/admin/animal-order-review", none, ctx("SUPER_ADMIN"))).toBe(false);
    expect(shouldShowAdminShellBack("/admin/material/manage", none, ctx("SUPER_ADMIN"))).toBe(false);
  });

  it("已从侧栏移除的子页即使权限侧下发了 sidebar ENTRY 也要出返回", () => {
    // /admin/supplies/manage 在 HIDDEN_ADMIN_SIDEBAR_PATHS 里，但权限仍可能给它下发 ENTRY
    const perm = new Set(["/admin/supplies/manage"]);
    expect(shouldShowAdminShellBack("/admin/supplies/manage", perm, ctx("SUPER_ADMIN"))).toBe(true);
  });

  it("注册表里有、但当前身份侧栏看不到的页面也要出返回", () => {
    expect(shouldShowAdminShellBack("/admin/material/manage", none, ctx("MEMBER"))).toBe(true);
  });

  it("没在侧栏登记的子页出返回", () => {
    expect(shouldShowAdminShellBack("/admin/supplies/manage", none, ctx("SUPER_ADMIN"))).toBe(true);
  });
});
