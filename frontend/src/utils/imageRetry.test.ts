import { describe, expect, it } from "vitest";
import { withRetryParam } from "./imageRetry";

describe("withRetryParam", () => {
  it("无查询参数时追加", () => {
    expect(withRetryParam("/api/upload/files/a.jpg", 1)).toBe(
      "/api/upload/files/a.jpg?_r=1",
    );
  });

  it("已有查询参数时追加", () => {
    expect(withRetryParam("/api/upload/files/a.jpg?v=2", 2)).toBe(
      "/api/upload/files/a.jpg?v=2&_r=2",
    );
  });

  it("重复重试时替换旧的重试参数", () => {
    expect(withRetryParam("/api/upload/files/a.jpg?_r=1", 3)).toBe(
      "/api/upload/files/a.jpg?_r=3",
    );
  });

  it("空地址原样返回", () => {
    expect(withRetryParam("", 1)).toBe("");
  });
});
