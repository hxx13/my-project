import { useEffect, useRef, useState } from "react";

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
export function PdfPrintCanvas({ blob, onReady }: { blob: Blob; onReady?: () => void }) {
  const [pages, setPages] = useState<{ dataUrl: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const readyFiredRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    readyFiredRef.current = false;
    setPages([]);
    setError(null);

    (async () => {
      try {
        const [pdfjs, workerUrl] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url").then((m) => m.default),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        const data = await blob.arrayBuffer();
        const t = pdfjs.getDocument({ data });
        task = t;
        const pdf = await t.promise;
        if (cancelled) return;

        // 固定 2 倍分辨率：打印不受屏幕尺寸影响
        const SCALE = 2;
        const out: { dataUrl: string }[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: SCALE });
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
        if (!cancelled) setError(e instanceof Error ? e.message : "PDF 解析失败");
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
    if (readyFiredRef.current || pages.length === 0) return;
    const imgs = Array.from(containerRef.current?.querySelectorAll("img") ?? []);
    if (imgs.length !== pages.length) return;
    Promise.all(
      imgs.map((im) => (im.complete ? Promise.resolve() : im.decode().catch(() => undefined))),
    ).then(() => {
      if (readyFiredRef.current) return;
      readyFiredRef.current = true;
      // 再等一帧，确保布局落定
      requestAnimationFrame(() => onReadyRef.current?.());
    });
  }, [pages]);

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
