import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(here, "../../..");

function readSrc(rel: string): string {
  return readFileSync(resolve(frontendRoot, "src", rel), "utf8");
}

/** 从 tokens.css 里读一个 z 变量的数值。 */
function zToken(name: string): number {
  const m = readSrc("styles/tokens.css").match(new RegExp(`--${name}:\\s*(\\d+)`));
  return m ? Number(m[1]) : NaN;
}

/**
 * 回归：订购页的规格弹窗是一层**手写**遮罩，层级散落在组件里（硬编码 900）；
 * 而通用弹窗（PersonnelPicker 等）走 Radix，DialogPortal 把内容挂到 document.body，
 * z 用 --z-modal(800)。两者在 body 下是**同级兄弟**，不是祖孙 —— 所以通用弹窗
 * 没法靠 DOM 顺序赢，只能靠 z 值。
 *
 * 实测（2026-09-23，规格弹窗内点「领用人 → 选择」）：
 *   规格弹窗遮罩 z=900  >  选人弹窗内容 z=800  >  选人弹窗遮罩 z=600
 * 表现：选人弹窗整层被压在规格弹窗遮罩之下（变暗、被遮住），且点它外面时事件
 * 落到 900 那层，把整个规格弹窗一起关掉（「穿透」）。
 *
 * 这组守卫锁住层级表本身与三处用法，防止再被魔数压回去。
 */
describe("弹层层级守卫", () => {
  it("层级表数值顺序：modal < above < nested < toast", () => {
    const modal = zToken("z-modal");
    const above = zToken("z-modal-above");
    const nested = zToken("z-modal-nested");
    const toast = zToken("z-toast");

    expect(modal).toBe(800);
    expect(above).toBeGreaterThan(modal);
    expect(nested).toBeGreaterThan(above);
    expect(toast).toBeGreaterThan(nested);
  });

  it("订购页规格弹窗那一档用 --z-modal-above，不再散落硬编码 900", () => {
    const src = readSrc("features/reference-data/ReferenceDataManager.tsx");
    expect(src.includes("z-[var(--z-modal-above)]")).toBe(true);
    expect(src.includes("z-[900]")).toBe(false);
  });

  it("从弹窗内部唤起的人员选择弹窗，内容与遮罩都高于规格弹窗那一档", () => {
    const picker = readSrc("components/admin/PersonnelPicker.tsx");
    // 内容层
    expect(picker.includes("z-[var(--z-modal-nested)]")).toBe(true);
    // 遮罩层也必须一起抬：否则点它外面会落到下面的规格弹窗遮罩上，把父弹窗一起关掉
    expect(picker.includes('overlayClassName="z-[var(--z-modal-nested)]"')).toBe(true);
    // 曾经用 --z-modal(800)，被订购页 900 那层整层压住
    expect(picker.includes("z-[var(--z-modal)]")).toBe(false);
  });
});
