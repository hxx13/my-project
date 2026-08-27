import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchCageHistory, type CageHistoryGroup } from "@/api/domains/cageShelf.api";

function formatTime(s?: string | null): string {
  return s ? s.replace("T", " ").substring(0, 19) : "-";
}

/**
 * CageHistoryModal — 「记录模式」下点笼位弹出的历史记录。
 * 按笼盒分组展示该笼位全部字段变化 + 操作人（数据源 = cage_form_audit_log，后端已按 BIND/UNBIND 分组）。
 */
export default function CageHistoryModal({ animalCageId, onClose }: { animalCageId: string | null; onClose: () => void }) {
  const [groups, setGroups] = useState<CageHistoryGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!animalCageId) {
      setGroups([]);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchCageHistory(animalCageId)
      .then((g) => { if (!cancelled) setGroups(g); })
      .catch((e) => { if (!cancelled) { setGroups([]); setError(e instanceof Error ? e.message : "加载失败"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [animalCageId]);

  return (
    <Dialog open={!!animalCageId} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* 手机上收窄到 92vw 并留圆角与小内边距；sm 以上恢复桌面原样（max-w-lg / p-6 / rounded-lg） */}
      <DialogContent className="z-[var(--z-modal)] w-[92vw] max-w-[92vw] p-4 rounded-2xl sm:w-full sm:max-w-lg sm:p-6 sm:rounded-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>历史记录</DialogTitle>
          <DialogDescription>笼位 #{animalCageId} 的全部记录存档（按笼盒分组）</DialogDescription>
        </DialogHeader>

        {loading && <div className="text-xs text-[var(--twin-mute)] py-4 text-center">加载中…</div>}
        {!loading && error && <div className="text-xs text-red-500 py-2">{error}</div>}
        {!loading && !error && groups.length === 0 && (
          <div className="text-xs text-[var(--twin-mute)] py-4 text-center">暂无记录</div>
        )}

        <div className="space-y-3">
          {groups.map((g, i) => (
            <details
              key={i}
              open={i === groups.length - 1}
              className="rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]"
            >
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-[var(--twin-ink)] select-none">
                📦 {g.label}
                <span className="text-[var(--twin-mute)] font-normal ml-1">({g.changes.length} 条)</span>
              </summary>
              <div className="border-t border-[var(--twin-hairline)] divide-y divide-[var(--twin-hairline)]">
                {g.changes.length === 0 && (
                  <div className="px-3 py-2 text-[11px] text-[var(--twin-mute)]">无变化</div>
                )}
                {g.changes.map((c, j) => (
                  <div key={j} className="px-3 py-1.5 text-[11px]">
                    {/* 窄屏允许换行，避免操作人被挤出可视区 */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium text-[var(--twin-ink)]">{c.fieldName || c.changeType}</span>
                      <span className="text-[var(--twin-mute)]">{formatTime(c.createdAt)}</span>
                      {c.operator && <span className="sm:ml-auto text-[var(--twin-mute)]">{c.operator}</span>}
                    </div>
                    <div className="text-[var(--twin-mute)] mt-0.5 break-words">
                      {c.beforeValue ?? "—"} → {c.afterValue ?? "—"}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
