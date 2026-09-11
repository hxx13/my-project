import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { adminInputClass } from "@/features/admin/adminFormUi";
import { Portal } from "@/components/Portal";
import { cn } from "@/lib/utils";
import { authHttp } from "@/api/core/authHttp";
import { fetchMyGroupMembers, type GroupMemberOption } from "@/api/domains/referenceData.api";
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

/**
 * 通用人员选择弹窗。
 *
 * 两种模式：
 * - 默认（不传 groupNames）：学生/教职工分 tab + 搜索 + 多选，走 `/admin/personnel`，仅管理员可用。
 * - 传 groupNames：限定课题组模式，走 `/reference-data/group-members`（只能取调用者本人课题组，
 *   服务端不接受课题组参数），无 tab、无分页，普通成员即可用。
 *
 * `single` 控制单选：选中新的一项即替换，用于「领用人」这类单值场景。
 */
export function PersonnelPicker({
  groupNames,
  single = false,
  onClose,
  onConfirm,
}: {
  perspective?: string;
  initialIds?: string[];
  /** 传非空数组即进入「限定课题组」模式 */
  groupNames?: string[];
  /** 单选：选中即替换（仍走同一个 onConfirm 契约，数组长度为 1） */
  single?: boolean;
  onClose: () => void;
  onConfirm: (ids: string[], names: string[]) => void;
}) {
  const groupMode = !!groupNames && groupNames.length > 0;
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

  // 限定课题组模式：一次取回本人课题组成员（数据量小，前端过滤即可）
  const [groupRows, setGroupRows] = useState<PersonnelRow[]>([]);
  useEffect(() => {
    if (!groupMode) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const list: GroupMemberOption[] = await fetchMyGroupMembers();
        if (cancelled) return;
        setGroupRows(list.map((m) => ({
          id: m.accountId,
          name: m.name,
          jobNumber: m.jobNumber || "",
          role: "",
          departmentName: "",
          contactEmail: "",
          sendKey: "",
        })));
      } catch { if (!cancelled) setGroupRows([]); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [groupMode]);

  // Fetch personnel when on STUDENT tab（非课题组模式）
  useEffect(() => {
    if (groupMode) return;
    if (tab !== "STUDENT") return;
    fetchPage(debouncedKeyword, 1, true);
  }, [fetchPage, debouncedKeyword, tab, groupMode]);

  // Fetch system-only users
  useEffect(() => {
    if (groupMode) return;
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
  }, [debouncedKeyword, tab, groupMode]);

  const nextPage = Math.floor(allRows.length / PAGE_SIZE) + 1;
  const hasMore = !groupMode && tab === "STUDENT" && allRows.length < total;

  const filtered = useMemo(() => {
    if (groupMode) {
      const k = debouncedKeyword.toLowerCase();
      return k ? groupRows.filter(r => r.name.toLowerCase().includes(k) || r.jobNumber.toLowerCase().includes(k)) : groupRows;
    }
    if (tab === "STUDENT") return allRows;
    return systemRows;
  }, [allRows, systemRows, tab, groupMode, groupRows, debouncedKeyword]);

  const toggle = (row: PersonnelRow) => {
    setSelected((prev) => {
      if (single) return new Map([[row.id, row]]);
      const next = new Map(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });
  };

  const busy = loading || sysLoading;

  // 必须 portal 到 body：本组件常从另一个 modal（如选购弹窗）里唤起，
  // 若留在原位置的 stacking context 内会被那个 modal 盖住。层级取 --z-modal 之上。
  return (
    <Portal>
    <div className="fixed inset-0 z-[900] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-[var(--app-color-text-primary)] mb-3">从人员库选择</h3>

        {!groupMode && (
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
        )}

        {groupMode && (
          <div className="mb-3 text-[11px] text-[var(--app-color-text-tertiary)]">
            课题组：{groupNames?.join("、")}
          </div>
        )}

        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--app-color-text-tertiary)]" />
          <input className={cn(adminInputClass, "pl-8")} placeholder="搜索姓名或工号"
            value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>

        <div className="max-h-[300px] overflow-auto space-y-1 mb-3">
          {busy && filtered.length === 0 ? (
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
                    checked ? "bg-[color-mix(in_srgb,var(--app-color-accent)_10%,transparent)]" : "hover:bg-[var(--app-color-surface-hover)]")}>
                    <input type={single ? "radio" : "checkbox"} checked={checked} onChange={() => toggle(row)}
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
    </Portal>
  );
}
