// components/EditorToolbar.tsx — 四段分组工具栏：字段 / 样式 / 结构 / 操作
import { useState, useEffect, useRef } from 'react';
import {
  Undo2, Redo2, Save, Combine, Ungroup, Palette, FileText, Send,
  ListTree, Columns2, PaintBucket, RefreshCw, Settings2, MoreHorizontal,
  LayoutGrid, Pin, Check,
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
  fieldOptions?: { label: string; value: string }[];
  fieldOptionCount?: number;
  fieldOptionSetId?: string;
  onFieldTypeChange: (t: FieldType) => void;
  onBindOptionPreset: (id: string) => void;
  onUnbindOptionPreset: () => void;
  onInlineFieldOptionsChange: (opts: { label: string; value: string }[]) => void;
  onOptionPresetUpdated?: () => void;
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
  /** 网格线开关（纯视图偏好，不进 JSON） */
  showGridLines: boolean;
  /** 首行吸顶最终生效值（stickyOverride ?? headerRow） */
  stickyFirstRow: boolean;
  /** 首行是否像列名（false 时「首行吸顶」置灰） */
  firstRowIsHeader: boolean;
  onToggleGridLines: () => void;
  onToggleStickyFirstRow: () => void;
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
      className="inline-flex shrink-0 items-center gap-0.5"
      title="撤销 / 重做"
    >
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="inline-flex items-center justify-center h-[34px] w-[34px] rounded-[var(--app-radius-element)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)] disabled:opacity-[0.35] disabled:pointer-events-none transition-colors"
        title="撤销"
        aria-label="撤销"
      >
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        className="inline-flex items-center justify-center h-[34px] w-[34px] rounded-[var(--app-radius-element)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)] disabled:opacity-[0.35] disabled:pointer-events-none transition-colors"
        title="重做"
        aria-label="重做"
      >
        <Redo2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ToolbarMenuItem({
  icon: Icon, label, onClick, disabled, active, title,
}: {
  icon: typeof Save;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** 当前是否开启：开启时右侧显示勾选标记 */
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title ?? label}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--app-color-text-secondary)]
                 hover:bg-[var(--app-color-surface-hover)] text-left disabled:opacity-40 disabled:pointer-events-none"
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label}
      {active && <Check className="w-3.5 h-3.5 shrink-0 ml-auto text-[var(--app-color-accent)]" />}
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
    fieldType, fieldTypeMixed,
    fieldOptions, fieldOptionCount, fieldOptionSetId,
    onFieldTypeChange,
    onBindOptionPreset, onUnbindOptionPreset, onInlineFieldOptionsChange, onOptionPresetUpdated,
    onOpenTheme, onOpenWordTemplate, onAutoFit,
    onRestoreWordImportWidths, isWordSource,
    formatBrushActive, onBrushPickup, onBrushApply,
    cellCount, selectedCount, hasSelection, formId, selectionKey,
    showGridLines, stickyFirstRow, firstRowIsHeader, onToggleGridLines, onToggleStickyFirstRow,
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

  const btnBase = 'inline-flex items-center gap-1.5 h-[34px] px-2.5 text-[13px] font-medium transition-colors rounded-[var(--app-radius-element)] shrink-0';
  const btnGhost = `${btnBase} text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)] disabled:opacity-[0.35] disabled:pointer-events-none`;
  const btnIcon = `${btnBase} justify-center px-0 w-[34px] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)] disabled:opacity-[0.35] disabled:pointer-events-none`;
  const btnPrimary = `${btnBase} bg-[var(--app-color-accent)] text-[var(--app-color-text-inverse)] shadow-[0_1px_2px_var(--app-color-accent)] hover:opacity-90 disabled:opacity-[0.35] disabled:pointer-events-none`;
  const btnAccentGhost = `${btnBase} text-[var(--app-color-accent)] hover:bg-[var(--app-color-accent-soft)] disabled:opacity-[0.35] disabled:pointer-events-none`;
  const inputDisabled = !hasSelection ? 'opacity-[0.35] pointer-events-none' : '';

  return (
    <div className="mx-6 mt-2 shrink-0 rounded-2xl bg-[var(--app-color-surface-container)] shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_-12px_rgba(0,0,0,.12)] z-[var(--z-sticky)]">
      <div className="flex items-center gap-2 px-3 py-1.5 min-h-[48px]">
        {/* 左栏：极窄视口下换行，1280px 单行 */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
          <span
            className={`text-[10px] font-medium shrink-0 px-1.5 py-0.5 rounded-[var(--app-radius-element)] min-w-[64px] text-center ${
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
            className={`rounded-[var(--app-radius-element)] bg-[var(--app-color-surface-hover)]
                       h-[34px] px-2 text-[13px] text-[var(--app-color-text-primary)] outline-none shrink-0 disabled:opacity-[0.35]`}
          >
            {!hasSelection && <option value="">未选中</option>}
            {fieldTypeMixed && <option value="">多种类型</option>}
            {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
          </select>

          <button
            type="button"
            disabled={!hasSelection || !isOptionFieldType}
            onClick={() => setShowOptionEditor(true)}
            className={`${btnGhost} shrink-0`}
          >
            <ListTree className="w-3.5 h-3.5" />
            选项{(fieldOptionCount ?? (fieldOptions || []).length) > 0
              ? `(${fieldOptionCount ?? fieldOptions!.length})`
              : ''}
          </button>

          <span className="w-px h-5 mx-1 shrink-0 bg-[color-mix(in_srgb,var(--app-color-text-primary)_8%,transparent)]" />

          <button type="button" disabled={!hasSelection}
            onClick={() => onStyleChange({ bold: !selectedStyle?.bold })}
            className={`w-[34px] h-[34px] rounded-[var(--app-radius-element)] flex items-center justify-center text-[13px] font-bold transition-colors shrink-0 disabled:opacity-[0.35] disabled:pointer-events-none ${selectedStyle?.bold ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]' : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]'}`}
            title="加粗">B</button>

          <select value={selectedStyle?.fontSize || 13} disabled={!hasSelection}
            onChange={e => onStyleChange({ fontSize: Number(e.target.value) })}
            className="rounded-[var(--app-radius-element)] bg-[var(--app-color-surface-hover)] h-[34px] px-1.5 text-[13px] outline-none shrink-0 disabled:opacity-[0.35]" title="字号">
            {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <span className={`inline-flex items-center rounded-[var(--app-radius-element)] bg-[var(--app-color-surface-hover)] p-0.5 shrink-0 ${inputDisabled}`}>
            {(['left', 'center', 'right'] as const).map(a => (
              <button key={a} type="button" disabled={!hasSelection}
                onClick={() => onStyleChange({ align: a })}
                className={`h-[30px] px-2.5 text-[13px] font-medium rounded-[var(--app-radius-element)] transition-colors disabled:pointer-events-none ${(selectedStyle?.align || 'left') === a ? 'bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] shadow-sm' : 'text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-text-primary)]'}`}
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
            className={`w-[34px] h-[34px] rounded-[var(--app-radius-element)] flex items-center justify-center transition-colors shrink-0 disabled:opacity-[0.35] disabled:pointer-events-none ${
              formatBrushActive
                ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]'
                : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]'
            }`}
            title={formatBrushActive ? '应用格式刷' : '吸取样式'}
          >
            <PaintBucket className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-5 mx-1 shrink-0 bg-[color-mix(in_srgb,var(--app-color-text-primary)_8%,transparent)]" />

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

        <span className="w-px h-5 mx-1 shrink-0 bg-[color-mix(in_srgb,var(--app-color-text-primary)_8%,transparent)]" />

        {/* 右栏：紧凑操作区 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <UndoRedoSplit onUndo={onUndo} onRedo={onRedo} canUndo={canUndo} canRedo={canRedo} />

          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className={btnPrimary}
            title={isSaving ? '保存中' : isDirty ? '有未保存修改' : '保存'}
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isSaving ? '保存中' : '保存'}</span>
            {isDirty && !isSaving && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white" aria-hidden="true" />
            )}
          </button>

          {isPublished ? (
            <button
              type="button"
              onClick={onRepublish}
              disabled={!onRepublish}
              className={btnAccentGhost}
              title="重新发布（沿用上次发布条件）"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">重发</span>
            </button>
          ) : (
            <button type="button" onClick={onPublish} className={btnAccentGhost} title="发布报表">
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
                className="absolute right-0 top-full mt-2 w-[176px] rounded-xl bg-[var(--app-color-surface-elevated)] shadow-[0_4px_6px_-2px_rgba(0,0,0,.08),0_12px_28px_-8px_rgba(0,0,0,.18)] py-1.5 overflow-hidden z-[var(--z-dropdown)]"
              >
                <ToolbarMenuItem icon={Palette} label="主题" onClick={() => { onOpenTheme(); setMoreOpen(false); }} />
                <ToolbarMenuItem icon={FileText} label="Word 模板" onClick={() => { onOpenWordTemplate(); setMoreOpen(false); }} />
                <ToolbarMenuItem
                  icon={LayoutGrid}
                  label="显示网格线"
                  active={showGridLines}
                  onClick={() => { onToggleGridLines(); setMoreOpen(false); }}
                />
                <ToolbarMenuItem
                  icon={Pin}
                  label="首行吸顶"
                  active={stickyFirstRow}
                  disabled={!firstRowIsHeader}
                  title={firstRowIsHeader ? '首行吸顶' : '首行不是列名'}
                  onClick={() => { onToggleStickyFirstRow(); setMoreOpen(false); }}
                />
                {isPublished && onResetPublishConditions && (
                  <ToolbarMenuItem
                    icon={Settings2}
                    label="重置发布条件"
                    onClick={() => { onResetPublishConditions(); setMoreOpen(false); }}
                  />
                )}
                <div className="my-1.5 h-px bg-[color-mix(in_srgb,var(--app-color-text-primary)_8%,transparent)]" />
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
