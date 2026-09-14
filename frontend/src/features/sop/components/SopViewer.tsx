import type { SopDocument } from "@/api/domains/sop.api";
import SopPdfPane from "./SopPdfPane";

/**
 * 桌面端的 PDF 查看区：给共用的 {@link SopPdfPane} 套一层圆角卡片。
 *
 * 调用方**必须带 `key={doc.id}`**：水印时间戳与缩放档位都在挂载时初始化，
 * 不重挂载就会把上一份文档的查看时间/缩放带到新文档上。
 */
export function SopViewer({ doc, viewerName }: { doc: SopDocument; viewerName: string }) {
  return (
    <div className="h-full min-h-0 w-full overflow-hidden rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)]">
      <SopPdfPane doc={doc} viewerName={viewerName} />
    </div>
  );
}

export default SopViewer;
