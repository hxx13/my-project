import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { GridCellButton, useGridCellWidth } from "@/pages/mobile/MobileCageShelfTab";
import { CageColorProvider } from "@/features/cage-shelf/components/CageColorContext";
import { displayPosition } from "@/features/cage-shelf/constants";
import { pairColorAt, type BatchPair } from "@/features/cage-shelf/useCageOpSelect";
import CageOperationDialog from "@/features/cage-shelf/components/CageOperationDialog";
import { cn } from "@/lib/utils";
import {
  fetchCageOpTargets,
  fetchCageOpOperable,
  fetchLocalShelfGridByShelveId,
  type CageOpTarget,
  type CageShelfCell,
  type CageShelfDetail,
} from "@/api/domains/cageShelf.api";
import type { MobileCageShelfSummary } from "@/api/domains/mobileStudent.api";
import {
  groupPoolByRoom,
  indexPool,
  nextUnpairedIdx,
  removeSource,
  pairRows,
  type BatchSource,
} from "@/pages/mobile/batchTransferLogic";

interface RoomShelf {
  shelveId: string;
  shelveName: string;
}

/** 房间/架两级分组。源侧（用户可跨房间加源）与目标侧（该源自己的目标池）统一用这个形状。 */
interface RoomGroup {
  roomKey: string;
  roomName: string;
  campusName: string;
  roomId?: string;
  shelves: RoomShelf[];
}

/** 单个源的目标池加载态。失败只记在这个源上，不整抽屉报错。 */
interface PoolEntry {
  loading: boolean;
  error: string;
  pool: CageOpTarget[];
}

/** 单架的网格加载态（一次只拉一个架）。 */
interface ShelfGridEntry {
  loading: boolean;
  detail: CageShelfDetail | null;
  error: string;
}

/** 屏 B 正在看的那个架（身份信息足够源侧写缓冲、目标侧写副标题）。 */
interface ActiveShelf {
  shelveId: string;
  shelveName: string;
  roomId: string;
  roomName: string;
}

/** 树状列表三级节点（校区 → 房间 → 架）。 */
interface TreeShelf {
  shelveId: string;
  shelveName: string;
}
interface TreeRoom {
  roomKey: string;
  roomName: string;
  roomId: string;
  shelves: TreeShelf[];
}
interface TreeCampus {
  campusName: string;
  rooms: TreeRoom[];
}

export interface MobileBatchTransferSheetProps {
  open: boolean;
  /** 入口格：打开即作为第一个源放进缓冲（去重）。null = 无锚点，纯空抽屉。 */
  anchor: BatchSource | null;
  /** 源侧房间/架列表（学生端本人可见的笼架摘要）。 */
  shelves: MobileCageShelfSummary[];
  onClose: () => void;
  /** 提交成功（三签发起）后由父组件刷新网格。 */
  onDone: () => void;
}

/** 把源侧笼架摘要按「校区/房间」聚成房间列表（与 groupPoolByRoom 同一套 key）。 */
function groupSourceShelvesByRoom(shelves: MobileCageShelfSummary[]): RoomGroup[] {
  const out: RoomGroup[] = [];
  const byKey = new Map<string, RoomGroup>();
  for (const s of shelves || []) {
    const roomName = s.roomName || "其他";
    const campusName = s.campusName || "";
    const roomKey = `${campusName}/${roomName}`;
    let room = byKey.get(roomKey);
    if (!room) {
      room = { roomKey, roomName, campusName, roomId: s.roomId ?? "", shelves: [] };
      byKey.set(roomKey, room);
      out.push(room);
    }
    if (!room.roomId && s.roomId) room.roomId = s.roomId;
    const sid = String(s.shelveId ?? "");
    if (sid && !room.shelves.some((x) => x.shelveId === sid)) {
      room.shelves.push({ shelveId: sid, shelveName: s.shelveName || sid });
    }
  }
  return out;
}

export default function MobileBatchTransferSheet({
  open,
  anchor,
  shelves,
  onClose,
  onDone,
}: MobileBatchTransferSheetProps) {
  const [sources, setSources] = useState<BatchSource[]>([]);
  const [targets, setTargets] = useState<Map<string, string>>(new Map());
  /** 阶段：决定树从哪来、格子按什么判据打标。与「屏」是两件事。 */
  const [phase, setPhase] = useState<"source" | "target">("source");
  /** 屏：决定此刻看树状列表还是单架网格。切阶段/换光标都会回 tree。 */
  const [screen, setScreen] = useState<"tree" | "grid">("tree");
  const [cursor, setCursor] = useState(0);
  const [poolCache, setPoolCache] = useState<Map<string, PoolEntry>>(new Map());
  const [gridCache, setGridCache] = useState<Map<string, ShelfGridEntry>>(new Map());
  /**
   * 已经拉过 / 正在拉的架。**必须用 ref 当闸门，不能拿 gridCache 当判据**：
   * 下面那个 effect 自己会写 gridCache，一旦把 gridCache 放进 deps 就会
   * 「写 → 重跑 → 上一轮 cleanup 把 alive 置 false → 回包被 `if (!alive) return` 丢掉」，
   * 架永远停在「加载中…」。用 ref 就没有重跑，也就无所谓取消 ——
   * 结果按 shelveId 写回各自的槽，迟到的回包不会串架。
   */
  const gridInFlight = useRef<Set<string>>(new Set());
  const [activeShelf, setActiveShelf] = useState<ActiveShelf | null>(null);
  const [collapsedCampuses, setCollapsedCampuses] = useState<Set<string>>(new Set());
  const [collapsedRooms, setCollapsedRooms] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const gridCell = useGridCellWidth();

  /* ── 打开即清空（本抽屉不锁服务端占用，关了即丢） ── */
  useEffect(() => {
    if (!open) return;
    setSources([]);
    setTargets(new Map());
    setPoolCache(new Map());
    setGridCache(new Map());
    setPhase("source");
    setScreen("tree");
    setCursor(0);
    setActiveShelf(null);
    setCollapsedCampuses(new Set());
    setCollapsedRooms(new Set());
    setConfirmOpen(false);
    gridInFlight.current.clear();
  }, [open]);

  /* ── 锚点：把入口格放进缓冲（去重） ── */
  useEffect(() => {
    if (!open || !anchor) return;
    setSources((prev) =>
      prev.some((s) => s.animalCageId === anchor.animalCageId) ? prev : [anchor, ...prev],
    );
  }, [open, anchor]);

  /* ── 派生：房间/源/池 ── */
  const sourceRooms = useMemo(() => groupSourceShelvesByRoom(shelves), [shelves]);
  const sourceIds = useMemo(() => new Set(sources.map((s) => s.animalCageId)), [sources]);

  const curSource = phase === "target" ? sources[cursor] ?? null : null;
  const curPoolEntry = curSource ? poolCache.get(curSource.animalCageId) : undefined;
  const curPool = curPoolEntry?.pool ?? [];
  const curPoolById = useMemo(() => indexPool(curPool), [curPool]);
  const targetRooms = useMemo(() => groupPoolByRoom(curPool), [curPool]);

  /* 目标侧：只数「可选」的架（树右侧的「可选 N」与树过滤共用这份计数） */
  const selectableCountByShelf = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of curPool) {
      if (t.selectable && t.shelveId) {
        const k = String(t.shelveId);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
    return m;
  }, [curPool]);

  /** 目标阶段树：只列有可选目标的架（空房间随之剔除），不给「整架都不可选」的架子占行。 */
  const targetTreeRooms = useMemo(() => {
    return targetRooms
      .map((r) => ({
        ...r,
        shelves: r.shelves.filter((s) => (selectableCountByShelf.get(s.shelveId) ?? 0) > 0),
      }))
      .filter((r) => r.shelves.length > 0);
  }, [targetRooms, selectableCountByShelf]);

  const rooms = phase === "source" ? sourceRooms : targetTreeRooms;

  /**
   * 一步一步引导：每个阶段都留一句「下一步该做什么」，别让用户对着空网格猜。
   * 源阶段还要交代锚点的来历 —— 打开抽屉时自动带入了入口格，不说清用户会纳闷
   * 「我还没开始选，怎么已经有一个了」。
   */
  const anchorInBuffer = !!anchor && sources.some((s) => s.animalCageId === anchor.animalCageId);
  const hint =
    phase === "target"
      ? curSource && targets.get(curSource.animalCageId)
        ? "这个源已配好目标，点配对条可换源"
        : "请在下面点一个空笼位，作为它的目标"
      : sources.length === 0
        ? "请点格子选择要转移的源笼位"
        : anchorInBuffer
          ? "已把刚才那一格作为第一个源，请继续点格子添加；点 × 可移除"
          : "请继续点格子添加源笼位；选完点「下一步」";

  /** 屏 A 的树：把当前阶段的房/架列表再按「校区」归一层。 */
  const tree = useMemo<TreeCampus[]>(() => {
    const out: TreeCampus[] = [];
    const byCampus = new Map<string, TreeCampus>();
    for (const r of rooms) {
      const campusName = r.campusName || "本校区";
      let c = byCampus.get(campusName);
      if (!c) {
        c = { campusName, rooms: [] };
        byCampus.set(campusName, c);
        out.push(c);
      }
      c.rooms.push({
        roomKey: r.roomKey,
        roomName: r.roomName,
        roomId: (r as RoomGroup).roomId ?? "",
        shelves: r.shelves.map((s) => ({ shelveId: s.shelveId, shelveName: s.shelveName })),
      });
    }
    return out;
  }, [rooms]);

  /* ── 目标池加载：进入目标阶段后、切到某个源时拉它自己的池 ── */
  const loadPool = (sourceId: string) => {
    setPoolCache((prev) => {
      const next = new Map(prev);
      next.set(sourceId, { loading: true, error: "", pool: [] });
      return next;
    });
    fetchCageOpTargets(sourceId, null)
      .then((pool) =>
        setPoolCache((prev) => {
          const next = new Map(prev);
          next.set(sourceId, { loading: false, error: "", pool });
          return next;
        }),
      )
      .catch((e) =>
        setPoolCache((prev) => {
          const next = new Map(prev);
          next.set(sourceId, {
            loading: false,
            error: e instanceof Error ? e.message : "加载目标笼位失败",
            pool: [],
          });
          return next;
        }),
      );
  };

  useEffect(() => {
    if (phase === "target" && curSource && !poolCache.has(curSource.animalCageId)) {
      loadPool(curSource.animalCageId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在切源时触发，池本身进 deps 会每轮重拉
  }, [phase, curSource?.animalCageId]);

  /* ── 网格加载：一次只拉一个架（失败只影响这一架） ── */
  const loadShelfGrid = (shelveId: string) => {
    if (gridInFlight.current.has(shelveId)) return;
    gridInFlight.current.add(shelveId);
    setGridCache((prev) => {
      if (prev.has(shelveId)) return prev;
      const next = new Map(prev);
      next.set(shelveId, { loading: true, detail: null, error: "" });
      return next;
    });
    void fetchLocalShelfGridByShelveId(shelveId)
      .then((d) =>
        setGridCache((prev) => {
          const next = new Map(prev);
          next.set(shelveId, { loading: false, detail: d, error: "" });
          return next;
        }),
      )
      .catch((e) => {
        // 失败放开闸门：下次再点这个架能重试，而不是把失败钉死
        gridInFlight.current.delete(shelveId);
        setGridCache((prev) => {
          const next = new Map(prev);
          next.set(shelveId, {
            loading: false,
            detail: null,
            error: e instanceof Error ? e.message : "加载失败",
          });
          return next;
        });
      });
  };

  const activeShelfId = activeShelf?.shelveId ?? null;

  useEffect(() => {
    if (activeShelfId) loadShelfGrid(activeShelfId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在换架时拉；gridCache 进 deps 会写→重跑→丢回包
  }, [activeShelfId]);

  const retryGrid = () => {
    if (!activeShelfId) return;
    gridInFlight.current.delete(activeShelfId);
    setGridCache((prev) => {
      const next = new Map(prev);
      next.delete(activeShelfId);
      return next;
    });
    loadShelfGrid(activeShelfId);
  };

  /* ── 合并全部已加载池 → 配对条用目标坐标回填 ── */
  const allPoolById = useMemo(() => {
    const m = new Map<string, CageOpTarget>();
    for (const entry of poolCache.values()) {
      for (const t of entry.pool) if (!m.has(t.animalCageId)) m.set(t.animalCageId, t);
    }
    return m;
  }, [poolCache]);

  const rows = useMemo(() => pairRows(sources, targets, allPoolById), [sources, targets, allPoolById]);
  const pairedCount = sources.filter((s) => targets.get(s.animalCageId)).length;
  const unpairedCount = sources.length - pairedCount;

  /* ── 交互 ── */
  const openShelf = (room: TreeRoom, shelf: TreeShelf) => {
    setActiveShelf({
      shelveId: shelf.shelveId,
      shelveName: shelf.shelveName,
      roomId: room.roomId,
      roomName: room.roomName,
    });
    setScreen("grid");
  };

  const handleSourceCellClick = async (cell: CageShelfCell) => {
    if (!activeShelf) return;
    const cageId = String(cell.id ?? "");
    if (!cageId) {
      toast.error("这个位置没有笼位");
      return;
    }
    if (sourceIds.has(cageId)) {
      const r = removeSource(sources, targets, cageId);
      setSources(r.sources);
      setTargets(r.targets);
      return;
    }
    // ponytail: /cage-op/operable 是单笼位接口，源侧逐格校验一次一个请求；
    // 若选源交互变卡，升级路径=后端加「批量 operable」接口，前端一次拉全房间。
    try {
      const op = await fetchCageOpOperable(cageId);
      if (!op.operable) {
        toast.error(op.reason || "该笼位当前不能转移");
        return;
      }
      setSources((prev) =>
        prev.some((s) => s.animalCageId === cageId)
          ? prev
          : [
              ...prev,
              {
                animalCageId: cageId,
                label: displayPosition(cell.position),
                shelveId: activeShelf.shelveId,
                shelveName: activeShelf.shelveName,
                roomId: activeShelf.roomId,
                roomName: activeShelf.roomName,
              },
            ],
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "查询失败");
    }
  };

  const handleTargetCellClick = (cell: CageShelfCell) => {
    if (!curSource) return;
    const cageId = String(cell.id ?? "");
    if (!cageId) return;
    const entry = curPoolById.get(cageId);
    if (!entry) {
      toast.error("该笼位不在可选范围");
      return;
    }
    if (!entry.selectable) {
      toast.error(entry.reason || "该笼位不可选");
      return;
    }
    const nextTargets = new Map(targets);
    nextTargets.set(curSource.animalCageId, cageId);
    setTargets(nextTargets);
    const next = nextUnpairedIdx(sources, nextTargets, cursor + 1);
    if (next >= 0) setCursor(next);
    // 配对后光标前进 → 树是下一个源自己的池子，必须回屏 A
    setScreen("tree");
    setActiveShelf(null);
  };

  const removeSourceFrom = (sourceId: string) => {
    const r = removeSource(sources, targets, sourceId);
    setSources(r.sources);
    setTargets(r.targets);
    setScreen("tree");
    setActiveShelf(null);
    if (phase === "target") {
      if (r.sources.length === 0) {
        setPhase("source");
        setCursor(0);
      } else {
        setCursor((prev) => Math.min(prev, r.sources.length - 1));
      }
    }
  };

  const handleGoTarget = () => {
    if (sources.length === 0) {
      toast.error("请先选择要转移的源笼位");
      return;
    }
    setPhase("target");
    setScreen("tree");
    setActiveShelf(null);
    const first = nextUnpairedIdx(sources, targets, 0);
    setCursor(first >= 0 ? first : 0);
  };

  const handleSubmit = () => {
    if (unpairedCount > 0) {
      toast.error(`还有 ${unpairedCount} 个源没选目标`);
      return;
    }
    setConfirmOpen(true);
  };

  const batchPairs = useMemo<BatchPair[]>(
    () =>
      sources.map((s, i) => {
        const tid = targets.get(s.animalCageId) ?? null;
        const t = tid ? allPoolById.get(tid) : undefined;
        return {
          index: i,
          color: pairColorAt(i),
          sourceId: s.animalCageId,
          sourceLabel: {
            position: s.label,
            where: [s.roomName, s.shelveName].filter(Boolean).join(" / "),
          },
          targetId: tid,
          targetLabel: t
            ? {
                position:
                  t.positionX != null && t.positionY != null
                    ? displayPosition(`${t.positionX}-${t.positionY}`)
                    : "—",
                where: [t.campusName, t.roomName, t.shelveName].filter(Boolean).join(" / "),
              }
            : undefined,
        };
      }),
    [sources, targets, allPoolById],
  );

  const handleConfirmDone = () => {
    onClose();
    onDone();
  };

  /* ── 渲染 ── */
  const toggleCampus = (name: string) => {
    setCollapsedCampuses((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleRoom = (key: string) => {
    setCollapsedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderTreeContent = () => {
    if (phase === "target") {
      if (!curPoolEntry || curPoolEntry.loading) {
        return <div className="px-4 py-10 text-center text-sm text-[var(--student-mute)]">加载目标笼位中…</div>;
      }
      if (curPoolEntry.error) {
        return (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="px-4 text-center text-xs text-[var(--student-mute)]">{curPoolEntry.error}</p>
            <button
              type="button"
              onClick={() => curSource && loadPool(curSource.animalCageId)}
              className="rounded-full bg-[var(--student-primary)] px-5 py-2 text-sm font-medium text-[var(--student-primary-foreground)]"
            >
              重试
            </button>
          </div>
        );
      }
      if (tree.length === 0) {
        return (
          <div className="px-4 py-10 text-center text-xs text-[var(--student-mute)]">
            该源暂无可用目标笼位，可在下方配对条点 × 移出这个源
          </div>
        );
      }
    } else if (tree.length === 0) {
      return <div className="px-4 py-10 text-center text-xs text-[var(--student-mute)]">暂无可选的笼架</div>;
    }

    return (
      <div className="space-y-0.5">
        {tree.map((campus) => {
          const cCollapsed = collapsedCampuses.has(campus.campusName);
          return (
            <div key={campus.campusName}>
              <button
                type="button"
                onClick={() => toggleCampus(campus.campusName)}
                className="flex w-full items-center gap-1 rounded-[var(--student-radius-sm)] px-1 py-2 text-left text-sm font-semibold text-[var(--student-ink)]"
              >
                {cCollapsed ? (
                  <ChevronRight className="size-4 shrink-0 text-[var(--student-mute)]" />
                ) : (
                  <ChevronDown className="size-4 shrink-0 text-[var(--student-mute)]" />
                )}
                <span className="min-w-0 flex-1 truncate">{campus.campusName}</span>
              </button>
              {!cCollapsed && (
                <div className="ml-2 space-y-0.5 border-l border-[var(--student-hairline)] pl-2">
                  {campus.rooms.map((room) => {
                    const rCollapsed = collapsedRooms.has(room.roomKey);
                    return (
                      <div key={room.roomKey}>
                        <button
                          type="button"
                          onClick={() => toggleRoom(room.roomKey)}
                          className="flex w-full items-center gap-1 rounded-[var(--student-radius-sm)] px-1 py-1.5 text-left text-xs font-medium text-[var(--student-body)]"
                        >
                          {rCollapsed ? (
                            <ChevronRight className="size-3.5 shrink-0 text-[var(--student-mute)]" />
                          ) : (
                            <ChevronDown className="size-3.5 shrink-0 text-[var(--student-mute)]" />
                          )}
                          <span className="min-w-0 flex-1 truncate">{room.roomName}</span>
                        </button>
                        {!rCollapsed && (
                          <div className="ml-2 space-y-0.5">
                            {room.shelves.map((shelf) => (
                              <button
                                key={shelf.shelveId}
                                type="button"
                                onClick={() => openShelf(room, shelf)}
                                className="flex w-full items-center justify-between gap-2 rounded-[var(--student-radius-sm)] px-2 py-1.5 text-left text-xs text-[var(--student-body)] active:bg-[var(--student-canvas-soft)]"
                              >
                                <span className="min-w-0 flex-1 truncate">{shelf.shelveName}</span>
                                {phase === "target" && (
                                  <span className="shrink-0 rounded-full bg-[#f1f3f7] px-2 py-0.5 text-[11px] text-[#334155]">
                                    可选 {selectableCountByShelf.get(shelf.shelveId) ?? 0}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderSourceCell = (cell: CageShelfCell) => {
    const cageId = String(cell.id ?? "");
    return (
      <div key={cell.position} className="relative">
        <GridCellButton
          cell={cell}
          onSelect={() => void handleSourceCellClick(cell)}
          selected={cageId !== "" && sourceIds.has(cageId)}
        />
      </div>
    );
  };

  const renderTargetCell = (cell: CageShelfCell) => {
    const cageId = String(cell.id ?? "");
    const entry = cageId ? curPoolById.get(cageId) : undefined;
    // 只认后端 selectable，前端不叠判定：池内有但不可选 → 后端 reason；池内没有 → 灰掉写「不在可选范围」
    const disabledReason = entry
      ? entry.selectable
        ? undefined
        : entry.reason || "不可选"
      : cageId
        ? "不在可选范围"
        : undefined;
    return (
      <div key={cell.position} className="relative">
        <GridCellButton
          cell={cell}
          onSelect={() => handleTargetCellClick(cell)}
          selected={!!curSource && targets.get(curSource.animalCageId) === cageId}
          isPoolCell={!!entry && entry.selectable}
          disabledReason={disabledReason}
        />
      </div>
    );
  };

  const renderGridScreen = () => {
    if (!activeShelf) {
      return <div className="px-4 py-10 text-center text-sm text-[var(--student-mute)]">请选择一个笼架</div>;
    }
    const entry = gridCache.get(activeShelf.shelveId);
    return (
      <div>
        {/* 屏 B 顶栏：返回 + 架名（房号作副标题） */}
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScreen("tree")}
            className="flex min-h-[32px] shrink-0 items-center gap-0.5 text-sm font-semibold text-[var(--student-ink)]"
          >
            <ChevronLeft className="size-4 text-[var(--student-mute)]" />
            返回
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-[var(--student-ink)]">{activeShelf.shelveName}</div>
            <div className="truncate text-[11px] text-[var(--student-mute)]">{activeShelf.roomName}</div>
          </div>
        </div>

        {!entry?.detail ? (
          entry?.error ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="px-4 text-center text-xs text-[var(--student-mute)]">{entry.error}</p>
              <button
                type="button"
                onClick={retryGrid}
                className="rounded-full bg-[var(--student-primary)] px-5 py-2 text-sm font-medium text-[var(--student-primary-foreground)]"
              >
                重试
              </button>
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-[var(--student-mute)]">加载中…</div>
          )
        ) : (
          <div
            ref={gridCell.ref}
            style={gridCell.style}
            className="ao-cell-grid grid grid-cols-8 gap-[3px] rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-white p-1.5"
          >
            {entry.detail.grid.map((cell) =>
              phase === "source" ? renderSourceCell(cell) : renderTargetCell(cell),
            )}
          </div>
        )}
      </div>
    );
  };

  if (!open) return <></>;

  return (
    <>
      <div className="fixed inset-0 z-[var(--z-modal)] flex flex-col justify-end">
        <div className="absolute inset-0 bg-black/35" onClick={onClose} aria-hidden />
        <div
          className="relative flex h-[92vh] min-h-0 flex-col overflow-hidden rounded-t-[var(--student-radius-lg)] bg-[var(--student-surface-raised)]"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <CageColorProvider>
            {/* 头部 */}
            <div className="flex shrink-0 flex-col border-b border-[var(--student-hairline)]">
              <div className="flex items-center gap-2 px-3 py-2">
                {phase === "target" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setPhase("source");
                        setScreen("tree");
                        setActiveShelf(null);
                      }}
                      className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-[var(--student-ink)]"
                    >
                      <ChevronLeft className="size-4 text-[var(--student-mute)]" />
                      返回选源
                    </button>
                    {curSource && (
                      <span className="min-w-0 flex-1 truncate text-xs text-[var(--student-ink)]">
                        第 {Math.min(cursor + 1, sources.length)}/{sources.length} 个源 · {curSource.label} · {curSource.shelveName}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--student-ink)]">批量转移 · 选源</span>
                    <span className="shrink-0 text-xs text-[var(--student-mute)]">已选 {sources.length}</span>
                  </>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="关闭"
                  className="flex size-7 shrink-0 items-center justify-center rounded-[var(--student-radius-sm)] text-[var(--student-mute)]"
                >
                  <X className="size-4" />
                </button>
              </div>
              {/* 阶段引导：一句「下一步该做什么」（源阶段还要交代锚点的来历） */}
              {hint && (
                <div className="mt-2 rounded-[var(--student-radius-sm)] bg-[#f1f3f7] px-3 py-1.5 text-[11px] text-[#334155]">
                  {hint}
                </div>
              )}
            </div>

            {/* 内容体：屏 A 树 / 屏 B 单架网格 */}
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto px-3 py-3">
                {screen === "tree" ? renderTreeContent() : renderGridScreen()}
              </div>
            </div>

            {/* 配对条（两屏常驻） */}
            {sources.length > 0 && (
              <div className="shrink-0 border-t border-[var(--student-hairline)] px-3 py-2">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {rows.map((row, i) => {
                    const isCur = phase === "target" && i === cursor;
                    return (
                      <div
                        key={row.sourceId}
                        className={cn(
                          "flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs",
                          isCur
                            ? "border-[var(--student-primary)] bg-[var(--student-primary)] text-[var(--student-primary-foreground)]"
                            : "border-[var(--student-hairline)] text-[var(--student-body)]",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (phase !== "target") return;
                            setCursor(i);
                            setScreen("tree");
                            setActiveShelf(null);
                          }}
                          className="shrink-0"
                        >
                          {row.text}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSourceFrom(row.sourceId)}
                          className="shrink-0 text-[var(--student-mute)]"
                          aria-label="移除"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 提交 / 下一步 */}
            <div className="shrink-0 border-t border-[var(--student-hairline)] px-3 py-2">
              {phase === "source" ? (
                <button
                  type="button"
                  disabled={sources.length === 0}
                  onClick={handleGoTarget}
                  className="min-h-[44px] w-full rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] px-2 text-sm font-medium text-[var(--student-primary-foreground)] disabled:bg-[#e5e7eb] disabled:text-[#9aa0a6]"
                >
                  去配目标（{sources.length}）
                </button>
              ) : (
                <button
                  type="button"
                  disabled={sources.length === 0}
                  onClick={handleSubmit}
                  className="min-h-[44px] w-full rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] px-2 text-sm font-medium text-[var(--student-primary-foreground)] disabled:bg-[#e5e7eb] disabled:text-[#9aa0a6]"
                >
                  提交转移（{sources.length}）
                </button>
              )}
            </div>
          </CageColorProvider>
        </div>
      </div>

      <CageOperationDialog
        open={confirmOpen}
        op="transfer"
        source={null}
        picked={[]}
        pairs={batchPairs}
        onClose={() => setConfirmOpen(false)}
        onDone={handleConfirmDone}
      />
    </>
  );
}
