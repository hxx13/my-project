// ImportDialog.tsx — 3-step CSV import flow: Upload → Map → Import
import React, { useState, useRef } from 'react';
import { batchRows } from '@/api/domains/smartsheet.api';
import type { ColumnConfig } from '@/features/smartsheet/types';
import toast from 'react-hot-toast';

interface Props {
  sheetId: string;
  columns: ColumnConfig[];
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export default function ImportDialog({
  sheetId, columns, open, onClose, onImported,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [step, setStep] = useState<'upload' | 'map' | 'importing'>('upload');
  const [importProgress, setImportProgress] = useState(0);

  const reset = () => {
    setPreview([]);
    setMapping({});
    setStep('upload');
    setImportProgress(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check extension
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      toast.error('仅支持 .csv / .xlsx / .xls 文件');
      return;
    }

    // For .xlsx/.xls, show a hint (only CSV parsing is implemented client-side)
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      toast('Excel 文件请先另存为 CSV 再导入，或使用 JSON 备份导入', { duration: 4000 });
      return;
    }

    try {
      const text = await file.text();
      const rawLines = text.split('\n').filter((l) => l.trim().length > 0);
      if (rawLines.length === 0) {
        toast.error('文件为空');
        return;
      }

      const allRows = rawLines.map(parseCSVLine);
      const previewRows = allRows.slice(0, 6); // header + up to 5 data rows
      setPreview(previewRows);

      // Auto-map: match file header names to column labels
      const header = allRows[0] || [];
      const map: Record<number, string> = {};
      header.forEach((h, i) => {
        const match = columns.find((c) => c.label === h);
        if (match) map[i] = match.key;
      });
      setMapping(map);
      setStep('map');
    } catch (err) {
      toast.error('文件读取失败');
    }
  };

  const handleImport = async () => {
    setStep('importing');
    setImportProgress(0);
    try {
      const file = fileRef.current?.files?.[0];
      if (!file) {
        handleClose();
        return;
      }

      const text = await file.text();
      const rawLines = text.split('\n').filter((l) => l.trim().length > 0);
      const allRows = rawLines.map(parseCSVLine);

      // Skip header, build data rows according to mapping
      const dataRows = allRows.slice(1).map((vals) => {
        const cellData: Record<string, string> = {};
        Object.entries(mapping).forEach(([srcIdx, colKey]) => {
          const idx = Number(srcIdx);
          if (colKey && vals[idx] !== undefined) {
            cellData[colKey] = vals[idx];
          }
        });
        return { rowLabel: vals[0]?.substring(0, 100) || '', cellData };
      });

      // Simulate progress for better UX
      const chunkSize = Math.max(1, Math.floor(dataRows.length / 5));
      for (let i = 0; i < dataRows.length; i += chunkSize) {
        const chunk = dataRows.slice(i, i + chunkSize);
        await batchRows(sheetId, chunk);
        setImportProgress(Math.min(100, Math.round(((i + chunkSize) / dataRows.length) * 100)));
      }

      toast.success(`导入 ${dataRows.length} 行`);
      onImported();
      reset();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || '导入失败');
      setStep('map');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50">
      <div className="bg-app-surface-elevated border border-app-border rounded-[14px] shadow-lg w-[640px] max-h-[80vh] overflow-y-auto p-6">
        <h3 className="text-sm font-semibold mb-4 text-app-text-primary">
          {step === 'upload' && '导入文件'}
          {step === 'map' && '确认列映射'}
          {step === 'importing' && '正在导入...'}
        </h3>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <p className="text-xs text-app-text-secondary">选择 .csv 文件导入数据（.xlsx/.xls 请先另存为 CSV）</p>
            <label className="block w-full border-2 border-dashed border-app-border rounded-[10px] p-8 text-center cursor-pointer hover:border-app-accent transition-colors">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFile}
                className="hidden"
              />
              <span className="text-sm text-app-text-tertiary">选择文件...</span>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={handleClose} className="px-3 py-1.5 text-sm border border-app-border rounded-app-element text-app-text-secondary hover:bg-app-surface-container">
                取消
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Map columns */}
        {step === 'map' && (
          <div className="space-y-4">
            <p className="text-xs text-app-text-secondary">
              预览前 {Math.max(0, preview.length - 1)} 行数据，为每个文件列指定映射目标
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-app-border">
                    <th className="text-left py-1.5 pr-2 text-app-text-secondary font-medium whitespace-nowrap">文件列</th>
                    <th className="text-left py-1.5 pr-2 text-app-text-secondary font-medium whitespace-nowrap">映射到</th>
                    {preview.length > 1 && preview.slice(1, 6).map((_, ri) => (
                      <th key={ri} className="text-left py-1.5 pr-2 text-app-text-secondary font-medium whitespace-nowrap">
                        预览 #{ri + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(preview[0] || []).map((header, i) => (
                    <tr key={i} className="border-b border-app-border/60">
                      <td className="py-1.5 pr-2 text-app-text-primary font-medium whitespace-nowrap">{header}</td>
                      <td className="py-1.5 pr-2">
                        <select
                          className="text-xs border border-app-border rounded px-2 py-1 bg-app-surface-container text-app-text-primary max-w-[120px]"
                          value={mapping[i] || ''}
                          onChange={(e) => setMapping({ ...mapping, [i]: e.target.value })}
                        >
                          <option value="">跳过</option>
                          {columns.map((c) => (
                            <option key={c.key} value={c.key}>{c.label}</option>
                          ))}
                        </select>
                      </td>
                      {preview.slice(1, 6).map((row, ri) => (
                        <td key={ri} className="py-1.5 pr-2 text-app-text-tertiary whitespace-nowrap max-w-[150px] truncate">
                          {row[i] || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setStep('upload')} className="px-3 py-1.5 text-sm border border-app-border rounded-app-element text-app-text-secondary hover:bg-app-surface-container">
                返回
              </button>
              <button onClick={handleImport} className="px-3 py-1.5 rounded-app-element bg-app-accent text-app-text-inverse text-sm hover:bg-app-accent-hover">
                确认导入
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Importing progress */}
        {step === 'importing' && (
          <div className="space-y-4">
            <div className="w-full bg-app-surface-container rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-app-accent rounded-full transition-all duration-300"
                style={{ width: `${importProgress}%` }}
              />
            </div>
            <p className="text-xs text-app-text-secondary text-center">{importProgress}%</p>
          </div>
        )}
      </div>
    </div>
  );
}