import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

/**
 * 内嵌 PDF 预览：用带 token 的请求取 blob 再交给 iframe，
 * 避免把受保护的 PDF 暴露成静态 URL。
 */
export function PdfPreviewDialog({
  title,
  fetchPdf,
  onClose,
}: {
  title: string;
  fetchPdf: () => Promise<Blob>;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;
    fetchPdf()
      .then((blob) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        revoke = objectUrl;
        setUrl(objectUrl);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "加载失败");
      });
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [fetchPdf]);

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-medium">{title}</span>
          <button type="button" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
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
