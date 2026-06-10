// FindReplaceDialog — Ctrl+F查找替换弹窗
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { SmartSheetRow, CellValue } from '@/features/smartsheet/types';

interface Match {
  rowId: string;
  colKey: string;
  value: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  rows: SmartSheetRow[];
  onReplace: (rowId: string, colKey: string, newVal: CellValue) => void;
}

function getCellDisplayValue(cv: unknown): string {
  if (cv === null || cv === undefined) return '';
  if (typeof cv === 'object' && cv !== null) {
    const cellVal = cv as CellValue;
    return cellVal.v ?? '';
  }
  return String(cv);
}

export default function FindReplaceDialog({ open, onClose, rows, onReplace }: Props) {
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [results, setResults] = useState<Match[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);

  // Compute matches when find text or rows change
  useEffect(() => {
    if (!find.trim()) {
      setResults([]);
      setActiveIdx(0);
      return;
    }
    const lowerFind = find.toLowerCase();
    const matches: Match[] = [];
    for (const row of rows) {
      if (!row.cellData) continue;
      for (const [colKey, cv] of Object.entries(row.cellData)) {
        const v = getCellDisplayValue(cv);
        if (v.toLowerCase().includes(lowerFind)) {
          matches.push({ rowId: row.id, colKey, value: v });
        }
      }
    }
    setResults(matches);
    setActiveIdx(matches.length > 0 ? 0 : 0);
  }, [find, rows]);

  // Focus find input when dialog opens
  useEffect(() => {
    if (open) {
      setFind('');
      setReplace('');
      setResults([]);
      setActiveIdx(0);
      // Small delay to ensure the element is rendered
      const t = setTimeout(() => findInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleFindKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Cycle to next match
      if (results.length > 0) {
        setActiveIdx((prev) => (prev + 1) % results.length);
      }
    }
  }, [results.length]);

  const handleReplace = useCallback(() => {
    if (results.length === 0) return;
    const match = results[activeIdx];
    if (!match) return;
    const newVal: CellValue = { v: replace };
    onReplace(match.rowId, match.colKey, newVal);
    // Results will be recomputed by the useEffect when rows update
  }, [results, activeIdx, replace, onReplace]);

  const handleReplaceAll = useCallback(() => {
    if (results.length === 0) return;
    const newVal: CellValue = { v: replace };
    for (const match of results) {
      onReplace(match.rowId, match.colKey, newVal);
    }
  }, [results, replace, onReplace]);

  if (!open) return null;

  const totalCells = rows.reduce((acc, r) => acc + Object.keys(r.cellData ?? {}).length, 0);

  return (
    <div className="fixed top-16 right-4 w-[320px] bg-app-surface-elevated border border-app-border rounded-[14px] shadow-lg z-[var(--z-modal)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-sm font-semibold text-app-text-primary">查找和替换</span>
        <button
          onClick={onClose}
          className="inline-flex items-center justify-center w-6 h-6 rounded-[6px] text-app-text-tertiary hover:bg-app-surface-hover hover:text-app-text-primary transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Find input */}
      <div className="px-4 pb-2">
        <div className="relative">
          <input
            ref={findInputRef}
            type="text"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={handleFindKeyDown}
            placeholder="查找..."
            className="w-full h-9 px-3 pr-16 text-sm rounded-[10px] border border-app-border bg-app-surface-container text-app-text-primary placeholder:text-app-text-tertiary outline-none focus:border-app-accent transition-colors"
          />
          {find.trim() && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-app-text-tertiary">
              {results.length}/{totalCells} 个匹配
            </span>
          )}
        </div>
      </div>

      {/* Replace input */}
      <div className="px-4 pb-3">
        <input
          type="text"
          value={replace}
          onChange={(e) => setReplace(e.target.value)}
          placeholder="替换为..."
          className="w-full h-9 px-3 text-sm rounded-[10px] border border-app-border bg-app-surface-container text-app-text-primary placeholder:text-app-text-tertiary outline-none focus:border-app-accent transition-colors"
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <button
          onClick={handleReplace}
          disabled={results.length === 0}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[10px] text-[12.5px] font-medium transition-all cursor-pointer border border-app-border bg-app-surface-container text-app-text-secondary hover:bg-app-surface-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          替换
        </button>
        <button
          onClick={handleReplaceAll}
          disabled={results.length === 0}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[10px] text-[12.5px] font-medium transition-all cursor-pointer bg-app-accent-secondary text-white border border-transparent hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          全部替换
        </button>
      </div>

      {/* Match preview */}
      {results.length > 0 && (
        <div className="border-t border-app-border px-4 py-2 max-h-[160px] overflow-y-auto">
          <div className="text-[11px] text-app-text-tertiary mb-1">
            匹配 {activeIdx + 1}/{results.length}
          </div>
          <div className="text-xs text-app-text-secondary leading-relaxed break-all">
            <span className="font-medium text-app-text-primary">
              {rows.find(r => r.id === results[activeIdx]?.rowId)?.rowLabel || results[activeIdx]?.rowId}
            </span>
            {' · '}
            <span>{results[activeIdx]?.colKey}</span>
            {' · '}
            <span className="text-app-text-primary font-mono text-[11px]">
              &ldquo;{results[activeIdx]?.value}&rdquo;
            </span>
          </div>
        </div>
      )}
    </div>
  );
}