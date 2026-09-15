/**
 * 哪些文件能打印。
 *
 * 工位是靠浏览器渲染的：PDF 走 pdf.js 画成 canvas，图片直接 <img>。
 * **没有第三种**能可靠静默打印的载体 —— Office 文档、压缩包之类，
 * 浏览器渲染不了，硬派给工位只会让它卡在 SENT，后台什么原因都看不到
 * （存量库里还留着上传限制之前传的 .docx / .xlsx）。
 *
 * 所以派发前就要拦下来提示用户，工位侧再兜一道底。
 */
export type PrintKind = "pdf" | "image" | "unsupported";

export function printKindOf(fileName: string): PrintKind {
  const n = (fileName || "").toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g)$/.test(n)) return "image";
  return "unsupported";
}

export const UNSUPPORTED_PRINT_HINT =
  "只能打印 PDF 或图片。Word、Excel 请先另存为 PDF 再上传。";
