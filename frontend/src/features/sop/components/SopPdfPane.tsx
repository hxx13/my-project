import { useState } from "react";
import { Download, FileWarning, Loader2, Minus, Plus } from "lucide-react";
import { fetchSopPdfBlob, type SopDocument } from "@/api/domains/sop.api";
import { usePdfObjectUrl } from "@/components/common/usePdfObjectUrl";
import { sanitizeExportFilenamePart } from "@/features/report-form/utils/reportFormExportFilename";
import SopWatermark from "./SopWatermark";

/**
 * 缩放档位（绝对值百分比）。`fit` 是内置阅读器不给 `zoom` 参数时的默认行为 —— 适应宽度，
 * 对一份 A4 文档通常比 100% 更合适，所以作为初始态而不是 100%。
 */
const ZOOM_STEPS = [50, 67, 80, 100, 125, 150, 200, 300, 400];
type Zoom = "fit" | number;
/** 从「适应」出发时一档跳到哪：典型 A4 适应这个宽度大约落在 120–160%，往两边各让一档 */
const FROM_FIT_UP = 125;
const FROM_FIT_DOWN = 80;

/**
 * SOP 的 PDF 面板（**仅桌面**）：iframe + 水印 + 缩放。
 *
 * H5 不走这里 —— iOS Safari 不内嵌渲染 blob PDF，只显示第一页且不分页，
 * 手机端改用 `SopPdfCanvas`（pdf.js 画到 canvas）。
 *
 * 占满父容器，自身不画卡片边框/圆角 —— 桌面套圆角卡片、H5 直接通栏。
 *
 * ## 缩放为什么走 `#zoom=` + 重挂载
 *
 * 内置阅读器的缩放**只认 URL 上的 `zoom` 参数，且只在文档真实加载时生效**。实测：
 * 只改 fragment（`iframe.src = ...#zoom=250`）不触发导航，缩放不变；
 * 在 iframe 内部做 fragment 导航（`contentWindow.location.hash = ...`）同样不变。
 * 而 `postMessage({type:'viewport', zoom})` 虽然能生效，但数值语义测不出确定性
 * （传 2.5 得到 400%），是未公开接口，随版本会变，不能用。
 *
 * 所以：改 `key` 让 iframe 重新加载，把新档位放进 `zoom` 参数。代价是**每次缩放文档回到第一页**
 * （blob 已在内存里，重载本身很快）。Ctrl+滚轮仍可在不重载的情况下连续缩放。
 *
 * 也别改用「撑大 iframe 让它重新适应宽度」的办法：那样横向滚动在外层容器、纵向在阅读器内部，
 * 两个滚动面打架，手感完全不对。
 */
export function SopPdfPane({ doc, viewerName }: { doc: SopDocument; viewerName: string }) {
  const { url, error, loading } = usePdfObjectUrl(() => fetchSopPdfBlob(doc.id), doc.id);
  /** 本次查看的时间戳：挂载时固定，不在查看期间走字 */
  const [at] = useState(() => new Date());
  const [zoom, setZoom] = useState<Zoom>("fit");
  const filename = `${sanitizeExportFilenamePart(doc.title) || `sop-${doc.id}`}.pdf`;

  const stepZoom = (dir: 1 | -1) =>
    setZoom((z) => {
      if (z === "fit") return dir === 1 ? FROM_FIT_UP : FROM_FIT_DOWN;
      const i = ZOOM_STEPS.indexOf(z);
      const base = i < 0 ? ZOOM_STEPS.indexOf(100) : i;
      return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, base + dir))];
    });

  const atMin = zoom === ZOOM_STEPS[0];
  const atMax = zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1];
  const zoomLabel = zoom === "fit" ? "适应" : `${zoom}%`;

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[var(--app-color-surface-container)]">
      {/* `#toolbar=0` 只是尽力而为：Chrome/Firefox 的 PDF 阅读器认这个 fragment 会隐藏工具栏（连带下载按钮），
          Safari 等自带阅读器的会忽略。忽略的后果仅是工具栏还在，PDF 照常显示，不会白屏。 */}
      {error ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <FileWarning className="h-8 w-8 text-[var(--app-color-feedback-warning)]" />
          <p className="text-sm text-[var(--app-color-text-secondary)]">{error}</p>
          <p className="text-[11px] text-[var(--app-color-text-tertiary)]">文件可能已被清理，请联系管理员重新上传</p>
        </div>
      ) : url ? (
        <>
          <iframe
            /* key 跟着档位走：内置阅读器只在真实加载时读 zoom 参数，不重挂载就换不了档 */
            key={String(zoom)}
            title={doc.title}
            src={`${url}#toolbar=0&navpanes=0&statusbar=0${zoom === "fit" ? "" : `&zoom=${zoom}`}`}
            className="h-full w-full border-0"
          />
          <SopWatermark name={viewerName} at={at} />

          {/* 右上角。不用毛玻璃（半透明 + backdrop-blur）：底下的水印和 PDF 正文会透上来，
              控件本身反而看不清，所以给实底 + 描边 + 投影，和内容明确分层。
              不放右下角：那里被全局「智能助手」悬浮球占据。 */}
          <div className="absolute right-2.5 top-2.5 z-10 flex items-center gap-0.5 rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-0.5 shadow-lg">
            <button
              type="button"
              onClick={() => stepZoom(-1)}
              disabled={atMin}
              title="缩小"
              aria-label="缩小"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--app-color-text-primary)] transition active:bg-[var(--app-color-surface-hover)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom("fit")}
              title="恢复适应宽度"
              className="min-w-[3rem] rounded-full px-1 text-center text-[11px] font-semibold tabular-nums text-[var(--app-color-text-primary)] transition active:bg-[var(--app-color-surface-hover)] hover:bg-[var(--app-color-surface-hover)]"
            >
              {zoomLabel}
            </button>
            <button
              type="button"
              onClick={() => stepZoom(1)}
              disabled={atMax}
              title="放大"
              aria-label="放大"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--app-color-text-primary)] transition active:bg-[var(--app-color-surface-hover)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <span className="h-4 w-px bg-[var(--app-color-border-default)]" />
            <a
              href={url}
              download={filename}
              title="下载"
              aria-label="下载"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--app-color-text-primary)] transition active:bg-[var(--app-color-surface-hover)] hover:bg-[var(--app-color-surface-hover)]"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--app-color-text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          {loading ? "正在加载文档…" : "准备中…"}
        </div>
      )}
    </div>
  );
}

export default SopPdfPane;
