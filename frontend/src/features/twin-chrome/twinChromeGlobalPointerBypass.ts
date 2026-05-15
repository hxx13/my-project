/**
 * Twin 壳全局指针/右键菜单：命中以下区域时不劫持，与 contextmenu 监听共用同一套规则。
 * 鼠标驱动级「右键手势」在浏览器外，此处无法禁用（见 TwinLayoutInner 注释）。
 */
export function twinChromeGlobalPointerShouldBypass(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return true;
    if (target.closest("[data-twin-chrome-ctx-surface]")) return true;
    if (target.closest("[data-twin-global-ctx-skip]")) return true;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return true;
    return false;
}
