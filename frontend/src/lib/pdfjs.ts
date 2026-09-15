/**
 * pdf.js 标准字体数据的存放目录（文件在 `frontend/public/pdfjs-standard-fonts/`）。
 *
 * ## 为什么必须有它
 *
 * PDF 的 14 个「基础字体」（Helvetica / Arial / Times / Courier …）允许**不嵌入字体文件**，
 * 正文里只写一个字体名。pdf.js 自己不含这些字形，得按这个 URL 去取 pdfjs-dist
 * 附带的两套替身字体：Foxit 的 `.pfb` 和 Liberation 的 `.ttf`
 * （新版 pdf.js 用 Liberation Sans 顶替 Helvetica/Arial）。
 *
 * ## 没配的后果非常隐蔽
 *
 * 这类 PDF 渲染出来是**空白页** —— 不抛异常、不打任何日志，画布上就是什么都没有。
 * 表现为「打出来一张白纸」，而任务状态一切正常、队列也一切正常。
 * 嵌入字体的 PDF（WPS/Word 导出的通常都嵌）完全不受影响，
 * 所以这个问题只会在特定文件上暴露，极容易被当成打印机故障去查。
 *
 * 升级 pdfjs-dist 后记得重新同步这两个目录：
 * `cp node_modules/pdfjs-dist/standard_fonts/* frontend/public/pdfjs-standard-fonts/`
 */
export const PDFJS_STANDARD_FONT_DATA_URL = "/pdfjs-standard-fonts/";
