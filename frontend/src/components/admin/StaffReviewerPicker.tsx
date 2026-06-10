/**
 * 审核人/复审人多选组件 — 从人员授权库中筛选教职工，标签式多选。
 * 输出 JSON 数组字符串（如 '["user1","user2"]'），兼容 MaterialItem.reviewerIds 格式。
 */
import { useState, useEffect, useRef } from "react";
import { X, ChevronDown } from "lucide-react";
import { adminHttp } from "@/api/core/adminHttp";

interface PersonnelRecord {
  id: string;
  name?: string;
  displayNickname?: string;
  role?: string;
  departmentName?: string;
}

interface StaffReviewerPickerProps {
  value: string;       // JSON array string e.g. '["id1","id2"]'
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function StaffReviewerPicker({ value, onChange, placeholder }: StaffReviewerPickerProps) {
  const [staff, setStaff] = useState<PersonnelRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 解析当前已选 ID 列表
  const selectedIds: string[] = (() => {
    try { return JSON.parse(value || "[]"); } catch { return []; }
  })();

  const selectedStaff = staff.filter(s => selectedIds.includes(s.id));

  // 加载人员列表
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await adminHttp.get<{ success: boolean; data: { data: PersonnelRecord[] } }>(
          "/personnel", { params: { page: 1, size: 500 } });
        if (cancelled) return;
        const rows = res.data?.data?.data ?? [];
        // 过滤教职工角色（非 STUDENT）
        const filtered = rows.filter(r => {
          const role = (r.role || "").toUpperCase();
          return role !== "STUDENT";
        });
        setStaff(filtered);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // 点击外部关闭
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = staff.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.name || "").toLowerCase().includes(q) ||
           (s.id || "").toLowerCase().includes(q) ||
           (s.departmentName || "").toLowerCase().includes(q);
  });

  function toggle(id: string) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter(i => i !== id)
      : [...selectedIds, id];
    onChange(JSON.stringify(next));
  }

  function remove(id: string) {
    onChange(JSON.stringify(selectedIds.filter(i => i !== id)));
  }

  return (
    <div ref={containerRef} className="relative">
      {/* 已选标签 + 展开按钮 */}
      <div
        className="flex flex-wrap items-center gap-1 min-h-[32px] rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 cursor-text"
        onClick={() => setOpen(!open)}
      >
        {selectedStaff.length === 0 && (
          <span className="text-xs text-[var(--twin-mute)]">{placeholder || "点击选择审核人..."}</span>
        )}
        {selectedStaff.map(s => (
          <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] text-blue-700">
            {s.name || s.displayNickname || s.id}
            <button type="button" onClick={(e) => { e.stopPropagation(); remove(s.id); }}
              className="hover:text-red-500"><X className="size-3" /></button>
          </span>
        ))}
        <ChevronDown className="size-3.5 text-[var(--twin-mute)] ml-auto" />
      </div>

      {/* 下拉面板 */}
      {open && (
        <div className="absolute z-[var(--z-dropdown)] mt-1 w-full max-h-[240px] overflow-hidden rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-3">
          <input
            className="w-full border-b border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-ink)] bg-[var(--twin-canvas-soft)] outline-none"
            placeholder="搜索姓名/工号/部门..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className="overflow-y-auto max-h-[200px]">
            {loading ? (
              <p className="text-xs text-[var(--twin-mute)] text-center py-4">加载中...</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-[var(--twin-mute)] text-center py-4">无匹配人员</p>
            ) : (
              filtered.map(s => {
                const sel = selectedIds.includes(s.id);
                return (
                  <button key={s.id} type="button"
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-[var(--twin-canvas-soft)] transition-colors ${sel ? "bg-blue-50" : ""}`}
                    onClick={() => toggle(s.id)}>
                    <span>
                      <span className="font-medium text-[var(--twin-ink)]">{s.name || s.displayNickname || s.id}</span>
                      {s.departmentName && <span className="text-[var(--twin-mute)] ml-1.5">{s.departmentName}</span>}
                    </span>
                    {sel && <span className="text-[11px] text-blue-600 font-medium">已选</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
