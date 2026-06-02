import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  groupName: string;
  page: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function GroupPaginator({ groupName, page, total, onPageChange }: Props) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-violet-50 disabled:opacity-30"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        上一个
      </button>
      <span className="text-sm font-semibold text-violet-700">{groupName}</span>
      <span className="text-xs text-neutral-400">
        第 {page} / {total} 个课题组
      </span>
      <button
        type="button"
        disabled={page >= total}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-violet-50 disabled:opacity-30"
      >
        下一个
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
