import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MissingRegistryItem {
  path: string;
  label: string;
  icon: string;
  groupTitle: string;
}

export interface HiddenRegistryItem {
  id: string;
  title: string;
  path: string;
}

interface Props {
  missingItems: MissingRegistryItem[];
  hiddenItems: HiddenRegistryItem[];
  restoring: boolean;
  showingHidden: string | null;
  onRestoreMissing: () => void;
  onShowHidden: (itemId: string) => void;
}

export function AdminNavManagerRightPanel({
  missingItems,
  hiddenItems,
  restoring,
  showingHidden,
  onRestoreMissing,
  onShowHidden,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain p-3 space-y-3">
      {/* 未入库条目 */}
      <section className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06]">
        <header className="flex items-center justify-between px-3 py-2 border-b border-amber-500/20">
          <span className="text-xs font-semibold text-amber-300">未入库条目 ({missingItems.length})</span>
          {missingItems.length > 0 && (
            <button
              type="button"
              disabled={restoring}
              onClick={onRestoreMissing}
              className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-amber-500 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn("h-3 w-3", restoring && "animate-spin")} />
              一键恢复全部
            </button>
          )}
        </header>
        <div className="p-2 space-y-1">
          {missingItems.length === 0 ? (
            <p className="text-[11px] text-[var(--twin-mute)] px-1 py-3 text-center">注册表条目已全部入库 ✓</p>
          ) : (
            <>
              <p className="text-[10px] text-amber-500/80 px-1 pb-1">
                以下条目在代码注册表中存在但未入库，点击「一键恢复」将其添加到导航配置。
              </p>
              {missingItems.map((item) => (
                <div key={item.path} className="flex items-center gap-1.5 text-[11px] text-amber-200 bg-white/[0.04] rounded px-2 py-1">
                  <span className="text-[10px] opacity-50 font-mono shrink-0">{item.path}</span>
                  <span className="flex-1 truncate font-medium">{item.label}</span>
                  <span className="text-[10px] text-amber-500/80 shrink-0">{item.groupTitle}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      {/* 已隐藏条目 */}
      <section className="rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]/50">
        <header className="flex items-center justify-between px-3 py-2 border-b border-[var(--twin-hairline)]">
          <span className="text-xs font-semibold text-[var(--twin-body)]">已隐藏条目 ({hiddenItems.length})</span>
        </header>
        <div className="p-2 space-y-1">
          {hiddenItems.length === 0 ? (
            <p className="text-[11px] text-[var(--twin-mute)] px-1 py-3 text-center">没有隐藏的注册表条目</p>
          ) : (
            <>
              <p className="text-[10px] text-[var(--twin-mute)] px-1 pb-1">
                以下条目已入库但被手动隐藏，点击「显示」重新出现在侧栏。
              </p>
              {hiddenItems.map((item) => (
                <div key={item.id} className="flex items-center gap-1.5 text-[11px] text-[var(--twin-body)] bg-white/[0.04] rounded px-2 py-1">
                  <span className="text-[10px] opacity-50 font-mono shrink-0">{item.path}</span>
                  <span className="flex-1 truncate">{item.title}</span>
                  <button
                    type="button"
                    disabled={showingHidden === item.id}
                    onClick={() => onShowHidden(item.id)}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
                  >
                    {showingHidden === item.id ? "…" : "显示"}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
