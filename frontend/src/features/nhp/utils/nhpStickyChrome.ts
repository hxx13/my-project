/**
 * NHP 填写页吸顶高度：读 toolbar / 阶段条实际高度，避免硬编码 magic number。
 * - adminPreview（内容管理壳）：toolbar + stepper 均 sticky
 * - portal：PortalHeader（toolbar 的 sticky top）+ toolbar；阶段条不吸顶
 */

export type NhpFillMode = "portal" | "adminPreview";

export type NhpStickyChrome = {
  toolbarH: number;
  stepperH: number;
  /** 吸顶遮挡高度（不含额外呼吸间距） */
  chromeH: number;
  /** 门户顶栏等：来自 toolbar 的 sticky `top` */
  portalTop: number;
};

const SCROLL_GAP = 8;

export function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === "auto" || oy === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

export function measureNhpStickyChrome(root: HTMLElement, mode: NhpFillMode): NhpStickyChrome {
  const toolbar = root.querySelector<HTMLElement>(".toolbar");
  const stepper = root.querySelector<HTMLElement>(".stepper-wrap");
  const toolbarH = toolbar?.offsetHeight ?? 0;
  const stepperH = stepper?.offsetHeight ?? 0;
  if (mode === "adminPreview") {
    return { toolbarH, stepperH, chromeH: toolbarH + stepperH, portalTop: 0 };
  }
  const portalTop = toolbar ? Number.parseFloat(getComputedStyle(toolbar).top) || 0 : 0;
  return { toolbarH, stepperH, chromeH: portalTop + toolbarH, portalTop };
}

/** 写入 CSS 变量，供 sticky top / scroll-margin 绑定 */
export function applyNhpStickyChromeVars(host: HTMLElement, m: NhpStickyChrome): void {
  host.style.setProperty("--nhp-toolbar-h", `${m.toolbarH}px`);
  host.style.setProperty("--nhp-stepper-h", `${m.stepperH}px`);
  host.style.setProperty("--nhp-sticky-chrome", `${m.chromeH}px`);
  host.style.setProperty("--nhp-scroll-margin", `${m.chromeH + SCROLL_GAP}px`);
}

/** 点击章节时：滚到吸顶栏下方（scrollIntoView 在嵌套滚动口上常忽略 scroll-margin） */
export function scrollElementBelowSticky(
  el: HTMLElement,
  scrollParent: HTMLElement | null,
  offsetPx: number,
): void {
  if (scrollParent) {
    const pRect = scrollParent.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const top = scrollParent.scrollTop + (eRect.top - pRect.top) - offsetPx;
    scrollParent.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    return;
  }
  const top = window.scrollY + el.getBoundingClientRect().top - offsetPx;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

export function stickyScrollOffset(chromeH: number): number {
  return chromeH + SCROLL_GAP;
}

/** 滚动高亮：目标 top 相对视口的判定线（含壳 main 顶部偏移） */
export function stickyActiveLineY(chromeH: number, scrollParent: HTMLElement | null): number {
  const base = scrollParent ? scrollParent.getBoundingClientRect().top : 0;
  return base + stickyScrollOffset(chromeH);
}
