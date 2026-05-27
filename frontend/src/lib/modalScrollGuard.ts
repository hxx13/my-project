/**
 * 弹窗打开时锁定页面滚动，并在可滚动弹窗内容滚到顶/底时阻止滚轮穿透到背后页面。
 * 在任意固定层弹窗根节点加 data-modal-layer="true"，可滚动区域加 data-modal-scroll。
 */
let initialized = false;

function findScrollableAncestor(start: EventTarget | null, modalRoot: Element): HTMLElement | null {
  let node = start instanceof HTMLElement ? start : null;
  while (node && modalRoot.contains(node)) {
    if (node.hasAttribute("data-modal-scroll")) {
      return node;
    }
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    const canScroll =
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight + 1;
    if (canScroll) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function syncBodyScrollLock() {
  const open = document.querySelector('[data-modal-layer="true"]');
  document.documentElement.toggleAttribute("data-modal-scroll-lock", Boolean(open));
}

function onWheel(e: WheelEvent) {
  const layers = document.querySelectorAll('[data-modal-layer="true"]');
  if (layers.length === 0) {
    return;
  }

  const topLayer = layers[layers.length - 1];
  const scrollEl = findScrollableAncestor(e.target, topLayer);
  if (!scrollEl) {
    e.preventDefault();
    return;
  }

  const { scrollTop, scrollHeight, clientHeight } = scrollEl;
  const dy = e.deltaY;
  const atTop = scrollTop <= 0;
  const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
  if ((dy < 0 && atTop) || (dy > 0 && atBottom)) {
    e.preventDefault();
  }
}

export function initModalScrollGuard() {
  if (initialized || typeof document === "undefined") {
    return;
  }
  initialized = true;

  const observer = new MutationObserver(() => syncBodyScrollLock());
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-modal-layer"],
  });

  document.addEventListener("wheel", onWheel, { passive: false, capture: true });
  syncBodyScrollLock();
}
