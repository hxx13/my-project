import { describe, expect, it } from "vitest";
import { resolveApiMediaUrl } from "./mediaUrl";

describe("resolveApiMediaUrl", () => {
  it("微信云开发 fileID 在浏览器端不可渲染，应返回 undefined", () => {
    expect(
      resolveApiMediaUrl("cloud://aroapp-d0gf62u0p13ac9c9c.6172-aroapp/supplies/covers/1776993448"),
    ).toBeUndefined();
  });

  it("保留相对 API 路径", () => {
    expect(resolveApiMediaUrl("/api/upload/files/20260612/a.jpg")).toBe(
      "/api/upload/files/20260612/a.jpg",
    );
  });

  it("保留普通绝对地址", () => {
    expect(resolveApiMediaUrl("https://example.com/a.jpg")).toBe(
      "https://example.com/a.jpg",
    );
  });
});
