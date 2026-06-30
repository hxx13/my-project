/** 设计页：判断事件是否发生在可交互预览控件内（下拉、输入框等） */
export function isDesignInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  return !!target.closest('[data-design-interactive]');
}

/** 阻止事件冒泡到 td，避免触发拖选/格式刷 */
export function stopDesignGridBubble(e: React.SyntheticEvent) {
  e.stopPropagation();
}
