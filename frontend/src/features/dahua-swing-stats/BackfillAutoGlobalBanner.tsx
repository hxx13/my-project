import { useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { Loader2, Square } from "lucide-react";
import {
  getBackfillAutoSnapshot,
  getBackfillProgressPct,
  stopBackfillAuto,
  subscribeBackfillAuto,
} from "./backfillAutoRunner";

/** 管理端全局：自动回溯在切页后仍继续，顶栏下展示进度 */
export function BackfillAutoGlobalBanner() {
  const progress = useSyncExternalStore(subscribeBackfillAuto, getBackfillAutoSnapshot, () => null);
  const pct = useSyncExternalStore(subscribeBackfillAuto, getBackfillProgressPct, () => 0);

  if (!progress?.running) return null;

  return (
    <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-900 shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-2 max-w-[1600px] mx-auto">
        <div className="inline-flex items-center gap-2 font-medium">
          {progress.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          历史回溯进行中：
          <Link to="/console/admin/dahua-swing-stats-backfill" className="underline text-emerald-800">
            {progress.taskName}
          </Link>
        </div>
        {progress.running ? (
          <button
            type="button"
            className="rounded border border-rose-300 bg-white px-2 py-0.5 text-rose-700 inline-flex items-center gap-1"
            onClick={() => stopBackfillAuto()}
          >
            <Square className="h-3 w-3" />
            停止
          </button>
        ) : null}
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-emerald-100 overflow-hidden max-w-[1600px] mx-auto">
        <div className="h-full bg-emerald-600 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-emerald-800/90 max-w-[1600px] mx-auto">
        <span>
          段 {progress.segmentDone}/{progress.segmentTotal}（{pct}%）
        </span>
        <span>累计入库 {progress.totalSaved} 条</span>
        {progress.lastWindow ? <span>最近窗 {progress.lastWindow}</span> : null}
        <span className="text-slate-600">{progress.statusText}</span>
      </div>
    </div>
  );
}
