// frontend/src/features/smartsheet/components/SmartSheetImportDialog.tsx
import React, { useState, useRef } from 'react';
import { batchRows } from '@/api/domains/smartsheet.api';
import type { ColumnConfig } from '@/features/smartsheet/types';
import toast from 'react-hot-toast';

interface ImportDialogProps {
  sheetId: string;
  columns: ColumnConfig[];
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function SmartSheetImportDialog({
  sheetId, columns, open, onClose, onImported,
}: ImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [step, setStep] = useState<'upload' | 'map' | 'importing'>('upload');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').slice(0, 6).map((l) => l.split(',').map((c) => c.replace(/^"|"$/g, '').trim()));
    setPreview(lines);
    const header = lines[0] || [];
    const map: Record<number, string> = {};
    header.forEach((h, i) => {
      const match = columns.find((c) => c.label === h);
      if (match) map[i] = match.key;
    });
    setMapping(map);
    setStep('map');
  };

  const handleImport = async () => {
    setStep('importing');
    try {
      const file = fileRef.current?.files?.[0];
      if (!file) { onClose(); return; }
      const text = await file.text();
      const lines = text.split('\n').filter(Boolean);
      const dataRows = lines.slice(1).map((l) => {
        const vals = l.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
        const cellData: Record<string, string> = {};
        Object.entries(mapping).forEach(([srcIdx, colKey]) => {
          cellData[colKey] = vals[Number(srcIdx)] || '';
        });
        return { rowLabel: '', cellData };
      });
      await batchRows(sheetId, dataRows);
      toast.success(`导入 ${dataRows.length} 行`);
      onImported();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || '导入失败');
    }
    setStep('upload');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50"
         style={{ zIndex: 'var(--z-modal)' }}>
      <div className="bg-app-surface-elevated rounded-xl border border-app-border shadow-xl w-[600px] max-h-[80vh] overflow-y-auto p-6">
        <h3 className="text-sm font-semibold mb-4 text-app-text-primary">导入 Excel / CSV</h3>

        {step === 'upload' && (
          <div className="space-y-4">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile}
                   className="text-sm text-app-text-primary" />
            <button onClick={onClose} className="px-3 py-1.5 text-sm border border-app-border rounded-app-element text-app-text-secondary">取消</button>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4">
            <p className="text-xs text-app-text-secondary">确认列映射：</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-app-border">
                  <th className="text-left py-1 text-app-text-secondary">文件列</th>
                  <th className="text-left py-1 text-app-text-secondary">映射到</th>
                  <th className="text-left py-1 text-app-text-secondary">预览</th>
                </tr>
              </thead>
              <tbody>
                {(preview[0] || []).map((h, i) => (
                  <tr key={i} className="border-b border-app-border">
                    <td className="py-1 text-app-text-primary">{h}</td>
                    <td className="py-1">
                      <select className="text-xs border border-app-border rounded px-1 py-0.5 bg-app-surface-container text-app-text-primary" value={mapping[i] || ''}
                              onChange={(e) => setMapping({ ...mapping, [i]: e.target.value })}>
                        <option value="">跳过</option>
                        {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                    </td>
                    <td className="py-1 text-app-text-tertiary">{preview[1]?.[i] || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2">
              <button onClick={handleImport} className="px-3 py-1.5 rounded-app-element bg-app-accent text-app-text-inverse text-sm hover:bg-app-accent-hover">确认导入</button>
              <button onClick={onClose} className="px-3 py-1.5 border border-app-border rounded-app-element text-sm text-app-text-secondary">取消</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
