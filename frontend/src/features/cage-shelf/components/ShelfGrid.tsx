import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import {
  fetchShelfCells,
  fetchCageShelfDetail,
  type CageShelfCell,
  type CageShelfDetail,
  type PersistedAlert,
  type PoolCell,
} from "@/api/domains/cageShelf.api";
import { CellButton } from "./CellButton";
import { authStorage } from "@/features/auth/authStorage";
import { useSyncLock, LockBadge, type ScopeRef, type LockState } from "./SyncLockContext";
import type { CageOpMark } from "../useCageOpSelect";

/**
 * ShelfGrid — 单个笼架的 8×10 网格视图
 *
 * 展示一个笼架的全部 80 个笼位（8列×10行），每个笼位由 CellButton 渲染。
 * 支持: 加载态 / 空态 / 收藏切换 / 多选(allocMode) / 编辑标记 / 绑定高亮 / 十字交叉
 *
 * Props:
 *   title, detail, loading, emptyHint    — 基础数据 + 状态
 *   onCellClick                          — 格子点击回调
 *   isBookmarked, onToggleBookmark       — 收藏控制
 *   alertMap                             — 告警数据 Map<shelveId:position, PersistedAlert>
 *   selectable, selectedCells, onToggleCell, allocMode, clickMode — 分配模式控制
 *   scanCache, lastScannedKey            — 编辑模式缓存
 *   bindSelectedKey, bindPairCache, unbindPairCache — 绑定模式缓存
 *   editMode, bindMode                   — 模式开关
 *   crossX, crossY, crossSid             — 扫码命中十字交叉坐标
 */
export function ShelfGrid({
  title,
  detail,
  loading,
  emptyHint,
  onCellClick,
  isBookmarked,
  onToggleBookmark,
  alertMap,
  selectable,
  selectedCells,
  onToggleCell,
  allocMode,
  clickMode,
  scanCache,
  lastScannedKey,
  bindSelectedKey,
  editMode,
  bindMode,
  crossX,
  crossY,
  crossSid,
  scanLockTarget,
  bindPairCache,
  unbindPairCache,
  claimMode,
  confirmMode,
  poolCells,
  myClaimCageIds,
  restrictSelectToPool,
  pairColorByCageId,
  opMarkerByCageId,
  glowColor,
  highlightShelveIds,
}: {
  title: string;
  detail: CageShelfDetail | null;
  loading: boolean;
  emptyHint?: string;
  onCellClick?: (c: CageShelfCell) => void;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  alertMap: Map<string, PersistedAlert>;
  selectable?: boolean;
  selectedCells?: Set<string>;
  onToggleCell?: (shelveId: string, x: number, y: number, shiftKey?: boolean) => void;
  allocMode?: boolean;
  clickMode?: "toggle" | "checkbox";
  scanCache?: Map<string, any>;
  lastScannedKey?: string | null;
  bindSelectedKey?: string | null;
  editMode?: boolean;
  bindMode?: boolean;
  crossX?: number;
  crossY?: number;
  crossSid?: string;
  scanLockTarget?: { sid: string; x: number; y: number } | null;
  bindPairCache?: Map<string, { cell: CageShelfCell; code: string }>;
  unbindPairCache?: Set<string>;
  claimMode?: boolean;
  confirmMode?: boolean;
  poolCells?: Map<string, PoolCell>;
  /** 本人待确认到位的 animalCageId 集合；认领/确认模式下高亮 */
  myClaimCageIds?: Set<string>;
  /** 只有池内格子可勾选（分笼/转移选位用） */
  restrictSelectToPool?: boolean;
  /** cageId → 配对色；批量转移用，源与目标同色 */
  pairColorByCageId?: Map<string, string>;
  /** cageId → 待审中间态标记（分笼审核中/转移审核中），源与目标同色 */
  opMarkerByCageId?: Map<string, CageOpMark>;
  /** 当前模式的呼吸灯颜色（查看模式不传 = 不高亮） */
  glowColor?: string;
  /** 有可选笼位的笼架 id 集合：命中时给整个笼架容器加一圈高亮，提示「这架里有能选的格子」 */
  highlightShelveIds?: Set<string>;
}) {
  const sid = detail?.shelfMeta?.shelveId ?? "";
  const cells = detail?.grid ?? [];
  /** 当前账号，用于把「划分名单」判定成「划给我」还是「划给别人」 */
  const meId = String(authStorage.getUserInfo()?.id ?? "");

  // 同步保护：笼架级锁链（自下而上 SHELF → ROOM → FLOOR）
  const { protectMode, resolve, toggle, floorOfRoom } = useSyncLock();
  const roomId = detail?.shelfMeta?.roomId;
  const shelfChain = useMemo(() => {
    const chain: ScopeRef[] = [];
    if (sid) chain.push({ type: "SHELF", key: sid });
    if (roomId != null && String(roomId)) chain.push({ type: "ROOM", key: String(roomId) });
    const fid = floorOfRoom(roomId);
    if (fid) chain.push({ type: "FLOOR", key: fid });
    return chain;
  }, [sid, roomId, floorOfRoom]);

  const gridContent = loading ? (
    <div className="flex-1 rounded-twin-lg border border-dashed text-xs text-[var(--twin-mute)] grid place-items-center">
      加载中...
    </div>
  ) : !detail || detail.totalCells === 0 ? (
    <div className="flex-1 rounded-twin-lg border border-dashed text-xs text-[var(--twin-mute)] grid place-items-center px-2 text-center">
      {emptyHint ?? "暂无数据"}
    </div>
  ) : (
    <div className="flex-1 min-h-0 overflow-y-auto content-start p-[3px]">
      <div className="grid grid-cols-8 gap-1.5">
        {cells.map((c) => {
          const alertKey = `${sid}:${c.position}`;
          const cellId = String((c as any).id ?? "");
          const divList = (c as any).divisionAssignees as Array<{ id: string; name: string }> | undefined;
          const divisionLabel = divList && divList.length > 0
            ? (divList.some(a => String(a.id) === meId) ? "已划分给你" : "已划分")
            : undefined;
          const cellChain: ScopeRef[] = cellId ? [{ type: "CELL", key: cellId }, ...shelfChain] : shelfChain;
          // 只有带 animalCageId 的格子才是可上锁的最细颗粒度；空位（无 ID）不参与
          const lockState: LockState | undefined = protectMode && cellId ? resolve(cellChain) : undefined;
          const selKey = `${sid}:${c.x}:${c.y}`;
          const ck = `${sid}:${c.x}:${c.y}`;
          const showCross = crossSid != null && crossSid === sid;
          const isBindCached = bindPairCache?.has(ck) ?? false;
          const isUnbindCached = unbindPairCache?.has(ck) ?? false;
          return (
            <CellButton
              key={c.position}
              cell={c}
              onClick={lockState !== undefined ? () => { void toggle(cellChain, `${title} ${c.position}`); } : onCellClick}
              lockState={lockState}
              divisionLabel={divisionLabel}
              alert={alertMap.get(alertKey)}
              selectable={selectable}
              selected={selectedCells?.has(selKey)}
              onToggle={
                onToggleCell
                  ? (e: React.MouseEvent) => onToggleCell(sid, c.x, c.y, e.shiftKey)
                  : undefined
              }
              allocMode={allocMode}
              clickMode={clickMode}
              // 预览色只在状态模式生效：缓存是「待提交」的真相源，跨模式留着，
              // 但别的模式不该看到状态模式的预览色（否则切出去还会花着）
              editCacheEntry={editMode ? scanCache?.get(ck) : undefined}
              isLastScanned={lastScannedKey === ck}
              bindHighlight={bindSelectedKey === ck}
              bindPending={isBindCached || isUnbindCached}
              editMode={editMode}
              bindMode={bindMode}
              isCrossCol={showCross && c.x === crossX}
              isCrossRow={showCross && c.y === crossY}
              flashOverlay={!!(scanLockTarget && scanLockTarget.sid === sid && scanLockTarget.x === c.x && scanLockTarget.y === c.y)}
              claimMode={claimMode}
              poolColor={glowColor}
              confirmMode={confirmMode}
              // isPoolCell 只决定「可否勾选」；绿环是否画由 CellButton 里的 claimMode 控制
              isPoolCell={poolCells ? poolCells.has(String((c as any).id ?? (c as any).animalCageId ?? "")) : false}
              isMyClaimCell={myClaimCageIds ? myClaimCageIds.has(String((c as any).id ?? (c as any).animalCageId ?? "")) : false}
              restrictSelectToPool={restrictSelectToPool}
              pairColor={pairColorByCageId?.get(String((c as any).id ?? (c as any).animalCageId ?? ""))}
              opMarker={opMarkerByCageId?.get(String((c as any).id ?? (c as any).animalCageId ?? ""))}
            />
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      className={`rounded-twin-xl border bg-[var(--twin-canvas)] p-3 min-h-0 flex flex-col${
        highlightShelveIds?.has(sid)
          /* 「这架里有可选格子」的架子级提示：跟格子上的「当前可选」标签同色，不再用红色 */
          ? " border-emerald-500 ring-2 ring-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
          : " border-[var(--twin-hairline)]"
      }${glowColor ? " cage-shelf-glow" : ""}`}
      style={glowColor ? ({ ["--mode-color" as string]: glowColor } as React.CSSProperties) : undefined}
    >
      <div className="mb-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--twin-ink)]">{title}</div>
          {shelfChain.length > 0 && <LockBadge chain={shelfChain} label={title} size={3.5} />}
        </div>
        <div className="flex items-center gap-2">
          {detail?.shelfMeta && (
            <div className="text-[11px] text-[var(--twin-mute)]">
              {detail.shelfMeta.campusName}/{detail.shelfMeta.areaName}/
              {detail.shelfMeta.floorName}/{detail.shelfMeta.roomName}/
              {detail.shelfMeta.shelveName || detail.shelfMeta.shelveId}
            </div>
          )}
          {onToggleBookmark && (
            <button
              type="button"
              className={`shrink-0 p-0.5 rounded transition ${
                isBookmarked
                  ? "text-amber-500 hover:text-amber-600"
                  : "text-slate-300 hover:text-amber-400"
              }`}
              onClick={onToggleBookmark}
              title={isBookmarked ? "取消收藏" : "收藏此笼架"}
            >
              <Star className={`h-4 w-4 ${isBookmarked ? "fill-amber-500" : ""}`} />
            </button>
          )}
        </div>
      </div>
      {gridContent}
    </div>
  );
}

/**
 * BookmarkShelfGrid — 收藏笼架网格（自取数据）
 *
 * 与 ShelfGrid 的区别:
 *   - 自己通过 useQuery 获取数据（先 snapshot cells，再 fallback detail）
 *   - 不依赖父组件传入的 details[]
 *   - 数据为空时提示"运行全量笼位数据同步"
 *
 * Props:
 *   roomId, shelveId                     — 定位笼架
 *   title, campusName, roomName          — 显示信息
 *   isBookmarked, onToggleBookmark       — 收藏控制
 *   onCellClick                          — 格子点击回调
 *   alertMap                             — 告警数据
 */
export function BookmarkShelfGrid({
  roomId,
  shelveId,
  title,
  campusName,
  roomName,
  isBookmarked,
  onToggleBookmark,
  onCellClick,
  alertMap,
}: {
  roomId: string;
  shelveId: string;
  title: string;
  campusName?: string;
  roomName?: string;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  onCellClick: (c: CageShelfCell) => void;
  alertMap: Map<string, PersistedAlert>;
}) {
  const snap = useQuery({
    queryKey: ["shelfCells", roomId, shelveId],
    queryFn: () => fetchShelfCells(roomId, shelveId),
    staleTime: 5 * 60 * 1000,
  });
  const hasReal = Boolean(
    snap.data?.cells?.some(
      (c: any) =>
        !c.empty && (c.animalCageType != null || c.cageBoxJson || c.specialStatusesJson),
    ),
  );
  const cache = useQuery({
    queryKey: ["cageShelfDetail", shelveId],
    queryFn: () => fetchCageShelfDetail(shelveId),
    staleTime: 5 * 60 * 1000,
    enabled: snap.isSuccess && (snap.data?.isEmpty === true || !hasReal),
  });
  const loading = snap.isLoading || (cache.isEnabled && cache.isLoading);
  const detail = useMemo((): CageShelfDetail | null => {
    const meta = {
      shelveId,
      shelveName: title,
      campusName: campusName || "",
      areaName: "",
      floorName: "",
      roomName: roomName || "",
    };
    if (hasReal && snap.data) {
      const cells = snap.data.cells.map(snapshotCellToShelfCell);
      return {
        shelfMeta: meta,
        grid: cells,
        totalCells: cells.length,
        filledCells: cells.filter((c) => !c.empty).length,
      };
    }
    if (cache.data) return cache.data;
    if (snap.data?.cells?.length) {
      const cells = snap.data.cells.map(snapshotCellToShelfCell);
      return { shelfMeta: meta, grid: cells, totalCells: cells.length, filledCells: 0 };
    }
    return null;
  }, [hasReal, snap.data, cache.data, title, campusName, roomName, shelveId]);

  if (loading)
    return <div className="text-xs text-[var(--twin-mute)] py-4 text-center">加载笼位…</div>;
  if (!detail || detail.totalCells === 0)
    return (
      <div className="text-xs text-[var(--twin-mute)] py-4 text-center">
        暂无数据 — 运行「全量笼位数据同步」或手动刷新后可见
      </div>
    );
  return (
    <ShelfGrid
      title={title}
      detail={detail}
      loading={false}
      emptyHint="暂无笼架数据"
      isBookmarked={isBookmarked}
      onToggleBookmark={onToggleBookmark}
      onCellClick={onCellClick}
      alertMap={alertMap}
      selectable={false}
      allocMode={false}
    />
  );
}

/**
 * snapshotCellToShelfCell — 快照 API 返回的原始数据 → 标准 CageShelfCell
 *
 * 解析 cageBoxJson / specialStatusesJson JSON 字符串，
 * 从 positionX/positionY 计算 positionLabel (A-1 格式)，
 * 判断 empty 状态。
 */
export function snapshotCellToShelfCell(c: any): CageShelfCell {
  let cageBoxInfo: Record<string, unknown> | undefined;
  let specialStatuses: any[] | undefined;
  try {
    if (c.cageBoxJson) cageBoxInfo = JSON.parse(c.cageBoxJson);
  } catch {}
  try {
    if (c.specialStatusesJson) specialStatuses = JSON.parse(c.specialStatusesJson);
  } catch {}
  const x = c.positionX ?? 0,
    y = c.positionY ?? 0,
    label = c.positionLabel || `${String.fromCharCode(64 + x)}-${y}`,
    empty = c.empty || (!c.animalCageType && !cageBoxInfo);
  return {
    x,
    y,
    position: label,
    empty,
    stateLabel: empty ? "空位" : "",
    animalCageType: c.animalCageType ?? undefined,
    // cageBoxInfo 来自后端 buildCageBoxInfo，键为 PascalCase ProjectPiName
    projectPiName:
      (c.projectPiName as string) ||
      (cageBoxInfo?.ProjectPiName as string) ||
      (cageBoxInfo?.projectPiName as string) ||
      undefined,
    departmentName:
      (c.departmentName as string) ||
      (cageBoxInfo?.DepartmentName as string) ||
      (cageBoxInfo?.departmentName as string) ||
      undefined,
    piName:
      (c.piName as string) ||
      (cageBoxInfo?.piName as string) ||
      undefined,
    cageBoxInfo,
    specialStatuses,
  };
}
