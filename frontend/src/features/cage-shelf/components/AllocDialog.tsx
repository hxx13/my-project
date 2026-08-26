import { useState, useMemo } from "react";
import { Search, ArrowUpDown } from "lucide-react";
import type { AupItem } from "@/api/domains/cageShelf.api";

interface Props {
  aupList: AupItem[];
  selectedAupId: string;
  setSelectedAupId: (id: string) => void;
  selectedCells: Set<string>;
  allocSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function AllocDialog({ aupList, selectedAupId, setSelectedAupId, selectedCells, allocSubmitting, onClose, onConfirm }: Props) {
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? aupList.filter(a =>
          (a.projectGroupName || "").toLowerCase().includes(q) ||
          (a.registerNo || "").toLowerCase().includes(q) ||
          (a.piName || "").toLowerCase().includes(q)
        )
      : aupList;
    return [...list].sort((a, b) => {
      const parseNum = (s: string) => { const m = s.match(/(\d{4})-(\d+)/); return m ? [+m[1], +m[2]] : [0, 0]; };
      const [ay, ai] = parseNum(a.registerNo || "");
      const [by, bi] = parseNum(b.registerNo || "");
      const cmp = ay !== by ? ay - by : ai - bi;
      return sortAsc ? cmp : -cmp;
    });
  }, [aupList, search, sortAsc]);

  const labels = useMemo(() => {
    const arr: string[] = [];
    for (const key of selectedCells) {
      const [, xStr, yStr] = key.split(":");
      const x = parseInt(xStr), y = parseInt(yStr);
      arr.push(`${String.fromCharCode(64 + x)}${y}`);
    }
    return arr;
  }, [selectedCells]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3" onClick={e => e.stopPropagation()}>
        <div className="text-sm font-semibold text-[var(--twin-ink)] mb-3">分配选定笼位</div>
        <div className="text-xs text-[var(--twin-mute)] mb-3">
          已选笼位: {labels.slice(0, 8).join(", ")}{labels.length > 8 ? ` 等共${labels.length}个` : ` (共${labels.length}个)`}
        </div>

        {/* search + sort */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1 flex-1 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1">
            <Search className="h-3.5 w-3.5 text-[var(--twin-mute)] shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索课题组…"
              className="flex-1 bg-transparent text-xs outline-none text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)]"
            />
            {search && <button onClick={() => setSearch("")} className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)]">✕</button>}
          </div>
          <button
            onClick={() => setSortAsc(v => !v)}
            className="flex items-center gap-0.5 shrink-0 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[10px] text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
          >
            <ArrowUpDown className="h-3 w-3" />{sortAsc ? "正序" : "倒序"}
          </button>
        </div>

        {/* AUP list - fixed height scrollable */}
        <div className="mb-4 border border-[var(--twin-hairline)] rounded-twin-md overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-[var(--twin-mute)]">
                {search ? "无匹配结果" : "暂无 AUP 数据"}
              </div>
            )}
            {filtered.map(a => (
              <button
                key={a.id}
                onClick={() => setSelectedAupId(a.id === selectedAupId ? "" : a.id)}
                className={`w-full text-left px-3 py-2 text-xs border-b border-[var(--twin-hairline)] last:border-b-0 transition flex items-center justify-between ${
                  a.id === selectedAupId
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "hover:bg-[var(--app-color-surface-hover)] text-[var(--twin-ink)]"
                }`}
              >
                <span>{a.projectGroupName || "—"}</span>
                <span className="text-[10px] text-[var(--twin-mute)]">{a.registerNo}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-twin-md px-3 py-1.5 text-xs font-semibold border border-[var(--twin-hairline)] text-[var(--twin-mute)] hover:text-[var(--twin-ink)]">取消</button>
          <button type="button" onClick={onConfirm} disabled={allocSubmitting || !selectedAupId}
            className="rounded-twin-md px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition">
            {allocSubmitting ? "分配中…" : "确认分配"}
          </button>
        </div>
      </div>
    </div>
  );
}
