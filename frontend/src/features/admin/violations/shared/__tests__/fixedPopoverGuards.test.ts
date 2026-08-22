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
 * 回归：管理后台 PageTransition 入场动画若残留 transform，会把子孙 position:fixed
 * 的 containing block 从视口改到动画容器，导致 SelectField / MultiSelectField 浮层
 * 错位并被检查器 overflow 裁切（student-violations 新建页右侧下拉「点不开」）。
 */
describe("fixed 下拉防裁切守卫", () => {
  it("PageTransition 动画结束后清掉 transform（不只 willChange）", () => {
    const src = readSrc("components/animation/PageTransition.tsx");
    expect(src.includes("transform,opacity,willChange") || src.includes('clearProps: clearAnimProps')).toBe(true);
    expect(src.includes('clearProps: "willChange"')).toBe(false);
  });

  it("SelectField / MultiSelectField 浮层经 Portal 挂到 body", () => {
    const select = readSrc("features/admin/violations/shared/SelectField.tsx");
    const multi = readSrc("features/admin/violations/shared/MultiSelectField.tsx");
    expect(select.includes('from "@/components/Portal"')).toBe(true);
    expect(multi.includes('from "@/components/Portal"')).toBe(true);
    expect(select.includes("<Portal>")).toBe(true);
    expect(multi.includes("<Portal>")).toBe(true);
  });

  it("打开浮层后延迟武装 scroll 关闭，避免 focus 触发的首帧滚动立刻关掉", () => {
    const src = readSrc("features/admin/violations/shared/useMultiSelectPopover.ts");
    expect(src.includes("scrollArmed")).toBe(true);
    expect(src.includes("setTimeout")).toBe(true);
  });

  it("浮层 z-index 高于 ConfigModal（--z-modal: 800）", () => {
    const src = readSrc("features/admin/violations/shared/useMultiSelectPopover.ts");
    expect(src.includes("zIndex: 801")).toBe(true);
    expect(src.includes("zIndex: 300")).toBe(false);
  });

  it("浮层/trigger 内滚动不关闭（capture scroll 只关外部祖先滚动）", () => {
    const src = readSrc("features/admin/violations/shared/useMultiSelectPopover.ts");
    expect(src.includes("panelRef.current?.contains(target)")).toBe(true);
    expect(src.includes("triggerRef.current?.contains(target)")).toBe(true);
    expect(src.includes('addEventListener("scroll", onScroll, { capture: true })')).toBe(true);
  });

  it("选择模板列表区不用 flex-1+min-h-0（不定高 max-h 父级会把文案压没）", () => {
    const src = readSrc("features/admin/violations/records/ViolationTemplateQuickSelect.tsx");
    expect(src.includes("<Portal>")).toBe(true);
    expect(src.includes("max-h-[min(320px,calc(100vh-12rem))] overflow-y-auto")).toBe(true);
    expect(src.includes('className="min-h-0 flex-1 overflow-y-auto')).toBe(false);
    expect(src.includes("richTextPlainPreview(t.violationText, 160)")).toBe(true);
    expect(src.includes("line-clamp-2")).toBe(false);
  });
});
