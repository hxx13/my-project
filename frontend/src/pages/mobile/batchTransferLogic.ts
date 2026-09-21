import type { CageOpTarget } from "@/api/domains/cageShelf.api";
import { displayPosition } from "@/features/cage-shelf/constants";

/**
 * 批量转移（跨房间缓冲抽屉）的纯逻辑 —— 与 React / 网络 / 状态无关，可独立单测。
 *
 * 配对模型是「**逐源配目标**」：每个源自己配一个目标，配对挂在源 id 上，与顺序解耦。
 * 这与 PC `useCageOpSelect` 的 batch（「位置即配对」：第 i 个源配第 i 个目标）是**两套语义**，
 * 别把两边的函数互相搬。逐源配目标的好处：删一个源只影响它自己，加源不会重洗其余配对。
 */

/** 缓冲里的一个源笼位（顺序只影响展示，不影响配对） */
export interface BatchSource {
  animalCageId: string;
  /** 展示坐标，如 `F-4`（由各端既有的 position 文案函数产出，不要自己拼） */
  label: string;
  shelveId: string;
  shelveName: string;
  roomId: string;
  roomName: string;
}

/** 目标侧的房间分组：房间 → 架（架只留身份，网格另拉） */
export interface TargetRoomGroup {
  roomKey: string;
  roomName: string;
  campusName: string;
  shelves: Array<{ shelveId: string; shelveName: string }>;
}

/**
 * 目标池 → 房间/架两级列表。顺序按后端返回（SQL 已按 校区/楼层/房间/架/坐标 排好），
 * 所以前端不再排序，保持稳定以便「切房间 tab 时列表不跳」。
 */
export function groupPoolByRoom(pool: CageOpTarget[]): TargetRoomGroup[] {
  const out: TargetRoomGroup[] = [];
  const byKey = new Map<string, TargetRoomGroup>();
  for (const t of pool || []) {
    const roomName = t.roomName || "其他";
    const campusName = t.campusName || "";
    const roomKey = `${campusName}/${roomName}`;
    let room = byKey.get(roomKey);
    if (!room) {
      room = { roomKey, roomName, campusName, shelves: [] };
      byKey.set(roomKey, room);
      out.push(room);
    }
    const shelveId = t.shelveId == null ? "" : String(t.shelveId);
    if (shelveId && !room.shelves.some((s) => s.shelveId === shelveId)) {
      room.shelves.push({ shelveId, shelveName: t.shelveName || shelveId });
    }
  }
  return out;
}

/** 池 → animalCageId 索引，供网格逐格标 selectable / reason */
export function indexPool(pool: CageOpTarget[]): Map<string, CageOpTarget> {
  const m = new Map<string, CageOpTarget>();
  for (const t of pool || []) m.set(String(t.animalCageId), t);
  return m;
}

/**
 * 从 `from` 起找下一个还没配目标的源下标（会绕回开头），全配完返回 -1。
 * `from` 允许越界：取模兜住，光标不会把用户卡在末尾。
 */
export function nextUnpairedIdx(
  sources: BatchSource[],
  targets: Map<string, string>,
  from: number,
): number {
  const n = sources.length;
  if (n === 0) return -1;
  const start = ((from % n) + n) % n;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (!targets.get(sources[i].animalCageId)) return i;
  }
  return -1;
}

/** 移出一个源：连带删它的目标；返回新对象，不改入参（React state 需要新引用） */
export function removeSource(
  sources: BatchSource[],
  targets: Map<string, string>,
  sourceId: string,
): { sources: BatchSource[]; targets: Map<string, string> } {
  const nextTargets = new Map(targets);
  nextTargets.delete(sourceId);
  return { sources: sources.filter((s) => s.animalCageId !== sourceId), targets: nextTargets };
}

/** 底部配对条的展示行 */
export interface PairRow {
  sourceId: string;
  text: string;
  paired: boolean;
}

/**
 * 配对条文案：`F-4 → C-5` / `F-4 → 待选`。
 * 目标坐标走池条目自己的 positionX/Y，经 `displayPosition` 转成与网格一致的显示坐标；
 * 池里查不到这个 id 时**不伪造坐标**，退回「待选」。
 */
export function pairRows(
  sources: BatchSource[],
  targets: Map<string, string>,
  poolByCageId: Map<string, CageOpTarget>,
): PairRow[] {
  return (sources || []).map((s) => {
    const tid = targets.get(s.animalCageId);
    const t = tid ? poolByCageId.get(tid) : undefined;
    let targetLabel = "";
    if (t && t.positionX != null && t.positionY != null) {
      // 池给的是数字坐标（1-1 形式）；displayPosition 认数字格式并处理顶↔底翻转
      targetLabel = displayPosition(`${t.positionX}-${t.positionY}`);
    }
    return {
      sourceId: s.animalCageId,
      text: `${s.label} → ${targetLabel || "待选"}`,
      paired: !!targetLabel,
    };
  });
}
