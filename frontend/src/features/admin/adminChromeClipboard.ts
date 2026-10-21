import { copyTextToClipboard } from "@/lib/copyToClipboard";

/** 后台自定义右键菜单：剪贴板相关（无法 100% 复刻系统菜单，受浏览器安全策略限制） */

export type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

function isTextLikeInput(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) {
    if (el.disabled || el.readOnly) return false;
    const t = (el.type || "text").toLowerCase();
    return ["text", "search", "url", "tel", "password", ""].includes(t);
  }
  return false;
}

function isContentEditable(el: Element | null): el is HTMLElement {
  return !!el && el instanceof HTMLElement && el.isContentEditable;
}

export function getEditableContextTarget(): EditableTarget | null {
  const el = document.activeElement;
  if (isTextLikeInput(el)) return el;
  if (isContentEditable(el)) return el;
  return null;
}

/** 只看右键落点本身（含祖先）是不是可编辑区域；不看当前焦点 */
export function findEditableContextTarget(target: EventTarget | null): EditableTarget | null {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return isTextLikeInput(target) ? target : null;
  }
  if (target instanceof Element) {
    const ce = target.closest("[contenteditable]");
    if (isContentEditable(ce)) return ce;
  }
  return null;
}

/**
 * 右键按下时立刻记住目标输入框。
 * 菜单一打开、用户点「粘贴」按钮，焦点就落到按钮上，此时再读 activeElement 已经找不到输入框。
 */
export function resolveEditableContextTarget(target: EventTarget | null): EditableTarget | null {
  return findEditableContextTarget(target) ?? getEditableContextTarget();
}

/** 绕过 React 受控值的 value tracker，否则直接赋 value 后 input 事件会被判定为「未变化」 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

export async function adminChromeCopySelectionOrPageUrl(): Promise<void> {
  const sel = window.getSelection()?.toString() ?? "";
  const text = sel.trim() ? sel : window.location.href;
  const ok = await copyTextToClipboard(text);
  if (!ok) throw new Error("复制失败，请手动复制");
}

export async function adminChromeCopyPageUrl(): Promise<void> {
  const ok = await copyTextToClipboard(window.location.href);
  if (!ok) throw new Error("复制失败，请手动复制");
}

export async function adminChromePasteIntoFocused(target?: EditableTarget | null): Promise<void> {
  const el = (target && target.isConnected ? target : null) ?? getEditableContextTarget();
  if (!el) {
    throw new Error("请先点击输入框或富文本区域，再使用粘贴");
  }
  if (!navigator.clipboard?.readText) {
    throw new Error("当前浏览器不支持读取剪贴板，请在输入框上使用系统右键菜单粘贴，或按 Ctrl+V");
  }
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    throw new Error("浏览器未允许读取剪贴板，请在输入框上使用系统右键菜单粘贴，或按 Ctrl+V");
  }
  el.focus({ preventScroll: true });
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const v = el.value;
    setNativeValue(el, v.slice(0, start) + text + v.slice(end));
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    document.execCommand?.("insertText", false, text);
  }
}

export function adminChromeSelectAllInContext(target?: EditableTarget | null): void {
  const el = (target && target.isConnected ? target : null) ?? getEditableContextTarget();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus({ preventScroll: true });
    el.select();
    return;
  }
  if (isContentEditable(el)) {
    el.focus({ preventScroll: true });
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
    return;
  }
  const main = document.querySelector("main");
  if (main) {
    const r = document.createRange();
    r.selectNodeContents(main);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  }
}
