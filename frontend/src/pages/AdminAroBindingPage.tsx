import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { ChevronDown, ChevronLeft, Clock, MapPin, Loader2, Check, Search, Plus, RefreshCw, Star, ShieldCheck, ShieldX, CheckCircle2, XCircle, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";
import { Portal } from "@/components/Portal";
import { appConfirm } from "@/lib/appDialog";
import { authStorage } from "@/features/auth/authStorage";
import { fetchRoomMappingRooms, type RoomMappingRoomRow } from "@/api/twinApi";
import {
  fetchTrainings,
  fetchTraining,
  fetchTrainingFavorites,
  starTraining,
  unstarTraining,
  publishTraining,
  unpublishTraining,
  addEnrollments,
  auditEnrollment,
  scoreEnrollment,
  setEnrollmentRooms,
  syncTrainings,
  type TrainingSeries,
  type TrainingOccurrence,
  type TrainingEnrollment,
} from "@/api/domains/training.api";

const PAGE_SIZE = 20;

function typeLabel(t?: number | null): string {
  return t === 1 ? "准入培训" : t === 2 ? "手术培训" : "—";
}

function seriesStatusBadge(s?: string | null) {
  const m: Record<string, [string, string]> = {
    DRAFT: ["草稿", "bg-neutral-100 text-neutral-600"],
    PUBLISHED: ["已发布", "bg-emerald-50 text-emerald-700"],
  };
  const [l, c] = m[s ?? ""] ?? [s || "—", "bg-neutral-100 text-neutral-500"];
  return <span className={cn("text-[11px] px-2 py-0.5 rounded font-medium", c)}>{l}</span>;
}

/** 场次数：懒取详情（与详情视图共享同一 queryKey，进入详情时命中缓存）。 */
function OccurrenceCount({ id }: { id: number }) {
  const { data } = useQuery({
    queryKey: ["training", id],
    queryFn: () => fetchTraining(id),
    staleTime: 60_000,
  });
  return <span className="text-[var(--twin-mute)]">{data?.occurrences?.length ?? 0} 场</span>;
}

export default function AdminAroBindingPage() {
  const loc = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const label = useMemo(() => adminChromeTitle(loc.pathname), [loc.pathname]);

  const currentUserId = authStorage.getUserInfo()?.id ?? "";
  const isPlatformOwner = authStorage.getRole() === "PLATFORM_OWNER";

  const [sPage, setSPage] = useState(1);
  const [kwInput, setKwInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<TrainingSeries | null>(null);
  const [importOcc, setImportOcc] = useState<TrainingOccurrence | null>(null);
  const [occPage, setOccPage] = useState(1);

  const [gsearch, setGsearch] = useState("");
  const [expandedOccs, setExpandedOccs] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [roomPickers, setRoomPickers] = useState<Record<string, Set<string>>>({});
  const [roomNav, setRoomNav] = useState<{ area: string; floor: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncTrainings();
      toast.success("培训同步完成");
      qc.invalidateQueries({ queryKey: ["training-list"] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setKeyword(kwInput), 300);
    return () => clearTimeout(t);
  }, [kwInput]);

  useEffect(() => {
    if (!expanded) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-dt]") || t.closest("[data-dd]")) return;
      setExpanded(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [expanded]);

  const { data: sd, isLoading: sl } = useQuery({
    queryKey: ["training-list", sPage, keyword],
    queryFn: async () => fetchTrainings({ page: sPage, pageSize: PAGE_SIZE, keyword: keyword || undefined }),
    placeholderData: (prev) => prev,
  });
  const { data: detail, isLoading: dl } = useQuery({
    queryKey: ["training", selected?.id],
    queryFn: () => fetchTraining(selected!.id),
    enabled: !!selected,
  });
  const { data: allRooms } = useQuery({
    queryKey: ["training-rooms"],
    queryFn: async () => (await fetchRoomMappingRooms({ pageSize: 10000, includeChannels: false })).list,
    staleTime: 5 * 60_000,
  });
  const { data: favorites = [] } = useQuery({
    queryKey: ["training-favorites"],
    queryFn: fetchTrainingFavorites,
  });
  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const toggleFavorite = async (id: number) => {
    try {
      if (favSet.has(id)) await unstarTraining(id);
      else await starTraining(id);
      qc.invalidateQueries({ queryKey: ["training-favorites"] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "操作失败");
    }
  };

  const canWriteSeries = (s: TrainingSeries) => isPlatformOwner || currentUserId === s.ownerId;

  const seriesAction = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ["training-list"] });
      qc.invalidateQueries({ queryKey: ["training", selected?.id] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "操作失败");
    }
  };
  const handlePublish = (s: TrainingSeries) => seriesAction(() => publishTraining(s.id), "已发布");
  const handleUnpublish = (s: TrainingSeries) => seriesAction(() => unpublishTraining(s.id), "已取消发布");

  const series = sd?.list ?? [];
  const sTotal = sd?.total ?? 0;
  const sPages = Math.max(1, Math.ceil(sTotal / PAGE_SIZE));
  const canWrite = !!selected && (isPlatformOwner || currentUserId === selected.ownerId);

  const roomById = useMemo(() => {
    const m = new Map<string, RoomMappingRoomRow>();
    (allRooms ?? []).forEach((r) => r.roomId && !m.has(r.roomId) && m.set(r.roomId, r));
    return m;
  }, [allRooms]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ["training", selected?.id] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "失败");
    }
  };
  const handleAudit = async (id: number, st: 1 | 2) => {
    if (!(await appConfirm(st === 1 ? "确定通过？" : "确定拒绝？"))) return;
    run(() => auditEnrollment(id, st), st === 1 ? "已通过" : "已拒绝");
  };
  const handleScore = async (id: number, yn: 1 | 2) => {
    if (!(await appConfirm(yn === 1 ? "评分合格？" : "评分不合格？"))) return;
    run(() => scoreEnrollment(id, yn), yn === 1 ? "合格" : "不合格");
  };

  // ── 房间选择器 ──
  const ddAnchorRef = useRef<DOMRect | null>(null);
  const roomGroups = useMemo(() => {
    const groups: Record<string, Record<string, { id: string; name: string }[]>> = {};
    (allRooms ?? []).forEach((r) => {
      const a = r.regionName || "其他";
      const f = r.floorName || "其他";
      if (!groups[a]) groups[a] = {};
      if (!groups[a][f]) groups[a][f] = [];
      groups[a][f].push({ id: r.roomId, name: r.roomName || r.roomId });
    });
    return groups;
  }, [allRooms]);
  const defaultNav = () => {
    const areas = Object.keys(roomGroups);
    const defArea = roomGroups["浦东"] ? "浦东" : areas[0] || "";
    return defArea ? { area: defArea, floor: Object.keys(roomGroups[defArea])[0] || "" } : null;
  };
  const toggleRoom = (uid: string, cur: string[], e?: React.MouseEvent) => {
    if (expanded === uid) {
      setExpanded(null);
      return;
    }
    const btn = e?.currentTarget as HTMLElement;
    ddAnchorRef.current = btn?.getBoundingClientRect() ?? null;
    setExpanded(uid);
    setRoomPickers((p) => ({ ...p, [uid]: new Set(cur) }));
    setRoomNav(defaultNav());
  };
  const toggleRoomPick = (uid: string, rid: string) =>
    setRoomPickers((p) => {
      const s = new Set(p[uid] || []);
      s.has(rid) ? s.delete(rid) : s.add(rid);
      return { ...p, [uid]: s };
    });
  const saveRooms = async (eid: number, uid: string) => {
    await run(() => setEnrollmentRooms(eid, [...(roomPickers[uid] || [])]), "已更新");
    setExpanded(null);
  };

  const roomDropdown = (uid: string, eid: number) => {
    const areas = Object.keys(roomGroups);
    const sa = roomNav?.area || "";
    const floors = sa && roomGroups[sa] ? Object.keys(roomGroups[sa]) : [];
    const sf = sa ? (roomNav?.floor && floors.includes(roomNav.floor) ? roomNav.floor : floors[0] || "") : "";
    const rooms = sa && sf ? roomGroups[sa]?.[sf] || [] : [];
    const pick = roomPickers[uid] || new Set<string>();
    const anchor = ddAnchorRef.current;
    const w = 416;
    const top = anchor ? Math.min(anchor.bottom + 4, window.innerHeight - 400 - 16) : window.innerHeight * 0.15;
    const left = anchor ? Math.max(32, Math.min(anchor.left, window.innerWidth - w - 32)) : (window.innerWidth - w) / 2;
    return (
      <Portal>
        <div className="fixed inset-0 z-50" onClick={() => setExpanded(null)}>
          <div data-dd className="absolute w-[26rem] max-w-[calc(100vw-4rem)]max-h-[75vh] flex flex-col rounded-xl shadow-xl overflow-hidden" style={{ top, left }} onClick={(e) => e.stopPropagation()}>
            <div className="px-3 py-2 text-[11px] font-medium bg-slate-100 text-[var(--app-color-text-secondary)] flex items-center justify-between shrink-0"><span>选择房间 · 已选 {pick.size}</span><button onClick={() => setExpanded(null)} className="text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]">✕</button></div>
            <div className="flex h-80 max-h-[60vh] bg-white">
              <div className="w-40 shrink-0 overflow-y-auto bg-slate-50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {areas.map((a) => (
                  <div key={a}>
                    <button onClick={() => setRoomNav(sa === a ? null : { area: a, floor: Object.keys(roomGroups[a])[0] || "" })} className={cn("w-full text-left px-3 py-2 text-xs font-semibold flex justify-between", sa === a ? "bg-white" : "hover:bg-white")}>{a}<ChevronDown className={cn("h-3 w-3 transition-transform", sa === a && "rotate-180")} /></button>
                    {sa === a && Object.keys(roomGroups[a]).map((f) => (
                      <button key={f} onClick={() => setRoomNav((p) => (p ? { ...p, floor: f } : null))} className={cn("w-full text-left pl-6 pr-2 py-1.5 text-[11px]", sf === f ? "bg-blue-50/60 text-blue-700 font-medium border-l-2 border-blue-400" : "text-[var(--twin-mute)] border-l-2 border-transparent hover:bg-white")}>{f}</button>
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {rooms.map((r) => {
                  const ck = pick.has(r.id);
                  return (
                    <button key={r.id} onClick={() => toggleRoomPick(uid, r.id)} className={cn("w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-md text-sm", ck ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200/50" : "hover:bg-slate-50")}><span className={cn("shrink-0 w-4 h-4 rounded flex items-center justify-center", ck ? "bg-blue-500 text-white" : "border")}>{ck && <Check className="h-2.5 w-2.5" />}</span>{r.name}</button>
                  );
                })}
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

  // ── 导入学员 ──
  const doImport = async () => {
    if (!importOcc) return;
    const rows = importText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[\s,，]+/).filter(Boolean);
        return { name: parts[0] ?? "", jobNumber: parts[1] ?? "", projectGroup: parts.slice(2).join(" ") || undefined };
      })
      .filter((r) => r.name);
    if (rows.length === 0) {
      toast.error("请按「姓名 编号 课题组」每行一条填写");
      return;
    }
    await run(() => addEnrollments(importOcc.id, rows), `已导入 ${rows.length} 人`);
    setImportOpen(false);
    setImportText("");
  };

  const goList = () => {
    setSelected(null);
    setImportOcc(null);
    setExpanded(null);
    setImportOpen(false);
    setGsearch("");
    setExpandedOccs(new Set());
    setOccPage(1);
  };
  const goDetail = (s: TrainingSeries) => {
    setSelected(s);
    setImportOcc(null);
    setExpanded(null);
    setGsearch("");
    setExpandedOccs(new Set());
    setOccPage(1);
  };

  const slist = (
    <div className="flex flex-col h-[calc(100dvh-var(--admin-chrome-offset))]">
      <AdminFormCard className="shrink-0 mb-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
          <h2 className="text-base font-bold text-[var(--app-color-text-primary)]">{label}</h2>
          <div className="flex items-center gap-2">
            <div className={cn("flex items-center gap-1.5 h-9 rounded border border-[var(--app-color-border-default)] bg-sky-50/50 px-3 cursor-text min-w-[220px]", kwInput && "ring-1 ring-blue-300")}>
              <Search className="h-4 w-4 text-[var(--twin-mute)] shrink-0" />
              <input value={kwInput} onChange={(e) => { setKwInput(e.target.value); setSPage(1); }} placeholder="搜索名称/编号..." className="flex-1 min-w-[60px] bg-transparent border-none outline-none text-sm" />
              {kwInput && <button onClick={() => setKwInput("")} className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <AdminButton type="button" tone="secondary" size="default" disabled={syncing} onClick={handleSync}>{syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}同步培训</AdminButton>
            <AdminButton type="button" tone="primary" size="default" onClick={() => navigate("/console/admin/training/new")}><Plus className="h-4 w-4 mr-1" />发布培训</AdminButton>
          </div>
        </div>
      </AdminFormCard>
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto [scrollbar-gutter:stable]">
          {sl ? <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin mr-2" />加载中…</div>
            : <table className="w-full min-w-max text-left text-sm border-collapse">
              <thead className="border-b-2 border-[var(--app-color-border-strong)]"><tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold">
                <th className="px-2 py-2 w-8"></th><th className="px-3 py-2">培训名称</th><th className="px-3 py-2">类型</th><th className="px-3 py-2">所属人</th><th className="px-3 py-2">场次</th><th className="px-3 py-2">状态</th><th className="px-3 py-2 text-right">操作</th>
              </tr></thead>
              <tbody>
                {series.length === 0 && !sl ? <tr><td colSpan={7} className="text-center py-8 text-sm text-[var(--app-color-text-tertiary)]">暂无培训</td></tr>
                  : series.map((s) => (
                    <tr key={s.id} className="border-b hover:bg-[var(--twin-canvas-soft)] transition-colors cursor-pointer" onClick={() => goDetail(s)}>
                      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => toggleFavorite(s.id)} className="p-1 rounded hover:bg-[var(--app-color-surface-hover)]" aria-label="收藏">
                          <Star className={cn("h-4 w-4", favSet.has(s.id) ? "fill-amber-400 text-amber-400" : "text-[var(--twin-mute)] hover:text-amber-400")} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5"><div className="font-medium text-[var(--app-color-text-primary)]">{s.name}</div><div className="text-[11px] text-[var(--twin-mute)] mt-0.5 line-clamp-1">{s.code || ""}</div></td>
                      <td className="px-3 py-2.5 text-[var(--twin-mute)]">{typeLabel(s.type)}</td>
                      <td className="px-3 py-2.5 text-[var(--twin-mute)] whitespace-nowrap">{s.ownerId || "—"}{s.ownerId === currentUserId && <span className="ml-1 text-[10px] text-blue-600">（我）</span>}</td>
                      <td className="px-3 py-2.5"><OccurrenceCount id={s.id} /></td>
                      <td className="px-3 py-2.5">{seriesStatusBadge(s.status)}</td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        {canWriteSeries(s) && (
                          <div className="flex items-center justify-end gap-1.5">
                            <AdminButton type="button" tone="secondary" size="sm" onClick={() => navigate(`/console/admin/training/edit/${s.id}`)}>编辑</AdminButton>
                            {s.status === "PUBLISHED" ? (
                              <AdminButton type="button" tone="secondary" size="sm" onClick={() => handleUnpublish(s)}>取消发布</AdminButton>
                            ) : s.status === "DRAFT" ? (
                              <AdminButton type="button" tone="primary" size="sm" onClick={() => handlePublish(s)}>发布</AdminButton>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>}
        </div>
        {series.length > 0 && <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-t border-[var(--app-color-border-default)] text-sm"><span className="text-xs text-[var(--app-color-text-tertiary)]">共 {sTotal} 条</span><div className="flex items-center gap-2"><AdminButton type="button" tone="secondary" size="sm" disabled={sPage <= 1} onClick={() => setSPage((p) => p - 1)}>上一页</AdminButton><span className="text-xs text-[var(--app-color-text-secondary)]">{sPage} / {sPages}</span><AdminButton type="button" tone="secondary" size="sm" disabled={sPage >= sPages} onClick={() => setSPage((p) => p + 1)}>下一页</AdminButton></div></div>}
      </div>
    </div>
  );

  const occurrences = detail?.occurrences ?? [];

  const OCC_PAGE_SIZE = 10;
  const occTotal = occurrences.length;
  const occPages = Math.max(1, Math.ceil(occTotal / OCC_PAGE_SIZE));
  const pageOccurrences = occurrences.slice((occPage - 1) * OCC_PAGE_SIZE, occPage * OCC_PAGE_SIZE);

  const toggleOcc = (id: number) => setExpandedOccs((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const occTag = (o?: TrainingOccurrence) => (
    <span className="inline-block text-[11px] px-2 py-0.5 rounded bg-[var(--app-color-surface-hover)] text-[var(--twin-mute)] whitespace-nowrap">{o ? (o.startTime ?? o.address ?? "—") : "—"}</span>
  );

  // ── 全局搜索：跨所有场次的学员（纯客户端过滤）──
  const flatMatches = useMemo(() => {
    const s = gsearch.trim().toLowerCase();
    if (!s) return [] as TrainingEnrollment[];
    const out: TrainingEnrollment[] = [];
    occurrences.forEach((o) => (o.enrollments ?? []).forEach((e) => {
      if ((e.name ?? "").toLowerCase().includes(s) || (e.jobNumber ?? "").toLowerCase().includes(s)) out.push(e);
    }));
    return out;
  }, [occurrences, gsearch]);
  const occByEnrollment = useMemo(() => {
    const m = new Map<number, TrainingOccurrence>();
    occurrences.forEach((o) => (o.enrollments ?? []).forEach((e) => m.set(e.id, o)));
    return m;
  }, [occurrences]);

  const renderEnrollmentRow = (e: TrainingEnrollment, lead?: React.ReactNode) => {
    const uid = String(e.id);
    const roomIds = e.roomIds ?? [];
    const ak = `a-${e.id}`;
    const sk = `s-${e.id}`;
    return (
      <tr key={e.id} className="border-b hover:bg-[var(--twin-canvas-soft)] transition-colors">
        {lead != null && <td className="px-3 py-2.5 text-[var(--twin-mute)]">{lead}</td>}
        <td className="px-3 py-2.5 font-medium text-[var(--app-color-text-primary)]">{e.name}</td>
        <td className="px-3 py-2.5 text-[var(--twin-mute)] font-mono text-xs">{e.jobNumber || "—"}</td>
        <td className="px-3 py-2.5 text-[var(--twin-mute)] max-w-[160px] truncate">{e.projectGroup || "—"}</td>
        <td className="px-3 py-2.5 relative min-w-[160px] max-w-[260px]">
          <div className="flex flex-wrap items-center gap-1">
            {roomIds.length === 0 && <span className="text-[11px] text-[var(--twin-mute)]">无</span>}
            {roomIds.map((rid) => {
              const rm = roomById.get(rid);
              return <span key={rid} className="text-xs bg-[var(--app-color-surface-hover)] px-2 py-0.5 rounded whitespace-nowrap">{rm ? `${rm.regionName || ""} ${rm.roomName || rid}`.trim() : rid}</span>;
            })}
            {canWrite && <button data-dt onClick={(ev) => toggleRoom(uid, roomIds, ev)} className={cn("shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors", expanded === uid ? "bg-blue-100 text-blue-700 font-medium" : "text-[var(--twin-mute)] hover:bg-[var(--app-color-surface-hover)]")}>{expanded === uid ? "选择中" : "修改"}</button>}
          </div>
          {canWrite && expanded === uid && roomDropdown(uid, e.id)}
        </td>
        <td className="px-3 py-2.5 relative">
          <div className="relative inline-block">
            {canWrite ? (
              <>
                <button data-dt onClick={() => setExpanded(expanded === ak ? null : ak)} className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded cursor-pointer transition-colors", e.testYn === 1 ? "text-emerald-600 bg-emerald-50" : e.testYn === 2 ? "text-rose-600 bg-rose-50" : "text-amber-600 bg-amber-50")}>{e.testYn === 1 ? <ShieldCheck className="h-3.5 w-3.5" /> : e.testYn === 2 ? <ShieldX className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}{e.testYn === 1 ? "已通过" : e.testYn === 2 ? "已拒绝" : "待审核"}</button>
                {expanded === ak && <div data-dd className="absolute left-0 top-full mt-1 z-50 w-24 rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] shadow-lg py-0.5">{e.testYn !== 1 && <button onClick={() => { handleAudit(e.id, 1); setExpanded(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--app-color-surface-hover)] flex items-center gap-2 text-emerald-600"><ShieldCheck className="h-3.5 w-3.5" />通过</button>}{e.testYn !== 2 && <button onClick={() => { handleAudit(e.id, 2); setExpanded(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--app-color-surface-hover)] flex items-center gap-2 text-rose-600"><ShieldX className="h-3.5 w-3.5" />拒绝</button>}</div>}
              </>
            ) : (
              <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded", e.testYn === 1 ? "text-emerald-600 bg-emerald-50" : e.testYn === 2 ? "text-rose-600 bg-rose-50" : "text-amber-600 bg-amber-50")}>{e.testYn === 1 ? "已通过" : e.testYn === 2 ? "已拒绝" : "待审核"}</span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 relative">
          <div className="relative inline-block">
            {canWrite ? (
              <>
                <button data-dt onClick={() => setExpanded(expanded === sk ? null : sk)} className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded cursor-pointer transition-colors", e.testFraction === 1 ? "text-emerald-600 bg-emerald-50" : e.testFraction === 2 ? "text-rose-600 bg-rose-50" : "text-[var(--twin-mute)] bg-[var(--app-color-surface-hover)]")}>{e.testFraction === 1 ? <CheckCircle2 className="h-3.5 w-3.5" /> : e.testFraction === 2 ? <XCircle className="h-3.5 w-3.5" /> : null}{e.testFraction === 1 ? "合格" : e.testFraction === 2 ? "不合格" : "待评分"}</button>
                {expanded === sk && <div data-dd className="absolute left-0 top-full mt-1 z-50 w-24 rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] shadow-lg py-0.5"><button onClick={() => { handleScore(e.id, 1); setExpanded(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--app-color-surface-hover)] flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />合格</button><button onClick={() => { handleScore(e.id, 2); setExpanded(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--app-color-surface-hover)] flex items-center gap-2 text-rose-600"><XCircle className="h-3.5 w-3.5" />不合格</button></div>}
              </>
            ) : (
              <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded", e.testFraction === 1 ? "text-emerald-600 bg-emerald-50" : e.testFraction === 2 ? "text-rose-600 bg-rose-50" : "text-[var(--twin-mute)] bg-[var(--app-color-surface-hover)]")}>{e.testFraction === 1 ? "合格" : e.testFraction === 2 ? "不合格" : "待评分"}</span>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const renderEnrollmentTable = (list: TrainingEnrollment[], opts?: { leadOf?: (e: TrainingEnrollment) => React.ReactNode; sticky?: boolean }) => {
    const hasLead = !!opts?.leadOf;
    const sticky = opts?.sticky !== false;
    return (
      <table className="w-full min-w-max text-left text-sm border-collapse">
        <thead className="border-b-2 border-[var(--app-color-border-strong)]"><tr className={cn("bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold", sticky && "sticky top-0 z-[2]")}>
          {hasLead && <th className="px-3 py-2">场次</th>}
          <th className="px-3 py-2">姓名</th><th className="px-3 py-2">编号</th><th className="px-3 py-2">课题组</th><th className="px-3 py-2 min-w-[160px] max-w-[260px]">允许房间</th><th className="px-3 py-2">审批</th><th className="px-3 py-2">评分</th>
        </tr></thead>
        <tbody>
          {list.length === 0 ? <tr><td colSpan={hasLead ? 7 : 6} className="text-center py-8 text-sm text-[var(--app-color-text-tertiary)]">暂无学员</td></tr>
            : list.map((e) => renderEnrollmentRow(e, opts?.leadOf?.(e)))}
        </tbody>
      </table>
    );
  };

  const occurrenceList = (
    <div className="flex-1 min-h-0 overflow-auto [scrollbar-gutter:stable] px-3 py-3 space-y-3">
      {dl ? <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin mr-2" />加载中…</div>
        : occurrences.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] py-12 text-center text-sm text-[var(--twin-mute)]">暂无场次</div>
        ) : pageOccurrences.map((o) => {
          const open = expandedOccs.has(o.id);
          const count = o.enrollments?.length ?? 0;
          return (
            <div key={o.id} className="rounded-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] overflow-hidden">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => toggleOcc(o.id)} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--twin-canvas-soft)] transition">
                  <span className="w-2 h-2 rounded-full bg-[var(--twin-mute)] shrink-0" />
                  <span className="text-sm font-medium text-[var(--twin-ink)] whitespace-nowrap"><Clock className="h-3.5 w-3.5 inline mr-1 text-[var(--twin-mute)]" />{o.startTime ?? "—"} ~ {o.endTime ?? "—"}</span>
                  <span className="text-sm text-[var(--twin-body)] whitespace-nowrap"><MapPin className="h-3.5 w-3.5 inline mr-1 text-[var(--twin-mute)]" />{o.address || "—"}</span>
                  <span className="rounded-full bg-[var(--twin-canvas-soft)] px-2.5 py-0.5 text-xs text-[var(--twin-body)] font-medium">{count} 人</span>
                  <span className="ml-auto shrink-0 text-xs text-[var(--twin-mute)]">{open ? "收起 ▲" : "展开 ▼"}</span>
                </button>
                {canWrite && (
                  <button type="button" onClick={() => { setImportOcc(o); setImportOpen(true); }} className="shrink-0 mr-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50">
                    <UserPlus className="h-3.5 w-3.5" />导入学员
                  </button>
                )}
              </div>
              {open && (
                <div className="border-t border-[var(--twin-hairline)] overflow-auto max-h-[50vh]">
                  {renderEnrollmentTable(o.enrollments ?? [])}
                </div>
              )}
            </div>
          );
        })}
        {occTotal > OCC_PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 pt-1 text-sm">
            <span className="text-xs text-[var(--app-color-text-tertiary)]">共 {occTotal} 场</span>
            <div className="flex items-center gap-2">
              <AdminButton type="button" tone="secondary" size="sm" disabled={occPage <= 1} onClick={() => setOccPage((p) => p - 1)}>上一页</AdminButton>
              <span className="text-xs text-[var(--app-color-text-secondary)]">{occPage} / {occPages}</span>
              <AdminButton type="button" tone="secondary" size="sm" disabled={occPage >= occPages} onClick={() => setOccPage((p) => p + 1)}>下一页</AdminButton>
            </div>
          </div>
        )}
    </div>
  );

  const tdetail = (
    <div className="flex flex-col h-[calc(100dvh-var(--admin-chrome-offset))]">
      <AdminFormCard className="shrink-0 mb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <AdminButton type="button" tone="secondary" size="default" onClick={goList}><ChevronLeft className="h-4 w-4 mr-1" />返回</AdminButton>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[var(--app-color-text-primary)] truncate">{selected?.name}</h2>
              <p className="text-xs text-[var(--twin-mute)]">{typeLabel(detail?.type ?? selected?.type)} · 所属人 {selected?.ownerId || "—"}{selected?.ownerId === currentUserId && "（我）"} · {seriesStatusBadge(detail?.status ?? selected?.status)}</p>
            </div>
          </div>
          <div className={cn("flex items-center gap-1.5 h-9 rounded border border-[var(--app-color-border-default)] bg-sky-50/50 px-3 cursor-text min-w-[220px]", gsearch && "ring-1 ring-blue-300")}>
            <Search className="h-4 w-4 text-[var(--twin-mute)] shrink-0" />
            <input value={gsearch} onChange={(e) => setGsearch(e.target.value)} placeholder="全局搜索姓名/编号..." className="flex-1 min-w-[60px] bg-transparent border-none outline-none text-sm" />
            {gsearch && <button onClick={() => setGsearch("")} className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"><X className="h-3.5 w-3.5" /></button>}
          </div>
        </div>
      </AdminFormCard>
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">
        {gsearch.trim() ? (
          <div className="flex-1 min-h-0 overflow-auto [scrollbar-gutter:stable]">
            {renderEnrollmentTable(flatMatches, { leadOf: (e) => occTag(occByEnrollment.get(e.id)) })}
          </div>
        ) : occurrenceList}
      </div>
      {importOpen && importOcc && (
        <Portal>
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => setImportOpen(false)}>
            <div className="relative w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 text-slate-900 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100" onClick={() => setImportOpen(false)} aria-label="关闭"><X className="h-4 w-4" /></button>
              <h2 className="text-lg font-semibold leading-none tracking-tight">导入学员</h2>
              <p className="mt-2 text-xs text-slate-500">每行一条：姓名 编号 课题组（空格/逗号分隔，课题组可省略）</p>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={8} placeholder={"张三 20240001 神经科学组\n李四 20240002"} className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 font-mono" />
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
                <AdminButton type="button" tone="secondary" size="default" onClick={() => setImportOpen(false)}>取消</AdminButton>
                <AdminButton type="button" tone="primary" size="default" onClick={doImport}>导入</AdminButton>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );

  return (
    <AdminPageShell>
      <div key={selected ? "detail" : "list"}>{selected ? tdetail : slist}</div>
    </AdminPageShell>
  );
}
