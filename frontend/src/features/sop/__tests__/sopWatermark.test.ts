import { describe, it, expect } from "vitest";
import { buildWatermarkDataUri, escapeXml, watermarkLines } from "../sopWatermark";

/**
 * 水印底纹生成的两条口径：
 * ① 文字必须转义后再编码 —— 姓名里一个 `&` 就能破坏 SVG 结构，整块水印变空白且**不报错**；
 * ② 空内容返回空串，调用方据此不渲染覆层（否则会铺一层什么都没有的透明 div，白白吃掉一层合成）。
 */
describe("buildWatermarkDataUri", () => {
  it("转义 XML 特殊字符，不把裸 & 写进 SVG", () => {
    const uri = buildWatermarkDataUri(["A&B"]);
    const m = /^url\("data:image\/svg\+xml,(.*)"\)$/.exec(uri);
    expect(m).not.toBeNull();
    const svg = decodeURIComponent(m![1]);
    expect(svg).toContain("A&amp;B");
    expect(svg).not.toContain("A&amp;amp;B"); // 不该被二次转义
    // 裸的 & 会让 XML 解析失败（浏览器静默丢弃整张图）
    expect(svg).not.toMatch(/[^&]&[^a-z#]/);
  });

  it("尖括号与引号同样被转义", () => {
    const uri = buildWatermarkDataUri([`<script>"x"'`]);
    const svg = decodeURIComponent(/,(.*)"\)$/.exec(uri)![1]);
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&apos;");
  });

  it("纯空白内容返回空串，不渲染覆层", () => {
    expect(buildWatermarkDataUri([])).toBe("");
    expect(buildWatermarkDataUri(["", "   "])).toBe("");
  });

  it("多行都画进同一张图", () => {
    const svg = decodeURIComponent(/,(.*)"\)$/.exec(buildWatermarkDataUri(["张三", "2026-09-14", "请勿外传"]))![1]);
    for (const line of ["张三", "2026-09-14", "请勿外传"]) expect(svg).toContain(line);
    expect(svg.match(/<text /g)).toHaveLength(3);
  });
});

describe("watermarkLines", () => {
  it("给出 姓名 / 日期 / 请勿外传 三行", () => {
    expect(watermarkLines({ name: "  张三  ", at: new Date(2026, 8, 14) })).toEqual([
      "张三",
      "2026-09-14",
      "请勿外传",
    ]);
  });

  it("取不到姓名时用占位，绝不产出空行", () => {
    expect(watermarkLines({ name: "", at: new Date(2026, 8, 14) })[0]).toBe("未知用户");
    expect(watermarkLines({ name: null })[0]).toBe("未知用户");
  });
});

describe("escapeXml", () => {
  it("五个实体全覆盖", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });
});
