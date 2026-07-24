import { resolveApiMediaUrl } from "@/utils/mediaUrl";
import { cn } from "@/lib/utils";
import type { ImgHTMLAttributes } from "react";

/**
 * 自动解析图片 URL 的 <img> 替代组件。
 *
 * 相对路径 → 拼接 origin / HTTP → 直连。
 * 无需在每个页面手动调用 resolveApiMediaUrl()。
 *
 * 用法：全局搜索 <img 替换为 <AutoImage 即可，props 完全兼容。
 *   <AutoImage src={item.coverUrl} alt="" className="w-full object-cover" />
 *
 * 详见 docs/双端图片互通开发者指南.md
 */
export function AutoImage({
  src,
  className,
  alt = "",
  ...rest
}: ImgHTMLAttributes<HTMLImageElement>) {
  const resolved = src ? resolveApiMediaUrl(String(src)) : "";
  return (
    <img
      src={resolved}
      alt={alt}
      className={cn(className)}
      {...rest}
    />
  );
}
