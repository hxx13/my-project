/**
 * 把左栏（`.aup-wb-aside`）内某行滚入可视区。
 * 只改 aside 的 scrollTop，避免 scrollIntoView 带动整页滚动。
 */
export function scrollAsideItemIntoView(
  aside: HTMLElement | null,
  item: HTMLElement | null,
  pad = 8,
): void {
  if (!aside || !item) return;
  const bodyRect = aside.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  if (itemRect.top < bodyRect.top + pad) {
    aside.scrollTop -= bodyRect.top + pad - itemRect.top;
  } else if (itemRect.bottom > bodyRect.bottom - pad) {
    aside.scrollTop += itemRect.bottom - (bodyRect.bottom - pad);
  }
}

/** 下一帧再滚，等展开/渲染完成 */
export function scheduleScrollAsideItem(
  aside: HTMLElement | null,
  selector: string,
  pad = 8,
): void {
  requestAnimationFrame(() => {
    const item = aside?.querySelector<HTMLElement>(selector) ?? null;
    scrollAsideItemIntoView(aside, item, pad);
  });
}
