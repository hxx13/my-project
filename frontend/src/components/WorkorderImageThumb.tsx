import { webImageSrc } from "@/utils/mediaUrl";

type Props = {
  url: string;
  alt: string;
  /** 仅当 URL 可在浏览器中展示时调用（已解析为 http(s) 或相对路径） */
  onPreview: (displayableSrc: string) => void;
};

/**
 * 显示工单/物资图片缩略图。
 * - http(s) 或相对路径：直接渲染 <img>（含 404 兜底）
 * - 不支持的格式：显示提示
 */
export function WorkorderImageThumb({ url, alt, onPreview }: Props) {
  const src = webImageSrc(url);
  if (src) {
    return (
      <button type="button" onClick={() => onPreview(src)} className="shrink-0">
        <img
          src={src}
          alt={alt}
          className="h-16 w-16 rounded border object-cover"
          onError={(e) => {
            // 图片加载失败（404/网络错误） → 显示占位
            (e.target as HTMLImageElement).style.display = "none";
            const placeholder = (e.target as HTMLImageElement).nextElementSibling;
            if (placeholder) (placeholder as HTMLElement).style.display = "flex";
          }}
        />
        <span
          className="hidden h-16 w-16 flex-col items-center justify-center rounded border bg-[var(--app-color-surface-container)] text-[var(--app-color-text-tertiary)] text-[10px] leading-tight"
        >
          无图片
        </span>
      </button>
    );
  }
  return null;
}
