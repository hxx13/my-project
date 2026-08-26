import { useState, useEffect, useRef } from "react";
import { Search, ChevronDown, ArrowUpDown } from "lucide-react";
import toast from "react-hot-toast";
import { fetchAupDict, fetchRoomsByRegisterNo } from "@/api/domains/cageShelf.api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type AupDictItem = { id: string; registerNo: string; projectGroupName: string; piName: string };
type RoomItem = { roomId: string; roomName: string };

interface Props {
  onSelectRoom: (roomId: string, roomName: string) => void;
}

export default function AupSearchBar({ onSelectRoom }: Props) {
  const [search, setSearch] = useState("");
  const [aupOptions, setAupOptions] = useState<AupDictItem[]>([]);
  const [matched, setMatched] = useState<AupDictItem[]>([]);
  const [roomCandidates, setRoomCandidates] = useState<RoomItem[]>([]);
  const [sortAsc, setSortAsc] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [roomPickOpen, setRoomPickOpen] = useState(false);
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

  // 选中某个 AUP → 填搜索框 → 用本地映射反查房间并跳转
  const pickAup = async (aup: AupDictItem) => {
    setSearch(aup.registerNo || "");
    setDropdownOpen(false);
    setMatched([]);
    setResultOpen(false);
    if (!aup.registerNo) return;
    try {
      const rooms = await fetchRoomsByRegisterNo(aup.registerNo);
      if (rooms.length === 1) {
        onSelectRoom(rooms[0].roomId, rooms[0].roomName);
      } else if (rooms.length > 1) {
        setRoomCandidates(rooms);
        setRoomPickOpen(true);
      } else {
        toast("该 AUP 未关联房间");
      }
    } catch {
      toast("查找房间失败");
    }
  };

  const doSearch = () => {
    const kw = search.trim().toLowerCase();
    if (!kw) return;
    const m = aupOptions.filter(a =>
      (a.registerNo || "").toLowerCase().includes(kw) ||
      (a.projectGroupName || "").toLowerCase().includes(kw) ||
      (a.piName || "").toLowerCase().includes(kw)
    );
    if (m.length === 1) {
      void pickAup(m[0]);
      return;
    }
    setMatched(m);
    setResultOpen(true);
  };

  const selectRoom = (room: RoomItem) => {
    setRoomPickOpen(false);
    setRoomCandidates([]);
    onSelectRoom(room.roomId, room.roomName);
  };

  const parseNum = (s: string) => { const m = s.match(/(\d{4})-(\d+)/); return m ? [+m[1], +m[2]] : [0, 0]; };

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
          <button onClick={() => { setSearch(""); setMatched([]); }} className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)]">✕</button>
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
                const [ay, ai] = parseNum(a.registerNo || "");
                const [by, bi] = parseNum(b.registerNo || "");
                const cmp = ay !== by ? ay - by : ai - bi;
                return sortAsc ? cmp : -cmp;
              }).map(a => (
                <button
                  key={a.id}
                  onClick={() => void pickAup(a)}
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
        disabled={!search.trim()}
        className="rounded-twin-md px-2.5 py-1 text-[10px] font-semibold bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 transition whitespace-nowrap"
      >
        搜索
      </button>

      {/* matched AUP picker dialog */}
      <Dialog open={resultOpen} onOpenChange={(v) => { if (!v) setMatched([]); }}>
        <DialogContent className="z-[var(--z-modal)] border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-primary)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>匹配的 AUP</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-[var(--twin-mute)] mb-2">共 {matched.length} 条匹配结果，点击跳转：</div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {matched.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-[var(--twin-mute)]">无匹配结果</div>
            )}
            {matched.map(a => (
              <button
                key={a.id}
                onClick={() => void pickAup(a)}
                className="w-full text-left px-3 py-2 rounded-twin-sm border border-[var(--twin-hairline)] hover:border-indigo-300 hover:bg-indigo-50/50 transition flex items-center justify-between"
              >
                <span className="font-medium text-[var(--twin-ink)]">{a.projectGroupName || "—"}</span>
                <div className="text-[10px] text-[var(--twin-mute)] text-right">
                  <div>{a.piName}</div>
                  <div>{a.registerNo}</div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* room picker dialog */}
      <Dialog open={roomPickOpen} onOpenChange={(v) => { if (!v) { setRoomPickOpen(false); setRoomCandidates([]); } }}>
        <DialogContent className="z-[var(--z-modal)] border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-primary)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>选择房间</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-[var(--twin-mute)] mb-2">该 AUP 关联了 {roomCandidates.length} 个房间，请选择：</div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {roomCandidates.map(r => (
              <button
                key={r.roomId}
                onClick={() => selectRoom(r)}
                className="w-full text-left px-3 py-2 rounded-twin-sm border border-[var(--twin-hairline)] hover:border-indigo-300 hover:bg-indigo-50/50 transition"
              >
                <span className="font-medium text-[var(--twin-ink)]">{r.roomName || r.roomId}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
