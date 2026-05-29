import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  RotateCcw, Database, Trash2, Play, Pause,
  ArrowDown, ChevronDown, ChevronRight, Settings2, ArrowLeft,
} from "lucide-react";
import {
  fetchLogLevels,
  setLogLevel,
  resetLogLevels,
  syncLogFromDb,
  fetchRecentLogs,
  clearLogBuffer,
  type LoggerCategory,
  type LogEntry,
} from "@/api/domains/logging.api";

const LEVEL_COLORS: Record<string, string> = {
  ERROR: "text-red-400",
  WARN: "text-yellow-400",
  INFO: "text-green-400",
  DEBUG: "text-slate-400",
  TRACE: "text-slate-500",
};

const selectCls = "text-xs bg-gray-800 text-gray-100 border border-gray-500 rounded px-2 py-1 font-mono focus:outline-none focus:border-blue-400 cursor-pointer";
const btnBase = "text-xs text-gray-300 hover:text-white font-mono flex items-center gap-1 transition disabled:opacity-30";
const btnGhost = "text-xs text-gray-400 hover:text-white font-mono flex items-center gap-1 transition";

function LogStream({ paused, onTogglePaused }: { paused: boolean; onTogglePaused: () => void }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [minLevel, setMinLevel] = useState("");
  const [search, setSearch] = useState("");
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (paused) return;
      try {
        const res = await fetchRecentLogs(500, minLevel);
        if (active) setEntries(res.entries);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { active = false; clearInterval(id); };
  }, [minLevel, paused]);

  const isNearBottom = () => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const scrollToBottom = () => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      userScrolledUp.current = false;
      setShowScrollBtn(false);
    }
  };

  useEffect(() => {
    if (!userScrolledUp.current && isNearBottom()) {
      scrollToBottom();
    }
  }, [entries]);

  const handleScroll = useCallback(() => {
    const near = isNearBottom();
    userScrolledUp.current = !near;
    setShowScrollBtn(!near);
  }, []);

  const filtered = search
    ? entries.filter((e) =>
        e.message.toLowerCase().includes(search.toLowerCase()) ||
        e.logger.toLowerCase().includes(search.toLowerCase()))
    : entries;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0 bg-gray-900 border-b border-gray-700">
        <select
          value={minLevel}
          onChange={(e) => setMinLevel(e.target.value)}
          className={selectCls}
        >
          <option value="">ALL</option>
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
        </select>
        <input
          type="text"
          placeholder="grep..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-xs bg-gray-800 text-gray-100 border border-gray-500 rounded px-2 py-1 font-mono placeholder-gray-500 focus:outline-none focus:border-blue-400"
        />
        <span className="text-xs text-gray-400 font-mono">{entries.length}</span>
        <button
          onClick={onTogglePaused}
          className={`flex items-center gap-0.5 text-xs px-2 py-1 rounded font-mono border transition ${
            paused
              ? "bg-amber-900/40 text-amber-300 border-amber-600"
              : "bg-gray-800 text-gray-400 border-gray-600 hover:text-gray-200"
          }`}
        >
          {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
        </button>
      </div>
      {/* terminal body */}
      <div className="flex-1 relative bg-gray-950 min-h-0">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto px-3 py-2 font-mono text-[13px] leading-[1.7]"
        >
          {filtered.length === 0 ? (
            <div className="text-gray-600 text-center mt-8 select-none">no output</div>
          ) : (
            filtered.map((e, i) => (
              <div key={`${e.tsEpochMs}-${i}`} className="flex gap-2.5 hover:bg-white/[0.04] min-w-0">
                <span className="text-gray-500 shrink-0 select-none">{e.ts}</span>
                <span className={`shrink-0 w-[56px] font-semibold ${LEVEL_COLORS[e.level] || "text-gray-400"}`}>{e.level}</span>
                <span className="text-gray-500 shrink-0 max-w-[180px] truncate select-none">{e.logger.split(".").pop()}</span>
                <span className="text-gray-200 break-all">{e.message}</span>
              </div>
            ))
          )}
        </div>
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 z-10 p-2 rounded-full bg-gray-700 border border-gray-500 text-gray-200 hover:bg-gray-600 hover:text-white transition shadow-lg"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function AdminLoggingConsolePage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<LoggerCategory[]>([]);
  const [rootLevel, setRootLevel] = useState("INFO");
  const levelOptions = ["OFF", "ERROR", "WARN", "INFO", "DEBUG"];
  const [loading, setLoading] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const loadLevels = useCallback(async () => {
    try {
      const data = await fetchLogLevels();
      setRootLevel(data.root);
      setCategories(data.categories);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadLevels(); }, [loadLevels]);

  const handleSetLevel = async (loggerName: string, key: string, level: string) => {
    setLoading(key);
    try { await setLogLevel(loggerName, level); await loadLevels(); }
    catch { /* ignore */ }
    finally { setLoading(null); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-950">
      {/* top bar */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0 bg-gray-900 border-b border-gray-700">
        <button
          onClick={() => navigate("/admin")}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-white font-mono transition mr-1"
          title="返回管理后台"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-white font-mono transition"
        >
          {panelOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <Settings2 className="w-3 h-3" />
          controls
        </button>
        <span className="text-xs text-gray-600 font-mono">|</span>
        <span className="text-xs text-gray-400 font-mono">ROOT:<span className="text-blue-300 ml-0.5">{rootLevel}</span></span>
        {categories.map((c) => (
          <span key={c.key} className="text-xs text-gray-500 font-mono hidden sm:inline">
            {c.key}:<span className={c.level === "继承 ROOT" ? "text-gray-500" : "text-yellow-300"}>{c.level === "继承 ROOT" ? rootLevel : c.level}</span>
          </span>
        ))}
        <div className="flex-1" />
        <button onClick={async () => { await syncLogFromDb(); loadLevels(); }} className={btnBase}>
          <Database className="w-3 h-3" /> sync
        </button>
        <button onClick={async () => { await resetLogLevels(); loadLevels(); }} className={btnBase}>
          <RotateCcw className="w-3 h-3" /> reset
        </button>
        <button onClick={() => clearLogBuffer()} className={btnBase}>
          <Trash2 className="w-3 h-3" /> clear
        </button>
      </div>

      {/* body */}
      <div className="flex-1 flex min-h-0">
        {/* collapsible panel */}
        {panelOpen && (
          <div className="w-56 shrink-0 bg-gray-900 border-r border-gray-700 p-3 flex flex-col gap-2.5 overflow-y-auto">
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 font-mono">root</div>
              <select
                value={rootLevel}
                onChange={(e) => handleSetLevel("ROOT", "root", e.target.value)}
                className={`w-full ${selectCls}`}
              >
                {levelOptions.map((l) => (<option key={l} value={l}>{l}</option>))}
              </select>
            </div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0 font-mono mt-1">categories</div>
            {categories.map((cat) => (
              <div key={cat.key} className="flex items-center gap-1.5">
                <span className="text-xs text-gray-300 w-[72px] truncate font-mono">{cat.key}</span>
                <select
                  value={cat.level === "继承 ROOT" ? "INHERIT" : cat.level}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleSetLevel(cat.loggerName, cat.key, val === "INHERIT" ? rootLevel : val);
                  }}
                  disabled={loading === cat.key}
                  className={`flex-1 text-[11px] ${selectCls}`}
                >
                  <option value="INHERIT">={rootLevel}</option>
                  {levelOptions.map((l) => (<option key={l} value={l}>{l}</option>))}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* terminal */}
        <LogStream paused={paused} onTogglePaused={() => setPaused(!paused)} />
      </div>
    </div>
  );
}
