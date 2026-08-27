import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminButton } from "@/components/admin/AdminButton";
import { searchPersonnelByKeyword } from "@/api/domains/cageShelf.api";

/**
 * 认领模式：占用者选择弹窗（教职工侧，免审核直接锁定）。
 *
 * 打开时自动按笼位 AUP 的课题组预览成员；也可手动搜索姓名/账号。
 * Web 管理端与 H5 共用同一个弹窗——移动端视口下 shadcn Dialog 自适应，不另写一套。
 */
export default function ReservePersonDialog({ open, submitting, groupNames, onClose, onConfirm }: {
  open: boolean;
  submitting: boolean;
  groupNames: string[];
  onClose: () => void;
  onConfirm: (p: { name: string; accountId: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: number; name: string; accountId: string; projectGroupName: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<{ name: string; accountId: string } | null>(null);

  const search = async (kw: string) => {
    setQuery(kw);
    if (!kw.trim()) { setResults([]); return; }
    setSearching(true);
    try { setResults(await searchPersonnelByKeyword(kw.trim())); }
    catch { setResults([]); }
    finally { setSearching(false); }
  };

  // 打开弹窗时自动预览该笼位 AUP 的课题组及其成员
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setQuery("");
    if (groupNames.length === 0) { setResults([]); return; }
    setSearching(true);
    (async () => {
      const all: Array<{ id: number; name: string; accountId: string; projectGroupName: string }> = [];
      for (const g of groupNames) {
        try {
          const list = await searchPersonnelByKeyword(g);
          all.push(...list.filter((p) => p.projectGroupName === g));
        } catch {}
      }
      setResults(all);
      setSearching(false);
    })();
  }, [open, groupNames]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSelected(null); onClose(); } }}>
      {/* 手机收窄到 92vw + 小内边距 + 大圆角并限高滚动；sm 以上恢复桌面原样 */}
      <DialogContent className="z-[var(--z-modal)] w-[92vw] max-w-[92vw] p-4 rounded-2xl max-h-[85vh] overflow-y-auto sm:w-full sm:max-w-md sm:p-6 sm:rounded-lg sm:max-h-none sm:overflow-visible">
        <DialogHeader>
          <DialogTitle>选择占用者</DialogTitle>
          <DialogDescription>预定笼位后，该人员将成为占用者（免审核，直接锁定）</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center gap-1 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]" />
            <input type="text" value={query} onChange={(e) => search(e.target.value)} placeholder="搜索人员姓名/账号…"
              className="flex-1 bg-transparent text-xs outline-none text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)]" />
            {query && <button onClick={() => { setSelected(null); search(""); }} className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)]">✕</button>}
          </div>
          {groupNames.length > 0 && (
            <div className="text-[11px] text-[var(--twin-mute)]">课题组：{groupNames.join("、")}</div>
          )}
          {selected ? (
            <div className="flex items-center gap-2 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1.5">
              <span className="flex-1 text-xs text-[var(--twin-ink)]">{selected.name}</span>
              <button onClick={() => setSelected(null)} className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)]">✕</button>
            </div>
          ) : (
            (searching || results.length > 0) && (
              <div className="border border-[var(--twin-hairline)] rounded-twin-md overflow-hidden">
                <div className="max-h-48 overflow-y-auto">
                  {searching && <div className="px-3 py-2 text-center text-xs text-[var(--twin-mute)]">搜索中…</div>}
                  {!searching && results.length === 0 && <div className="px-3 py-2 text-center text-xs text-[var(--twin-mute)]">无匹配结果</div>}
                  {!searching && results.map((p) => (
                    <button key={p.id} onClick={() => setSelected({ name: p.name, accountId: p.accountId })}
                      className="w-full text-left px-3 py-2 text-xs border-b border-[var(--twin-hairline)] last:border-b-0 hover:bg-[var(--app-color-surface-hover)] text-[var(--twin-ink)]">
                      <span className="font-medium">{p.name}</span>
                      {p.projectGroupName && <span className="ml-1 text-[10px] text-[var(--twin-mute)]">{p.projectGroupName}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
        <DialogFooter className="gap-2">
          <AdminButton type="button" tone="secondary" size="default" onClick={() => { setSelected(null); onClose(); }}>取消</AdminButton>
          <AdminButton type="button" size="default" disabled={submitting || !selected} onClick={() => selected && onConfirm(selected)}>
            {submitting ? "预定中..." : "确认预定"}
          </AdminButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
