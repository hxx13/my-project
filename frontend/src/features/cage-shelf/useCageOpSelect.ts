import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { fetchCageOpTargets, type CageOpTarget } from "@/api/domains/cageShelf.api";

export type CageOpKind = "divide" | "transfer";

export interface CageOpSource {
  animalCageId: string;
  position?: string;
  shelfIndexId?: string | number | null;
  occupantName?: string | null;
  cageTypeCode?: number | null;
}

/** 批量转移的两步：先选源笼位，再按顺序选目标笼位 */
export type BatchPhase = "sources" | "targets";

/** 每个「源→目标」配对一个颜色。刻意避开通用绿（emerald-400，见 CellButton claimMode 池高亮）与蓝（通用选中）。 */
export const PAIR_COLORS = [
  "#8b5cf6", // violet
  "#f97316", // orange
  "#ec4899", // pink
  "#0ea5e9", // sky
  "#f59e0b", // amber
  "#d946ef", // fuchsia
  "#6366f1", // indigo
  "#f43f5e", // rose
];

export function pairColorAt(index: number): string {
  return PAIR_COLORS[index % PAIR_COLORS.length];
}

/** 待审中间态在网格/详情上的展示形态：同一请求的源与目标同色。 */
export interface CageOpMark {
  requestId: string;
  kind: CageOpKind;
  color: string;
  label: string;
  applicantName?: string | null;
  /** 该请求的目标笼位（分笼 1:多，转移 1:1） */
  targetAnimalCageIds?: string[];
}

/**
 * 把待审分笼/转移摊平成「笼位 id → 标识」。转移一对一、分笼一对多，
 * 一对（一请求）共用一个配对色，与选位时的配对色同一套色序。
 */
export function buildCageOpMarks(
  list: Array<{
    id: string; opType: CageOpKind; sourceAnimalCageId: string;
    targetAnimalCageIds?: string[] | null; applicantName?: string | null;
  }>,
): Map<string, CageOpMark> {
  const out = new Map<string, CageOpMark>();
  list.forEach((r, i) => {
    const mark: CageOpMark = {
      requestId: r.id,
      kind: r.opType,
      color: pairColorAt(i),
      label: r.opType === "divide" ? "分笼审核中" : "转移审核中",
      applicantName: r.applicantName ?? null,
      targetAnimalCageIds: r.targetAnimalCageIds ?? [],
    };
    out.set(r.sourceAnimalCageId, mark);
    for (const t of r.targetAnimalCageIds ?? []) out.set(t, mark);
  });
  return out;
}

/** 面板/网格展示用的位置标签（源笼位在选中时由页面提供，目标笼位来自 /cage-op/targets） */
export interface CageOpLabel {
  position: string;
  where: string;
}

export interface BatchPair {
  index: number;
  color: string;
  sourceId: string;
  sourceLabel?: CageOpLabel;
  targetId: string | null;
  targetLabel?: CageOpLabel;
}

/**
 * 交换两个位置（越界/原地返回原数组引用，避免无谓渲染）。
 *
 * 这里必须是**交换**而不是插入式移动：配对是「位置即配对」，插入会把 from→to
 * 之间的每一项都顺移一格，等于把中间所有配对全部重洗；交换只影响这两个位置。
 */
export function swapItems<T>(list: T[], a: number, b: number): T[] {
  if (a === b || a < 0 || b < 0 || a >= list.length || b >= list.length) return list;
  const n = list.slice();
  [n[a], n[b]] = [n[b], n[a]];
  return n;
}

/**
 * 位置即配对：第 i 个源配第 i 个目标，两者同色。
 * 这是批量转移唯一的配对真相源——面板顺序、网格颜色、提交顺序都从这里出。
 */
export function buildPairColors(sourceOrder: string[], targetOrder: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; i < sourceOrder.length; i++) {
    const color = pairColorAt(i);
    m.set(sourceOrder[i], color);
    const t = targetOrder[i];
    if (t) m.set(t, color);
  }
  return m;
}

export function buildPairs(
  sourceOrder: string[],
  targetOrder: string[],
  sourceLabels: Map<string, CageOpLabel>,
  targetMap: Map<string, CageOpTarget>,
): BatchPair[] {
  return sourceOrder.map((sourceId, i) => {
    const targetId = targetOrder[i] ?? null;
    const t = targetId ? targetMap.get(targetId) : undefined;
    return {
      index: i,
      color: pairColorAt(i),
      sourceId,
      sourceLabel: sourceLabels.get(sourceId),
      targetId,
      targetLabel: t
        ? {
            position:
              t.positionX != null && t.positionY != null ? `${t.positionX}-${t.positionY}` : "—",
            where: [t.campusName, t.roomName, t.shelveName].filter(Boolean).join(" / "),
          }
        : undefined,
    };
  });
}

/**
 * 分笼 / 转移的「选位模式」状态机 — 三端共用。
 *
 * 进入模式后主网格高亮本课题组可用的空笼位（含其他房间/笼架），点选目标，
 * 确认后弹窗复核坐标并提交。目标池来自 /cage-op/targets，准入判定在后端。
 *
 * 网格侧接线（复用现有认领模式的 props）：
 *   claimMode={active}  poolCells={eligibleMap}  restrictSelectToPool
 *   selectable={active}  selectedCells={由 selected 映射出的 sid:x:y 集合}
 *   onToggleCell={(sid,x,y) => toggle(cageIdByKey[`${sid}:${x}:${y}`])}
 *
 * 批量转移（batch=true）：多次选源 → 「下一步」→ 按顺序点目标，
 * **位置即配对**（第 i 个目标配第 i 个源），拖拽重排会重配，配对用颜色可视化。
 */
export function useCageOpSelect() {
  const [kind, setKind] = useState<CageOpKind | null>(null);
  const [source, setSource] = useState<CageOpSource | null>(null);
  const [targets, setTargets] = useState<CageOpTarget[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  /* ---- 批量转移 ---- */
  const [batch, setBatch] = useState(false);
  const [phase, setPhase] = useState<BatchPhase>("sources");
  const [sourceOrder, setSourceOrder] = useState<string[]>([]);
  const [sourceLabels, setSourceLabels] = useState<Map<string, CageOpLabel>>(new Map());
  const [sourceGroups, setSourceGroups] = useState<Map<string, string>>(new Map());
  const [targetOrder, setTargetOrder] = useState<string[]>([]);
  const [batchTargets, setBatchTargets] = useState<Map<string, CageOpTarget>>(new Map());

  const start = useCallback(async (k: CageOpKind, src: CageOpSource) => {
    setKind(k);
    setSource(src);
    setTargets([]);
    setSelected(new Set());
    setError(null);
    setConfirmOpen(false);
    setBatch(false);
    setPhase("sources");
    setSourceOrder([]);
    setSourceLabels(new Map());
    setSourceGroups(new Map());
    setTargetOrder([]);
    setBatchTargets(new Map());
    setLoading(true);
    try {
      setTargets(await fetchCageOpTargets(src.animalCageId, src.shelfIndexId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载可选笼位失败");
    } finally {
      setLoading(false);
    }
  }, []);

  /** 从已进入的转移模式切到批量：源笼位改为在网格上多选，原先那个源不参与。 */
  const startBatch = useCallback(() => {
    setBatch(true);
    setSource(null);
    setTargets([]);
    setSelected(new Set());
    setError(null);
    setConfirmOpen(false);
    setPhase("sources");
    setSourceOrder([]);
    setSourceLabels(new Map());
    setSourceGroups(new Map());
    setTargetOrder([]);
    setBatchTargets(new Map());
  }, []);

  const cancel = useCallback(() => {
    setKind(null);
    setSource(null);
    setTargets([]);
    setSelected(new Set());
    setError(null);
    setConfirmOpen(false);
    setBatch(false);
    setPhase("sources");
    setSourceOrder([]);
    setSourceLabels(new Map());
    setSourceGroups(new Map());
    setTargetOrder([]);
    setBatchTargets(new Map());
  }, []);

  /** 可选目标 id 集合（不可选的只在弹窗列表里出现，网格上不参与点选） */
  const eligibleIds = useMemo(
    () => new Set(targets.filter((t) => t.selectable).map((t) => t.animalCageId)),
    [targets],
  );

  /** 供 ShelfGrid 的 poolCells 用（只取 .has） */
  const eligibleMap = useMemo(
    () => new Map(targets.filter((t) => t.selectable).map((t) => [t.animalCageId, t])),
    [targets],
  );

  const toggle = useCallback(
    (cageId: string) => {
      if (!cageId || !eligibleIds.has(cageId)) {
        toast("该笼位不在可选范围内");
        return;
      }
      setSelected((prev) => {
        if (kind === "divide") {
          const n = new Set(prev);
          if (n.has(cageId)) n.delete(cageId);
          else n.add(cageId);
          return n;
        }
        // 转移：单选
        return prev.has(cageId) ? new Set() : new Set([cageId]);
      });
    },
    [eligibleIds, kind],
  );

  const picked = useMemo(
    () => targets.filter((t) => selected.has(t.animalCageId)),
    [targets, selected],
  );

  /* ══════════════════ 批量转移 ══════════════════ */

  /** 当前批次的课题组基准（第一个源的组）；不同组的笼位一律拒绝加入 */
  const batchGroup = useMemo(() => {
    for (const id of sourceOrder) {
      const g = sourceGroups.get(id);
      if (g) return g;
    }
    return null;
  }, [sourceOrder, sourceGroups]);

  /**
   * 源笼位多选（顺序 = 点选顺序）；label 由页面按当前网格坐标提供。
   * 硬约束：一次批量只能转移**同一个课题组**的笼位（混组容易出错），
   * 以当前批次第一个源为基准，后续不同组直接拒绝；groupKey 取不到也拒绝。
   */
  const toggleBatchSource = useCallback((cageId: string, label?: CageOpLabel, groupKey?: string) => {
    if (!cageId) return;
    if (sourceOrder.includes(cageId)) {
      setSourceOrder((prev) => prev.filter((id) => id !== cageId));
      return;
    }
    const key = (groupKey ?? "").trim();
    if (!key) {
      toast.error("无法判定该笼位所属课题组，不能加入批量转移");
      return;
    }
    if (batchGroup && batchGroup !== key) {
      toast.error(`批量转移只能选同一课题组的笼位（当前：${batchGroup}）`);
      return;
    }
    setSourceOrder((prev) => [...prev, cageId]);
    setSourceGroups((prev) => {
      const n = new Map(prev);
      n.set(cageId, key);
      return n;
    });
    setSourceLabels((prev) => {
      if (prev.has(cageId) || !label) return prev;
      const n = new Map(prev);
      n.set(cageId, label);
      return n;
    });
  }, [sourceOrder, batchGroup]);

  /**
   * 拖拽重排 —— 两步各排各的：
   *   sources 阶段重排源（第 i 个源换到第 j 个位置）
   *   targets 阶段重排目标（第 i 个目标换到第 j 个位置）
   * 都是**交换**，所以只会动这两个位置的配对，其余配对不受影响。
   */
  const swapSources = useCallback((a: number, b: number) => {
    setSourceOrder((prev) => swapItems(prev, a, b));
  }, []);

  const swapTargets = useCallback((a: number, b: number) => {
    setTargetOrder((prev) => swapItems(prev, a, b));
  }, []);

  /** 源选完 → 拉所有源的目标池并集，进入选目标阶段 */
  const confirmSources = useCallback(async () => {
    if (sourceOrder.length === 0) {
      toast.error("请先在网格上批量选择需要转移的笼位");
      return;
    }
    setPhase("targets");
    setTargetOrder([]);
    setLoading(true);
    setError(null);
    try {
      const lists = await Promise.all(
        sourceOrder.map((id) => fetchCageOpTargets(id, null).catch(() => [] as CageOpTarget[])),
      );
      const union = new Map<string, CageOpTarget>();
      for (const list of lists) {
        for (const t of list) {
          if (!union.has(t.animalCageId)) union.set(t.animalCageId, t);
        }
      }
      setBatchTargets(union);
      if (union.size === 0) setError("没有可用的目标笼位");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载可选笼位失败");
    } finally {
      setLoading(false);
    }
  }, [sourceOrder]);

  /** 回到选源阶段（改源顺序/增减源） */
  const backToSources = useCallback(() => {
    setPhase("sources");
    setTargetOrder([]);
    setBatchTargets(new Map());
    setError(null);
  }, []);

  /** 已配对的源（前缀）；剩余源等待配目标 */
  const batchPool = useMemo(() => {
    const assigned = new Set(targetOrder);
    return new Map(
      Array.from(batchTargets.entries()).filter(([id, t]) => t.selectable && !assigned.has(id)),
    );
  }, [batchTargets, targetOrder]);

  /** 按顺序点目标：位置即配对；点已配对的则摘除，后续自动前移 */
  const toggleBatchTarget = useCallback(
    (cageId: string) => {
      if (!cageId) return;
      if (targetOrder.includes(cageId)) {
        setTargetOrder((prev) => prev.filter((id) => id !== cageId));
        return;
      }
      if (!batchPool.has(cageId)) {
        toast("该笼位不在可选范围内");
        return;
      }
      if (targetOrder.length >= sourceOrder.length) {
        toast(`已配满 ${sourceOrder.length} 对，点已选目标可解除`);
        return;
      }
      setTargetOrder((prev) => [...prev, cageId]);
    },
    [targetOrder, batchPool, sourceOrder.length],
  );

  /** cageId → 配对色：源和目标同色，便于在网格上按色配对 */
  const pairColorByCageId = useMemo(
    () => buildPairColors(sourceOrder, targetOrder),
    [sourceOrder, targetOrder],
  );

  const pairs = useMemo<BatchPair[]>(
    () => buildPairs(sourceOrder, targetOrder, sourceLabels, batchTargets),
    [sourceOrder, targetOrder, sourceLabels, batchTargets],
  );

  /** 批量模式下网格用的池：源阶段不过滤（源是占用笼位），目标阶段用并集池 */
  const batchPoolForGrid = useMemo(
    () => (phase === "sources" ? new Map<string, CageOpTarget>() : batchPool),
    [phase, batchPool],
  );

  return {
    active: kind != null,
    kind,
    source,
    loading,
    error,
    confirmOpen,
    eligibleIds,
    eligibleMap,
    selected,
    picked,
    start,
    cancel,
    toggle,
    openConfirm: () => setConfirmOpen(true),
    closeConfirm: () => setConfirmOpen(false),

    /* 批量 */
    batch,
    phase,
    sourceOrder,
    targetOrder,
    pairs,
    batchGroup,
    pairColorByCageId,
    batchPoolForGrid,
    startBatch,
    toggleBatchSource,
    toggleBatchTarget,
    swapSources,
    swapTargets,
    confirmSources,
    backToSources,
  };
}

export type CageOpSelect = ReturnType<typeof useCageOpSelect>;
