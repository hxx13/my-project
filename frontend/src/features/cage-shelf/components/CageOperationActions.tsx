import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { claimCageAsOwner, claimCageOnBehalf, fetchCageOpOperable } from "@/api/domains/cageShelf.api";
import ReservePersonDialog from "./ReservePersonDialog";
import type { CageOpKind, CageOpSource } from "../useCageOpSelect";

/**
 * 分笼 / 转移笼位入口 — 三端详情面板共用。
 *
 * 后端 `/cage-op/operable` 给出：
 *   - operable=true            → 「分笼」「转移笼位」
 *   - code=NOT_CLAIMED         → 该笼位没认领人且无认领记录：提示 + 「认领该笼位」（本人一键认领）
 *   - canClaimOnBehalf=true    → 额外身份（饲养员/饲养组长/超管）：多一个「认领」按钮，
 *                                弹窗检索**本课题组**人员做代绑定，支持覆盖已有认领
 *   - 其他                      → 不显示入口
 *
 * 两条认领路径互斥：有认领记录的笼位归原有「申请/预定/确认」流程，这里不会给本人认领入口。
 */
export default function CageOperationActions({
  source,
  occupied,
  onStart,
  onChanged,
  className,
}: {
  source: CageOpSource;
  /** 是否占用中（非占用笼位不出现分笼/转移入口） */
  occupied: boolean;
  onStart: (kind: CageOpKind, source: CageOpSource) => void;
  /** 认领/代认领成功后的回调（页面据此刷新网格/详情） */
  onChanged?: () => void;
  className?: string;
}) {
  const [checked, setChecked] = useState(false);
  const [operable, setOperable] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [canClaimOnBehalf, setCanClaimOnBehalf] = useState(false);
  const [groupNames, setGroupNames] = useState<string[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const cageId = source.animalCageId;
    if (!occupied || !cageId) {
      setChecked(false);
      setOperable(false);
      setCode(null);
      setCanClaimOnBehalf(false);
      setGroupNames([]);
      return;
    }
    let cancelled = false;
    setChecked(false);
    fetchCageOpOperable(cageId)
      .then((r) => {
        if (cancelled) return;
        setOperable(r.operable);
        setCode(r.code ?? null);
        setCanClaimOnBehalf(!!r.canClaimOnBehalf);
        setGroupNames(r.groupNames ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setOperable(false);
          setCode(null);
          setCanClaimOnBehalf(false);
          setGroupNames([]);
        }
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [occupied, source.animalCageId]);

  const handleSelfClaim = async () => {
    setClaiming(true);
    try {
      await claimCageAsOwner(source.animalCageId);
      toast.success("已认领，你已成为该笼位的实验员");
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "认领失败");
    } finally {
      setClaiming(false);
    }
  };

  const handleOnBehalf = async (p: { name: string; accountId: string }) => {
    setClaiming(true);
    try {
      const r = await claimCageOnBehalf(source.animalCageId, p.accountId);
      toast.success(`已将该笼位认领给 ${r.claimantName || p.name}`);
      setPickerOpen(false);
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "代认领失败");
    } finally {
      setClaiming(false);
    }
  };

  if (!occupied || !checked) return null;

  const btn =
    "rounded-twin-md px-2.5 py-1 text-[11px] font-semibold border border-[var(--twin-hairline-strong)] text-[var(--twin-ink)] hover:bg-[var(--twin-canvas-soft-2)] transition";
  const primaryBtn =
    "rounded-twin-md px-2.5 py-1 text-[11px] font-semibold bg-[var(--twin-primary)] text-white transition hover:brightness-95 disabled:opacity-50";

  const showSelfClaim = !operable && code === "NOT_CLAIMED";
  if (!operable && !showSelfClaim && !canClaimOnBehalf) return null;

  return (
    <>
      <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
        {operable && (
          <>
            <button type="button" className={btn} onClick={() => onStart("divide", source)}>
              分笼
            </button>
            <button type="button" className={btn} onClick={() => onStart("transfer", source)}>
              转移笼位
            </button>
          </>
        )}
        {showSelfClaim && (
          <>
            <span className="text-[10px] text-[var(--twin-warning,#d97706)]">
              该笼位尚未认领，认领成本人后才能分笼 / 转移
            </span>
            <button type="button" disabled={claiming} onClick={handleSelfClaim} className={primaryBtn}>
              {claiming ? "认领中…" : "认领该笼位"}
            </button>
          </>
        )}
        {canClaimOnBehalf && (
          <button type="button" className={btn} onClick={() => setPickerOpen(true)}>
            认领
          </button>
        )}
      </div>
      {canClaimOnBehalf && (
        <ReservePersonDialog
          open={pickerOpen}
          submitting={claiming}
          groupNames={groupNames}
          title="代认领笼位"
          description="选择本课题组人员，其将成为该笼位的实验员（已有认领会被覆盖）"
          confirmText="确认认领"
          onClose={() => setPickerOpen(false)}
          onConfirm={handleOnBehalf}
        />
      )}
    </>
  );
}
