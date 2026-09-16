import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ChevronLeft } from "lucide-react";
import { GridCellButton, useGridCellWidth } from "@/pages/mobile/MobileCageShelfTab";
import { AdminSegmentedControl } from "@/components/admin/AdminSegmentedControl";
import { CageColorProvider } from "@/features/cage-shelf/components/CageColorContext";
import { displayPosition, divisionLabelOf } from "@/features/cage-shelf/constants";
import { buildCageOpMarks } from "@/features/cage-shelf/useCageOpSelect";
import { allocatedTotal } from "@/features/reference-data/cageAllocation";
import {
  fetchGroupShelves,
  fetchReservableCages,
  fetchActiveCageReservations,
  reserveCage,
  releaseCageReservation,
  type GroupShelf,
  type ReservableCell,
  type ActiveCageReservation,
} from "@/api/domains/animalOrderCage.api";
import {
  fetchLocalShelfGridsBatch,
  fetchCageOpMarkers,
  type CageShelfDetail,
  type CageShelfCell,
  type CageOpMarker,
} from "@/api/domains/cageShelf.api";
import {
  buildSelectablePool,
  buildShelfIndex,
  adoptReservedCages,
  groupShelvesByRoom,
  mergeOrderReservationMarks,
  type PickedCage,
} from "@/pages/mobile/cagePickerLogic";
import { authStorage } from "@/features/auth/authStorage";

interface Props {
  aupRecordId: string | number;
  /** 规格原文（如「性别: 雌性」），用于一笼一规格与锁定时回填 */
  specOptionLabel: string | null;
  /** 规格面板填的总数 */
  quantity: number;
  /** 已锁定笼位，数组顺序即分配顺序 */
  pickedCages: PickedCage[];
  onPickedCagesChange: (v: PickedCage[]) => void;
  /** 父组件按 allocateInOrder 算好的分配量 */
  alloc: Record<string, number>;
  /** 手动改过的数量 */
  allocPinned: Record<string, number>;
  onAllocPinnedChange: (v: Record<string, number>) => void;
  /** 从 /reservable 取到单笼上限后回报 */
  onMaxQuantityChange: (m: number) => void;
  /** 不传 = 不给关闭入口（规格面板展开时父组件就是这么传的） */
  onClose: (() => void) | undefined;
  /** 购物车「定位」：进来就直接切到该笼位所在架子并闪一下那一格 */
  focusCageId?: string | null;
  /** 「加入购物车」：动作由规格面板提供（onProvideConfirm），按钮画在这一行（照小程序） */
  onSubmit?: (() => void) | null;
  submitDisabled?: boolean;
  /** 外部请求切到「按顺序分配」页（页面标题行点「已选 N 笼 · 已分配 x/y」时 +1） */
  openAllocTick?: number;
}

const EMPTY_GROUP_SHELVES: GroupShelf[] = [];
const EMPTY_CELLS: ReservableCell[] = [];
const EMPTY_GRIDS: CageShelfDetail[] = [];
const EMPTY_MARKERS: CageOpMarker[] = [];
const EMPTY_ACTIVE: ActiveCageReservation[] = [];

/**
 * 移动壳「动物订购」的笼位选择抽屉。
 *
 * 只做抽屉本身：接收父组件传下来的状态与回调，自己渲染三页 UI（架子列表 / 80 格 / 分配）
 * 并发起锁定 / 释放请求。不接线到页面、不画遮罩与摘要条 —— 那些由后续的页面组件负责。
 */
export default function MobileCagePickerSheet({
  aupRecordId,
  specOptionLabel,
  quantity,
  pickedCages,
  onPickedCagesChange,
  alloc,
  allocPinned,
  onAllocPinnedChange,
  onMaxQuantityChange,
  onClose,
  focusCageId,
  onSubmit,
  submitDisabled,
  openAllocTick,
}: Props) {
  const [view, setView] = useState<"grid" | "alloc">("grid");
  /** 当前房间：与小程序一致，按房间切 tab、房间内所有架子纵向铺开（不再先进「架子列表」页） */
  const [activeRoomKey, setActiveRoomKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 网格单格宽度 → 格子内文字等比缩放（与笼架页同一个 hook，避免两边算两套） */
  const gridCell = useGridCellWidth();
  /** 网格「完整/简洁」：简洁档收起另有替代物的标签层（开关在网格页头部） */
  const [compactGrid, setCompactGrid] = useState(false);
  /** 定位到的那一格（`x-y`）：进来闪一下，让用户知道"就是这格" */
  const [flashCell, setFlashCell] = useState<string | null>(null);

  // ── 五个 query ────────────────────────────────────────────────
  const {
    data: groupShelvesData,
    isLoading: shelvesLoading,
    error: shelvesError,
    refetch: refetchShelves,
  } = useQuery({
    queryKey: ["animalOrderGroupShelves"],
    queryFn: fetchGroupShelves,
    staleTime: 30_000,
    retry: false,
  });

  const { data: reservable, refetch: refetchReservable } = useQuery({
    queryKey: ["animalOrderReservableCages", String(aupRecordId)],
    queryFn: () => fetchReservableCages(aupRecordId),
    staleTime: 5_000,
    retry: false,
  });

  const shelfIds = useMemo(
    () => (groupShelvesData ?? EMPTY_GROUP_SHELVES).map((s) => String(s.shelfIndexId)),
    [groupShelvesData],
  );
  const shelfIdKey = shelfIds.join(",");

  const { data: gridsData, isLoading: gridsLoading } = useQuery({
    queryKey: ["mobileCageGrids", shelfIdKey],
    queryFn: () => fetchLocalShelfGridsBatch(shelfIds),
    enabled: shelfIds.length > 0,
  });

  const { data: markersData } = useQuery({
    queryKey: ["cage-op", "markers"],
    queryFn: fetchCageOpMarkers,
    staleTime: 15_000,
  });

  const { data: activeReservationsData } = useQuery({
    queryKey: ["cage-reservations", "active"],
    queryFn: fetchActiveCageReservations,
    staleTime: 15_000,
  });

  // 稳定引用兜底：避免在 useMemo 依赖里写 `?? []`（每次渲染都是新数组 → useMemo 失效）
  const groupShelves = groupShelvesData ?? EMPTY_GROUP_SHELVES;
  const reservableCells = reservable?.cells ?? EMPTY_CELLS;
  const grids = gridsData ?? EMPTY_GRIDS;
  const markers = markersData ?? EMPTY_MARKERS;
  const activeReservations = activeReservationsData ?? EMPTY_ACTIVE;

  // ── 内部派生（全部走 cagePickerLogic） ────────────────────────
  const selectablePool = useMemo(
    () => buildSelectablePool(reservableCells, specOptionLabel),
    [reservableCells, specOptionLabel],
  );

  const shelfIndex = useMemo(() => buildShelfIndex(grids), [grids]);

  const opMarks = useMemo(
    () => mergeOrderReservationMarks(buildCageOpMarks(markers), activeReservations),
    [markers, activeReservations],
  );

  const rooms = useMemo(() => groupShelvesByRoom(groupShelves), [groupShelves]);

  /** shelfIndexId → 架子（列表页每行取 shelveName / 楼层等次要文字） */
  const shelfByShelfIndexId = useMemo(() => {
    const m = new Map<string, GroupShelf>();
    for (const s of groupShelves) m.set(String(s.shelfIndexId), s);
    return m;
  }, [groupShelves]);

  /** shelfIndexId → 网格明细（网格页渲染对应那一架） */
  const gridByShelfId = useMemo(() => {
    const m = new Map<string, CageShelfDetail>();
    for (const d of grids) m.set(String(d.shelfMeta.shelfIndexId), d);
    return m;
  }, [grids]);

  /** shelfIndexId → 该架可点数（网格里 cell id 落在 selectablePool 里的个数） */
  const selectableCountByShelfId = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of grids) {
      let n = 0;
      for (const c of d.grid) {
        const id = String(c.id ?? "");
        if (id && selectablePool.has(id)) n++;
      }
      m.set(String(d.shelfMeta.shelfIndexId), n);
    }
    return m;
  }, [grids, selectablePool]);

  /** shelfIndexId → 已选笼位数（列表页「已选 M」徽标） */
  const pickedCountByShelfId = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of pickedCages) {
      const k = r.shelfIndexId ?? "";
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [pickedCages]);

  const pickedIds = useMemo(
    () => new Set(pickedCages.map((r) => r.animalCageId)),
    [pickedCages],
  );

  /**
   * 「不可选」网纹的原因表：与 PC 的 CagePickerPanel 同一套口径。
   * 不在本单 AUP 名下 → 只盖网纹不写字（那批常常占大半屏，「不属本单」纯属噪音）；
   * 池内但被挡的 → 按后端 reason 归类成短标签。已选中的不算不可选。
   */
  const disabledReasonByCageId = useMemo(() => {
    const metaById = new Map(reservableCells.map((c) => [String(c.animalCageId), c]));
    const m = new Map<string, string>();
    for (const d of grids) {
      for (const c of d.grid) {
        const id = String(c.id ?? "");
        if (!id || pickedIds.has(id) || selectablePool.has(id)) continue;
        const meta = metaById.get(id);
        if (!meta) m.set(id, "");
        else if (!meta.selectable) {
          m.set(id,
            meta.cartState === "ORDERED" ? "已下单待审"
              : meta.cartState === "IN_CART" ? "已在购物车"
                : meta.cartState === "SELECTING" ? "已被预订"
                  : "不可预定");
        } else m.set(id, "性别不符");
      }
    }
    return m;
  }, [grids, pickedIds, selectablePool, reservableCells]);

  /** 当前账号 id：把划分名单判成「划给你」还是「划给别人」（与笼架页同一判定） */
  const meId = String(authStorage.getUserInfo()?.id ?? "");

  const maxQuantityPerCage = reservable?.maxQuantityPerCage ?? 0;

  // 单笼上限回报给父组件（父组件用它算分配）
  useEffect(() => {
    if (maxQuantityPerCage > 0) onMaxQuantityChange?.(maxQuantityPerCage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxQuantityPerCage]);

  // ── 接回已锁笼位（refresh 后页面状态丢了；不接回会显示成可点空格子、点了撞 409） ──
  const adoptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (activeReservations.length === 0) return;
    const add = adoptReservedCages({
      cells: reservableCells,
      active: activeReservations,
      picked: pickedCages,
      shelfIndex,
    });
    const fresh = add.filter((c) => !adoptedRef.current.has(c.animalCageId));
    if (fresh.length === 0) return;
    for (const c of fresh) adoptedRef.current.add(c.animalCageId);
    onPickedCagesChange([...pickedCages, ...fresh]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservableCells, activeReservations, shelfIndex]);

  /** 当前房间（还没定时取第一个）：房间内所有架子纵向铺开，与小程序一致 */
  const activeRoom = useMemo(
    () => rooms.find((r) => r.roomKey === activeRoomKey) ?? rooms[0] ?? null,
    [rooms, activeRoomKey],
  );
  const roomShelfIds = activeRoom ? activeRoom.shelfIndexIds : [];

  /** 默认落在「有可选笼位」的房间上；没有可选就落第一个 */
  useEffect(() => {
    if (activeRoomKey || rooms.length === 0) return;
    const withSelectable = rooms.find((r) =>
      r.shelfIndexIds.some((sid) => (selectableCountByShelfId.get(sid) ?? 0) > 0),
    );
    setActiveRoomKey((withSelectable ?? rooms[0]).roomKey);
  }, [rooms, activeRoomKey, selectableCountByShelfId]);

  /**
   * 购物车「定位」：切到目标笼位所在房间、回到网格、把那一格闪出来。
   * 与 PC CagePickerPanel 的 focusCageId 同一套语义（那边是并排面板切房间，这边是整页）。
   */
  useEffect(() => {
    if (!focusCageId || grids.length === 0) return;
    for (const d of grids) {
      const cell = d.grid.find((c) => String((c as { id?: string }).id ?? "") === String(focusCageId));
      if (!cell) continue;
      const sid = String(d.shelfMeta.shelfIndexId);
      const room = rooms.find((r) => r.shelfIndexIds.includes(sid));
      if (room) setActiveRoomKey(room.roomKey);
      setView("grid");
      setFlashCell(`${cell.x}-${cell.y}`);
      const timer = window.setTimeout(() => setFlashCell(null), 1400);
      return () => window.clearTimeout(timer);
    }
  }, [focusCageId, grids, rooms]);

  /** 分配页的「返回」只回网格；网格页就是首页，没有上级 */
  const handleBack = () => setView("grid");

  /** 页面标题行点进度 → 切到分配页（底栏那条已删，不再为它单占一行） */
  useEffect(() => {
    if (openAllocTick && openAllocTick > 0) setView("alloc");
  }, [openAllocTick]);

  const handleCancel = async (cageId: string) => {
    const existing = pickedCages.find((r) => r.animalCageId === cageId);
    if (!existing) return;
    onPickedCagesChange(pickedCages.filter((r) => r.animalCageId !== cageId));
    const pinnedNext = { ...allocPinned };
    delete pinnedNext[cageId];
    onAllocPinnedChange(pinnedNext);
    try {
      await releaseCageReservation(existing.reservationId);
    } catch {
      // 启动清理兜底
    }
  };

  const handleLock = async (cell: CageShelfCell, cageId: string) => {
    const shelfMeta = shelfIndex.get(cageId)?.shelfMeta;
    setBusy(true);
    try {
      const created = await reserveCage({
        aupRecordId,
        animalCageId: cageId,
        specOptionLabel: specOptionLabel ?? null,
        // 数量交给分配页决定；先按 0 占位，加购时按实际分配量改
        quantity: 0,
      });
      const where = [shelfMeta?.roomName, shelfMeta?.shelveName].filter(Boolean).join(" ");
      onPickedCagesChange([
        ...pickedCages,
        {
          reservationId: created.id,
          animalCageId: created.animalCageId,
          label: `${where} (${cell.x},${cell.y})`.trim(),
          roomId: shelfMeta?.roomId != null ? String(shelfMeta.roomId) : null,
          roomName: shelfMeta?.roomName ?? null,
          shelveName: shelfMeta?.shelveName ?? null,
          shelfIndexId: shelfMeta?.shelfIndexId != null ? String(shelfMeta.shelfIndexId) : null,
        },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "预定笼位失败");
      void refetchReservable();
    } finally {
      setBusy(false);
    }
  };

  const handleCellClick = async (cell: CageShelfCell) => {
    if (busy) return;
    const cageId = String(cell.id ?? "");
    if (!cageId) {
      toast.error("这个位置没有笼位");
      return;
    }
    // 已选 → 取消（优先于可选判定：自己锁定的笼位刷新后可能已不在池里，仍要能取消）
    if (pickedIds.has(cageId)) {
      await handleCancel(cageId);
      return;
    }
    if (!selectablePool.has(cageId)) {
      const meta = reservableCells.find((c) => String(c.animalCageId) === cageId);
      toast.error(meta?.reason || "该笼位不在本单 AUP 名下，不能预定");
      return;
    }
    await handleLock(cell, cageId);
  };

  const handleClearAll = () => {
    const cur = pickedCages;
    onPickedCagesChange([]);
    onAllocPinnedChange({});
    for (const r of cur) {
      void releaseCageReservation(r.reservationId).catch(() => {
        // 启动清理兜底
      });
    }
  };

  const allocated = allocatedTotal(alloc);
  const overflow = Math.max(0, allocated - quantity);
  const unallocated = Math.max(0, quantity - allocated);

  /** 房间胶囊：只返回胶囊本身，外层行由头部那一行统一排版（tab 与动作同行，照小程序） */
  const renderRoomTabs = () => {
    if (rooms.length === 0) return null;
    if (rooms.length === 1) {
      return <span className="shrink-0 text-xs text-[var(--student-mute)]">{activeRoom?.roomName}</span>;
    }
    return (
      <>
        {rooms.map((room) => {
          const on = activeRoom?.roomKey === room.roomKey;
          const picked = room.shelfIndexIds.reduce((n, sid) => n + (pickedCountByShelfId.get(sid) ?? 0), 0);
          return (
            <button
              key={room.roomKey}
              type="button"
              onClick={() => setActiveRoomKey(room.roomKey)}
              className={
                on
                  ? "shrink-0 rounded-full bg-[var(--student-primary)] px-2.5 py-0.5 text-xs font-medium text-[var(--student-primary-foreground)]"
                  : "shrink-0 rounded-full border border-[var(--student-hairline)] px-2.5 py-0.5 text-xs text-[var(--student-mute)]"
              }
            >
              {room.roomName}
              {picked > 0 && <span className="ml-1 opacity-90">·{picked}</span>}
            </button>
          );
        })}
      </>
    );
  };

  /** 单个格子：与笼架信息页共用同一个组件（GridCellButton），抽屉里不另写一套渲染 */
  const renderCell = (cell: CageShelfCell) => {
    const cageId = String(cell.id ?? "");
    return (
      <div key={cell.position} className="relative">
        <GridCellButton
          cell={cell}
          onSelect={() => void handleCellClick(cell)}
          selected={cageId ? pickedIds.has(cageId) : false}
          isPoolCell={cageId ? selectablePool.has(cageId) : false}
          opMarker={cageId ? opMarks.get(cageId) : undefined}
          divisionLabel={divisionLabelOf(cell, meId)}
          disabledReason={cageId ? disabledReasonByCageId.get(cageId) : undefined}
          compact={compactGrid}
        />
        {flashCell === `${cell.x}-${cell.y}` && (
          <div className="scan-flash-overlay pointer-events-none absolute inset-0 z-10 rounded-md ring-[4px] ring-red-500/80 shadow-[0_0_16px_rgba(239,68,68,0.5)]" />
        )}
      </div>
    );
  };

  /**
   * 网格页：当前房间的每一架纵向铺开（照小程序，不再先过一层「架子列表」）。
   * 每架头一行给架名 + 可选数 + 已选数 —— 原来靠列表页传达的信息挪到这里，少一次点击。
   */
  const renderGridContent = () => {
    if (groupShelves.length === 0) {
      if (shelvesLoading) return <div className="py-10 text-center text-sm text-[var(--student-mute)]">加载中…</div>;
      if (shelvesError) {
        return (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <p className="px-4 text-center text-xs text-[var(--student-mute)]">
              {shelvesError instanceof Error ? shelvesError.message : "加载本课题组笼架失败"}
            </p>
            <button
              type="button"
              onClick={() => refetchShelves()}
              className="rounded-full bg-[var(--student-primary)] px-5 py-2 text-sm font-medium text-[var(--student-primary-foreground)]"
            >
              重试
            </button>
          </div>
        );
      }
      return (
        <div className="px-4 py-10 text-center text-xs text-[var(--student-mute)]">
          本课题组名下暂无笼架。若确实有笼位，请联系管理员确认笼位的课题归属。
        </div>
      );
    }
    if (roomShelfIds.length === 0) {
      return (
        <div className="py-10 text-center text-sm text-[var(--student-mute)]">
          {gridsLoading ? "加载中…" : "该房间暂无可渲染的笼位"}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {roomShelfIds.map((sid) => {
          const detail = gridByShelfId.get(sid);
          if (!detail) return null;
          const shelf = shelfByShelfIndexId.get(sid);
          return (
            <div key={sid}>
              {/* 架头只写架名（照小程序）：可选/已选计数是噪音——网格自己用可点环和选中环表达了 */}
              <div className="mb-1 px-1 text-xs font-semibold text-[var(--student-ink)]">
                {shelf?.shelveName || detail.shelfMeta?.shelveName || sid}
              </div>
              <div ref={gridCell.ref} style={gridCell.style} className="ao-cell-grid grid grid-cols-8 gap-[3px] rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-white p-1.5">
                {detail.grid.map(renderCell)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── 第 3 页：分配 ─────────────────────────────────────────────
  const renderAllocContent = () => (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-[var(--student-hairline)] px-3 py-2">
        <div className="text-xs font-semibold text-[var(--student-ink)]">按顺序分配</div>
        <div className="mt-0.5 text-[11px] leading-snug text-[var(--student-mute)]">
          总数 {quantity} ｜ 已分配 {allocated}
          {unallocated > 0 && <span className="text-amber-600"> ｜ 还差 {unallocated}</span>}
          {overflow > 0 && <span className="text-red-500"> ｜ 超了 {overflow}</span>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {pickedCages.map((cage, i) => {
          const qty = alloc[cage.animalCageId] || 0;
          const entry = shelfIndex.get(cage.animalCageId);
          const cell = entry?.cell ?? null;
          const posLabel = cell ? displayPosition(cell.position) : "";
          return (
            <div
              key={cage.animalCageId}
              onClick={() => {
                // 定位不到架子就别跳 —— 孤儿预留的 shelfIndexId 为空，跳过去只会卡在网格页
                const sid = cage.shelfIndexId;
                if (!sid || !gridByShelfId.has(sid)) {
                  toast.error("该笼位所在笼架已不在本课题组名下，无法定位到架子");
                  return;
                }
                const room = rooms.find((r) => r.shelfIndexIds.includes(sid));
                if (room) setActiveRoomKey(room.roomKey);
                setView("grid");
              }}
              className="mb-1.5 flex items-center gap-2 rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-white p-1.5"
            >
              {/* 该笼位的格子：定边长方框，靠 GridCellButton 自身 w-full aspect-square 填满，不缩放不覆盖字号 */}
              <div className="w-14 shrink-0">
                {cell ? (
                  <GridCellButton cell={cell} onSelect={() => {}} />
                ) : (
                  <div className="grid aspect-square w-full place-items-center rounded-[var(--student-radius-sm)] border border-dashed border-[var(--student-hairline)] text-[10px] text-[var(--student-mute)]">
                    笼位
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="grid size-4 shrink-0 place-items-center rounded bg-sky-500 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="truncate text-xs text-[var(--student-body)]">{posLabel || "笼位"}</span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-[var(--student-mute)]">
                  {cage.shelveName || cage.label}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={qty <= 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAllocPinnedChange({ ...allocPinned, [cage.animalCageId]: Math.max(0, qty - 1) });
                  }}
                  className="size-10 rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] text-base font-bold text-[var(--student-body)] disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm font-semibold text-[var(--student-ink)]">{qty}</span>
                <button
                  type="button"
                  disabled={maxQuantityPerCage <= 0 || qty >= maxQuantityPerCage}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAllocPinnedChange({
                      ...allocPinned,
                      [cage.animalCageId]: Math.min(maxQuantityPerCage, qty + 1),
                    });
                  }}
                  className="size-10 rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] text-base font-bold text-[var(--student-primary-foreground)] disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-[var(--student-hairline)] px-3 py-2">
        <button
          type="button"
          onClick={handleClearAll}
          className="min-h-[44px] w-full rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] px-2 text-sm text-[var(--student-mute)] hover:text-[var(--student-ink)]"
        >
          取消全部（{pickedCages.length}）
        </button>
      </div>
    </div>
  );

  return (
    <CageColorProvider>
      {/* 定位闪光的关键帧：笼架页把同一段内联在页面里，这里照抄（不引全局 CSS 是怕影响别的壳） */}
      <style>{`@keyframes scan-flash{0%{opacity:0.2;transform:scale(0.95)}30%{opacity:0.85;transform:scale(1.03)}100%{opacity:0.35;transform:scale(1)}}.scan-flash-overlay{animation:scan-flash 0.5s ease-in-out 2;pointer-events:none}`}</style>
      {/*
        只渲染面板本身，**不自己 fixed、不画遮罩**。
        页面会把「摘要条 + 规格面板 + 本抽屉」放进同一张 `fixed inset-0` 底部面板的 flex 列里
        （抽屉是其中最下面那段 `min-h-0 flex-1`），这样规格面板升起时抽屉被自然顶上去。
        也不能 createPortal：`--twin-*` → `--student-*` 的令牌重映射只在 `.mobile-student-shell`
        作用域内生效，portal 出去格子和面板都会丢令牌。
      */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[var(--student-radius-lg)] bg-[var(--student-surface-raised)]">
        {/* 一行头（照小程序）：房间 tab 横滚 + 完整/简洁 + 取消 + 加入购物车。
            之前「选择笼位」大字标题、房间行、动作行各占一行，三行全是边角内容 */}
        {view === "alloc" ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--student-hairline)] px-2 py-1.5">
            <button
              type="button"
              onClick={handleBack}
              className="flex min-h-[34px] shrink-0 items-center gap-0.5 text-sm font-semibold text-[var(--student-ink)]"
            >
              <ChevronLeft className="size-4 shrink-0 text-[var(--student-mute)]" />
              按顺序分配
            </button>
            <span className="ml-auto min-w-0 truncate text-[11px] text-[var(--student-mute)]">
              总数 {quantity} ｜ 已分配 {allocated}
              {unallocated > 0 && <span className="text-amber-600"> ｜ 还差 {unallocated}</span>}
              {overflow > 0 && <span className="text-red-500"> ｜ 超了 {overflow}</span>}
            </span>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--student-hairline)] px-2 py-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
              {renderRoomTabs()}
            </div>
            {/* 网格完整/简洁：只收起另有替代物的标签层，底色/网纹/图标一律不动 */}
            <AdminSegmentedControl
              className="shrink-0 [--app-color-accent:var(--student-primary)] [--app-color-surface-hover:var(--student-canvas-soft)] [--app-color-surface-container:var(--student-canvas)]"
              size="sm"
              aria-label="网格显示"
              value={compactGrid ? "compact" : "full"}
              onChange={(v) => setCompactGrid(v === "compact")}
              options={[
                { value: "full", label: "完整" },
                { value: "compact", label: "简洁" },
              ]}
            />
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] px-2.5 py-1 text-xs text-[var(--student-body)]"
              >
                取消
              </button>
            )}
            <button
              type="button"
              disabled={submitDisabled}
              onClick={() => onSubmit?.()}
              className="shrink-0 rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] px-2.5 py-1 text-xs font-medium text-[var(--student-primary-foreground)] disabled:opacity-50"
            >
              加入购物车
            </button>
          </div>
        )}

        {/* 内容区 */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {view === "grid" && <div className="h-full overflow-y-auto px-3 py-3">{renderGridContent()}</div>}
          {view === "alloc" && renderAllocContent()}
        </div>
      </div>
    </CageColorProvider>
  );
}
