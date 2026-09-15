import { useEffect, useRef, useState } from "react";
import { PDFJS_STANDARD_FONT_DATA_URL } from "@/lib/pdfjs";

/**
 * 把 PDF 每一页画到一张 canvas 上，供 window.print() 打印。
 *
 * 为什么不直接把 blob PDF 塞进 iframe：Chrome 内置阅读器是插件，脚本够不着它的
 * 打印按钮；iOS 更是把 blob 丢给系统查看器，只显示第一页。自己画成 canvas，
 * 各端行为才一致。
 *
 * 渲染必须串行：同一张 canvas 上并发跑两次 page.render()，变换会交错，
 * 画出来上下镜像。这里用一条 for 循环顺序画，天然没有竞态。
 *
 * 渲染完成后才回调 onReady —— 调用方据此再调 window.print()。
 * 早调一步就会打出空白页，所以这个顺序不能省。
 */
export function PdfPrintCanvas({
  blob,
  onReady,
  onError,
}: {
  blob: Blob;
  /** 每页的 PNG dataURL，按页序。调用方拿它在独立 iframe 里打印 */
  onReady?: (pageDataUrls: string[]) => void;
  /** 渲染失败。必须回报 —— 否则任务会一直挂在 SENT 直到超时，后台看不到任何原因 */
  onError?: (message: string) => void;
}) {
  const [pages, setPages] = useState<{ dataUrl: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** 文档总页数。不到这个数就不算画完 —— 见下面 onReady 那段 */
  const [totalPages, setTotalPages] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const readyFiredRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    readyFiredRef.current = false;
    setPages([]);
    setTotalPages(0);
    setError(null);

    (async () => {
      try {
        const [pdfjs, workerUrl] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url").then((m) => m.default),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        const data = await blob.arrayBuffer();
        // standardFontDataUrl 不能省：不嵌字体的基础字体 PDF 少了它会渲染成空白页
        const t = pdfjs.getDocument({ data, standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL });
        task = t;
        const pdf = await t.promise;
        if (cancelled) return;
        setTotalPages(pdf.numPages);

        // 按 300 DPI 渲染 —— 打印标准。72pt = 1 英寸，所以 scale = 300/72 ≈ 4.17。
        //
        // 原先固定 2 倍，A4 只有 144 DPI，纸面上的小字明显发虚。
        // 这条是打印出来才发现的：屏幕上看着"挺清楚"毫无参考价值 ——
        // 我们送进打印机的是一张位图，位图分辨率就是画质的上限。
        const TARGET_DPI = 300;
        /** 单页像素上限：防大尺寸页面（A3 / 图纸）把内存吃爆 */
        const MAX_PIXELS = 25_000_000;

        const out: { dataUrl: string }[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          let scale = TARGET_DPI / 72;
          if (base.width * scale * base.height * scale > MAX_PIXELS) {
            scale = Math.sqrt(MAX_PIXELS / (base.width * base.height));
          }
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("no 2d context");
          // 显式复位：同一张画布被画过第二次时，残留变换会把内容画反
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          out.push({ dataUrl: canvas.toDataURL("image/png") });
          if (cancelled) return;
          setPages([...out]);
          // 让出主线程，长文档渲染时页面还能响应
          await new Promise((r) => setTimeout(r, 0));
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "PDF 解析失败";
        setError(msg);
        // 必须往上抛：不然工位页不知道渲染失败了，任务会挂在 SENT 直到超时，
        // 后台只看到「超时未回执」，真正的原因一个字都留不下。
        onErrorRef.current?.(msg);
      }
    })();

    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [blob]);

  // 图片全部解码完才通知可以打印。dataUrl 解码虽快但不保证同步，
  // 抢在解码前 print() 会打出空白。
  useEffect(() => {
    // 必须等**全部**页都画完再通知。
    // pages 是逐页长出来的，原先的判据「已有页数 === 页面上的 img 数」在第一页
    // 画完时就成立 —— 于是打印只拿到第一页，而且 readyFiredRef 一置位就再也不通知。
    // 实测表现：多页文档永远只出一张，且任务状态一切正常。
    if (readyFiredRef.current || totalPages === 0 || pages.length !== totalPages) return;
    const imgs = Array.from(containerRef.current?.querySelectorAll("img") ?? []);
    if (imgs.length !== pages.length) return;
    Promise.all(
      imgs.map((im) => (im.complete ? Promise.resolve() : im.decode().catch(() => undefined))),
    ).then(() => {
      if (readyFiredRef.current) return;
      readyFiredRef.current = true;
      // 再等一帧，确保布局落定
      requestAnimationFrame(() => onReadyRef.current?.(pages.map((p) => p.dataUrl)));
    });
  }, [pages, totalPages]);

  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>;
  if (pages.length === 0) return <div className="p-4 text-sm text-gray-500">正在渲染…</div>;

  return (
    <div ref={containerRef}>
      {pages.map((p, i) => (
        <img
          key={i}
          src={p.dataUrl}
          alt=""
          style={{ width: "100%", display: "block", breakAfter: "page" }}
        />
      ))}
    </div>
  );
}
