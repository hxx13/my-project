import { describe, expect, it } from "vitest";
import {
  contentBodyFromHtml,
  serializeContentBody,
  type ContentBodyValue,
} from "../ContentBodySlot";
import {
  dispositionConfigJsonOf,
  registryDispositionType,
  toCreateDisposition,
  type DispositionValue,
} from "../dispositionTypes";

describe("ContentBodySlot serialize (期 6)", () => {
  it("html 分支不输出 contentJson", () => {
    const v: ContentBodyValue = { body: { kind: "html", html: "<p>a</p>" }, imageUrls: [] };
    const out = serializeContentBody(v);
    expect(out.html).toBe("<p>a</p>");
    expect(out.contentJson).toBeNull();
  });

  it("prosemirror 分支输出 JSON 真源", () => {
    const v: ContentBodyValue = {
      body: { kind: "prosemirror", json: { type: "doc", content: [] }, html: "<p></p>" },
      imageUrls: ["x.png"],
    };
    const out = serializeContentBody(v);
    expect(out.contentJson).toContain("\"type\":\"doc\"");
    expect(out.imageUrls).toEqual(["x.png"]);
  });

  it("contentBodyFromHtml 优先解析 contentJson", () => {
    const v = contentBodyFromHtml("<p>x</p>", [], '{"type":"doc","content":[]}');
    expect(v.body.kind).toBe("prosemirror");
  });
});

describe("dispositionTypes quiz 分支", () => {
  it("registryDispositionType / configJson for quiz", () => {
    const v: DispositionValue = {
      actions: ["forbid"],
      expiry: { mode: "RELATIVE", days: 3 },
      strategy: {
        type: "quiz",
        questionBankId: "default",
        drawCount: 3,
        passCount: 2,
        maxAttempts: 3,
        maxEnterSuccess: 1,
      },
    };
    expect(registryDispositionType(v)).toBe("QUIZ");
    expect(dispositionConfigJsonOf(v)).toContain("passCount");
    const created = toCreateDisposition(v);
    expect(created.dispositionType).toBe("QUIZ");
    expect(created.interactiveChallenge).toBeNull();
    expect(created.maxEnterSuccess).toBe(1);
  });
});
