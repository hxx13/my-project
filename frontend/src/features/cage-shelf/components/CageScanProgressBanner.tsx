import { Loader2, X } from "lucide-react";

export interface CageScanProgress {
  status: string;         // idle | running | done | failed
  totalShelves: number;
  processedShelves: number;
  currentRoomName?: string;
  currentShelveName?: string;
  cagesScanned: number;
  cagesWithStatus: number;
  percent: number;
  message?: string;
  startedAt?: string;
}

interface Props {
  progress: CageScanProgress | null;
  onDismiss?: () => void;
}

export default function CageScanProgressBanner({ progress, onDismiss }: Props) {
  if (!progress || progress.status === "idle") return null;

  const isRunning = progress.status === "running";
  const isDone = progress.status === "done";
  const isFailed = progress.status === "failed";

  const toneClass = isRunning
    ? "border-violet-300 bg-violet-50 text-violet-900"
    : isDone
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : "border-red-300 bg-red-50 text-red-900";

  return (
    <div className={`rounded-twin-lg border px-4 py-3 text-xs ${toneClass}`}>
      <div className="flex items-center gap-2 mb-1">
        {isRunning && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
        <span className="font-semibold flex-1">
          {isRunning
            ? "一键同步进行中…"
            : isDone
              ? "一键同步完成"
              : "一键同步失败"}
        </span>
        {progress.startedAt && (
          <span className="opacity-60">· 开始于 {progress.startedAt}</span>
        )}
        {(isDone || isFailed) && onDismiss && (
          <button
            onClick={onDismiss}
            className="shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
            title="关闭"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isRunning && (
        <>
          <div className="w-full h-2 rounded-full bg-violet-200 overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-500"
              style={{ width: `${Math.max(2, progress.percent)}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 opacity-80">
            <span>
              步骤: {progress.processedShelves} / {progress.totalShelves}
            </span>
            {progress.currentRoomName && (
              <span>当前: {progress.currentRoomName}</span>
            )}
          </div>
        </>
      )}

      {(isDone || isFailed) && (
        <div className="opacity-80">{progress.message}</div>
      )}
    </div>
  );
}
