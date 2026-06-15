// components/EditorToolbar.tsx — 左右分栏，无标签页
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Undo2, Redo2, Save, Combine, Ungroup, Palette, FileText, Send, ListTree, Columns2, PaintBucket } from 'lucide-react';
import type { FieldType, CellStyle, OptionSet } from '../types';
import { fetchOptionSets } from '../api/reportForm.api';
import ColorPalette from './ColorPalette';
import OptionEditor from './OptionEditor';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
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
  onSave: () => void; onPublish: () => void;
  onUndo: () => void; onRedo: () => void;
  canUndo: boolean; canRedo: boolean;
  isSaving: boolean; isDirty: boolean; isPublished: boolean;
  onMergeCells: () => void; onUnmergeCells: () => void;
  canMerge: boolean; canUnmerge: boolean;
  selectedStyle?: CellStyle; onStyleChange: (p: Partial<CellStyle>) => void;
  cellKind?: 'static' | 'field' | 'mixed'; fieldType?: FieldType;
  fieldTypeMixed?: boolean;
  fieldOptions?: { label: string; value: string }[]; fieldOptionSetId?: string;
  fieldMaxLength?: number; fieldMin?: number; fieldMax?: number;
  fieldProps?: Record<string, unknown>;
  onFieldPropsChange?: (props: Record<string, unknown>) => void;
  onSetCellKind: (kind: 'static' | 'field') => void;
  onFieldTypeChange: (t: FieldType) => void;
  onFieldOptionsChange: (opts: { label: string; value: string }[]) => void;
  onFieldOptionSetChange: (id: string | undefined, opts: { label: string; value: string }[]) => void;
  onFieldMaxLengthChange: (v: number | undefined) => void;
  onFieldMinChange: (v: number | undefined) => void;
  onFieldMaxChange: (v: number | undefined) => void;
  onOpenTheme: () => void; onOpenWordTemplate: () => void;
  onAutoFit: () => void;
  formatBrushActive?: boolean;
  onBrushPickup: () => void;
  onBrushApply: () => void;
  cellCount: number; selectedCount: number; hasSelection: boolean;
}

export default function EditorToolbar(props: Props) {
  const [showOptionEditor, setShowOptionEditor] = useState(false);

  const {
    onSave, onPublish, onUndo, onRedo,
    canUndo, canRedo, isSaving, isDirty, isPublished,
    onMergeCells, onUnmergeCells, canMerge, canUnmerge,
    selectedStyle, onStyleChange,
    cellKind, fieldType, fieldTypeMixed, fieldOptions, fieldOptionSetId,
    fieldMaxLength, fieldMin, fieldMax,
    onSetCellKind, onFieldTypeChange,
    onFieldOptionsChange, onFieldOptionSetChange,
    onFieldMaxLengthChange, onFieldMinChange, onFieldMaxChange,
    onOpenTheme, onOpenWordTemplate, onAutoFit,
    formatBrushActive, onBrushPickup, onBrushApply,
    cellCount, selectedCount, hasSelection,
  } = props;

  const { data: optionSets = [] } = useQuery<OptionSet[]>({
    queryKey: ['report-form-option-sets'],
    queryFn: fetchOptionSets, staleTime: 30000,
  });

  const showOptions = fieldType === 'SELECT' || fieldType === 'MULTI_SELECT';
  const showNumberRange = fieldType === 'NUMBER';
  const showMaxLength = fieldType === 'TEXT';

  const btnSm = 'px-2.5 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors';
  const btnOut = `${btnSm} border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-30 flex items-center gap-1.5`;
  const btnOn = `${btnSm} bg-[var(--app-color-accent)] text-white hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5`;

  const handleSelectOptionSet = (id: string) => {
    if (!id) { onFieldOptionSetChange(undefined, fieldOptions || []); return; }
    const set = optionSets.find(s => String(s.id) === id);
    if (set && set.itemsJson) {
      const items = Array.isArray(set.itemsJson) ? set.itemsJson : [];
      onFieldOptionSetChange(id, items.map((item: { label: string }) => ({ label: item.label, value: item.label })));
    }
  };

  return (
    <div className="border-b border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] shrink-0">
      <div className="flex items-center px-4 py-2.5 gap-2.5">
        {/* ═══ 左栏：格子编辑工具 ═══ */}
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          {hasSelection ? (
            <>
              {selectedCount > 1 && (
                <span className="text-[11px] font-medium text-[var(--app-color-accent)] shrink-0 px-2 py-0.5 rounded-[4px] bg-[var(--app-color-accent-soft)]">
                  批量 {selectedCount} 格
                </span>
              )}

              {/* 格子类型 */}
              <div className="flex rounded-[6px] border border-[var(--app-color-border)] overflow-hidden shrink-0">
                <button onClick={() => onSetCellKind('static')}
                  className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${cellKind === 'static' ? 'bg-[var(--app-color-accent)] text-white' : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'}`}
                >静态文本</button>
                <button onClick={() => onSetCellKind('field')}
                  className={`px-3 py-1.5 text-[12px] font-medium transition-colors border-l border-[var(--app-color-border)] ${cellKind === 'field' ? 'bg-[var(--app-color-accent)] text-white' : cellKind === 'mixed' ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]' : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'}`}
                >填报字段</button>
              </div>

              {(cellKind === 'field' || cellKind === 'mixed') && (
                <>
                  {/* 字段类型 */}
                  <select
                    value={fieldTypeMixed ? '' : (fieldType || 'TEXT')}
                    onChange={e => {
                      if (e.target.value) onFieldTypeChange(e.target.value as FieldType);
                    }}
                    className="rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)]
                               px-2.5 py-1.5 text-[12px] text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)] shrink-0">
                    {fieldTypeMixed && <option value="">多种类型</option>}
                    {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                  </select>

                  {/* 选项编辑 */}
                  {showOptions && (
                    <>
                      <button onClick={() => setShowOptionEditor(true)}
                        className={`${btnOut} shrink-0`}>
                        <ListTree className="w-3.5 h-3.5" />
                        编辑选项 {(fieldOptions || []).length > 0 && `(${(fieldOptions || []).length})`}
                      </button>
                      <select value={fieldOptionSetId || ''} onChange={e => handleSelectOptionSet(e.target.value)}
                        className="rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)]
                                   px-2 py-1.5 text-[11px] text-[var(--app-color-text-tertiary)] outline-none
                                   focus:border-[var(--app-color-accent)] max-w-[140px] shrink-0">
                        <option value="">选项集模板</option>
                        {optionSets.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                      </select>
                    </>
                  )}

                  {/* 数值范围 */}
                  {showNumberRange && (
                    <span className="flex items-center gap-1 shrink-0">
                      <input type="number" step="any" value={fieldMin ?? ''}
                        onChange={e => { const v = e.target.value; onFieldMinChange(v === '' ? undefined : Number(v)); }}
                        placeholder="最小" className="w-[70px] rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)] px-2 py-1.5 text-[12px] outline-none focus:border-[var(--app-color-accent)]" />
                      <span className="text-[11px] text-[var(--app-color-text-tertiary)]">~</span>
                      <input type="number" step="any" value={fieldMax ?? ''}
                        onChange={e => { const v = e.target.value; onFieldMaxChange(v === '' ? undefined : Number(v)); }}
                        placeholder="最大" className="w-[70px] rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)] px-2 py-1.5 text-[12px] outline-none focus:border-[var(--app-color-accent)]" />
                    </span>
                  )}

                  {/* 最大长度 */}
                  {showMaxLength && (
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="text-[11px] text-[var(--app-color-text-tertiary)]">最长</span>
                      <input type="number" value={fieldMaxLength ?? ''} onChange={e => onFieldMaxLengthChange(e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="不限" className="w-[60px] rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)] px-2 py-1.5 text-[12px] outline-none focus:border-[var(--app-color-accent)]" />
                    </span>
                  )}
                </>
              )}

              <span className="w-px h-6 bg-[var(--app-color-border)] shrink-0" />

              {/* 样式工具 */}
              <button onClick={() => onStyleChange({ bold: !selectedStyle?.bold })}
                className={`w-8 h-8 rounded-[4px] flex items-center justify-center text-[13px] font-bold transition-colors shrink-0 ${selectedStyle?.bold ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]' : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'}`}
                title="加粗">B</button>

              <select value={selectedStyle?.fontSize || 13} onChange={e => onStyleChange({ fontSize: Number(e.target.value) })}
                className="rounded-[4px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)] px-1.5 py-1 text-[12px] outline-none shrink-0" title="字号">
                {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <span className="flex rounded-[4px] border border-[var(--app-color-border)] overflow-hidden shrink-0">
                {(['left', 'center', 'right'] as const).map(a => (
                  <button key={a} onClick={() => onStyleChange({ align: a })}
                    className={`px-2 py-1 text-[12px] transition-colors ${(selectedStyle?.align || 'left') === a ? 'bg-[var(--app-color-accent)] text-white' : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'}`}
                    title={a === 'left' ? '左对齐' : a === 'center' ? '居中' : '右对齐'}>
                    {a === 'left' ? '≡左' : a === 'center' ? '≡中' : '≡右'}
                  </button>
                ))}
              </span>

              <ColorPalette mode="bg" value={selectedStyle?.bg} onChange={color => onStyleChange({ bg: color })} />
              <ColorPalette mode="text" value={selectedStyle?.color} onChange={color => onStyleChange({ color })} />

              {/* 格式刷 */}
              <button
                onClick={() => formatBrushActive ? onBrushApply() : onBrushPickup()}
                className={`w-8 h-8 rounded-[4px] flex items-center justify-center transition-colors ${
                  formatBrushActive
                    ? 'bg-[var(--app-color-accent)] text-white ring-2 ring-[var(--app-color-accent)] ring-offset-1'
                    : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'
                }`}
                title={
                  formatBrushActive
                    ? selectedCount > 1
                      ? '应用到全部选中格，或点击表格逐格涂刷'
                      : '点击目标格子应用样式，或再次点击应用到选中格'
                    : '吸取选中格样式（多选时取第一个）'
                }
              >
                <PaintBucket className="w-3.5 h-3.5" />
              </button>

              <span className="w-px h-6 bg-[var(--app-color-border)] shrink-0" />

              {/* 合并/拆分 */}
              <button onClick={onMergeCells} disabled={!canMerge} className={btnOut} title="至少选中 2 个格子以合并">
                <Combine className="w-3.5 h-3.5" /> 合并
              </button>
              <button onClick={onUnmergeCells} disabled={!canUnmerge} className={btnOut} title="拆分选中合并格">
                <Ungroup className="w-3.5 h-3.5" /> 拆分
              </button>
            </>
          ) : (
            <span className="text-[12px] text-[var(--app-color-text-tertiary)]">
              点击表格中的格子开始编辑
            </span>
          )}
          {/* 自适应列宽 — 始终可见 */}
          <button onClick={onAutoFit} className={btnOut} title="根据内容自动调整所有列宽">
            <Columns2 className="w-3.5 h-3.5" /> 自适应
          </button>
        </div>

        {/* ═══ 右栏：文件操作 ═══ */}
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onUndo} disabled={!canUndo} className={btnOut}>
            <Undo2 className="w-3.5 h-3.5" /> 撤销
          </button>
          <button onClick={onRedo} disabled={!canRedo} className={btnOut}>
            <Redo2 className="w-3.5 h-3.5" /> 重做
          </button>
          <button onClick={onSave} disabled={isSaving}
            className={`${btnOn} ${isDirty ? 'bg-[var(--app-color-feedback-danger)]' : ''}`}>
            <Save className="w-3.5 h-3.5" />
            {isSaving ? '保存中...' : isDirty ? '保存*' : '保存'}
          </button>
          <button onClick={onOpenTheme} className={btnOut}>
            <Palette className="w-3.5 h-3.5" /> 主题
          </button>
          <button onClick={onOpenWordTemplate} className={btnOut}>
            <FileText className="w-3.5 h-3.5" /> 模板
          </button>
          <button onClick={onPublish} className={btnOn}>
            <Send className="w-3.5 h-3.5" />
            {isPublished ? '重新发布' : '发布'}
          </button>
          <span className="text-[11px] text-[var(--app-color-text-tertiary)] whitespace-nowrap">
            {cellCount}格·{selectedCount}选
            {isDirty && <span className="text-[var(--app-color-feedback-danger)] ml-0.5">*</span>}
          </span>
        </div>
      </div>

      {/* 选项编辑弹窗 */}
      <OptionEditor
        open={showOptionEditor} onClose={() => setShowOptionEditor(false)}
        options={fieldOptions || []} optionSetId={fieldOptionSetId}
        onChange={onFieldOptionsChange} onOptionSetChange={onFieldOptionSetChange}
      />
    </div>
  );
}
