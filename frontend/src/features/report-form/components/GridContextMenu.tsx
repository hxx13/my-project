import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Combine, Ungroup } from 'lucide-react';

interface Props {
  x: number;
  y: number;
  selectedCellIds: string[];
  onClose: () => void;
  onInsertRow: (position: 'above' | 'below') => void;
  onInsertCol: (position: 'left' | 'right') => void;
  onDeleteRow: () => void;
  onDeleteCol: () => void;
  onMergeCells: () => void;
  onSplitCell: () => void;
  canMerge: boolean;
  canSplit: boolean;
}

export default function GridContextMenu({
  x, y, onClose,
  onInsertRow, onInsertCol, onDeleteRow, onDeleteCol,
  onMergeCells, onSplitCell, canMerge, canSplit,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [onClose]);

  const menuItem = (label: string, icon: React.ReactNode, onClick: () => void, danger = false) => (
    <button
      onClick={() => { onClick(); onClose(); }}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors text-left
        ${danger
          ? 'text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-feedback-danger-soft)]'
          : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'}`}
    >
      {icon} {label}
    </button>
  );

  const divider = <div className="h-px bg-[var(--app-color-border-default)] my-1" />;

  return createPortal(
    <div
      ref={ref}
      className="fixed w-[200px] rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)]
                 bg-[var(--app-color-surface-elevated)] shadow-lg py-1.5"
      style={{ left: x, top: y, zIndex: 200 }}
    >
      {menuItem('上方插入行', <Plus className="w-3.5 h-3.5" />, () => onInsertRow('above'))}
      {menuItem('下方插入行', <Plus className="w-3.5 h-3.5" />, () => onInsertRow('below'))}
      {menuItem('左侧插入列', <Plus className="w-3.5 h-3.5" />, () => onInsertCol('left'))}
      {menuItem('右侧插入列', <Plus className="w-3.5 h-3.5" />, () => onInsertCol('right'))}
      {divider}
      {canMerge && menuItem('合并选中', <Combine className="w-3.5 h-3.5" />, onMergeCells)}
      {canSplit && menuItem('拆分单元格', <Ungroup className="w-3.5 h-3.5" />, onSplitCell)}
      {divider}
      {menuItem('删除行', <Trash2 className="w-3.5 h-3.5" />, onDeleteRow, true)}
      {menuItem('删除列', <Trash2 className="w-3.5 h-3.5" />, onDeleteCol, true)}
    </div>
  , document.body);
}
