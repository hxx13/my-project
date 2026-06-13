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

function resolveModalRootForTarget(target: EventTarget | null): Element | null {
  const layers = document.querySelectorAll('[data-modal-layer="true"]');
  if (layers.length === 0) {
    return null;
  }
  if (target instanceof Node) {
    for (let i = layers.length - 1; i >= 0; i--) {
      if (layers[i]!.contains(target)) {
        return layers[i]!;
      }
    }
  }
  return layers[layers.length - 1]!;
}

function onWheel(e: WheelEvent) {
  const modalRoot = resolveModalRootForTarget(e.target);
  if (!modalRoot) {
    return;
  }

  const scrollEl = findScrollableAncestor(e.target, modalRoot);
  if (!scrollEl) {
    e.preventDefault();
    return;
  }

  const { scrollTop, scrollHeight, clientHeight } = scrollEl;
  const dy = e.deltaY;
  const canScroll = scrollHeight > clientHeight + 1;

  // 标记了 data-modal-scroll 但尚未形成溢出：不拦截，避免滚轮完全失效
  if (!canScroll) {
    if (scrollEl.hasAttribute("data-modal-scroll")) {
      return;
    }
    e.preventDefault();
    return;
  }

  const atTop = scrollTop <= 0;
  const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
  if ((dy < 0 && atTop) || (dy > 0 && atBottom)) {
    e.preventDefault();
    return;
  }

  // capture 阶段 + 多 modal 层时浏览器默认滚轮常失效，对显式滚动区手动推进
  if (scrollEl.hasAttribute("data-modal-scroll")) {
    e.preventDefault();
    scrollEl.scrollTop += dy;
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
