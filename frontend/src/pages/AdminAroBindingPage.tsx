import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { ChevronDown, ChevronLeft, Users, Clock, MapPin, Loader2, Check, X, RefreshCw, Search, Pencil, ShieldCheck, ShieldX, CheckCircle2, XCircle, KeyRound, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminHttp } from "@/api/core/adminHttp";
import { fetchAroFavorites, starAroSession, unstarAroSession } from "@/api/domains/aro-training.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";
import { Portal } from "@/components/Portal";
import { useCasBinding } from "@/features/auth/CasBindingContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { appConfirm } from "@/lib/appDialog";
interface TrainingSession { id: string; title: string; testContent: string; address: string; startTime: string; endTime: string; signNumber: number; signed: number; totalNumber: number; examinerName: string; examinerNumber: string; examState: number; examCertType: number; state: number; }
interface Trainee { examSignId: string; name: string; jobNumber: string; mobilePhone: string; projectGroupName: string; testYn: number; testFraction: number; userId: string; userJoinRooms: { areaName: string; floorName: string; name: string; id: string }[]; }
interface Area { id: number; name: string; }

const PAGE_SIZE = 20;

function SessionCount({ examId, total }: { examId: string; total: number }) {
  const { data } = useQuery({ queryKey: ["session-count", examId], queryFn: async () => { const r = await adminHttp.get(`/aro-training/sessions/${examId}/count`); return (r.data?.data || { total: 0, qualified: 0 }) as { total: number; qualified: number }; }, staleTime: 60_000 });
  const q = data?.qualified ?? 0; const t = data?.total || total;
  return <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /><span className={cn(q > 0 && "text-emerald-600 font-medium")}>{q}</span><span className="text-[var(--twin-mute)]">/ {t}</span></span>;
}

function stateBadge(s: number) {
  const m: Record<number, [string, string]> = { 1: ["未考试", "bg-neutral-100 text-neutral-600"], 2: ["已考完", "bg-blue-50 text-blue-700"], 3: ["已出成绩", "bg-emerald-50 text-emerald-700"] };
  const [l, c] = m[s] ?? ["—", "bg-neutral-100 text-neutral-500"];
  return <span className={cn("text-[11px] px-2 py-0.5 rounded font-medium", c)}>{l}</span>;
}

export default function AdminAroBindingPage() {
  const loc = useLocation(); const qc = useQueryClient();
  const label = useMemo(() => adminChromeTitle(loc.pathname), [loc.pathname]);
  const abortRef = useRef<AbortController | null>(null);

  const [areaTab, setAreaTab] = useState(0); const [sPage, setSPage] = useState(1);
  const [selected, setSelected] = useState<TrainingSession | null>(null); const [tPage, setTPage] = useState(1);
  const [tf, setTf] = useState({ pg: "", audit: "", score: "", search: "" });
  const [selTrainees, setSelTrainees] = useState<Set<string>>(new Set());
  const [selNames, setSelNames] = useState<string[]>([]);
  const [lastSync, setLastSync] = useState("");
  const [manualTimes, setManualTimes] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [roomPickers, setRoomPickers] = useState<Record<string, Set<string>>>({});
  const [roomNav, setRoomNav] = useState<{ area: string; floor: string } | null>(null);
  const [batchRoom, setBatchRoom] = useState(false);
  const { casStatus, openCasDialog } = useCasBinding();
  const [bindPromptOpen, setBindPromptOpen] = useState(false);

  const ensureCasBinding = (): boolean => {
    if (casStatus?.bound) return true;
    setBindPromptOpen(true);
    return false;
  };

  useEffect(() => { adminHttp.get("/aro-training/last-sync").then(r => { const d = r.data?.data; setLastSync(d?.lastSuccess || d?.lastRun || ""); }).catch(() => {}); }, []);
  useEffect(() => {
    if (!expanded) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-dt]') || t.closest('[data-dd]')) return;
      setExpanded(null);
      setBatchRoom(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [expanded]);

  const { data: areas } = useQuery({ queryKey: ["aro-areas"], queryFn: async () => { const r = await adminHttp.get("/aro-training/areas"); return (r.data?.data || []) as Area[]; }, staleTime: 5 * 60_000 });
  const { data: sd, isLoading: sl } = useQuery({ queryKey: ["aro-sessions", sPage], queryFn: async () => { const r = await adminHttp.get("/aro-training/sessions", { params: { pageNum: sPage, pageSize: PAGE_SIZE } }); return (r.data?.data || { list: [], total: 0, page: 0 }) as { list: TrainingSession[]; total: number; page: number }; }, placeholderData: (prev) => prev });
  const { data: td, isLoading: tl } = useQuery({ queryKey: ["aro-trainees", selected?.id, tPage, tf], enabled: !!selected?.id, queryFn: async () => { const p: Record<string, string | number> = { pageNum: tPage, pageSize: PAGE_SIZE }; if (tf.search) p.username = tf.search; if (tf.pg) p.projectGroupName = tf.pg; const r = await adminHttp.get(`/aro-training/sessions/${selected!.id}/trainees`, { params: p }); return (r.data?.data || { list: [], total: 0 }) as { list: Trainee[]; total: number }; }, placeholderData: (prev) => prev });
  const { data: allRooms } = useQuery({ queryKey: ["aro-rooms"], queryFn: async () => { const r = await adminHttp.get("/aro-training/rooms"); const d: any = r.data?.data; return (d?.list || d || []) as { id: string; name: string; areaName: string; floorName: string }[]; }, staleTime: 5 * 60_000 });

  // ── 收藏状态 ──
  const { data: favorites = [] } = useQuery({ queryKey: ["aro-favorites"], queryFn: fetchAroFavorites, staleTime: 30_000 });
  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const starMutation = useMutation({
    mutationFn: starAroSession,
    onMutate: async (sid: string) => {
      await qc.cancelQueries({ queryKey: ["aro-favorites"] });
      const prev = qc.getQueryData<string[]>(["aro-favorites"]) ?? [];
      qc.setQueryData<string[]>(["aro-favorites"], [...prev, sid]);
      return { prev };
    },
    onError: (_err, _sid, ctx) => {
      if (ctx?.prev) qc.setQueryData<string[]>(["aro-favorites"], ctx.prev);
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["aro-favorites"] }); },
  });

  const unstarMutation = useMutation({
    mutationFn: unstarAroSession,
    onMutate: async (sid: string) => {
      await qc.cancelQueries({ queryKey: ["aro-favorites"] });
      const prev = qc.getQueryData<string[]>(["aro-favorites"]) ?? [];
      qc.setQueryData<string[]>(["aro-favorites"], prev.filter((id) => id !== sid));
      return { prev };
    },
    onError: (_err, _sid, ctx) => {
      if (ctx?.prev) qc.setQueryData<string[]>(["aro-favorites"], ctx.prev);
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["aro-favorites"] }); },
  });

  const sessions = sd?.list ?? []; const sTotal = sd?.total ?? 0; const sPages = Math.max(1, Math.ceil(sTotal / PAGE_SIZE));
  // 收藏置顶排序
  const sortedSessions = useMemo(() => {
    const fav: TrainingSession[] = [];
    const non: TrainingSession[] = [];
    for (const s of sessions) {
      if (favSet.has(s.id)) fav.push(s); else non.push(s);
    }
    return [...fav, ...non];
  }, [sessions, favSet]);
  const hasFav = sortedSessions.some((s) => favSet.has(s.id));
  const lastFavIdx = hasFav ? sortedSessions.reduce((last, s, i) => favSet.has(s.id) ? i : last, -1) : -1;
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  useEffect(() => {
    let list = [...(td?.list ?? [])].map(t => ({ ...t, examSignId: String(t.examSignId ?? ''), userId: String(t.userId ?? '') }));
    if (tf.audit === '1') list = list.filter(t => t.testYn === 1);
    if (tf.audit === '0') list = list.filter(t => t.testYn !== 1);
    if (tf.score === '1') list = list.filter(t => t.testFraction === 1);
    if (tf.score === '0') list = list.filter(t => t.testFraction !== 1);
    const rank = (t: Trainee) => selTrainees.has(t.userId) ? 0 : t.testYn === 0 ? 1 : (t.userJoinRooms?.length || 0) > 0 ? 2 : 3;
    setTrainees([...list].sort((a, b) => rank(a) - rank(b)));
  }, [td, tf, selTrainees]);
  const tTotal = td?.total ?? 0; const tPages = Math.max(1, Math.ceil(tTotal / PAGE_SIZE));
  const pgs = useMemo(() => { const s = new Set<string>(); trainees.forEach(t => { if (t.projectGroupName) s.add(t.projectGroupName); }); return [...s].sort(); }, [trainees]);

  const doPost = async (url: string, body: object, ok: string) => { try { await adminHttp.post(url, body); toast.success(ok); qc.invalidateQueries(); } catch (e: any) { toast.error(e?.response?.data?.message || e?.message || "失败"); } };
  const handleAudit = async (eid: string, st: 1 | 2) => { if (!ensureCasBinding()) return; if (!await appConfirm(st === 1 ? "确定通过？" : "确定拒绝？")) return; doPost("/aro-training/audit", { examSignId: eid, state: st }, st === 1 ? "已通过" : "已拒绝"); };
  const handleScore = async (eid: string, yn: 1 | 2) => { if (!ensureCasBinding()) return; if (!await appConfirm(yn === 1 ? "评分合格？" : "评分不合格？")) return; doPost("/aro-training/score", { examSignId: eid, state: yn }, yn === 1 ? "合格" : "不合格"); };
  const toggleSel = (uid: string) => setSelTrainees(p => { const n = new Set(p); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
  const ddAnchorRef = useRef<DOMRect | null>(null);
  const toggleRoom = (uid: string, cur: string[], e?: React.MouseEvent) => { if (expanded === uid) { setExpanded(null); return; } const btn = (e?.currentTarget as HTMLElement); ddAnchorRef.current = btn?.getBoundingClientRect() ?? null; setExpanded(uid); setRoomPickers(p => ({ ...p, [uid]: new Set(cur) })); const groups: Record<string, string[]> = {}; allRooms?.forEach(r => { const a = r.areaName || '其他'; const f = r.floorName || '其他'; if (!groups[a]) groups[a] = []; if (!groups[a].includes(f)) groups[a].push(f); }); const defArea = groups["浦东"] ? "浦东" : Object.keys(groups)[0] || ''; const defFloor = defArea ? (groups[defArea]?.[0] || '') : ''; setRoomNav(defArea ? { area: defArea, floor: defFloor } : null); };
  const toggleRoomPick = (uid: string, rid: string) => setRoomPickers(p => { const s = new Set(p[uid] || []); s.has(rid) ? s.delete(rid) : s.add(rid); return { ...p, [uid]: s }; });
  const saveRooms = async (eid: string, uid: string) => { if (!ensureCasBinding()) return; try { await adminHttp.post("/aro-training/update-rooms", { examSignId: eid, userId: uid, roomIds: [...(roomPickers[uid] || [])] }); toast.success("已更新"); setExpanded(null); qc.invalidateQueries(); } catch (e: any) { toast.error(e?.message || "失败"); } };
  const openBatch = (e: React.MouseEvent) => { if (selTrainees.size === 0) { toast.error("请勾选"); return; } const btn = (e.currentTarget as HTMLElement); ddAnchorRef.current = btn?.getBoundingClientRect() ?? null; setBatchRoom(true); setExpanded("__batch__"); const groups: Record<string, string[]> = {}; allRooms?.forEach(r => { const a = r.areaName || '其他'; const f = r.floorName || '其他'; if (!groups[a]) groups[a] = []; if (!groups[a].includes(f)) groups[a].push(f); }); const defArea = groups["浦东"] ? "浦东" : Object.keys(groups)[0] || ''; const defFloor = defArea ? (groups[defArea]?.[0] || '') : ''; setRoomNav(defArea ? { area: defArea, floor: defFloor } : null); };
  const batchSave = async () => { if (!ensureCasBinding()) return; const uids = [...selTrainees]; const ids = [...(roomPickers["__batch__"] || [])]; if (ids.length === 0) { toast.error("请选择房间"); return; } let ok = 0; for (const uid of uids) { try { await adminHttp.post("/aro-training/update-rooms", { examSignId: selected?.id, userId: uid, roomIds: ids }); ok++; } catch {} } toast.success(`${ok}/${uids.length} 完成`); setBatchRoom(false); setExpanded(null); setSelTrainees(new Set()); qc.invalidateQueries(); };

  const roomDropdown = (uid: string, eid: string) => {
    const groups: Record<string, Record<string, { id: string; name: string }[]>> = {};
    allRooms?.forEach(r => { const a = r.areaName || '其他'; const f = r.floorName || '其他'; if (!groups[a]) groups[a] = {}; if (!groups[a][f]) groups[a][f] = []; groups[a][f].push(r); });
    const areas = Object.keys(groups); const sa = roomNav?.area || ''; const floors = sa && groups[sa] ? Object.keys(groups[sa]) : [];
    const sf = sa ? (roomNav?.floor && floors.includes(roomNav.floor) ? roomNav.floor : floors[0] || '') : ''; const rooms = sa && sf ? groups[sa]?.[sf] || [] : [];
    const pick = roomPickers[uid] || new Set<string>();
    const anchor = ddAnchorRef.current;
    const w = 416; // w-[26rem]
    const top = anchor ? Math.min(anchor.bottom + 4, window.innerHeight - 400 - 16) : window.innerHeight * 0.15;
    const left = anchor ? Math.max(32, Math.min(anchor.left, window.innerWidth - w - 32)) : (window.innerWidth - w) / 2;
    return (
      <Portal>
        <div className="fixed inset-0 z-50" onClick={() => setExpanded(null)}>
          <div data-dd className="absolute w-[26rem] max-w-[calc(100vw-4rem)]max-h-[75vh] flex flex-col rounded-xl shadow-xl overflow-hidden" style={{ top, left }} onClick={e => e.stopPropagation()}>
            <div className="px-3 py-2 text-[11px] font-medium bg-slate-100 text-[var(--app-color-text-secondary)] flex items-center justify-between shrink-0"><span>选择房间 · 已选 {pick.size}</span><button onClick={() => setExpanded(null)} className="text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]">✕</button></div>
            <div className="flex h-80 max-h-[60vh] bg-white">
              <div className="w-40 shrink-0 overflow-y-auto bg-slate-50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {areas.map(a => (<div key={a}>
                  <button onClick={() => setRoomNav(sa === a ? null : { area: a, floor: Object.keys(groups[a])[0] || '' })} className={cn("w-full text-left px-3 py-2 text-xs font-semibold flex justify-between", sa === a ? "bg-white" : "hover:bg-white")}>{a}<ChevronDown className={cn("h-3 w-3 transition-transform", sa === a && "rotate-180")} /></button>
                  {sa === a && Object.keys(groups[a]).map(f => (<button key={f} onClick={() => setRoomNav(p => p ? { ...p, floor: f } : null)} className={cn("w-full text-left pl-6 pr-2 py-1.5 text-[11px]", sf === f ? "bg-blue-50/60 text-blue-700 font-medium border-l-2 border-blue-400" : "text-[var(--twin-mute)] border-l-2 border-transparent hover:bg-white")}>{f}</button>))}
                </div>))}
              </div>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {rooms.map(r => { const ck = pick.has(r.id); return (<button key={r.id} onClick={() => toggleRoomPick(uid, r.id)} className={cn("w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-md text-sm", ck ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200/50" : "hover:bg-slate-50")}><span className={cn("shrink-0 w-4 h-4 rounded flex items-center justify-center", ck ? "bg-blue-500 text-white" : "border")}>{ck && <Check className="h-2.5 w-2.5" />}</span>{r.name}</button>); })}
              </div>
            </div>
            <div className="flex gap-2 px-3 py-2 shrink-0 bg-slate-50">
              <AdminButton type="button" tone="secondary" size="sm" className="flex-1" onClick={() => setExpanded(null)}>取消</AdminButton>
              <AdminButton type="button" tone="primary" size="sm" className="flex-1" onClick={() => saveRooms(eid, uid)}>保存</AdminButton>
            </div>
          </div>
        </div>
      </Portal>
    );
  };

  const doRefresh = async () => {
    const sid = selected?.id || ""; if (refreshing.has(sid)) { abortRef.current?.abort(); setRefreshing(p => { const n = new Set(p); n.delete(sid); return n; }); toast("已停止"); return; }
    const ctrl = new AbortController(); abortRef.current = ctrl; setRefreshing(p => new Set(p).add(sid));
    try { await adminHttp.post(`/aro-training/sessions/${sid}/refresh`, null, { signal: ctrl.signal, timeout: 120000 }); setManualTimes(p => ({ ...p, [sid]: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })); toast.success("同步完成"); qc.invalidateQueries(); }
    catch (e: any) { if (e?.code !== "ERR_CANCELED") toast.error(e?.message || "同步失败"); }
    finally { setRefreshing(p => { const n = new Set(p); n.delete(sid); return n; }); abortRef.current = null; }
  };

  const goBack = () => { setSelected(null); setSelTrainees(new Set()); setManualTimes({}); setRefreshing(new Set()); setTrainees([]); };
  const goDetail = (s: TrainingSession) => { setSelected(s); setTPage(1); setTf({ pg: "", audit: "", score: "", search: "" }); setSelNames([]); setSelTrainees(new Set()); setManualTimes({}); setRefreshing(new Set()); };

  const slist = (
    <div className="flex flex-col h-[calc(100dvh-var(--admin-chrome-offset))]">
      <AdminFormCard className="shrink-0 mb-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
          <h2 className="text-base font-bold text-[var(--app-color-text-primary)]">{label}{lastSync && <span className="ml-2 text-[11px] font-normal text-[var(--twin-mute)]">同步于 {lastSync}</span>}</h2>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          <button onClick={() => { setAreaTab(0); setSPage(1); }} className={cn("shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", areaTab === 0 ? "bg-[var(--app-color-accent)] text-[var(--app-color-accent-foreground)] shadow-sm" : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]")}>全部</button>
          {areas?.map(a => <button key={a.id} onClick={() => { setAreaTab(a.id); setSPage(1); }} className={cn("shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", areaTab === a.id ? "bg-[var(--app-color-accent)] text-[var(--app-color-accent-foreground)] shadow-sm" : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]")}>{a.name}</button>)}
        </div>
      </AdminFormCard>
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          {sl ? <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin mr-2" />加载中…</div>
            : <table className="w-full min-w-max text-left text-sm border-collapse">
              <thead className="border-b-2 border-[var(--app-color-border-strong)]"><tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold shadow-[var(--app-elevation-card)]">
                <th className="px-0 py-2 w-10"></th><th className="px-3 py-2">培训名称</th><th className="px-3 py-2">地点</th><th className="px-3 py-2">类型</th><th className="px-3 py-2">时间</th><th className="px-3 py-2">考官</th><th className="px-3 py-2">合格/总人数</th><th className="px-3 py-2">状态</th>
              </tr></thead>
              <tbody>
                {sortedSessions.length === 0 && !sl ? <tr><td colSpan={8} className="text-center py-8 text-sm text-[var(--app-color-text-tertiary)]">暂无培训场次</td></tr>
                  : sortedSessions.map((s, idx) => (<>
                    {/* 收藏/非收藏分隔线 */}
                    {idx === lastFavIdx + 1 && lastFavIdx >= 0 && (
                      <tr key="fav-sep" className="border-b border-[var(--app-color-border-default)]">
                        <td colSpan={8} className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <hr className="flex-1 border-t border-[var(--app-color-border-default)]" />
                            <span className="text-[10px] text-[var(--twin-mute)] shrink-0">未收藏</span>
                            <hr className="flex-1 border-t border-[var(--app-color-border-default)]" />
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr key={s.id} className="border-b hover:bg-[var(--twin-canvas-soft)] transition-colors">
                    <td className="px-0 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => favSet.has(s.id) ? unstarMutation.mutate(s.id) : starMutation.mutate(s.id)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded transition-colors hover:bg-[var(--twin-canvas-soft-2)]"
                        title={favSet.has(s.id) ? "取消收藏" : "收藏"}
                      >
                        <Star
                          className={cn("h-4 w-4 transition-colors", favSet.has(s.id) ? "fill-[var(--app-color-feedback-warning)] text-[var(--app-color-feedback-warning)]" : "text-[var(--twin-mute)] hover:text-[var(--app-color-feedback-warning)]")}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 cursor-pointer" onClick={() => goDetail(s)}><div className="font-medium text-[var(--app-color-text-primary)]">{s.title}</div><div className="text-[11px] text-[var(--twin-mute)] mt-0.5 line-clamp-1">{s.testContent}</div></td>
                    <td className="px-3 py-2.5 text-[var(--twin-mute)] whitespace-nowrap"><MapPin className="h-3 w-3 inline mr-1" />{s.address || "—"}</td>
                    <td className="px-3 py-2.5 text-[var(--twin-mute)]">{s.examCertType === 2 ? "手术培训" : "准入培训"}</td>
                    <td className="px-3 py-2.5 text-[var(--twin-mute)] whitespace-nowrap"><Clock className="h-3 w-3 inline mr-1" />{s.startTime}</td>
                    <td className="px-3 py-2.5 text-[var(--twin-mute)]">{s.examinerName || s.examinerNumber || "—"}</td>
                    <td className="px-3 py-2.5"><SessionCount examId={s.id} total={s.signNumber} /></td>
                    <td className="px-3 py-2.5">{stateBadge(s.examState)}</td>
                  </tr></>))}
              </tbody>
            </table>}
        </div>
        {sessions.length > 0 && <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-t border-[var(--app-color-border-default)] text-sm"><span className="text-xs text-[var(--app-color-text-tertiary)]">共 {sTotal} 条</span><div className="flex items-center gap-2"><AdminButton type="button" tone="secondary" size="sm" disabled={sPage <= 1} onClick={() => setSPage(p => p - 1)}>上一页</AdminButton><span className="text-xs text-[var(--app-color-text-secondary)]">{sPage} / {sPages}</span><AdminButton type="button" tone="secondary" size="sm" disabled={sPage >= sPages} onClick={() => setSPage(p => p + 1)}>下一页</AdminButton></div></div>}
      </div>
    </div>
  );

  const tdetail = (
    <div className="flex flex-col h-[calc(100dvh-var(--admin-chrome-offset))]">
      <AdminFormCard className="shrink-0 mb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <AdminButton type="button" tone="secondary" size="default" onClick={goBack}><ChevronLeft className="h-4 w-4 mr-1" />返回</AdminButton>
            <div className="min-w-0"><h2 className="text-base font-bold text-[var(--app-color-text-primary)] truncate">{selected?.title}</h2><p className="text-xs text-[var(--twin-mute)]">{selected?.examinerName} · {selected?.signNumber} 人 · {selected?.startTime}</p></div>
          </div>
          <div className="flex items-center gap-2 shrink-0 h-10 overflow-x-auto">
            <select value={tf.pg} onChange={e => { setTf(p => ({ ...p, pg: e.target.value })); setTPage(1); }} className="h-9 rounded border border-[var(--app-color-border-default)] bg-violet-50/50 px-3 text-sm min-w-[140px]"><option value="">全部课题组</option>{pgs.map(g => <option key={g} value={g}>{g}</option>)}</select>
            <select value={tf.audit} onChange={e => setTf(p => ({ ...p, audit: e.target.value }))} className="h-9 rounded border border-[var(--app-color-border-default)] bg-amber-50/50 px-3 text-sm min-w-[130px]"><option value="">全部审批</option><option value="1">已通过</option><option value="0">待审核/已拒绝</option></select>
            <select value={tf.score} onChange={e => setTf(p => ({ ...p, score: e.target.value }))} className="h-9 rounded border border-[var(--app-color-border-default)] bg-emerald-50/50 px-3 text-sm min-w-[130px]"><option value="">全部评分</option><option value="1">合格</option><option value="0">未评分/不合格</option></select>
            <div className={cn("flex items-center gap-1.5 h-9 rounded border border-[var(--app-color-border-default)] bg-sky-50/50 px-3 cursor-text min-w-[240px]", tf.search && "ring-1 ring-blue-300")}>
              <Search className="h-4 w-4 text-[var(--twin-mute)] shrink-0" />
              <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
                {selNames.map(n => <span key={n} className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded whitespace-nowrap flex items-center gap-0.5">{n}<button onClick={e => { e.stopPropagation(); setSelNames(p => p.filter(x => x !== n)); }} className="hover:text-blue-900">×</button></span>)}
                <input value={tf.search} onChange={e => { setTf(p => ({ ...p, search: e.target.value })); }} placeholder={selNames.length > 0 ? "" : "搜索姓名..."} className="flex-1 min-w-[60px] bg-transparent border-none outline-none text-sm" />
                {tf.search && <button onClick={() => { setTf(p => ({ ...p, search: '' })); setSelNames([]); }} className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"><X className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
            {selTrainees.size > 0 && (<div className="relative" data-dt><AdminButton type="button" tone="primary" size="default" className="text-sm" onClick={(e: any) => openBatch(e)}><Pencil className="h-4 w-4 mr-1" />房间权限({selTrainees.size})</AdminButton>
              {batchRoom && expanded === "__batch__" && roomDropdown("__batch__", "")}
            </div>)}
            <AdminButton type="button" tone={refreshing.has(selected?.id || "") ? "destructive" : "secondary"} size="sm" onClick={doRefresh}>
              {refreshing.has(selected?.id || "") ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />同步中…</> : <><RefreshCw className="h-4 w-4 mr-1" />刷新{manualTimes[selected?.id || ""] ? <span className="ml-1 text-[10px] opacity-70">{manualTimes[selected!.id]}{lastSync ? ` / ${lastSync.substring(11, 16)}` : ""}</span> : null}</>}
            </AdminButton>
          </div>
        </div>
      </AdminFormCard>
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          {tl ? <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin mr-2" />加载中…</div>
            : <table className="w-full min-w-max text-left text-sm border-collapse">
              <thead className="border-b-2 border-[var(--app-color-border-strong)]"><tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold shadow-[var(--app-elevation-card)]">
                <th className="px-2 py-2 w-8"><input type="checkbox" onChange={e => { if (e.target.checked) setSelTrainees(new Set(trainees.map(t => t.userId))); else setSelTrainees(new Set()); }} checked={selTrainees.size > 0 && selTrainees.size === trainees.length} /></th>
                <th className="px-3 py-2">姓名</th><th className="px-3 py-2">编号</th><th className="px-3 py-2">课题组</th><th className="px-3 py-2">电话</th><th className="px-3 py-2">允许房间</th><th className="px-3 py-2">审批</th><th className="px-3 py-2">评分</th>
              </tr></thead>
              <tbody>
                {trainees.length === 0 && !tl ? <tr><td colSpan={8} className="text-center py-8 text-sm text-[var(--app-color-text-tertiary)]">暂无受训人员</td></tr>
                  : trainees.map((t, idx) => (<tr key={t.examSignId || t.userId || `row-${idx}`} className={cn("border-b hover:bg-[var(--twin-canvas-soft)] transition-colors", selTrainees.has(t.userId) && "bg-blue-50/50")}>
                    <td className="px-2 py-2.5"><input type="checkbox" checked={selTrainees.has(t.userId)} onChange={() => toggleSel(t.userId)} /></td>
                    <td className="px-3 py-2.5 font-medium text-[var(--app-color-text-primary)]">{t.name}</td>
                    <td className="px-3 py-2.5 text-[var(--twin-mute)] font-mono text-xs">{t.jobNumber}</td>
                    <td className="px-3 py-2.5 text-[var(--twin-mute)] max-w-[160px] truncate">{t.projectGroupName}</td>
                    <td className="px-3 py-2.5 text-[var(--twin-mute)]">{t.mobilePhone}</td>
                    <td className="px-3 py-2.5 relative">
                      <div className="flex flex-wrap items-center gap-1">
                        {t.userJoinRooms?.length === 0 && <span className="text-[11px] text-[var(--twin-mute)]">无</span>}
                        {t.userJoinRooms?.map((r, i) => <span key={i} className="text-xs bg-[var(--app-color-surface-hover)] px-2 py-0.5 rounded whitespace-nowrap">{r.areaName} {r.name}</span>)}
                        <button data-dt onClick={(e) => { if (!t.userId) return; toggleRoom(t.userId, t.userJoinRooms?.map(r => r.id) || [], e); }} className={cn("shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors", expanded === t.userId ? "bg-blue-100 text-blue-700 font-medium" : "text-[var(--twin-mute)] hover:bg-[var(--app-color-surface-hover)]")}>{expanded === t.userId ? "选择中" : "修改"}</button>
                      </div>
                      {t.userId && expanded === t.userId && roomDropdown(t.userId, t.examSignId)}
                    </td>
                    <td className="px-3 py-2.5 relative">
                      <div className="relative inline-block">
                        <button data-dt onClick={() => { const k = `a-${t.examSignId || t.userId || 'unknown'}`; setExpanded(expanded === k ? null : k); }} className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded cursor-pointer transition-colors", t.testYn === 1 ? "text-emerald-600 bg-emerald-50" : t.testYn === 2 ? "text-rose-600 bg-rose-50" : "text-amber-600 bg-amber-50")}>{t.testYn === 1 ? <ShieldCheck className="h-3.5 w-3.5" /> : t.testYn === 2 ? <ShieldX className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}{t.testYn === 1 ? "已通过" : t.testYn === 2 ? "已拒绝" : "待审核"}</button>
                        {(() => { const k = `a-${t.examSignId || t.userId || 'unknown'}`; return expanded === k && <div data-dd className="absolute left-0 top-full mt-1 z-50 w-24 rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] shadow-lg py-0.5">{t.testYn !== 1 && <button onClick={() => { if (t.examSignId) handleAudit(t.examSignId, 1); setExpanded(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--app-color-surface-hover)] flex items-center gap-2 text-emerald-600"><ShieldCheck className="h-3.5 w-3.5" />通过</button>}{t.testYn !== 2 && <button onClick={() => { if (t.examSignId) handleAudit(t.examSignId, 2); setExpanded(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--app-color-surface-hover)] flex items-center gap-2 text-rose-600"><ShieldX className="h-3.5 w-3.5" />拒绝</button>}</div>; })()}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 relative">
                      <div className="relative inline-block">
                        <button data-dt onClick={() => { const k = `s-${t.examSignId || t.userId || 'unknown'}`; setExpanded(expanded === k ? null : k); }} className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded cursor-pointer transition-colors", t.testFraction === 1 ? "text-emerald-600 bg-emerald-50" : t.testFraction === 2 ? "text-rose-600 bg-rose-50" : "text-[var(--twin-mute)] bg-[var(--app-color-surface-hover)]")}>{t.testFraction === 1 ? <CheckCircle2 className="h-3.5 w-3.5" /> : t.testFraction === 2 ? <XCircle className="h-3.5 w-3.5" /> : null}{t.testFraction === 1 ? "合格" : t.testFraction === 2 ? "不合格" : "待评分"}</button>
                        {(() => { const k = `s-${t.examSignId || t.userId || 'unknown'}`; return expanded === k && <div data-dd className="absolute left-0 top-full mt-1 z-50 w-24 rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] shadow-lg py-0.5"><button onClick={() => { if (t.examSignId) handleScore(t.examSignId, 1); setExpanded(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--app-color-surface-hover)] flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />合格</button><button onClick={() => { if (t.examSignId) handleScore(t.examSignId, 2); setExpanded(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--app-color-surface-hover)] flex items-center gap-2 text-rose-600"><XCircle className="h-3.5 w-3.5" />不合格</button></div>; })()}
                      </div>
                    </td>
                  </tr>))}
              </tbody>
            </table>}
        </div>
        {trainees.length > 0 && <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-t border-[var(--app-color-border-default)] text-sm"><span className="text-xs text-[var(--app-color-text-tertiary)]">共 {tTotal} 人</span><div className="flex items-center gap-2"><AdminButton type="button" tone="secondary" size="sm" disabled={tPage <= 1} onClick={() => setTPage(p => p - 1)}>上一页</AdminButton><span className="text-xs text-[var(--app-color-text-secondary)]">{tPage} / {tPages}</span><AdminButton type="button" tone="secondary" size="sm" disabled={tPage >= tPages} onClick={() => setTPage(p => p + 1)}>下一页</AdminButton></div></div>}
      </div>
    </div>
  );

  return (
    <AdminPageShell>
      <div key={selected ? "detail" : "list"}>{selected ? tdetail : slist}</div>
      <Dialog open={bindPromptOpen} onOpenChange={setBindPromptOpen}>
        <DialogContent className="z-[var(--z-modal)] border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-primary)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>需要 ARO 个人认证</DialogTitle>
            <DialogDescription>
              您暂未绑定 ARO 个人认证 Token，无法进行修改操作。请在右上角头像菜单中绑定后再试。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <AdminButton type="button" tone="secondary" size="default" onClick={() => setBindPromptOpen(false)}>
              取消
            </AdminButton>
            <AdminButton type="button" tone="primary" size="default" onClick={() => {
              setBindPromptOpen(false);
              openCasDialog();
            }}>
              <KeyRound className="mr-2 h-4 w-4" />
              去绑定
            </AdminButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageShell>
  );
}
