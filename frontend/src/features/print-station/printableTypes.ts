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
export type PrintKind = "pdf" | "image" | "office" | "unsupported";

/** 能被服务端转成 PDF 的类型。派发时放行，打印时收到的会是转换产物 */
const OFFICE_RE = /\.(docx?|xlsx?|pptx?|odt|ods|odp|rtf)$/;

export function printKindOf(fileName: string): PrintKind {
  const n = (fileName || "").toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g)$/.test(n)) return "image";
  if (OFFICE_RE.test(n)) return "office";
  return "unsupported";
}

/**
 * 按**内容**判定，而不是扩展名。
 *
 * 为什么不能看扩展名：服务端会把 Word / Excel 在上传时转成 PDF 存一份，
 * 派发给工位的是**转换产物**，但 `file_name` 仍然是原始名（`xxx.docx`）。
 * 只看扩展名会把一个货真价实的 PDF 判成"不支持"。
 */
export async function sniffBlobKind(blob: Blob): Promise<"pdf" | "image" | "unsupported"> {
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const ascii = String.fromCharCode(...head);
  if (ascii.startsWith("%PDF-")) return "pdf";
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image"; // PNG
  if (head[0] === 0xff && head[1] === 0xd8) return "image"; // JPEG
  return "unsupported";
}

export const UNSUPPORTED_PRINT_HINT =
  "只支持 PDF、图片，以及能转成 PDF 的 Word / Excel / PPT。压缩包之类的请先转成 PDF。";
