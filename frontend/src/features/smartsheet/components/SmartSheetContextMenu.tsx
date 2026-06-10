// SmartSheetContextMenu — row-only context menu (insert/duplicate/move/delete)
import { Plus, Copy, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';

interface Props {
  x: number;
  y: number;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function SmartSheetContextMenu({
  x, y,
  onInsertAbove, onInsertBelow,
  onDuplicate, onMoveUp, onMoveDown,
  onDelete, onClose,
}: Props) {
  return (
    <div
      className="fixed z-[var(--z-dropdown)] rounded-[12px] border border-app-border bg-app-surface-elevated shadow-lg py-1.5 min-w-[160px]"
      style={{
        left: Math.min(x, window.innerWidth - 170),
        top: Math.min(y, window.innerHeight - 260),
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <ContextItem icon={Plus} label="上方插入行" onClick={() => { onInsertAbove(); onClose(); }} />
      <ContextItem icon={Plus} label="下方插入行" onClick={() => { onInsertBelow(); onClose(); }} />
      <ContextItem icon={Copy} label="复制行" onClick={() => { onDuplicate(); onClose(); }} />
      <ContextItem icon={ArrowUp} label="上移" onClick={() => { onMoveUp(); onClose(); }} />
      <ContextItem icon={ArrowDown} label="下移" onClick={() => { onMoveDown(); onClose(); }} />
      <div className="h-px bg-app-border my-1" />
      <ContextItem icon={Trash2} label="删除行" danger onClick={() => { onDelete(); onClose(); }} />
    </div>
  );
}

function ContextItem({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors text-left
        ${danger ? 'text-app-feedback-danger hover:bg-app-feedback-danger-soft' : 'text-app-text-secondary hover:bg-app-surface-hover'}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" /> {label}
    </button>
  );
}