import { createPortal } from "react-dom";
import { Download, Loader2, X } from "lucide-react";
import { usePdfObjectUrl } from "./usePdfObjectUrl";

/**
 * 内嵌 PDF 预览：用带 token 的请求取 blob 再交给 iframe，
 * 避免把受保护的 PDF 暴露成静态 URL。
 */
export function PdfPreviewDialog({
  title,
  fetchPdf,
  onClose,
  fileName,
}: {
  title: string;
  fetchPdf: () => Promise<Blob>;
  onClose: () => void;
  fileName?: string;
}) {
  // 不传 key：只在挂载时拉一次，调用方传内联箭头也不会触发重复请求
  const { url, error } = usePdfObjectUrl(fetchPdf);

  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName ?? "document.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-medium">{title}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={download}
              disabled={!url}
              aria-label="下载"
              className="flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              下载
            </button>
            <button type="button" onClick={onClose} aria-label="关闭">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 bg-neutral-100">
          {error ? (
            <div className="flex h-full items-center justify-center text-sm text-rose-600">{error}</div>
          ) : url ? (
            <iframe title={title} src={url} className="h-full w-full" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中…
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
