/** 手机版 — 房间 Tab（与小程序 pages/room 同源：wechat-overview + roomDashboard） */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DoorOpen, Loader2, WifiOff } from "lucide-react";
import MobileRoomDotCard from "./MobileRoomDotCard";
import MobileRoomDetailDialog from "./MobileRoomDetailDialog";
import MobileRoomAuditPanel from "./MobileRoomAuditPanel";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { evaluateMobileRoomAccess, computeMobilePermissionBadge, getRoomDelayOptions, resolveScanOfficialRoomId } from "./utils/mobileScanRoomAccess";
import { submitScanDelayRequest } from "@/api/domains/scanDelay.api";
import { submitMobileScanDelayRequest } from "@/api/domains/mobileStudent.api";
import type { ScanDelayOptionSummary } from "@/api/types/scanner";
import { buildDetailRoom, type DetailRoom } from "./utils/roomPreviewMeta";
import {
  buildCampusDisplayList,
  pickRoomsByCampusFloor,
  resolveDefaultCampusFloor,
} from "./utils/roomDashboard";
import {
  fetchMobileRoomsPageBundle,
  fetchStudentMobileRoomsPageBundle,
  overviewToPreviewMeta,
  previewMetaToAccessItem,
  type MobileRoomsPageBundle,
} from "./utils/mobileRoomWebData";
import { useMobilePullToRefresh } from "./useMobilePullToRefresh";

type SidebarView = "mine" | "campus";

interface CampusNavState {
  campus: string;
  floor: string;
}

const PERMISSION_BADGE_STYLE: Record<
  "none" | "ok" | "banned" | "time",
  { color: string; background: string }
> = {
  none: { color: "#969799", background: "#f2f3f5" },
  ok: { color: "#07c160", background: "#e8f8ef" },
  banned: { color: "#ee0a24", background: "#fde8ea" },
  time: { color: "#ed6a0c", background: "#fff7e8" },
};

export default function MobileRoomsTab({ token, jwtMode }: { token: string; jwtMode?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<MobileRoomsPageBundle | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);

  const showAuditEntry = useMemo(() => {
    if (!jwtMode) return false;
    return hasMinRole(authStorage.getRole(), "SENIOR");
  }, [jwtMode]);

  const [sidebarView, setSidebarView] = useState<SidebarView>("mine");
  const [expandedCampus, setExpandedCampus] = useState<Record<string, boolean>>({
    浦东: true,
    浦西: false,
  });
  const [campusNav, setCampusNav] = useState<CampusNavState>({ campus: "浦东", floor: "" });
  const [detailRoom, setDetailRoom] = useState<DetailRoom | null>(null);

  const loadedOnceRef = useRef(false);
  const roomScrollRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef({
    view: "mine" as SidebarView,
    campus: "",
    floor: "",
    expanded: { 浦东: true, 浦西: false } as Record<string, boolean>,
  });
  const detailRoomIdRef = useRef<string | null>(null);

  selectionRef.current = {
    view: sidebarView,
    campus: campusNav.campus,
    floor: campusNav.floor,
    expanded: expandedCampus,
  };
  detailRoomIdRef.current = detailRoom ? String(detailRoom.roomId) : null;

  const applyBundle = useCallback((data: MobileRoomsPageBundle, preserveSelection: boolean) => {
    const sel = selectionRef.current;
    let view: SidebarView = preserveSelection && sel.view === "campus" ? "campus" : "mine";
    let campus = sel.campus;
    let floor = sel.floor;
    const expanded = { ...sel.expanded };

    if (view === "campus") {
      const tree = data.campusTree;
      const node = tree.find((x) => x.campus === campus);
      const floorOk = node?.floors?.some((f) => f.floor === floor);
      if (!preserveSelection || !campus || !floor || !floorOk) {
        const d = resolveDefaultCampusFloor(tree);
        campus = d.campus;
        floor = d.floor;
        if (preserveSelection) {
          view = tree.length > 0 ? "campus" : "mine";
        }
      }
    }

    setBundle(data);
    setSidebarView(view);
    setCampusNav({ campus, floor });
    setExpandedCampus(expanded);

    const openId = detailRoomIdRef.current;
    if (openId) {
      const previews =
        view === "mine"
          ? data.myRoomPreviews
          : pickRoomsByCampusFloor(data.overviewRows, campus, floor).map((r) =>
              overviewToPreviewMeta(r),
            );
      const hit = previews.find((r) => String(r.roomId) === openId);
      if (hit) setDetailRoom(buildDetailRoom(hit));
    }
  }, []);

  const refresh = useCallback(
    async (opts?: { silent?: boolean; preserveSelection?: boolean }) => {
      if (!jwtMode && !token) return;
      const silent = !!opts?.silent;
      const preserveSelection = !!opts?.preserveSelection;
      if (!silent) setLoading(true);
      setError(null);

      try {
        const data = jwtMode
          ? await fetchStudentMobileRoomsPageBundle()
          : await fetchMobileRoomsPageBundle(token!);
        applyBundle(data, preserveSelection);
        loadedOnceRef.current = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "加载失败";
        if (!loadedOnceRef.current) setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [token, jwtMode, applyBundle],
  );

  useEffect(() => {
    if (!loadedOnceRef.current) refresh();
  }, [refresh]);

  const pullRefresh = useMobilePullToRefresh(
    () => refresh({ silent: true, preserveSelection: true }),
    roomScrollRef,
  );

  const campusDisplayList = useMemo(
    () => buildCampusDisplayList(bundle?.campusTree ?? [], expandedCampus),
    [bundle?.campusTree, expandedCampus],
  );

  const currentRoomPreviews = useMemo(() => {
    if (!bundle) return [];
    if (sidebarView === "mine") return bundle.myRoomPreviews;
    return pickRoomsByCampusFloor(bundle.overviewRows, campusNav.campus, campusNav.floor).map(
      (r) => overviewToPreviewMeta(r),
    );
  }, [bundle, sidebarView, campusNav]);

  const currentRooms = useMemo(() => {
    if (!bundle) return [];
    return currentRoomPreviews.map((room) => ({
      room,
      access: evaluateMobileRoomAccess(
        previewMetaToAccessItem(room),
        bundle.overviewIndex,
        bundle.scanAnalyze,
        bundle.overviewRows,
      ),
    }));
  }, [bundle, currentRoomPreviews]);

  // 延迟免冻结：当前选中房间的可用菜单项
  const currentRoomDelayOptions = useMemo<ScanDelayOptionSummary[]>(() => {
    if (!detailRoom || !bundle?.scanAnalyze?.scanDelayEnabled) return [];
    const scanId = resolveScanOfficialRoomId(detailRoom.roomId, bundle.overviewIndex, bundle.scanAnalyze);
    if (!scanId) return [];
    return getRoomDelayOptions(bundle.scanAnalyze, scanId) as ScanDelayOptionSummary[];
  }, [detailRoom, bundle?.scanAnalyze, bundle?.overviewIndex]);

  // 延迟申请提交：JWT 用 authHttp，token 用 publicHttp
  // 房间 ID 需转为官方扫描 ID（与 Web 端行为一致，否则后台校验 isOptionBoundToRoom 失败）
  const handleDelaySubmit = useCallback(
    async (payload: { subjectUserId: string; roomId: string; optionId: number }) => {
      const scanId = detailRoom
        ? resolveScanOfficialRoomId(detailRoom.roomId, bundle?.overviewIndex ?? [], bundle?.scanAnalyze ?? null)
        : payload.roomId;
      const fixed = { ...payload, roomId: scanId || payload.roomId };
      if (jwtMode) return submitScanDelayRequest(fixed);
      return submitMobileScanDelayRequest(token, fixed);
    },
    [detailRoom, bundle?.overviewIndex, bundle?.scanAnalyze, jwtMode, token],
  );

  // 延迟申请成功后刷新房间数据
  const handleDelaySuccess = useCallback(() => {
    refresh({ silent: true, preserveSelection: true });
  }, [refresh]);

  const panelTitle =
    sidebarView === "mine" ? "我的" : `${campusNav.campus} ${campusNav.floor}`.trim();

  const permissionBadge = bundle
    ? computeMobilePermissionBadge(bundle.scanAnalyze)
    : { key: "none" as const, text: "无权限" };

  const badgeStyle = PERMISSION_BADGE_STYLE[permissionBadge.key];

  if (auditOpen) {
    return <MobileRoomAuditPanel onBack={() => setAuditOpen(false)} />;
  }

  if (loading && !loadedOnceRef.current) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" style={{ color: "#94a3b8" }} />
      </div>
    );
  }

  if (error && !loadedOnceRef.current) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-4">
        <WifiOff className="size-8" style={{ color: "#c8c9cc" }} />
        <p className="text-xs text-center" style={{ color: "#969799" }}>{error}</p>
        <button
          type="button"
          onClick={() => refresh()}
          className="rounded-full px-4 py-1.5 text-xs font-medium text-white"
          style={{ background: "#ac1736" }}
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className="h-full flex min-h-0"
        style={{ background: "#eef0f6" }}
      >
        <aside
          className="shrink-0 flex flex-col min-h-0"
          style={{
            width: 90,
            background: "#fff",
            borderRight: "1px solid #ebedf0",
            boxShadow: "4px 0 24px rgba(0,0,0,0.03)",
          }}
        >
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-1.5 pt-2 pb-1">
            <button
              type="button"
              onClick={() => setSidebarView("mine")}
              className="w-full text-center px-2 py-3.5 rounded-xl text-[14px] font-bold shrink-0 mb-2 transition-all active:scale-[0.98]"
              style={
                sidebarView === "mine"
                  ? {
                      color: "#8a7a62",
                      background: "#faf8f4",
                      border: "1px solid rgba(210,195,165,0.55)",
                      boxShadow: "0 1px 4px rgba(120,100,70,0.06)",
                    }
                  : {
                      color: "#646566",
                      background: "#fff",
                      border: "1px solid #ebedf0",
                      boxShadow: "none",
                    }
              }
            >
              我的
            </button>

            {campusDisplayList.map((item) => (
              <div key={item.campus} className="border-b" style={{ borderColor: "#f7f7f7" }}>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedCampus((prev) => ({ ...prev, [item.campus]: !prev[item.campus] }))
                  }
                  className="w-full px-2 py-3 flex items-center justify-between"
                >
                  <span className="text-[13px] font-semibold" style={{ color: "#323233" }}>
                    {item.campus}
                  </span>
                  <span className="text-[11px]" style={{ color: "#969799" }}>
                    {item.expanded ? "▾" : "▸"}
                  </span>
                </button>
                {item.expanded && (
                  <div className="pb-1">
                    {item.floors.map((f) => {
                      const isActive =
                        sidebarView === "campus" &&
                        campusNav.campus === item.campus &&
                        campusNav.floor === f.floor;
                      return (
                        <button
                          key={f.floor}
                          type="button"
                          onClick={() => {
                            setSidebarView("campus");
                            setCampusNav({ campus: item.campus, floor: f.floor });
                          }}
                          className="mx-0 mb-1 px-2 py-1.5 rounded-xl flex items-center justify-between gap-1 min-w-0 w-full"
                          style={{
                            color: isActive ? "#1989fa" : "#646566",
                            background: isActive ? "#e8f3ff" : "#f6f7f9",
                            fontWeight: isActive ? 600 : 400,
                            fontSize: 12,
                          }}
                        >
                          <span className="truncate">{f.floor}</span>
                          {f.floorPersonCount > 0 && (
                            <span
                              className="shrink-0 min-w-[14px] h-[15px] px-1 text-[10px] font-semibold text-white rounded-full text-center leading-[15px]"
                              style={{ background: "#ee0a24" }}
                            >
                              {f.floorPersonCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {item.floors.length === 0 && (
                      <p className="mx-1.5 mb-1 text-[11px]" style={{ color: "#c8c9cc" }}>
                        暂无楼层
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {showAuditEntry ? (
            <div
              className="shrink-0 border-t"
              style={{ borderColor: "#ebedf0", boxShadow: "0 -8px 20px rgba(15,23,42,0.06)" }}
            >
              <button
                type="button"
                onClick={() => setAuditOpen(true)}
                className="w-full py-3 text-center text-[12px] font-bold active:opacity-80"
                style={{
                  color: "#c2410c",
                  background: "linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%)",
                }}
              >
                审核入口
              </button>
            </div>
          ) : null}
        </aside>

        <section className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <header
            className="shrink-0 px-3 py-2.5 flex items-center justify-between gap-2 border-b"
            style={{ borderColor: "#ebedf0", background: "#fff" }}
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[15px] font-semibold truncate" style={{ color: "#323233" }}>
                {panelTitle}
              </span>
              <span className="text-[12px]" style={{ color: "#969799" }}>
                共 {currentRooms.length} 间
                {bundle ? ` · 全部 ${bundle.totalCount}` : ""}
                <span style={{ color: "#c8c9cc" }}> · 下拉刷新</span>
              </span>
            </div>
            <span
              className="text-[10px] px-2.5 py-1 rounded-full font-semibold shrink-0"
              style={{ color: badgeStyle.color, background: badgeStyle.background }}
            >
              {permissionBadge.text}
            </span>
          </header>

          <div
            ref={roomScrollRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pt-1 pb-4"
            onTouchStart={pullRefresh.handlers.onTouchStart}
            onTouchMove={pullRefresh.handlers.onTouchMove}
            onTouchEnd={pullRefresh.handlers.onTouchEnd}
          >
            {(pullRefresh.indicatorVisible || pullRefresh.refreshing) && (
              <div
                className="flex items-center justify-center gap-1.5 py-2 transition-opacity"
                style={{
                  opacity: pullRefresh.refreshing ? 1 : 0.35 + pullRefresh.indicatorProgress * 0.65,
                }}
              >
                <Loader2
                  className={`size-3.5 ${pullRefresh.refreshing ? "animate-spin" : ""}`}
                  style={{ color: "#969799" }}
                />
                <span className="text-[11px]" style={{ color: "#969799" }}>
                  {pullRefresh.refreshing ? "刷新中…" : "松开刷新"}
                </span>
              </div>
            )}
            {currentRooms.length === 0 ? (
              <div className="py-16 text-center">
                <DoorOpen className="size-8 mx-auto mb-2" style={{ color: "#c8c9cc" }} />
                <p className="text-xs" style={{ color: "#969799" }}>
                  {sidebarView === "mine" ? "暂无与我相关的房间" : "当前楼层暂无房间"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {currentRooms.map(({ room, access }) => (
                  <MobileRoomDotCard
                    key={String(room.roomId)}
                    room={room}
                    access={access}
                    onClick={() => {
                      if (!access.canOpenDetail) return;
                      setDetailRoom(buildDetailRoom(room));
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {detailRoom && (
        <MobileRoomDetailDialog
          detail={detailRoom}
          onClose={() => setDetailRoom(null)}
          scanDelayEnabled={bundle?.scanAnalyze?.scanDelayEnabled ?? false}
          scanDelayButtonLabel={bundle?.scanAnalyze?.scanDelayButtonLabel ?? "延迟"}
          delayOptions={currentRoomDelayOptions}
          subjectUserId={bundle?.userId}
          onSubmitDelay={handleDelaySubmit}
          onDelaySuccess={handleDelaySuccess}
        />
      )}
    </>
  );
}
