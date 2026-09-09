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
 */
export function useCageOpSelect() {
  const [kind, setKind] = useState<CageOpKind | null>(null);
  const [source, setSource] = useState<CageOpSource | null>(null);
  const [targets, setTargets] = useState<CageOpTarget[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const start = useCallback(async (k: CageOpKind, src: CageOpSource) => {
    setKind(k);
    setSource(src);
    setTargets([]);
    setSelected(new Set());
    setError(null);
    setConfirmOpen(false);
    setLoading(true);
    try {
      setTargets(await fetchCageOpTargets(src.animalCageId, src.shelfIndexId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载可选笼位失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const cancel = useCallback(() => {
    setKind(null);
    setSource(null);
    setTargets([]);
    setSelected(new Set());
    setError(null);
    setConfirmOpen(false);
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
  };
}

export type CageOpSelect = ReturnType<typeof useCageOpSelect>;
