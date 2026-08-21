import { useState, useEffect, useRef } from "react";
import { Search, ChevronDown, Loader2, ArrowUpDown } from "lucide-react";
import { fetchAupDict, searchAupsAcrossRooms, type AupSearchHit } from "@/api/domains/cageShelf.api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  onSelectRoom: (roomId: string, roomName: string) => void;
}

export default function AupSearchBar({ onSelectRoom }: Props) {
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<AupSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [aupOptions, setAupOptions] = useState<{ id: string; registerNo: string; projectGroupName: string }[]>([]);
  const [sortAsc, setSortAsc] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAupDict().then(list => setAupOptions(list.filter(a => a.id && a.registerNo))).catch(() => {});
  }, []);

  // click outside to close quick-select
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const doSearch = async () => {
    const kw = search.trim();
    if (!kw) return;
    setSearching(true);
    try {
      const h = await searchAupsAcrossRooms(kw);
      setHits(h);
      if (h.length === 1) {
        onSelectRoom(h[0].roomId, h[0].roomName);
        setSearch(""); setHits([]);
      }
    } catch { setHits([]); }
    finally { setSearching(false); }
  };

  const quickSelect = (label: string) => {
    setSearch(label);
    setDropdownOpen(false);
  };

  const selectHit = (roomId: string, roomName: string) => {
    onSelectRoom(roomId, roomName);
    setSearch(""); setHits([]);
  };

  return (
    <div ref={ref} className="relative flex items-center gap-1.5 shrink-0">
      {/* search input */}
      <div className="flex items-center gap-1 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1">
        <Search className="h-3.5 w-3.5 text-[var(--twin-mute)] shrink-0" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") doSearch(); }}
          placeholder="搜索 AUP 编号 / 课题组…"
          className="w-44 bg-transparent text-[11px] outline-none text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)]"
        />
        {search && (
          <button onClick={() => { setSearch(""); setHits([]); }} className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)]">✕</button>
        )}
      </div>

      {/* quick-select dropdown */}
      <div className="relative">
        <button
          onClick={() => setDropdownOpen(v => !v)}
          className="flex items-center gap-0.5 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-mute)] hover:text-[var(--twin-ink)] transition"
          title="快速选择 AUP"
        >
          快速选择 <ChevronDown className="h-3 w-3" />
        </button>
        {dropdownOpen && (
          <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] shadow-xl flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-[var(--twin-hairline)]">
              <span className="text-[10px] text-[var(--twin-mute)]">{aupOptions.length} 个 AUP</span>
              <button onClick={() => setSortAsc(v => !v)} className="flex items-center gap-0.5 text-[10px] text-[var(--twin-mute)] hover:text-[var(--twin-ink)]">
                <ArrowUpDown className="h-3 w-3" />{sortAsc ? "正序" : "倒序"}
              </button>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {aupOptions.length === 0 && (
                <div className="px-3 py-2 text-[10px] text-[var(--twin-mute)]">暂无 AUP 数据</div>
              )}
              {[...aupOptions].sort((a, b) => {
                const parseNum = (s: string) => { const m = s.match(/(\d{4})-(\d+)/); return m ? [+m[1], +m[2]] : [0, 0]; };
                const [ay, ai] = parseNum(a.registerNo || "");
                const [by, bi] = parseNum(b.registerNo || "");
                const cmp = ay !== by ? ay - by : ai - bi;
                return sortAsc ? cmp : -cmp;
              }).map(a => (
                <button
                  key={a.id}
                  onClick={() => quickSelect(a.registerNo || "")}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--app-color-surface-hover)]"
                >
                  <span className="font-medium text-[var(--twin-ink)]">{a.projectGroupName || "—"}</span>
                  <span className="ml-2 text-[10px] text-[var(--twin-mute)]">{a.registerNo}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* search button */}
      <button
        onClick={doSearch}
        disabled={searching || !search.trim()}
        className="rounded-twin-md px-2.5 py-1 text-[10px] font-semibold bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 transition whitespace-nowrap"
      >
        {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : "搜索"}
      </button>

      {/* results dialog */}
      <Dialog open={hits.length > 1} onOpenChange={(v) => { if (!v) setHits([]); }}>
        <DialogContent className="z-[var(--z-modal)] border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-primary)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>选择房间</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-[var(--twin-mute)] mb-2">
            搜索到的 AUP 存在于以下 {hits.length} 个房间中，请选择一个：
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {hits.map(h => (
              <button
                key={h.roomId}
                onClick={() => selectHit(h.roomId, h.roomName)}
                className="w-full text-left px-3 py-2 rounded-twin-sm border border-[var(--twin-hairline)] hover:border-indigo-300 hover:bg-indigo-50/50 transition flex items-center justify-between"
              >
                <div>
                  <span className="font-medium text-[var(--twin-ink)]">{h.roomName}</span>
                </div>
                <div className="text-[10px] text-[var(--twin-mute)] text-right">
                  <div>{h.piName}</div>
                  <div>{h.registerNumber}</div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
