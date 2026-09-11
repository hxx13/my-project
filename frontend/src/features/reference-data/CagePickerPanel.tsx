import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { ShelfGrid } from "@/features/cage-shelf/components/ShelfGrid";
import { CellButton } from "@/features/cage-shelf/components/CellButton";
import { displayPosition } from "@/features/cage-shelf/constants";
import {
  fetchLocalShelfGridsBatch,
  fetchCageOpMarkers,
  type CageShelfCell,
  type PoolCell,
} from "@/api/domains/cageShelf.api";
import {
  fetchReservableCages,
  fetchGroupShelves,
  fetchActiveCageReservations,
  reserveCage,
  releaseCageReservation,
  type ReservableCell,
} from "@/api/domains/animalOrderCage.api";
import { buildCageOpMarks } from "@/features/cage-shelf/useCageOpSelect";
import CageOpDrawer from "@/components/cage/CageOpDrawer";
import { allocatedTotal } from "./cageAllocation";

/** 抽屉里的一个已锁定笼位 */
export interface PickedCage {
  reservationId: string;
  animalCageId: string;
  label: string;
  /** 笼位所在房间 → 弹窗「领用方式/房间」由它自动带出 */
  roomId?: string | null;
  roomName?: string | null;
  /** 所属笼架名（分配列里显示在格子正下方） */
  shelveName?: string | null;
}

interface Props {
  aupRecordId: number | string;
  /** 规格选项原文「模板名: 选项」；用于一笼一规格预判与表单回填 */
  specOptionLabel?: string | null;
  /** 规格弹窗填的总数：多选时的分配总和必须等于它 */
  quantity: number;
  /** 已锁定的笼位，**顺序即分配顺序** */
  reservations: PickedCage[];
  onReservationsChange: (list: PickedCage[]) => void;
  /** cageId → 分配数量（页面按 allocateInOrder 算好传进来） */
  alloc: Record<string, number>;
  /** 手动改过的笼位（作为下次分配的起点） */
  allocPinned: Record<string, number>;
  onAllocPinnedChange: (pinned: Record<string, number>) => void;
  /** 单笼上限从 /reservable 取到后回报给页面（页面要用它算分配） */
  onMaxQuantityChange?: (max: number) => void;
  /** 要聚焦的笼位（购物车点「定位」传进来）：切到它所在房间并在网格上闪一下 */
  focusCageId?: string | null;
  /** 关闭入口；不传 = 不给关闭（规格弹窗还开着时就是这样，只能关弹窗） */
  onClose?: () => void;
  /** 抽屉宽度；笼架格子密，默认放宽 */
  width?: number;
  /** 与规格弹窗同处一个文档流（由页面级浮层容器并排布局），不再自己 fixed */
  embedded?: boolean;
}

const EMPTY_ALERTS = new Map();
/** 已选笼位的醒目色环 */
const PICKED_COLOR = "#0ea5e9";

/** 「雌性」「雄性」这类词只认明确写法，认不出不猜，交给后端再判一次 */
function sexOf(label?: string | null): string | null {
  if (!label) return null;
  const lower = label.toLowerCase();
  if (label.includes("雌") || lower.includes("female")) return "雌性";
  if (label.includes("雄") || lower.includes("male")) return "雄性";
  return null;
}

/**
 * 订购时的笼位选择抽屉。
 *
 * 渲染本课题组占用笼架（**与 AUP 无关**，按课题组取），其中该 AUP 名下、type2 且没有
 * 特殊状态/划分限制的空笼位可点。**支持连续多选**，点到哪个锁哪个；选中后最右侧自动
 * 展开「分配」列，把规格弹窗填的总数按顺序 5 只/笼铺到这些笼位上。
 */
export default function CagePickerPanel({
  aupRecordId,
  specOptionLabel,
  quantity,
  reservations,
  onReservationsChange,
  alloc,
  allocPinned,
  onAllocPinnedChange,
  onMaxQuantityChange,
  focusCageId,
  onClose,
  width = 620,
  embedded = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const mySex = useMemo(() => sexOf(specOptionLabel), [specOptionLabel]);

  // 渲染范围：本课题组的笼架。**与 AUP 无关** —— AUP 只决定格子能不能点。
  const {
    data: groupShelves = [],
    isLoading: shelvesLoading,
    error: shelvesError,
  } = useQuery({
    queryKey: ["animalOrderGroupShelves"],
    queryFn: fetchGroupShelves,
    staleTime: 30_000,
    retry: false,
  });

  /** 按房间分组：抽屉顶部分页 tab 按房间切，一次只渲染一个房间的笼架 */
  const rooms = useMemo(() => {
    const m = new Map<string, { key: string; name: string; shelfIds: string[] }>();
    for (const s of groupShelves) {
      const key = s.roomId != null && String(s.roomId) !== "" ? String(s.roomId) : String(s.roomName ?? "");
      if (!key) continue;
      if (!m.has(key)) m.set(key, { key, name: s.roomName || key, shelfIds: [] });
      m.get(key)!.shelfIds.push(String(s.shelfIndexId));
    }
    return [...m.values()];
  }, [groupShelves]);

  const [activeRoomKey, setActiveRoomKey] = useState<string | null>(null);

  // 房间列表变化（换 AUP / 课题组归属变了）时：留在原房间，原房间没了才落到第一个
  useEffect(() => {
    if (rooms.length === 0) {
      if (activeRoomKey !== null) setActiveRoomKey(null);
      return;
    }
    if (!activeRoomKey || !rooms.some((r) => r.key === activeRoomKey)) {
      setActiveRoomKey(rooms[0].key);
    }
  }, [rooms, activeRoomKey]);

  // 新选中的笼位在别的房间时切过去，否则高亮在别的 tab 里看不见。
  // 只在「最后选中的那个变了」时跳，不跟着 rooms 变，免得手动切 tab 被抢回去。
  const lastPicked = reservations.length > 0 ? reservations[reservations.length - 1] : null;
  const lastPickedRoomId = lastPicked?.roomId ?? null;
  useEffect(() => {
    if (lastPickedRoomId == null || String(lastPickedRoomId) === "") return;
    setActiveRoomKey(String(lastPickedRoomId));
  }, [lastPickedRoomId]);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.key === activeRoomKey) ?? null,
    [rooms, activeRoomKey],
  );

  // 拉**全部**笼架：分配列要还原每个已选笼位原本的格子（可能不在当前房间），
  // 光有当前房间的网格画不出来。房间 tab 只过滤「网格区渲染哪几架」。
  const shelfIds = useMemo(
    () => groupShelves.map((s) => String(s.shelfIndexId)),
    [groupShelves],
  );
  const shelfIdKey = shelfIds.join(",");

  const { data: grids = [], isLoading: gridsLoading } = useQuery({
    queryKey: ["animalOrderCageGrids", shelfIdKey],
    queryFn: () => fetchLocalShelfGridsBatch(shelfIds),
    enabled: shelfIds.length > 0,
    staleTime: 5_000,
  });

  /** 网格区只渲染当前房间的架子 */
  const visibleGrids = useMemo(() => {
    if (!activeRoom) return grids;
    const ids = new Set(activeRoom.shelfIds);
    return grids.filter((g) => ids.has(String(g.shelfMeta.shelfIndexId)));
  }, [grids, activeRoom]);

  /** cageId → 格子：分配列直接复用格子组件渲染，坐标也用渲染映射（A-10）而不是 1-1 */
  const cellByCageId = useMemo(() => {
    const m = new Map<string, CageShelfCell>();
    for (const d of grids) {
      for (const c of d.grid) {
        const id = String((c as { id?: string }).id ?? "");
        if (id) m.set(id, c);
      }
    }
    return m;
  }, [grids]);

  // 可点性：后端按 AUP + type2 + 未被他人预定 + 无特殊状态 + 划分名单现算
  const { data: reservable, refetch } = useQuery({
    queryKey: ["animalOrderReservableCages", String(aupRecordId)],
    queryFn: () => fetchReservableCages(aupRecordId),
    staleTime: 5_000,
    retry: false,
  });

  /** cageId → 可点性元数据（含不可点的 reason），点灰格时用它给出提示 */
  const cellMetaByCageId = useMemo(() => {
    const m = new Map<string, ReservableCell>();
    for (const c of reservable?.cells ?? []) m.set(String(c.animalCageId), c);
    return m;
  }, [reservable]);

  /** 能否点：后端说可点，且笼位没放不同规格的动物（一笼一规格） */
  const selectableIds = useMemo(() => {
    const out = new Set<string>();
    for (const c of reservable?.cells ?? []) {
      if (!c.selectable) continue;
      if (mySex && c.sex && c.sex !== mySex) continue;
      out.add(String(c.animalCageId));
    }
    return out;
  }, [reservable, mySex]);

  const poolCells = useMemo(() => {
    const m = new Map<string, PoolCell>();
    for (const detail of grids) {
      for (const cell of detail.grid) {
        const id = String((cell as { id?: string }).id ?? "");
        if (id && selectableIds.has(id)) m.set(id, cell as unknown as PoolCell);
      }
    }
    return m;
  }, [grids, selectableIds]);

  const pickedIds = useMemo(
    () => new Set(reservations.map((r) => r.animalCageId)),
    [reservations],
  );

  /** 已选格画成勾选态 + 醒目色环：ShelfGrid 按 shelveId:x:y 比对 */
  const selectedCells = useMemo(() => {
    const out = new Set<string>();
    if (reservations.length === 0) return out;
    for (const detail of grids) {
      for (const cell of detail.grid) {
        const id = String((cell as { id?: string }).id ?? "");
        if (id && pickedIds.has(id)) out.add(`${detail.shelfMeta.shelveId}:${cell.x}:${cell.y}`);
      }
    }
    return out;
  }, [grids, pickedIds, reservations.length]);

  const pickedHighlight = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reservations) m.set(r.animalCageId, PICKED_COLOR);
    return m;
  }, [reservations]);

  const maxQuantity = reservable?.maxQuantityPerCage ?? 0;
  useEffect(() => {
    if (maxQuantity > 0) onMaxQuantityChange?.(maxQuantity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxQuantity]);

  /** 购物车「定位」：切到目标笼位所在房间并在网格上把它闪出来（scanLockTarget = 现成的闪光定位） */
  const [locateTarget, setLocateTarget] = useState<{ sid: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!focusCageId || grids.length === 0) return;
    for (const d of grids) {
      const cell = d.grid.find((c) => String((c as { id?: string }).id ?? "") === focusCageId);
      if (!cell) continue;
      if (d.shelfMeta.roomId != null) setActiveRoomKey(String(d.shelfMeta.roomId));
      setLocateTarget({ sid: String(d.shelfMeta.shelveId ?? ""), x: cell.x, y: cell.y });
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCageId, grids]);

  /**
   * 不可点格子的**可见标签** —— 光把格子变灰、只在点击时 toast 是不够的，
   * 用户看不出「为什么这个空格子不能点」。复用笼架页那套中间态标记通道：
   *  - 分笼/转移在审 → 现成的「分笼审核中/转移审核中」色条 + 色环
   *  - 已被他人预定 → 同通道打一条琥珀「已被 X 预订」
   * （特殊状态那类由格子自身的状态 chips 表达，网格组件已经渲染。）
   */
  const { data: opMarkers = [] } = useQuery({
    queryKey: ["cage-op", "markers"],
    queryFn: fetchCageOpMarkers,
    staleTime: 15_000,
  });
  const { data: activeReservations = [] } = useQuery({
    queryKey: ["cage-reservations", "active"],
    queryFn: fetchActiveCageReservations,
    staleTime: 15_000,
  });
  const opMarkByCageId = useMemo(() => {
    const m = buildCageOpMarks(opMarkers);
    for (const r of activeReservations) {
      const key = String(r.animalCageId);
      if (m.has(key)) continue;
      /*
        三档预定中间态，画成不同颜色/文案，**同组所有人都看得到**（/active 是全局的）：
          ORDERRED 已下单待审批 / IN_CART 已在购物车（等 PI 提交）/ SELECTING 别人正在选
        不加这条的话，那些笼位只是变灰、看不出到底卡在哪一步。
      */
      const ordered = !!r.orderId;
      const inCart = !ordered && !!r.cartId;
      m.set(key, {
        requestId: String(r.reservationId),
        kind: "reserve",
        color: ordered ? "#8b5cf6" : inCart ? "#0ea5e9" : "#f59e0b",
        label: ordered ? "已下单待审批" : inCart ? "已在购物车" : `已被${r.reserverName || "他人"}预订`,
      });
    }
    return m;
  }, [opMarkers, activeReservations]);

  /**
   * 把自己**已锁定**的笼位接回「已选」态。
   * 预定是持久的（笼位保持 type2，只有 cage_order_reservation 记着），刷新页面或重开抽屉
   * 后页面状态会丢；不接回来的话它们会显示成「可点的空格子」，点了反而撞唯一索引报 409。
   */
  const myReservedIds = useMemo(
    () => new Set((reservable?.cells ?? []).filter((c) => c.reservedByMe).map((c) => String(c.animalCageId))),
    [reservable],
  );
  useEffect(() => {
    if (myReservedIds.size === 0 || activeReservations.length === 0) return;
    const have = new Set(reservations.map((r) => r.animalCageId));
    const add: PickedCage[] = [];
    for (const id of myReservedIds) {
      if (have.has(id)) continue;
      const active = activeReservations.find((r) => String(r.animalCageId) === id);
      if (!active) continue;
      // 已经挂到购物车行的属于「加购已完成」，不接回选择态 —— 否则加购完上次的选择又冒出来
      if (active.cartId) continue;
      const detail = grids.find((d) =>
        d.grid.some((c) => String((c as { id?: string }).id ?? "") === id),
      );
      const cell = detail?.grid.find((c) => String((c as { id?: string }).id ?? "") === id);
      const where = [detail?.shelfMeta?.roomName, detail?.shelfMeta?.shelveName].filter(Boolean).join(" ");
      add.push({
        reservationId: String(active.reservationId),
        animalCageId: id,
        label: cell ? `${where} (${cell.x},${cell.y})` : where || "已锁定",
        roomId: detail?.shelfMeta?.roomId != null ? String(detail.shelfMeta.roomId) : null,
        roomName: detail?.shelfMeta?.roomName ?? null,
        shelveName: detail?.shelfMeta?.shelveName ?? null,
      });
    }
    if (add.length > 0) onReservationsChange([...reservations, ...add]);
  }, [myReservedIds, activeReservations, grids, reservations, onReservationsChange]);

  /**
   * 点不可选的格子也要有反馈 —— ShelfGrid 只对「池内可选格子」触发 onToggleCell，
   * 灰格只会走 onCellClick；不接这个回调就是「点了没反应」。
   */
  const handleCellClick = (cell: CageShelfCell) => {
    const id = String((cell as { id?: string }).id ?? "");
    if (!id) {
      toast.error("这个位置没有笼位");
      return;
    }
    if (pickedIds.has(id)) return;
    const meta = cellMetaByCageId.get(id);
    if (!meta) {
      toast.error("该笼位不在本单 AUP 名下，不能预定");
      return;
    }
    if (!meta.selectable) {
      toast.error(meta.reason || "该笼位当前不可预定");
      return;
    }
    if (mySex && meta.sex && meta.sex !== mySex) {
      toast.error(`该笼位已放入「${meta.sex}」，仅限同一种规格，请换笼位`);
    }
  };

  /** 连续多选：点一下加一个；再点已选的取消并释放 */
  const handleToggle = async (shelveId: string, x: number, y: number) => {
    if (busy) return;
    const detail = grids.find((d) => String(d.shelfMeta.shelveId) === String(shelveId));
    const cell = detail?.grid.find((c) => c.x === x && c.y === y);
    const cageId = String((cell as { id?: string } | undefined)?.id ?? "");
    if (!cageId) return;

    // 取消已选
    const existing = reservations.find((r) => r.animalCageId === cageId);
    if (existing) {
      const next = reservations.filter((r) => r.animalCageId !== cageId);
      onReservationsChange(next);
      const pinnedNext = { ...allocPinned };
      delete pinnedNext[cageId];
      onAllocPinnedChange(pinnedNext);
      try {
        await releaseCageReservation(existing.reservationId);
      } catch {
        // 启动清理兜底
      }
      return;
    }

    // 不再要求「先填数量再选笼位」：正常顺序就是先点笼位、总数再由笼位数决定上限，
    // 拦在数量上会让整个过程倒过来走。
    setBusy(true);
    try {
      const created = await reserveCage({
        aupRecordId,
        animalCageId: cageId,
        specOptionLabel: specOptionLabel ?? null,
        // 数量交给分配列决定；先按 0 占位，加购时按实际分配量改
        quantity: 0,
      });
      const where = [detail?.shelfMeta?.roomName, detail?.shelfMeta?.shelveName]
        .filter(Boolean)
        .join(" ");
      onReservationsChange([
        ...reservations,
        {
          reservationId: created.id,
          animalCageId: created.animalCageId,
          label: `${where} (${x},${y})`,
          roomId: detail?.shelfMeta?.roomId != null ? String(detail.shelfMeta.roomId) : null,
          roomName: detail?.shelfMeta?.roomName ?? null,
          shelveName: detail?.shelfMeta?.shelveName ?? null,
        },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "预定笼位失败");
      void refetch();
    } finally {
      setBusy(false);
    }
  };

  const handleClearAll = () => {
    const cur = reservations;
    onReservationsChange([]);
    onAllocPinnedChange({});
    for (const r of cur) {
      void releaseCageReservation(r.reservationId).catch(() => {
        /* 启动清理兜底 */
      });
    }
  };

  const moveCage = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= reservations.length) return;
    const next = [...reservations];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    onReservationsChange(next);
  };

  const loading = shelvesLoading || (shelfIds.length > 0 && gridsLoading);

  /** 房间分页：与关闭按钮**同一行**（挂在抽屉头的 headerExtra 里），一次只看一个房间的笼架 */
  const roomTabs =
    rooms.length > 1 ? (
      <div
        className="flex min-w-0 gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {rooms.map((r) => {
          const active = r.key === activeRoomKey;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setActiveRoomKey(r.key)}
              className={`shrink-0 rounded-twin-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-[var(--twin-primary)] text-white"
                  : "border border-[var(--twin-hairline)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
              }`}
            >
              {r.name}
            </button>
          );
        })}
      </div>
    ) : null;
  const allocated = allocatedTotal(alloc);
  const overflow = Math.max(0, allocated - quantity);
  const unallocated = Math.max(0, quantity - allocated);

  /**
   * 最右「按顺序分配」列。
   * 只在**选中 2 个及以上**笼位时出现 —— 只有一个笼位时没什么可分配的，整列隐藏。
   */
  const allocColumn =
    reservations.length >= 2 ? (
      <>
        <div className="shrink-0 border-b border-[var(--twin-hairline)] px-3 py-2">
          <div className="text-[11px] font-semibold text-[var(--twin-ink)]">按顺序分配</div>
          <div className="mt-1 text-[10px] leading-snug text-[var(--twin-mute)]">
            总数 {quantity} ｜ 已分配 {allocated}
            {unallocated > 0 && <span className="text-amber-600"> ｜ 还差 {unallocated}</span>}
            {overflow > 0 && <span className="text-red-500"> ｜ 超了 {overflow}</span>}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {reservations.map((r, i) => {
            const qty = alloc[r.animalCageId] || 0;
            const cell = cellByCageId.get(r.animalCageId) ?? null;
            // 坐标用渲染映射（1-1 → A-10），不是后端代码坐标
            const posLabel = cell ? displayPosition(cell.position) : "";
            return (
              <div
                key={r.animalCageId}
                className="mb-1.5 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1.5"
              >
                <div className="flex items-start gap-1.5">
                  <span
                    className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-sm text-[9px] font-bold text-white"
                    style={{ backgroundColor: PICKED_COLOR }}
                    title={`第 ${i + 1} 个（分配顺序）`}
                  >
                    {i + 1}
                  </span>
                  {/*
                    还原原本的格子：直接复用网格里的格子组件（颜色/状态/异常标记都在），
                    **锁成正方形**——button 默认 inline-block 只占内容宽，不锁就会又窄又扁。
                    正下方显示笼架映射出来的名称（D-10 这类）。
                  */}
                  <div className="flex shrink-0 flex-col items-center gap-0.5">
                    {/*
                      格子按网格里的自然尺寸（70×82）渲染，再**整体等比缩放**进 60×60 的方框：
                      这样格子的内部排版与文案完整保留、不会被裁；直接压 width 会把文字挤出去。
                    */}
                    <div className="h-[60px] w-[60px] shrink-0 overflow-hidden">
                      {cell ? (
                        <div className="origin-top-left [transform:scale(0.73)] [&>button]:min-h-[82px] [&>button]:w-[70px]">
                          <CellButton cell={cell} />
                        </div>
                      ) : (
                        <div className="grid h-[60px] w-[60px] place-items-center rounded-twin-md border border-dashed border-[var(--twin-hairline)] text-[8px] text-[var(--twin-mute)]">
                          笼位
                        </div>
                      )}
                    </div>
                    <div className="max-w-[60px] truncate text-[9px] text-[var(--twin-mute)]" title={r.shelveName || r.label}>
                      {r.shelveName || posLabel || r.label}
                    </div>
                  </div>
                  {/* 格子右侧：该笼位分到的数量 */}
                  <div className="flex shrink-0 flex-col items-center gap-0.5">
                    <span className="text-[9px] text-[var(--twin-mute)]">数量</span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        className="h-5 w-5 rounded border border-[var(--twin-hairline)] bg-white text-[11px] font-bold text-[var(--twin-body)] disabled:opacity-30"
                        disabled={qty <= 0}
                        onClick={() => onAllocPinnedChange({ ...allocPinned, [r.animalCageId]: Math.max(0, qty - 1) })}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={maxQuantity}
                        value={qty}
                        onChange={(e) => {
                          const n = parseInt(e.target.value || "0", 10);
                          onAllocPinnedChange({
                            ...allocPinned,
                            [r.animalCageId]: Number.isFinite(n) ? Math.max(0, Math.min(maxQuantity, n)) : 0,
                          });
                        }}
                        className="h-5 w-8 rounded border border-[var(--twin-hairline)] text-center text-[11px]"
                      />
                      <button
                        type="button"
                        className="h-5 w-5 rounded bg-sky-600 text-[11px] font-bold text-white disabled:opacity-30"
                        disabled={maxQuantity > 0 && qty >= maxQuantity}
                        onClick={() =>
                          onAllocPinnedChange({
                            ...allocPinned,
                            [r.animalCageId]: Math.min(maxQuantity, qty + 1),
                          })
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {/* 顺序与移除 */}
                  <div className="ml-auto flex shrink-0 flex-col items-center gap-0.5">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => moveCage(i, -1)}
                      className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)] disabled:opacity-25"
                      title="上移（分配顺序）"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={i === reservations.length - 1}
                      onClick={() => moveCage(i, 1)}
                      className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)] disabled:opacity-25"
                      title="下移（分配顺序）"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      title="取消这个笼位"
                      onClick={async () => {
                        onReservationsChange(reservations.filter((x) => x.animalCageId !== r.animalCageId));
                        const next = { ...allocPinned };
                        delete next[r.animalCageId];
                        onAllocPinnedChange(next);
                        try {
                          await releaseCageReservation(r.reservationId);
                        } catch {
                          /* 启动清理兜底 */
                        }
                      }}
                      className="text-[var(--twin-mute)] hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-[var(--twin-hairline)] px-3 py-2">
          <button
            type="button"
            onClick={handleClearAll}
            className="w-full rounded-twin-md border border-[var(--twin-hairline)] px-2 py-1.5 text-[11px] text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
          >
            取消全部（{reservations.length}）
          </button>
        </div>
      </>
    ) : null;

  return (
    <CageOpDrawer
      /* 头部不展示徽标/标题/计数/说明，只留房间 tab；关闭按钮由 headerExtra 同一行靠右 */
      headerExtra={roomTabs}
      collapseLabel="选择笼位"
      onClose={onClose}
      /* 叠在规格弹窗（--z-modal:800）之上，否则抽屉被弹窗遮罩盖住点不到 */
      zIndex={900}
      width={width}
      embedded={embedded}
      rightColumn={allocColumn}
    >
      {loading && <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">加载中…</div>}
      {!loading && shelvesError && (
        <div className="py-6 text-center text-[11px] text-red-500">
          {shelvesError instanceof Error ? shelvesError.message : "加载本课题组笼架失败"}
        </div>
      )}
      {!loading && !shelvesError && groupShelves.length === 0 && (
        <div className="py-6 text-center text-[11px] text-[var(--twin-mute)]">
          本课题组名下暂无笼架。若确实有笼位，请联系管理员确认笼位的课题归属。
        </div>
      )}
      {!loading &&
        !shelvesError &&
        visibleGrids.map((detail) => (
          <div key={String(detail.shelfMeta.shelveId)} className="mb-3">
            <ShelfGrid
              title={[detail.shelfMeta.roomName, detail.shelfMeta.shelveName].filter(Boolean).join(" · ")}
              detail={detail}
              loading={false}
              alertMap={EMPTY_ALERTS}
              selectable
              allocMode
              clickMode="toggle"
              /* 可选 = 底部「当前可选」标签（claimMode 现在画的就是这个，不再画红环） */
              claimMode
              restrictSelectToPool
              poolCells={poolCells}
              selectedCells={selectedCells}
              pairColorByCageId={pickedHighlight}
              opMarkerByCageId={opMarkByCageId}
              scanLockTarget={locateTarget}
              onToggleCell={(sid, x, y) => void handleToggle(sid, x, y)}
              onCellClick={handleCellClick}
              emptyHint="暂无笼位"
            />
          </div>
        ))}
      {busy && <div className="pb-2 text-center text-[10px] text-[var(--twin-mute)]">锁定中…</div>}
    </CageOpDrawer>
  );
}
