import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { adminInputClass } from "@/features/admin/adminFormUi";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { authHttp } from "@/api/core/authHttp";
import { fetchMyGroupMembers, type GroupMemberOption } from "@/api/domains/referenceData.api";
import { fetchMemberCandidates } from "@/api/domains/cageShelf.api";
import { Search, Check, Mail, MessageSquareText } from "lucide-react";

export interface PersonnelRow {
  id: string;
  name: string;
  jobNumber: string;
  role: string;
  departmentName: string;
  contactEmail: string;
  sendKey: string;
  /** 身份标签（饲养员/饲养组长/实验员…）；只有「区域组员」模式会带上 */
  identities?: Array<{ code: string; label: string }>;
  /** 已被哪位饲养组长纳入；有值 = 不可选（一人只能属于一个组） */
  boundLeaderName?: string | null;
}

/**
 * 通用人员选择弹窗。
 *
 * 三种模式（优先级：identityCode > groupNames > 默认）：
 * - 默认（都不传）：学生/教职工分 tab + 搜索 + 多选，走 `/admin/personnel`、`/admin/system-users`，
 *   两个接口都要求**管理员**。
 * - 传 groupNames：限定课题组模式，走 `/reference-data/group-members`（只能取调用者本人课题组，
 *   服务端不接受课题组参数），无 tab、无分页，普通成员即可用。
 * - 传 identityCode：**按身份取候选人**，走 `/cage-region/member-candidates`。只列持有该身份的人，
 *   每行带他的全部身份标签。加组员传 BREEDER（饲养员），可见范围分配传 BREEDING_GROUP_LEADER（饲养组长）。
 *
 * `single` 控制单选：选中新的一项即替换，用于「领用人」这类单值场景。
 */
export function PersonnelPicker({
  groupNames,
  single = false,
  identityCode,
  identityLabel,
  excludeGroupedByOthers = false,
  onClose,
  onConfirm,
}: {
  perspective?: string;
  initialIds?: string[];
  /** 传非空数组即进入「限定课题组」模式 */
  groupNames?: string[];
  /** 单选：选中即替换（仍走同一个 onConfirm 契约，数组长度为 1） */
  single?: boolean;
  /** 按身份取候选人：只列持有该身份码的人（如 BREEDER / BREEDING_GROUP_LEADER） */
  identityCode?: string;
  /** 身份的中文名，仅用于顶部提示文案 */
  identityLabel?: string;
  /**
   * 一人一组：已被别的饲养组长纳入的人置灰不可选。
   * **只有「加组员」该开**——可见范围分配选的是饲养组长，他同时是别人组员并不冲突。
   */
  excludeGroupedByOthers?: boolean;
  onClose: () => void;
  onConfirm: (ids: string[], names: string[]) => void;
}) {
  const pickMode = !!identityCode;
  const groupMode = !!groupNames && groupNames.length > 0;
  /** 这两种模式都不走默认的「学生/教职工」分页接口，各自有专属数据源。 */
  const customSource = groupMode || pickMode;
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
      // 三个字段名都认：`/admin/personnel` 回的是 {list,total}，`/admin/system-users` 回的是 {data,total}，
      // 裸数组是旧口径。只认 data 的话人员库那条恒为空 —— 列表永远「无结果」。
      const rows: PersonnelRow[] = Array.isArray(paged?.list) ? paged.list
        : Array.isArray(paged?.data) ? paged.data
        : (Array.isArray(paged) ? paged : []);
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

  // 按身份取候选人：一次取回全部（持有该身份的人量小，前端过滤即可）
  const [pickRows, setPickRows] = useState<PersonnelRow[]>([]);
  useEffect(() => {
    if (!identityCode) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const list = await fetchMemberCandidates(identityCode);
        if (cancelled) return;
        setPickRows(list.map((c) => ({
          id: c.accountId,
          name: c.name,
          jobNumber: c.jobNumber || "",
          role: "",
          departmentName: "",
          contactEmail: "",
          sendKey: "",
          identities: c.identities,
          boundLeaderName: c.boundLeaderName,
        })));
      } catch { if (!cancelled) setPickRows([]); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [identityCode]);

  // Fetch personnel when on STUDENT tab（非课题组模式）
  useEffect(() => {
    if (customSource) return;
    if (tab !== "STUDENT") return;
    fetchPage(debouncedKeyword, 1, true);
  }, [fetchPage, debouncedKeyword, tab, customSource]);

  // Fetch system-only users
  useEffect(() => {
    if (customSource) return;
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
  }, [debouncedKeyword, tab, customSource]);

  const nextPage = Math.floor(allRows.length / PAGE_SIZE) + 1;
  const hasMore = !customSource && tab === "STUDENT" && allRows.length < total;

  const filtered = useMemo(() => {
    const k = debouncedKeyword.toLowerCase();
    const match = (r: PersonnelRow) =>
      !k || r.name.toLowerCase().includes(k) || r.jobNumber.toLowerCase().includes(k);
    // 这两种模式的数据一次取全，过滤在前端——数据量小，且能即时响应输入
    if (pickMode) return pickRows.filter(match);
    if (groupMode) return groupRows.filter(match);
    if (tab === "STUDENT") return allRows;
    return systemRows;
  }, [allRows, systemRows, tab, groupMode, groupRows, pickRows, pickMode, debouncedKeyword]);

  const toggle = (row: PersonnelRow) => {
    // 一人一组：已被别的饲养组长纳入的人不可选（服务端也会拒），点它只是空转
    if (excludeGroupedByOthers && row.boundLeaderName) return;
    setSelected((prev) => {
      if (single) return new Map([[row.id, row]]);
      const next = new Map(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });
  };

  const busy = loading || sysLoading;

  // 一律走通用 Dialog（Radix）。手写 fixed 遮罩那版没有真遮罩、也没有自己的 dismissable
  // layer：本组件常从另一个 modal 里唤起，父弹窗的「点外面就关」会把整个手写层当成外部点击
  // —— 表现就是「点选人弹窗，父弹窗被穿透/连带关掉」。Radix 嵌套弹层自带这层判定，
  // 加上 ui/dialog.tsx 里遮罩同带 data-modal-layer，内层遮罩只关内层。
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        aria-describedby={undefined}
        /* 内容与遮罩一起抬到 --z-modal-nested：本组件常从**手写遮罩的弹窗**（订购页规格弹窗，
           --z-modal-above）里唤起，而 Radix 把内容 portal 到 body，两者是同级兄弟、分不出祖孙。
           只抬内容不抬遮罩的话，点弹窗外面会落到下面那层遮罩上，把父弹窗一起关掉。 */
        overlayClassName="z-[var(--z-modal-nested)]"
        className="z-[var(--z-modal-nested)] w-[calc(100vw-2rem)] max-w-lg gap-0 border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 text-[var(--app-color-text-primary)]"
      >
        <DialogTitle className="mb-3 text-sm font-bold text-[var(--app-color-text-primary)]">从人员库选择</DialogTitle>

        {!customSource && (
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

        {pickMode && (
          <div className="mb-3 text-[11px] text-[var(--app-color-text-tertiary)]">
            只列{identityLabel || identityCode}身份的人。
            {excludeGroupedByOthers ? "一个人只能属于一个饲养组长，已被纳入的人不可勾选。" : ""}
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
                const taken = excludeGroupedByOthers && !!row.boundLeaderName;
                return (
                  <label key={row.id} title={taken ? `已在 ${row.boundLeaderName} 的组` : undefined} className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors text-xs",
                    taken ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer",
                    !taken && (checked ? "bg-[color-mix(in_srgb,var(--app-color-accent)_10%,transparent)]" : "hover:bg-[var(--app-color-surface-hover)]"))}>
                    <input type={single ? "radio" : "checkbox"} checked={checked} disabled={taken} onChange={() => toggle(row)}
                      className="h-3.5 w-3.5 rounded accent-[var(--app-color-accent)]" />
                    <span className="font-medium min-w-[60px]">{row.name}</span>
                    <span className="text-[var(--app-color-text-tertiary)]">{row.jobNumber}</span>
                    <span className="text-[var(--app-color-text-tertiary)] truncate">{row.departmentName}</span>
                    {/* 身份标签：组长靠它判断该不该加这个人（池子已限定饲养员，但一人可能还有别的身份） */}
                    {row.identities?.map((t) => (
                      <span key={t.code}
                        className="shrink-0 rounded-full border border-[var(--app-color-border-default)] px-1.5 py-px text-[10px] leading-4 text-[var(--app-color-text-tertiary)]">
                        {t.label}
                      </span>
                    ))}
                    {taken && (
                      <span className="ml-auto shrink-0 text-[10px] text-[var(--app-color-text-tertiary)]">
                        已在 {row.boundLeaderName} 的组
                      </span>
                    )}
                    {!taken && row.contactEmail && <Mail className="h-3 w-3 text-[var(--app-color-feedback-success)] shrink-0" />}
                    {!taken && row.sendKey && <MessageSquareText className="h-3 w-3 text-[var(--app-color-feedback-success)] shrink-0" />}
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
      </DialogContent>
    </Dialog>
  );
}
