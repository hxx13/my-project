/** 后台自定义右键菜单：剪贴板相关（无法 100% 复刻系统菜单，受浏览器安全策略限制） */

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

export function getEditableContextTarget(): HTMLInputElement | HTMLTextAreaElement | HTMLElement | null {
  const el = document.activeElement;
  if (isTextLikeInput(el)) return el;
  if (isContentEditable(el)) return el;
  return null;
}

export async function adminChromeCopySelectionOrPageUrl(): Promise<void> {
  const sel = window.getSelection()?.toString() ?? "";
  const text = sel.trim() ? sel : window.location.href;
  await navigator.clipboard.writeText(text);
}

export async function adminChromeCopyPageUrl(): Promise<void> {
  await navigator.clipboard.writeText(window.location.href);
}

export async function adminChromePasteIntoFocused(): Promise<void> {
  const el = getEditableContextTarget();
  if (!el) {
    throw new Error("请先点击输入框或富文本区域，再使用粘贴");
  }
  const text = await navigator.clipboard.readText();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const v = el.value;
    el.value = v.slice(0, start) + text + v.slice(end);
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    document.execCommand?.("insertText", false, text);
  }
}

export function adminChromeSelectAllInContext(): void {
  const el = getEditableContextTarget();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.select();
    return;
  }
  if (isContentEditable(el)) {
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
