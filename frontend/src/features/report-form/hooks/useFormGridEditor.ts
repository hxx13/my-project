// hooks/useFormGridEditor.ts
import { useState, useCallback, useRef } from 'react';
import type { LayoutJson, GridCell, CellStyle } from '../types';

export function useFormGridEditor(initialLayout: LayoutJson) {
  const [layout, setLayout] = useState<LayoutJson>(initialLayout);
  const [selectedCellIds, setSelectedCellIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const undoStack = useRef<LayoutJson[]>([]);
  const redoStack = useRef<LayoutJson[]>([]);

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
      const next = new Set(multi ? prev : []);
      if (prev.has(cellId) && multi) next.delete(cellId);
      else next.add(cellId);
      return next;
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

  const toggleCellKind = useCallback((cellId: string) => {
    pushUndo();
    setLayout(prev => ({
      ...prev,
      cells: prev.cells.map(c => {
        if (c.id !== cellId) return c;
        const newKind = c.kind === 'static' ? 'field' : 'static';
        return {
          ...c,
          kind: newKind,
          staticText: newKind === 'static' ? (c.staticText || '') : undefined,
          fieldKey: newKind === 'field' ? (c.fieldKey || `f_${cellId}`) : undefined,
        };
      }),
    }));
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

  return {
    layout, setLayout: replaceLayout,
    selectedCellIds, selectCell, selectRange, isDragging, setIsDragging,
    updateCell, updateCellStyle, toggleCellKind, updateFieldDefinition,
    undo, redo, undoStack, redoStack,
  };
}
