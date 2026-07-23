// hooks/useFormGridEditor.ts
import { useState, useCallback, useRef } from 'react';
import type { LayoutJson, GridCell, CellStyle, CellKind, FieldType, FieldDefinition } from '../types';

function applyKindToCells(prev: LayoutJson, cellIds: Set<string>, kind: CellKind): LayoutJson {
  let fields = { ...prev.fields };
  const cells = prev.cells.map(c => {
    if (!cellIds.has(c.id) || c.kind === kind) return c;
    if (kind === 'field') {
      const fieldKey = c.fieldKey || `f_${c.id}`;
      if (!fields[fieldKey]) {
        fields[fieldKey] = { type: 'TEXT', label: '', editableInFill: true };
      }
      return {
        ...c,
        kind: 'field' as const,
        fieldKey,
        staticText: undefined,
      };
    }
    return {
      ...c,
      kind: 'static' as const,
      staticText: c.staticText || '',
      fieldKey: undefined,
    };
  });
  return { ...prev, cells, fields };
}

export function useFormGridEditor(initialLayout: LayoutJson) {
  const [layout, setLayout] = useState<LayoutJson>(initialLayout);
  const [selectedCellIds, setSelectedCellIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const undoStack = useRef<LayoutJson[]>([]);
  const redoStack = useRef<LayoutJson[]>([]);

  // 格式刷
  const [formatBrush, setFormatBrush] = useState<CellStyle | null>(null);
  const [formatBrushActive, setFormatBrushActive] = useState(false);

  const pushUndo = useCallback(() => {
    undoStack.current.push(structuredClone(layout));
    redoStack.current = [];
  }, [layout]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (prev) {
      redoStack.current.push(structuredClone(layout));
      setLayout(prev);
    }
  }, [layout]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (next) {
      undoStack.current.push(structuredClone(layout));
      setLayout(next);
    }
  }, [layout]);

  const selectCell = useCallback((cellId: string, multi: boolean) => {
    setSelectedCellIds(prev => {
      if (multi) {
        const next = new Set(prev);
        if (next.has(cellId)) next.delete(cellId);
        else next.add(cellId);
        return next;
      } else {
        if (prev.size === 1 && prev.has(cellId)) {
          return new Set();
        }
        return new Set([cellId]);
      }
    });
  }, []);

  /** 点击预览控件：选中该格，不触发「再点同一格取消选中」 */
  const selectCellForPreview = useCallback((cellId: string, multi: boolean) => {
    setSelectedCellIds(prev => {
      if (multi) {
        const next = new Set(prev);
        if (next.has(cellId)) next.delete(cellId);
        else next.add(cellId);
        return next;
      }
      return new Set([cellId]);
    });
  }, []);

  /** 拖选：只加不删，避免经过已选格子时 toggle 掉 */
  const selectCellDragAdd = useCallback((cellId: string) => {
    setSelectedCellIds(prev => {
      if (prev.has(cellId)) return prev; // 已选中，不动
      return new Set([...prev, cellId]);
    });
  }, []);

  const selectRange = useCallback((cellIds: string[]) => {
    setSelectedCellIds(new Set(cellIds));
  }, []);

  const replaceLayout = useCallback((newLayout: LayoutJson) => {
    pushUndo();
    setLayout(newLayout);
    setSelectedCellIds(new Set());
  }, [pushUndo]);

  const updateCell = useCallback((cellId: string, patch: Partial<GridCell>) => {
    pushUndo();
    setLayout(prev => ({
      ...prev,
      cells: prev.cells.map(c => c.id === cellId ? { ...c, ...patch } : c),
    }));
  }, [pushUndo]);

  const updateCellStyle = useCallback((cellId: string, stylePatch: Partial<CellStyle>) => {
    pushUndo();
    setLayout(prev => ({
      ...prev,
      cells: prev.cells.map(c =>
        c.id === cellId ? { ...c, style: { ...c.style, ...stylePatch } } : c
      ),
    }));
  }, [pushUndo]);

  /** 批量更新样式（多选格子） */
  const updateCellsStyle = useCallback((cellIds: Set<string>, stylePatch: Partial<CellStyle>) => {
    if (cellIds.size === 0) return;
    pushUndo();
    setLayout(prev => ({
      ...prev,
      cells: prev.cells.map(c =>
        cellIds.has(c.id) ? { ...c, style: { ...c.style, ...stylePatch } } : c
      ),
    }));
  }, [pushUndo]);

  const setCellKind = useCallback((cellId: string, kind: CellKind) => {
    pushUndo();
    setLayout(prev => applyKindToCells(prev, new Set([cellId]), kind));
  }, [pushUndo]);

  /** 批量设置格子类型 */
  const batchSetCellKind = useCallback((cellIds: Set<string>, kind: CellKind) => {
    if (cellIds.size === 0) return;
    pushUndo();
    setLayout(prev => applyKindToCells(prev, cellIds, kind));
  }, [pushUndo]);

  const toggleCellKind = useCallback((cellId: string) => {
    pushUndo();
    setLayout(prev => {
      const cell = prev.cells.find(c => c.id === cellId);
      if (!cell) return prev;
      const nextKind: CellKind = cell.kind === 'static' ? 'field' : 'static';
      return applyKindToCells(prev, new Set([cellId]), nextKind);
    });
  }, [pushUndo]);

  /** 批量设置填报字段类型（静态格会先转为 STATIC 填报字段） */
  const batchUpdateFieldType = useCallback((cellIds: Set<string>, type: FieldType) => {
    if (cellIds.size === 0) return;
    pushUndo();
    setLayout(prev => {
      let fields = { ...prev.fields };
      const cells = prev.cells.map(c => {
        if (!cellIds.has(c.id)) return c;
        let fieldKey = c.fieldKey || `f_${c.id}`;
        const fromStaticText = c.kind === 'static' ? (c.staticText || '') : '';

        if (c.kind === 'static' || type === 'STATIC') {
          const label = type === 'STATIC'
            ? (fromStaticText || fields[fieldKey]?.label || '')
            : (fields[fieldKey]?.label || fromStaticText || '');
          fields[fieldKey] = {
            ...(fields[fieldKey] || { label: '', editableInFill: true }),
            type,
            label,
            editableInFill: type !== 'STATIC',
            required: type === 'STATIC' ? false : fields[fieldKey]?.required,
          };
          return { ...c, kind: 'field' as const, fieldKey, staticText: undefined };
        }
        if (c.fieldKey) {
          fieldKey = c.fieldKey;
          fields[fieldKey] = { ...fields[fieldKey], type };
        }
        return c;
      });
      return { ...prev, cells, fields };
    });
  }, [pushUndo]);

  /** 批量更新字段定义（选项、数值范围等） */
  const batchUpdateFieldDefinition = useCallback((cellIds: Set<string>, patch: Partial<FieldDefinition>) => {
    if (cellIds.size === 0) return;
    pushUndo();
    setLayout(prev => {
      const fields = { ...prev.fields };
      for (const c of prev.cells) {
        if (!cellIds.has(c.id) || c.kind !== 'field' || !c.fieldKey) continue;
        fields[c.fieldKey] = { ...fields[c.fieldKey], ...patch };
      }
      return { ...prev, fields };
    });
  }, [pushUndo]);

  const updateFieldDefinition = useCallback((fieldKey: string, patch: Record<string, unknown>) => {
    pushUndo();
    setLayout(prev => ({
      ...prev,
      fields: {
        ...prev.fields,
        [fieldKey]: { ...prev.fields[fieldKey], ...patch },
      },
    }));
  }, [pushUndo]);

  /** 合并选中的格子：取包围盒，用第一个格子的 row/col 作为锚点，span 覆盖整个包围盒 */
  const mergeCells = useCallback(() => {
    if (selectedCellIds.size < 2) return;
    pushUndo();
    setLayout(prev => {
      const selectedCells = prev.cells.filter(c => selectedCellIds.has(c.id));
      if (selectedCells.length < 2) return prev;

      // 计算包围盒（考虑已有 span）
      let minRow = Infinity, maxRowEnd = -1, minCol = Infinity, maxColEnd = -1;
      for (const c of selectedCells) {
        minRow = Math.min(minRow, c.row);
        maxRowEnd = Math.max(maxRowEnd, c.row + c.rowSpan);
        minCol = Math.min(minCol, c.col);
        maxColEnd = Math.max(maxColEnd, c.col + c.colSpan);
      }

      const anchorRow = minRow;
      const anchorCol = minCol;
      const newRowSpan = maxRowEnd - minRow;
      const newColSpan = maxColEnd - minCol;

      // 找到包围盒内所有的格子（不仅仅是选中的，包括被覆盖的）
      const cellsInside = prev.cells.filter(c =>
        c.row >= anchorRow && c.row < anchorRow + newRowSpan &&
        c.col >= anchorCol && c.col < anchorCol + newColSpan
      );

      // 取第一个选中格作为合并后格子的属性来源
      const anchor = selectedCells[0];

      // 创建合并后格子（不带 fieldKey，默认为 static）
      const mergedId = 'c' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const mergedCell = {
        id: mergedId,
        row: anchorRow,
        col: anchorCol,
        colSpan: newColSpan,
        rowSpan: newRowSpan,
        kind: 'static' as const,
        staticText: anchor.kind === 'static' ? anchor.staticText || '' : '',
        style: { ...anchor.style },
      };

      // 移除包围盒内所有格子，加入合并后格子
      const cellIdsInside = new Set(cellsInside.map(c => c.id));
      const remainingCells = prev.cells.filter(c => !cellIdsInside.has(c.id));

      // 记录合并组信息
      const newMergeGroup = { cellIds: [mergedId] };
      const mergeGroups = [...(prev.mergeGroups || []), newMergeGroup];

      return {
        ...prev,
        cells: [...remainingCells, mergedCell],
        mergeGroups,
      };
    });
    setSelectedCellIds(new Set());
  }, [selectedCellIds, pushUndo]);

  /** 取消合并：将选中的合并格拆分为 1x1 格子 */
  /** 格式刷：从选中格子吸取样式 */
  const brushPickup = useCallback((style: CellStyle) => {
    setFormatBrush(style);
    setFormatBrushActive(true);
  }, []);

  /** 格式刷：将已吸取的样式应用到格子；keepActive 为 true 时可连续涂刷 */
  const brushApply = useCallback((cellId: string, keepActive = true) => {
    if (!formatBrush) return;
    pushUndo();
    setLayout(prev => ({
      ...prev,
      cells: prev.cells.map(c =>
        c.id === cellId ? { ...c, style: { ...c.style, ...formatBrush } } : c
      ),
    }));
    if (!keepActive) {
      setFormatBrushActive(false);
      setFormatBrush(null);
    }
  }, [formatBrush, pushUndo]);

  /** 格式刷：应用到多个格子 */
  const brushApplyToSelection = useCallback((cellIds: Set<string>, keepActive = false) => {
    if (!formatBrush || cellIds.size === 0) return;
    pushUndo();
    setLayout(prev => ({
      ...prev,
      cells: prev.cells.map(c =>
        cellIds.has(c.id) ? { ...c, style: { ...c.style, ...formatBrush } } : c
      ),
    }));
    if (!keepActive) {
      setFormatBrushActive(false);
      setFormatBrush(null);
    }
  }, [formatBrush, pushUndo]);

  const cancelFormatBrush = useCallback(() => {
    setFormatBrushActive(false);
    setFormatBrush(null);
  }, []);

  const unmergeCells = useCallback(() => {
    if (selectedCellIds.size === 0) return;
    pushUndo();
    setLayout(prev => {
      const toSplit = prev.cells.filter(c => selectedCellIds.has(c.id) && (c.rowSpan > 1 || c.colSpan > 1));
      if (toSplit.length === 0) return prev;

      const splitIds = new Set(toSplit.map(c => c.id));
      const remaining = prev.cells.filter(c => !splitIds.has(c.id));

      const newCells = [...remaining];
      const removedMergeGroupIds = new Set<string>();

      for (const cell of toSplit) {
        // 为每个位置创建独立格子
        for (let r = cell.row; r < cell.row + cell.rowSpan; r++) {
          for (let co = cell.col; co < cell.col + cell.colSpan; co++) {
            const newId = 'c' + Date.now() + '_' + r + '_' + co + '_' + Math.random().toString(36).slice(2, 4);
            newCells.push({
              id: newId,
              row: r,
              col: co,
              colSpan: 1,
              rowSpan: 1,
              kind: cell.kind,
              staticText: (r === cell.row && co === cell.col) ? (cell.staticText || '') : '',
              fieldKey: (r === cell.row && co === cell.col) ? cell.fieldKey : undefined,
              style: { ...cell.style },
            });
          }
        }
        removedMergeGroupIds.add(cell.id);
      }

      // 清理相关的 mergeGroups
      const cleanedMergeGroups = (prev.mergeGroups || []).filter(
        mg => !mg.cellIds.some(id => removedMergeGroupIds.has(id))
      );

      return {
        ...prev,
        cells: newCells,
        mergeGroups: cleanedMergeGroups,
      };
    });
    setSelectedCellIds(new Set());
  }, [selectedCellIds, pushUndo]);

  return {
    layout, setLayout: replaceLayout,
    selectedCellIds, selectCell, selectCellForPreview, selectCellDragAdd, selectRange, isDragging, setIsDragging,
    updateCell, updateCellStyle, updateCellsStyle, setCellKind, batchSetCellKind,
    toggleCellKind, updateFieldDefinition, batchUpdateFieldType, batchUpdateFieldDefinition,
    mergeCells, unmergeCells,
    formatBrush, formatBrushActive, brushPickup, brushApply, brushApplyToSelection, cancelFormatBrush,
    undo, redo, undoStack, redoStack,
  };
}
