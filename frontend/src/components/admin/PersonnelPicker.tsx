import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { adminInputClass } from "@/features/admin/adminFormUi";
import { cn } from "@/lib/utils";
import { authHttp } from "@/api/core/authHttp";
import { Search, Check, Mail, MessageSquareText } from "lucide-react";

export interface PersonnelRow {
  id: string;
  name: string;
  jobNumber: string;
  role: string;
  departmentName: string;
  contactEmail: string;
  sendKey: string;
}

/** 通用人员选择弹窗 — 学生/教职工分 tab + 搜索 + 多选 */
export function PersonnelPicker({
  onClose,
  onConfirm,
}: {
  perspective?: string;
  initialIds?: string[];
  onClose: () => void;
  onConfirm: (ids: string[], names: string[]) => void;
}) {
  const [tab, setTab] = useState<"STUDENT" | "STAFF">("STUDENT");
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [selected, setSelected] = useState<Map<string, PersonnelRow>>(new Map());
  const [allRows, setAllRows] = useState<PersonnelRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [systemRows, setSystemRows] = useState<PersonnelRow[]>([]);
  const [sysLoading, setSysLoading] = useState(false);
  const PAGE_SIZE = 50;

  // Debounce keyword input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword.trim()), 250);
    return () => clearTimeout(timer);
  }, [keyword]);

  const fetchPage = useCallback(async (kw: string, pg: number, reset: boolean) => {
    setLoading(true);
    try {
      const res = await authHttp.get("/admin/personnel", { params: { keyword: kw || undefined, page: pg, size: PAGE_SIZE } });
      const paged: any = res.data?.data;
      const rows: PersonnelRow[] = Array.isArray(paged?.data) ? paged.data : (Array.isArray(paged) ? paged : []);
      setAllRows(prev => {
        const merged = reset ? rows : [...prev, ...rows];
        const seen = new Set<string>();
        return merged.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
      });
      setTotal(paged?.total ?? rows.length);
    } catch { if (reset) setAllRows([]); }
    finally { setLoading(false); }
  }, []);

  // Fetch personnel when on STUDENT tab
  useEffect(() => {
    if (tab !== "STUDENT") return;
    fetchPage(debouncedKeyword, 1, true);
  }, [fetchPage, debouncedKeyword, tab]);

  // Fetch system-only users
  useEffect(() => {
    if (tab !== "STAFF") return;
    let cancelled = false;
    (async () => {
      setSysLoading(true);
      try {
        const res = await authHttp.get("/admin/system-users", {
          params: { keyword: debouncedKeyword || undefined, page: 1, size: 200 },
        });
        if (cancelled) return;
        const paged: any = res.data?.data;
        const rows: any[] = Array.isArray(paged?.data) ? paged.data : (Array.isArray(paged) ? paged : []);
        const mapped: PersonnelRow[] = rows.map((r: any) => ({
          id: r.id,
          name: r.displayNickname || r.username || "",
          jobNumber: r.username || "",
          role: r.role || "STAFF",
          departmentName: "",
          contactEmail: "",
          sendKey: "",
        }));
        setSystemRows(mapped);
      } catch { if (!cancelled) setSystemRows([]); }
      finally { if (!cancelled) setSysLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [debouncedKeyword, tab]);

  const nextPage = Math.floor(allRows.length / PAGE_SIZE) + 1;
  const hasMore = tab === "STUDENT" && allRows.length < total;

  const filtered = useMemo(() => {
    if (tab === "STUDENT") return allRows;
    return systemRows;
  }, [allRows, systemRows, tab]);

  const toggle = (row: PersonnelRow) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-[var(--app-color-text-primary)] mb-3">从人员库选择</h3>

        <div className="flex gap-1 mb-3 rounded-lg bg-[var(--app-color-surface-hover)] p-0.5">
          {(["STUDENT", "STAFF"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cn("flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t ? "bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] shadow-sm"
                          : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]")}>
              {t === "STUDENT" ? "学生" : "教职工"}
            </button>
          ))}
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--app-color-text-tertiary)]" />
          <input className={cn(adminInputClass, "pl-8")} placeholder="搜索姓名或工号"
            value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>

        <div className="max-h-[300px] overflow-auto space-y-1 mb-3">
          {(loading || sysLoading) && filtered.length === 0 ? (
            <p className="text-xs text-[var(--app-color-text-tertiary)] text-center py-8">搜索中…</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-[var(--app-color-text-tertiary)] text-center py-8">无结果</p>
          ) : (
            <>
              {filtered.map((row) => {
                const checked = selected.has(row.id);
                return (
                  <label key={row.id} className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors text-xs",
                    checked ? "bg-[var(--app-color-accent)]/10" : "hover:bg-[var(--app-color-surface-hover)]")}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(row)}
                      className="h-3.5 w-3.5 rounded accent-[var(--app-color-accent)]" />
                    <span className="font-medium min-w-[60px]">{row.name}</span>
                    <span className="text-[var(--app-color-text-tertiary)]">{row.jobNumber}</span>
                    <span className="text-[var(--app-color-text-tertiary)] truncate">{row.departmentName}</span>
                    {row.contactEmail && <Mail className="h-3 w-3 text-[var(--app-color-feedback-success)] shrink-0" />}
                    {row.sendKey && <MessageSquareText className="h-3 w-3 text-[var(--app-color-feedback-success)] shrink-0" />}
                  </label>
                );
              })}
              {hasMore && (
                <button type="button" onClick={() => fetchPage(debouncedKeyword, nextPage, false)} disabled={loading}
                  className="w-full py-1.5 text-xs text-[var(--app-color-accent)] hover:bg-[var(--app-color-surface-hover)] rounded transition-colors">
                  {loading ? "加载中…" : `加载更多 (${allRows.length}/${total})`}
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--app-color-border-default)] pt-3">
          <span className="text-xs text-[var(--app-color-text-tertiary)]">已选 {selected.size} 人</span>
          <div className="flex gap-2">
            <AdminButton type="button" tone="ghost" size="sm" onClick={onClose}>取消</AdminButton>
            <AdminButton type="button" tone="primary" size="sm"
              onClick={() => onConfirm(Array.from(selected.keys()), Array.from(selected.values()).map(r => r.name))}>
              <Check className="h-3.5 w-3.5" /> 确定
            </AdminButton>
          </div>
        </div>
      </div>
    </div>
  );
}
