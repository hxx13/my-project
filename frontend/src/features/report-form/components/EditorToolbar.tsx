// components/EditorToolbar.tsx — 左栏可横向滚动，右栏紧凑 + 更多菜单
import { useState, useEffect, useRef } from 'react';
import {
  Undo2, Redo2, Save, Combine, Ungroup, Palette, FileText, Send,
  ListTree, Columns2, PaintBucket, RefreshCw, Settings2, MoreHorizontal,
} from 'lucide-react';
import type { FieldType, CellStyle } from '../types';
import ColorPalette from './ColorPalette';
import OptionEditor from './OptionEditor';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'STATIC', label: '静态文本' },
  { value: 'TEXT', label: '文本' },
  { value: 'NUMBER', label: '数字' },
  { value: 'BOOLEAN', label: '勾选' },
  { value: 'SELECT', label: '单选下拉' },
  { value: 'MULTI_SELECT', label: '多选下拉' },
  { value: 'DATETIME', label: '日期时间' },
  { value: 'IMAGE', label: '图片' },
  { value: 'FILE', label: '文件' },
  { value: 'USER', label: '人员选择' },
  { value: 'AUTO_USER', label: '自动记录' },
];

const FONT_SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];

interface Props {
  onSave: () => void;
  onPublish: () => void;
  onRepublish?: () => void;
  onResetPublishConditions?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isSaving: boolean;
  isDirty: boolean;
  isPublished: boolean;
  onMergeCells: () => void;
  onUnmergeCells: () => void;
  canMerge: boolean;
  canUnmerge: boolean;
  selectedStyle?: CellStyle;
  onStyleChange: (p: Partial<CellStyle>) => void;
  fieldType?: FieldType;
  fieldTypeMixed?: boolean;
  fieldStaticText?: string;
  onFieldStaticTextChange?: (text: string) => void;
  fieldOptions?: { label: string; value: string }[];
  fieldOptionCount?: number;
  fieldOptionSetId?: string;
  fieldMaxLength?: number;
  fieldMin?: number;
  fieldMax?: number;
  onFieldTypeChange: (t: FieldType) => void;
  onBindOptionPreset: (id: string) => void;
  onUnbindOptionPreset: () => void;
  onInlineFieldOptionsChange: (opts: { label: string; value: string }[]) => void;
  onOptionPresetUpdated?: () => void;
  onFieldMaxLengthChange: (v: number | undefined) => void;
  onFieldMinChange: (v: number | undefined) => void;
  onFieldMaxChange: (v: number | undefined) => void;
  onOpenTheme: () => void;
  onOpenWordTemplate: () => void;
  onAutoFit: () => void;
  onRestoreWordImportWidths?: () => void;
  isWordSource?: boolean;
  formatBrushActive?: boolean;
  onBrushPickup: () => void;
  onBrushApply: () => void;
  cellCount: number;
  selectedCount: number;
  hasSelection: boolean;
  formId?: number;
  /** 选中格子 id 拼接，用于检测选区变化 */
  selectionKey?: string;
}

function UndoRedoSplit({
  onUndo, onRedo, canUndo, canRedo,
}: {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  return (
    <div
      className="inline-flex shrink-0 rounded-[6px] border border-[var(--app-color-border)] overflow-hidden"
      title="撤销 / 重做"
    >
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="px-2 py-1.5 text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]
                   disabled:opacity-30 disabled:pointer-events-none border-r border-[var(--app-color-border)]"
        title="撤销"
        aria-label="撤销"
      >
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        className="px-2 py-1.5 text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]
                   disabled:opacity-30 disabled:pointer-events-none"
        title="重做"
        aria-label="重做"
      >
        <Redo2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ToolbarMenuItem({
  icon: Icon, label, onClick, disabled,
}: {
  icon: typeof Save;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--app-color-text-secondary)]
                 hover:bg-[var(--app-color-surface-hover)] text-left disabled:opacity-40 disabled:pointer-events-none"
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label}
    </button>
  );
}

export default function EditorToolbar(props: Props) {
  const [showOptionEditor, setShowOptionEditor] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const {
    onSave, onPublish, onRepublish, onResetPublishConditions, onUndo, onRedo,
    canUndo, canRedo, isSaving, isDirty, isPublished,
    onMergeCells, onUnmergeCells, canMerge, canUnmerge,
    selectedStyle, onStyleChange,
    fieldType, fieldTypeMixed, fieldStaticText, onFieldStaticTextChange,
    fieldOptions, fieldOptionCount, fieldOptionSetId,
    fieldMaxLength, fieldMin, fieldMax,
    onFieldTypeChange,
    onBindOptionPreset, onUnbindOptionPreset, onInlineFieldOptionsChange, onOptionPresetUpdated,
    onFieldMaxLengthChange, onFieldMinChange, onFieldMaxChange,
    onOpenTheme, onOpenWordTemplate, onAutoFit,
    onRestoreWordImportWidths, isWordSource,
    formatBrushActive, onBrushPickup, onBrushApply,
    cellCount, selectedCount, hasSelection, formId, selectionKey,
  } = props;

  const isOptionFieldType = fieldType === 'SELECT' || fieldType === 'MULTI_SELECT';

  useEffect(() => {
    if (!isOptionFieldType) {
      setShowOptionEditor(false);
    }
  }, [isOptionFieldType]);

  useEffect(() => {
    if (!hasSelection || fieldTypeMixed || !isOptionFieldType) return;
    setShowOptionEditor(true);
  }, [selectionKey, hasSelection, fieldTypeMixed, isOptionFieldType]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreOpen]);

  const showOptions = fieldType === 'SELECT' || fieldType === 'MULTI_SELECT';
  const showNumberRange = fieldType === 'NUMBER';
  const showMaxLength = fieldType === 'TEXT';
  const showStaticText = fieldType === 'STATIC';

  const btnSm = 'px-2 py-1 rounded-[6px] text-[11px] font-medium transition-colors';
  const btnOut = `${btnSm} border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-30 disabled:pointer-events-none inline-flex items-center gap-1`;
  const btnIcon = `${btnSm} border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-30 disabled:pointer-events-none inline-flex items-center justify-center`;
  const btnOn = `${btnSm} bg-[var(--app-color-accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1`;
  const inputDisabled = !hasSelection ? 'opacity-40 pointer-events-none' : '';

  return (
    <div className="border-b border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] shrink-0 z-[var(--z-sticky)]">
      <div className="flex items-center gap-2 px-3 py-2 min-h-[44px]">
        {/* 左栏：不换行，横向滚动 */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto flex-nowrap [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--app-color-border)]">
          <span
            className={`text-[10px] font-medium shrink-0 px-1.5 py-0.5 rounded-[4px] min-w-[64px] text-center ${
              selectedCount > 1
                ? 'text-[var(--app-color-accent)] bg-[var(--app-color-accent-soft)]'
                : 'invisible'
            }`}
          >
            批量{selectedCount > 1 ? selectedCount : 0}
          </span>

          <select
            value={!hasSelection ? '' : fieldTypeMixed ? '' : (fieldType || 'TEXT')}
            disabled={!hasSelection}
            onChange={e => {
              const t = e.target.value as FieldType;
              if (!t) return;
              onFieldTypeChange(t);
              if (t === 'SELECT' || t === 'MULTI_SELECT') {
                setShowOptionEditor(true);
              }
            }}
            className={`rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)]
                       px-2 py-1 text-[11px] text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)] shrink-0 disabled:opacity-40`}
          >
            {!hasSelection && <option value="">未选中</option>}
            {fieldTypeMixed && <option value="">多种类型</option>}
            {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
          </select>

          <input
            type="text"
            value={hasSelection && showStaticText ? (fieldStaticText ?? '') : ''}
            disabled={!hasSelection || !showStaticText}
            onChange={e => onFieldStaticTextChange?.(e.target.value)}
            placeholder="静态文本"
            className={`w-[100px] max-w-[180px] rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)]
                       px-2 py-1 text-[11px] text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)] shrink-0
                       disabled:opacity-40 ${!showStaticText ? 'w-0 min-w-0 max-w-0 px-0 border-transparent opacity-0 pointer-events-none overflow-hidden' : ''}`}
          />

          <button
            type="button"
            disabled={!hasSelection || !showOptions}
            onClick={() => setShowOptionEditor(true)}
            className={`${btnOut} shrink-0 ${!showOptions ? 'hidden' : ''}`}
          >
            <ListTree className="w-3.5 h-3.5" />
            选项{(fieldOptionCount ?? (fieldOptions || []).length) > 0
              ? `(${fieldOptionCount ?? fieldOptions!.length})`
              : ''}
          </button>

          <span className={`flex items-center gap-1 shrink-0 ${!showNumberRange ? 'hidden' : ''}`}>
            <input type="number" step="any" value={fieldMin ?? ''} disabled={!hasSelection}
              onChange={e => { const v = e.target.value; onFieldMinChange(v === '' ? undefined : Number(v)); }}
              placeholder="最小" className="w-[56px] rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)] px-1.5 py-1 text-[11px] outline-none focus:border-[var(--app-color-accent)] disabled:opacity-40" />
            <span className="text-[10px] text-[var(--app-color-text-tertiary)]">~</span>
            <input type="number" step="any" value={fieldMax ?? ''} disabled={!hasSelection}
              onChange={e => { const v = e.target.value; onFieldMaxChange(v === '' ? undefined : Number(v)); }}
              placeholder="最大" className="w-[56px] rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)] px-1.5 py-1 text-[11px] outline-none focus:border-[var(--app-color-accent)] disabled:opacity-40" />
          </span>

          <span className={`flex items-center gap-1 shrink-0 ${!showMaxLength ? 'hidden' : ''}`}>
            <span className="text-[10px] text-[var(--app-color-text-tertiary)]">最长</span>
            <input type="number" value={fieldMaxLength ?? ''} disabled={!hasSelection}
              onChange={e => onFieldMaxLengthChange(e.target.value ? Number(e.target.value) : undefined)}
              placeholder="不限" className="w-[52px] rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)] px-1.5 py-1 text-[11px] outline-none focus:border-[var(--app-color-accent)] disabled:opacity-40" />
          </span>

          <span className="w-px h-5 bg-[var(--app-color-border)] shrink-0" />

          <button type="button" disabled={!hasSelection}
            onClick={() => onStyleChange({ bold: !selectedStyle?.bold })}
            className={`w-7 h-7 rounded-[4px] flex items-center justify-center text-[12px] font-bold transition-colors shrink-0 disabled:opacity-40 disabled:pointer-events-none ${selectedStyle?.bold ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]' : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'}`}
            title="加粗">B</button>

          <select value={selectedStyle?.fontSize || 13} disabled={!hasSelection}
            onChange={e => onStyleChange({ fontSize: Number(e.target.value) })}
            className="rounded-[4px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)] px-1 py-0.5 text-[11px] outline-none shrink-0 disabled:opacity-40" title="字号">
            {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <span className={`flex rounded-[4px] border border-[var(--app-color-border)] overflow-hidden shrink-0 ${inputDisabled}`}>
            {(['left', 'center', 'right'] as const).map(a => (
              <button key={a} type="button" disabled={!hasSelection}
                onClick={() => onStyleChange({ align: a })}
                className={`px-1.5 py-0.5 text-[10px] transition-colors disabled:pointer-events-none ${(selectedStyle?.align || 'left') === a ? 'bg-[var(--app-color-accent)] text-white' : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'}`}
                title={a === 'left' ? '左对齐' : a === 'center' ? '居中' : '右对齐'}>
                {a === 'left' ? '左' : a === 'center' ? '中' : '右'}
              </button>
            ))}
          </span>

          <div className={inputDisabled}>
            <ColorPalette mode="bg" value={selectedStyle?.bg} onChange={color => onStyleChange({ bg: color })} />
          </div>
          <div className={inputDisabled}>
            <ColorPalette mode="text" value={selectedStyle?.color} onChange={color => onStyleChange({ color })} />
          </div>

          <button type="button" disabled={!hasSelection}
            onClick={() => formatBrushActive ? onBrushApply() : onBrushPickup()}
            className={`w-7 h-7 rounded-[4px] flex items-center justify-center transition-colors shrink-0 disabled:opacity-40 disabled:pointer-events-none ${
              formatBrushActive
                ? 'bg-[var(--app-color-accent)] text-white ring-2 ring-[var(--app-color-accent)] ring-offset-1'
                : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'
            }`}
            title={formatBrushActive ? '应用格式刷' : '吸取样式'}
          >
            <PaintBucket className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-5 bg-[var(--app-color-border)] shrink-0" />

          <button type="button" onClick={onMergeCells} disabled={!canMerge} className={btnIcon} title="合并单元格">
            <Combine className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onUnmergeCells} disabled={!canUnmerge} className={btnIcon} title="拆分单元格">
            <Ungroup className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onAutoFit} className={btnIcon} title="自适应列宽与行高">
            <Columns2 className="w-3.5 h-3.5" />
          </button>
          {isWordSource && onRestoreWordImportWidths && (
            <button type="button" onClick={onRestoreWordImportWidths} className={btnIcon} title="恢复 Word 导入列宽">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 右栏：紧凑操作区 */}
        <div className="flex items-center gap-1.5 shrink-0 pl-1 border-l border-[var(--app-color-border)]">
          <UndoRedoSplit onUndo={onUndo} onRedo={onRedo} canUndo={canUndo} canRedo={canRedo} />

          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className={`${btnOn} ${isDirty ? 'bg-[var(--app-color-feedback-danger)]' : ''}`}
            title={isSaving ? '保存中' : isDirty ? '有未保存修改' : '保存'}
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isSaving ? '保存中' : isDirty ? '保存*' : '保存'}</span>
          </button>

          {isPublished ? (
            <button
              type="button"
              onClick={onRepublish}
              disabled={!onRepublish}
              className={btnOn}
              title="重新发布（沿用上次发布条件）"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">重发</span>
            </button>
          ) : (
            <button type="button" onClick={onPublish} className={btnOn} title="发布报表">
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">发布</span>
            </button>
          )}

          <div className="relative shrink-0" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen(v => !v)}
              className={btnIcon}
              title="更多操作"
              aria-expanded={moreOpen}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            {moreOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-[168px] rounded-[var(--app-radius-container)] border border-[var(--app-color-border)]
                           bg-[var(--app-color-surface-elevated)] shadow-lg py-1 z-[var(--z-dropdown)]"
              >
                <ToolbarMenuItem icon={Palette} label="主题" onClick={() => { onOpenTheme(); setMoreOpen(false); }} />
                <ToolbarMenuItem icon={FileText} label="Word 模板" onClick={() => { onOpenWordTemplate(); setMoreOpen(false); }} />
                {isPublished && onResetPublishConditions && (
                  <ToolbarMenuItem
                    icon={Settings2}
                    label="重置发布条件"
                    onClick={() => { onResetPublishConditions(); setMoreOpen(false); }}
                  />
                )}
                <div className="my-1 border-t border-[var(--app-color-border)]" />
                <div className="px-3 py-1 text-[10px] text-[var(--app-color-text-tertiary)]">
                  {cellCount} 格 · {selectedCount} 选
                  {isDirty && <span className="text-[var(--app-color-feedback-danger)] ml-0.5">*</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <OptionEditor
        open={showOptionEditor}
        onClose={() => setShowOptionEditor(false)}
        formId={formId}
        optionSetId={fieldOptionSetId}
        inlineOptions={fieldOptions || []}
        fieldType={fieldType}
        onBindPreset={onBindOptionPreset}
        onUnbindPreset={onUnbindOptionPreset}
        onInlineOptionsChange={onInlineFieldOptionsChange}
        onPresetUpdated={onOptionPresetUpdated}
      />
    </div>
  );
}
