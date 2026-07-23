import { useState } from 'react';
import { dualImageSrc, type DualImageSource } from '@/utils/mediaUrl';

interface DualImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  source: DualImageSource;
  fallback?: string;
}

/**
 * 双端图片组件。
 * 浏览器端使用 publicUrl 加载；加载失败时显示 fallback 占位。
 * wechat cloud:// 格式的 fileID 无法在浏览器渲染，自动跳过。
 */
export default function DualImage({ source, fallback, alt, style, ...rest }: DualImageProps) {
  const src = dualImageSrc({
    publicUrl: source.publicUrl,
    wechatFileId: source.wechatFileId,
    fallback,
  });
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div
        className="flex items-center justify-center bg-[var(--app-color-surface-container)] text-[var(--app-color-text-tertiary)] text-sm"
        style={{
          width: style?.width || rest.width || 80,
          height: style?.height || rest.height || 80,
          ...style,
        }}
      >
        {alt || '无图片'}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setError(true)}
      style={style}
      {...rest}
    />
  );
}
