// ImportDialog — V3: uses POST /import API with preview
import React, { useState } from 'react';
import { importFile } from '@/api/domains/smartsheet.api';
import type { SmartsheetImportResult } from '@/features/smartsheet/types';
import toast from 'react-hot-toast';
import { FileUp, X } from 'lucide-react';

interface Props {
  sheetId: string;
  columns: unknown[];
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function ImportDialog({ sheetId, open, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<SmartsheetImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  if (!open) return null;

  const handleUpload = async () => {
    if (!file) { toast('请选择文件'); return; }
    setImporting(true);
    try {
      const res = await importFile(sheetId, file);
      setResult(res);
      toast.success(`导入完成: ${res.importedRows}/${res.totalRows} 行`);
    } catch (e) { toast.error('导入失败: ' + (e as Error).message); }
    finally { setImporting(false); }
  };

  const handleDone = () => { setFile(null); setResult(null); onImported(); };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[var(--z-modal)]" onClick={onClose}>
      <div className="bg-app-surface-container rounded-[14px] border border-app-border shadow-lg w-[480px] max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <FileUp className="w-5 h-5 text-app-accent" />
          <span className="font-semibold text-sm text-app-text-primary">导入数据</span>
          <div className="flex-1" />
          <button onClick={onClose} className="p-1 rounded hover:bg-app-surface-hover"><X className="w-4 h-4" /></button>
        </div>

        {!result ? (
          <>
            <p className="text-xs text-app-text-secondary mb-3">支持 .xlsx / .xls / .csv 格式，第一行为列头</p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs mb-3" />
            <button onClick={handleUpload} disabled={!file || importing}
              className="w-full px-3 py-2 rounded-[var(--app-radius-sm)] text-xs font-medium bg-app-accent text-white disabled:opacity-50">
              {importing ? '导入中...' : '开始导入'}
            </button>
          </>
        ) : (
          <>
            <div className="text-xs text-app-text-secondary mb-2">
              总计 {result.totalRows} 行 · 导入 {result.importedRows} 行 · 跳过 {result.skippedRows} 行
            </div>
            {result.errors.length > 0 && (
              <div className="text-xs text-app-feedback-danger mb-2">{result.errors.join('; ')}</div>
            )}
            {result.preview.length > 0 && (
              <div className="mb-3 max-h-[200px] overflow-auto rounded border border-app-border">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-app-surface-page">
                      {Object.keys(result.preview[0]).map(k => <th key={k} className="px-2 py-1 text-left text-app-text-secondary">{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {result.preview.map((row, i) => (
                      <tr key={i} className="border-t border-app-border">
                        {Object.values(row).map((v, j) => <td key={j} className="px-2 py-1">{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button onClick={handleDone} className="w-full px-3 py-2 rounded-[var(--app-radius-sm)] text-xs font-medium bg-app-accent text-white">
              完成
            </button>
          </>
        )}
      </div>
    </div>
  );
}
