import { useEffect, useMemo, useRef, useState, memo } from "react";
import { AdminFullWidthPage } from "@/components/ui/AdminFullWidthPage";
import { useNavigate } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Upload, AlertTriangle, Star } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  fetchCageShelfDetail, fetchCageShelfFilterOptions, fetchCageScanProgress,
  importCageShelfCsv, refreshCellDetail, refreshShelfDetail,
  type CageShelfCell, type CageShelfDetail, type CageShelfFilterOptions,
  fetchBookmarks, toggleBookmarkApi, fetchShelfCells,
  type BookmarkEntry,
} from "@/api/domains/cageShelf.api";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { Portal } from "@/components/Portal";
import CageCellOverlays, { getDominantStatusCode, useStatusStyle, CAGE_TYPE_LABEL } from "@/features/cage-shelf/components/CageCellOverlays";
import CageShelfLegend from "@/features/cage-shelf/components/CageShelfLegend";
import CageScanProgressBanner from "@/features/cage-shelf/components/CageScanProgressBanner";
import { CageColorProvider } from "@/features/cage-shelf/components/CageColorContext";

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const CAGE_BOX_INFO_FIELD_ORDER = [
  "AnimalCageType", "PositionX", "PositionY", "AreaId", "DepartmentName",
  "floorId", "RoomName", "ShelveName", "ProjectPiName", "MobilePhone",
  "AupNumber", "CageBoxQrCode", "createAdmin", "CreateTime", "UpdateTime",
  "SpecialBreedingName", "specialBreedingDescription",
  "NeedDivideYn", "NeedFeedingYn", "NeedTransferYn", "AbnormalHealthYn", "ClosingDate",
  "State", "StateName", "HasPhysicalBox",
] as const;

const CAGE_BOX_INFO_LABEL: Record<string, string> = {
  AnimalCageType: "笼位类型", PositionX: "X 坐标", PositionY: "Y 坐标",
  AreaId: "区域 ID", DepartmentName: "部门", floorId: "楼层 ID",
  RoomName: "房间名称", ShelveName: "笼架名称", ProjectPiName: "课题 PI",
  MobilePhone: "手机号", AupNumber: "AUP 编号", CageBoxQrCode: "笼盒卡号",
  createAdmin: "创建人", CreateTime: "创建时间", UpdateTime: "更新时间",
  SpecialBreedingName: "特殊饲养名称", specialBreedingDescription: "特殊饲养说明",
  NeedDivideYn: "请分笼", NeedFeedingYn: "特殊饲养", NeedTransferYn: "动物转移",
  AbnormalHealthYn: "健康异常", ClosingDate: "合笼日期",
  State: "状态值", StateName: "状态名称", HasPhysicalBox: "是否有实体笼盒",
};

/* ------------------------------------------------------------------ */
/*  ShelfGrid (memo'd cell)                                             */
/* ------------------------------------------------------------------ */

function formatCageDetailValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "是" : "否";
  return String(v);
}
function nonEmptyText(s?: string | null): boolean { return typeof s === "string" && s.trim() !== ""; }

const CellButton = memo(function CellButton({ cell, onClick }: {
  cell: CageShelfCell; onClick: (c: CageShelfCell) => void;
}) {
  const dominant = getDominantStatusCode(cell.specialStatuses, cell.cageBoxInfo);
  const statusStyle = useStatusStyle(dominant);
  const piTeacher = nonEmptyText(cell.projectPiName) ? cell.projectPiName!.trim()
    : nonEmptyText(cell.piName) ? cell.piName!.trim() : "";

  const className = cell.empty
    ? "relative min-h-[82px] rounded-twin-md text-[10px] leading-tight transition border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)]"
    : "relative min-h-[82px] rounded-twin-md text-[10px] leading-tight transition border-2 text-slate-900 hover:brightness-95";

  const statusCodes = (() => {
    const raw = cell.specialStatuses;
    if (!raw || (Array.isArray(raw) && raw.length === 0)) {
      // fallback: read from cageBoxInfo
      const bi = cell.cageBoxInfo;
      if (!bi) return "";
      const parts: string[] = [];
      if (bi["ClosingDate"]) parts.push("合笼");
      if (bi["NeedFeedingYn"] === 1) parts.push("特殊饲养");
      if (bi["NeedDivideYn"] === 1) parts.push("请分笼");
      if (bi["AbnormalHealthYn"] === 1) parts.push("健康异常");
      if (bi["NeedTransferYn"] === 1) parts.push("动物转移");
      return parts.length > 0 ? parts.join("+") : "";
    }
    if (Array.isArray(raw)) return raw.map((s: { code: string }) => s.code).filter((c: string) => c !== "NORMAL").join("+");
    return "";
  })();

  const tooltip = cell.empty ? undefined
    : `${cell.position} · ${CAGE_TYPE_LABEL[cell.animalCageType ?? 0] || cell.stateLabel}${statusCodes ? ` [${statusCodes}]` : ""}`;

  return (
    <button type="button" className={className}
      style={statusStyle}
      title={tooltip}
      onClick={() => !cell.empty && onClick(cell)} disabled={cell.empty}>
      {!cell.empty && <CageCellOverlays animalCageType={cell.animalCageType} compact />}
      <div className="flex min-h-[76px] flex-col items-center justify-center gap-0.5 px-1 py-1 text-center">
        <div className="w-full font-bold">{cell.position}</div>
        {cell.empty ? <div className="text-[9px] text-[var(--twin-mute)]">空位</div> : <>
          {nonEmptyText(cell.departmentName) && <div className="w-full truncate text-[9px] font-medium text-[var(--twin-body)]">{cell.departmentName}</div>}
          {nonEmptyText(cell.projectGroup) && <div className="w-full truncate">{cell.projectGroup}</div>}
          {piTeacher && <div className="w-full truncate text-[11px] font-semibold text-[var(--twin-ink)]">{piTeacher}</div>}
          {(CAGE_TYPE_LABEL[cell.animalCageType ?? 0] || cell.stateLabel) && <div className="w-full text-[9px] text-[var(--twin-mute)]">{CAGE_TYPE_LABEL[cell.animalCageType ?? 0] || cell.stateLabel}</div>}
        </>}
      </div>
    </button>
  );
});

function ShelfGrid({ title, detail, loading, emptyHint, onCellClick, isBookmarked, onToggleBookmark }: {
  title: string; detail: CageShelfDetail | null; loading: boolean; emptyHint?: string;
  onCellClick: (cell: CageShelfCell) => void;
  isBookmarked?: boolean; onToggleBookmark?: () => void;
}) {
  const cells = detail?.grid ?? [];
  return (
    <div className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3 min-h-0 flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-[var(--twin-ink)]">{title}</div>
        <div className="flex items-center gap-2">
          {detail?.shelfMeta && <div className="text-[11px] text-[var(--twin-mute)]">
            {detail.shelfMeta.campusName} / {detail.shelfMeta.areaName} / {detail.shelfMeta.floorName} / {detail.shelfMeta.roomName} / {detail.shelfMeta.shelveName || detail.shelfMeta.shelveId}</div>}
          {onToggleBookmark && (
            <button type="button" className={`shrink-0 p-0.5 rounded transition ${isBookmarked ? "text-amber-500 hover:text-amber-600" : "text-slate-300 hover:text-amber-400"}`}
              onClick={onToggleBookmark} title={isBookmarked ? "取消收藏" : "收藏此笼架"}>
              <Star className={`h-4 w-4 ${isBookmarked ? "fill-amber-500" : ""}`} />
            </button>
          )}
        </div>
      </div>
      {loading ? <div className="flex-1 rounded-twin-lg border border-dashed text-xs text-[var(--twin-mute)] grid place-items-center">加载中...</div>
      : !detail || detail.totalCells === 0 ? <div className="flex-1 rounded-twin-lg border border-dashed text-xs text-[var(--twin-mute)] grid place-items-center px-2 text-center">
          {emptyHint ?? (detail && detail.totalCells === 0 && !detail.fromCache ? "该笼架暂无快照缓存，请点击右上角按钮手动刷新或等待定时扫描" : "暂无数据")}
        </div>
      : <div className="flex-1 content-start p-[3px]"><div className="grid grid-cols-8 gap-1.5">
        {cells.map((cell) => <CellButton key={cell.position} cell={cell} onClick={onCellClick} />)}
      </div></div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component (wrapped in CageColorProvider)                       */
/* ------------------------------------------------------------------ */

export default function AdminCageShelfPage() {
  return <AdminFullWidthPage><CageColorProvider><AdminCageShelfInner /></CageColorProvider></AdminFullWidthPage>;
}

type ShelfTab = "bookmarks" | "filter";

function BookmarkShelfGrid({ roomId, shelveId, title, campusName, roomName, isBookmarked, onToggleBookmark, onCellClick }: {
  roomId: string; shelveId: string; title: string; campusName?: string; roomName?: string;
  isBookmarked?: boolean; onToggleBookmark?: () => void; onCellClick: (cell: CageShelfCell) => void;
}) {
  const snap = useQuery({
    queryKey: ["shelfCells", roomId, shelveId],
    queryFn: () => fetchShelfCells(roomId, shelveId),
    staleTime: 5 * 60 * 1000,
  });
  const snapHasRealCells = Boolean(
    snap.data?.cells?.some((c) => !c.empty && (c.animalCageType != null || c.cageBoxJson || c.specialStatusesJson))
  );
  const cache = useQuery({
    queryKey: ["cageShelfDetail", shelveId],
    queryFn: () => fetchCageShelfDetail(shelveId),
    staleTime: 5 * 60 * 1000,
    enabled: snap.isSuccess && (snap.data?.isEmpty === true || !snapHasRealCells),
  });
  const isLoading = snap.isLoading || (cache.isEnabled && cache.isLoading);

  // Build CageShelfDetail so we can reuse ShelfGrid (same rendering as filter tab)
  const detail = useMemo((): CageShelfDetail | null => {
    const meta = { shelveId, shelveName: title, campusName: campusName || "", areaName: "", floorName: "", roomName: roomName || "" };
    if (snapHasRealCells && snap.data) {
      const cells = snap.data.cells.map(c => snapshotCellToShelfCell(c));
      return { shelfMeta: meta, grid: cells, totalCells: cells.length, filledCells: cells.filter(c => !c.empty).length };
    }
    if (cache.data) return cache.data;
    if (snap.data?.cells?.length) {
      const cells = snap.data.cells.map(c => snapshotCellToShelfCell(c));
      return { shelfMeta: meta, grid: cells, totalCells: cells.length, filledCells: 0 };
    }
    return null;
  }, [snapHasRealCells, snap.data, cache.data, title, campusName, roomName, shelveId]);

  if (isLoading) return <div className="text-xs text-[var(--twin-mute)] py-4 text-center">加载笼位…</div>;
  if (!detail || detail.totalCells === 0) return <div className="text-xs text-[var(--twin-mute)] py-4 text-center">暂无数据 — 运行全量扫描或手动刷新后可见</div>;

  return <ShelfGrid title={title} detail={detail} loading={false} emptyHint="暂无笼架数据"
    isBookmarked={isBookmarked} onToggleBookmark={onToggleBookmark} onCellClick={onCellClick} />;
}

/** Convert a CageCellSnapshot (from new API) to CageShelfCell (for ShelfGrid rendering) */
function snapshotCellToShelfCell(c: any): CageShelfCell {
  let cageBoxInfo: Record<string, unknown> | undefined;
  let specialStatuses: any[] | undefined;
  try { if (c.cageBoxJson) cageBoxInfo = JSON.parse(c.cageBoxJson); } catch {}
  try { if (c.specialStatusesJson) specialStatuses = JSON.parse(c.specialStatusesJson); } catch {}
  const x = c.positionX ?? 0;
  const y = c.positionY ?? 0;
  const label = c.positionLabel || `${String.fromCharCode(64 + x)}-${y}`;
  const empty = c.empty || (!c.animalCageType && !cageBoxInfo);
  return {
    x, y, position: label, empty,
    stateLabel: empty ? "空位" : "",
    animalCageType: c.animalCageType ?? undefined,
    projectPiName: cageBoxInfo?.projectPiName as string ?? undefined,
    departmentName: cageBoxInfo?.departmentName as string ?? undefined,
    piName: cageBoxInfo?.piName as string ?? undefined,
    cageBoxInfo,
    specialStatuses,
  };
}

function AdminCageShelfInner() {
  const navigate = useNavigate();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<ShelfTab>("filter");
  const [campusId, setCampusId] = useState<string>("");
  const [areaId, setAreaId] = useState<string>("");
  const [areaName, setAreaName] = useState("");
  const [floorId, setFloorId] = useState<string>("");
  const [floorName, setFloorName] = useState("");
  const [roomId, setRoomId] = useState<string>("");
  const [roomName, setRoomName] = useState("");
  const [roomShelfDetails, setRoomShelfDetails] = useState<CageShelfDetail[]>([]);
  const [roomLoading, setRoomLoading] = useState(false);
  const [activeCell, setActiveCell] = useState<CageShelfCell | null>(null);
  const [activeShelfId, setActiveShelfId] = useState<string | null>(null);
  const [activeCellRefreshing, setActiveCellRefreshing] = useState(false);

  const { data: options = { campuses: [], areas: [], floors: [], rooms: [], shelves: [] } } = useQuery({
    queryKey: ["cageShelfFilterOptions", { campusId, areaId, areaName, floorId, floorName, roomId, roomName }],
    queryFn: () => fetchCageShelfFilterOptions({ campusId: campusId ? Number(campusId) : undefined, areaId: areaId || undefined, areaName: areaName || undefined, floorId: floorId || undefined, floorName: floorName || undefined, roomId: roomId || undefined, roomName: roomName || undefined }),
    placeholderData: (prev) => prev,
  });

  const { data: scanProgress } = useQuery({
    queryKey: ["cageScanProgress"], queryFn: fetchCageScanProgress,
    refetchInterval: (q) => q.state.data?.status === "running" ? 5000 : 30000,
  });

  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [bookmarkList, setBookmarkList] = useState<BookmarkEntry[]>([]);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  const toggleBookmark = async (shelveId: string) => {
    if (!roomId) {
      toast.error("请先选择房间再收藏笼架");
      return;
    }
    const key = `${roomId}:${shelveId}`;
    try {
      const res = await toggleBookmarkApi(roomId, shelveId);
      setPinnedIds(prev => {
        const next = new Set(prev);
        if (res.bookmarked) next.add(key); else next.delete(key);
        return next;
      });
      if (res.bookmarked) {
        if (activeTab === "bookmarks") void loadBookmarks();
      } else {
        setBookmarkList(prev => prev.filter(b => `${b.roomId}:${b.shelveId}` !== key));
      }
    } catch (e: any) { toast.error("收藏操作失败"); }
  };

  const loadBookmarks = async () => {
    setBookmarkLoading(true);
    try {
      const list = await fetchBookmarks();
      setBookmarkList(list);
      setPinnedIds(new Set(list.map(b => `${b.roomId}:${b.shelveId}`)));
    } catch { /* ignore */ }
    finally { setBookmarkLoading(false); }
  };

  useEffect(() => { if (activeTab === "bookmarks") loadBookmarks(); }, [activeTab]);

  // Map shelveId→shelveName from filter options (fallback for when backend lookup fails)
  const shelfNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of options.shelves ?? []) m.set(String(s.shelveId), s.shelveName);
    return m;
  }, [options.shelves]);

  const shelfIdsSignature = useMemo(() => (options.shelves ?? []).map((s) => s.shelveId).join(","), [options.shelves]);

  useEffect(() => { setAreaId(""); setAreaName(""); setFloorId(""); setFloorName(""); setRoomId(""); setRoomName(""); setRoomShelfDetails([]); }, [campusId]);
  useEffect(() => { setFloorId(""); setFloorName(""); setRoomId(""); setRoomName(""); setRoomShelfDetails([]); }, [areaId, areaName]);
  useEffect(() => { setRoomId(""); setRoomName(""); setRoomShelfDetails([]); }, [floorId, floorName]);
  useEffect(() => { setRoomShelfDetails([]); }, [roomId, roomName]);

  useEffect(() => {
    if (!activeCell || !activeShelfId || activeCell.empty) return;
    let cancelled = false;
    setActiveCellRefreshing(true);
    void (async () => { try { const fresh = await refreshCellDetail(activeShelfId, activeCell.x, activeCell.y); if (!cancelled) setActiveCell(fresh); } catch {} finally { if (!cancelled) setActiveCellRefreshing(false); } })();
    return () => { cancelled = true; };
  }, [activeCell?.position, activeShelfId]);

  // Load shelves from snapshot cache — keep previous data visible during fetch
  useEffect(() => {
    if (!roomId || !roomName || !shelfIdsSignature) { setRoomShelfDetails([]); return; }
    const shelves = options.shelves ?? [];
    if (shelves.length === 0) { setRoomShelfDetails([]); return; }
    let cancelled = false;
    setRoomLoading(true);
    void (async () => {
      try {
        const results = await Promise.all(
          shelves.map((shelf) => fetchCageShelfDetail(shelf.shelveId).catch(() => null))
        );
        if (cancelled) return;
        setRoomShelfDetails(results.filter((r): r is CageShelfDetail => r !== null));
        setRoomLoading(false);
      } catch (e) { if (!cancelled) { toast.error(e instanceof Error ? e.message : "加载失败"); setRoomLoading(false); } }
    })();
    return () => { cancelled = true; };
  }, [roomId, roomName, shelfIdsSignature]);

  const onImport = async (file?: File) => {
    if (!file) return;
    try { const stat = await importCageShelfCsv(file); toast.success(`导入完成：新增 ${stat?.created || 0}，更新 ${stat?.updated || 0}，跳过 ${stat?.skipped || 0}`); } catch (e) { toast.error(e instanceof Error ? e.message : "导入失败"); }
  };

  return (
    <AdminPageShell
      title={<span className="inline-flex items-center gap-2"><LayoutGrid className="h-6 w-6 shrink-0 text-[var(--twin-link-deep)]" aria-hidden />笼架信息</span>}
      description="按校区—区域—楼层—房间逐级筛选，查看笼架格位。直接读取快照缓存，点击右上角按钮可手动刷新。"
      actions={<>
        <input ref={importInputRef} type="file" accept=".csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; void onImport(f); e.currentTarget.value = ""; }} />
        <AdminButton type="button" tone="secondary" size="sm" className="gap-1.5" onClick={() => importInputRef.current?.click()}><Upload className="h-3.5 w-3.5" aria-hidden />导入 CSV</AdminButton>
        <AdminButton type="button" tone="secondary" size="sm" className="gap-1.5" onClick={() => navigate(toAdminRoutePath("/admin/cage-shelves/special-status"))}><AlertTriangle className="h-3.5 w-3.5" aria-hidden />特殊状态总览</AdminButton>
      </>}
    >
      <div className="min-h-0 space-y-4">
        <CageShelfLegend />

        {/* ---- Tabs ---- */}
        <div className="flex items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1">
          <button type="button" onClick={() => setActiveTab("bookmarks")}
            className={`flex items-center gap-1.5 rounded-twin-md px-3 py-1.5 text-xs font-semibold transition ${activeTab === "bookmarks" ? "bg-[var(--twin-link-deep)] text-white shadow-sm" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
            <Star className="h-3.5 w-3.5" /> 收藏的笼架 {pinnedIds.size > 0 && <span className="rounded-full bg-white/20 px-1.5 text-[10px]">{pinnedIds.size}</span>}
          </button>
          <button type="button" onClick={() => setActiveTab("filter")}
            className={`flex items-center gap-1.5 rounded-twin-md px-3 py-1.5 text-xs font-semibold transition ${activeTab === "filter" ? "bg-[var(--twin-link-deep)] text-white shadow-sm" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"}`}>
            <LayoutGrid className="h-3.5 w-3.5" /> 位置筛选
          </button>
        </div>

        {/* ---- Bookmarks Tab ---- */}
        {activeTab === "bookmarks" && (
          <div className="min-h-[62vh] space-y-4 overflow-y-auto pr-1">
            {pinnedIds.size === 0 && !bookmarkLoading && (
              <div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] py-12 text-center text-sm text-[var(--twin-mute)]">
                <Star className="h-8 w-8 mx-auto mb-2 opacity-20" />
                暂无收藏的笼架
                <br /><span className="text-[11px]">切换到「位置筛选」选择房间后，点击笼架旁的 ☆ 即可收藏</span>
              </div>
            )}
            {bookmarkLoading && <div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 text-center text-sm text-[var(--twin-mute)]">加载收藏…</div>}
            {!bookmarkLoading && bookmarkList.length > 0 && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {bookmarkList.map(b => (
                  <BookmarkShelfGrid key={`${b.roomId}-${b.shelveId}`}
                    roomId={String(b.roomId)} shelveId={String(b.shelveId)}
                    title={b.shelveName && String(b.shelveName) !== String(b.shelveId) ? b.shelveName : (shelfNameMap.get(String(b.shelveId)) || `笼架 ${b.shelveId}`)}
                    campusName={b.campusName} roomName={b.roomName}
                    isBookmarked={true}
                    onToggleBookmark={() => toggleBookmarkApi(String(b.roomId), String(b.shelveId)).then(r => {
                      if (!r.bookmarked) { setPinnedIds(p => { const n = new Set(p); n.delete(`${b.roomId}:${b.shelveId}`); return n; }); setBookmarkList(l => l.filter(x => `${x.roomId}:${x.shelveId}` !== `${b.roomId}:${b.shelveId}`)); }
                    })}
                    onCellClick={(cell) => { setActiveCell(cell); setActiveShelfId(String(b.shelveId)); }} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Filter Tab ---- */}
        {activeTab === "filter" && (
          <>
            <AdminFormCard title="位置筛选" description="逐级选择后自动加载所选房间全部笼架。">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-[var(--twin-mute)] text-xs font-medium">校区</span>
                <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-sm" value={campusId} onChange={(e) => setCampusId(e.target.value)}>
                  <option value="">全部</option>
                  {options.campuses.map(c => <option key={c.campusId} value={String(c.campusId)}>{c.campusName}</option>)}
                </select>
                {campusId && <><span className="text-[var(--twin-mute)]">→</span><span className="text-[var(--twin-mute)] text-xs font-medium">区域</span>
                  <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-sm" value={areaId ? `${areaId}|${areaName}` : ""} onChange={(e) => { const [id, name] = e.target.value.split("|"); setAreaId(id); setAreaName(name || ""); }}>
                    <option value="">全部</option>
                    {options.areas.map(a => <option key={`${a.areaId}-${a.areaName}`} value={`${a.areaId}|${a.areaName}`}>{a.areaName}</option>)}
                  </select></>}
                {areaId && <><span className="text-[var(--twin-mute)]">→</span><span className="text-[var(--twin-mute)] text-xs font-medium">楼层</span>
                  <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-sm" value={floorId ? `${floorId}|${floorName}` : ""} onChange={(e) => { const [id, name] = e.target.value.split("|"); setFloorId(id); setFloorName(name || ""); }}>
                    <option value="">全部</option>
                    {options.floors.map(f => <option key={`${f.floorId}-${f.floorName}`} value={`${f.floorId}|${f.floorName}`}>{f.floorName}</option>)}
                  </select></>}
                {floorId && <><span className="text-[var(--twin-mute)]">→</span><span className="text-[var(--twin-mute)] text-xs font-medium">房间</span>
                  <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-sm" value={roomId ? `${roomId}|${roomName}` : ""} onChange={(e) => { const [id, name] = e.target.value.split("|"); setRoomId(id); setRoomName(name || ""); }}>
                    <option value="">全部</option>
                    {options.rooms.map(r => <option key={`${r.roomId}-${r.roomName}`} value={`${r.roomId}|${r.roomName}`}>{r.roomName}</option>)}
                  </select></>}
              </div>
            </AdminFormCard>

            {scanProgress && scanProgress.status !== "idle" && <CageScanProgressBanner progress={scanProgress} />}

            <div className="min-h-[62vh] space-y-4 overflow-y-auto pr-1">
              {roomLoading && <div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 text-center text-sm text-[var(--twin-mute)]">正在加载房间笼架（已加载 {roomShelfDetails.length} / {options.shelves?.length ?? 0}）…</div>}
              {!roomLoading && roomId && roomName && (options.shelves?.length ?? 0) === 0 && <div className="rounded-twin-xl border border-amber-200/90 bg-amber-50/80 p-4 text-sm text-amber-900">当前房间暂无笼架索引，请先导入 CSV 或调整筛选。</div>}
              {roomShelfDetails.length > 0 && <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {roomShelfDetails.map((d, idx) => {
                  const sid = String(d.shelfMeta?.shelveId ?? "");
                  const isBm = sid !== "" && pinnedIds.has(`${roomId}:${sid}`);
                  return <ShelfGrid key={sid || idx}
                    title={d.shelfMeta?.shelveName ?? `笼架 ${idx + 1}`}
                    detail={d} loading={false}
                    emptyHint="暂无笼架数据"
                    isBookmarked={isBm}
                    onToggleBookmark={sid !== "" ? () => toggleBookmark(sid) : undefined}
                    onCellClick={(cell) => { setActiveCell(cell); setActiveShelfId(sid); }} />;
                })}
              </div>}
            </div>
          </>
        )}

        {activeCell && <Portal><div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => { setActiveCell(null); setActiveShelfId(null); }}>
            <div className="w-full max-w-xl rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-3" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-[var(--twin-ink)]">笼盒详情 · 格位 {activeCell.position}</div>
                <button type="button" className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={() => { setActiveCell(null); setActiveShelfId(null); }}>关闭</button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {CAGE_BOX_INFO_FIELD_ORDER.map((k) => { const source = activeCell.cageBoxInfo ?? activeCell.detail ?? {}; const v = source[k]; const display = formatCageDetailValue(v); const qr = k === "CageBoxQrCode" && v != null && String(v).trim() !== "" ? String(v).trim() : "";
                  return <div key={k} className={`rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 ${k === "CageBoxQrCode" ? "col-span-2" : ""}`}>
                    <div className="text-[var(--twin-mute)]">{CAGE_BOX_INFO_LABEL[k] ?? k}</div>
                    <div className="mt-0.5 flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1 break-all text-[var(--twin-ink)]">{display}</div>
                      {k === "CageBoxQrCode" && qr !== "" && <div className="shrink-0 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1"><QRCodeSVG value={qr} size={112} level="M" includeMargin={false} /></div>}
                    </div>
                  </div>;
                })}
              </div>
              {activeCell.annotation && (activeCell.annotation.richText || activeCell.annotation.images) && (
                <div className="mt-3 pt-3 border-t border-[var(--twin-hairline)]">
                  <div className="text-xs font-semibold text-[var(--twin-ink)] mb-2">学生标注</div>
                  {activeCell.annotation.richText && <div className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 mb-1.5 text-xs"><div className="text-[var(--twin-mute)] mb-0.5">备注</div><div className="text-[var(--twin-ink)] whitespace-pre-wrap">{activeCell.annotation.richText}</div></div>}
                  {activeCell.annotation.images && (() => { try { const urls = JSON.parse(activeCell.annotation.images); if (Array.isArray(urls) && urls.length > 0) return <div className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-xs"><div className="text-[var(--twin-mute)] mb-1">图片 ({urls.length})</div><div className="flex flex-wrap gap-2">{urls.filter(Boolean).map((url: string, i: number) => <img key={i} src={url} alt={`标注 ${i + 1}`} className="h-16 w-16 object-cover rounded-twin-sm border border-[var(--twin-hairline)]" />)}</div></div>; } catch { return null; } })()}
                  {activeCell.annotation.updatedAt && <div className="text-[10px] text-[var(--twin-mute)] mt-1">{activeCell.annotation.updatedBy ? `${activeCell.annotation.updatedBy} 于 ` : ""}{activeCell.annotation.updatedAt}</div>}
                </div>
              )}
            </div>
          </div></Portal>}
      </div>
    </AdminPageShell>
  );
}
