import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(here, "../../../../../../");

function readSrc(rel: string): string {
  return readFileSync(resolve(frontendRoot, "src", rel), "utf8");
}

/**
 * 弹窗公告编辑：正文必须等详情加载完成后再挂 TipTap；
 * 用列表 filter 命中会在缓存不全 / 字段别名时表现为「正文空白」。
 */
describe("公告编辑正文加载守卫", () => {
  it("走 getScanPopupAnnouncement 详情接口，不靠 list.find", () => {
    const editor = readSrc("features/admin/violations/notices/AnnouncementEditor.tsx");
    const api = readSrc("api/domains/scanPopupAnnouncement.api.ts");
    expect(api.includes("export async function getScanPopupAnnouncement")).toBe(true);
    expect(editor.includes("getScanPopupAnnouncement")).toBe(true);
    expect(editor.includes("listScanPopupAnnouncements")).toBe(false);
  });

  it("加载完成前不挂 ContentBodySlot，避免 TipTap 空值初始化后异步不回填", () => {
    const editor = readSrc("features/admin/violations/notices/AnnouncementEditor.tsx");
    expect(editor.includes("bodyReady")).toBe(true);
    expect(editor.includes("加载正文")).toBe(true);
    expect(editor.includes("disabled={loading}")).toBe(true);
  });

  it("normalizeAnnouncementRow 兼容 content_html 别名", () => {
    const api = readSrc("api/domains/scanPopupAnnouncement.api.ts");
    expect(api.includes("content_html")).toBe(true);
    expect(api.includes("normalizeAnnouncementRow")).toBe(true);
  });
});
