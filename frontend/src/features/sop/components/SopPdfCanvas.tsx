import { useEffect, useRef, useState } from "react";
import { FileWarning, Loader2 } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { fetchSopPdfBlob, type SopDocument } from "@/api/domains/sop.api";
import { usePdfObjectUrl } from "@/components/common/usePdfObjectUrl";
import { PDFJS_STANDARD_FONT_DATA_URL } from "@/lib/pdfjs";
import SopWatermark from "./SopWatermark";

/**
 * H5 的 PDF 面板：用 pdf.js 把每页画到 canvas。
 *
 * ## 为什么不复用桌面那份 iframe
 *
 * 桌面靠浏览器内置阅读器，iOS Safari 根本不内嵌渲染 —— 它把 blob PDF 丢给系统
 * 查看器（QuickLook），只显示第一页且不分页，`toolbar=0`/`zoom=` 也一律忽略。
 * 换 pdf.js 自己画，各端行为才一致。
 *
 * 水印仍是独立的 DOM 覆层（`SopWatermark`），不烘焙进 canvas —— 防泄漏语义不变。
 *
 * ## 为什么要「先量尺寸占位、再顺序逐页画」
 *
 * 一页一面的 IntersectionObserver 写法踩过坑：React 严格模式下 effect 会重入，
 * 同一张 canvas 上会并发跑起两次 `page.render()`，画出来的内容是上下镜像的
 * （变换被交错应用）。改成在父组件里一条 `for` 循环顺序画，天然没有竞态，
 * 渲染前再显式 `setTransform` 复位，彻底断掉这一类问题。
 *
 * 顺序画还有个好处：每画完一页就 setState，长文档是一页页长出来的，不是卡住不动。
 */
export function SopPdfCanvas({ doc, viewerName }: { doc: SopDocument; viewerName: string }) {
  const { url, error, loading } = usePdfObjectUrl(() => fetchSopPdfBlob(doc.id), doc.id);
  /** 本次查看的时间戳：挂载时固定，不在查看期间走字 */
  const [at] = useState(() => new Date());

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <FileWarning className="size-8 text-gray-300" />
        <p className="text-sm text-gray-500">{error}</p>
        <p className="text-[11px] text-gray-400">文件可能已被清理，请联系管理员重新上传</p>
      </div>
    );
  }
  if (!url) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-400">
        <Loader2 className="size-4 animate-spin" />
        {loading ? "正在加载文档…" : "准备中…"}
      </div>
    );
  }
  return <PdfScroller url={url} viewerName={viewerName} at={at} />;
}

/** 左右各留 8px 边距，画布宽度 = 容器宽 - 16 */
const SIDE_GAP = 8;

function PdfScroller({ url, viewerName, at }: { url: string; viewerName: string; at: Date }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(0);
  /** 每页按比例算出的占位尺寸；空数组表示还没量完 */
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  /** 已画完的页数，用于把占位文案逐页摘掉 */
  const [drawn, setDrawn] = useState(0);
  const [current, setCurrent] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // pdf.js 只在真正打开 SOP 时才拉进来（含 worker，约 1MB），别进主包
  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    setPdf(null);
    setError(null);
    setSizes([]);
    setDrawn(0);
    setCurrent(1);
    (async () => {
      try {
        const [pdfjs, workerUrl] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url").then((m) => m.default),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        // standardFontDataUrl 不能省：不嵌字体的基础字体 PDF 少了它会渲染成空白页
        const t = pdfjs.getDocument({ url, standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL });
        task = t;
        const loaded = await t.promise;
        if (cancelled) return;
        setPdf(loaded);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "文档解析失败");
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url]);

  // 画布宽度跟着容器走（横竖屏切换、分屏都会变）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 先量出每页比例占位：没有高度就没有滚动条，长文档的进度也没法体现
  useEffect(() => {
    if (!pdf || width <= 0) return;
    let cancelled = false;
    const cssWidth = Math.max(width - SIDE_GAP * 2, 1);
    (async () => {
      const next: { w: number; h: number }[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const base = page.getViewport({ scale: 1 });
        next.push({ w: cssWidth, h: Math.round((base.height / base.width) * cssWidth) });
      }
      if (!cancelled) setSizes(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, width]);

  /**
   * 渲染必须严格串行。
   *
   * 容器出现滚动条后 `clientWidth` 会变小，`sizes` 随之重算并**再跑一轮**渲染循环。
   * 第一轮还在画的时候第二轮就起来了，两轮同时往同一张 canvas 上 `page.render()`，
   * 变换互相交错，画出来就是上下镜像的（第一页最明显，因为它是两轮都要碰的）。
   * 所以用「代际号 + 串行链」：新一轮先等上一轮画完，旧轮发现自己的代际过期就退出。
   */
  const generationRef = useRef(0);
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  // 顺序逐页画。width 变了（转向/分屏）会整份重画
  useEffect(() => {
    if (!pdf || sizes.length === 0) return;
    const generation = ++generationRef.current;
    const previous = chainRef.current;
    const stale = () => generation !== generationRef.current;

    const run = (async () => {
      await previous.catch(() => undefined);
      if (stale()) return;
      setDrawn(0);
      for (let i = 1; i <= pdf.numPages; i++) {
        if (stale()) return;
        const canvas = canvasRefs.current[i - 1];
        if (!canvas) continue;
        try {
          await renderPage(pdf, i, sizes[i - 1].w, sizes[i - 1].h, canvas);
        } catch {
          /* 单页失败不连累后面的 */
        }
        if (stale()) return;
        setDrawn(i);
        // 让出主线程，长文档渲染时页面还能响应滚动
        await new Promise((r) => setTimeout(r, 0));
      }
    })();
    chainRef.current = run;
    return () => {
      // 组件卸载或依赖变化：作废本轮，交给链上的下一轮接管
      if (generationRef.current === generation) generationRef.current++;
    };
  }, [pdf, sizes]);

  /** 页码指示：取越过视口 35% 那条线的最后一页 */
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // 用视口坐标而不是 offsetTop：后者相对最近的定位祖先，容器一改定位就全算错
    const line = el.getBoundingClientRect().top + el.clientHeight * 0.35;
    let n = 1;
    el.querySelectorAll<HTMLElement>("[data-page]").forEach((p) => {
      if (p.getBoundingClientRect().top <= line) n = Number(p.dataset.page);
    });
    setCurrent(n);
  };

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-gray-100 dark:bg-gray-900">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-y-contain">
        {error ? (
          <div className="flex h-full items-center justify-center px-8 text-center text-sm text-gray-500">{error}</div>
        ) : sizes.length === 0 ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-400">
            <Loader2 className="size-4 animate-spin" />
            正在渲染…
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-2" style={{ minHeight: "100%" }}>
            {sizes.map((s, i) => (
              <div
                key={i}
                data-page={i + 1}
                className="relative shrink-0 overflow-hidden rounded bg-white shadow-sm dark:bg-gray-800"
                style={{ width: s.w, height: s.h }}
              >
                <canvas
                  ref={(el) => {
                    canvasRefs.current[i] = el;
                  }}
                  className="block"
                  style={{ width: s.w, height: s.h }}
                />
                {drawn <= i ? (
                  <div className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-300">
                    第 {i + 1} 页
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 水印覆层贴在滚动容器外面，滚动时停在可视区不走位（与桌面 iframe 版一致） */}
      <SopWatermark name={viewerName} at={at} />

      {sizes.length > 1 ? (
        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white">
          {current} / {sizes.length}
        </div>
      ) : null}
    </div>
  );
}

async function renderPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  cssWidth: number,
  cssHeight: number,
  canvas: HTMLCanvasElement,
): Promise<void> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  // 按设备像素比放大，否则手机上文字发虚；上限 2 免得十几页的文档吃爆内存
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  // 显式复位：万一同一张画布被画过第二次，残留的变换会把内容画反
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
}

export default SopPdfCanvas;
