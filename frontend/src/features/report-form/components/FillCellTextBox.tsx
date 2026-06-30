import type { CSSProperties, ReactNode } from 'react';
import {
  GRID_CELL_TEXT_FIT_CLASS,
  GRID_CELL_TEXT_WRAP_CLASS,
  fillTextLineHeightPx,
  fillTextScrollMaxHeightPx,
  resolveFillTextDisplayMode,
} from '../utils/gridCellLayout';

type Props = {
  text: string;
  colWidth: number;
  baseColWidth: number;
  fontSize?: number;
  bold?: boolean;
  className?: string;
  empty?: ReactNode;
};

/** 填报格内文本：≤1 行完整；2~3 行自然换行；>3 行限高并框内滚动 */
export function FillCellTextBox({
  text,
  colWidth,
  baseColWidth,
  fontSize = 12,
  bold,
  className = '',
  empty = '\u00a0',
}: Props) {
  const trimmed = text?.trim() ?? '';
  const mode = resolveFillTextDisplayMode(trimmed || text, colWidth, baseColWidth, fontSize, bold);

  if (!trimmed) {
    return <span className={className}>{empty}</span>;
  }

  if (mode === 'fit') {
    return (
      <span
        className={`${GRID_CELL_TEXT_FIT_CLASS} ${className}`}
        title={text}
      >
        {text}
      </span>
    );
  }

  if (mode === 'wrap') {
    return (
      <span
        className={`${GRID_CELL_TEXT_WRAP_CLASS} ${className}`}
        title={text}
      >
        {text}
      </span>
    );
  }

  return (
    <div
      className={`block w-full min-w-0 whitespace-normal [overflow-wrap:break-word] [word-break:break-word] overflow-y-auto overflow-x-hidden overscroll-contain ${className}`}
      style={fillTextScrollBoxStyle(fontSize)}
      title={text}
      role="textbox"
      aria-readonly
    >
      {text}
    </div>
  );
}

export function fillTextScrollBoxStyle(fontSize = 12): CSSProperties {
  return {
    maxHeight: fillTextScrollMaxHeightPx(fontSize),
    lineHeight: `${fillTextLineHeightPx(fontSize)}px`,
  };
}

/** 可编辑 textarea：仅超过 3 行时出现框内滚动 */
export function fillTextareaBoxStyle(
  text: string,
  colWidth: number,
  baseColWidth: number,
  fontSize = 12,
  bold?: boolean,
): CSSProperties {
  const lineH = fillTextLineHeightPx(fontSize);
  const mode = resolveFillTextDisplayMode(text, colWidth, baseColWidth, fontSize, bold);

  if (mode === 'scroll') {
    const maxH = fillTextScrollMaxHeightPx(fontSize) + 12;
    return {
      lineHeight: `${lineH}px`,
      height: maxH,
      maxHeight: maxH,
      overflowY: 'auto',
      overflowX: 'hidden',
    };
  }

  if (mode === 'wrap') {
    return {
      lineHeight: `${lineH}px`,
      overflowX: 'hidden',
    };
  }

  return {
    lineHeight: `${lineH}px`,
    overflowX: 'hidden',
  };
}
