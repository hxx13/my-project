import { resolveApiMediaUrl } from '@/utils/mediaUrl';
import type { CellStyle } from '../types';
import { cellTextClass, cellTextTitle } from '../utils/gridCellLayout';

/** 静态格：Word 页眉图片 + 文本 */
export function StaticCellContent({
  text,
  style,
}: {
  text: string;
  style: CellStyle;
}) {
  const imgSrc = style.imageSrc
    ? (resolveApiMediaUrl(style.imageSrc) ?? style.imageSrc)
    : undefined;
  const display = text || '';

  return (
    <div className="flex flex-col items-center justify-center gap-1 min-w-0 w-full">
      {imgSrc ? (
        <img
          src={imgSrc}
          alt=""
          className="max-h-[72px] max-w-full object-contain"
          draggable={false}
        />
      ) : null}
      {display ? (
        <span
          className={cellTextClass(display, style.fontSize ?? 13, style.bold)}
          title={cellTextTitle(display)}
        >
          {display}
        </span>
      ) : !imgSrc ? (
        <span>{'\u00a0'}</span>
      ) : null}
    </div>
  );
}
