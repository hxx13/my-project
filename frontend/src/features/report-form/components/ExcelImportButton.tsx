import { Upload, FileUp } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { createFormFromExcel } from '../api/reportForm.api';
import type { ReportFormDefinition } from '../types';
import toast from 'react-hot-toast';

interface Props {
  onImported: (form: ReportFormDefinition) => void;
}

export default function ExcelImportButton({ onImported }: Props) {
  const mut = useMutation({
    mutationFn: createFormFromExcel,
    onSuccess: (form) => {
      onImported(form);
      toast.success('Excel 导入完成');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) mut.mutate(file);
    };
    input.click();
  };

  return (
    <button
      onClick={handleClick}
      disabled={mut.isPending}
      className="px-3 py-1.5 rounded-[var(--app-radius-container)] text-[12px] font-medium
                 bg-[var(--app-color-accent)] text-white hover:opacity-90
                 flex items-center gap-1 disabled:opacity-50 transition-opacity"
    >
      <FileUp className="w-3.5 h-3.5" />
      {mut.isPending ? '导入中...' : '从 Excel 创建'}
    </button>
  );
}
