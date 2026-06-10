/**
 * 审核人/复审人多选组件 — 从教职工账号中选择，标签式多选。
 * 输出 JSON 数组字符串（如 '["user1","user2"]'）。
 * 调用 GET /material/admin/eligible-reviewers（无需 SUPER_ADMIN）。
 */
import { useState, useEffect, useRef } from "react";
import { X, ChevronDown } from "lucide-react";
import { authHttp } from "@/api/core/authHttp";

interface ReviewerRecord {
  id: string;
  username?: string;
  displayNickname?: string;
}

interface StaffReviewerPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function StaffReviewerPicker({ value, onChange, placeholder }: StaffReviewerPickerProps) {
  const [reviewers, setReviewers] = useState<ReviewerRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedIds: string[] = (() => { try { return JSON.parse(value || "[]"); } catch { return []; } })();
  const selected = reviewers.filter(r => selectedIds.includes(r.id));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await authHttp.get<{ success: boolean; data: ReviewerRecord[] }>("/material/admin/eligible-reviewers");
        if (cancelled) return;
        setReviewers(res.data?.data ?? []);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = reviewers.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.username || "").toLowerCase().includes(q) ||
           (r.id || "").toLowerCase().includes(q) ||
           (r.displayNickname || "").toLowerCase().includes(q);
  });

  function toggle(id: string) {
    const next = selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id];
    onChange(JSON.stringify(next));
  }
  function remove(id: string) { onChange(JSON.stringify(selectedIds.filter(i => i !== id))); }

  function displayName(r: ReviewerRecord) { return r.displayNickname || r.username || r.id; }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-1 min-h-[32px] rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 cursor-text" onClick={() => setOpen(!open)}>
        {selected.length === 0 && <span className="text-xs text-[var(--twin-mute)]">{placeholder || "点击选择审核人..."}</span>}
        {selected.map(r => (
          <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] text-blue-700">
            {displayName(r)}
            <button type="button" onClick={(e) => { e.stopPropagation(); remove(r.id); }} className="hover:text-red-500"><X className="size-3" /></button>
          </span>
        ))}
        <ChevronDown className="size-3.5 text-[var(--twin-mute)] ml-auto shrink-0" />
      </div>
      {open && (
        <div className="absolute z-[var(--z-dropdown)] mt-1 w-full max-h-[240px] overflow-hidden rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-3">
          <input className="w-full border-b border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-ink)] bg-[var(--twin-canvas-soft)] outline-none" placeholder="搜索..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          <div className="overflow-y-auto max-h-[200px]">
            {loading ? <p className="text-xs text-[var(--twin-mute)] text-center py-4">加载中...</p> :
             filtered.length === 0 ? <p className="text-xs text-[var(--twin-mute)] text-center py-4">无匹配人员</p> :
             filtered.map(r => {
               const sel = selectedIds.includes(r.id);
               return (
                 <button key={r.id} type="button" className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-[var(--twin-canvas-soft)] ${sel ? "bg-blue-50" : ""}`} onClick={() => toggle(r.id)}>
                   <span className="font-medium text-[var(--twin-ink)]">{displayName(r)}</span>
                   {sel && <span className="text-[11px] text-blue-600 font-medium">已选</span>}
                 </button>
               );
             })}
          </div>
        </div>
      )}
    </div>
  );
}
