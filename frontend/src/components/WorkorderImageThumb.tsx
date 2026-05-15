import toast from "react-hot-toast";
import { isCloudFileId, webImageSrc } from "@/utils/mediaUrl";

type Props = {
  url: string;
  alt: string;
  /** 仅当 URL 可在浏览器中展示时调用（已解析为 http(s) 或相对路径） */
  onPreview: (displayableSrc: string) => void;
};

export function WorkorderImageThumb({ url, alt, onPreview }: Props) {
  const src = webImageSrc(url);
  if (src) {
    return (
      <button type="button" onClick={() => onPreview(src)} className="shrink-0">
        <img src={src} alt={alt} className="h-16 w-16 rounded border object-cover" />
      </button>
    );
  }
  if (isCloudFileId(url)) {
    return (
      <button
        type="button"
        onClick={() => toast("云存储图片请在小程序中查看", { duration: 3500 })}
        className="shrink-0 flex h-16 w-16 flex-col items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 px-0.5 text-center text-[10px] leading-tight text-slate-500"
      >
        云图
        <span className="text-[9px]">小程序</span>
      </button>
    );
  }
  return null;
}
